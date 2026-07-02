import { useMemo, useState } from "react";
import { BUILDING_MATERIALS, ONSITE_CANDIDATES, RAW_INPUTS, TARGETS } from "../data/recipes";
import { DEFAULT_RECIPE_BY_PRODUCT } from "../solver/model";
import { PARTS_COST_OPTIONS, POWER_CONSUMPTION_OPTIONS, type Multipliers } from "../solver/solver";

// Every producible part not already a core target is eligible as an additional output.
const TARGET_CANDIDATES: string[] = Object.keys(DEFAULT_RECIPE_BY_PRODUCT)
  .filter((p) => !RAW_INPUTS.has(p))
  .sort();

// Core targets (from recipes.ts TARGETS) can have their rate edited but not be removed.
const CORE_TARGETS = new Set(Object.keys(TARGETS));

// Buildable parts this planner actually models production for (guards against BUILDING_MATERIALS
// drifting ahead of the recipe data), in the curated wiki order rather than alphabetical.
const BUILDABLE_PARTS: string[] = BUILDING_MATERIALS.filter((p) => p in DEFAULT_RECIPE_BY_PRODUCT);

interface Props {
  targets: Record<string, number>;
  onSetTarget: (item: string, rate: number) => void;
  onResetTargets: () => void;
  onScaleTargets: (factor: number) => void;
  onAddTarget: (item: string) => void;
  onRemoveTarget: (item: string) => void;
  localItems: Set<string>;
  onToggleLocal: (item: string) => void;
  optimize: boolean;
  onToggleOptimize: (v: boolean) => void;
  multipliers: Multipliers;
  onSetMultipliers: (m: Multipliers) => void;
}

export function ConfigBar({
  targets,
  onSetTarget,
  onResetTargets,
  onScaleTargets,
  onAddTarget,
  onRemoveTarget,
  localItems,
  onToggleLocal,
  optimize,
  onToggleOptimize,
  multipliers,
  onSetMultipliers,
}: Props) {
  const [draft, setDraft] = useState("");

  const available = useMemo(
    () => TARGET_CANDIDATES.filter((c) => !(c in targets)),
    [targets],
  );

  function add(item: string) {
    const match = TARGET_CANDIDATES.find((c) => c.toLowerCase() === item.trim().toLowerCase());
    if (!match || match in targets) return;
    onAddTarget(match);
    setDraft("");
  }

  return (
    <details className="panel config-panel" open>
      <summary className="alt-head panel-summary">
        <h2>Configuration</h2>
      </summary>

      <div className="config-body">
        <div className="targets-bar">
          <div className="targets-head">
            <span className="onsite-label">Target rates:</span>
            <div className="targets-actions">
              <button className="chip-btn" onClick={() => onScaleTargets(2)}>
                Double
              </button>
              <button className="chip-btn" onClick={() => onScaleTargets(0.5)}>
                Half
              </button>
              <button className="chip-btn" onClick={() => onScaleTargets(0.25)}>
                Quarter
              </button>
              <button className="chip-btn" onClick={onResetTargets}>
                Reset
              </button>
            </div>
          </div>
          <div className="targets-inputs">
            {Object.entries(targets).map(([item, rate]) => (
              <label key={item} className="target-input" title={`${item} production target`}>
                <span className="target-name">{item}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={rate}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onSetTarget(item, Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  aria-label={`${item} target per minute`}
                />
                {!CORE_TARGETS.has(item) && (
                  <button
                    className="target-remove"
                    onClick={() => onRemoveTarget(item)}
                    title={`Remove ${item}`}
                    aria-label={`Remove ${item}`}
                  >
                    ✕
                  </button>
                )}
              </label>
            ))}
          </div>
          <div className="targets-add">
            <input
              type="text"
              list="target-candidates"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add(draft);
              }}
              placeholder="Add an additional output…"
              aria-label="Add an additional output"
            />
            <datalist id="target-candidates">
              {available.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button className="chip-btn" onClick={() => add(draft)} disabled={!draft.trim()}>
              Add
            </button>
          </div>

          <details className="buildables-details">
            <summary>Buildable parts — surplus for storage/upload</summary>
            <p className="alt-hint">
              Parts placed with the Build Gun. Set a rate to add it as a target so the plan
              produces extra to stockpile or feed the AWESOME Sink/upload terminal.
            </p>
            <div className="targets-inputs">
              {BUILDABLE_PARTS.map((item) => (
                <label key={item} className="target-input" title={`${item} surplus target`}>
                  <span className="target-name">{item}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={targets[item] ?? 0}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const rate = Number.isFinite(n) && n >= 0 ? n : 0;
                      if (rate > 0) onSetTarget(item, rate);
                      else onRemoveTarget(item);
                    }}
                    aria-label={`${item} surplus target per minute`}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="onsite-bar">
          <span className="onsite-label">Made on-site (not belted):</span>
          <div className="onsite-chips">
            {ONSITE_CANDIDATES.map((item) => (
              <button
                key={item}
                className={"onsite-chip" + (localItems.has(item) ? " on" : "")}
                onClick={() => onToggleLocal(item)}
                title={
                  localItems.has(item)
                    ? `${item} is built inside each consuming factory`
                    : `${item} is produced centrally and belted to consumers`
                }
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="onsite-bar">
          <span className="onsite-label">Game mode cost multipliers:</span>
          <label className="multiplier-select">
            <span>Recipe parts cost</span>
            <select
              value={multipliers.partsCost}
              onChange={(e) =>
                onSetMultipliers({ ...multipliers, partsCost: Number(e.target.value) })
              }
              aria-label="Recipe parts cost multiplier"
            >
              {PARTS_COST_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}×</option>
              ))}
            </select>
          </label>
          <label className="multiplier-select">
            <span>Power consumption</span>
            <select
              value={multipliers.power}
              onChange={(e) =>
                onSetMultipliers({ ...multipliers, power: Number(e.target.value) })
              }
              aria-label="Power consumption multiplier"
            >
              {POWER_CONSUMPTION_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}×</option>
              ))}
            </select>
          </label>
          <span className="optimize-caption muted">
            Mirrors the Advanced Game Settings "Cost Multipliers" from Satisfactory's Game Modes
            menu. Recipe parts cost rounds each ingredient's per-cycle amount (min 1) rather than
            scaling smoothly, so small recipes can be unaffected while larger ones jump.
          </span>
        </div>

        <div className="optimize-bar">
          <label className="optimize-toggle">
            <input
              type="checkbox"
              checked={optimize}
              onChange={(e) => onToggleOptimize(e.target.checked)}
            />
            <span>Optimize raw usage</span>
          </label>
          <span className="optimize-caption muted">
            Rounds raw inputs up to full belt/miner lines (120/min solids, 60/min oil — water &amp;
            nitrogen uncapped) and fills the slack with the highest-tier sinkable items,
            trickling down as each resource saturates. Extra output shows up as Surplus.
          </span>
        </div>
      </div>
    </details>
  );
}
