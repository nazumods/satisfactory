// AWESOME Sink point values (source: satisfactory.wiki.gg). Fluids (Water, Nitrogen Gas,
// Crude Oil, Heavy Oil Residue, Fuel, Turbofuel, Nitric Acid, Sulfuric Acid, Alumina Solution)
// and two quantum-era specials (Excited Photonic Matter, Dark Matter Residue) aren't sinkable
// in-game and have no entry here — that absence is used to exclude them from Optimize mode.
export const SINK_VALUES: Record<string, number> = {
  // Raw ores
  "Iron Ore": 1,
  "Copper Ore": 3,
  "Caterium Ore": 7,
  "Raw Quartz": 15,
  Limestone: 2,
  Coal: 3,
  Sulfur: 11,
  Bauxite: 8,
  SAM: 20,

  // Ingots / base materials
  "Iron Ingot": 2,
  "Copper Ingot": 6,
  "Caterium Ingot": 42,
  "Steel Ingot": 8,
  Concrete: 12,
  "Quartz Crystal": 50,
  Silica: 20,
  "Aluminum Scrap": 27,
  "Aluminum Ingot": 131,
  "Copper Powder": 72,

  // Basic parts
  "Iron Plate": 6,
  "Iron Rod": 4,
  Screw: 2,
  Wire: 6,
  Cable: 24,
  "Copper Sheet": 24,
  "Reinforced Iron Plate": 120,
  Rotor: 140,
  "Modular Frame": 408,
  "Steel Beam": 64,
  "Steel Pipe": 24,
  "Encased Industrial Beam": 528,
  Stator: 240,
  Motor: 1520,
  "Heavy Modular Frame": 10800,

  // Aluminum chain
  "Alclad Aluminum Sheet": 266,
  "Aluminum Casing": 393,
  "Cooling System": 12006,
  "Heat Sink": 2804,
  "Fused Modular Frame": 62840,

  // Oil chain (solids only — fluids excluded)
  Plastic: 75,
  Rubber: 60,
  "Polymer Resin": 12,
  "Petroleum Coke": 20,
  "Compacted Coal": 28,
  "Packaged Turbofuel": 570,
  "Empty Canister": 60,
  "Empty Fluid Tank": 170,
  "Packaged Nitrogen Gas": 312,

  // Electronics
  Quickwire: 17,
  "Circuit Board": 696,
  Computer: 8352,
  Supercomputer: 97352,
  "AI Limiter": 920,
  "High-Speed Connector": 3776,
  "Crystal Oscillator": 3072,
  "Electromagnetic Control Rod": 2560,
  "Radio Control Unit": 32352,
  Battery: 465,
  "Pressure Conversion Cube": 265632,
  "Turbo Motor": 240496,

  // Project Assembly chain
  "Smart Plating": 520,
  "Versatile Framework": 1176,
  "Automated Wiring": 1440,
  "Modular Engine": 9960,
  "Adaptive Control Unit": 76368,
  "Assembly Director System": 500176,
  "Magnetic Field Generator": 11000,
  "Thermal Propulsion Rocket": 728508,
  "Nuclear Pasta": 597652,

  // Quantum / Dark Matter
  Diamond: 240,
  "Time Crystal": 960,
  "Dark Matter Crystal": 1780,
  "Ficsite Ingot": 1968,
  "Ficsite Trigon": 1291,
  "Reanimated SAM": 160,
  "Neural-Quantum Processor": 248034,
  "Superposition Oscillator": 37292,
  "Singularity Cell": 114675,

  // Phase 5 endgame targets
  "Biochemical Sculptor": 301778,
  "AI Expansion Server": 728508,
  "Ballistic Warp Drive": 2895334,
};
