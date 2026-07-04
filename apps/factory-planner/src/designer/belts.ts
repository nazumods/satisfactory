// Belt polylines for the Designer view: an orthogonal Manhattan route between two group
// bounding boxes, same 3-segment style as the Layout view's routing but driven purely by
// the user-drawn group→group edges (no recipe knowledge, no obstacle avoidance).

import type { Box } from "../layout/geometry";
import { groupBoundsOf } from "./ops";
import type { Design } from "./types";

export interface BeltPath {
  id: string;
  label?: string;
  points: Array<[number, number]>;
  /** Label anchor (midpoint of the middle segment). */
  anchor: [number, number];
}

function route(from: Box, to: Box, jitter: number): Array<[number, number]> {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    // H-V-H: exit the source's facing side at mid-height, enter the target's.
    const x0 = dx >= 0 ? from.x + from.w : from.x;
    const x1 = dx >= 0 ? to.x : to.x + to.w;
    const y0 = from.y + from.h / 2;
    const y1 = to.y + to.h / 2;
    const xm = (x0 + x1) / 2 + jitter;
    return [[x0, y0], [xm, y0], [xm, y1], [x1, y1]];
  }
  // V-H-V.
  const y0 = dy >= 0 ? from.y + from.h : from.y;
  const y1 = dy >= 0 ? to.y : to.y + to.h;
  const x0 = from.x + from.w / 2;
  const x1 = to.x + to.w / 2;
  const ym = (y0 + y1) / 2 + jitter;
  return [[x0, y0], [x0, ym], [x1, ym], [x1, y1]];
}

export function routeBelts(design: Design): BeltPath[] {
  const bounds: Record<string, Box> = {};
  for (const g of design.groups) bounds[g.id] = groupBoundsOf(design, g.id);
  return design.belts.map((b, i) => {
    const jitter = ((i % 5) - 2) * 1.6; // separate parallel runs a little
    const points = route(bounds[b.from], bounds[b.to], jitter);
    return {
      id: b.id,
      label: b.label,
      points,
      anchor: [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2],
    };
  });
}
