// Global machine accounting — every machine in the plan totalled by building type,
// expandable per building to show which factories the machines sit in. Aggregates the
// raw solve details (whole machines per recipe, not the attributed fractional shares),
// so counts are true build counts and sum exactly to result.totalMachines.

import { Fragment, useState } from "react";
import { BUILDINGS } from "../data/recipes";
import type { SolveResult } from "../data/types";
import { fmt, fmtPower } from "../ui/format";

interface FactoryUse {
  factory: string;
  tier: number;
  machines: number;
  power: number;
}

interface BuildingRow {
  building: string;
  unlockTier: number;
  /** Counts at the current tier (only factories with tier <= selected). */
  machines: number;
  power: number;
  foundations: number;
  /** Full-plan counts, tier filter ignored. */
  fullMachines: number;
  fullPower: number;
  fullFoundations: number;
  byFactory: FactoryUse[];
}

export function MachineTable({
  result,
  tier,
  onSelect,
}: {
  result: SolveResult;
  tier: number;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byBuilding: Record<string, BuildingRow> = {};
  for (const d of result.details) {
    const row = (byBuilding[d.recipe.building] ??= {
      building: d.recipe.building,
      unlockTier: BUILDINGS[d.recipe.building]?.tier ?? 0,
      machines: 0, power: 0, foundations: 0,
      fullMachines: 0, fullPower: 0, fullFoundations: 0,
      byFactory: [],
    });
    const factoryTier = result.bySubfactory[d.subfactory]?.tier ?? 0;
    row.fullMachines += d.machinesFull;
    row.fullPower += d.powerMw;
    row.fullFoundations += d.foundationsWithClearance;
    if (factoryTier <= tier) {
      row.machines += d.machinesFull;
      row.power += d.powerMw;
      row.foundations += d.foundationsWithClearance;
    }
    const use = row.byFactory.find((f) => f.factory === d.subfactory);
    if (use) {
      use.machines += d.machinesFull;
      use.power += d.powerMw;
    } else {
      row.byFactory.push({ factory: d.subfactory, tier: factoryTier, machines: d.machinesFull, power: d.powerMw });
    }
  }
  const rows = Object.values(byBuilding).sort((a, b) => b.fullMachines - a.fullMachines);
  for (const r of rows) r.byFactory.sort((a, b) => b.machines - a.machines);

  const total = rows.reduce(
    (t, r) => ({
      machines: t.machines + r.machines,
      power: t.power + r.power,
      foundations: t.foundations + r.foundations,
      fullMachines: t.fullMachines + r.fullMachines,
    }),
    { machines: 0, power: 0, foundations: 0, fullMachines: 0 },
  );

  function toggle(building: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(building)) next.delete(building);
      else next.add(building);
      return next;
    });
  }

  return (
    <>
      <div className="detail-head">
        <h2>⚙ Machines</h2>
        <div className="detail-stats">
          Every machine in the plan, totalled by building type — click a row to see which
          factories it's built in. Counts are whole machines per recipe; the headline stat
          folds on-site parts fractionally, so the two can differ by a machine or two.
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Building</th>
            <th className="num">Machines</th>
            <th className="num">Power</th>
            <th className="num">Fnd.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.building}>
              <tr className="bld-row" onClick={() => toggle(r.building)}>
                <td className="item-cell">
                  <button
                    className="bld-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.building);
                    }}
                    aria-expanded={expanded.has(r.building)}
                  >
                    <span className="bld-caret">{expanded.has(r.building) ? "▾" : "▸"}</span>
                    {r.building}
                  </button>
                  <span className="tier-badge">T{r.unlockTier}</span>
                </td>
                <td className="num">
                  <CountCell now={r.machines} full={r.fullMachines} />
                </td>
                <td className="num">{fmtPower(r.power)}</td>
                <td className="num muted">{fmt(r.foundations, 0)}</td>
              </tr>
              {expanded.has(r.building) &&
                r.byFactory.map((f) => (
                  <tr key={r.building + "|" + f.factory} className="local-row bld-sub">
                    <td className="item-cell">
                      <button
                        className="src src-link"
                        onClick={() => onSelect(f.factory)}
                        title={`Jump to ${f.factory}`}
                      >
                        {f.factory}
                      </button>
                      {f.tier > tier && <span className="tier-badge">T{f.tier}</span>}
                    </td>
                    <td className="num">{fmt(f.machines, 0)}</td>
                    <td className="num">{fmtPower(f.power)}</td>
                    <td className="num muted">—</td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td>Total</td>
            <td className="num">
              <CountCell now={total.machines} full={total.fullMachines} />
            </td>
            <td className="num">{fmtPower(total.power)}</td>
            <td className="num muted">{fmt(total.foundations, 0)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

/** Count at the current tier, with the full-plan count appended when the tier filter bites. */
function CountCell({ now, full }: { now: number; full: number }) {
  return (
    <>
      {fmt(now, 0)}
      {Math.abs(now - full) > 1e-9 && <span className="muted"> of {fmt(full, 0)}</span>}
    </>
  );
}
