// Ranks each alternate recipe by its marginal impact: how much power and raw input
// it saves versus the standard recipe for the same product, holding every other
// recipe choice fixed. Also attributes the power change per sub-factory.

import { solve, DEFAULT_MULTIPLIERS, type Multipliers, type Selection, type Supplies } from "./solver";
import { ALT_RECIPES, DEFAULT_RECIPE_BY_PRODUCT, RECIPE_BY_ID, recipeTier } from "./model";
import { findSubfactory } from "../data/recipes";
import type { Recipe } from "../data/types";

export interface RawDelta {
  item: string;
  delta: number; // alt - std (negative = alt uses less)
}

export interface SubfactoryPowerDelta {
  subfactory: string;
  delta: number; // alt - std (negative = alt draws less)
}

export interface AltImpact {
  recipe: Recipe;
  product: string;
  building: string;
  subfactory: string;
  /** Standard recipe this alt would replace. */
  replaces: Recipe;
  tier: number;
  available: boolean;
  active: boolean;
  /** Change in total machine count across the whole chain (alt - std). Negative = fewer machines. */
  machineDelta: number;
  /** How many alternate recipes compete for this same product (>1 = mutually exclusive group). */
  productAltCount: number;
  /** Name of the *different* alt currently active for this product, if any — selecting this
   *  one swaps it out. Null when nothing (or this very alt) is active for the product. */
  swapsOutName: string | null;
  /** Positive = alt saves power (MW) vs standard. */
  powerSavedMw: number;
  powerSavedPct: number;
  /** Positive = alt reduces total raw throughput (items+m³/min, mixed-unit proxy). */
  rawSaved: number;
  rawSavedPct: number;
  /** Combined heuristic used for default ranking (higher = better). */
  score: number;
  /** Per-resource raw change (alt - std), biggest magnitude first. */
  rawDeltas: RawDelta[];
  /** Per-sub-factory power change (alt - std), biggest reduction first. */
  subfactoryPowerDeltas: SubfactoryPowerDelta[];
  /** True if applying this alt changes nothing (product not in the active chain). */
  noEffect: boolean;
}

function rawTotal(raw: Record<string, number>): number {
  return Object.values(raw).reduce((s, v) => s + v, 0);
}

/** product -> number of alternate recipes that produce it. */
const ALT_COUNT_BY_PRODUCT: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const alt of ALT_RECIPES) m[alt.product] = (m[alt.product] ?? 0) + 1;
  return m;
})();

export function computeAltImpacts(
  targets: Record<string, number>,
  selection: Selection,
  currentTier: number,
  supplies: Supplies = {},
  multipliers: Multipliers = DEFAULT_MULTIPLIERS,
): AltImpact[] {
  const impacts: AltImpact[] = [];

  for (const alt of ALT_RECIPES) {
    const product = alt.product;
    const std = DEFAULT_RECIPE_BY_PRODUCT[product];
    if (!std) continue;

    const withStd: Selection = { ...selection, [product]: std.id };
    const withAlt: Selection = { ...selection, [product]: alt.id };
    const baseRes = solve(targets, withStd, supplies, multipliers);
    const altRes = solve(targets, withAlt, supplies, multipliers);

    const powerSavedMw = baseRes.totalPowerMw - altRes.totalPowerMw;
    const powerSavedPct = baseRes.totalPowerMw > 0 ? powerSavedMw / baseRes.totalPowerMw : 0;

    const rawSaved = rawTotal(baseRes.raw) - rawTotal(altRes.raw);
    const baseRawTot = rawTotal(baseRes.raw);
    const rawSavedPct = baseRawTot > 0 ? rawSaved / baseRawTot : 0;

    // Per-resource raw delta (alt - std).
    const rawItems = new Set([...Object.keys(baseRes.raw), ...Object.keys(altRes.raw)]);
    const rawDeltas: RawDelta[] = [];
    for (const item of rawItems) {
      const delta = (altRes.raw[item] ?? 0) - (baseRes.raw[item] ?? 0);
      if (Math.abs(delta) > 1e-6) rawDeltas.push({ item, delta });
    }
    rawDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Per-sub-factory power delta (alt - std).
    const sfNames = new Set([
      ...Object.keys(baseRes.bySubfactory),
      ...Object.keys(altRes.bySubfactory),
    ]);
    const subfactoryPowerDeltas: SubfactoryPowerDelta[] = [];
    for (const sf of sfNames) {
      const delta =
        (altRes.bySubfactory[sf]?.powerMw ?? 0) - (baseRes.bySubfactory[sf]?.powerMw ?? 0);
      if (Math.abs(delta) > 1e-6) subfactoryPowerDeltas.push({ subfactory: sf, delta });
    }
    subfactoryPowerDeltas.sort((a, b) => a.delta - b.delta); // biggest reduction first

    const tier = recipeTier(alt);
    const machineDelta = altRes.totalMachines - baseRes.totalMachines;
    const noEffect =
      Math.abs(powerSavedMw) < 1e-6 && rawDeltas.length === 0;
    const activeForProduct = selection[product];
    const active = activeForProduct === alt.id;
    const swapsOutName =
      activeForProduct != null && !active
        ? RECIPE_BY_ID[activeForProduct]?.name ?? null
        : null;

    impacts.push({
      recipe: alt,
      product,
      building: alt.building,
      subfactory: findSubfactory(product),
      replaces: std,
      tier,
      available: tier <= currentTier,
      active,
      machineDelta,
      productAltCount: ALT_COUNT_BY_PRODUCT[product] ?? 1,
      swapsOutName,
      powerSavedMw,
      powerSavedPct,
      rawSaved,
      rawSavedPct,
      score: powerSavedPct + rawSavedPct,
      rawDeltas,
      subfactoryPowerDeltas,
      noEffect,
    });
  }

  impacts.sort((a, b) => b.score - a.score);
  return impacts;
}
