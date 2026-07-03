import type { CSSProperties } from "react";
import type { MachineDetail, SolveResult } from "../data/types";
import type { AttributedView, AttrFactory, AttrFlow } from "../solver/attribution";
import { findSubfactory, RAW_INPUTS, type Track } from "../data/recipes";
import { MachineTable } from "./MachineTable";
import { SINK_VALUES } from "../data/sinkValues";
import { fmt, fmtPct, fmtPower, beltsFor, FLUID_ITEMS } from "../ui/format";

export interface FactoryListItem {
  name: string;
  tier: number;
  machines: number;
  power: number;
  future: boolean;
  track: Track;
}

interface Props {
  factories: FactoryListItem[];
  attributed: AttributedView;
  selected: string;
  onSelect: (name: string) => void;
  result: SolveResult;
  /** Optimize mode's effective budget per capped raw (user cap, else rounded belt line), when enabled. */
  beltBudget?: Record<string, number>;
  /** raw item -> user-declared availability per minute. */
  rawCaps: Record<string, number>;
  onSetRawCap: (item: string, value: number | null) => void;
  tier: number;
}

const RAW = "__raw__";
const SURPLUS = "__surplus__";
const EXTRA = "__extra__";
const MACHINES = "__machines__";

/** Number formatted for a balancer spec URL: ≤4 dp, no separators. */
const specNum = (n: number) => String(Number(n.toFixed(4)));

/**
 * The recipe row's largest ingredient feed — the belt the machine-count link balances
 * across the machines. Any other ingredient's balancer has the same shape, only with
 * different rates, so one link covers the topology. Null for input-free recipes.
 */
function machineFeed(d: MachineDetail): { item: string; rate: number } | null {
  let best: { item: string; rate: number } | null = null;
  for (const [item, perMachine] of Object.entries(d.recipe.inputs)) {
    const rate = perMachine * d.machinesFractional;
    if (!best || rate > best.rate) best = { item, rate };
  }
  return best;
}

/**
 * Balancer links for outputs that split multiple ways (per-destination / internal /
 * target / surplus rows of the same item), keyed by item.
 */
function outputSplitLinks(outputs: AttrFlow[]): Record<string, string> {
  const byItem: Record<string, number[]> = {};
  for (const r of outputs) {
    if (r.rate > 1e-6) (byItem[r.item] ??= []).push(r.rate);
  }
  const links: Record<string, string> = {};
  for (const [item, parts] of Object.entries(byItem)) {
    if (parts.length < 2) continue;
    const rounded = parts.map((p) => Number(p.toFixed(4)));
    const total = specNum(rounded.reduce((a, b) => a + b, 0));
    links[item] = `#/balancer/${total}:${rounded.map(String).join(",")}`;
  }
  return links;
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

export function FactoryView({
  factories,
  attributed,
  selected,
  onSelect,
  result,
  beltBudget,
  rawCaps,
  onSetRawCap,
  tier,
}: Props) {
  return (
    <section className="panel factory-panel">
      <div className="factory-tracks">
        <FactoryTrackRow
          label="Project Assembly"
          hint="Space Elevator deliverables"
          items={factories.filter((f) => f.track === "assembly")}
          selected={selected}
          onSelect={onSelect}
        />
        <FactoryTrackRow
          label="Support"
          hint="feed the assembly line"
          items={factories.filter((f) => f.track === "support")}
          selected={selected}
          onSelect={onSelect}
        />
        <div className="factory-tabs special-row">
          <button
            className={"factory-tab special" + (selected === RAW ? " active" : "")}
            onClick={() => onSelect(RAW)}
          >
            <span className="ft-name">Σ Raw inputs</span>
            <span className="ft-meta">boundary feed</span>
          </button>
          <button
            className={"factory-tab special" + (selected === SURPLUS ? " active" : "")}
            onClick={() => onSelect(SURPLUS)}
          >
            <span className="ft-name">⇪ Surplus</span>
            <span className="ft-meta">byproducts</span>
          </button>
          <button
            className={"factory-tab special" + (selected === EXTRA ? " active" : "")}
            onClick={() => onSelect(EXTRA)}
          >
            <span className="ft-name">✦ Additional outputs</span>
            <span className="ft-meta">extra targets you added</span>
          </button>
          <button
            className={"factory-tab special" + (selected === MACHINES ? " active" : "")}
            onClick={() => onSelect(MACHINES)}
          >
            <span className="ft-name">⚙ Machines</span>
            <span className="ft-meta">by building type</span>
          </button>
        </div>
      </div>

      <div className="factory-detail">
        {selected === RAW ? (
          <RawTable
            result={result}
            tier={tier}
            beltBudget={beltBudget}
            rawCaps={rawCaps}
            onSetRawCap={onSetRawCap}
          />
        ) : selected === SURPLUS ? (
          <SurplusTable result={result} />
        ) : selected === EXTRA ? (
          <ExtraTable extraTargets={attributed.extraTargets} onSelect={onSelect} />
        ) : selected === MACHINES ? (
          <MachineTable result={result} tier={tier} onSelect={onSelect} />
        ) : (
          <FactoryDetail factory={attributed.factories[selected]} tier={tier} onSelect={onSelect} />
        )}
      </div>
    </section>
  );
}

function FactoryTrackRow({
  label,
  hint,
  items,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  items: FactoryListItem[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="factory-track">
      <div className="track-label">
        {label} <span className="track-hint">· {hint}</span>
      </div>
      <div className="factory-tabs">
        {items.map((f) => (
          <button
            key={f.name}
            className={
              "factory-tab" +
              (f.name === selected ? " active" : "") +
              (f.future ? " future" : "")
            }
            onClick={() => onSelect(f.name)}
            title={f.future ? `Unlocks at Tier ${f.tier}` : `Tier ${f.tier}`}
          >
            <span className="ft-name">{f.name}</span>
            <span className="ft-meta">
              <span className="tier-badge">T{f.tier}</span>
              {fmt(f.machines, 0)}× · {fmtPower(f.power)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FactoryDetail({
  factory,
  tier,
  onSelect,
}: {
  factory?: AttrFactory;
  tier: number;
  onSelect: (name: string) => void;
}) {
  if (!factory) return <p className="empty">No production in this factory for the current targets.</p>;
  const future = factory.tier > tier;

  return (
    <>
      <div className="detail-head">
        <h2>{factory.name}</h2>
        <div className="detail-stats">
          <b>{fmt(factory.machines, 0)}</b> machines · <b>{fmtPower(factory.power)}</b> ·{" "}
          {fmt(factory.foundationsBare, 0)}/{fmt(factory.foundationsWithClearance, 0)} foundations ·{" "}
          <span className="tier-badge">Tier {factory.tier}</span>
        </div>
      </div>

      {future && (
        <div className="notice">
          This factory unlocks at <b>Tier {factory.tier}</b> — shown for planning ahead.
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Recipe</th>
            <th>Building</th>
            <th className="num">/min</th>
            <th className="num">Machines</th>
            <th className="num">Clock</th>
            <th className="num">Power</th>
            <th className="num">Fnd.</th>
          </tr>
        </thead>
        <tbody>
          {factory.traded.map((d) => {
            const feed = machineFeed(d);
            return (
            <tr key={d.item}>
              <td className="item-cell">{d.item}</td>
              <td>
                {d.recipe.name}
                {d.recipe.alt && <span className="alt-chip">ALT</span>}
              </td>
              <td className="muted">{d.recipe.building}</td>
              <td className="num">{fmt(d.ratePerMin)}</td>
              <td className="num">
                {feed && d.machinesFull >= 2 ? (
                  <a
                    className="balancer-jump"
                    href={`#/balancer/${specNum(feed.rate)}:x${d.machinesFull}`}
                    title={`Balance ${fmt(feed.rate)}/min ${feed.item} across ${d.machinesFull} machines`}
                  >
                    {d.machinesFull}
                  </a>
                ) : (
                  d.machinesFull
                )}
                <span className="muted"> ({fmt(d.machinesFractional)})</span>
              </td>
              <td className="num">{fmt(d.clockPct, 1)}%</td>
              <td className="num">{fmt(d.powerMw, 1)}</td>
              <td className="num muted">
                {fmt(d.foundationsBare, 0)}/{fmt(d.foundationsWithClearance, 0)}
              </td>
            </tr>
            );
          })}

          {factory.localParts.length > 0 && (
            <tr className="subhead-row">
              <td colSpan={8}>On-site parts · built here, not belted (share of total output)</td>
            </tr>
          )}
          {factory.localParts
            .slice()
            .sort((a, b) => b.power - a.power)
            .map((p) => (
              <tr key={p.item} className="local-row">
                <td className="item-cell">
                  {p.item}
                  <span className="onsite-tag">on-site</span>
                </td>
                <td>
                  {p.recipe.name}
                  {p.recipe.alt && <span className="alt-chip">ALT</span>}
                </td>
                <td className="muted">{p.recipe.building}</td>
                <td className="num">{fmt(p.ratePerMin)}</td>
                <td className="num">{fmt(p.machines, 1)}</td>
                <td className="num muted">—</td>
                <td className="num">{fmt(p.power, 1)}</td>
                <td className="num muted">{fmt(p.foundationsWithClearance, 1)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="flow-grid">
        <FlowTable title="Inputs" kind="in" rows={factory.inputs} tier={tier} onSelect={onSelect} />
        <FlowTable
          title="Outputs"
          kind="out"
          rows={factory.outputs}
          balancerLinks={outputSplitLinks(factory.outputs)}
          onSelect={onSelect}
        />
      </div>
    </>
  );
}

function FlowTable({
  title,
  kind,
  rows,
  tier,
  balancerLinks,
  onSelect,
}: {
  title: string;
  kind: "in" | "out";
  rows: AttrFlow[];
  tier?: number;
  /** item -> balancer diagram URL, for outputs that split multiple ways. */
  balancerLinks?: Record<string, string>;
  onSelect: (name: string) => void;
}) {
  if (rows.length === 0) return null;
  const showBelts = kind === "in" && tier !== undefined;
  return (
    <div className="flow-block">
      <h3>{title}</h3>
      <table className="data-table compact">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">/min</th>
            {showBelts && <th className="num">Belts</th>}
            <th>{kind === "in" ? "From" : "To"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.item + "|" + (r.source ?? "") + "|" + i}>
              <td>
                {r.item}
                {balancerLinks?.[r.item] && (
                  <a
                    className="balancer-jump icon"
                    href={balancerLinks[r.item]}
                    title={`Splitter diagram for ${r.item}`}
                  >
                    ⑃
                  </a>
                )}
              </td>
              <td className="num">{fmt(r.rate)}</td>
              {showBelts && (
                <td className="num">
                  <BeltCell item={r.item} rate={r.rate} tier={tier} />
                </td>
              )}
              <td>
                {kind === "in" ? (
                  <SourceCell entry={r} onSelect={onSelect} />
                ) : (
                  <DestCell entry={r} onSelect={onSelect} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A factory/special badge that, when navigable, jumps the detail view to that target. */
function FlowBadge({
  to,
  label,
  raw,
  supply,
  extra,
  onSelect,
}: {
  to: string;
  label: string;
  raw?: boolean;
  supply?: boolean;
  extra?: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      className={"src src-link" + (raw ? " raw" : "") + (supply ? " supply" : "") + (extra ? " extra" : "")}
      onClick={() => onSelect(to)}
      title={`Jump to ${label}`}
    >
      {label}
    </button>
  );
}

function SourceCell({ entry, onSelect }: { entry: AttrFlow; onSelect: (name: string) => void }) {
  if (entry.source === "RAW") return <FlowBadge to={RAW} label="RAW" raw onSelect={onSelect} />;
  if (entry.source === "SUPPLY") return <FlowBadge to={RAW} label="SUPPLY" supply onSelect={onSelect} />;
  if (!entry.source) return <span className="src raw">—</span>;
  return <FlowBadge to={entry.source} label={entry.source} onSelect={onSelect} />;
}

function DestCell({ entry, onSelect }: { entry: AttrFlow; onSelect: (name: string) => void }) {
  return (
    <span className="dest-cell">
      {entry.isTarget && <span className="src target">★ Final</span>}
      {entry.isExtraTarget && <FlowBadge to={EXTRA} label="✦ Extra" extra onSelect={onSelect} />}
      {entry.destinations?.map((d) => (
        <FlowBadge key={d} to={d} label={d} onSelect={onSelect} />
      ))}
      {entry.isSurplus && <FlowBadge to={SURPLUS} label="Surplus" raw onSelect={onSelect} />}
      {!entry.isTarget && !entry.isExtraTarget && !entry.isSurplus && entry.destinations?.length === 0 && (
        <span className="src raw">{entry.internalOnly ? "internal" : "—"}</span>
      )}
    </span>
  );
}

function BeltCell({ item, rate, tier }: { item: string; rate: number; tier: number }) {
  const { count, mark, kind } = beltsFor(rate, tier, FLUID_ITEMS.has(item));
  return (
    <span>
      {count}
      <span className="belt-mark"> × {kind === "pipe" ? "Pipe Mk." : "Mk."}{mark}</span>
    </span>
  );
}

function RawTable({
  result,
  tier,
  beltBudget,
  rawCaps,
  onSetRawCap,
}: {
  result: SolveResult;
  tier: number;
  beltBudget?: Record<string, number>;
  rawCaps: Record<string, number>;
  onSetRawCap: (item: string, value: number | null) => void;
}) {
  // Show every raw input, not just ones currently in demand, so availability can be
  // pre-declared before a recipe chain that needs it is even selected.
  const rows = [...RAW_INPUTS]
    .map((item) => [item, result.raw[item] ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
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
          into these; only items you mark as belted between factories stay separate. Set "Available"
          to how much you actually have (e.g. from your miners) — Optimize uses it as the exact
          budget instead of guessing a rounded belt line, and it's flagged red if demand exceeds it
          either way.
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
            return (
              <tr
                key={item}
                className={overBudget ? "over-budget" : undefined}
                style={
                  { "--bar": `${(barPct * 100).toFixed(2)}%`, "--bar-color": color } as CSSProperties
                }
              >
                <td className="item-cell">{item}</td>
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

function ExtraTable({
  extraTargets,
  onSelect,
}: {
  extraTargets: Record<string, number>;
  onSelect: (name: string) => void;
}) {
  const rows = Object.entries(extraTargets).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="detail-head">
        <h2>✦ Additional outputs</h2>
        <div className="detail-stats">
          Extra targets you added in Configuration — delivered at the rate you set, same as a
          Final Assembly part, but not one of the actual Space Elevator deliverables.
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No additional outputs configured yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Items / min</th>
              <th>Produced in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, rate]) => (
              <tr key={item}>
                <td className="item-cell">{item}</td>
                <td className="num">{fmt(rate)}</td>
                <td>
                  <FlowBadge to={findSubfactory(item)} label={findSubfactory(item)} extra onSelect={onSelect} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function SurplusTable({ result }: { result: SolveResult }) {
  const rows = Object.entries(result.surplus).sort((a, b) => b[1] - a[1]);
  const totalValue = rows.reduce((sum, [item, rate]) => sum + (SINK_VALUES[item] ?? 0) * rate, 0);
  return (
    <>
      <div className="detail-head">
        <h2>⇪ Surplus</h2>
        <div className="detail-stats">Byproducts produced but unused — sink for tickets or route elsewhere.</div>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No surplus with the current recipe selection.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Items / min</th>
              <th className="num">Value / min</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, rate]) => {
              const points = SINK_VALUES[item];
              return (
                <tr key={item}>
                  <td className="item-cell">{item}</td>
                  <td className="num">{fmt(rate)}</td>
                  <td className="num muted">{points != null ? fmt(points * rate, 0) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td>Total</td>
              <td className="num"></td>
              <td className="num">{fmt(totalValue, 0)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );
}
