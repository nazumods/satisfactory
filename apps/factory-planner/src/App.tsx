import { useEffect, useMemo, useState } from "react";
import { SummaryBar } from "./components/SummaryBar";
import { FactoryView, type FactoryListItem } from "./components/FactoryView";
import { ConfigBar } from "./components/ConfigBar";
import { AltPanel, type SortMode } from "./components/AltPanel";
import { SupplyPanel } from "./components/SupplyPanel";
import { SetupBar } from "./components/SetupBar";
import {
  solve, DEFAULT_MULTIPLIERS, PARTS_COST_OPTIONS, POWER_CONSUMPTION_OPTIONS,
  type Multipliers, type Selection, type Supplies,
} from "./solver/solver";
import { attribute } from "./solver/attribution";
import { computeAltImpacts } from "./solver/altAnalysis";
import { computeOptimizedExtras } from "./solver/optimize";
import { ALT_RECIPES, RECIPE_BY_ID, DEFAULT_RECIPE_BY_PRODUCT, factoryTrack } from "./solver/model";
import {
  ONSITE_CANDIDATES, ONSITE_DEFAULT, SUB_FACTORIES, TARGETS, FACTORY_ORDER, RAW_INPUTS,
} from "./data/recipes";
import {
  loadSetups, saveSetups, makeSetupId, type PersistedState, type Setup,
} from "./ui/persist";
import { readStateFromUrl, writeStateToUrl } from "./ui/urlState";

function selectionFromAlts(alts: Set<string>): Selection {
  const sel: Selection = {};
  for (const id of alts) {
    const r = RECIPE_BY_ID[id];
    if (r) sel[r.product] = id;
  }
  return sel;
}

// ---- Validation for persisted values (guards against stale / corrupt storage) ----

function validTier(t: unknown): number {
  return typeof t === "number" && Number.isInteger(t) && t >= 0 && t <= 9 ? t : 9;
}

function validAlts(arr: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(arr)) return out;
  const seenProduct = new Set<string>();
  for (const id of arr) {
    const r = RECIPE_BY_ID[id as string];
    if (!r?.alt || seenProduct.has(r.product)) continue; // valid alt, one per product
    seenProduct.add(r.product);
    out.add(r.id);
  }
  return out;
}

function validLocals(arr: unknown): Set<string> {
  if (!Array.isArray(arr)) return new Set(ONSITE_DEFAULT);
  return new Set(arr.filter((i) => ONSITE_CANDIDATES.includes(i as string)));
}

function validSupplies(obj: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [item, lim] of Object.entries(obj as Record<string, unknown>)) {
    if (!(item in DEFAULT_RECIPE_BY_PRODUCT)) continue; // only producible parts
    if (lim === null) out[item] = null;
    else if (typeof lim === "number" && Number.isFinite(lim) && lim >= 0) out[item] = lim;
  }
  return out;
}

function validFactory(f: unknown): string {
  if (typeof f !== "string") return "Final Assembly";
  if (f === "__raw__" || f === "__surplus__" || f === "__extra__" || SUB_FACTORIES[f]) return f;
  return "Final Assembly";
}

function validRawCaps(obj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [item, cap] of Object.entries(obj as Record<string, unknown>)) {
    if (!RAW_INPUTS.has(item)) continue;
    if (typeof cap === "number" && Number.isFinite(cap) && cap >= 0) out[item] = cap;
  }
  return out;
}

function validMultipliers(obj: unknown): Multipliers {
  const o = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
  const partsCost = PARTS_COST_OPTIONS.includes(o.partsCost as number)
    ? (o.partsCost as number)
    : DEFAULT_MULTIPLIERS.partsCost;
  const power = POWER_CONSUMPTION_OPTIONS.includes(o.power as number)
    ? (o.power as number)
    : DEFAULT_MULTIPLIERS.power;
  return { partsCost, power };
}

function validTargets(obj: unknown): Record<string, number> {
  const out: Record<string, number> = { ...TARGETS };
  if (!obj || typeof obj !== "object") return out;
  for (const [item, rate] of Object.entries(obj as Record<string, unknown>)) {
    // Core targets are always valid; additional ones must be a real producible part.
    const validItem = item in TARGETS || item in DEFAULT_RECIPE_BY_PRODUCT;
    if (validItem && typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
      out[item] = rate;
    }
  }
  return out;
}

export function App() {
  // A URL-shared config (?s=...) seeds the active setup's fields on first load only; from
  // then on the URL just mirrors whatever setup is active (see the sync effect below).
  const [initial] = useState(() => {
    const stored = loadSetups();
    const fromUrl = readStateFromUrl();
    if (!fromUrl) return stored;
    const setups = stored.setups.map((s) => (s.id === stored.activeId ? { ...s, state: fromUrl } : s));
    return { setups, activeId: stored.activeId };
  });
  const [setups, setSetups] = useState<Setup[]>(initial.setups);
  const [activeId, setActiveId] = useState(initial.activeId);
  const loaded = useMemo(() => setups.find((s) => s.id === activeId)?.state ?? {}, [setups, activeId]);

  const [tier, setTier] = useState(() => validTier(loaded.tier));
  // Alternates apply live — toggling re-solves immediately (the solve is cheap).
  const [alts, setAlts] = useState<Set<string>>(() => validAlts(loaded.alts));
  const [localItems, setLocalItems] = useState<Set<string>>(() => validLocals(loaded.localItems));
  const [supplies, setSupplies] = useState<Record<string, number | null>>(() => validSupplies(loaded.supplies));
  const [targets, setTargets] = useState<Record<string, number>>(() => validTargets(loaded.targets));
  const [optimize, setOptimize] = useState(() => loaded.optimize === true);
  const [rawCaps, setRawCaps] = useState<Record<string, number>>(() => validRawCaps(loaded.rawCaps));
  const [selectedFactory, setSelectedFactory] = useState(() => validFactory(loaded.selectedFactory));
  const [selectedOnly, setSelectedOnly] = useState(() => loaded.selectedOnly === true);
  const [sortMode, setSortMode] = useState<SortMode>("combined");
  const [multipliers, setMultipliers] = useState<Multipliers>(() => validMultipliers(loaded.multipliers));

  // Applies a stored setup's fields to the live editable state (used when switching/deleting).
  function applySetupFields(st: Partial<PersistedState>) {
    setTier(validTier(st.tier));
    setAlts(validAlts(st.alts));
    setLocalItems(validLocals(st.localItems));
    setSupplies(validSupplies(st.supplies));
    setTargets(validTargets(st.targets));
    setOptimize(st.optimize === true);
    setRawCaps(validRawCaps(st.rawCaps));
    setSelectedFactory(validFactory(st.selectedFactory));
    setSelectedOnly(st.selectedOnly === true);
    setMultipliers(validMultipliers(st.multipliers));
  }

  function switchSetup(id: string) {
    const setup = setups.find((s) => s.id === id);
    if (!setup) return;
    setActiveId(id);
    applySetupFields(setup.state);
  }

  function createSetup() {
    const current: PersistedState = {
      tier, alts: [...alts], localItems: [...localItems], selectedFactory, selectedOnly, supplies, targets, optimize,
      rawCaps, multipliers,
    };
    const names = new Set(setups.map((s) => s.name));
    let n = setups.length + 1;
    while (names.has(`Setup ${n}`)) n++;
    const setup: Setup = { id: makeSetupId(), name: `Setup ${n}`, state: current };
    setSetups((prev) => [...prev, setup]);
    setActiveId(setup.id);
  }

  function renameSetup(id: string, name: string) {
    setSetups((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function deleteSetup(id: string) {
    if (setups.length <= 1) return;
    const next = setups.filter((s) => s.id !== id);
    setSetups(next);
    if (id === activeId) {
      setActiveId(next[0].id);
      applySetupFields(next[0].state);
    }
  }

  // Auto-persist the active setup's fields, and mirror them into the URL for bookmarking/sharing.
  useEffect(() => {
    const current: PersistedState = {
      tier, alts: [...alts], localItems: [...localItems], selectedFactory, selectedOnly, supplies, targets, optimize,
      rawCaps, multipliers,
    };
    setSetups((prev) => prev.map((s) => (s.id === activeId ? { ...s, state: current } : s)));
    writeStateToUrl(current);
  }, [tier, alts, localItems, selectedFactory, selectedOnly, supplies, targets, optimize, rawCaps, multipliers, activeId]);

  // Persist the setups list itself (names, additions, deletions) whenever it changes.
  useEffect(() => {
    saveSetups({ setups, activeId });
  }, [setups, activeId]);

  const selection = useMemo(() => selectionFromAlts(alts), [alts]);
  // null limit means unlimited -> Infinity for the solver.
  const solverSupplies = useMemo<Supplies>(() => {
    const s: Supplies = {};
    for (const [item, lim] of Object.entries(supplies)) s[item] = lim == null ? Infinity : lim;
    return s;
  }, [supplies]);
  const baseline = useMemo(
    () => solve(targets, selection, solverSupplies, multipliers),
    [targets, selection, solverSupplies, multipliers],
  );
  const optimized = useMemo(
    () => (optimize
      ? computeOptimizedExtras(baseline, targets, selection, solverSupplies, tier, rawCaps, multipliers)
      : null),
    [optimize, baseline, targets, selection, solverSupplies, tier, rawCaps, multipliers],
  );
  const result = optimized ? optimized.result : baseline;
  // Optimizer extras are fed to the real solve as demand (so raw/machines/power are exact),
  // but that leaves their residual demand at ~0 — merge them additively into displayed surplus
  // so they show up in the existing "⇪ Surplus" UI instead of vanishing.
  const displayResult = useMemo(() => {
    if (!optimized) return result;
    const keys = new Set([...Object.keys(result.surplus), ...Object.keys(optimized.extras)]);
    const surplus: Record<string, number> = {};
    for (const k of keys) surplus[k] = (result.surplus[k] ?? 0) + (optimized.extras[k] ?? 0);
    return { ...result, surplus };
  }, [result, optimized]);
  const attributed = useMemo(
    () => attribute(displayResult, localItems, targets, multipliers),
    [displayResult, localItems, targets, multipliers],
  );
  const impacts = useMemo(
    () => computeAltImpacts(targets, selection, tier, solverSupplies, multipliers),
    [targets, selection, tier, solverSupplies, multipliers],
  );

  // Headline stats reflect the *current tier requirement*: only factories buildable at the
  // selected tier count toward the totals. Power / raw stay fully accurate because on-site
  // parts are folded into their consuming factories rather than dropped.
  const stats = useMemo(() => {
    let machines = 0, power = 0, foundations = 0;
    let fullMachines = 0, fullPower = 0, fullFoundations = 0;
    for (const F of Object.values(attributed.factories)) {
      fullMachines += F.machines;
      fullPower += F.power;
      fullFoundations += F.foundationsWithClearance;
      if (F.tier <= tier) {
        machines += F.machines;
        power += F.power;
        foundations += F.foundationsWithClearance;
      }
    }
    return { machines, power, foundations, fullMachines, fullPower, fullFoundations };
  }, [attributed, tier]);

  const factories: FactoryListItem[] = useMemo(() => {
    return Object.values(attributed.factories)
      .map((F) => ({
        name: F.name,
        tier: F.tier,
        machines: F.machines,
        power: F.power,
        future: F.tier > tier,
        track: factoryTrack(F.name),
      }))
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          (FACTORY_ORDER[a.name] ?? 99) - (FACTORY_ORDER[b.name] ?? 99),
      );
  }, [attributed, tier]);

  function toggleAlt(id: string) {
    setAlts((prev) => {
      const next = new Set(prev);
      const rec = RECIPE_BY_ID[id];
      if (next.has(id)) {
        next.delete(id);
      } else {
        for (const other of ALT_RECIPES) {
          if (other.product === rec.product && next.has(other.id)) next.delete(other.id);
        }
        next.add(id);
      }
      return next;
    });
  }

  function toggleLocal(item: string) {
    setLocalItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  function resetAlts() {
    setAlts(new Set());
  }

  function setSupply(item: string, limit: number | null) {
    setSupplies((prev) => ({ ...prev, [item]: limit }));
  }

  function removeSupply(item: string) {
    setSupplies((prev) => {
      const next = { ...prev };
      delete next[item];
      return next;
    });
  }

  function setRawCap(item: string, value: number | null) {
    setRawCaps((prev) => {
      if (value == null) {
        const next = { ...prev };
        delete next[item];
        return next;
      }
      return { ...prev, [item]: value };
    });
  }

  function setTargetRate(item: string, rate: number) {
    setTargets((prev) => ({ ...prev, [item]: rate }));
  }

  function resetTargets() {
    setTargets({ ...TARGETS });
  }

  function scaleTargets(factor: number) {
    setTargets((prev) => {
      const next: Record<string, number> = {};
      for (const [item, rate] of Object.entries(prev)) next[item] = rate * factor;
      return next;
    });
  }

  function addTarget(item: string) {
    setTargets((prev) => (item in prev ? prev : { ...prev, [item]: 1 }));
  }

  function removeTarget(item: string) {
    if (item in TARGETS) return; // core targets can't be removed, only reset
    setTargets((prev) => {
      const next = { ...prev };
      delete next[item];
      return next;
    });
  }

  return (
    <div className="app">
      <SummaryBar
        stats={stats}
        tier={tier}
        onTierChange={setTier}
      />

      <SetupBar
        setups={setups}
        activeId={activeId}
        onSwitch={switchSetup}
        onCreate={createSetup}
        onRename={renameSetup}
        onDelete={deleteSetup}
      />

      <ConfigBar
        targets={targets}
        onSetTarget={setTargetRate}
        onResetTargets={resetTargets}
        onScaleTargets={scaleTargets}
        onAddTarget={addTarget}
        onRemoveTarget={removeTarget}
        localItems={localItems}
        onToggleLocal={toggleLocal}
        optimize={optimize}
        onToggleOptimize={setOptimize}
        multipliers={multipliers}
        onSetMultipliers={setMultipliers}
      />

      <main className="layout">
        <FactoryView
          factories={factories}
          attributed={attributed}
          selected={selectedFactory}
          onSelect={setSelectedFactory}
          result={displayResult}
          beltBudget={optimized?.beltBudget}
          rawCaps={rawCaps}
          onSetRawCap={setRawCap}
          tier={tier}
        />
        <div className="side-col">
          <SupplyPanel supplies={supplies} onSet={setSupply} onRemove={removeSupply} />
          <AltPanel
            impacts={impacts}
            selectedAlts={alts}
            onToggle={toggleAlt}
            sortMode={sortMode}
            onSortChange={setSortMode}
            tier={tier}
            appliedAltCount={alts.size}
            onResetAlts={resetAlts}
            selectedOnly={selectedOnly}
            onSelectedOnlyChange={setSelectedOnly}
          />
        </div>
      </main>

      <footer className="footer">
        Power for variable buildings (Particle Accelerator, Quantum Encoder, Converter) is average.
      </footer>
    </div>
  );
}
