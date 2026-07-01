import { useEffect, useMemo, useState } from "react";
import { machineSpellings, parseSpec } from "../balancer/parse";
import { buildBalancer, type BalancerGraph, type BEdge } from "../balancer/build";
import { layoutGraph, type Placed } from "../balancer/layout";
import { fmt } from "../ui/format";
import { navigate } from "../ui/route";

const EXAMPLES = ["1:2", "1:5", "3:2", "120:48,72", "324:x22", "780:270,270,240"];

interface Props {
  spec: string; // raw spec from the URL hash (may be empty)
}

export function BalancerView({ spec }: Props) {
  const [draft, setDraft] = useState(() => decodeURIComponent(spec));
  // Keep the input in sync when the route changes underneath us (back button, links).
  useEffect(() => setDraft(decodeURIComponent(spec)), [spec]);

  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const built = useMemo(
    () => (parsed.ok ? buildBalancer(parsed.spec) : null),
    [parsed],
  );
  const spellings = useMemo(() => machineSpellings(spec), [spec]);

  const apply = (value: string) => {
    const trimmed = value.trim();
    navigate(`/balancer${trimmed ? `/${encodeURIComponent(trimmed)}` : ""}`, true);
  };

  return (
    <div className="app balancer-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⑃</span>
          <div>
            <h1>Belt Balancer</h1>
            <p className="brand-sub">splitter / merger layouts for rates &amp; ratios</p>
          </div>
        </div>
        <a className="balancer-back" href="#/">← Factory planner</a>
      </header>

      <div className="balancer-controls">
        <label htmlFor="balancer-spec">inputs : outputs</label>
        <input
          id="balancer-spec"
          className="balancer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => apply(draft)}
          onKeyDown={(e) => e.key === "Enter" && apply(draft)}
          placeholder="120:48,72"
          spellCheck={false}
        />
        <div className="balancer-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip-btn" onClick={() => apply(ex)}>
              {ex}
            </button>
          ))}
        </div>
        {spellings && (
          <div className="balancer-toggle" role="radiogroup" aria-label="Machine split mode">
            <button
              type="button"
              className={"chip-btn" + (spellings.current === "balanced" ? " active" : "")}
              onClick={() => apply(spellings.balanced)}
              title={`Every belt carries the same rate (${spellings.balanced})`}
            >
              even
            </button>
            <button
              type="button"
              className={"chip-btn" + (spellings.current === "remainder" ? " active" : "")}
              onClick={() => apply(spellings.remainder)}
              title={`Full-rate belts plus one remainder belt (${spellings.remainder})`}
            >
              full + remainder
            </button>
          </div>
        )}
      </div>

      {!parsed.ok ? (
        <div className="balancer-error">{parsed.error}</div>
      ) : !built!.ok ? (
        <div className="balancer-error">{built!.error}</div>
      ) : (
        <BalancerResult note={parsed.spec.note} graph={built!.graph} />
      )}

      <footer className="footer">
        Splitters and mergers are 3-way. A dashed edge is a feedback loop: the spare share
        recirculates so the tree can split by amounts other than 2s and 3s.
      </footer>
    </div>
  );
}

function BalancerResult({ note, graph }: { note: string; graph: BalancerGraph }) {
  const placed = useMemo(() => layoutGraph(graph), [graph]);
  return (
    <>
      <div className="balancer-stats">
        <span className="balancer-note">{note}</span>
        <span>{graph.splitters} splitter{graph.splitters === 1 ? "" : "s"}</span>
        <span>{graph.mergers} merger{graph.mergers === 1 ? "" : "s"}</span>
        {graph.loopRate > 0 && (
          <span className="balancer-loop-stat">loop {fmt(graph.loopRate)}/min</span>
        )}
      </div>
      <div className="balancer-canvas">
        <Diagram graph={graph} placed={placed} />
      </div>
    </>
  );
}

const PILL_W = 74;
const PILL_H = 26;
const NODE_R = 11;

function Diagram({ graph, placed }: { graph: BalancerGraph; placed: Placed }) {
  return (
    <svg
      width={placed.width}
      height={placed.height}
      viewBox={`0 0 ${placed.width} ${placed.height}`}
      role="img"
      aria-label="Balancer diagram"
    >
      {graph.edges.map((e, i) => (
        <Edge key={i} edge={e} graph={graph} placed={placed} />
      ))}
      {graph.nodes.map((node) => {
        const x = placed.x[node.id];
        const y = placed.y[node.id];
        if (node.kind === "input" || node.kind === "output") {
          return (
            <g key={node.id} className={`bnode-${node.kind}`}>
              <rect
                x={x - PILL_W / 2}
                y={y - PILL_H / 2}
                width={PILL_W}
                height={PILL_H}
                rx={PILL_H / 2}
              />
              <text x={x} y={y}>{fmt(node.rate)}</text>
            </g>
          );
        }
        if (node.kind === "split") {
          return (
            <g key={node.id} className="bnode-split">
              <rect
                x={x - NODE_R}
                y={y - NODE_R}
                width={NODE_R * 2}
                height={NODE_R * 2}
                rx={3}
                transform={`rotate(45 ${x} ${y})`}
              />
              <text x={x} y={y}>S</text>
              <title>Splitter · {fmt(node.rate)}/min in</title>
            </g>
          );
        }
        return (
          <g key={node.id} className="bnode-merge">
            <circle cx={x} cy={y} r={NODE_R} />
            <text x={x} y={y}>M</text>
            <title>Merger · {fmt(node.rate)}/min out</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Half-width of a node along the flow axis, for trimming edges at its border. */
function outset(graph: BalancerGraph, id: number): number {
  const kind = graph.nodes[id].kind;
  return kind === "input" || kind === "output" ? PILL_W / 2 : NODE_R;
}

/** Horizontal-flow bezier between node borders; the loop edge routes underneath. */
function Edge({ edge, graph, placed }: { edge: BEdge; graph: BalancerGraph; placed: Placed }) {
  const x1 = placed.x[edge.from];
  const y1 = placed.y[edge.from];
  const x2 = placed.x[edge.to];
  const y2 = placed.y[edge.to];

  if (edge.loop) {
    const drop = placed.loopY;
    const d = `M ${x1} ${y1 + NODE_R} C ${x1} ${drop}, ${x1} ${drop}, ${x1 - 24} ${drop}`
      + ` L ${x2 + 24} ${drop} C ${x2} ${drop}, ${x2} ${drop}, ${x2} ${y2 + NODE_R}`;
    return (
      <g className="bedge bedge-loop">
        <path d={d} />
        <text x={(x1 + x2) / 2} y={drop - 6}>↺ {fmt(edge.rate)}</text>
      </g>
    );
  }

  const sx = x1 + outset(graph, edge.from) + 3;
  const ex = x2 - outset(graph, edge.to) - 3;
  const mx = (sx + ex) / 2;
  return (
    <g className="bedge">
      <path d={`M ${sx} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${ex} ${y2}`} />
      <text x={sx + (ex - sx) * 0.42} y={(y1 + y2) / 2 - 5}>{fmt(edge.rate)}</text>
    </g>
  );
}
