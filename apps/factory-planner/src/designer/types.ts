// Persisted shapes for the freeform factory Designer view. Coordinates are meters (the
// game's 1m build grid), integers only. Machines are placed by hand (unlike the solver-
// driven Layout view), so the model is machine-first: groups are just named bags of
// machine ids, and belts connect groups. Kept dependency-light so store.ts can validate
// without pulling in solver modules.

import { BUILDINGS } from "../data/recipes";
import type { Rot } from "../layout/types";

export interface DMachine {
  id: string;
  /** Key into BUILDINGS. */
  building: string;
  /** Top-left of the rotated footprint, 1m grid. */
  x: number;
  y: number;
  rotation: Rot;
  /** Any CSS color; duplicated machines keep it. */
  color: string;
  /** Owning group id, if grouped. */
  groupId?: string;
}

export interface DGroup {
  id: string;
  name: string;
}

/** A belt drawn between two groups (flow-diagram style). */
export interface DBelt {
  id: string;
  from: string;
  to: string;
  /** Optional user label (item name, rate, ...). */
  label?: string;
}

export interface Design {
  id: string;
  name: string;
  machines: DMachine[];
  groups: DGroup[];
  belts: DBelt[];
}

// ---- Validation for persisted values (guards against stale / corrupt storage) ----

function isRot(v: unknown): v is Rot {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

function isCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validMachine(v: unknown, groupIds: Set<string>): DMachine | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (!isId(m.id) || typeof m.building !== "string" || !(m.building in BUILDINGS)) return null;
  if (!isCoord(m.x) || !isCoord(m.y) || !isRot(m.rotation)) return null;
  if (typeof m.color !== "string" || m.color.length === 0 || m.color.length > 32) return null;
  const out: DMachine = {
    id: m.id, building: m.building, x: m.x, y: m.y, rotation: m.rotation, color: m.color,
  };
  if (isId(m.groupId) && groupIds.has(m.groupId)) out.groupId = m.groupId;
  return out;
}

/** Validate one persisted design; null if it is unusable. */
export function validDesign(v: unknown): Design | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (!isId(d.id) || typeof d.name !== "string") return null;

  const groups: DGroup[] = [];
  const groupIds = new Set<string>();
  if (Array.isArray(d.groups)) {
    for (const g of d.groups) {
      const gg = g as Record<string, unknown> | null;
      if (gg && isId(gg.id) && typeof gg.name === "string" && !groupIds.has(gg.id)) {
        groupIds.add(gg.id);
        groups.push({ id: gg.id, name: gg.name });
      }
    }
  }

  const machines: DMachine[] = [];
  const machineIds = new Set<string>();
  if (Array.isArray(d.machines)) {
    for (const m of d.machines) {
      const vm = validMachine(m, groupIds);
      if (vm && !machineIds.has(vm.id)) {
        machineIds.add(vm.id);
        machines.push(vm);
      }
    }
  }

  // Belts must reference surviving groups; drop duplicates and self-loops.
  const belts: DBelt[] = [];
  const beltIds = new Set<string>();
  if (Array.isArray(d.belts)) {
    for (const b of d.belts) {
      const bb = b as Record<string, unknown> | null;
      if (!bb || !isId(bb.id) || beltIds.has(bb.id)) continue;
      if (!isId(bb.from) || !isId(bb.to) || bb.from === bb.to) continue;
      if (!groupIds.has(bb.from) || !groupIds.has(bb.to)) continue;
      beltIds.add(bb.id);
      const belt: DBelt = { id: bb.id, from: bb.from, to: bb.to };
      if (typeof bb.label === "string" && bb.label.length > 0) belt.label = bb.label.slice(0, 80);
      belts.push(belt);
    }
  }

  return { id: d.id, name: d.name || "Design", machines, groups, belts };
}
