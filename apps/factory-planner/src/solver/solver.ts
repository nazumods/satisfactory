// BFS production-chain solver — a faithful TypeScript port of solver.py, generalized
// so the active recipe per product is chosen by a selection map (default = standard).

import { BUILDINGS, RAW_INPUTS } from "../data/recipes";
import { findSubfactory, SUB_FACTORIES } from "../data/recipes";
import type { Building, MachineDetail, Recipe, SolveResult, SubfactoryStats } from "../data/types";
import {
  DEFAULT_RECIPE_BY_PRODUCT, RECIPE_BY_ID, FALLBACK_PRODUCTS, FALLBACK_FOR,
  subfactoryTier,
} from "./model";

const EPS = 1e-9;
const POWER_EXP = 1.321928; // Satisfactory clock->power exponent for fixed buildings.

/** product -> active recipe id. Missing entries fall back to the standard recipe. */
export type Selection = Record<string, string>;

function effectiveRecipe(product: string, selection: Selection): Recipe | undefined {
  const chosenId = selection[product];
  if (chosenId && RECIPE_BY_ID[chosenId]) return RECIPE_BY_ID[chosenId];
  return DEFAULT_RECIPE_BY_PRODUCT[product];
}

/** Items with an active, main-loop-usable recipe (excludes fallback-only byproducts). */
function hasNormalRecipe(item: string, selection: Selection): boolean {
  if (FALLBACK_PRODUCTS.has(item)) return false;
  return effectiveRecipe(item, selection) !== undefined;
}

interface Demand {
  [item: string]: number;
}

/** item -> available external supply per minute (Infinity = unlimited). */
export type Supplies = Record<string, number>;

/**
 * Draw an item's demand from its remaining external supply before any recipe runs, so we only
 * produce what the supply can't cover. Mutates demand / remaining / supplied in place.
 */
function drawSupply(item: string, demand: Demand, remaining: Demand, supplied: Demand) {
  const avail = remaining[item] ?? 0;
  const need = demand[item] ?? 0;
  if (avail <= EPS || need <= EPS) return;
  const used = Math.min(need, avail);
  demand[item] = need - used;
  remaining[item] = avail - used;
  supplied[item] = (supplied[item] ?? 0) + used;
}

function runRecipe(
  recipe: Recipe,
  needed: number,
  targetItem: string,
  demand: Demand,
  production: Demand,
  byproducts: Demand,
) {
  const perMachine = recipe.outputs[targetItem];
  const n = needed / perMachine;
  for (const [inp, rate] of Object.entries(recipe.inputs)) {
    demand[inp] = (demand[inp] ?? 0) + rate * n;
  }
  for (const [out, rate] of Object.entries(recipe.outputs)) {
    if (out === targetItem) {
      production[out] = (production[out] ?? 0) + needed;
      demand[out] = (demand[out] ?? 0) - needed;
    } else {
      const produced = rate * n;
      byproducts[out] = (byproducts[out] ?? 0) + produced;
      demand[out] = (demand[out] ?? 0) - produced;
    }
  }
}

export function solve(
  targets: Record<string, number>,
  selection: Selection,
  supplies: Supplies = {},
): SolveResult {
  const demand: Demand = {};
  for (const [item, rate] of Object.entries(targets)) demand[item] = (demand[item] ?? 0) + rate;

  const production: Demand = {};
  const byproducts: Demand = {};
  // Remaining external supply per item, drawn down as it subsidizes demand.
  const remaining: Demand = { ...supplies };
  const supplied: Demand = {};

  // Main resolution loop. Defer fallback byproduct items so byproducts can satisfy them.
  let iterations = 0;
  while (iterations++ < 5000) {
    let target: string | undefined;
    for (const [item, qty] of Object.entries(demand)) {
      if (qty > EPS && hasNormalRecipe(item, selection)) {
        target = item;
        break;
      }
    }
    if (target === undefined) break;
    drawSupply(target, demand, remaining, supplied);
    if (demand[target] <= EPS) continue; // fully covered by external supply
    const recipe = effectiveRecipe(target, selection)!;
    runRecipe(recipe, demand[target], target, demand, production, byproducts);
  }

  // Fallback phase: cover any residual positive demand for byproduct items
  // (Dark Matter Residue, Heavy Oil Residue) with their dedicated producers, then
  // keep resolving any new upstream demand they create.
  for (const [fbId, product] of Object.entries(FALLBACK_FOR)) {
    if ((demand[product] ?? 0) <= EPS) continue;
    const recipe = RECIPE_BY_ID[fbId];
    if (!recipe) continue;
    runRecipe(recipe, demand[product], product, demand, production, byproducts);

    let inner = 0;
    while (inner++ < 5000) {
      let target: string | undefined;
      for (const [item, qty] of Object.entries(demand)) {
        if (qty > EPS && hasNormalRecipe(item, selection)) {
          target = item;
          break;
        }
      }
      if (target === undefined) break;
      drawSupply(target, demand, remaining, supplied);
      if (demand[target] <= EPS) continue;
      const rec = effectiveRecipe(target, selection)!;
      runRecipe(rec, demand[target], target, demand, production, byproducts);
    }
  }

  // Residual demand for items with no normal recipe (raw / unrecipe'd) can also be subsidized
  // by an external supply — draw that down before it counts as raw boundary feed.
  for (const [item, qty] of Object.entries(demand)) {
    if (qty > EPS) drawSupply(item, demand, remaining, supplied);
  }

  // Collect raw consumption (positive residual demand for raw / unrecipe'd items)
  // and surplus (negative demand for produced items).
  const raw: Demand = {};
  const surplus: Demand = {};
  for (const [item, qty] of Object.entries(demand)) {
    if (qty > EPS && (RAW_INPUTS.has(item) || !hasNormalRecipe(item, selection))) {
      raw[item] = qty;
    } else if (qty < -EPS && !RAW_INPUTS.has(item)) {
      surplus[item] = -qty;
    }
  }

  const details = computeMachineDetails(production, selection);
  return aggregate(production, raw, supplied, byproducts, surplus, details);
}

function buildingFoundations(b: Building): { bare: number; clearance: number } {
  const [w, l] = b.footprintM;
  const [cw, cl] = b.clearanceM ?? [8, 8];
  const bare = Math.ceil(w / 8) * Math.ceil(l / 8);
  const clearance = Math.ceil((w + 2 * cw) / 8) * Math.ceil((l + 2 * cl) / 8);
  return { bare, clearance };
}

export function computeMachineDetails(
  production: Demand,
  selection: Selection,
): MachineDetail[] {
  const details: MachineDetail[] = [];
  for (const [item, rate] of Object.entries(production)) {
    const recipe = effectiveRecipe(item, selection);
    if (!recipe) continue;
    const building = BUILDINGS[recipe.building];
    const perMachine = recipe.outputs[item];
    const nFrac = rate / perMachine;
    const nFull = Math.ceil(nFrac - EPS);
    const clock = nFull > 0 ? nFrac / nFull : 0;
    const power = recipe.powerOverrideMw ?? building.powerMw;

    let totalPower: number;
    if (building.isVariablePower) {
      totalPower = nFrac * power;
    } else if (nFull > 0 && nFrac > 0) {
      totalPower = nFull * power * Math.pow(clock, POWER_EXP);
    } else {
      totalPower = 0;
    }

    const [w, l] = building.footprintM;
    const f = buildingFoundations(building);
    details.push({
      item,
      subfactory: findSubfactory(item),
      recipe,
      ratePerMin: rate,
      machinesFractional: nFrac,
      machinesFull: nFull,
      clockPct: clock * 100,
      powerMw: totalPower,
      footprintM2: w * l * nFull,
      foundationsBare: f.bare * nFull,
      foundationsWithClearance: f.clearance * nFull,
    });
  }
  return details;
}

function aggregate(
  production: Demand,
  raw: Demand,
  supplied: Demand,
  byproducts: Demand,
  surplus: Demand,
  details: MachineDetail[],
): SolveResult {
  const bySubfactory: Record<string, SubfactoryStats> = {};
  let totalPowerMw = 0;
  let totalMachines = 0;

  for (const d of details) {
    const sf = d.subfactory;
    const stats =
      (bySubfactory[sf] ??= {
        name: sf,
        powerMw: 0,
        machines: 0,
        foundationsBare: 0,
        foundationsWithClearance: 0,
        details: [],
        tier: SUB_FACTORIES[sf] ? subfactoryTier(sf) : 0,
      });
    stats.powerMw += d.powerMw;
    stats.machines += d.machinesFull;
    stats.foundationsBare += d.foundationsBare;
    stats.foundationsWithClearance += d.foundationsWithClearance;
    stats.details.push(d);
    totalPowerMw += d.powerMw;
    totalMachines += d.machinesFull;
  }

  for (const stats of Object.values(bySubfactory)) {
    stats.details.sort((a, b) => a.item.localeCompare(b.item));
  }

  return {
    production,
    raw,
    supplied,
    byproducts,
    surplus,
    details,
    totalPowerMw,
    totalMachines,
    bySubfactory,
  };
}
