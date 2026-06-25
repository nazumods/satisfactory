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
