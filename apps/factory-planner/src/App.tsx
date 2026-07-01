import { useEffect, useMemo, useState } from "react";
import { SummaryBar } from "./components/SummaryBar";
import { FactoryView, type FactoryListItem } from "./components/FactoryView";
import { ConfigBar } from "./components/ConfigBar";
import { AltPanel, type SortMode } from "./components/AltPanel";
import { SupplyPanel } from "./components/SupplyPanel";
import { solve, type Selection, type Supplies } from "./solver/solver";
import { attribute } from "./solver/attribution";
import { computeAltImpacts } from "./solver/altAnalysis";
import { ALT_RECIPES, RECIPE_BY_ID, DEFAULT_RECIPE_BY_PRODUCT, factoryTrack } from "./solver/model";
import { ONSITE_CANDIDATES, ONSITE_DEFAULT, SUB_FACTORIES, TARGETS, FACTORY_ORDER } from "./data/recipes";
import { loadState, saveState } from "./ui/persist";

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
  const [loaded] = useState(loadState);
  const [tier, setTier] = useState(() => validTier(loaded.tier));
  // Alternates apply live — toggling re-solves immediately (the solve is cheap).
  const [alts, setAlts] = useState<Set<string>>(() => validAlts(loaded.alts));
  const [localItems, setLocalItems] = useState<Set<string>>(() => validLocals(loaded.localItems));
  const [supplies, setSupplies] = useState<Record<string, number | null>>(() => validSupplies(loaded.supplies));
  const [targets, setTargets] = useState<Record<string, number>>(() => validTargets(loaded.targets));
  const [selectedFactory, setSelectedFactory] = useState(() => validFactory(loaded.selectedFactory));
  const [selectedOnly, setSelectedOnly] = useState(() => loaded.selectedOnly === true);
  const [sortMode, setSortMode] = useState<SortMode>("combined");

  // Auto-persist whenever any saved field changes.
  useEffect(() => {
    saveState({ tier, alts: [...alts], localItems: [...localItems], selectedFactory, selectedOnly, supplies, targets });
  }, [tier, alts, localItems, selectedFactory, selectedOnly, supplies, targets]);

  const selection = useMemo(() => selectionFromAlts(alts), [alts]);
  // null limit means unlimited -> Infinity for the solver.
  const solverSupplies = useMemo<Supplies>(() => {
    const s: Supplies = {};
    for (const [item, lim] of Object.entries(supplies)) s[item] = lim == null ? Infinity : lim;
    return s;
  }, [supplies]);
  const result = useMemo(() => solve(targets, selection, solverSupplies), [targets, selection, solverSupplies]);
  const attributed = useMemo(() => attribute(result, localItems, targets), [result, localItems, targets]);
  const impacts = useMemo(
    () => computeAltImpacts(targets, selection, tier, solverSupplies),
    [targets, selection, tier, solverSupplies],
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

      <ConfigBar
        targets={targets}
        onSetTarget={setTargetRate}
        onResetTargets={resetTargets}
        onScaleTargets={scaleTargets}
        onAddTarget={addTarget}
        onRemoveTarget={removeTarget}
        localItems={localItems}
        onToggleLocal={toggleLocal}
      />

      <main className="layout">
        <FactoryView
          factories={factories}
          attributed={attributed}
          selected={selectedFactory}
          onSelect={setSelectedFactory}
          result={result}
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
        Targets: {Object.entries(targets).map(([k, v]) => `${k} ×${v}/min`).join(" · ")} ·
        Power for variable buildings (Particle Accelerator, Quantum Encoder, Converter) is average.
      </footer>
    </div>
  );
}
