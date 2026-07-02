// Lightweight localStorage persistence for the UI state. Best-effort: any failure
// (storage disabled, quota, corrupt JSON) silently falls back to defaults.

const SETUPS_KEY = "factory-planner:setups:v1";
const LEGACY_KEY = "factory-planner:state:v1"; // pre-multi-setup single-state key

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
  /** Fill leftover raw (rounded up to full belt/miner lines) with extra sinkable output. */
  optimize: boolean;
  /** raw item -> declared availability per minute (overrides Optimize's belt-line rounding). */
  rawCaps: Record<string, number>;
  /** Satisfactory Game Modes "Cost Multipliers" (Advanced Game Settings, 1.2+). */
  multipliers: { partsCost: number; power: number };
  /** Collapsed/expanded state of the Configuration and External supply panels. */
  configOpen: boolean;
  supplyOpen: boolean;
}

/** A named, independently-switchable saved configuration. */
export interface Setup {
  id: string;
  name: string;
  state: Partial<PersistedState>;
}

export interface SetupsData {
  setups: Setup[];
  activeId: string;
}

export function makeSetupId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function fallbackSetups(state: Partial<PersistedState> = {}): SetupsData {
  const setup: Setup = { id: makeSetupId(), name: "Default", state };
  return { setups: [setup], activeId: setup.id };
}

function isValidSetup(s: unknown): s is Setup {
  return (
    !!s && typeof s === "object" &&
    typeof (s as Setup).id === "string" &&
    typeof (s as Setup).name === "string" &&
    !!(s as Setup).state && typeof (s as Setup).state === "object"
  );
}

export function loadSetups(): SetupsData {
  try {
    const raw = localStorage.getItem(SETUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const valid: Setup[] = Array.isArray(parsed?.setups) ? parsed.setups.filter(isValidSetup) : [];
      if (valid.length > 0) {
        const activeId = valid.some((s) => s.id === parsed.activeId) ? parsed.activeId : valid[0].id;
        return { setups: valid, activeId };
      }
    }
  } catch {
    /* fall through to legacy / fallback */
  }

  // Migrate the single pre-multi-setup state (if any) into a "Default" setup.
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && typeof legacy === "object") return fallbackSetups(legacy);
    }
  } catch {
    /* fall through */
  }

  return fallbackSetups();
}

export function saveSetups(data: SetupsData): void {
  try {
    localStorage.setItem(SETUPS_KEY, JSON.stringify(data));
  } catch {
    /* ignore — storage unavailable or full */
  }
}
