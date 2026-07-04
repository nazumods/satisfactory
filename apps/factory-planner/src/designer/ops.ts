// Pure edit operations on a Design. Every op returns a new Design (React state friendly);
// helpers keep the invariants: groups never empty, belts only between existing groups.

import { BUILDINGS } from "../data/recipes";
import { nextRot, rotateBoxIn, unionBounds, type Box } from "../layout/geometry";
import { newId } from "./store";
import type { Design, DMachine } from "./types";

/** Footprint box of a placed machine, rotation applied. */
export function machineBox(m: DMachine): Box {
  const [bw, bl] = BUILDINGS[m.building].footprintM;
  return m.rotation % 180 === 0
    ? { x: m.x, y: m.y, w: bw, h: bl }
    : { x: m.x, y: m.y, w: bl, h: bw };
}

/** Union bounds of a group's member machines (zero box if the group is empty). */
export function groupBoundsOf(design: Design, groupId: string): Box {
  return unionBounds(design.machines.filter((m) => m.groupId === groupId).map(machineBox));
}

export function selectionBounds(design: Design, ids: Set<string>): Box {
  return unionBounds(design.machines.filter((m) => ids.has(m.id)).map(machineBox));
}

/** Drop groups with no members and belts whose endpoints no longer exist. */
function cleanup(d: Design): Design {
  const used = new Set(d.machines.map((m) => m.groupId).filter((g): g is string => !!g));
  const groups = d.groups.filter((g) => used.has(g.id));
  const ids = new Set(groups.map((g) => g.id));
  const belts = d.belts.filter((b) => ids.has(b.from) && ids.has(b.to));
  return { ...d, groups, belts };
}

export function addMachine(
  d: Design, building: string, x: number, y: number, rotation: DMachine["rotation"], color: string,
): { design: Design; id: string } {
  const id = newId();
  const m: DMachine = { id, building, x, y, rotation, color };
  return { design: { ...d, machines: [...d.machines, m] }, id };
}

export function moveMachines(d: Design, ids: Set<string>, dx: number, dy: number): Design {
  if (dx === 0 && dy === 0) return d;
  return {
    ...d,
    machines: d.machines.map((m) => (ids.has(m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m)),
  };
}

/** Rotate the selection 90° clockwise about its own bounding box. */
export function rotateMachines(d: Design, ids: Set<string>): Design {
  const b = selectionBounds(d, ids);
  if (b.w === 0 && b.h === 0) return d;
  return {
    ...d,
    machines: d.machines.map((m) => {
      if (!ids.has(m.id)) return m;
      const mb = machineBox(m);
      const local = rotateBoxIn({ x: mb.x - b.x, y: mb.y - b.y, w: mb.w, h: mb.h }, b.w, b.h, 90);
      return { ...m, x: b.x + local.x, y: b.y + local.y, rotation: nextRot(m.rotation) };
    }),
  };
}

/**
 * Clone the selected machines (colors kept), offset one foundation down-right. Groups whose
 * members are all selected are cloned too (named "<name> copy"); partial members come out
 * ungrouped. Returns the clones' ids so the caller can select them.
 */
export function duplicateMachines(d: Design, ids: Set<string>): { design: Design; newIds: Set<string> } {
  const selected = d.machines.filter((m) => ids.has(m.id));
  if (selected.length === 0) return { design: d, newIds: new Set() };

  const groupClones: Record<string, string> = {};
  const groups = [...d.groups];
  for (const g of d.groups) {
    const members = d.machines.filter((m) => m.groupId === g.id);
    if (members.length > 0 && members.every((m) => ids.has(m.id))) {
      const cloneId = newId();
      groupClones[g.id] = cloneId;
      groups.push({ id: cloneId, name: `${g.name} copy` });
    }
  }

  const newIds = new Set<string>();
  const clones = selected.map((m) => {
    const id = newId();
    newIds.add(id);
    const clone: DMachine = { ...m, id, x: m.x + 8, y: m.y + 8 };
    const cloneGroup = m.groupId ? groupClones[m.groupId] : undefined;
    if (cloneGroup) clone.groupId = cloneGroup;
    else delete clone.groupId;
    return clone;
  });
  return { design: { ...d, groups, machines: [...d.machines, ...clones] }, newIds };
}

/** Put the selected machines into a new group (pulling them out of any old ones). */
export function groupMachines(d: Design, ids: Set<string>, name: string): { design: Design; groupId: string } {
  const groupId = newId();
  const design = cleanup({
    ...d,
    groups: [...d.groups, { id: groupId, name }],
    machines: d.machines.map((m) => (ids.has(m.id) ? { ...m, groupId } : m)),
  });
  return { design, groupId };
}

export function ungroupMachines(d: Design, ids: Set<string>): Design {
  return cleanup({
    ...d,
    machines: d.machines.map((m) => {
      if (!ids.has(m.id) || !m.groupId) return m;
      const rest = { ...m };
      delete rest.groupId;
      return rest;
    }),
  });
}

export function deleteMachines(d: Design, ids: Set<string>): Design {
  return cleanup({ ...d, machines: d.machines.filter((m) => !ids.has(m.id)) });
}

export function recolorMachines(d: Design, ids: Set<string>, color: string): Design {
  return { ...d, machines: d.machines.map((m) => (ids.has(m.id) ? { ...m, color } : m)) };
}

export function renameGroup(d: Design, groupId: string, name: string): Design {
  return { ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) };
}

/** Add a belt between two groups; no self-loops or exact duplicates. */
export function addBelt(d: Design, from: string, to: string): Design {
  if (from === to) return d;
  if (d.belts.some((b) => b.from === from && b.to === to)) return d;
  return { ...d, belts: [...d.belts, { id: newId(), from, to }] };
}

export function deleteBelt(d: Design, id: string): Design {
  return { ...d, belts: d.belts.filter((b) => b.id !== id) };
}

export function setBeltLabel(d: Design, id: string, label: string): Design {
  return {
    ...d,
    belts: d.belts.map((b) =>
      b.id === id ? { ...b, label: label.trim() || undefined } : b,
    ),
  };
}
