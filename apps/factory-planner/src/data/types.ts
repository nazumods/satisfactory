// Core domain types for the Satisfactory factory planner.
// Rates are all in items per minute (m³/min for fluids) at 100% clock,
// matching the convention in the project's recipes.py.

export interface Building {
  name: string;
  /** Average MW at 100% clock. For variable-power buildings this is the avg. */
  powerMw: number;
  /** (width, length) in meters — used for footprint / foundation math. */
  footprintM: [number, number];
  /** Variable-power buildings (Particle Accelerator, Quantum Encoder, Converter). */
  isVariablePower?: boolean;
  /** Extra space per side (width, length) in meters for belt routing. Default [8, 8]. */
  clearanceM?: [number, number];
  /** Milestone tier at which this building unlocks. */
  tier: number;
}

export interface Recipe {
  /** Unique id (recipe display name). */
  id: string;
  /** Display name. */
  name: string;
  /** Primary output item — the thing this recipe is "for". */
  product: string;
  /** Key into BUILDINGS. */
  building: string;
  /** item -> per-minute rate at 100% clock. */
  inputs: Record<string, number>;
  /** item -> per-minute rate at 100% clock. Includes byproducts. */
  outputs: Record<string, number>;
  /** True for alternate (Hard Drive) recipes. */
  alt: boolean;
  /** Per-recipe average power for variable-power buildings. */
  powerOverrideMw?: number;
  /**
   * Explicit unlock-tier override. When omitted the tier is derived from the
   * building tier and the tiers of the recipe's inputs.
   */
  tierOverride?: number;
}

/** Per-produced-item result after solving the chain. */
export interface MachineDetail {
  item: string;
  subfactory: string;
  recipe: Recipe;
  ratePerMin: number;
  machinesFractional: number;
  machinesFull: number;
  clockPct: number;
  powerMw: number;
  footprintM2: number;
  foundationsBare: number;
  foundationsWithClearance: number;
}

export interface SolveResult {
  /** item -> total per-minute produced. */
  production: Record<string, number>;
  /** raw item -> total per-minute consumed from outside. */
  raw: Record<string, number>;
  /** byproduct item -> total per-minute produced as a side output. */
  byproducts: Record<string, number>;
  /** item -> net surplus per-minute (produced but unused). */
  surplus: Record<string, number>;
  /** Per-item machine/power/footprint details. */
  details: MachineDetail[];
  /** Aggregates. */
  totalPowerMw: number;
  totalMachines: number;
  /** subfactory -> aggregate stats. */
  bySubfactory: Record<string, SubfactoryStats>;
}

export interface SubfactoryStats {
  name: string;
  powerMw: number;
  machines: number;
  foundationsBare: number;
  foundationsWithClearance: number;
  details: MachineDetail[];
  /** Highest tier required by any product in this factory. */
  tier: number;
}
