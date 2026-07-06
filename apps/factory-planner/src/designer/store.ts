// localStorage persistence for the Designer view. Designs are independent of the planner
// setups (a floor plan isn't tied to a solve), so they live under their own key. Same
// best-effort policy as ui/persist.ts: any failure falls back to defaults.

import { validDesign, type Design } from "./types";

const KEY = "factory-planner:designer:v1";

export interface DesignerData {
  designs: Design[];
  activeId: string;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function emptyDesign(name: string): Design {
  return { id: newId(), name, machines: [], groups: [], belts: [], zones: [] };
}

function fallback(): DesignerData {
  const d = emptyDesign("Design 1");
  return { designs: [d], activeId: d.id };
}

export function loadDesigns(): DesignerData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { designs?: unknown; activeId?: unknown };
      const valid: Design[] = Array.isArray(parsed?.designs)
        ? parsed.designs.map(validDesign).filter((d): d is Design => d !== null)
        : [];
      if (valid.length > 0) {
        const activeId = valid.some((d) => d.id === parsed.activeId)
          ? (parsed.activeId as string)
          : valid[0].id;
        return { designs: valid, activeId };
      }
    }
  } catch {
    /* fall through to fallback */
  }
  return fallback();
}

export function saveDesigns(data: DesignerData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore — storage unavailable or full */
  }
}
