// Persisted shapes for the factory Layout view. Coordinates are meters (the game's 1m
// build grid), integers only. Kept dependency-free so ui/persist.ts can import the types
// without pulling in solver/data modules.

export type Rot = 0 | 90 | 180 | 270;

/** An individually-placed machine of an ungrouped (exploded) part group. */
export interface MachinePlacement {
  x: number;
  y: number;
  rotation: Rot;
}

export interface GroupLayout {
  /** Top-left of the group's (rotated) bounding box, 1m grid. */
  x: number;
  y: number;
  rotation: Rot;
  rows: 1 | 2;
  /** Present => the group is exploded; index = machine index within the group. */
  ungrouped?: MachinePlacement[];
}

/** One factory's layout edits, keyed by part (item) name — stable across solves. */
export interface FactoryLayout {
  groups: Record<string, GroupLayout>;
}

/** factory name -> layout. The persisted form (PersistedState.layouts). */
export type LayoutState = Record<string, FactoryLayout>;

// ---- Validation for persisted values (guards against stale / corrupt storage) ----

function isRot(v: unknown): v is Rot {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

function isCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function validGroup(v: unknown): GroupLayout | null {
  if (!v || typeof v !== "object") return null;
  const g = v as Record<string, unknown>;
  if (!isCoord(g.x) || !isCoord(g.y) || !isRot(g.rotation)) return null;
  if (g.rows !== 1 && g.rows !== 2) return null;
  const out: GroupLayout = { x: g.x, y: g.y, rotation: g.rotation, rows: g.rows };
  if (g.ungrouped !== undefined) {
    if (!Array.isArray(g.ungrouped)) return null;
    const machines: MachinePlacement[] = [];
    for (const m of g.ungrouped) {
      const mm = m as Record<string, unknown> | null;
      if (!mm || typeof mm !== "object" || !isCoord(mm.x) || !isCoord(mm.y) || !isRot(mm.rotation)) return null;
      machines.push({ x: mm.x, y: mm.y, rotation: mm.rotation });
    }
    out.ungrouped = machines;
  }
  return out;
}

export function validLayouts(v: unknown): LayoutState {
  const out: LayoutState = {};
  if (!v || typeof v !== "object") return out;
  for (const [factory, fl] of Object.entries(v as Record<string, unknown>)) {
    const groupsRaw = (fl as { groups?: unknown } | null)?.groups;
    if (!groupsRaw || typeof groupsRaw !== "object") continue;
    const groups: Record<string, GroupLayout> = {};
    for (const [item, g] of Object.entries(groupsRaw as Record<string, unknown>)) {
      const vg = validGroup(g);
      if (vg) groups[item] = vg;
    }
    if (Object.keys(groups).length > 0) out[factory] = { groups };
  }
  return out;
}
