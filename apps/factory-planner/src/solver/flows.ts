// Per-sub-factory interface flows: what each factory consumes (and from where) and
// what it produces (and where it goes). Derived from a solve result's machine details.

import { findSubfactory, RAW_INPUTS, TARGETS } from "../data/recipes";
import type { SolveResult } from "../data/types";

export interface FlowEntry {
  item: string;
  rate: number;
  /** For inputs: the sub-factory that produces this item, "RAW", or "—". */
  source?: string;
  /** For outputs: consumer sub-factories (excluding this one). */
  destinations?: string[];
  /** For outputs: this item is a final target. */
  isTarget?: boolean;
  /** For outputs: some of this item is left over as surplus. */
  isSurplus?: boolean;
  /** For outputs: consumed only within this same factory. */
  internalOnly?: boolean;
}

export interface FactoryFlows {
  inputs: FlowEntry[];
  outputs: FlowEntry[];
}

export function computeFactoryFlows(result: SolveResult): Record<string, FactoryFlows> {
  const inputs: Record<string, Record<string, number>> = {};
  const outputs: Record<string, Record<string, number>> = {};
  // item -> set of factories that consume it (used to fill the Outputs "To" column).
  const consumerFactories: Record<string, Set<string>> = {};

  for (const d of result.details) {
    const sf = d.subfactory;
    (inputs[sf] ??= {});
    (outputs[sf] ??= {});
    const nFrac = d.machinesFractional;
    for (const [inp, rate] of Object.entries(d.recipe.inputs)) {
      inputs[sf][inp] = (inputs[sf][inp] ?? 0) + rate * nFrac;
      (consumerFactories[inp] ??= new Set()).add(sf);
    }
    for (const [out, rate] of Object.entries(d.recipe.outputs)) {
      outputs[sf][out] = (outputs[sf][out] ?? 0) + rate * nFrac;
    }
  }

  const flows: Record<string, FactoryFlows> = {};
  const allSfs = new Set([...Object.keys(inputs), ...Object.keys(outputs)]);
  for (const sf of allSfs) {
    const inEntries: FlowEntry[] = Object.entries(inputs[sf] ?? {})
      .map(([item, rate]) => ({
        item,
        rate,
        source: RAW_INPUTS.has(item) ? "RAW" : findSubfactory(item),
      }))
      .sort((a, b) => b.rate - a.rate);

    const outEntries: FlowEntry[] = Object.entries(outputs[sf] ?? {})
      .map(([item, rate]) => {
        const consumers = consumerFactories[item] ?? new Set<string>();
        const destinations = [...consumers].filter((c) => c !== sf).sort();
        return {
          item,
          rate,
          destinations,
          isTarget: item in TARGETS,
          isSurplus: (result.surplus[item] ?? 0) > 1e-6,
          internalOnly: destinations.length === 0 && consumers.has(sf),
        };
      })
      .sort((a, b) => b.rate - a.rate);

    flows[sf] = { inputs: inEntries, outputs: outEntries };
  }
  return flows;
}
