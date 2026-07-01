// Re-attributes a solve result for display, separating three kinds of items:
//   RAW    — belted in from outside (ingots, ore, fluids); shown in "Σ Raw inputs".
//   LOCAL  — "made on-site": built inside each consuming factory, never belted between
//            factories. Still fully counted in power/raw totals, but its machines/power/
//            raws are folded into the factories that use it, and it never appears as an
//            interface flow (so simple parts like Screws aren't piped everywhere).
//   TRADED — produced in its own sub-factory and belted to consumers (everything else).
//
// The solve itself is unchanged; this is a presentation transform. Power, raw inputs and
// foundations are preserved exactly (local quantities are split by consumption share).

import { findSubfactory, RAW_INPUTS, TARGETS } from "../data/recipes";
import type { MachineDetail, Recipe, SolveResult } from "../data/types";

/** Pseudo-source for an item belted in from a user-declared external supply. */
export const SUPPLY_SRC = "SUPPLY";

export interface LocalPart {
  item: string;
  recipe: Recipe;
  machines: number; // fractional — the share of this part's output consumed by the factory
  power: number;
  ratePerMin: number;
  foundationsBare: number;
  foundationsWithClearance: number;
}

export interface AttrFlow {
  item: string;
  rate: number;
  source?: string;
  destinations?: string[];
  /** Final Assembly deliverable (recipes.ts TARGETS). */
  isTarget?: boolean;
  /** User-added additional output — a target the player configured but isn't a real deliverable. */
  isExtraTarget?: boolean;
  isSurplus?: boolean;
  internalOnly?: boolean;
}

export interface AttrFactory {
  name: string;
  tier: number;
  traded: MachineDetail[];
  localParts: LocalPart[];
  inputs: AttrFlow[];
  outputs: AttrFlow[];
  machines: number;
  power: number;
  foundationsBare: number;
  foundationsWithClearance: number;
}

export interface AttributedView {
  factories: Record<string, AttrFactory>;
  /** item -> rate, for targets the user added beyond the core recipes.ts TARGETS. */
  extraTargets: Record<string, number>;
}

export function attribute(
  result: SolveResult,
  localSet: Set<string>,
  targets: Record<string, number>,
): AttributedView {
  const details = result.details;
  const detailByItem: Record<string, MachineDetail> = {};
  for (const d of details) detailByItem[d.item] = d;

  const isLocal = (it: string) => localSet.has(it) && !RAW_INPUTS.has(it) && !!detailByItem[it];
  const isRaw = (it: string) => RAW_INPUTS.has(it) || !detailByItem[it];
  const factoryOf = (it: string) => findSubfactory(it);

  // Consumer edges and total demand per item.
  const consumers: Record<string, Array<{ consumer: string; demand: number }>> = {};
  const totalDemand: Record<string, number> = {};
  for (const d of details) {
    for (const [J, inRate] of Object.entries(d.recipe.inputs)) {
      const demand = inRate * d.machinesFractional;
      (consumers[J] ??= []).push({ consumer: d.item, demand });
      totalDemand[J] = (totalDemand[J] ?? 0) + demand;
    }
  }

  // For a local item, where does its output ultimately go? Distribute its demand to the
  // non-local consuming factories, flowing through any local-to-local consumption.
  const memo: Record<string, Record<string, number>> = {};
  function localAmounts(X: string): Record<string, number> {
    if (memo[X]) return memo[X];
    const res: Record<string, number> = {};
    memo[X] = res; // DAG: safe to set before recursing
    for (const { consumer, demand } of consumers[X] ?? []) {
      if (isLocal(consumer)) {
        const sub = localAmounts(consumer);
        const td = totalDemand[consumer] || 1;
        for (const [F, amt] of Object.entries(sub)) res[F] = (res[F] ?? 0) + demand * (amt / td);
      } else {
        const F = factoryOf(consumer);
        res[F] = (res[F] ?? 0) + demand;
      }
    }
    return res;
  }

  const factories: Record<string, AttrFactory> = {};
  const ensure = (name: string): AttrFactory =>
    (factories[name] ??= {
      name,
      tier: result.bySubfactory[name]?.tier ?? 0,
      traded: [],
      localParts: [],
      inputs: [],
      outputs: [],
      machines: 0,
      power: 0,
      foundationsBare: 0,
      foundationsWithClearance: 0,
    });

  // Traded/final products live in their own factory; local products get distributed.
  for (const d of details) {
    if (isLocal(d.item)) continue;
    ensure(factoryOf(d.item)).traded.push(d);
  }
  for (const d of details) {
    if (!isLocal(d.item)) continue;
    const amounts = localAmounts(d.item);
    const td = totalDemand[d.item] || 1;
    for (const [Fname, amt] of Object.entries(amounts)) {
      if (amt < 1e-9) continue;
      const frac = amt / td;
      ensure(Fname).localParts.push({
        item: d.item,
        recipe: d.recipe,
        machines: d.machinesFractional * frac,
        power: d.powerMw * frac,
        ratePerMin: d.ratePerMin * frac,
        foundationsBare: d.foundationsBare * frac,
        foundationsWithClearance: d.foundationsWithClearance * frac,
      });
    }
  }

  // Interface edges: expand every traded/final recipe's inputs, inlining local parts so
  // only raws and traded items appear as flows.
  interface Edge { from: string; to: string; item: string; amount: number; }
  const edges: Edge[] = [];
  function expand(F: string, item: string, rate: number) {
    // Peel off the share of this item met by external supply first — it's belted in like a raw,
    // not produced. The rest follows the normal local/raw/factory routing below.
    const suppliedAmt = result.supplied[item] ?? 0;
    if (suppliedAmt > 1e-9) {
      const td = totalDemand[item] ?? 0;
      const frac = td > 1e-9 ? Math.min(1, suppliedAmt / td) : 1;
      const supRate = rate * frac;
      if (supRate > 1e-9) edges.push({ from: SUPPLY_SRC, to: F, item, amount: supRate });
      rate -= supRate;
      if (rate <= 1e-9) return;
    }
    if (isLocal(item)) {
      const rec = detailByItem[item].recipe;
      const n = rate / rec.outputs[item];
      for (const [K, kr] of Object.entries(rec.inputs)) expand(F, K, kr * n);
    } else if (isRaw(item)) {
      edges.push({ from: "RAW", to: F, item, amount: rate });
    } else {
      edges.push({ from: factoryOf(item), to: F, item, amount: rate });
    }
  }
  for (const d of details) {
    if (isLocal(d.item)) continue;
    const F = factoryOf(d.item);
    for (const [J, inRate] of Object.entries(d.recipe.inputs)) expand(F, J, inRate * d.machinesFractional);
  }

  // A factory that produces an item as a byproduct covers its own consumption of that item
  // before importing it (e.g. Alumina yields Silica that the same factory's Aluminum Ingot
  // uses). Net those self-supplied amounts out of the import edges so exports/imports match
  // what's actually belted.
  const factoryByproduct: Record<string, Record<string, number>> = {};
  for (const d of details) {
    if (isLocal(d.item)) continue;
    const F = factoryOf(d.item);
    for (const [out, rate] of Object.entries(d.recipe.outputs)) {
      if (out === d.item) continue;
      (factoryByproduct[F] ??= {});
      factoryByproduct[F][out] = (factoryByproduct[F][out] ?? 0) + rate * d.machinesFractional;
    }
  }
  for (const [F, byp] of Object.entries(factoryByproduct)) {
    for (const [item, supplyTotal] of Object.entries(byp)) {
      let remaining = supplyTotal;
      // Reduce inter-factory imports first, then RAW imports, until the byproduct is spent.
      for (const preferFactoryEdge of [true, false]) {
        for (const e of edges) {
          if (remaining <= 1e-9) break;
          if (e.to !== F || e.item !== item) continue;
          if (e.from === SUPPLY_SRC) continue; // a subsidy import is fixed; don't net it away
          if (preferFactoryEdge === (e.from === "RAW")) continue;
          const cut = Math.min(e.amount, remaining);
          e.amount -= cut;
          remaining -= cut;
        }
      }
    }
  }

  // Imports keyed by item+source so a partly-subsidized item shows its factory feed and its
  // SUPPLY subsidy as separate rows rather than collapsing into one.
  const inMap: Record<string, Record<string, { item: string; amount: number; from: string }>> = {};
  // Per producing factory: `external` = amount shipped to OTHER factories; `internal` =
  // consumed within the same factory. Only `external` is an actual export.
  const outAgg: Record<string, Record<string, { external: number; internal: number; dests: Set<string> }>> = {};
  for (const e of edges) {
    if (e.amount <= 1e-9) continue; // fully covered by a same-factory byproduct
    // Intra-factory flows (made and used in the same factory) are not imports.
    if (e.from !== e.to) {
      (inMap[e.to] ??= {});
      const key = e.item + " " + e.from;
      const cur = (inMap[e.to][key] ??= { item: e.item, amount: 0, from: e.from });
      cur.amount += e.amount;
    }
    if (e.from !== "RAW" && e.from !== SUPPLY_SRC) {
      (outAgg[e.from] ??= {});
      const o = (outAgg[e.from][e.item] ??= { external: 0, internal: 0, dests: new Set() });
      if (e.to === e.from) {
        o.internal += e.amount;
      } else {
        o.external += e.amount;
        o.dests.add(e.to);
      }
    }
  }

  for (const [Fname, F] of Object.entries(factories)) {
    F.inputs = Object.values(inMap[Fname] ?? {})
      .map((v) => ({ item: v.item, rate: v.amount, source: v.from }))
      .sort((a, b) => b.rate - a.rate);

    const outs: Record<string, AttrFlow> = {};
    for (const [item, v] of Object.entries(outAgg[Fname] ?? {})) {
      const isDemanded = item in targets;
      const isTarget = item in TARGETS;
      const isExtraTarget = isDemanded && !isTarget;
      const surplusAmt = result.surplus[item] ?? 0;
      const isSurplus = surplusAmt > 1e-6;
      // What actually leaves the factory: shipped to other factories + final deliverable +
      // surplus. The portion consumed in-house is intra-factory, not an export.
      const leaves = v.external + (isDemanded ? targets[item] : 0) + (isSurplus ? surplusAmt : 0);
      if (leaves <= 1e-6) {
        // produced and fully consumed in-house
        outs[item] = { item, rate: v.internal, destinations: [], internalOnly: true };
      } else {
        outs[item] = { item, rate: leaves, destinations: [...v.dests].sort(), isTarget, isExtraTarget, isSurplus };
      }
    }
    // Targets / surplus produced here but consumed by no recipe (so absent from the edges).
    for (const d of F.traded) {
      if (d.item in targets && !outs[d.item]) {
        const isTarget = d.item in TARGETS;
        outs[d.item] = {
          item: d.item, rate: d.ratePerMin, destinations: [],
          isTarget, isExtraTarget: !isTarget,
        };
      }
    }
    for (const [item, qty] of Object.entries(result.surplus)) {
      if (qty > 1e-6 && factoryOf(item) === Fname && !outs[item]) {
        outs[item] = { item, rate: qty, destinations: [], isSurplus: true };
      }
    }
    F.outputs = Object.values(outs).sort((a, b) => b.rate - a.rate);

    let machines = 0, power = 0, fb = 0, fc = 0;
    for (const d of F.traded) {
      machines += d.machinesFull;
      power += d.powerMw;
      fb += d.foundationsBare;
      fc += d.foundationsWithClearance;
    }
    for (const p of F.localParts) {
      machines += p.machines;
      power += p.power;
      fb += p.foundationsBare;
      fc += p.foundationsWithClearance;
    }
    F.machines = machines;
    F.power = power;
    F.foundationsBare = fb;
    F.foundationsWithClearance = fc;
  }

  const extraTargets: Record<string, number> = {};
  for (const [item, rate] of Object.entries(targets)) {
    if (!(item in TARGETS)) extraTargets[item] = rate;
  }

  return { factories, extraTargets };
}
