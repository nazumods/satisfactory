// Σ Raw inputs tab — every boundary resource with demand, availability, belts and share.
// Each row expands to show which factories the resource flows to (from the attributed
// RAW input edges), with a balancer link for splits that fan out multiple ways.

import { Fragment, useState, type CSSProperties } from "react";
import type { SolveResult } from "../data/types";
import type { AttributedView } from "../solver/attribution";
import { RAW_INPUTS } from "../data/recipes";
import { fmt, fmtPct, beltsFor, FLUID_ITEMS } from "../ui/format";

/** Number formatted for a balancer spec URL: ≤4 dp, no separators. */
const specNum = (n: number) => String(Number(n.toFixed(4)));

function gcd2(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Balancer spec for splitting this raw across its consuming factories, at the finest
 * precision (4 → 0 decimals) whose reduced ratio stays inside the balancer's sanity cap.
 * Null when the split doesn't fan out, a leg would round away, or even whole-number rates
 * are too fine — huge multi-belt feeds are better planned belt-by-belt anyway.
 */
function rawSplitLink(legs: RawDest[]): string | undefined {
  if (legs.length < 2) return undefined;
  for (let decimals = 4; decimals >= 0; decimals--) {
    const scale = 10 ** decimals;
    const weights = legs.map((l) => Math.round(l.rate * scale));
    if (weights.some((w) => w <= 0)) continue;
    const units = weights.reduce((a, b) => a + b, 0) / weights.reduce(gcd2);
    if (units > 5000) continue; // build.ts MAX_UNITS
    const parts = weights.map((w) => w / scale);
    const total = parts.reduce((a, b) => a + b, 0);
    return `#/balancer/${specNum(total)}:${parts.map(String).join(",")}`;
  }
  return undefined;
}

// Per-resource bar colors (RGB triplets) roughly matching each item's in-game appearance.
// Used as `rgba(var(--bar-color), α)` so opacity can be tuned in CSS.
const RAW_COLORS: Record<string, string> = {
  "Iron Ore": "150, 162, 176", // steel grey
  "Copper Ore": "214, 130, 64", // copper orange
  "Caterium Ore": "230, 190, 60", // gold
  "Raw Quartz": "232, 127, 181", // pink crystal
  Limestone: "205, 187, 142", // tan
  Coal: "108, 114, 124", // dark grey
  Sulfur: "210, 204, 66", // yellow
  Bauxite: "182, 90, 64", // rust red
  "Crude Oil": "126, 104, 60", // petroleum amber
  Water: "74, 160, 224", // blue
  "Nitrogen Gas": "150, 206, 200", // pale teal
  SAM: "186, 78, 112", // alien maroon
};
const RAW_COLOR_FALLBACK = "247, 162, 59"; // accent

export function BeltCell({ item, rate, tier }: { item: string; rate: number; tier: number }) {
  const { count, mark, kind } = beltsFor(rate, tier, FLUID_ITEMS.has(item));
  return (
    <span>
      {count}
      <span className="belt-mark"> × {kind === "pipe" ? "Pipe Mk." : "Mk."}{mark}</span>
    </span>
  );
}

interface RawDest {
  factory: string;
  rate: number;
}

/** raw item -> consuming factories with rates, from the attributed RAW input edges. */
function destsByRaw(attributed: AttributedView): Record<string, RawDest[]> {
  const dests: Record<string, RawDest[]> = {};
  for (const F of Object.values(attributed.factories)) {
    for (const flow of F.inputs) {
      if (flow.source !== "RAW") continue;
      (dests[flow.item] ??= []).push({ factory: F.name, rate: flow.rate });
    }
  }
  for (const list of Object.values(dests)) list.sort((a, b) => b.rate - a.rate);
  return dests;
}

export function RawTable({
  result,
  attributed,
  tier,
  beltBudget,
  rawCaps,
  onSetRawCap,
  onSelect,
}: {
  result: SolveResult;
  attributed: AttributedView;
  tier: number;
  beltBudget?: Record<string, number>;
  rawCaps: Record<string, number>;
  onSetRawCap: (item: string, value: number | null) => void;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(item: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  // Show every raw input, not just ones currently in demand, so availability can be
  // pre-declared before a recipe chain that needs it is even selected.
  const rows = [...RAW_INPUTS]
    .map((item) => [item, result.raw[item] ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const dests = destsByRaw(attributed);
  const supplied = Object.entries(result.supplied)
    .filter(([, rate]) => rate > 1e-6)
    .sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, rate]) => sum + rate, 0);
  const max = rows.length ? rows[0][1] : 0;
  return (
    <>
      <div className="detail-head">
        <h2>Σ Raw inputs</h2>
        <div className="detail-stats">
          True boundary feed — ores, ingots and fluids belted in from outside. On-site parts roll up
          into these; only items you mark as belted between factories stay separate. Click a resource
          to see which factories it flows to. Set "Available" to how much you actually have (e.g.
          from your miners) — Optimize uses it as the exact budget instead of guessing a rounded belt
          line, and it's flagged red if demand exceeds it either way.
        </div>
      </div>
      <table className="data-table raw-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th className="num">Items / min</th>
            <th className="num">Available</th>
            <th className="num">Belts</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, rate]) => {
            const share = total > 0 ? rate / total : 0;
            const barPct = max > 0 ? rate / max : 0;
            const color = RAW_COLORS[item] ?? RAW_COLOR_FALLBACK;
            const cap = rawCaps[item];
            const overBudget = cap != null && rate > cap + 1e-6;
            const placeholder = beltBudget?.[item] != null ? fmt(beltBudget[item], 0) : "∞";
            const legs = dests[item] ?? [];
            const legTotal = legs.reduce((s, l) => s + l.rate, 0);
            const splitLink = rawSplitLink(legs);
            const open = expanded.has(item);
            return (
              <Fragment key={item}>
                <tr
                  className={overBudget ? "over-budget" : undefined}
                  style={
                    { "--bar": `${(barPct * 100).toFixed(2)}%`, "--bar-color": color } as CSSProperties
                  }
                >
                  <td className="item-cell">
                    {legs.length > 0 ? (
                      <button className="bld-toggle" onClick={() => toggle(item)} aria-expanded={open}>
                        <span className="bld-caret">{open ? "▾" : "▸"}</span>
                        {item}
                      </button>
                    ) : (
                      item
                    )}
                    {splitLink && (
                      <a
                        className="balancer-jump icon"
                        href={splitLink}
                        title={`Splitter diagram: ${item} to ${legs.length} factories`}
                      >
                        ⑃
                      </a>
                    )}
                  </td>
                  <td className={"num" + (overBudget ? " bad" : "")}>{fmt(rate)}</td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="raw-cap-input"
                      value={cap ?? ""}
                      placeholder={placeholder}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (v === "") return onSetRawCap(item, null);
                        const n = Number(v);
                        onSetRawCap(item, Number.isFinite(n) && n >= 0 ? n : null);
                      }}
                      aria-label={`${item} available per minute`}
                    />
                  </td>
                  <td className="num"><BeltCell item={item} rate={rate} tier={tier} /></td>
                  <td className="num muted">{fmtPct(share)}</td>
                </tr>
                {open &&
                  legs.map((leg) => (
                    <tr key={item + "|" + leg.factory} className="local-row bld-sub">
                      <td className="item-cell">
                        <button
                          className="src src-link"
                          onClick={() => onSelect(leg.factory)}
                          title={`Jump to ${leg.factory}`}
                        >
                          {leg.factory}
                        </button>
                      </td>
                      <td className="num">{fmt(leg.rate)}</td>
                      <td className="num muted">—</td>
                      <td className="num"><BeltCell item={item} rate={leg.rate} tier={tier} /></td>
                      <td className="num muted">
                        {legTotal > 0 ? fmtPct(leg.rate / legTotal) : "—"}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}

          {supplied.length > 0 && (
            <tr className="subhead-row">
              <td colSpan={5}>External supply · subsidy you provide, not produced or belted from raw</td>
            </tr>
          )}
          {supplied.map(([item, rate]) => (
            <tr key={"sup-" + item} className="supply-row">
              <td className="item-cell">
                {item}
                <span className="onsite-tag supply">supply</span>
              </td>
              <td className="num">{fmt(rate)}</td>
              <td className="num muted">—</td>
              <td className="num"><BeltCell item={item} rate={rate} tier={tier} /></td>
              <td className="num muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
