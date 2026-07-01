// Positions a balancer graph for SVG rendering: columns by longest path from the
// inputs (the one feedback edge is ignored for layering), rows settled by a few
// barycenter sweeps so parents centre on children and merger fans stay untangled.

import type { BalancerGraph } from "./build";

export const COL_W = 130;
export const ROW_H = 52;
export const MARGIN_X = 70;
export const MARGIN_Y = 46;

export interface Placed {
  x: number[]; // by node id
  y: number[];
  width: number;
  height: number;
  loopY: number; // horizontal channel below the diagram for the feedback edge
}

export function layoutGraph(g: BalancerGraph): Placed {
  const n = g.nodes.length;
  const preds: number[][] = Array.from({ length: n }, () => []);
  const succs: number[][] = Array.from({ length: n }, () => []);
  for (const e of g.edges) {
    if (e.loop) continue;
    preds[e.to].push(e.from);
    succs[e.from].push(e.to);
  }

  // Longest-path column per node (graph minus the loop edge is a DAG built in
  // topological creation order upstream-first, except output pills — handle below).
  const depth = new Array<number>(n).fill(0);
  const order = topoOrder(n, preds, succs);
  for (const v of order) {
    for (const p of preds[v]) depth[v] = Math.max(depth[v], depth[p] + 1);
  }
  const maxDepth = Math.max(0, ...depth);
  for (const node of g.nodes) if (node.kind === "output") depth[node.id] = maxDepth;

  // Initial rows: forward pass, mean of predecessors; sources spaced by id order.
  const y = new Array<number>(n).fill(0);
  let srcSlot = 0;
  for (const v of order) {
    y[v] = preds[v].length
      ? preds[v].reduce((a, p) => a + y[p], 0) / preds[v].length
      : srcSlot++;
  }
  const cols: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (let v = 0; v < n; v++) cols[depth[v]].push(v);

  const settle = () => {
    for (const col of cols) {
      col.sort((a, b) => y[a] - y[b] || a - b);
      // Enforce a minimum gap of 1 row while keeping the column's centre of mass.
      const mean = col.reduce((a, v) => a + y[v], 0) / col.length;
      for (let i = 1; i < col.length; i++) y[col[i]] = Math.max(y[col[i]], y[col[i - 1]] + 1);
      const drift = col.reduce((a, v) => a + y[v], 0) / col.length - mean;
      for (const v of col) y[v] -= drift;
    }
  };

  settle();
  for (let pass = 0; pass < 3; pass++) {
    // Backward: centre nodes on their successors (splitters over their branches).
    for (let i = order.length - 1; i >= 0; i--) {
      const v = order[i];
      if (succs[v].length) y[v] = succs[v].reduce((a, s) => a + y[s], 0) / succs[v].length;
    }
    settle();
    // Forward: centre on predecessors (mergers under their feeds).
    for (const v of order) {
      if (preds[v].length) y[v] = preds[v].reduce((a, p) => a + y[p], 0) / preds[v].length;
    }
    settle();
  }

  const minY = Math.min(...y);
  const maxY = Math.max(...y);
  const px = new Array<number>(n);
  const py = new Array<number>(n);
  for (let v = 0; v < n; v++) {
    px[v] = MARGIN_X + depth[v] * COL_W;
    py[v] = MARGIN_Y + (y[v] - minY) * ROW_H;
  }
  const height = MARGIN_Y + (maxY - minY) * ROW_H;
  return {
    x: px,
    y: py,
    width: MARGIN_X * 2 + maxDepth * COL_W,
    height: height + (g.loopRate > 0 ? 2.2 * MARGIN_Y : MARGIN_Y),
    loopY: height + MARGIN_Y * 1.2,
  };
}

function topoOrder(n: number, preds: number[][], succs: number[][]): number[] {
  const remaining = preds.map((p) => p.length);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (remaining[v] === 0) queue.push(v);
  const order: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    order.push(v);
    for (const s of succs[v]) if (--remaining[s] === 0) queue.push(s);
  }
  return order;
}
