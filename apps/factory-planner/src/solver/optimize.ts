// Optimize mode: fills leftover raw-input capacity (from rounding real demand up to full
// belt/miner lines) with extra production of the highest-tier sinkable items, so whatever
// ends up as surplus is worth as much as possible at the Awesome Sink. This is additive on
// top of the real target solve — it never reduces or reshuffles the user's configured targets,
// it only spends the rounding slack.

import { DEFAULT_RECIPE_BY_PRODUCT, RECIPE_BY_ID, FALLBACK_PRODUCTS, itemTier } from "./model";
import { solve, type Selection, type Supplies } from "./solver";
import { SINK_VALUES } from "../data/sinkValues";
import type { SolveResult } from "../data/types";

const EPS = 1e-6;

/** raw item -> full belt/miner-line increment. Anything absent (Water, Nitrogen Gas) is left
 *  uncapped — the optimizer never rounds or budgets against it, per the "don't worry about
 *  water or nitrogen for now" scoping. */
const RAW_BELT_INCREMENTS: Record<string, number> = {
  "Iron Ore": 120,
  "Copper Ore": 120,
  "Caterium Ore": 120,
  "Raw Quartz": 120,
  Limestone: 120,
  Coal: 120,
  Sulfur: 120,
  Bauxite: 120,
  SAM: 120,
  "Crude Oil": 60,
};
const CAPPED_RAW = Object.keys(RAW_BELT_INCREMENTS);

export interface OptimizeResult {
  /** Final combined solve (real targets + optimizer extras) — use this everywhere. */
  result: SolveResult;
  /** item -> extra qty the optimizer chose to produce, for merging into displayed surplus. */
  extras: Record<string, number>;
  /** raw item -> rounded-up-to-belt-line budget (capped raws only). */
  beltBudget: Record<string, number>;
}

function roundedBudget(raw: Record<string, number>): Record<string, number> {
  const budget: Record<string, number> = {};
  for (const [item, increment] of Object.entries(RAW_BELT_INCREMENTS)) {
    budget[item] = Math.ceil((raw[item] ?? 0) / increment - EPS) * increment;
  }
  return budget;
}

export function computeOptimizedExtras(
  baseline: SolveResult,
  targets: Record<string, number>,
  selection: Selection,
  supplies: Supplies,
  tier: number,
): OptimizeResult {
  const beltBudget = roundedBudget(baseline.raw);
  const leftover: Record<string, number> = {};
  let totalLeftover = 0;
  for (const item of CAPPED_RAW) {
    const l = beltBudget[item] - (baseline.raw[item] ?? 0);
    leftover[item] = l;
    totalLeftover += l;
  }
  if (totalLeftover <= EPS) return { result: baseline, extras: {}, beltBudget };

  // Most-advanced-first: highest unlock tier, tie-broken by sink value.
  const candidates = Object.keys(DEFAULT_RECIPE_BY_PRODUCT)
    .filter((item) => !FALLBACK_PRODUCTS.has(item))
    .filter((item) => !(item in targets))
    .filter((item) => item in SINK_VALUES)
    .filter((item) => itemTier(item) <= tier)
    .sort((a, b) => itemTier(b) - itemTier(a) || SINK_VALUES[b] - SINK_VALUES[a]);

  const extras: Record<string, number> = {};
  const chosenOrder: string[] = [];

  for (const item of candidates) {
    const recipeId = selection[item] ?? DEFAULT_RECIPE_BY_PRODUCT[item].id;
    const recipe = RECIPE_BY_ID[recipeId] ?? DEFAULT_RECIPE_BY_PRODUCT[item];
    const perMachine = recipe.outputs[item];
    if (!perMachine) continue;

    // Isolated per-candidate costing (no supplies — extra production shouldn't double-dip a
    // subsidy already spent on the real targets). This ignores byproduct-netting interactions
    // between candidates, which the verify/trim pass below corrects for.
    const unitCost = solve({ [item]: perMachine }, selection).raw;
    let maxWholeMachines = Infinity;
    let needsCappedRaw = false;
    for (const raw of CAPPED_RAW) {
      const cost = unitCost[raw] ?? 0;
      if (cost <= EPS) continue;
      needsCappedRaw = true;
      maxWholeMachines = Math.min(maxWholeMachines, leftover[raw] / cost);
    }
    if (!needsCappedRaw) continue; // doesn't touch any budgeted raw — no benefit, skip
    maxWholeMachines = Math.floor(maxWholeMachines + EPS);
    if (maxWholeMachines <= 0) continue;

    const added = maxWholeMachines * perMachine;
    extras[item] = added;
    chosenOrder.push(item);
    for (const raw of CAPPED_RAW) {
      const cost = unitCost[raw] ?? 0;
      if (cost > 0) leftover[raw] -= maxWholeMachines * cost;
    }
  }

  // Verify against the real combined solve and trim the least-advanced picks first if the
  // true combined raw draw overshoots the budget (see module comment).
  let combined = solve({ ...targets, ...extras }, selection, supplies);
  while (chosenOrder.length > 0) {
    const overshoot = CAPPED_RAW.some((raw) => (combined.raw[raw] ?? 0) > beltBudget[raw] + EPS);
    if (!overshoot) break;
    const drop = chosenOrder.pop()!;
    delete extras[drop];
    combined = solve({ ...targets, ...extras }, selection, supplies);
  }

  return { result: combined, extras, beltBudget };
}
