// Satisfactory Phase 5 recipe database (items per minute at 100% clock).
//
// Data sourcing:
//  - Recipes that the project's recipes.py defines are mirrored verbatim, so this
//    app reproduces plan.md when the same alternates are selected.
//  - STANDARD (non-alt) recipes for items where recipes.py only stored the alt are
//    sourced from satisfactory.wiki.gg (verified) so an "all-standard" baseline exists.
//  - Iron Plate / Copper Sheet / Wire are modeled here (recipes.py belts them in as
//    raw) so basic-tier alternates (Iron Wire, Stitched Iron Plate, ...) are explorable.
//  - cycleSeconds (craft-cycle duration) is sourced from recipes.py comments where available,
//    else satisfactory.wiki.gg, cross-checked so per_cycle_amount * 60 / cycleSeconds
//    reproduces the per-minute rates below. It's used only by the Recipe Parts Cost
//    Multiplier game mode (see solver.ts) to replicate the game's per-cycle-integer rounding.
//
// Every alternate is paired with the standard recipe it competes with, so the app can
// default to "no alternates" and let the player toggle each one on.

import type { Building, Recipe } from "./types";

export const BUILDINGS: Record<string, Building> = {
  Smelter: { name: "Smelter", powerMw: 4, footprintM: [6, 9], clearanceM: [0, 4], tier: 0 },
  Foundry: { name: "Foundry", powerMw: 16, footprintM: [10, 9], clearanceM: [0, 8], tier: 3 },
  Constructor: { name: "Constructor", powerMw: 4, footprintM: [8, 10], clearanceM: [2, 8], tier: 0 },
  Assembler: { name: "Assembler", powerMw: 15, footprintM: [10, 15], clearanceM: [0, 8], tier: 2 },
  Manufacturer: { name: "Manufacturer", powerMw: 55, footprintM: [18, 20], clearanceM: [0, 8], tier: 6 },
  Refinery: { name: "Refinery", powerMw: 30, footprintM: [10, 20], clearanceM: [0, 6], tier: 5 },
  Blender: { name: "Blender", powerMw: 75, footprintM: [18, 16], clearanceM: [6, 0], tier: 7 },
  Packager: { name: "Packager", powerMw: 10, footprintM: [8, 8], clearanceM: [0, 16], tier: 5 },
  "Particle Accelerator": {
    name: "Particle Accelerator", powerMw: 500, footprintM: [24, 38],
    clearanceM: [0, 8], isVariablePower: true, tier: 8,
  },
  "Quantum Encoder": {
    name: "Quantum Encoder", powerMw: 1000, footprintM: [22, 48],
    clearanceM: [0, 8], isVariablePower: true, tier: 9,
  },
  Converter: {
    name: "Converter", powerMw: 250, footprintM: [16, 20],
    clearanceM: [0, 8], isVariablePower: true, tier: 9,
  },
};

// Raw boundary inputs — only truly raw resources (mined ore, extracted fluids). Smelting
// and base-material production (ingots, concrete, quartz, silica, fuel) is modeled below so
// the raw ore + power numbers are accurate.
export const RAW_INPUTS = new Set<string>([
  "Iron Ore", "Copper Ore", "Caterium Ore", "Raw Quartz", "Limestone",
  "Coal", "Sulfur", "Bauxite", "Crude Oil", "Water", "Nitrogen Gas", "SAM",
]);

// Tier at which each raw input becomes available (drives factory/recipe tier gating).
export const RAW_TIERS: Record<string, number> = {
  "Iron Ore": 0, "Copper Ore": 0, Limestone: 0, Water: 0,
  Coal: 3,
  "Caterium Ore": 5, "Raw Quartz": 5, "Crude Oil": 5, Sulfur: 5,
  "Nitrogen Gas": 7, Bauxite: 7,
  SAM: 8,
};

// Producers used only to cover positive residual demand for byproduct items after the
// main solve pass (generalizes recipes.py's Dark-Matter-Residue-from-SAM special case).
export const FALLBACK_PRODUCERS = new Set<string>([
  "Dark Matter Residue (from SAM)",
  "Heavy Oil Residue",
  // Silica is also a byproduct of the standard Alumina recipe; defer it so that byproduct
  // is netted against demand before the Quartz factory makes up the shortfall.
  "Silica",
]);

// id -> primary output it is registered as a fallback for.
export const FALLBACK_FOR: Record<string, string> = {
  "Dark Matter Residue (from SAM)": "Dark Matter Residue",
  "Heavy Oil Residue": "Heavy Oil Residue",
  "Silica": "Silica",
};

function r(
  name: string,
  product: string,
  building: string,
  inputs: Record<string, number>,
  outputs: Record<string, number>,
  cycleSeconds: number,
  opts: { alt?: boolean; power?: number; tier?: number } = {},
): Recipe {
  return {
    id: name,
    name,
    product,
    building,
    inputs,
    outputs,
    alt: opts.alt ?? false,
    cycleSeconds,
    powerOverrideMw: opts.power,
    tierOverride: opts.tier,
  };
}

export const RECIPES: Recipe[] = [
  // ---------------- PHASE 5 TARGETS & ENDGAME (single recipe each) ----------------
  r("Nuclear Pasta", "Nuclear Pasta", "Particle Accelerator",
    { "Copper Powder": 100, "Pressure Conversion Cube": 0.5 },
    { "Nuclear Pasta": 0.5 }, 120, { power: 1000 }),
  r("Biochemical Sculptor", "Biochemical Sculptor", "Blender",
    { "Assembly Director System": 0.5, "Ficsite Trigon": 40, Water: 10 },
    { "Biochemical Sculptor": 2 }, 120),
  r("AI Expansion Server", "AI Expansion Server", "Quantum Encoder",
    { "Magnetic Field Generator": 16, "Neural-Quantum Processor": 16, "Superposition Oscillator": 16, "Excited Photonic Matter": 128 },
    { "AI Expansion Server": 16, "Dark Matter Residue": 128 }, 15),
  r("Ballistic Warp Drive", "Ballistic Warp Drive", "Manufacturer",
    { "Thermal Propulsion Rocket": 1, "Singularity Cell": 5, "Superposition Oscillator": 2, "Dark Matter Crystal": 40 },
    { "Ballistic Warp Drive": 1 }, 60),

  // ---------------- QUANTUM / DARK MATTER ----------------
  r("Excited Photonic Matter", "Excited Photonic Matter", "Converter",
    {}, { "Excited Photonic Matter": 100 }, 6, { power: 250 }),
  r("Dark Matter Residue (from SAM)", "Dark Matter Residue", "Particle Accelerator",
    { "Reanimated SAM": 50 }, { "Dark Matter Residue": 500 }, 6, { power: 500 }),
  r("Singularity Cell", "Singularity Cell", "Manufacturer",
    { "Nuclear Pasta": 1, "Dark Matter Crystal": 20, "Iron Plate": 100, Concrete: 200 },
    { "Singularity Cell": 10 }, 60),
  r("Superposition Oscillator", "Superposition Oscillator", "Quantum Encoder",
    { "Dark Matter Crystal": 30, "Crystal Oscillator": 5, "Alclad Aluminum Sheet": 45, "Excited Photonic Matter": 60 },
    { "Superposition Oscillator": 15, "Dark Matter Residue": 60 }, 12),
  r("Neural-Quantum Processor", "Neural-Quantum Processor", "Quantum Encoder",
    { "Time Crystal": 15, Supercomputer: 3, "Ficsite Trigon": 45, "Excited Photonic Matter": 75 },
    { "Neural-Quantum Processor": 9, "Dark Matter Residue": 75 }, 20),
  r("Ficsite Trigon", "Ficsite Trigon", "Constructor",
    { "Ficsite Ingot": 10 }, { "Ficsite Trigon": 15 }, 12),
  r("Iron Ficsite Ingot", "Ficsite Ingot", "Converter",
    { "Reanimated SAM": 40, "Iron Ingot": 240 }, { "Ficsite Ingot": 10 }, 6, { power: 250 }),
  r("Reanimated SAM", "Reanimated SAM", "Constructor",
    { SAM: 120 }, { "Reanimated SAM": 30 }, 2),
  r("Time Crystal", "Time Crystal", "Particle Accelerator",
    { Diamond: 12 }, { "Time Crystal": 6 }, 10, { power: 500 }),

  // Dark Matter Crystal: standard (Diamonds + Residue) vs alt Dark Matter Trap (Time Crystal + Residue)
  r("Dark Matter Crystallization", "Dark Matter Crystal", "Particle Accelerator",
    { Diamond: 30, "Dark Matter Residue": 150 }, { "Dark Matter Crystal": 30 }, 2, { power: 500 }),
  r("Dark Matter Trap", "Dark Matter Crystal", "Particle Accelerator",
    { "Time Crystal": 30, "Dark Matter Residue": 150 }, { "Dark Matter Crystal": 60 },
    2, { alt: true, power: 1000 }),

  // Diamond: standard (Coal) vs alt Oil-Based Diamonds (Crude Oil)
  r("Diamonds", "Diamond", "Particle Accelerator",
    { Coal: 600 }, { Diamond: 30 }, 2, { power: 500 }),
  r("Oil-Based Diamonds", "Diamond", "Particle Accelerator",
    { "Crude Oil": 200 }, { Diamond: 40 }, 3, { alt: true, power: 500 }),

  // ---------------- PLATING / FRAMEWORK / ENGINE / PROPULSION ----------------
  r("Smart Plating", "Smart Plating", "Assembler",
    { "Reinforced Iron Plate": 2, Rotor: 2 }, { "Smart Plating": 2 }, 30),
  r("Versatile Framework", "Versatile Framework", "Assembler",
    { "Modular Frame": 2.5, "Steel Beam": 30 }, { "Versatile Framework": 5 }, 24),

  // Automated Wiring: standard (Assembler) vs alt Automated Speed Wiring (Manufacturer)
  r("Automated Wiring", "Automated Wiring", "Assembler",
    { Stator: 2.5, Cable: 50 }, { "Automated Wiring": 2.5 }, 24),
  r("Automated Speed Wiring", "Automated Wiring", "Manufacturer",
    { Stator: 3.75, Wire: 75, "High-Speed Connector": 1.875 }, { "Automated Wiring": 7.5 }, 32, { alt: true }),

  r("Modular Engine", "Modular Engine", "Manufacturer",
    { Motor: 2, Rubber: 15, "Smart Plating": 2 }, { "Modular Engine": 1 }, 60),
  r("Adaptive Control Unit", "Adaptive Control Unit", "Manufacturer",
    { "Automated Wiring": 5, "Circuit Board": 5, "Heavy Modular Frame": 1, Computer: 2 },
    { "Adaptive Control Unit": 1 }, 60),
  r("Assembly Director System", "Assembly Director System", "Assembler",
    { "Adaptive Control Unit": 1.5, Supercomputer: 0.75 }, { "Assembly Director System": 0.75 }, 80),
  // Magnetic Field Generator: mirrored from recipes.py (Manufacturer + Battery path).
  r("Magnetic Field Generator", "Magnetic Field Generator", "Manufacturer",
    { "Versatile Framework": 2.5, "Electromagnetic Control Rod": 1, Battery: 5 },
    { "Magnetic Field Generator": 1 }, 120),
  r("Thermal Propulsion Rocket", "Thermal Propulsion Rocket", "Manufacturer",
    { "Modular Engine": 2.5, "Turbo Motor": 1, "Cooling System": 3, "Fused Modular Frame": 1 },
    { "Thermal Propulsion Rocket": 1 }, 120),

  // ---------------- ELECTRONICS ----------------
  r("Quickwire", "Quickwire", "Constructor",
    { "Caterium Ingot": 12 }, { Quickwire: 60 }, 5),

  // Circuit Board: standard (Plastic) vs alt Silicon Circuit Board (Silica)
  r("Circuit Board", "Circuit Board", "Assembler",
    { "Copper Sheet": 15, Plastic: 30 }, { "Circuit Board": 7.5 }, 8),
  r("Silicon Circuit Board", "Circuit Board", "Assembler",
    { "Copper Sheet": 27.5, Silica: 27.5 }, { "Circuit Board": 12.5 }, 24, { alt: true }),

  // Computer: standard (Manufacturer) vs alt Crystal Computer (Assembler)
  r("Computer", "Computer", "Manufacturer",
    { "Circuit Board": 10, Cable: 20, Plastic: 40 }, { Computer: 2.5 }, 24),
  r("Crystal Computer", "Computer", "Assembler",
    { "Circuit Board": 2.8125, "Crystal Oscillator": 1.875 }, { Computer: 1.875 }, 64, { alt: true }),

  // Supercomputer: standard (Manufacturer) vs alt Super-State Computer (Manufacturer)
  r("Supercomputer", "Supercomputer", "Manufacturer",
    { Computer: 7.5, "AI Limiter": 3.75, "High-Speed Connector": 5.625, Plastic: 52.5 },
    { Supercomputer: 1.875 }, 32),
  r("Super-State Computer", "Supercomputer", "Manufacturer",
    { Computer: 4.8, "Electromagnetic Control Rod": 4.8, Battery: 7.2, Wire: 60 },
    { Supercomputer: 2.4 }, 25, { alt: true }),

  // AI Limiter: standard (Copper Sheet + Quickwire) vs alt Plastic AI Limiter
  r("AI Limiter", "AI Limiter", "Assembler",
    { "Copper Sheet": 25, Quickwire: 100 }, { "AI Limiter": 5 }, 12),
  r("Plastic AI Limiter", "AI Limiter", "Assembler",
    { Quickwire: 20, Plastic: 20 }, { "AI Limiter": 10 }, 12, { alt: true }),

  // High-Speed Connector: standard (Manufacturer) vs alt Silicon High-Speed Connector
  r("High-Speed Connector", "High-Speed Connector", "Manufacturer",
    { Quickwire: 210, Cable: 37.5, "Circuit Board": 3.75 }, { "High-Speed Connector": 3.75 }, 16),
  r("Silicon High-Speed Connector", "High-Speed Connector", "Manufacturer",
    { Quickwire: 36, Silica: 3, "Circuit Board": 3 }, { "High-Speed Connector": 1.5 }, 40, { alt: true }),

  // Crystal Oscillator: standard (Manufacturer) vs alt Insulated Crystal Oscillator
  r("Crystal Oscillator", "Crystal Oscillator", "Manufacturer",
    { "Quartz Crystal": 18, Cable: 14, "Reinforced Iron Plate": 2.5 }, { "Crystal Oscillator": 1 }, 120),
  r("Insulated Crystal Oscillator", "Crystal Oscillator", "Manufacturer",
    { "Quartz Crystal": 18.75, Rubber: 13.125, "AI Limiter": 16.875 }, { "Crystal Oscillator": 1.875 }, 32, { alt: true }),

  r("Electromagnetic Control Rod", "Electromagnetic Control Rod", "Assembler",
    { Stator: 6, "AI Limiter": 4 }, { "Electromagnetic Control Rod": 4 }, 30),

  // Radio Control Unit: standard (Manufacturer) vs alt Radio Control System
  r("Radio Control Unit", "Radio Control Unit", "Manufacturer",
    { "Aluminum Casing": 40, "Crystal Oscillator": 1.25, Computer: 2.5 }, { "Radio Control Unit": 2.5 }, 48),
  r("Radio Control System", "Radio Control Unit", "Manufacturer",
    { "Crystal Oscillator": 1.5, "Circuit Board": 15, "Aluminum Casing": 7.5 }, { "Radio Control Unit": 4.5 }, 40, { alt: true }),

  r("Battery", "Battery", "Blender",
    { "Sulfuric Acid": 50, "Alumina Solution": 40, "Aluminum Casing": 20 },
    { Battery: 20, Water: 30 }, 3),
  r("Pressure Conversion Cube", "Pressure Conversion Cube", "Assembler",
    { "Fused Modular Frame": 1, "Radio Control Unit": 2 }, { "Pressure Conversion Cube": 1 }, 60),

  // Turbo Motor: standard (Manufacturer) vs alt Turbo Electric Motor
  r("Turbo Motor", "Turbo Motor", "Manufacturer",
    { "Cooling System": 7.5, "Radio Control Unit": 3.75, Motor: 7.5, Rubber: 45 }, { "Turbo Motor": 1.875 }, 32),
  r("Turbo Electric Motor", "Turbo Motor", "Manufacturer",
    { "Electromagnetic Control Rod": 6.5625, Rotor: 8.4375, Motor: 4.6875, Wire: 6.5625 },
    { "Turbo Motor": 2.8125 }, 64, { alt: true }),

  // ---------------- BASIC ----------------
  r("Iron Plate", "Iron Plate", "Constructor",
    { "Iron Ingot": 30 }, { "Iron Plate": 20 }, 6),
  r("Copper Sheet", "Copper Sheet", "Constructor",
    { "Copper Ingot": 20 }, { "Copper Sheet": 10 }, 6),

  // Wire: standard (Copper) vs alt Iron Wire
  r("Wire", "Wire", "Constructor",
    { "Copper Ingot": 15 }, { Wire: 30 }, 4),
  r("Iron Wire", "Wire", "Constructor",
    { "Iron Ingot": 12.5 }, { Wire: 22.5 }, 24, { alt: true }),

  // Cable: standard (Wire) vs alt Coated Cable (Wire + Heavy Oil Residue)
  r("Cable", "Cable", "Constructor",
    { Wire: 60 }, { Cable: 30 }, 2),
  r("Coated Cable", "Cable", "Refinery",
    { Wire: 37.5, "Heavy Oil Residue": 15 }, { Cable: 67.5 }, 8, { alt: true }),

  // Iron Rod: standard (Iron) vs alt Steel Rod
  r("Iron Rod", "Iron Rod", "Constructor",
    { "Iron Ingot": 15 }, { "Iron Rod": 15 }, 4),
  r("Steel Rod", "Iron Rod", "Constructor",
    { "Steel Ingot": 12 }, { "Iron Rod": 48 }, 5, { alt: true }),

  // Screw: standard (Iron Rod) vs alts Cast Screw / Steel Screw
  r("Screw", "Screw", "Constructor",
    { "Iron Rod": 10 }, { Screw: 40 }, 6),
  r("Cast Screw", "Screw", "Constructor",
    { "Iron Ingot": 12.5 }, { Screw: 50 }, 24, { alt: true }),
  r("Steel Screw", "Screw", "Constructor",
    { "Steel Beam": 5 }, { Screw: 260 }, 12, { alt: true }),

  // Reinforced Iron Plate: standard (Screws) vs alt Stitched Iron Plate (Wire)
  r("Reinforced Iron Plate", "Reinforced Iron Plate", "Assembler",
    { "Iron Plate": 30, Screw: 60 }, { "Reinforced Iron Plate": 5 }, 12),
  r("Stitched Iron Plate", "Reinforced Iron Plate", "Assembler",
    { "Iron Plate": 18.75, Wire: 37.5 }, { "Reinforced Iron Plate": 5.625 }, 32, { alt: true }),

  r("Rotor", "Rotor", "Assembler",
    { "Iron Rod": 20, Screw: 100 }, { Rotor: 4 }, 15),

  // Modular Frame: standard vs alt Steeled Frame (Steel Pipe)
  r("Modular Frame", "Modular Frame", "Assembler",
    { "Reinforced Iron Plate": 3, "Iron Rod": 12 }, { "Modular Frame": 2 }, 60),
  r("Steeled Frame", "Modular Frame", "Assembler",
    { "Reinforced Iron Plate": 2, "Steel Pipe": 10 }, { "Modular Frame": 3 }, 60, { alt: true }),

  // ---------------- STEEL ----------------
  // Steel Beam: standard (Steel) vs alt Aluminum Beam
  r("Steel Beam", "Steel Beam", "Constructor",
    { "Steel Ingot": 60 }, { "Steel Beam": 15 }, 4),
  r("Aluminum Beam", "Steel Beam", "Constructor",
    { "Aluminum Ingot": 22.5 }, { "Steel Beam": 22.5 }, 8, { alt: true }),

  r("Steel Pipe", "Steel Pipe", "Constructor",
    { "Steel Ingot": 30 }, { "Steel Pipe": 20 }, 6),
  r("Encased Industrial Beam", "Encased Industrial Beam", "Assembler",
    { "Steel Beam": 18, Concrete: 36 }, { "Encased Industrial Beam": 6 }, 10),
  r("Stator", "Stator", "Assembler",
    { "Steel Pipe": 15, Wire: 40 }, { Stator: 5 }, 12),

  // Motor: standard (Rotor + Stator) vs alt Electric Motor (ECR + Rotor)
  r("Motor", "Motor", "Assembler",
    { Rotor: 10, Stator: 10 }, { Motor: 5 }, 12),
  r("Electric Motor", "Motor", "Assembler",
    { "Electromagnetic Control Rod": 3.75, Rotor: 7.5 }, { Motor: 7.5 }, 16, { alt: true }),

  // Heavy Modular Frame: standard (Manufacturer, Screws) vs alts Heavy Encased / Heavy Flexible Frame.
  // (recipes.py labeled "Heat-Fused Frame" as a Heavy Modular Frame alt, but the wiki shows
  //  Heat-Fused Frame actually produces *Fused* Modular Frame — corrected below.)
  r("Heavy Modular Frame", "Heavy Modular Frame", "Manufacturer",
    { "Modular Frame": 10, "Steel Pipe": 40, "Encased Industrial Beam": 10, Screw: 240 },
    { "Heavy Modular Frame": 2 }, 30),
  r("Heavy Encased Frame", "Heavy Modular Frame", "Manufacturer",
    { "Modular Frame": 7.5, "Encased Industrial Beam": 9.375, "Steel Pipe": 33.75, Concrete: 20.625 },
    { "Heavy Modular Frame": 2.8125 }, 64, { alt: true }),
  r("Heavy Flexible Frame", "Heavy Modular Frame", "Manufacturer",
    { "Modular Frame": 18.75, "Encased Industrial Beam": 11.25, Rubber: 75, Screw: 390 },
    { "Heavy Modular Frame": 3.75 }, 16, { alt: true }),

  // ---------------- ALUMINUM ----------------
  r("Alclad Aluminum Sheet", "Alclad Aluminum Sheet", "Assembler",
    { "Aluminum Ingot": 30, "Copper Ingot": 10 }, { "Alclad Aluminum Sheet": 30 }, 6),
  r("Aluminum Casing", "Aluminum Casing", "Constructor",
    { "Aluminum Ingot": 90 }, { "Aluminum Casing": 60 }, 2),
  r("Cooling System", "Cooling System", "Blender",
    { "Heat Sink": 12, Rubber: 12, Water: 30, "Nitrogen Gas": 150 }, { "Cooling System": 6 }, 10),
  r("Heat Sink", "Heat Sink", "Assembler",
    { "Alclad Aluminum Sheet": 37.5, "Copper Sheet": 22.5 }, { "Heat Sink": 7.5 }, 8),
  // Fused Modular Frame: standard (Blender, Nitrogen Gas) vs alt Heat-Fused Frame (Nitric Acid + Fuel)
  r("Fused Modular Frame", "Fused Modular Frame", "Blender",
    { "Heavy Modular Frame": 1.5, "Aluminum Ingot": 75, "Nitrogen Gas": 37.5 }, { "Fused Modular Frame": 1.5 }, 40),
  r("Heat-Fused Frame", "Fused Modular Frame", "Blender",
    { "Heavy Modular Frame": 3, "Aluminum Ingot": 150, "Nitric Acid": 24, Fuel: 30 },
    { "Fused Modular Frame": 3 }, 20, { alt: true }),

  // ---------------- OIL ----------------
  // Plastic: standard (Crude Oil) vs alt Residual Plastic (Polymer Resin)
  r("Plastic", "Plastic", "Refinery",
    { "Crude Oil": 30 }, { Plastic: 20, "Heavy Oil Residue": 10 }, 6),
  r("Residual Plastic", "Plastic", "Refinery",
    { "Polymer Resin": 60, Water: 20 }, { Plastic: 20 }, 6, { alt: true }),

  // Rubber: standard (Crude Oil) vs alt Residual Rubber (Polymer Resin)
  r("Rubber", "Rubber", "Refinery",
    { "Crude Oil": 30 }, { Rubber: 20, "Heavy Oil Residue": 20 }, 6),
  r("Residual Rubber", "Rubber", "Refinery",
    { "Polymer Resin": 40, Water: 40 }, { Rubber: 20 }, 6, { alt: true }),

  // Polymer Resin — support producer (only needed when Residual Plastic/Rubber selected).
  r("Polymer Resin", "Polymer Resin", "Refinery",
    { "Crude Oil": 600 }, { "Polymer Resin": 1300, "Heavy Oil Residue": 200 }, 6, { tier: 5 }),
  // Heavy Oil Residue — fallback producer for HOR shortfall (Coated Cable demand).
  r("Heavy Oil Residue", "Heavy Oil Residue", "Refinery",
    { "Crude Oil": 300 }, { "Heavy Oil Residue": 400, "Polymer Resin": 200 }, 6, { tier: 5 }),

  // ---------------- NITROGEN / ACIDS ----------------
  r("Nitric Acid", "Nitric Acid", "Blender",
    { "Nitrogen Gas": 120, "Iron Plate": 30, Water: 10 }, { "Nitric Acid": 40 }, 6),
  r("Sulfuric Acid", "Sulfuric Acid", "Refinery",
    { Sulfur: 50, Water: 50 }, { "Sulfuric Acid": 50 }, 6),

  // Alumina Solution: standard (Bauxite + Water, Silica byproduct) vs alt Sloppy Alumina
  r("Alumina Solution", "Alumina Solution", "Refinery",
    { Bauxite: 120, Water: 180 }, { "Alumina Solution": 120, Silica: 50 }, 6),
  r("Sloppy Alumina", "Alumina Solution", "Refinery",
    { Bauxite: 200, Water: 200 }, { "Alumina Solution": 240 }, 3, { alt: true }),

  // ---------------- SMELTING / BASE MATERIALS ----------------
  // Ingots, concrete, quartz, silica and fuel — now produced from raw ore/resources rather
  // than belted in, so ore + power totals are accurate. Each is a standard recipe.
  r("Iron Ingot", "Iron Ingot", "Smelter",
    { "Iron Ore": 30 }, { "Iron Ingot": 30 }, 2),
  r("Copper Ingot", "Copper Ingot", "Smelter",
    { "Copper Ore": 30 }, { "Copper Ingot": 30 }, 2),
  r("Caterium Ingot", "Caterium Ingot", "Smelter",
    { "Caterium Ore": 45 }, { "Caterium Ingot": 15 }, 4),
  r("Steel Ingot", "Steel Ingot", "Foundry",
    { "Iron Ore": 45, Coal: 45 }, { "Steel Ingot": 45 }, 4),
  r("Concrete", "Concrete", "Constructor",
    { Limestone: 45 }, { Concrete: 15 }, 4),
  r("Quartz Crystal", "Quartz Crystal", "Constructor",
    { "Raw Quartz": 37.5 }, { "Quartz Crystal": 22.5 }, 8),
  r("Silica", "Silica", "Constructor",
    { "Raw Quartz": 22.5 }, { Silica: 37.5 }, 8),
  // Fuel — only consumed by alternates (e.g. Heat-Fused Frame). Polymer Resin is a byproduct.
  r("Fuel", "Fuel", "Refinery",
    { "Crude Oil": 60 }, { Fuel: 40, "Polymer Resin": 30 }, 6, { tier: 5 }),

  // Aluminum smelting chain: Bauxite -> Alumina (Silica byproduct) -> Scrap -> Ingot.
  r("Aluminum Scrap", "Aluminum Scrap", "Refinery",
    { "Alumina Solution": 240, Coal: 120 }, { "Aluminum Scrap": 360 }, 1),
  // Aluminum Ingot: standard (Foundry, with Silica) vs alt Pure Aluminum Ingot (Smelter, no Silica)
  r("Aluminum Ingot", "Aluminum Ingot", "Foundry",
    { "Aluminum Scrap": 90, Silica: 75 }, { "Aluminum Ingot": 60 }, 4),
  r("Pure Aluminum Ingot", "Aluminum Ingot", "Smelter",
    { "Aluminum Scrap": 60 }, { "Aluminum Ingot": 30 }, 2, { alt: true }),

  // ---------------- COPPER POWDER ----------------
  r("Copper Powder", "Copper Powder", "Constructor",
    { "Copper Ingot": 300 }, { "Copper Powder": 50 }, 6),

  // ================================================================
  // FULL ALTERNATE SET (all wiki alternates for the plan's products),
  // plus the standard recipes for items only the alternates introduce.
  // Supporting recipes are alt:false so they only run when an alt demands them.
  // ================================================================

  // -- supporting standard recipes for alt-only inputs --
  r("Petroleum Coke", "Petroleum Coke", "Refinery",
    { "Heavy Oil Residue": 40 }, { "Petroleum Coke": 120 }, 6, { tier: 5 }),
  r("Compacted Coal", "Compacted Coal", "Assembler",
    { Coal: 25, Sulfur: 25 }, { "Compacted Coal": 25 }, 12, { tier: 5 }),
  r("Turbofuel", "Turbofuel", "Refinery",
    { Fuel: 22.5, "Compacted Coal": 15 }, { Turbofuel: 18.75 }, 16, { tier: 6 }),
  r("Empty Canister", "Empty Canister", "Constructor",
    { Plastic: 30 }, { "Empty Canister": 60 }, 4, { tier: 5 }),
  r("Packaged Turbofuel", "Packaged Turbofuel", "Packager",
    { Turbofuel: 20, "Empty Canister": 20 }, { "Packaged Turbofuel": 20 }, 6, { tier: 6 }),
  r("Empty Fluid Tank", "Empty Fluid Tank", "Constructor",
    { "Aluminum Ingot": 60 }, { "Empty Fluid Tank": 60 }, 1, { tier: 7 }),
  r("Packaged Nitrogen Gas", "Packaged Nitrogen Gas", "Packager",
    { "Nitrogen Gas": 240, "Empty Fluid Tank": 60 }, { "Packaged Nitrogen Gas": 60 }, 1, { tier: 7 }),

  // -- Reinforced Iron Plate --
  r("Adhered Iron Plate", "Reinforced Iron Plate", "Assembler",
    { "Iron Plate": 11.25, Rubber: 3.75 }, { "Reinforced Iron Plate": 3.75 }, 16, { alt: true }),
  r("Bolted Iron Plate", "Reinforced Iron Plate", "Assembler",
    { "Iron Plate": 90, Screw: 250 }, { "Reinforced Iron Plate": 15 }, 12, { alt: true }),

  // -- Iron Rod --
  r("Aluminum Rod", "Iron Rod", "Constructor",
    { "Aluminum Ingot": 7.5 }, { "Iron Rod": 52.5 }, 8, { alt: true }),

  // -- Iron Plate --
  r("Coated Iron Plate", "Iron Plate", "Assembler",
    { "Iron Ingot": 37.5, Plastic: 7.5 }, { "Iron Plate": 75 }, 8, { alt: true }),
  r("Steel Cast Plate", "Iron Plate", "Foundry",
    { "Iron Ingot": 15, "Steel Ingot": 15 }, { "Iron Plate": 45 }, 4, { alt: true }),

  // -- Wire --
  r("Caterium Wire", "Wire", "Constructor",
    { "Caterium Ingot": 15 }, { Wire: 120 }, 4, { alt: true }),
  r("Fused Wire", "Wire", "Assembler",
    { "Copper Ingot": 12, "Caterium Ingot": 3 }, { Wire: 90 }, 20, { alt: true }),

  // -- Cable --
  r("Insulated Cable", "Cable", "Assembler",
    { Wire: 45, Rubber: 30 }, { Cable: 100 }, 12, { alt: true }),
  r("Quickwire Cable", "Cable", "Assembler",
    { Quickwire: 7.5, Rubber: 5 }, { Cable: 27.5 }, 24, { alt: true }),

  // -- Copper Sheet --
  r("Steamed Copper Sheet", "Copper Sheet", "Refinery",
    { "Copper Ingot": 22.5, Water: 22.5 }, { "Copper Sheet": 22.5 }, 8, { alt: true }),

  // -- Rotor --
  r("Copper Rotor", "Rotor", "Assembler",
    { "Copper Sheet": 22.5, Screw: 195 }, { Rotor: 11.25 }, 16, { alt: true }),
  r("Steel Rotor", "Rotor", "Assembler",
    { "Steel Pipe": 10, Wire: 30 }, { Rotor: 5 }, 12, { alt: true }),

  // -- Modular Frame --
  r("Bolted Frame", "Modular Frame", "Assembler",
    { "Reinforced Iron Plate": 7.5, Screw: 140 }, { "Modular Frame": 5 }, 24, { alt: true }),

  // -- Stator --
  r("Quickwire Stator", "Stator", "Assembler",
    { "Steel Pipe": 16, Quickwire: 60 }, { Stator: 8 }, 15, { alt: true }),

  // -- Motor --
  r("Rigor Motor", "Motor", "Manufacturer",
    { Rotor: 3.75, Stator: 3.75, "Crystal Oscillator": 1.25 }, { Motor: 7.5 }, 48, { alt: true }),

  // -- Steel Beam --
  r("Molded Beam", "Steel Beam", "Foundry",
    { "Steel Ingot": 120, Concrete: 80 }, { "Steel Beam": 45 }, 12, { alt: true }),

  // -- Steel Pipe --
  r("Iron Pipe", "Steel Pipe", "Constructor",
    { "Iron Ingot": 100 }, { "Steel Pipe": 25 }, 12, { alt: true }),
  r("Molded Steel Pipe", "Steel Pipe", "Foundry",
    { "Steel Ingot": 50, Concrete: 30 }, { "Steel Pipe": 50 }, 6, { alt: true }),

  // -- Encased Industrial Beam --
  r("Encased Industrial Pipe", "Encased Industrial Beam", "Assembler",
    { "Steel Pipe": 24, Concrete: 20 }, { "Encased Industrial Beam": 4 }, 15, { alt: true }),

  // -- Circuit Board --
  r("Caterium Circuit Board", "Circuit Board", "Assembler",
    { Plastic: 12.5, Quickwire: 37.5 }, { "Circuit Board": 8.75 }, 48, { alt: true }),
  r("Electrode Circuit Board", "Circuit Board", "Assembler",
    { Rubber: 20, "Petroleum Coke": 40 }, { "Circuit Board": 5 }, 12, { alt: true }),

  // -- Computer --
  r("Caterium Computer", "Computer", "Manufacturer",
    { "Circuit Board": 15, Quickwire: 52.5, Rubber: 22.5 }, { Computer: 3.75 }, 16, { alt: true }),

  // -- Supercomputer --
  r("OC Supercomputer", "Supercomputer", "Assembler",
    { "Radio Control Unit": 6, "Cooling System": 6 }, { Supercomputer: 3 }, 20, { alt: true }),

  // -- Quickwire --
  r("Fused Quickwire", "Quickwire", "Assembler",
    { "Caterium Ingot": 7.5, "Copper Ingot": 37.5 }, { Quickwire: 90 }, 8, { alt: true }),

  // -- Radio Control Unit --
  r("Radio Connection Unit", "Radio Control Unit", "Manufacturer",
    { "Heat Sink": 15, "High-Speed Connector": 7.5, "Quartz Crystal": 45 },
    { "Radio Control Unit": 3.75 }, 16, { alt: true }),

  // -- Smart Plating --
  r("Plastic Smart Plating", "Smart Plating", "Manufacturer",
    { "Reinforced Iron Plate": 2.5, Rotor: 2.5, Plastic: 7.5 }, { "Smart Plating": 5 }, 24, { alt: true }),

  // -- Versatile Framework --
  r("Flexible Framework", "Versatile Framework", "Manufacturer",
    { "Modular Frame": 3.75, "Steel Beam": 22.5, Rubber: 30 }, { "Versatile Framework": 7.5 }, 16, { alt: true }),

  // -- Turbo Motor --
  r("Turbo Pressure Motor", "Turbo Motor", "Manufacturer",
    { Motor: 7.5, "Pressure Conversion Cube": 1.875, "Packaged Nitrogen Gas": 45, Stator: 15 },
    { "Turbo Motor": 3.75 }, 32, { alt: true }),

  // -- Plastic / Rubber (the Recycled pair forms a cycle ONLY if BOTH are selected) --
  r("Recycled Plastic", "Plastic", "Refinery",
    { Rubber: 30, Fuel: 30 }, { Plastic: 60 }, 12, { alt: true }),
  r("Recycled Rubber", "Rubber", "Refinery",
    { Plastic: 30, Fuel: 30 }, { Rubber: 60 }, 12, { alt: true }),

  // -- Aluminum Casing --
  r("Alclad Casing", "Aluminum Casing", "Assembler",
    { "Aluminum Ingot": 150, "Copper Ingot": 75 }, { "Aluminum Casing": 112.5 }, 8, { alt: true }),

  // -- Heat Sink --
  r("Heat Exchanger", "Heat Sink", "Assembler",
    { "Aluminum Casing": 30, Rubber: 30 }, { "Heat Sink": 10 }, 6, { alt: true }),

  // -- Cooling System --
  r("Cooling Device", "Cooling System", "Blender",
    { "Heat Sink": 10, Motor: 2.5, "Nitrogen Gas": 60 }, { "Cooling System": 5 }, 24, { alt: true }),

  // -- Diamond --
  r("Cloudy Diamonds", "Diamond", "Particle Accelerator",
    { Coal: 240, Limestone: 480 }, { Diamond: 20 }, 3, { alt: true, power: 500 }),
  r("Petroleum Diamonds", "Diamond", "Particle Accelerator",
    { "Petroleum Coke": 720 }, { Diamond: 30 }, 2, { alt: true, power: 500 }),
  r("Pink Diamonds", "Diamond", "Converter",
    { Coal: 120, "Quartz Crystal": 45 }, { Diamond: 15 }, 4, { alt: true, power: 250 }),
  r("Turbo Diamonds", "Diamond", "Particle Accelerator",
    { Coal: 600, "Packaged Turbofuel": 40 }, { Diamond: 60 }, 3, { alt: true, power: 500 }),

  // -- Dark Matter Crystal --
  r("Dark Matter Crystallization (Residue)", "Dark Matter Crystal", "Particle Accelerator",
    { "Dark Matter Residue": 200 }, { "Dark Matter Crystal": 20 }, 3, { alt: true, power: 1000 }),

  // -- Battery --
  r("Classic Battery", "Battery", "Manufacturer",
    { Sulfur: 45, "Alclad Aluminum Sheet": 52.5, Plastic: 60, Wire: 90 }, { Battery: 30 }, 8, { alt: true }),

  // ================================================================
  // BASE-MATERIAL ALTERNATES — the ingots / concrete / quartz / silica / scrap / fuel
  // recipes were modeled standard-only above; here are their full wiki alternate sets.
  // (Petroleum Coke / Compacted Coal supporting recipes already exist above.)
  // ================================================================

  // -- Steel Ingot --
  r("Solid Steel Ingot", "Steel Ingot", "Foundry",
    { "Iron Ingot": 40, Coal: 40 }, { "Steel Ingot": 60 }, 3, { alt: true }),
  r("Coke Steel Ingot", "Steel Ingot", "Foundry",
    { "Iron Ore": 75, "Petroleum Coke": 75 }, { "Steel Ingot": 100 }, 12, { alt: true }),
  r("Compacted Steel Ingot", "Steel Ingot", "Foundry",
    { "Iron Ore": 5, "Compacted Coal": 2.5 }, { "Steel Ingot": 10 }, 24, { alt: true }),

  // -- Iron Ingot --
  r("Iron Alloy Ingot", "Iron Ingot", "Foundry",
    { "Iron Ore": 40, "Copper Ore": 10 }, { "Iron Ingot": 75 }, 12, { alt: true }),
  r("Leached Iron Ingot", "Iron Ingot", "Refinery",
    { "Iron Ore": 50, "Sulfuric Acid": 10 }, { "Iron Ingot": 100 }, 6, { alt: true }),
  r("Pure Iron Ingot", "Iron Ingot", "Refinery",
    { "Iron Ore": 35, Water: 20 }, { "Iron Ingot": 65 }, 12, { alt: true }),

  // -- Copper Ingot --
  r("Copper Alloy Ingot", "Copper Ingot", "Foundry",
    { "Copper Ore": 50, "Iron Ore": 50 }, { "Copper Ingot": 100 }, 6, { alt: true }),
  r("Leached Copper Ingot", "Copper Ingot", "Refinery",
    { "Copper Ore": 45, "Sulfuric Acid": 25 }, { "Copper Ingot": 110 }, 12, { alt: true }),
  r("Pure Copper Ingot", "Copper Ingot", "Refinery",
    { "Copper Ore": 15, Water: 10 }, { "Copper Ingot": 37.5 }, 24, { alt: true }),
  r("Tempered Copper Ingot", "Copper Ingot", "Foundry",
    { "Copper Ore": 25, "Petroleum Coke": 40 }, { "Copper Ingot": 60 }, 12, { alt: true }),

  // -- Caterium Ingot --
  r("Pure Caterium Ingot", "Caterium Ingot", "Refinery",
    { "Caterium Ore": 24, Water: 24 }, { "Caterium Ingot": 12 }, 5, { alt: true }),
  r("Tempered Caterium Ingot", "Caterium Ingot", "Foundry",
    { "Caterium Ore": 45, "Petroleum Coke": 15 }, { "Caterium Ingot": 22.5 }, 8, { alt: true }),
  r("Leached Caterium Ingot", "Caterium Ingot", "Refinery",
    { "Caterium Ore": 54, "Sulfuric Acid": 30 }, { "Caterium Ingot": 36 }, 10, { alt: true }),

  // -- Concrete --
  r("Rubber Concrete", "Concrete", "Assembler",
    { Limestone: 100, Rubber: 20 }, { Concrete: 90 }, 6, { alt: true }),
  r("Wet Concrete", "Concrete", "Refinery",
    { Limestone: 120, Water: 100 }, { Concrete: 80 }, 3, { alt: true }),
  r("Fine Concrete", "Concrete", "Assembler",
    { Silica: 15, Limestone: 60 }, { Concrete: 50 }, 12, { alt: true }),

  // -- Quartz Crystal / Silica --
  // (Quartz Purification + Distilled Silica are intentionally omitted: they bridge via
  //  Dissolved Silica, a fluid nothing else here produces, so Distilled Silica alone would
  //  pull a phantom raw input. Standalone Quartz/Silica alts only.)
  r("Fused Quartz Crystal", "Quartz Crystal", "Foundry",
    { "Raw Quartz": 75, Coal: 36 }, { "Quartz Crystal": 54 }, 20, { alt: true }),
  r("Pure Quartz Crystal", "Quartz Crystal", "Refinery",
    { "Raw Quartz": 67.5, Water: 37.5 }, { "Quartz Crystal": 52.5 }, 8, { alt: true }),
  r("Cheap Silica", "Silica", "Assembler",
    { "Raw Quartz": 22.5, Limestone: 37.5 }, { Silica: 52.5 }, 8, { alt: true }),

  // -- Aluminum Scrap --
  r("Electrode Aluminum Scrap", "Aluminum Scrap", "Refinery",
    { "Alumina Solution": 180, "Petroleum Coke": 60 }, { "Aluminum Scrap": 300, Water: 105 }, 4, { alt: true }),
  // Instant Scrap (Blender) takes 60 Water/min and returns 50/min; netted to a single
  // 10/min input so it doesn't register a phantom 50/min water byproduct. Because of that
  // netting, cycleSeconds-based Recipe Parts Cost Multiplier scaling on the Water figure here
  // is an approximation (the real per-cycle Water input is 6, not the netted 1).
  r("Instant Scrap", "Aluminum Scrap", "Blender",
    { Bauxite: 150, Coal: 100, "Sulfuric Acid": 50, Water: 10 }, { "Aluminum Scrap": 300 }, 6, { alt: true }),

  // -- Fuel --
  r("Diluted Fuel", "Fuel", "Blender",
    { "Heavy Oil Residue": 50, Water: 100 }, { Fuel: 100 }, 6, { alt: true }),
];

// Sub-factory groupings, keyed by product (mirrors recipes.py SUB_FACTORIES,
// with the newly-modeled basic parts folded into Basic / Steel / Oil).
export const SUB_FACTORIES: Record<string, string[]> = {
  Plating: ["Smart Plating"],
  Framework: ["Versatile Framework", "Automated Wiring"],
  Engine: ["Modular Engine", "Adaptive Control Unit"],
  Propulsion: [
    "Assembly Director System", "Magnetic Field Generator",
    "Nuclear Pasta", "Thermal Propulsion Rocket",
  ],
  "Final Assembly": ["Biochemical Sculptor", "AI Expansion Server", "Ballistic Warp Drive"],
  "Dark Matter": [
    "Singularity Cell", "Dark Matter Residue", "Dark Matter Crystal", "Superposition Oscillator",
  ],
  Quantum: [
    "Time Crystal", "Diamond", "Excited Photonic Matter", "Ficsite Trigon",
    "Ficsite Ingot", "Reanimated SAM", "Neural-Quantum Processor",
  ],
  Nitrogen: ["Nitric Acid", "Sulfuric Acid", "Packaged Nitrogen Gas"],
  Aluminum: [
    "Alclad Aluminum Sheet", "Aluminum Casing", "Cooling System", "Heat Sink",
    "Fused Modular Frame", "Alumina Solution", "Empty Fluid Tank",
    "Aluminum Scrap", "Aluminum Ingot",
  ],
  Oil: [
    "Plastic", "Rubber", "Polymer Resin", "Heavy Oil Residue", "Fuel",
    "Petroleum Coke", "Compacted Coal", "Turbofuel", "Empty Canister", "Packaged Turbofuel",
  ],
  Steel: [
    "Steel Ingot", "Steel Beam", "Steel Pipe", "Encased Industrial Beam",
    "Heavy Modular Frame", "Stator", "Motor",
  ],
  // Smelting / base-material factories.
  Iron: ["Iron Ingot"],
  Copper: ["Copper Ingot"],
  Caterium: ["Caterium Ingot"],
  Concrete: ["Concrete"],
  Quartz: ["Quartz Crystal", "Silica"],
  // Early electronic components (basic logic / control parts).
  Electronics: [
    "Quickwire", "Circuit Board", "AI Limiter", "Crystal Oscillator",
    "Electromagnetic Control Rod", "Computer", "High-Speed Connector", "Supercomputer",
  ],
  // Late electronics — aluminum-dependent control parts and nuclear-era components.
  "Advanced Electronics": [
    "Radio Control Unit", "Battery", "Pressure Conversion Cube", "Turbo Motor",
  ],
  Basic: [
    "Iron Plate", "Copper Sheet", "Wire", "Reinforced Iron Plate", "Iron Rod",
    "Screw", "Cable", "Rotor", "Modular Frame",
  ],
  "Copper Powder": ["Copper Powder"],
};

export const TARGETS: Record<string, number> = {
  "Nuclear Pasta": 4,
  "Biochemical Sculptor": 4,
  "AI Expansion Server": 1,
  "Ballistic Warp Drive": 1,
};

// Two display tracks: the Project Assembly line (the Space Elevator deliverables) and the
// Support factories that feed it.
export type Track = "assembly" | "support";

// Explicit per-factory build order (`tier`) and `track`. This drives the factory list
// ordering, the future-graying, the tier badges, and the tier-filtered totals — set to the
// real build sequence rather than a naive longest-dependency calc. Key order within a tier
// is the display order, so arrange these in the sequence you'd actually build them.
export const FACTORY_META: Record<string, { track: Track; tier: number }> = {
  // ----- Project Assembly line -----
  Plating: { track: "assembly", tier: 2 },
  Framework: { track: "assembly", tier: 3 },
  Engine: { track: "assembly", tier: 6 },
  Propulsion: { track: "assembly", tier: 8 },
  "Final Assembly": { track: "assembly", tier: 9 },

  // ----- Support factories -----
  Iron: { track: "support", tier: 0 },
  Copper: { track: "support", tier: 0 },
  Concrete: { track: "support", tier: 0 },
  Basic: { track: "support", tier: 2 },
  Steel: { track: "support", tier: 3 },
  Electronics: { track: "support", tier: 4 },
  Oil: { track: "support", tier: 5 },
  Quartz: { track: "support", tier: 5 },
  Caterium: { track: "support", tier: 5 },
  Nitrogen: { track: "support", tier: 7 },
  Aluminum: { track: "support", tier: 7 },
  "Advanced Electronics": { track: "support", tier: 7 },
  "Copper Powder": { track: "support", tier: 8 },
  Quantum: { track: "support", tier: 8 },
  "Dark Matter": { track: "support", tier: 9 },
};

// Stable display order index (position in FACTORY_META), used to break tier ties.
export const FACTORY_ORDER: Record<string, number> = Object.fromEntries(
  Object.keys(FACTORY_META).map((name, i) => [name, i]),
);

// "Make on-site" candidates: cheap commodity parts you'd build inside each factory that
// needs them rather than belt from a central hub. Toggling one local keeps it in the
// power / raw totals but folds its machines into each consumer and hides it from the
// inter-factory interface flows (so you don't pipe Screws everywhere). Order = display order.
export const ONSITE_CANDIDATES: string[] = [
  // Smelting / base materials — default OFF, so they're made in dedicated smelting
  // factories and belted; toggle on to fold the smelters into each consumer instead.
  "Iron Ingot", "Copper Ingot", "Concrete",
  "Caterium Ingot",
  "Quartz Crystal", "Silica",
  "Screw", "Wire", "Iron Rod", "Cable", "Iron Plate", "Copper Sheet",
  "Steel Ingot",
  "Steel Pipe", "Steel Beam", "Quickwire", "Aluminum Casing",
  "Rotor", "Reinforced Iron Plate", "Modular Frame", "Stator",
  "Fuel",
  "Aluminum Ingot",
];

export const ONSITE_DEFAULT: string[] = [];

// product -> subfactory reverse lookup.
export const PRODUCT_SUBFACTORY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [sf, items] of Object.entries(SUB_FACTORIES)) {
    for (const it of items) map[it] = sf;
  }
  return map;
})();

export function findSubfactory(product: string): string {
  return PRODUCT_SUBFACTORY[product] ?? "Other";
}
