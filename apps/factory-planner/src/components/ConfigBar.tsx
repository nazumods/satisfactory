import { useMemo, useState } from "react";
import { ONSITE_CANDIDATES, RAW_INPUTS, TARGETS } from "../data/recipes";
import { DEFAULT_RECIPE_BY_PRODUCT } from "../solver/model";

// Every producible part not already a core target is eligible as an additional output.
const TARGET_CANDIDATES: string[] = Object.keys(DEFAULT_RECIPE_BY_PRODUCT)
  .filter((p) => !RAW_INPUTS.has(p))
  .sort();

// Core targets (from recipes.ts TARGETS) can have their rate edited but not be removed.
const CORE_TARGETS = new Set(Object.keys(TARGETS));

interface Props {
  targets: Record<string, number>;
  onSetTarget: (item: string, rate: number) => void;
  onResetTargets: () => void;
  onScaleTargets: (factor: number) => void;
  onAddTarget: (item: string) => void;
  onRemoveTarget: (item: string) => void;
  localItems: Set<string>;
  onToggleLocal: (item: string) => void;
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
    <section className="panel config-panel">
      <div className="alt-head">
        <h2>Configuration</h2>
      </div>

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
      </div>
    </section>
  );
}
