// Initial group placement: one column per production-chain depth (inputs left, outputs
// right, so belt flow reads left→right), groups stacked top-down within a column. Gaps
// come from the buildings' belt clearance. The 8m foundation grid is visual only —
// placement snaps to the game's 1m build grid.

import { groupSize } from "./geometry";
import type { PartSpec } from "./parts";
import type { FactoryLayout, GroupLayout } from "./types";

const MIN_COL_GAP = 8; // belt lane between chain-depth columns
const MIN_ROW_GAP = 4; // between stacked groups in a column

export function defaultRows(count: number): 1 | 2 {
  return count > 8 ? 2 : 1;
}

export function autoLayout(specs: PartSpec[], originY = 0): FactoryLayout {
  const groups: Record<string, GroupLayout> = {};
  const depths = [...new Set(specs.map((s) => s.depth))].sort((a, b) => a - b);
  let x = 0;
  for (const d of depths) {
    const col = specs.filter((s) => s.depth === d);
    let y = originY;
    let colW = 0;
    let colGap = MIN_COL_GAP;
    for (const s of col) {
      const rows = defaultRows(s.count);
      const { w, h } = groupSize(s, rows);
      groups[s.item] = { x, y, rotation: 0, rows };
      const [cw, cl] = s.building.clearanceM ?? [8, 8];
      y += h + Math.max(MIN_ROW_GAP, cl);
      colW = Math.max(colW, w);
      colGap = Math.max(colGap, MIN_COL_GAP + cw);
    }
    x += colW + colGap;
  }
  return { groups };
}
