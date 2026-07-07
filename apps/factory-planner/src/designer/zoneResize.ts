// Pure geometry for resizing foundation zones by their edges/corners, so DesignerCanvas
// only owns the gesture bookkeeping. Handles are corner squares plus full-length edge
// strips; corners are listed last so they render on top of the strips they overlap.

import type { Box } from "../layout/geometry";

export interface ZoneEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export interface ZoneHandle {
  edges: ZoneEdges;
  cursor: string;
}

export const ZONE_HANDLES: ZoneHandle[] = [
  { edges: { left: true }, cursor: "ew-resize" },
  { edges: { right: true }, cursor: "ew-resize" },
  { edges: { top: true }, cursor: "ns-resize" },
  { edges: { bottom: true }, cursor: "ns-resize" },
  { edges: { left: true, top: true }, cursor: "nwse-resize" },
  { edges: { right: true, bottom: true }, cursor: "nwse-resize" },
  { edges: { right: true, top: true }, cursor: "nesw-resize" },
  { edges: { left: true, bottom: true }, cursor: "nesw-resize" },
];

/** Hit area for a handle, `hs` wide, centered on the zone's edge or corner. */
export function handleHitBox(z: Box, h: ZoneHandle, hs: number): Box {
  const { left, right, top } = h.edges;
  const horiz = left || right;
  const vert = top || h.edges.bottom;
  const cx = left ? z.x : z.x + z.w;
  const cy = top ? z.y : z.y + z.h;
  if (horiz && vert) return { x: cx - hs / 2, y: cy - hs / 2, w: hs, h: hs };
  if (horiz) return { x: cx - hs / 2, y: z.y, w: hs, h: z.h };
  return { x: z.x, y: cy - hs / 2, w: z.w, h: hs };
}

/** Resize `orig` by dragging `edges` through (dx, dy), 8m-snapped, min one foundation. */
export function resizeZoneBox(orig: Box, edges: ZoneEdges, dx: number, dy: number): Box {
  let x0 = orig.x;
  let y0 = orig.y;
  let x1 = orig.x + orig.w;
  let y1 = orig.y + orig.h;
  if (edges.left) x0 = Math.min(Math.round((orig.x + dx) / 8) * 8, x1 - 8);
  if (edges.right) x1 = Math.max(Math.round((orig.x + orig.w + dx) / 8) * 8, x0 + 8);
  if (edges.top) y0 = Math.min(Math.round((orig.y + dy) / 8) * 8, y1 - 8);
  if (edges.bottom) y1 = Math.max(Math.round((orig.y + orig.h + dy) / 8) * 8, y0 + 8);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
