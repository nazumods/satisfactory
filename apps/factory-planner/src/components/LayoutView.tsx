// Layout view for one factory: derives part groups from the attributed factory, reconciles
// them with the saved layout (pure useMemo — persisted state only changes on user
// gestures), routes belt edges, and hosts the toolbar + canvas.

import { useMemo, useRef, useState } from "react";
import { partColor } from "../layout/colors";
import { groupSlot, nextRot } from "../layout/geometry";
import { derivePartSpecs } from "../layout/parts";
import { reconcile } from "../layout/reconcile";
import { routeEdges } from "../layout/routing";
import type { FactoryLayout, GroupLayout } from "../layout/types";
import type { AttrFactory } from "../solver/attribution";
import type { Multipliers } from "../solver/solver";
import { LayoutCanvas, type Sel } from "./LayoutCanvas";
import { fmt } from "../ui/format";

interface Props {
  factory: AttrFactory;
  multipliers: Multipliers;
  saved?: FactoryLayout;
  /** null resets the factory to pure auto-layout (drops saved edits). */
  onChange: (fl: FactoryLayout | null) => void;
}

function cloneLayout(fl: FactoryLayout): FactoryLayout {
  const groups: Record<string, GroupLayout> = {};
  for (const [item, g] of Object.entries(fl.groups)) {
    groups[item] = { ...g, ungrouped: g.ungrouped?.map((m) => ({ ...m })) };
  }
  return { groups };
}

export function LayoutView({ factory, multipliers, saved, onChange }: Props) {
  const specs = useMemo(() => derivePartSpecs(factory), [factory]);
  const layout = useMemo(() => reconcile(saved, specs), [saved, specs]);
  const [sel, setSel] = useState<Sel>(null);
  // Live drag override so belts and boxes follow the pointer; committed on pointer-up.
  // Mirrored in a ref: pointermove state updates are continuous-priority, so a pointer-up
  // in the same frame could otherwise see a stale value and drop the commit.
  const [drag, setDrag] = useState<{ sel: NonNullable<Sel>; x: number; y: number } | null>(null);
  const dragLive = useRef<typeof drag>(null);

  const effective = useMemo(() => {
    if (!drag) return layout;
    return applyMove(layout, drag.sel, drag.x, drag.y);
  }, [layout, drag]);

  const edges = useMemo(
    () => routeEdges(specs, effective, multipliers),
    [specs, effective, multipliers],
  );

  const selGroup = sel ? layout.groups[sel.item] : undefined;
  const selSpec = sel ? specs.find((s) => s.item === sel.item) : undefined;
  const exploded = !!selGroup?.ungrouped;

  function rotateSel() {
    if (!sel || !selGroup) return;
    const next = cloneLayout(layout);
    const g = next.groups[sel.item];
    if (sel.index !== undefined && g.ungrouped) {
      const m = g.ungrouped[sel.index];
      if (m) m.rotation = nextRot(m.rotation);
    } else if (!g.ungrouped) {
      g.rotation = nextRot(g.rotation);
    }
    onChange(next);
  }

  function toggleRows() {
    if (!sel || !selGroup || exploded) return;
    const next = cloneLayout(layout);
    next.groups[sel.item].rows = selGroup.rows === 1 ? 2 : 1;
    onChange(next);
  }

  function toggleUngroup() {
    if (!sel || !selGroup || !selSpec) return;
    const next = cloneLayout(layout);
    const g = next.groups[sel.item];
    if (g.ungrouped) {
      // Regroup: machines snap back to the group grid.
      delete g.ungrouped;
    } else {
      g.ungrouped = Array.from({ length: selSpec.count }, (_, i) => {
        const slot = groupSlot(selSpec, g, i);
        return { x: slot.x, y: slot.y, rotation: g.rotation };
      });
    }
    setSel({ item: sel.item });
    onChange(next);
  }

  function resetLayout() {
    setSel(null);
    onChange(null);
  }

  function handleDragMove(s: NonNullable<Sel>, x: number, y: number) {
    dragLive.current = { sel: s, x, y };
    setDrag(dragLive.current);
  }

  function handleDragEnd() {
    const d = dragLive.current;
    if (d) onChange(applyMove(layout, d.sel, d.x, d.y));
    dragLive.current = null;
    setDrag(null);
  }

  const totalMachines = specs.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="layout-view">
      <div className="detail-head">
        <h2>{factory.name}</h2>
        <div className="detail-stats">
          <b>{fmt(totalMachines, 0)}</b> machines · {specs.length} parts · 1 square = 8m
          foundation · drag to move, R to rotate
        </div>
      </div>

      <div className="layout-toolbar">
        <span className="layout-sel-label">
          {sel ? (sel.index !== undefined ? `${sel.item} #${sel.index + 1}` : sel.item) : "Nothing selected"}
        </span>
        <button disabled={!sel} onClick={rotateSel}>⟳ Rotate</button>
        <button disabled={!sel || exploded || (selSpec?.count ?? 0) < 2} onClick={toggleRows}>
          {selGroup?.rows === 2 ? "1 row" : "2 rows"}
        </button>
        <button disabled={!sel || (selSpec?.count ?? 0) < 2} onClick={toggleUngroup}>
          {exploded ? "Regroup" : "Ungroup"}
        </button>
        <button className="layout-reset" onClick={resetLayout}>Reset layout</button>
      </div>

      {specs.length === 0 ? (
        <p className="empty">No machines to lay out in this factory.</p>
      ) : (
        <LayoutCanvas
          key={factory.name}
          specs={specs}
          layout={effective}
          edges={edges}
          selected={sel}
          onSelect={setSel}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onRotate={rotateSel}
        />
      )}

      <div className="layout-legend">
        {specs.map((s) => (
          <button
            key={s.item}
            className={"legend-item" + (sel?.item === s.item ? " active" : "")}
            onClick={() => setSel({ item: s.item })}
            title={`${s.count}× ${s.recipe.building} · ${fmt(s.ratePerMin)}/min`}
          >
            <span className="legend-swatch" style={{ background: partColor(s.item) }} />
            {s.item} ×{s.count}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reposition a group (or one exploded machine) at snapped meter coords. */
function applyMove(fl: FactoryLayout, sel: NonNullable<Sel>, x: number, y: number): FactoryLayout {
  const g = fl.groups[sel.item];
  if (!g) return fl;
  const next = cloneLayout(fl);
  const ng = next.groups[sel.item];
  if (sel.index !== undefined && ng.ungrouped) {
    const m = ng.ungrouped[sel.index];
    if (m) { m.x = x; m.y = y; }
  } else {
    ng.x = x;
    ng.y = y;
  }
  return next;
}
