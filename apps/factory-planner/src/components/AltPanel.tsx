import { useMemo, useState } from "react";
import type { AltImpact } from "../solver/altAnalysis";
import { fmtSigned, fmtPct } from "../ui/format";

export type SortMode = "combined" | "power" | "inputs";

interface Props {
  impacts: AltImpact[];
  selectedAlts: Set<string>;
  onToggle: (id: string) => void;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  tier: number;
  appliedAltCount: number;
  onResetAlts: () => void;
  selectedOnly: boolean;
  onSelectedOnlyChange: (v: boolean) => void;
}

function sortKey(im: AltImpact, mode: SortMode): number {
  if (mode === "power") return im.powerSavedMw;
  if (mode === "inputs") return im.rawSaved;
  return im.score;
}

function matches(im: AltImpact, q: string): boolean {
  const hay = `${im.recipe.name} ${im.product} ${im.building} ${im.subfactory} ${im.replaces.name}`.toLowerCase();
  return q.split(/\s+/).every((tok) => hay.includes(tok));
}

export function AltPanel({
  impacts,
  selectedAlts,
  onToggle,
  sortMode,
  onSortChange,
  tier,
  appliedAltCount,
  onResetAlts,
  selectedOnly,
  onSelectedOnlyChange,
}: Props) {
  const [query, setQuery] = useState("");

  const { available, locked } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...impacts]
      .filter((i) => !q || matches(i, q))
      .filter((i) => !selectedOnly || selectedAlts.has(i.recipe.id))
      .sort((a, b) => sortKey(b, sortMode) - sortKey(a, sortMode));
    return {
      available: sorted.filter((i) => i.available),
      locked: sorted.filter((i) => !i.available),
    };
  }, [impacts, sortMode, query, selectedOnly, selectedAlts]);

  const total = available.length + locked.length;

  return (
    <section className="panel alt-panel">
      <div className="alt-head">
        <h2>Alternate recipes</h2>
        <div className="sort-toggle">
          <span>Rank by</span>
          {(["combined", "power", "inputs"] as SortMode[]).map((m) => (
            <button
              key={m}
              className={"chip-btn" + (sortMode === m ? " active" : "")}
              onClick={() => onSortChange(m)}
            >
              {m === "combined" ? "Impact" : m === "power" ? "% Power" : "Inputs"}
            </button>
          ))}
        </div>
      </div>
      <p className="alt-hint">
        Each shows the marginal saving vs. its standard recipe, holding your other choices fixed.
        Check one to apply it — the factories re-solve instantly. Alternates marked “1 of N” compete
        for the same product, so picking one swaps the previous choice out.
      </p>

      <div className="alt-status">
        <button
          className={"chip-btn" + (selectedOnly ? " active" : "")}
          onClick={() => onSelectedOnlyChange(!selectedOnly)}
          title="Show only selected alternates"
        >
          Selected
        </button>
        <div className="alt-status-right">
          <span className="alt-active-count">Active: {appliedAltCount}</span>
          <span className="alt-status-sep">|</span>
          <button
            className="alt-reset"
            onClick={onResetAlts}
            disabled={appliedAltCount === 0}
            title="Disable all alternates"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="alt-search">
        <span className="alt-search-icon">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by recipe, product, building…"
          aria-label="Filter alternate recipes"
        />
        {query && (
          <button className="alt-search-clear" onClick={() => setQuery("")} title="Clear filter" aria-label="Clear filter">
            ✕
          </button>
        )}
      </div>

      {total === 0 ? (
        <p className="empty">
          {selectedOnly && appliedAltCount === 0
            ? "No alternates selected yet."
            : `No recipes match “${query}”.`}
        </p>
      ) : (
        <div className="alt-list">
          {available.map((im) => (
            <AltCard key={im.recipe.id} im={im} checked={selectedAlts.has(im.recipe.id)} onToggle={onToggle} />
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <>
          <div className="locked-divider">Locked above Tier {tier} — visible for planning</div>
          <div className="alt-list">
            {locked.map((im) => (
              <AltCard
                key={im.recipe.id}
                im={im}
                checked={selectedAlts.has(im.recipe.id)}
                onToggle={onToggle}
                locked
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AltCard({
  im,
  checked,
  onToggle,
  locked,
}: {
  im: AltImpact;
  checked: boolean;
  onToggle: (id: string) => void;
  locked?: boolean;
}) {
  const powerGood = im.powerSavedMw > 1e-6;
  const powerBad = im.powerSavedMw < -1e-6;
  // Alts that share a product are mutually exclusive — only one can be active at a time.
  const exclusive = im.productAltCount > 1;

  return (
    <div className={"alt-card" + (locked ? " locked" : "") + (im.active ? " active" : "")}>
      <label className="alt-check">
        <input
          type="checkbox"
          checked={checked}
          // Locked alts can't be turned on, but an already-on one can still be turned off.
          disabled={locked && !checked}
          onChange={() => onToggle(im.recipe.id)}
        />
      </label>

      <div className="alt-body">
        <div className="alt-title">
          <span className="alt-name">{im.recipe.name}</span>
          <span className="alt-product">→ {im.product}</span>
          {im.active && <span className="active-tag">ACTIVE</span>}
          {exclusive && (
            <span className="excl-badge" title={`${im.productAltCount} alternates for ${im.product} — picking one swaps the others out`}>
              1 of {im.productAltCount}
            </span>
          )}
          <span className="tier-badge">T{im.tier}</span>
        </div>

        <div className="alt-sub">
          <span className="muted">{im.building}</span>
          <span className="muted"> · replaces {im.replaces.name}</span>
          <span className="muted"> · {im.subfactory}</span>
        </div>

        {im.swapsOutName && !checked && (
          <div className="alt-swap">⇄ Selecting swaps out <strong>{im.swapsOutName}</strong></div>
        )}

        {im.noEffect ? (
          <div className="alt-noeffect">No effect on the current targets.</div>
        ) : (
          <>
            <div className="alt-metrics">
              <span className={"metric" + (powerGood ? " good" : powerBad ? " bad" : "")}>
                {fmtSigned(-im.powerSavedMw, 0)} MW
                <span className="metric-pct"> ({fmtPct(im.powerSavedPct)})</span>
              </span>
              <span className={"metric" + (im.rawSaved > 1e-6 ? " good" : im.rawSaved < -1e-6 ? " bad" : "")}>
                {fmtSigned(-im.rawSaved, 0)} raw/min
              </span>
              <span
                className={"metric" + (im.machineDelta < 0 ? " good" : im.machineDelta > 0 ? " bad" : "")}
                title="Change in total machine count across the whole chain"
              >
                {fmtSigned(im.machineDelta, 0)} machines
              </span>
            </div>

            {im.subfactoryPowerDeltas.length > 0 && (
              <div className="chip-row">
                {im.subfactoryPowerDeltas.slice(0, 3).map((s) => (
                  <span key={s.subfactory} className={"impact-chip " + (s.delta < 0 ? "good" : "bad")}>
                    {s.subfactory} {fmtSigned(s.delta, 0)} MW
                  </span>
                ))}
              </div>
            )}

            {im.rawDeltas.length > 0 && (
              <div className="chip-row">
                {im.rawDeltas.slice(0, 4).map((rd) => (
                  <span key={rd.item} className={"impact-chip " + (rd.delta < 0 ? "good" : "bad")}>
                    {fmtSigned(rd.delta, 0)} {rd.item}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
