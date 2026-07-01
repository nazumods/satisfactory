// Lightweight localStorage persistence for the UI state. Best-effort: any failure
// (storage disabled, quota, corrupt JSON) silently falls back to defaults.

const KEY = "factory-planner:state:v1";

export interface PersistedState {
  tier: number;
  alts: string[];
  localItems: string[];
  selectedFactory: string;
  selectedOnly: boolean;
  /** item -> supply limit per minute; null = unlimited. */
  supplies: Record<string, number | null>;
  /** item -> target production rate per minute (overrides recipes.ts TARGETS). */
  targets: Record<string, number>;
}

export function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore — storage unavailable or full */
  }
}
