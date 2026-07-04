// Merges a saved factory layout with the current solve's part list. Pure function — runs
// as a render-time derivation (useMemo); the result is only written back to persisted
// state on a user gesture, never from an effect.

import { autoLayout } from "./autolayout";
import { groupBounds, groupSlot } from "./geometry";
import type { PartSpec } from "./parts";
import type { FactoryLayout, GroupLayout, MachinePlacement } from "./types";

const SHELF_GAP = 8; // between the existing floor extent and newly-placed parts

/**
 * Kept groups keep their placement (machine slots re-derive from the new count), groups
 * for vanished parts drop, and new parts are auto-placed below everything on the floor.
 */
export function reconcile(saved: FactoryLayout | undefined, specs: PartSpec[]): FactoryLayout {
  if (!saved) return autoLayout(specs);
  const groups: Record<string, GroupLayout> = {};
  const fresh: PartSpec[] = [];
  for (const s of specs) {
    const g = saved.groups[s.item];
    if (g) groups[s.item] = fitGroup(g, s);
    else fresh.push(s);
  }
  if (fresh.length > 0) {
    let bottom = -Infinity;
    for (const s of specs) {
      const g = groups[s.item];
      if (!g) continue;
      const b = groupBounds(s, g);
      bottom = Math.max(bottom, b.y + b.h);
    }
    const placed = autoLayout(fresh, Number.isFinite(bottom) ? bottom + SHELF_GAP : 0);
    Object.assign(groups, placed.groups);
  }
  return { groups };
}

/** Adapt a saved group to the part's current machine count. */
function fitGroup(g: GroupLayout, s: PartSpec): GroupLayout {
  const out: GroupLayout = { x: g.x, y: g.y, rotation: g.rotation, rows: g.rows };
  if (g.ungrouped) {
    const machines: MachinePlacement[] = g.ungrouped.slice(0, s.count).map((m) => ({ ...m }));
    // Count grew: materialize the extra machines at their default grid slots.
    for (let i = machines.length; i < s.count; i++) {
      const slot = groupSlot(s, out, i);
      machines.push({ x: slot.x, y: slot.y, rotation: out.rotation });
    }
    out.ungrouped = machines;
  }
  return out;
}
