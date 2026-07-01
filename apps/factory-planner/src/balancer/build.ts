// Builds a splitter/merger graph realizing a parsed balancer spec.
//
// Shape: inputs → merger tree → [loop merger] → splitter tree → per-output merger trees.
// Output rates are reduced to integer weights summing to S. Splitters only divide by
// 2 or 3, so if S isn't 2^a·3^b we split into the smallest such T ≥ S and loop the
// spare T−S back into the top of the tree (steady-state feedback, standard trick).
// The splitter tree is pruned: a branch whose whole share belongs to one output stops
// splitting and is delivered as a single belt, so node count stays O(outputs · log T).

import type { ParsedSpec } from "./parse";

export type NodeKind = "input" | "output" | "split" | "merge";

export interface BNode {
  id: number;
  kind: NodeKind;
  rate: number; // throughput of the node (belt rate for input/output pills)
}

export interface BEdge {
  from: number;
  to: number;
  rate: number;
  loop?: boolean; // feedback edge, drawn routed around the diagram
}

export interface BalancerGraph {
  nodes: BNode[];
  edges: BEdge[];
  splitters: number;
  mergers: number;
  loopRate: number; // items/min recirculating through the feedback loop (0 = none)
}

export type BuildResult = { ok: true; graph: BalancerGraph } | { ok: false; error: string };

/** A share of one output's weight travelling down a splitter-tree branch. */
interface Frag {
  chunk: number; // output index, or -1 for the feedback-loop share
  weight: number;
}

interface Source {
  from: number;
  rate: number;
}

const MAX_UNITS = 5000; // reduced-ratio cap; beyond this the diagram is meaningless

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function gcd2(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Scale rates to co-prime integer weights (handles decimals up to 4 dp). */
function integerWeights(rates: number[]): number[] | null {
  const scaled = rates.map((r) => Math.round(r * 10000));
  if (scaled.some((s, i) => s <= 0 || Math.abs(s - rates[i] * 10000) > 1e-3)) return null;
  const g = scaled.reduce(gcd2);
  return scaled.map((s) => s / g);
}

/** Smallest 2^a·3^b ≥ s. */
function smoothCeil(s: number): number {
  let best = Infinity;
  for (let p3 = 1; p3 < s * 3; p3 *= 3) {
    let p = p3;
    while (p < s) p *= 2;
    if (p < best) best = p;
  }
  return best;
}

export function buildBalancer(spec: ParsedSpec): BuildResult {
  // x-term specs carry exact weights (their per-belt rates may not terminate in
  // decimal, e.g. 324/22); reduce them the same way integerWeights does.
  const g = spec.outputWeights?.reduce(gcd2);
  const weights = g
    ? spec.outputWeights!.map((w) => w / g)
    : integerWeights(spec.outputs);
  if (!weights) return { ok: false, error: "Rates must have at most 4 decimal places." };
  const S = sum(weights);
  if (S > MAX_UNITS) {
    return { ok: false, error: `Ratio reduces to ${S} parts — too fine to balance sanely.` };
  }
  const total = sum(spec.inputs);
  const unit = total / S; // items/min carried by one weight unit
  const T = smoothCeil(S);

  const nodes: BNode[] = [];
  const edges: BEdge[] = [];
  const addNode = (kind: NodeKind, rate: number): number => {
    nodes.push({ id: nodes.length, kind, rate });
    return nodes.length - 1;
  };

  // Belts arriving at each output (or at the loop for chunk -1), in tree-leaf order.
  const deliveries = new Map<number, Source[]>();
  const deliver = (chunk: number, src: Source) => {
    const list = deliveries.get(chunk) ?? [];
    list.push(src);
    deliveries.set(chunk, list);
  };

  /** Fill `d` bins of weight/d each, splitting fragments at bin boundaries. */
  function partition(frags: Frag[], weight: number, d: number): Frag[][] {
    const cap = weight / d;
    const bins: Frag[][] = [];
    let cur: Frag[] = [];
    let room = cap;
    for (const f of frags) {
      let w = f.weight;
      while (w > 0) {
        const take = Math.min(w, room);
        cur.push({ chunk: f.chunk, weight: take });
        w -= take;
        room -= take;
        if (room === 0) {
          bins.push(cur);
          cur = [];
          room = cap;
        }
      }
    }
    return bins;
  }

  /** Route a belt of `weight` integer units from `src` down to its fragments' destinations. */
  function expand(src: Source, weight: number, frags: Frag[]): void {
    if (frags.every((f) => f.chunk === frags[0].chunk)) {
      deliver(frags[0].chunk, src);
      return;
    }
    // Prefer whichever divisor terminates more branches immediately; ties go to 3
    // (shallower tree). Every non-terminal weight here is 2^a·3^b > 1, so one divides.
    const candidates = [3, 2].filter((d) => weight % d === 0);
    let bins = partition(frags, weight, candidates[0]);
    if (candidates.length === 2) {
      const terminals = (bs: Frag[][]) =>
        bs.filter((b) => b.every((f) => f.chunk === b[0].chunk)).length;
      const alt = partition(frags, weight, candidates[1]);
      if (terminals(alt) > terminals(bins)) bins = alt;
    }
    const sp = addNode("split", src.rate);
    edges.push({ from: src.from, to: sp, rate: src.rate });
    const childWeight = weight / bins.length;
    for (const bin of bins) {
      expand({ from: sp, rate: childWeight * unit }, childWeight, bin);
    }
  }

  /** Merge sources into one belt with a tree of ≤3-input mergers. */
  function mergeTree(sources: Source[]): Source {
    let belts = sources;
    while (belts.length > 1) {
      const next: Source[] = [];
      for (let i = 0; i < belts.length; ) {
        // Take 3 at a time, but never strand a single belt for an extra merger.
        const take = belts.length - i === 4 ? 2 : Math.min(3, belts.length - i);
        if (take === 1) {
          next.push(belts[i]);
          i += 1;
          continue;
        }
        const group = belts.slice(i, i + take);
        const rate = sum(group.map((b) => b.rate));
        const m = addNode("merge", rate);
        for (const b of group) edges.push({ from: b.from, to: m, rate: b.rate });
        next.push({ from: m, rate });
        i += take;
      }
      belts = next;
    }
    return belts[0];
  }

  // --- Input side: merge all inputs into one belt.
  const inputSources: Source[] = spec.inputs.map((rate) => ({
    from: addNode("input", rate),
    rate,
  }));
  let main = inputSources.length === 1 ? inputSources[0] : mergeTree(inputSources);

  // --- Feedback loop merger sits between the merged input and the splitter tree.
  let loopMerger = -1;
  if (T > S) {
    loopMerger = addNode("merge", T * unit);
    edges.push({ from: main.from, to: loopMerger, rate: main.rate });
    main = { from: loopMerger, rate: T * unit };
  }

  // --- Splitter tree over T units: real outputs in order, loop share last.
  const chunks: Frag[] = weights.map((w, i) => ({ chunk: i, weight: w }));
  if (T > S) chunks.push({ chunk: -1, weight: T - S });
  expand(main, T, chunks);

  // --- Collect deliveries: merger tree per output, loop belts back to the loop merger.
  for (let i = 0; i < spec.outputs.length; i++) {
    const final = mergeTree(deliveries.get(i) ?? []);
    const out = addNode("output", spec.outputs[i]);
    edges.push({ from: final.from, to: out, rate: final.rate });
  }
  if (loopMerger >= 0) {
    const back = mergeTree(deliveries.get(-1)!);
    edges.push({ from: back.from, to: loopMerger, rate: back.rate, loop: true });
  }

  return {
    ok: true,
    graph: {
      nodes,
      edges,
      splitters: nodes.filter((n) => n.kind === "split").length,
      mergers: nodes.filter((n) => n.kind === "merge").length,
      loopRate: (T - S) * unit,
    },
  };
}
