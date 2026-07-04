// SVG canvas for the Layout view. World units are meters (1 SVG unit = 1m); the 8m
// foundation grid is a user-space pattern so it stays aligned under pan/zoom. Pointer
// gestures report snapped meter positions up to LayoutView; this component owns only the
// viewBox (pan/zoom) and in-progress drag bookkeeping.

import { useEffect, useRef, useState } from "react";
import { partColor } from "../layout/colors";
import { groupBounds, machineBoxes, unionBounds, type Box } from "../layout/geometry";
import type { PartSpec } from "../layout/parts";
import type { LayoutEdge } from "../layout/routing";
import type { FactoryLayout } from "../layout/types";
import { fmt } from "../ui/format";

export type Sel = { item: string; index?: number } | null;

interface Props {
  specs: PartSpec[];
  layout: FactoryLayout;
  edges: LayoutEdge[];
  selected: Sel;
  onSelect: (s: Sel) => void;
  /** Live (pointer-move) reposition of the selected group/machine, snapped to 1m. */
  onDragMove: (s: NonNullable<Sel>, x: number, y: number) => void;
  /** Commit the in-progress drag (pointer-up). */
  onDragEnd: () => void;
  onRotate: () => void;
}

const FIT_MARGIN = 18;

function fitView(specs: PartSpec[], layout: FactoryLayout): Box {
  const boxes: Box[] = [];
  for (const s of specs) {
    const g = layout.groups[s.item];
    if (g) boxes.push(groupBounds(s, g));
  }
  const b = unionBounds(boxes);
  return {
    x: b.x - FIT_MARGIN,
    y: b.y - FIT_MARGIN,
    w: Math.max(b.w + 2 * FIT_MARGIN, 40),
    h: Math.max(b.h + 2 * FIT_MARGIN, 40),
  };
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

export function LayoutCanvas({
  specs, layout, edges, selected, onSelect, onDragMove, onDragEnd, onRotate,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Box>(() => fitView(specs, layout));
  const dragRef = useRef<{ sel: NonNullable<Sel>; start: { x: number; y: number }; orig: { x: number; y: number }; moved: boolean } | null>(null);
  const panRef = useRef<{ start: { x: number; y: number } } | null>(null);

  /** Client → world (meter) coordinates via the live screen CTM. */
  function toWorld(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // Wheel zoom about the cursor. Native listener — React's synthetic onWheel is passive,
  // so preventDefault (needed to stop page scroll) wouldn't work there.
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

  function startDrag(e: React.PointerEvent, sel: NonNullable<Sel>, orig: { x: number; y: number }) {
    e.stopPropagation();
    const pt = toWorld(e);
    if (!pt) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    dragRef.current = { sel, start: pt, orig, moved: false };
    onSelect(sel);
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const pt = toWorld(e);
    if (!pt) return;
    const dx = Math.round(pt.x - d.start.x);
    const dy = Math.round(pt.y - d.start.y);
    if (!d.moved && dx === 0 && dy === 0) return;
    d.moved = true;
    onDragMove(d.sel, d.orig.x + dx, d.orig.y + dy);
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onDragEnd();
  }

  function startPan(e: React.PointerEvent) {
    const pt = toWorld(e);
    if (!pt) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    panRef.current = { start: pt };
    onSelect(null);
  }

  function movePan(e: React.PointerEvent) {
    const pan = panRef.current;
    if (!pan) return;
    const pt = toWorld(e);
    if (!pt) return;
    setView((v) => ({ ...v, x: v.x + (pan.start.x - pt.x), y: v.y + (pan.start.y - pt.y) }));
  }

  return (
    <div className="layout-canvas-wrap">
      <svg
        ref={svgRef}
        className="layout-canvas"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "r" || e.key === "R") onRotate();
          if (e.key === "Escape") onSelect(null);
        }}
      >
        <defs>
          <pattern id="foundation-grid" width={8} height={8} patternUnits="userSpaceOnUse">
            <path d="M8 0H0V8" fill="none" className="foundation-line" />
          </pattern>
        </defs>
        {/* Backdrop: foundation grid + pan surface. Sized to the viewBox so it always fills. */}
        <rect
          x={view.x} y={view.y} width={view.w} height={view.h}
          fill="url(#foundation-grid)"
          className="layout-backdrop"
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={() => { panRef.current = null; }}
        />

        {edges.map((e) => (
          <g key={e.key} className="belt-edge">
            <polyline
              points={e.points.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={e.color}
              strokeWidth={0.5}
              strokeOpacity={0.75}
              strokeDasharray={e.from === undefined ? "2.4 1.4" : undefined}
            />
            <polygon points={arrowHead(e.points)} fill={e.color} fillOpacity={0.9} />
            <text x={e.label[0]} y={e.label[1] - 0.9} fontSize={2.2} textAnchor="middle" fill={e.color}>
              {e.item} · {fmt(e.rate)}/min
            </text>
          </g>
        ))}

        {specs.map((s) => {
          const g = layout.groups[s.item];
          if (!g) return null;
          const color = partColor(s.item);
          const boxes = machineBoxes(s, g);
          const b = groupBounds(s, g);
          const isSel = selected?.item === s.item;
          const label = `${s.item} · ${s.count}× ${s.recipe.building}${s.local ? " · on-site" : ""}`;

          if (g.ungrouped) {
            return (
              <g key={s.item}>
                {g.ungrouped.map((m, i) => {
                  const mb = boxes[i];
                  const mSel = isSel && selected?.index === i;
                  return (
                    <g
                      key={i}
                      className={"layout-machine" + (mSel ? " selected" : "")}
                      onPointerDown={(e) => startDrag(e, { item: s.item, index: i }, { x: m.x, y: m.y })}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                    >
                      <rect
                        x={mb.x} y={mb.y} width={mb.w} height={mb.h} rx={0.6}
                        fill={color} fillOpacity={mSel ? 0.45 : 0.22}
                        stroke={color} strokeWidth={mSel ? 0.6 : 0.25}
                      />
                    </g>
                  );
                })}
                <text x={b.x} y={b.y - 1.4} fontSize={2.8} fill={color}>{label} · ungrouped</text>
              </g>
            );
          }

          return (
            <g
              key={s.item}
              className={"layout-group" + (isSel ? " selected" : "")}
              onPointerDown={(e) => startDrag(e, { item: s.item }, { x: g.x, y: g.y })}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >
              {boxes.map((m, i) => (
                <rect
                  key={i}
                  x={m.x} y={m.y} width={m.w} height={m.h} rx={0.6}
                  fill={color} fillOpacity={0.22}
                  stroke={color} strokeWidth={0.25}
                />
              ))}
              <rect
                x={b.x} y={b.y} width={b.w} height={b.h}
                fill={isSel ? color : "transparent"} fillOpacity={isSel ? 0.08 : 0}
                stroke={color} strokeWidth={isSel ? 0.7 : 0.35}
                strokeDasharray={isSel ? undefined : "2 1.5"}
              />
              <text x={b.x} y={b.y - 1.4} fontSize={2.8} fill={color}>{label}</text>
            </g>
          );
        })}
      </svg>
      <button
        className="layout-fit-btn"
        title="Fit view to layout"
        onClick={() => setView(fitView(specs, layout))}
      >
        ⛶ Fit
      </button>
    </div>
  );
}
