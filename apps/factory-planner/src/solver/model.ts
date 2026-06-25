// Derived structures over the raw recipe list: lookups, the default/alt split,
// and tier computation used for gating.

import {
  RECIPES, BUILDINGS, RAW_INPUTS, RAW_TIERS, SUB_FACTORIES, FACTORY_META,
  FALLBACK_PRODUCERS, FALLBACK_FOR,
} from "../data/recipes";
import type { Track } from "../data/recipes";
import type { Recipe } from "../data/types";

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

/** product -> all recipes whose primary output is that product. */
export const RECIPES_BY_PRODUCT: Record<string, Recipe[]> = (() => {
  const m: Record<string, Recipe[]> = {};
  for (const r of RECIPES) (m[r.product] ??= []).push(r);
  return m;
})();

/** Items produced only by a fallback producer (covered after the main solve pass). */
export const FALLBACK_PRODUCTS = new Set<string>(Object.values(FALLBACK_FOR));

/** product -> its default (non-alternate) recipe. */
export const DEFAULT_RECIPE_BY_PRODUCT: Record<string, Recipe> = (() => {
  const m: Record<string, Recipe> = {};
  for (const [product, recs] of Object.entries(RECIPES_BY_PRODUCT)) {
    const std = recs.find((r) => !r.alt) ?? recs[0];
    m[product] = std;
  }
  return m;
})();

/** All alternate recipes — these are the toggles in the UI. */
export const ALT_RECIPES: Recipe[] = RECIPES.filter((r) => r.alt);

export function isRaw(item: string): boolean {
  return RAW_INPUTS.has(item);
}

// ---- Tier computation ---------------------------------------------------------

const _itemTierCache: Record<string, number> = {};

/**
 * Earliest tier at which an item can first be produced, following the default
 * (non-alt) recipe chain. Raw items use their declared availability tier.
 */
export function itemTier(item: string, stack: Set<string> = new Set()): number {
  if (item in _itemTierCache) return _itemTierCache[item];
  if (isRaw(item)) return (_itemTierCache[item] = RAW_TIERS[item] ?? 0);
  if (stack.has(item)) return 0; // cycle guard (shouldn't happen in this DAG)

  const recipe = DEFAULT_RECIPE_BY_PRODUCT[item];
  if (!recipe) return (_itemTierCache[item] = 0);

  stack.add(item);
  let t = BUILDINGS[recipe.building]?.tier ?? 0;
  for (const inp of Object.keys(recipe.inputs)) {
    t = Math.max(t, itemTier(inp, stack));
  }
  stack.delete(item);
  return (_itemTierCache[item] = t);
}

/** Tier at which a specific recipe (e.g. an alternate) can first be run. */
export function recipeTier(recipe: Recipe): number {
  if (recipe.tierOverride != null) return recipe.tierOverride;
  let t = BUILDINGS[recipe.building]?.tier ?? 0;
  for (const inp of Object.keys(recipe.inputs)) t = Math.max(t, itemTier(inp));
  return t;
}

/**
 * Build-order tier of a sub-factory. Uses the explicit FACTORY_META value (the real build
 * sequence); falls back to the highest item build tier for any factory not listed there.
 */
export function subfactoryTier(sf: string): number {
  const meta = FACTORY_META[sf];
  if (meta) return meta.tier;
  const items = SUB_FACTORIES[sf] ?? [];
  return items.reduce((max, it) => Math.max(max, itemTier(it)), 0);
}

/** Which display track a sub-factory belongs to. */
export function factoryTrack(sf: string): Track {
  return FACTORY_META[sf]?.track ?? "support";
}

export const SUBFACTORY_TIERS: Record<string, number> = Object.fromEntries(
  Object.keys(SUB_FACTORIES).map((sf) => [sf, subfactoryTier(sf)]),
);

export { FALLBACK_PRODUCERS, FALLBACK_FOR };
