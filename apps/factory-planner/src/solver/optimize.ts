// Optimize mode: fills leftover raw-input capacity (from rounding real demand up to full
// belt/miner lines) with extra production of the highest-tier sinkable items, so whatever
// ends up as surplus is worth as much as possible at the Awesome Sink. This is additive on
// top of the real target solve — it never reduces or reshuffles the user's configured targets,
// it only spends the rounding slack.

import { DEFAULT_RECIPE_BY_PRODUCT, RECIPE_BY_ID, FALLBACK_PRODUCTS, itemTier } from "./model";
import { solve, DEFAULT_MULTIPLIERS, type Multipliers, type Selection, type Supplies } from "./solver";
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
export interface OptimizeResult {
  /** Final combined solve (real targets + optimizer extras) — use this everywhere. */
  result: SolveResult;
  /** item -> extra qty the optimizer chose to produce, for merging into displayed surplus. */
  extras: Record<string, number>;
  /** raw item -> budget it was solved against (user-specified availability, else rounded-up
   *  belt/miner line). */
  beltBudget: Record<string, number>;
}

/**
 * Budget per raw item: a user-declared availability (`rawCaps`) always wins; otherwise solids/
 * oil round up to the nearest full belt/miner line; anything in neither (Water, Nitrogen Gas
 * with no declared cap) is left uncapped entirely.
 */
function computeBudget(raw: Record<string, number>, rawCaps: Record<string, number>): Record<string, number> {
  const budget: Record<string, number> = {};
  const items = new Set([...Object.keys(RAW_BELT_INCREMENTS), ...Object.keys(rawCaps)]);
  for (const item of items) {
    if (item in rawCaps) {
      budget[item] = rawCaps[item];
    } else {
      const increment = RAW_BELT_INCREMENTS[item];
      budget[item] = Math.ceil((raw[item] ?? 0) / increment - EPS) * increment;
    }
  }
  return budget;
}

export function computeOptimizedExtras(
  baseline: SolveResult,
  targets: Record<string, number>,
  selection: Selection,
  supplies: Supplies,
  tier: number,
  rawCaps: Record<string, number> = {},
  multipliers: Multipliers = DEFAULT_MULTIPLIERS,
): OptimizeResult {
  const beltBudget = computeBudget(baseline.raw, rawCaps);
  const cappedRaw = Object.keys(beltBudget);
  const leftover: Record<string, number> = {};
  let totalLeftover = 0;
  for (const item of cappedRaw) {
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
    const unitCost = solve({ [item]: perMachine }, selection, {}, multipliers).raw;
    let maxMachines = Infinity;
    let needsCappedRaw = false;
    for (const raw of cappedRaw) {
      const cost = unitCost[raw] ?? 0;
      if (cost <= EPS) continue;
      needsCappedRaw = true;
      maxMachines = Math.min(maxMachines, leftover[raw] / cost);
    }
    if (!needsCappedRaw) continue; // doesn't touch any budgeted raw — no benefit, skip
    if (maxMachines <= EPS) continue;

    // Fractional machines (underclock the last one in-game) so each candidate drains its
    // scarcest budgeted raw to exactly zero. Single-raw candidates (ingots are 1:1, concrete)
    // then mop up any remainder, so every budgeted raw is consumed to its full belt line
    // instead of stranding sub-machine slack.
    const added = maxMachines * perMachine;
    extras[item] = added;
    chosenOrder.push(item);
    for (const raw of cappedRaw) {
      const cost = unitCost[raw] ?? 0;
      if (cost > 0) leftover[raw] -= maxMachines * cost;
    }
  }

  // Verify against the real combined solve and trim the least-advanced picks first if the
  // true combined raw draw overshoots the budget (see module comment).
  let combined = solve({ ...targets, ...extras }, selection, supplies, multipliers);
  while (chosenOrder.length > 0) {
    const overshoot = cappedRaw.some((raw) => (combined.raw[raw] ?? 0) > beltBudget[raw] + EPS);
    if (!overshoot) break;
    const drop = chosenOrder.pop()!;
    delete extras[drop];
    combined = solve({ ...targets, ...extras }, selection, supplies, multipliers);
  }

  return { result: combined, extras, beltBudget };
}
