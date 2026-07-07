// Freeform factory designer page (#/designer): place machines from the palette on a blank
// foundation grid, multi-select and group them, name/color groups, and draw belts between
// groups flow-diagram style. Unlike the solver-driven Layout view this is a sketchpad —
// nothing here feeds back into the plan. Designs persist locally (designer/store.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { routeBelts } from "../designer/belts";
import {
  addBelt, addMachine, addZone, deleteBelt, deleteMachines, deleteZone, duplicateMachines,
  foundationUsage, groupMachines, machineBox, moveMachines, moveZone, recolorMachines,
  recolorZone, renameGroup, rotateMachines, setBeltLabel, setZoneBox, ungroupMachines,
} from "../designer/ops";
import { emptyDesign, loadDesigns, saveDesigns, type DesignerData } from "../designer/store";
import type { Design } from "../designer/types";
import { BUILDINGS } from "../data/recipes";
import { nextRot, type Box } from "../layout/geometry";
import type { Rot } from "../layout/types";
import { DesignerCanvas, type KeyAction, type Mode } from "./DesignerCanvas";

const COLORS = [
  "#f7a23b", "#6db3f2", "#5ed39e", "#ef6f6f", "#c08af0", "#f2d06b",
  "#6be0d2", "#f28ac2", "#a3e06b", "#8a93f2", "#e0986b", "#9aa7b8",
];

const PALETTE = Object.values(BUILDINGS).sort(
  (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
);

const HINTS: Record<Mode, string> = {
  select:
    "Click to select · Shift+click to add · Shift+drag to box-select · drag empty floor to pan · wheel to zoom · R rotate · Ctrl+D duplicate · Del delete",
  place: "Click to place (repeats) · R rotate · Esc or right-click to stop",
  belt: "Click the source group, then the destination group · Esc to stop",
  zone: "Drag empty floor to draw a foundation slab (snaps to 8m) · click a slab to select, drag to move, drag an edge or corner to resize · swatches recolor · Del delete · Esc to stop",
};

export function DesignerView() {
  const [data, setData] = useState<DesignerData>(loadDesigns);
  useEffect(() => saveDesigns(data), [data]);
  const design = data.designs.find((d) => d.id === data.activeId) ?? data.designs[0];

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectedBelt, setSelectedBelt] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [placing, setPlacing] = useState<{ building: string; rotation: Rot } | null>(null);
  const [beltFrom, setBeltFrom] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  // Live drag override so machines/groups/belts follow the pointer; committed on pointer-up.
  // Ref mirror: pointermove updates are continuous-priority, so pointer-up in the same
  // frame could otherwise commit a stale delta.
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragLive = useRef<typeof drag>(null);
  // Same live/ref pair for dragging the selected foundation zone.
  const [zoneDrag, setZoneDrag] = useState<{ dx: number; dy: number } | null>(null);
  const zoneDragLive = useRef<typeof zoneDrag>(null);
  // And for resizing it by an edge/corner handle (full replacement box).
  const [zoneResize, setZoneResize] = useState<Box | null>(null);
  const zoneResizeLive = useRef<typeof zoneResize>(null);

  /** Replace the active design (precomputed — keeps setState updaters pure). */
  function commit(next: Design) {
    setData((prev) => ({
      ...prev,
      designs: prev.designs.map((d) => (d.id === prev.activeId ? next : d)),
    }));
  }

  const effective = useMemo(() => {
    let d = drag ? moveMachines(design, selection, drag.dx, drag.dy) : design;
    if (zoneDrag && selectedZone) d = moveZone(d, selectedZone, zoneDrag.dx, zoneDrag.dy);
    if (zoneResize && selectedZone) d = setZoneBox(d, selectedZone, zoneResize);
    return d;
  }, [design, selection, drag, zoneDrag, zoneResize, selectedZone]);
  const belts = useMemo(() => routeBelts(effective), [effective]);
  const usage = useMemo(() => foundationUsage(design), [design]);

  /** The one group covering every selected machine, if the selection is that homogeneous. */
  const selGroupId = useMemo(() => {
    if (selection.size === 0) return null;
    let gid: string | null | undefined;
    for (const m of design.machines) {
      if (!selection.has(m.id)) continue;
      const g = m.groupId ?? null;
      if (gid === undefined) gid = g;
      else if (gid !== g) return null;
    }
    return gid ?? null;
  }, [design, selection]);
  const selGroup = selGroupId ? design.groups.find((g) => g.id === selGroupId) : undefined;
  const selBelt = selectedBelt ? design.belts.find((b) => b.id === selectedBelt) : undefined;
  const canUngroup = design.machines.some((m) => selection.has(m.id) && m.groupId);

  function resetInteraction() {
    setSelection(new Set());
    setSelectedBelt(null);
    setSelectedZone(null);
    setBeltFrom(null);
    setMode("select");
    setPlacing(null);
    setDrag(null);
    dragLive.current = null;
    setZoneDrag(null);
    zoneDragLive.current = null;
    setZoneResize(null);
    zoneResizeLive.current = null;
  }

  function pickBuilding(name: string) {
    if (placing?.building === name) {
      setMode("select");
      setPlacing(null);
      return;
    }
    setMode("place");
    setPlacing({ building: name, rotation: placing?.rotation ?? 0 });
    setSelection(new Set());
    setSelectedBelt(null);
    setSelectedZone(null);
    setBeltFrom(null);
  }

  function toggleBeltMode() {
    if (mode === "belt") {
      setMode("select");
      setBeltFrom(null);
      return;
    }
    setMode("belt");
    setPlacing(null);
    setSelection(new Set());
    setSelectedBelt(null);
    setSelectedZone(null);
  }

  function toggleZoneMode() {
    if (mode === "zone") {
      setMode("select");
      setSelectedZone(null);
      return;
    }
    setMode("zone");
    setPlacing(null);
    setBeltFrom(null);
    setSelection(new Set());
    setSelectedBelt(null);
  }

  function selectMachine(id: string, shift: boolean) {
    const m = design.machines.find((x) => x.id === id);
    if (!m) return;
    const member = m.groupId
      ? design.machines.filter((x) => x.groupId === m.groupId).map((x) => x.id)
      : [id];
    setSelection((prev) => {
      if (!shift) return prev.has(id) ? prev : new Set(member);
      const next = new Set(prev);
      const allIn = member.every((x) => next.has(x));
      for (const x of member) {
        if (allIn) next.delete(x);
        else next.add(x);
      }
      return next;
    });
    setSelectedBelt(null);
    setSelectedZone(null);
  }

  function marqueeSelect(box: Box) {
    const hit = new Set<string>();
    const hitGroups = new Set<string>();
    for (const m of design.machines) {
      const b = machineBox(m);
      if (b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y) {
        hit.add(m.id);
        if (m.groupId) hitGroups.add(m.groupId);
      }
    }
    // Groups move as a unit, so a marquee that touches one pulls in the whole group.
    for (const m of design.machines) if (m.groupId && hitGroups.has(m.groupId)) hit.add(m.id);
    setSelection(hit);
    setSelectedBelt(null);
    setSelectedZone(null);
  }

  function handleClear() {
    if (mode === "belt") {
      setBeltFrom(null);
      return;
    }
    setSelection(new Set());
    setSelectedBelt(null);
    setSelectedZone(null);
  }

  function handlePlace(x: number, y: number) {
    if (!placing) return;
    const { design: next, id } = addMachine(design, placing.building, x, y, placing.rotation, color);
    commit(next);
    setSelection(new Set([id]));
  }

  function handleGroupClick(gid: string) {
    if (!beltFrom) {
      setBeltFrom(gid);
      return;
    }
    if (gid !== beltFrom) commit(addBelt(design, beltFrom, gid));
    setBeltFrom(null);
  }

  function duplicateSel() {
    if (selection.size === 0) return;
    const { design: next, newIds } = duplicateMachines(design, selection);
    commit(next);
    setSelection(newIds);
  }

  function handleKey(action: KeyAction) {
    if (action === "rotate") {
      if (mode === "place" && placing) setPlacing({ ...placing, rotation: nextRot(placing.rotation) });
      else if (selection.size > 0) commit(rotateMachines(design, selection));
    } else if (action === "delete") {
      if (selectedZone) {
        commit(deleteZone(design, selectedZone));
        setSelectedZone(null);
      } else if (selectedBelt) {
        commit(deleteBelt(design, selectedBelt));
        setSelectedBelt(null);
      } else if (selection.size > 0) {
        commit(deleteMachines(design, selection));
        setSelection(new Set());
      }
    } else if (action === "duplicate") {
      duplicateSel();
    } else if (mode === "place") {
      setMode("select");
      setPlacing(null);
    } else if (beltFrom) {
      setBeltFrom(null);
    } else if (mode === "belt") {
      setMode("select");
    } else if (mode === "zone") {
      setMode("select");
      setSelectedZone(null);
    } else {
      setSelection(new Set());
      setSelectedBelt(null);
    }
  }

  function applyColor(c: string) {
    setColor(c);
    if (selection.size > 0) commit(recolorMachines(design, selection, c));
    else if (selectedZone) commit(recolorZone(design, selectedZone, c));
  }

  // ---- design management ----

  function switchDesign(id: string) {
    setData((prev) => ({ ...prev, activeId: id }));
    resetInteraction();
  }

  function createDesign() {
    const d = emptyDesign(`Design ${data.designs.length + 1}`);
    setData((prev) => ({ designs: [...prev.designs, d], activeId: d.id }));
    resetInteraction();
  }

  function deleteDesign() {
    if (!window.confirm(`Delete "${design.name}"? This can't be undone.`)) return;
    setData((prev) => {
      const rest = prev.designs.filter((d) => d.id !== prev.activeId);
      if (rest.length === 0) {
        const d = emptyDesign("Design 1");
        return { designs: [d], activeId: d.id };
      }
      return { designs: rest, activeId: rest[0].id };
    });
    resetInteraction();
  }

  return (
    <div className="app designer-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⌗</span>
          <div>
            <h1>Factory Designer</h1>
            <p className="brand-sub">Freeform floor plans · 1 square = 8m foundation</p>
          </div>
        </div>
        <div className="designer-head-right">
          <select
            className="designer-select"
            value={design.id}
            onChange={(e) => switchDesign(e.target.value)}
            aria-label="Active design"
          >
            {data.designs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input
            className="designer-name-input"
            value={design.name}
            onChange={(e) => commit({ ...design, name: e.target.value })}
            aria-label="Design name"
          />
          <button onClick={createDesign}>+ New</button>
          <button className="layout-reset" onClick={deleteDesign}>Delete</button>
          <a className="balancer-back" href="#/">← Factory planner</a>
        </div>
      </header>

      <div className="designer-body">
        <aside className="designer-palette">
          <h3>Machines</h3>
          {PALETTE.map((b) => (
            <button
              key={b.name}
              className={"palette-item" + (placing?.building === b.name ? " active" : "")}
              onClick={() => pickBuilding(b.name)}
            >
              <span className="palette-name">{b.name}</span>
              <span className="palette-meta">
                {b.footprintM[0]}×{b.footprintM[1]}m · {b.powerMw} MW
              </span>
            </button>
          ))}
        </aside>

        <div className="designer-main">
          <div className="layout-toolbar designer-toolbar">
            <button
              className={mode === "belt" ? "mode-active" : ""}
              onClick={toggleBeltMode}
            >
              ⇢ Belt
            </button>
            <button
              className={mode === "zone" ? "mode-active" : ""}
              onClick={toggleZoneMode}
              title="Draw available foundation space"
            >
              ▦ Foundation
            </button>
            <span className="toolbar-gap" />
            <button disabled={selection.size === 0 && mode !== "place"} onClick={() => handleKey("rotate")}>
              ⟳ Rotate
            </button>
            <button disabled={selection.size === 0} onClick={duplicateSel}>⧉ Duplicate</button>
            <button
              disabled={selection.size === 0 || (selGroupId !== null && selGroup !== undefined)}
              onClick={() => {
                const { design: next } = groupMachines(design, selection, `Group ${design.groups.length + 1}`);
                commit(next);
              }}
            >
              ▣ Group
            </button>
            <button disabled={!canUngroup} onClick={() => commit(ungroupMachines(design, selection))}>
              Ungroup
            </button>
            <button
              disabled={selection.size === 0 && !selectedBelt && !selectedZone}
              onClick={() => handleKey("delete")}
            >
              ✕ Delete
            </button>
            <span className="toolbar-gap" />
            <span className="designer-swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={"swatch" + (c === color ? " current" : "")}
                  style={{ background: c }}
                  title={c}
                  onClick={() => applyColor(c)}
                />
              ))}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#f7a23b"}
                onChange={(e) => applyColor(e.target.value)}
                title="Custom color"
              />
            </span>
            {selGroup && (
              <label className="designer-rename">
                Group name
                <input
                  value={selGroup.name}
                  onChange={(e) => commit(renameGroup(design, selGroup.id, e.target.value))}
                />
              </label>
            )}
            {selBelt && (
              <label className="designer-rename">
                Belt label
                <input
                  placeholder="e.g. Iron Plate 120/min"
                  value={selBelt.label ?? ""}
                  onChange={(e) => commit(setBeltLabel(design, selBelt.id, e.target.value))}
                />
              </label>
            )}
          </div>

          <p className="designer-hint">
            {beltFrom ? "Now click the destination group" : HINTS[mode]}
          </p>

          <DesignerCanvas
            key={design.id}
            design={effective}
            belts={belts}
            mode={mode}
            placing={placing ? { ...placing, color } : null}
            selection={selection}
            selectedBelt={selectedBelt}
            selectedZone={selectedZone}
            beltFrom={beltFrom}
            onSelectMachine={selectMachine}
            onSelectBelt={(id) => {
              setSelectedBelt(id);
              setSelection(new Set());
              setSelectedZone(null);
            }}
            onSelectZone={(id) => {
              setSelectedZone(id);
              setSelection(new Set());
              setSelectedBelt(null);
            }}
            onClear={handleClear}
            onMarquee={marqueeSelect}
            onDragBy={(dx, dy) => {
              dragLive.current = { dx, dy };
              setDrag(dragLive.current);
            }}
            onDragEnd={() => {
              const d = dragLive.current;
              if (d) commit(moveMachines(design, selection, d.dx, d.dy));
              dragLive.current = null;
              setDrag(null);
            }}
            onZoneDraw={(box) => {
              const { design: next, id } = addZone(design, box);
              commit(next);
              setSelectedZone(id);
            }}
            onZoneDragBy={(dx, dy) => {
              zoneDragLive.current = { dx, dy };
              setZoneDrag(zoneDragLive.current);
            }}
            onZoneDragEnd={() => {
              const d = zoneDragLive.current;
              if (d && selectedZone) commit(moveZone(design, selectedZone, d.dx, d.dy));
              zoneDragLive.current = null;
              setZoneDrag(null);
            }}
            onZoneResize={(box) => {
              zoneResizeLive.current = box;
              setZoneResize(box);
            }}
            onZoneResizeEnd={() => {
              const box = zoneResizeLive.current;
              if (box && selectedZone) commit(setZoneBox(design, selectedZone, box));
              zoneResizeLive.current = null;
              setZoneResize(null);
            }}
            onPlace={handlePlace}
            onGroupClick={handleGroupClick}
            onKey={handleKey}
          />

          <p className="designer-stats">
            {design.machines.length} machines · {design.groups.length} groups · {design.belts.length} belts
            {usage.total > 0 && (
              <> · <span className="designer-usage">{usage.used}/{usage.total} foundations used</span></>
            )}
            {design.machines.length === 0 && " — pick a machine from the palette to start"}
          </p>
        </div>
      </div>
    </div>
  );
}
