// Belt flow edges for the Layout view: for each part group's recipe input, an orthogonal
// polyline from the in-factory producer group (or the floor's left edge for items belted
// in from outside), carrying item + rate. Deliberately simple — 3-segment Manhattan routes
// with a small parallel-run offset, no obstacle avoidance. Splitter/merger detail lives in
// the balancer view.

import { scaledInputRate, type Multipliers } from "../solver/solver";
import { partColor } from "./colors";
import { groupBounds, type Box } from "./geometry";
import type { PartSpec } from "./parts";
import type { FactoryLayout } from "./types";

export interface LayoutEdge {
  key: string;
  /** Item carried on the belt. */
  item: string;
  rate: number;
  /** Producing group's item; undefined = external (belted in from outside the factory). */
  from?: string;
  to: string;
  points: Array<[number, number]>;
  /** Label anchor (midpoint of the middle segment). */
  label: [number, number];
  color: string;
}

const EXTERNAL_RUN = 14; // how far outside the floor an external belt starts

export function routeEdges(
  specs: PartSpec[],
  layout: FactoryLayout,
  multipliers: Multipliers,
): LayoutEdge[] {
  const boxByItem: Record<string, Box> = {};
  for (const s of specs) {
    const g = layout.groups[s.item];
    if (g) boxByItem[s.item] = groupBounds(s, g);
  }
  const producerOf: Record<string, string> = {};
  for (const s of specs) {
    for (const out of Object.keys(s.recipe.outputs)) {
      // Prefer the primary producer when an item is also someone's byproduct.
      if (!(out in producerOf) || out === s.item) producerOf[out] = s.item;
    }
  }
  const allBoxes = Object.values(boxByItem);
  const floorMinX = allBoxes.length > 0 ? Math.min(...allBoxes.map((b) => b.x)) : 0;

  const edges: LayoutEdge[] = [];
  let n = 0; // global edge counter for parallel-run separation
  for (const s of specs) {
    const to = boxByItem[s.item];
    if (!to) continue;
    const inputs = Object.entries(s.recipe.inputs);
    inputs.forEach(([item, perMachine], idx) => {
      const rate =
        scaledInputRate(perMachine, s.recipe.cycleSeconds, multipliers.partsCost) *
        s.machinesFractional;
      if (rate <= 1e-9) return;
      // Input ports spread along the consumer's facing edge so belts don't stack.
      const frac = (idx + 1) / (inputs.length + 1);
      const fromItem = producerOf[item];
      const from = fromItem !== undefined && fromItem !== s.item ? boxByItem[fromItem] : undefined;
      const jitter = ((n++ % 5) - 2) * 1.6;

      if (!from) {
        const py = to.y + to.h * frac;
        const x0 = Math.min(floorMinX, to.x) - EXTERNAL_RUN;
        edges.push({
          key: `${s.item}<${item}`,
          item,
          rate,
          to: s.item,
          points: [[x0, py], [to.x, py]],
          label: [(x0 + to.x) / 2, py],
          color: partColor(item),
        });
        return;
      }

      const dx = to.x + to.w / 2 - (from.x + from.w / 2);
      const dy = to.y + to.h / 2 - (from.y + from.h / 2);
      let points: Array<[number, number]>;
      if (Math.abs(dx) >= Math.abs(dy)) {
        // H-V-H: exit the producer's facing side at mid-height, enter the consumer's port.
        const x0 = dx >= 0 ? from.x + from.w : from.x;
        const x1 = dx >= 0 ? to.x : to.x + to.w;
        const y0 = from.y + from.h / 2;
        const y1 = to.y + to.h * frac;
        const xm = (x0 + x1) / 2 + jitter;
        points = [[x0, y0], [xm, y0], [xm, y1], [x1, y1]];
      } else {
        // V-H-V.
        const y0 = dy >= 0 ? from.y + from.h : from.y;
        const y1 = dy >= 0 ? to.y : to.y + to.h;
        const x0 = from.x + from.w / 2;
        const x1 = to.x + to.w * frac;
        const ym = (y0 + y1) / 2 + jitter;
        points = [[x0, y0], [x0, ym], [x1, ym], [x1, y1]];
      }
      edges.push({
        key: `${s.item}<${item}`,
        item,
        rate,
        from: fromItem,
        to: s.item,
        points,
        label: [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2],
        color: partColor(item),
      });
    });
  }
  return edges;
}
