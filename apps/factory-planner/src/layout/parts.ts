// Derives the per-part machine group specs a factory layout is built from. Consumes the
// attributed view (traded + on-site parts) so the layout matches what the factory tab shows.

import { BUILDINGS } from "../data/recipes";
import type { Building, Recipe } from "../data/types";
import type { AttrFactory } from "../solver/attribution";

export interface PartSpec {
  item: string;
  recipe: Recipe;
  building: Building;
  /** Whole machines to place on the floor. */
  count: number;
  /** Fractional machine-equivalents — drives belt flow rates. */
  machinesFractional: number;
  ratePerMin: number;
  /** Built on-site (fractional share of a shared part). */
  local: boolean;
  /** Production-chain depth within this factory (0 = no in-factory producer feeds it). */
  depth: number;
}

export function derivePartSpecs(factory: AttrFactory): PartSpec[] {
  const specs: PartSpec[] = [];
  for (const d of factory.traded) {
    specs.push({
      item: d.item,
      recipe: d.recipe,
      building: BUILDINGS[d.recipe.building],
      count: Math.max(1, d.machinesFull),
      machinesFractional: d.machinesFractional,
      ratePerMin: d.ratePerMin,
      local: false,
      depth: 0,
    });
  }
  for (const p of factory.localParts) {
    // A local part's machines are a fractional share of a part built in several factories;
    // a player places whole machines, so round up per factory (mild cross-factory overcount).
    specs.push({
      item: p.item,
      recipe: p.recipe,
      building: BUILDINGS[p.recipe.building],
      count: Math.max(1, Math.ceil(p.machines - 1e-9)),
      machinesFractional: p.machines,
      ratePerMin: p.ratePerMin,
      local: true,
      depth: 0,
    });
  }
  assignDepths(specs);
  specs.sort((a, b) => a.depth - b.depth || b.count - a.count || a.item.localeCompare(b.item));
  return specs;
}

/** Longest-path depth over in-factory feeds (byproduct outputs count as production). */
function assignDepths(specs: PartSpec[]): void {
  const producerOf: Record<string, PartSpec> = {};
  for (const s of specs) {
    for (const out of Object.keys(s.recipe.outputs)) {
      // Prefer the primary producer when an item is also someone's byproduct.
      if (!(out in producerOf) || out === s.item) producerOf[out] = s;
    }
  }
  const memo: Record<string, number> = {};
  const visiting = new Set<string>();
  function depth(s: PartSpec): number {
    const known = memo[s.item];
    if (known !== undefined) return known;
    if (visiting.has(s.item)) return 0; // cycle guard (recipe loops via byproducts)
    visiting.add(s.item);
    let d = 0;
    for (const inp of Object.keys(s.recipe.inputs)) {
      const p = producerOf[inp];
      if (p && p !== s) d = Math.max(d, depth(p) + 1);
    }
    visiting.delete(s.item);
    memo[s.item] = d;
    return d;
  }
  for (const s of specs) s.depth = depth(s);
}
