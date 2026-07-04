// Group/machine box math for the Layout view. All coordinates in meters.

import type { PartSpec } from "./parts";
import type { GroupLayout, Rot } from "./types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nextRot(r: Rot): Rot {
  return ((r + 90) % 360) as Rot;
}

/** Machines per row for a group. */
export function groupCols(count: number, rows: 1 | 2): number {
  return Math.ceil(count / rows);
}

/** Unrotated group size: machines flush side-by-side, rows stacked along machine length. */
export function groupSize(spec: PartSpec, rows: 1 | 2): { w: number; h: number } {
  const [bw, bl] = spec.building.footprintM;
  return { w: groupCols(spec.count, rows) * bw, h: rows * bl };
}

/** Rotate a local box inside unrotated (W × H) bounds into the rotated bounds' frame. */
export function rotateBoxIn(b: Box, W: number, H: number, rot: Rot): Box {
  switch (rot) {
    case 0:
      return b;
    case 90:
      return { x: H - b.y - b.h, y: b.x, w: b.h, h: b.w };
    case 180:
      return { x: W - b.x - b.w, y: H - b.y - b.h, w: b.w, h: b.h };
    case 270:
      return { x: b.y, y: W - b.x - b.w, w: b.h, h: b.w };
  }
}

/** Grouped machine slot for index i, absolute meters, group rotation applied. */
export function groupSlot(spec: PartSpec, g: GroupLayout, i: number): Box {
  const [bw, bl] = spec.building.footprintM;
  const cols = groupCols(spec.count, g.rows);
  const local = rotateBoxIn(
    { x: (i % cols) * bw, y: Math.floor(i / cols) * bl, w: bw, h: bl },
    cols * bw,
    g.rows * bl,
    g.rotation,
  );
  return { x: g.x + local.x, y: g.y + local.y, w: local.w, h: local.h };
}

/** All machine boxes for a group — grid slots, or individual placements when exploded. */
export function machineBoxes(spec: PartSpec, g: GroupLayout): Box[] {
  if (g.ungrouped) {
    const [bw, bl] = spec.building.footprintM;
    return g.ungrouped.map((m) =>
      m.rotation % 180 === 0
        ? { x: m.x, y: m.y, w: bw, h: bl }
        : { x: m.x, y: m.y, w: bl, h: bw },
    );
  }
  return Array.from({ length: spec.count }, (_, i) => groupSlot(spec, g, i));
}

export function unionBounds(boxes: Box[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Group bounding box — rotated grid box, or the union of exploded machine boxes. */
export function groupBounds(spec: PartSpec, g: GroupLayout): Box {
  if (!g.ungrouped) {
    const { w, h } = groupSize(spec, g.rows);
    return g.rotation % 180 === 0
      ? { x: g.x, y: g.y, w, h }
      : { x: g.x, y: g.y, w: h, h: w };
  }
  return unionBounds(machineBoxes(spec, g));
}
