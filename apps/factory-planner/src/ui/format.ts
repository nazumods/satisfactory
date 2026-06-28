// Number formatting helpers.

/** Round to at most `dp` decimals, strip trailing zeros, add thousands separators. */
export function fmt(n: number, dp = 2): string {
  if (!isFinite(n)) return "—";
  const rounded = Number(n.toFixed(dp));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: dp });
}

/** Signed value with a leading + / − (used for deltas). */
export function fmtSigned(n: number, dp = 0): string {
  if (Math.abs(n) < 1e-9) return "0";
  const sign = n > 0 ? "+" : "−";
  return sign + fmt(Math.abs(n), dp);
}

export function fmtPower(mw: number): string {
  if (Math.abs(mw) >= 1000) return `${fmt(mw / 1000, 2)} GW`;
  return `${fmt(mw, 1)} MW`;
}

export function fmtPct(frac: number, dp = 1): string {
  return `${fmt(frac * 100, dp)}%`;
}

/** Conveyor belt marks: throughput (items/min) and the milestone tier that unlocks each. */
export const BELT_TIERS: { mark: number; speed: number; tier: number }[] = [
  { mark: 1, speed: 60, tier: 0 },
  { mark: 2, speed: 120, tier: 2 },
  { mark: 3, speed: 270, tier: 4 },
  { mark: 4, speed: 480, tier: 5 },
  { mark: 5, speed: 780, tier: 7 },
  { mark: 6, speed: 1200, tier: 9 },
];

/** Pipeline marks: throughput (m³/min) and the milestone tier that unlocks each. */
export const PIPE_TIERS: { mark: number; speed: number; tier: number }[] = [
  { mark: 1, speed: 300, tier: 5 },
  { mark: 2, speed: 600, tier: 7 },
];

/** Raw boundary inputs carried by pipe rather than belt (liquids and gases). */
export const FLUID_ITEMS = new Set(["Water", "Crude Oil", "Nitrogen Gas"]);

export type LineKind = "belt" | "pipe";

/**
 * Lowest belt/pipe mark that carries `rate`/min without needing more lines than the
 * fastest unlocked one would. Picks the minimum-count solution, then the slowest mark
 * that still achieves that count — so 12.5/min is 1×Mk.1, not 1×Mk.4. Fluids use pipes.
 */
export function beltsFor(
  rate: number,
  tier: number,
  fluid = false,
): { count: number; mark: number; speed: number; kind: LineKind } {
  const kind: LineKind = fluid ? "pipe" : "belt";
  const all = fluid ? PIPE_TIERS : BELT_TIERS;
  const unlocked = all.filter((b) => b.tier <= tier);
  const fastest = unlocked[unlocked.length - 1] ?? all[0];
  if (fastest.speed <= 0) return { count: 0, mark: fastest.mark, speed: fastest.speed, kind };
  const minCount = Math.ceil(rate / fastest.speed);
  for (const b of unlocked) {
    if (Math.ceil(rate / b.speed) <= minCount) return { count: minCount, mark: b.mark, speed: b.speed, kind };
  }
  return { count: minCount, mark: fastest.mark, speed: fastest.speed, kind };
}

export const TIER_NAMES: Record<number, string> = {
  0: "Tier 0 · Onboarding",
  1: "Tier 1 · HUB",
  2: "Tier 2 · Part Assembly",
  3: "Tier 3 · Basic Steel",
  4: "Tier 4 · Advanced Steel",
  5: "Tier 5 · Oil Processing",
  6: "Tier 6 · Industrial Mfg.",
  7: "Tier 7 · Bauxite / Control",
  8: "Tier 8 · Particle Enrich.",
  9: "Tier 9 · Quantum Encoding",
};
