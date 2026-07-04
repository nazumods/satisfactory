// SVG canvas for the Designer view. Same world model as LayoutCanvas (1 SVG unit = 1m,
// 8m foundation pattern, wheel zoom + drag pan, 1m snapping) but gesture handling is
// mode-aware: select (click/drag/marquee), place (ghost follows cursor, click drops a
// machine), belt (click source group, then destination). This component owns only the
// viewBox and in-progress gesture bookkeeping; all edits are reported up as intents.

import { useEffect, useRef, useState } from "react";
import { BUILDINGS } from "../data/recipes";
import { unionBounds, type Box } from "../layout/geometry";
import type { Rot } from "../layout/types";
import type { BeltPath } from "../designer/belts";
import { groupBoundsOf, machineBox } from "../designer/ops";
import type { Design } from "../designer/types";

export type Mode = "select" | "place" | "belt";
export type KeyAction = "rotate" | "delete" | "duplicate" | "escape";

interface Props {
  design: Design;
  belts: BeltPath[];
  mode: Mode;
  placing: { building: string; rotation: Rot; color: string } | null;
  selection: Set<string>;
  selectedBelt: string | null;
  beltFrom: string | null;
  onSelectMachine: (id: string, shift: boolean) => void;
  onSelectBelt: (id: string) => void;
  /** Backdrop click — clears selection / cancels the pending belt source. */
  onClear: () => void;
  onMarquee: (box: Box) => void;
  /** Live snapped move of the current selection (total delta from drag start). */
  onDragBy: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  /** Place the pending machine with its snapped top-left at (x, y). */
  onPlace: (x: number, y: number) => void;
  onGroupClick: (groupId: string) => void;
  onKey: (action: KeyAction) => void;
}

const SHORT_NAME: Record<string, string> = {
  "Particle Accelerator": "P. Accel.",
  "Quantum Encoder": "Q. Encoder",
};

/** Flow direction of a machine's outputs (unrotated = down the footprint length). */
function flowDir(rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [0, 1];
    case 90: return [-1, 0];
    case 180: return [0, -1];
    case 270: return [1, 0];
  }
}

/** Chevron marking a machine's output edge. */
function dirMarker(b: Box, rot: Rot): string {
  const [dx, dy] = flowDir(rot);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const ext = dx !== 0 ? b.w / 2 : b.h / 2;
  const tx = cx + dx * ext, ty = cy + dy * ext;
  const px = -dy, py = dx;
  return `${tx},${ty} ${tx - 1.4 * dx + 0.9 * px},${ty - 1.4 * dy + 0.9 * py} ${tx - 1.4 * dx - 0.9 * px},${ty - 1.4 * dy - 0.9 * py}`;
}

/** Arrowhead polygon points for the last segment of a polyline. */
function arrowHead(points: Array<[number, number]>): string {
  const [x1, y1] = points[points.length - 2];
  const [x2, y2] = points[points.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const px = -uy, py = ux;
  return `${x2},${y2} ${x2 - 1.6 * ux + 0.9 * px},${y2 - 1.6 * uy + 0.9 * py} ${x2 - 1.6 * ux - 0.9 * px},${y2 - 1.6 * uy - 0.9 * py}`;
}

const FIT_MARGIN = 18;

function fitView(design: Design): Box {
  const b = unionBounds(design.machines.map(machineBox));
  if (b.w === 0 && b.h === 0) return { x: -24, y: -16, w: 176, h: 120 };
  return {
    x: b.x - FIT_MARGIN,
    y: b.y - FIT_MARGIN,
    w: Math.max(b.w + 2 * FIT_MARGIN, 40),
    h: Math.max(b.h + 2 * FIT_MARGIN, 40),
  };
}

export function DesignerCanvas({
  design, belts, mode, placing, selection, selectedBelt, beltFrom,
  onSelectMachine, onSelectBelt, onClear, onMarquee, onDragBy, onDragEnd,
  onPlace, onGroupClick, onKey,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Box>(() => fitView(design));
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const dragRef = useRef<{ start: { x: number; y: number }; moved: boolean } | null>(null);
  const backRef = useRef<{ start: { x: number; y: number }; kind: "pan" | "marquee"; moved: boolean } | null>(null);

  function toWorld(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // Wheel zoom about the cursor. Native listener — React's synthetic onWheel is passive.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      setView((v) => {
        const f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        const w = Math.min(Math.max(v.w * f, 24), 4000);
        const scale = w / v.w;
        return { x: p.x - (p.x - v.x) * scale, y: p.y - (p.y - v.y) * scale, w, h: v.h * scale };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  /** Snapped ghost top-left so the pending footprint is centered on the cursor. */
  function ghostBox(): Box | null {
    if (!placing || !ghost) return null;
    const [bw, bl] = BUILDINGS[placing.building].footprintM;
    const w = placing.rotation % 180 === 0 ? bw : bl;
    const h = placing.rotation % 180 === 0 ? bl : bw;
    return { x: Math.round(ghost.x - w / 2), y: Math.round(ghost.y - h / 2), w, h };
  }

  function machineDown(e: React.PointerEvent, id: string, groupId?: string) {
    if (mode === "place") return;
    e.stopPropagation();
    if (mode === "belt") {
      if (groupId) onGroupClick(groupId);
      return;
    }
    const pt = toWorld(e);
    if (!pt) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    dragRef.current = { start: pt, moved: false };
    onSelectMachine(id, e.shiftKey);
  }

  function machineMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const pt = toWorld(e);
    if (!pt) return;
    const dx = Math.round(pt.x - d.start.x);
    const dy = Math.round(pt.y - d.start.y);
    if (!d.moved && dx === 0 && dy === 0) return;
    d.moved = true;
    onDragBy(dx, dy);
  }

  function machineUp() {
    if (!dragRef.current) return;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    if (moved) onDragEnd();
  }

  function backdropDown(e: React.PointerEvent) {
    const pt = toWorld(e);
    if (!pt) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const kind = mode === "select" && e.shiftKey ? "marquee" : "pan";
    backRef.current = { start: pt, kind, moved: false };
  }

  function backdropMove(e: React.PointerEvent) {
    const b = backRef.current;
    const pt = toWorld(e);
    if (!pt) {
      return;
    }
    if (b) {
      if (Math.abs(pt.x - b.start.x) > 0.3 || Math.abs(pt.y - b.start.y) > 0.3) b.moved = true;
      if (b.kind === "pan") {
        if (b.moved) setView((v) => ({ ...v, x: v.x + (b.start.x - pt.x), y: v.y + (b.start.y - pt.y) }));
      } else {
        setMarquee({
          x: Math.min(b.start.x, pt.x),
          y: Math.min(b.start.y, pt.y),
          w: Math.abs(pt.x - b.start.x),
          h: Math.abs(pt.y - b.start.y),
        });
      }
    }
  }

  function backdropUp() {
    const b = backRef.current;
    backRef.current = null;
    if (!b) return;
    if (b.kind === "marquee") {
      if (marquee) onMarquee(marquee);
      setMarquee(null);
      return;
    }
    if (!b.moved) {
      // Plain click on empty floor: place in place mode, otherwise clear/cancel.
      const gb = ghostBox();
      if (mode === "place" && gb) onPlace(gb.x, gb.y);
      else onClear();
    }
  }

  const gb = ghostBox();
  const groupColor: Record<string, string> = {};
  for (const m of design.machines) {
    if (m.groupId && !(m.groupId in groupColor)) groupColor[m.groupId] = m.color;
  }

  return (
    <div className="layout-canvas-wrap">
      <svg
        ref={svgRef}
        className="layout-canvas designer-canvas"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        tabIndex={0}
        data-mode={mode}
        onPointerMove={(e) => {
          if (mode !== "place") return;
          const pt = toWorld(e);
          if (pt) setGhost(pt);
        }}
        onPointerLeave={() => setGhost(null)}
        onContextMenu={(e) => {
          if (mode !== "select") {
            e.preventDefault();
            onKey("escape");
          }
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
            e.preventDefault();
            onKey("duplicate");
          } else if (e.key === "r" || e.key === "R") onKey("rotate");
          else if (e.key === "Delete" || e.key === "Backspace") onKey("delete");
          else if (e.key === "Escape") onKey("escape");
        }}
      >
        <defs>
          <pattern id="designer-grid" width={8} height={8} patternUnits="userSpaceOnUse">
            <path d="M8 0H0V8" fill="none" className="foundation-line" />
          </pattern>
        </defs>
        <rect
          x={view.x} y={view.y} width={view.w} height={view.h}
          fill="url(#designer-grid)"
          className="layout-backdrop"
          onPointerDown={backdropDown}
          onPointerMove={backdropMove}
          onPointerUp={backdropUp}
        />

        {belts.map((b) => {
          const sel = b.id === selectedBelt;
          const pts = b.points.map((p) => p.join(",")).join(" ");
          return (
            <g key={b.id} className={"designer-belt" + (sel ? " selected" : "")}>
              <polyline points={pts} fill="none" className="designer-belt-line" />
              <polygon points={arrowHead(b.points)} className="designer-belt-head" />
              {b.label && (
                <text x={b.anchor[0]} y={b.anchor[1] - 0.9} fontSize={2.2} textAnchor="middle">
                  {b.label}
                </text>
              )}
              {mode === "select" && (
                <polyline
                  points={pts}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={3}
                  className="designer-belt-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectBelt(b.id);
                  }}
                />
              )}
            </g>
          );
        })}

        {design.groups.map((g) => {
          const b = groupBoundsOf(design, g.id);
          if (b.w === 0 && b.h === 0) return null;
          const color = groupColor[g.id] ?? "var(--muted)";
          const active = beltFrom === g.id;
          return (
            <g
              key={g.id}
              className={"designer-group" + (active ? " belt-from" : "")}
              style={{ pointerEvents: mode === "belt" ? undefined : "none" }}
              onPointerDown={(e) => {
                if (mode !== "belt") return;
                e.stopPropagation();
                onGroupClick(g.id);
              }}
            >
              <rect
                x={b.x - 1} y={b.y - 1} width={b.w + 2} height={b.h + 2} rx={0.8}
                fill={mode === "belt" ? color : "transparent"}
                fillOpacity={mode === "belt" ? 0.06 : 0}
                stroke={color}
                strokeWidth={active ? 0.8 : 0.35}
                strokeDasharray="2 1.5"
              />
              <text x={b.x - 1} y={b.y - 2.2} fontSize={2.8} fill={color}>{g.name}</text>
            </g>
          );
        })}

        <g style={{ pointerEvents: mode === "place" ? "none" : undefined }}>
          {design.machines.map((m) => {
            const b = machineBox(m);
            const sel = selection.has(m.id);
            const name = SHORT_NAME[m.building] ?? m.building;
            const fontSize = Math.min(0.32 * b.h, (0.92 * b.w) / (0.62 * name.length), 2.4);
            return (
              <g
                key={m.id}
                className={"designer-machine" + (sel ? " selected" : "")}
                onPointerDown={(e) => machineDown(e, m.id, m.groupId)}
                onPointerMove={machineMove}
                onPointerUp={machineUp}
              >
                <title>{`${m.building} · ${b.w}×${b.h}m`}</title>
                <rect
                  x={b.x} y={b.y} width={b.w} height={b.h} rx={0.6}
                  fill={m.color} fillOpacity={sel ? 0.45 : 0.22}
                  stroke={m.color} strokeWidth={sel ? 0.6 : 0.28}
                />
                <polygon points={dirMarker(b, m.rotation)} fill={m.color} fillOpacity={0.75} />
                {fontSize >= 1 && (
                  <text
                    x={b.x + b.w / 2} y={b.y + b.h / 2}
                    fontSize={fontSize} textAnchor="middle" dominantBaseline="central"
                    fill={m.color} className="designer-machine-label"
                  >
                    {name}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {gb && placing && (
          <g className="designer-ghost">
            <rect
              x={gb.x} y={gb.y} width={gb.w} height={gb.h} rx={0.6}
              fill={placing.color} fillOpacity={0.18}
              stroke={placing.color} strokeWidth={0.4} strokeDasharray="1.6 1"
            />
            <polygon points={dirMarker(gb, placing.rotation)} fill={placing.color} fillOpacity={0.6} />
          </g>
        )}

        {marquee && (
          <rect
            x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
            className="designer-marquee"
          />
        )}
      </svg>
      <button
        className="layout-fit-btn"
        title="Fit view to design"
        onClick={() => setView(fitView(design))}
      >
        ⛶ Fit
      </button>
    </div>
  );
}
