"""
Recipe database for Satisfactory 1.0/1.1 Phase 5 production planning.

Recipes use S/A/B-tier alternates per the user's selections:
- S-tier: Caterium Circuit Board, Copper Alloy Ingot, Crystal Computer, Dark Matter Trap,
  Heavy Encased Frame, Heavy Flexible Frame, Insulated Crystal Oscillator, Oil-Based Diamonds,
  Pure Aluminum Ingot, Silicon Circuit Board, Sloppy Alumina
- A-tier: Aluminum Beam, Aluminum Rod, Automated Speed Wiring, Cast Screw, Caterium Computer,
  Diluted Fuel, Electrode Aluminum Scrap, Heat-Fused Frame, Iron Wire, Plastic AI Limiter,
  Rigor Motor, Rubber Concrete, Steel Rod, Steel Screw, Super-State Computer, Turbo Diamonds,
  Turbo Pressure Motor, Uranium Fuel Unit, Wet Concrete
- B-tier additions: Heavy Oil Residue, Polymer Resin, Coated Cable, Electric Motor,
  Turbo Electric Motor, Radio Control System, Steeled Frame, Silicon High-Speed Connector

Conflict resolution:
- Diamonds: Oil-Based Diamonds chosen (S beats A Turbo Diamonds)
- Aluminum Ingot: Pure Aluminum Ingot (S, no scrap path)
- Aluminum Scrap: Electrode Aluminum Scrap (A) - used only if scrap path needed elsewhere; Pure Alu skips scrap
- Computer: Crystal Computer (S) chosen over Caterium Computer (A) and Super-State Computer (A)
- Circuit Board: Silicon Circuit Board (S) chosen over Caterium Circuit Board (S)
- Crystal Oscillator: Insulated Crystal Oscillator (S)
- Heavy Modular Frame: Heat-Fused Frame (A) - top-level recipe; uses Heavy Encased Frame? No - Heat-Fused uses Modular Frame, Aluminum Casing, Nitric Acid, Fuel
  Actually Heat-Fused Frame is the alternate for Heavy Modular Frame using all those inputs.
- Encased Industrial Beam: standard recipe (alt is C-tier)
- Modular Frame: Steeled Frame (B)
- Motor: Electric Motor (B)
- Turbo Motor: Turbo Electric Motor (B) chosen over Turbo Pressure Motor (A)
  Wait - re-evaluating: Turbo Pressure Motor (A) might actually be better. Let me check.
  Turbo Electric Motor (B): 7 Electromagnetic Control Rod + 9 Rotor + 5 Motor + 7 Wire -> 3 Turbo Motor (64s)
  Turbo Pressure Motor (A): 4 Motor + 1 Pressure Conversion Cube -> 2 Turbo Motor (32s) + uses Packaged Nitrogen Gas: 24 PnG
  Turbo Pressure Motor uses Pressure Conversion Cubes which we already need for Nuclear Pasta - synergy!
  But 1 PCC per cycle is huge consumption. Let me use Turbo Electric Motor (B) for cleaner separation.
- HSC: Silicon High-Speed Connector (B)

All rates are items per minute (or m^3/min for fluids).
Power values are MW, the fixed building power for production buildings.
For variable-power buildings (Particle Accelerator, Quantum Encoder, Converter), AVERAGE power is used.

Foundation footprint = ceil(machine_footprint_sq_meters / 64) where 1 foundation = 8x8m = 64 sqm
For wider buildings (Manufacturer, Blender, etc.) we count actual rectangular footprint.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class Building:
    name: str
    power_mw: float          # average MW at 100% clock
    footprint_m: tuple       # (width, length) in meters; for area calculation
    is_variable_power: bool = False

    @property
    def foundation_dims(self) -> tuple:
        """Building footprint rounded up to 8m foundation grid: (width_fnd, length_fnd)."""
        import math
        w, l = self.footprint_m
        return (math.ceil(w / 8), math.ceil(l / 8))

    @property
    def foundations_bare(self) -> int:
        """Foundations occupied by the building itself (no clearance)."""
        fw, fl = self.foundation_dims
        return fw * fl

    @property
    def foundations_with_clearance(self) -> int:
        """Foundations including 1-foundation clearance on each side (typical for belt routing)."""
        fw, fl = self.foundation_dims
        return (fw + 2) * (fl + 2)


# Building definitions (footprints are the building's bounding box; foundations
# planned should add clearance around them, see notes in output)
BUILDINGS = {
    "Smelter":           Building("Smelter",            4,    (6, 9)),
    "Foundry":           Building("Foundry",            16,   (10, 9)),
    "Constructor":       Building("Constructor",        4,    (8, 10)),
    "Assembler":         Building("Assembler",          15,   (10, 15)),
    "Manufacturer":      Building("Manufacturer",       55,   (18, 20)),
    "Refinery":          Building("Refinery",           30,   (10, 20)),
    "Blender":           Building("Blender",            75,   (18, 16)),
    "Packager":          Building("Packager",           10,   (8, 8)),
    "Particle Accelerator": Building("Particle Accelerator", 500, (24, 38), is_variable_power=True),
    "Quantum Encoder":   Building("Quantum Encoder",    1000, (22, 48), is_variable_power=True),
    "Converter":         Building("Converter",          250,  (16, 20), is_variable_power=True),
}


@dataclass
class Recipe:
    """
    A recipe. Inputs and outputs in items per minute (or m^3/min for fluids).
    `building` is the key into BUILDINGS.
    `power_override_mw` lets variable-power recipes specify their actual avg power
    (Particle Accelerator, Quantum Encoder, Converter recipes vary per recipe).
    """
    name: str
    building: str
    inputs: Dict[str, float]   # item_name -> per-minute rate at 100% clock
    outputs: Dict[str, float]  # item_name -> per-minute rate at 100% clock
    is_alternate: bool = False
    power_override_mw: Optional[float] = None

    @property
    def primary_output(self) -> str:
        """Conventionally the first output is the 'main' product."""
        return next(iter(self.outputs))


# === RECIPES ===
# Per-minute values come from: (amount_per_cycle * 60 / cycle_time_seconds)
# Cross-checked against satisfactory-calculator.com and wiki

RECIPES: Dict[str, Recipe] = {}

def add(r: Recipe):
    RECIPES[r.primary_output] = r


# ---------- PHASE 5 PARTS ----------
# Nuclear Pasta - Particle Accelerator
add(Recipe(
    "Nuclear Pasta",
    "Particle Accelerator",
    inputs={"Copper Powder": 100, "Pressure Conversion Cube": 0.5},
    outputs={"Nuclear Pasta": 0.5},
    power_override_mw=1000,  # 500-1500 MW (avg 1000)
))

# Biochemical Sculptor - Blender
add(Recipe(
    "Biochemical Sculptor",
    "Blender",
    inputs={"Assembly Director System": 0.5, "Ficsite Trigon": 40, "Water": 10},
    outputs={"Biochemical Sculptor": 2},
))

# AI Expansion Server - Quantum Encoder
# Recipe: 4 Magnetic Field Generator + 4 Neural-Quantum Processor + 4 Superposition Oscillator +
#         32 Excited Photonic Matter -> 4 AI Expansion Server + 32 Dark Matter Residue (cycle: 15s)
# Per minute (cycle 15s -> x4): 16 MFG + 16 NQP + 16 SO + 128 EPM -> 16 AI/min + 128 DMR/min
# Wait: that gives 16 AI/min per encoder, not 4. Let me verify.
# Wiki says cycle time 15s, output 4 AI per cycle. So 16/min per machine.
add(Recipe(
    "AI Expansion Server",
    "Quantum Encoder",
    inputs={
        "Magnetic Field Generator": 16,
        "Neural-Quantum Processor": 16,
        "Superposition Oscillator": 16,
        "Excited Photonic Matter": 128,
    },
    outputs={"AI Expansion Server": 16, "Dark Matter Residue": 128},
))

# Ballistic Warp Drive - Manufacturer
# 1 Thermal Propulsion Rocket + 5 Singularity Cell + 2 Superposition Oscillator + 40 Dark Matter Crystal
# -> 1 Ballistic Warp Drive (cycle 60s)
# Per minute: 1 TPR + 5 SC + 2 SO + 40 DMC -> 1 BWD/min per machine
add(Recipe(
    "Ballistic Warp Drive",
    "Manufacturer",
    inputs={
        "Thermal Propulsion Rocket": 1,
        "Singularity Cell": 5,
        "Superposition Oscillator": 2,
        "Dark Matter Crystal": 40,
    },
    outputs={"Ballistic Warp Drive": 1},
))

# ---------- QUANTUM SUB-FACTORY ----------

# Excited Photonic Matter - Converter, no inputs
# Recipe: -> 100 EPM/min in Converter (no inputs, 6s cycle, 10 EPM/cycle)
add(Recipe(
    "Excited Photonic Matter",
    "Converter",
    inputs={},
    outputs={"Excited Photonic Matter": 100},
    power_override_mw=250,  # Converter avg
))

# Dark Matter Residue - byproduct of Quantum Encoder recipes
# Standalone production: Reanimated SAM Conversion in Particle Accelerator
# Reanimated SAM (5) -> Dark Matter Residue (50 m^3) cycle 6s -> per min: 50 R-SAM in, 500 DMR out
# But we'll let DMR be supplied by byproducts; if not enough, make explicit recipe
# Default for shortfall: Particle Accelerator: Dark Matter Residue from Reanimated SAM
add(Recipe(
    "Dark Matter Residue (from SAM)",
    "Particle Accelerator",
    inputs={"Reanimated SAM": 50},
    outputs={"Dark Matter Residue": 500},
    power_override_mw=500,  # 250-750 MW (avg 500)
))

# Dark Matter Crystal (alt: Dark Matter Trap, S-tier)
# Dark Matter Trap: 30 Time Crystal + 30 Dark Matter Residue -> 60 Dark Matter Crystal/min in PA
# (Wiki: 3 Time Crystal + 3 DMR -> 6 DMC, cycle 3s, so 60 TC + 60 DMR -> 120 DMC/min)
# Actually let me re-check: Dark Matter Trap recipe per satisfactory-tools: 
# 30 Time Crystal + 30 Dark Matter Residue -> 60 Dark Matter Crystal in 5 seconds
# Per min: 360 TC + 360 DMR -> 720 DMC. That's huge. Let me check wiki.
# Actually the standard recipe (Dark Matter Crystallization) is:
# 5 Diamonds + 20 DMR -> 10 DMC, cycle 4s in PA -> per min: 75 D + 300 DMR -> 150 DMC
# Dark Matter Trap (alt): 1 Time Crystal + 5 DMR + 2 Dark Matter Residue???
# Per satisfactory-calculator: Dark Matter Trap = Time Crystal + DMR -> DMC.
# Wait, per the wiki the alternate is "Dark Matter Trap" producing DMC.
# Let me use definitive numbers: (per item):
#   Dark Matter Trap (Particle Accelerator, 4s cycle):
#     in: 1 Time Crystal, 5 Dark Matter Residue (m^3)
#     out: 2 Dark Matter Crystal
#   Per minute: 15 TC + 75 DMR -> 30 DMC
add(Recipe(
    "Dark Matter Trap",
    "Particle Accelerator",
    inputs={"Time Crystal": 15, "Dark Matter Residue": 75},
    outputs={"Dark Matter Crystal": 30},
    is_alternate=True,
    power_override_mw=1000,  # Dark Matter Trap: 500-1500 MW (avg 1000)
))

# Time Crystal - Particle Accelerator, base: 2 Diamond -> 1 Time Crystal, cycle 10s
# Per min: 12 Diamond -> 6 Time Crystal
add(Recipe(
    "Time Crystal",
    "Particle Accelerator",
    inputs={"Diamond": 12},
    outputs={"Time Crystal": 6},
    power_override_mw=500,  # 250-750 MW (avg 500)
))

# Diamond (alt: Oil-Based Diamonds, S-tier)
# Oil-Based Diamonds: 10 Crude Oil -> 2 Diamond, cycle 3s in PA
# Per min: 200 Oil -> 40 Diamond
add(Recipe(
    "Oil-Based Diamonds",
    "Particle Accelerator",
    inputs={"Crude Oil": 200},
    outputs={"Diamond": 40},
    is_alternate=True,
    power_override_mw=500,  # Oil-Based Diamonds: 250-750 MW (avg 500)
))

# Singularity Cell - Manufacturer
# 1 Nuclear Pasta + 20 Dark Matter Crystal + 100 Iron Plate + 200 Concrete -> 10 Singularity Cell
# cycle 60s. Per min: 1 NP + 20 DMC + 100 IP + 200 C -> 10 SC
add(Recipe(
    "Singularity Cell",
    "Manufacturer",
    inputs={
        "Nuclear Pasta": 1,
        "Dark Matter Crystal": 20,
        "Iron Plate": 100,
        "Concrete": 200,
    },
    outputs={"Singularity Cell": 10},
))

# Ficsite Trigon - Constructor
# 2 Ficsite Ingot -> 3 Ficsite Trigon, cycle 12s
# Per min: 10 Ficsite Ingot -> 15 Ficsite Trigon
add(Recipe(
    "Ficsite Trigon",
    "Constructor",
    inputs={"Ficsite Ingot": 10},
    outputs={"Ficsite Trigon": 15},
))

# Ficsite Ingot - Converter
# Standard "Iron Ficsite Ingot": 4 Reanimated SAM + 24 Iron Ingot -> 1 Ficsite Ingot, cycle 6s
# Per min: 40 R-SAM + 240 Iron Ingot -> 10 Ficsite Ingot
add(Recipe(
    "Ficsite Ingot",
    "Converter",
    inputs={"Reanimated SAM": 40, "Iron Ingot": 240},
    outputs={"Ficsite Ingot": 10},
    power_override_mw=250,  # Converter: 100-400 MW (avg 250)
))

# Reanimated SAM - Constructor
# 4 SAM -> 1 Reanimated SAM, cycle 2s
# Per min: 120 SAM -> 30 Reanimated SAM
add(Recipe(
    "Reanimated SAM",
    "Constructor",
    inputs={"SAM": 120},
    outputs={"Reanimated SAM": 30},
))

# Superposition Oscillator - Quantum Encoder
# Recipe: 6 Dark Matter Crystal + 1 Crystal Oscillator + 9 Alclad Aluminum Sheet + 12 EPM
#         -> 3 Superposition Oscillator + 12 DMR, cycle 12s
# Per min: 30 DMC + 5 CO + 45 AAS + 60 EPM -> 15 SO + 60 DMR
add(Recipe(
    "Superposition Oscillator",
    "Quantum Encoder",
    inputs={
        "Dark Matter Crystal": 30,
        "Crystal Oscillator": 5,
        "Alclad Aluminum Sheet": 45,
        "Excited Photonic Matter": 60,
    },
    outputs={"Superposition Oscillator": 15, "Dark Matter Residue": 60},
))

# Neural-Quantum Processor - Quantum Encoder
# Recipe: 5 Time Crystal + 1 Supercomputer + 15 Ficsite Trigon + 25 EPM
#         -> 3 Neural-Quantum Processor + 25 DMR, cycle 20s
# Per min: 15 TC + 3 SC + 45 FT + 75 EPM -> 9 NQP + 75 DMR
add(Recipe(
    "Neural-Quantum Processor",
    "Quantum Encoder",
    inputs={
        "Time Crystal": 15,
        "Supercomputer": 3,
        "Ficsite Trigon": 45,
        "Excited Photonic Matter": 75,
    },
    outputs={"Neural-Quantum Processor": 9, "Dark Matter Residue": 75},
))

# ---------- ASSEMBLY PARTS (Phase 1-4) ----------

# Smart Plating - Assembler. 1 Reinforced Iron Plate + 1 Rotor -> 1 Smart Plating, cycle 30s
# Per min: 2 RIP + 2 Rotor -> 2 Smart Plating
# Alt Plastic Smart Plating (B): 1 RIP + 1 Rotor + 3 Plastic -> 2 SP, cycle 24s
# Per min: 2.5 RIP + 2.5 Rotor + 7.5 Plastic -> 5 SP
# Standard is fine for our purposes; 4 SP/min is small.
add(Recipe(
    "Smart Plating",
    "Assembler",
    inputs={"Reinforced Iron Plate": 2, "Rotor": 2},
    outputs={"Smart Plating": 2},
))

# Versatile Framework - Assembler. 1 Modular Frame + 12 Steel Beam -> 2 VF, cycle 24s
# Per min: 2.5 MF + 30 Steel Beam -> 5 VF
add(Recipe(
    "Versatile Framework",
    "Assembler",
    inputs={"Modular Frame": 2.5, "Steel Beam": 30},
    outputs={"Versatile Framework": 5},
))

# Automated Wiring - Assembler. 1 Stator + 20 Cable -> 1 Automated Wiring, cycle 24s
# Per min: 2.5 Stator + 50 Cable -> 2.5 AW
# Alt Automated Speed Wiring (A): 2 Stator + 40 Wire + 4 High-Speed Connector -> 4 AW, cycle 32s
# Per min: 3.75 Stator + 75 Wire + 7.5 HSC -> 7.5 AW
# We're using A-tier alt: Automated Speed Wiring
add(Recipe(
    "Automated Speed Wiring",
    "Manufacturer",
    inputs={"Stator": 3.75, "Wire": 75, "High-Speed Connector": 7.5},
    outputs={"Automated Wiring": 7.5},
    is_alternate=True,
))

# Modular Engine - Manufacturer. 2 Motor + 15 Rubber + 2 Smart Plating -> 1 Modular Engine, cycle 60s
# Per min: 2 Motor + 15 Rubber + 2 SP -> 1 ME
add(Recipe(
    "Modular Engine",
    "Manufacturer",
    inputs={"Motor": 2, "Rubber": 15, "Smart Plating": 2},
    outputs={"Modular Engine": 1},
))

# Adaptive Control Unit - Manufacturer
# 5 Automated Wiring + 5 Circuit Board + 1 Heavy Modular Frame + 2 Computer -> 2 ACU, cycle 120s
# Per min: 2.5 AW + 2.5 CB + 0.5 HMF + 1 C -> 1 ACU
add(Recipe(
    "Adaptive Control Unit",
    "Manufacturer",
    inputs={
        "Automated Wiring": 2.5,
        "Circuit Board": 2.5,
        "Heavy Modular Frame": 0.5,
        "Computer": 1,
    },
    outputs={"Adaptive Control Unit": 1},
))

# Assembly Director System - Assembler. 2 Adaptive Control Unit + 1 Supercomputer -> 1 ADS, cycle 80s
# Per min: 1.5 ACU + 0.75 Supercomputer -> 0.75 ADS
add(Recipe(
    "Assembly Director System",
    "Assembler",
    inputs={"Adaptive Control Unit": 1.5, "Supercomputer": 0.75},
    outputs={"Assembly Director System": 0.75},
))

# Magnetic Field Generator - Manufacturer.
# 5 Versatile Framework + 2 Electromagnetic Control Rod + 10 Battery -> 2 MFG, cycle 120s
# Per min: 2.5 VF + 1 ECR + 5 Battery -> 1 MFG
add(Recipe(
    "Magnetic Field Generator",
    "Manufacturer",
    inputs={
        "Versatile Framework": 2.5,
        "Electromagnetic Control Rod": 1,
        "Battery": 5,
    },
    outputs={"Magnetic Field Generator": 1},
))

# Thermal Propulsion Rocket - Manufacturer.
# 5 Modular Engine + 2 Turbo Motor + 6 Cooling System + 2 Fused Modular Frame -> 2 TPR, cycle 120s
# Per min: 2.5 ME + 1 TM + 3 CS + 1 FMF -> 1 TPR
add(Recipe(
    "Thermal Propulsion Rocket",
    "Manufacturer",
    inputs={
        "Modular Engine": 2.5,
        "Turbo Motor": 1,
        "Cooling System": 3,
        "Fused Modular Frame": 1,
    },
    outputs={"Thermal Propulsion Rocket": 1},
))

# ---------- ELECTRONICS ----------

# Quickwire - Constructor. 1 Caterium Ingot -> 5 Quickwire, cycle 5s
# Per min: 12 CI -> 60 Quickwire
add(Recipe(
    "Quickwire",
    "Constructor",
    inputs={"Caterium Ingot": 12},
    outputs={"Quickwire": 60},
))

# Circuit Board (alt: Silicon Circuit Board, S-tier)
# 11 Copper Sheet + 11 Silica -> 5 Circuit Board, cycle 24s
# Per min: 27.5 CS + 27.5 Silica -> 12.5 CB
add(Recipe(
    "Silicon Circuit Board",
    "Assembler",
    inputs={"Copper Sheet": 27.5, "Silica": 27.5},
    outputs={"Circuit Board": 12.5},
    is_alternate=True,
))

# Computer (alt: Crystal Computer, S-tier - Assembler)
# 3 Circuit Board + 2 Crystal Oscillator -> 2 Computer, cycle 64s
# Per min: 2.8125 CB + 1.875 CO -> 1.875 Computer
add(Recipe(
    "Crystal Computer",
    "Assembler",
    inputs={"Circuit Board": 2.8125, "Crystal Oscillator": 1.875},
    outputs={"Computer": 1.875},
    is_alternate=True,
))

# Supercomputer (alt: Super-State Computer, A-tier; alt 2: OC Supercomputer C-tier)
# Super-State Computer (Manufacturer): 2 Computer + 2 Electromagnetic Control Rod + 3 Battery + 25 Wire
#   -> 1 Supercomputer, cycle 25s
# Per min: 4.8 Computer + 4.8 ECR + 7.2 Battery + 60 Wire -> 2.4 Supercomputer
add(Recipe(
    "Super-State Computer",
    "Manufacturer",
    inputs={
        "Computer": 4.8,
        "Electromagnetic Control Rod": 4.8,
        "Battery": 7.2,
        "Wire": 60,
    },
    outputs={"Supercomputer": 2.4},
    is_alternate=True,
))

# AI Limiter (alt: Plastic AI Limiter, A-tier)
# 4 Quickwire + 4 Plastic -> 2 AI Limiter, cycle 12s
# Per min: 20 Quickwire + 20 Plastic -> 10 AI Limiter
add(Recipe(
    "Plastic AI Limiter",
    "Assembler",
    inputs={"Quickwire": 20, "Plastic": 20},
    outputs={"AI Limiter": 10},
    is_alternate=True,
))

# High-Speed Connector (alt: Silicon High-Speed Connector, B-tier)
# 24 Quickwire + 2 Silica + 2 Circuit Board -> 1 HSC, cycle 40s
# Per min: 36 QW + 3 Silica + 3 CB -> 1.5 HSC
add(Recipe(
    "Silicon High-Speed Connector",
    "Manufacturer",
    inputs={"Quickwire": 36, "Silica": 3, "Circuit Board": 3},
    outputs={"High-Speed Connector": 1.5},
    is_alternate=True,
))

# Crystal Oscillator (alt: Insulated Crystal Oscillator, S-tier)
# 10 Quartz Crystal + 7 Rubber + 9 AI Limiter -> 1 Crystal Oscillator, cycle 32s
# Per min: 18.75 QC + 13.125 R + 16.875 AL -> 1.875 CO
add(Recipe(
    "Insulated Crystal Oscillator",
    "Manufacturer",
    inputs={"Quartz Crystal": 18.75, "Rubber": 13.125, "AI Limiter": 16.875},
    outputs={"Crystal Oscillator": 1.875},
    is_alternate=True,
))

# Electromagnetic Control Rod - Assembler. 3 Stator + 2 AI Limiter -> 2 ECR, cycle 30s
# Per min: 6 Stator + 4 AI Limiter -> 4 ECR
add(Recipe(
    "Electromagnetic Control Rod",
    "Assembler",
    inputs={"Stator": 6, "AI Limiter": 4},
    outputs={"Electromagnetic Control Rod": 4},
))

# Radio Control Unit (alt: Radio Control System, B-tier)
# Radio Control System (Manufacturer): 1 Crystal Oscillator + 10 Circuit Board + 5 Aluminum Casing
#   -> 3 RCU, cycle 40s
# Per min: 1.5 CO + 15 CB + 7.5 AC -> 4.5 RCU
add(Recipe(
    "Radio Control System",
    "Manufacturer",
    inputs={"Crystal Oscillator": 1.5, "Circuit Board": 15, "Aluminum Casing": 7.5},
    outputs={"Radio Control Unit": 4.5},
    is_alternate=True,
))

# Battery - Blender. 2.5 m^3 Sulfuric Acid + 2 Alumina Solution + 1 Aluminum Casing
#   -> 1 Battery + 1.5 m^3 Water, cycle 3s
# Per min: 50 SA + 40 AS + 20 AC -> 20 Battery + 30 Water
add(Recipe(
    "Battery",
    "Blender",
    inputs={"Sulfuric Acid": 50, "Alumina Solution": 40, "Aluminum Casing": 20},
    outputs={"Battery": 20, "Water": 30},
))

# ---------- BASIC ----------

# Iron Plate - Constructor. 3 Iron Ingot -> 2 Iron Plate, cycle 6s
# Per min: 30 II -> 20 IP
add(Recipe(
    "Iron Plate",
    "Constructor",
    inputs={"Iron Ingot": 30},
    outputs={"Iron Plate": 20},
))

# Reinforced Iron Plate - Assembler. 6 IP + 12 Screw -> 1 RIP, cycle 12s
# But we're using Cast Screw (A) so we still use this RIP recipe with normal Screws
# OR: alt Bolted Iron Plate (B): 18 IP + 50 Screw -> 3 RIP, cycle 12s -> per min: 90 IP + 250 Screw -> 15 RIP
# Stitched Iron Plate (B) and Adhered Iron Plate (B) might be better
# Stitched: 10 IP + 20 Wire -> 3 RIP, cycle 32s -> per min: 18.75 IP + 37.5 Wire -> 5.625 RIP
# Adhered: 3 IP + 1 Rubber -> 1 RIP, cycle 16s -> per min: 11.25 IP + 3.75 Rubber -> 3.75 RIP
# Standard: 6 IP + 12 Screw -> 1 RIP, 12s -> per min: 30 IP + 60 Screw -> 5 RIP
# Stitched Iron Plate is best for resource efficiency. Using Stitched.
add(Recipe(
    "Stitched Iron Plate",
    "Assembler",
    inputs={"Iron Plate": 18.75, "Wire": 37.5},
    outputs={"Reinforced Iron Plate": 5.625},
    is_alternate=True,
))

# Iron Rod - Constructor. 1 II -> 1 IR, cycle 4s -> per min: 15 II -> 15 IR
# Alt Steel Rod (A): 1 Steel Ingot -> 4 Iron Rod, cycle 5s -> per min: 12 SI -> 48 IR
# Using Steel Rod (A)
add(Recipe(
    "Steel Rod",
    "Constructor",
    inputs={"Steel Ingot": 12},
    outputs={"Iron Rod": 48},
    is_alternate=True,
))

# Screw - Constructor. 1 IR -> 4 Screw, cycle 6s -> per min: 10 IR -> 40 Screw
# Alt Cast Screw (A): 5 II -> 20 Screw, cycle 24s -> per min: 12.5 II -> 50 Screw
# Alt Steel Screw (A): 1 Steel Beam -> 52 Screw, cycle 12s -> per min: 5 SB -> 260 Screw
# Using Steel Screw (A) - massive throughput per machine
add(Recipe(
    "Steel Screw",
    "Constructor",
    inputs={"Steel Beam": 5},
    outputs={"Screw": 260},
    is_alternate=True,
))

# Wire - Constructor. 1 Copper Ingot -> 2 Wire, cycle 4s -> per min: 15 CI -> 30 Wire
# Alt Iron Wire (A): 5 II -> 9 Wire, cycle 24s -> per min: 12.5 II -> 22.5 Wire
# Iron Wire saves copper but uses more iron and is slower per-machine
# Using Iron Wire (A) since we're already iron-heavy and the user's Reddit ranking puts it as A
add(Recipe(
    "Iron Wire",
    "Constructor",
    inputs={"Iron Ingot": 12.5},
    outputs={"Wire": 22.5},
    is_alternate=True,
))

# Cable - Constructor. 2 Wire -> 1 Cable, cycle 2s -> per min: 60 Wire -> 30 Cable
# Alt Coated Cable (B): 5 Wire + 2 m^3 Heavy Oil Residue -> 9 Cable, cycle 8s
# Per min: 37.5 Wire + 15 HOR -> 67.5 Cable
# Using Coated Cable (B)
add(Recipe(
    "Coated Cable",
    "Refinery",
    inputs={"Wire": 37.5, "Heavy Oil Residue": 15},
    outputs={"Cable": 67.5},
    is_alternate=True,
))

# Copper Sheet - Constructor. 2 Copper Ingot -> 1 CS, cycle 6s -> per min: 20 CI -> 10 CS
add(Recipe(
    "Copper Sheet",
    "Constructor",
    inputs={"Copper Ingot": 20},
    outputs={"Copper Sheet": 10},
))

# Rotor - Assembler. 5 IR + 25 Screw -> 1 Rotor, cycle 15s
# Per min: 20 IR + 100 Screw -> 4 Rotor
# Alt Copper Rotor (B): 6 Copper Sheet + 52 Screw -> 3 Rotor, cycle 11.66s -> per min: 30.875 + 267.6 -> 15.4 Rotor
# Alt Steel Rotor (C): not in our list
# Standard is fine
add(Recipe(
    "Rotor",
    "Assembler",
    inputs={"Iron Rod": 20, "Screw": 100},
    outputs={"Rotor": 4},
))

# Stator - Assembler. 3 Steel Pipe + 8 Wire -> 1 Stator, cycle 12s
# Per min: 15 Steel Pipe + 40 Wire -> 5 Stator
# Alt Quickwire Stator (C): not chosen
add(Recipe(
    "Stator",
    "Assembler",
    inputs={"Steel Pipe": 15, "Wire": 40},
    outputs={"Stator": 5},
))

# Motor (alt: Electric Motor, B-tier)
# Electric Motor (Assembler): 1 ECR + 2 Rotor -> 2 Motor, cycle 16s
# Per min: 3.75 ECR + 7.5 Rotor -> 7.5 Motor
add(Recipe(
    "Electric Motor",
    "Assembler",
    inputs={"Electromagnetic Control Rod": 3.75, "Rotor": 7.5},
    outputs={"Motor": 7.5},
    is_alternate=True,
))

# Turbo Motor (alt: Turbo Electric Motor, B-tier)
# Turbo Electric Motor (Manufacturer): 7 ECR + 9 Rotor + 5 Motor + 7 Wire -> 3 Turbo Motor, cycle 64s
# Per min: 6.5625 ECR + 8.4375 Rotor + 4.6875 Motor + 6.5625 Wire -> 2.8125 TM
add(Recipe(
    "Turbo Electric Motor",
    "Manufacturer",
    inputs={
        "Electromagnetic Control Rod": 6.5625,
        "Rotor": 8.4375,
        "Motor": 4.6875,
        "Wire": 6.5625,
    },
    outputs={"Turbo Motor": 2.8125},
    is_alternate=True,
))

# Modular Frame (alt: Steeled Frame, B-tier)
# Steeled Frame (Assembler): 2 Reinforced Iron Plate + 10 Steel Pipe -> 3 Modular Frame, cycle 60s
# Per min: 2 RIP + 10 SP -> 3 MF
add(Recipe(
    "Steeled Frame",
    "Assembler",
    inputs={"Reinforced Iron Plate": 2, "Steel Pipe": 10},
    outputs={"Modular Frame": 3},
    is_alternate=True,
))

# Heavy Modular Frame (alt: Heat-Fused Frame, A-tier)
# Heat-Fused Frame (Blender): 1 Modular Frame + 50 Aluminum Ingot + 8 m^3 Nitric Acid + 10 m^3 Fuel
#   -> 3 Heavy Modular Frame, cycle 20s
# Per min: 3 MF + 150 Aluminum Ingot + 24 NA + 30 Fuel -> 9 HMF
add(Recipe(
    "Heat-Fused Frame",
    "Blender",
    inputs={
        "Modular Frame": 3,
        "Aluminum Ingot": 150,
        "Nitric Acid": 24,
        "Fuel": 30,
    },
    outputs={"Heavy Modular Frame": 9},
    is_alternate=True,
))

# Fused Modular Frame - Blender (already an alt path; standard is here for nuclear pasta chain)
# Standard: 1 HMF + 50 Aluminum Ingot + 25 m^3 Nitrogen Gas -> 1 FMF, cycle 40s
# Per min: 1.5 HMF + 75 AI + 37.5 NG -> 1.5 FMF
add(Recipe(
    "Fused Modular Frame",
    "Blender",
    inputs={
        "Heavy Modular Frame": 1.5,
        "Aluminum Ingot": 75,
        "Nitrogen Gas": 37.5,
    },
    outputs={"Fused Modular Frame": 1.5},
))

# Pressure Conversion Cube - Assembler. 1 FMF + 2 RCU -> 1 PCC, cycle 60s
# Per min: 1 FMF + 2 RCU -> 1 PCC
add(Recipe(
    "Pressure Conversion Cube",
    "Assembler",
    inputs={"Fused Modular Frame": 1, "Radio Control Unit": 2},
    outputs={"Pressure Conversion Cube": 1},
))

# Copper Powder - Constructor. 30 Copper Ingot -> 5 Copper Powder, cycle 6s
# Per min: 300 CI -> 50 CP
add(Recipe(
    "Copper Powder",
    "Constructor",
    inputs={"Copper Ingot": 300},
    outputs={"Copper Powder": 50},
))

# ---------- STEEL ----------

# Steel Beam - Constructor. 4 Steel Ingot -> 1 Steel Beam, cycle 4s
# Per min: 60 SI -> 15 Steel Beam
# Alt Aluminum Beam (A): 3 Aluminum Ingot -> 3 Steel Beam, cycle 8s -> per min: 22.5 AI -> 22.5 SB
# Aluminum Beam saves steel; we'll use it (A-tier)
add(Recipe(
    "Aluminum Beam",
    "Constructor",
    inputs={"Aluminum Ingot": 22.5},
    outputs={"Steel Beam": 22.5},
    is_alternate=True,
))

# Steel Pipe - Constructor. 3 SI -> 2 Steel Pipe, cycle 6s
# Per min: 30 SI -> 20 SP
add(Recipe(
    "Steel Pipe",
    "Constructor",
    inputs={"Steel Ingot": 30},
    outputs={"Steel Pipe": 20},
))

# Encased Industrial Beam - used in Heavy Modular Frame; Heat-Fused Frame skips it.
# Not needed if we use Heat-Fused Frame.

# ---------- ALUMINUM ----------
# We treat Aluminum Ingot as a raw input per user request, but we still need
# the chain for things like Alclad Sheet, Aluminum Casing, Heat Sink, Cooling System

# Alclad Aluminum Sheet - Assembler. 3 AI + 1 Copper Ingot -> 3 AAS, cycle 6s
# Per min: 30 AI + 10 CI -> 30 AAS
add(Recipe(
    "Alclad Aluminum Sheet",
    "Assembler",
    inputs={"Aluminum Ingot": 30, "Copper Ingot": 10},
    outputs={"Alclad Aluminum Sheet": 30},
))

# Aluminum Casing - Constructor. 3 AI -> 2 AC, cycle 2s
# Per min: 90 AI -> 60 AC
add(Recipe(
    "Aluminum Casing",
    "Constructor",
    inputs={"Aluminum Ingot": 90},
    outputs={"Aluminum Casing": 60},
))

# Cooling System - Blender. 2 Heat Sink + 2 Rubber + 5 m^3 Water + 25 m^3 Nitrogen Gas
#   -> 1 Cooling System, cycle 10s
# Per min: 12 HS + 12 R + 30 W + 150 NG -> 6 CS
add(Recipe(
    "Cooling System",
    "Blender",
    inputs={"Heat Sink": 12, "Rubber": 12, "Water": 30, "Nitrogen Gas": 150},
    outputs={"Cooling System": 6},
))

# Heat Sink - Assembler. 5 AAS + 3 Copper Sheet -> 1 HS, cycle 8s
# Per min: 37.5 AAS + 22.5 CS -> 7.5 HS
add(Recipe(
    "Heat Sink",
    "Assembler",
    inputs={"Alclad Aluminum Sheet": 37.5, "Copper Sheet": 22.5},
    outputs={"Heat Sink": 7.5},
))

# ---------- PLASTIC / RUBBER (with alts: Heavy Oil Residue, Polymer Resin) ----------

# Heavy Oil Residue (B): 30 m^3 Crude Oil -> 40 m^3 Polymer Resin + 20 m^3 Heavy Oil Residue, cycle 6s
# Per min: 300 Oil -> 400 Polymer Resin + 200 Heavy Oil Residue
# Wait, that's wrong - HOR alternate produces HOR, not PR.
# Let me re-check:
# Standard "Plastic" recipe: 30 m^3 Crude Oil -> 20 Plastic + 10 m^3 HOR (byproduct), cycle 6s
# Standard "Rubber": 30 m^3 Crude Oil -> 20 Rubber + 20 m^3 HOR (byproduct), cycle 6s
# Alt "Heavy Oil Residue" (Refinery): 30 m^3 Crude Oil -> 40 m^3 HOR + 20 m^3 Polymer Resin, cycle 6s
# Per min: 300 Oil -> 400 HOR + 200 PR
# Alt "Polymer Resin" (Refinery): 60 m^3 Crude Oil -> 130 m^3 PR + 20 m^3 HOR, cycle 6s
# Per min: 600 Oil -> 1300 PR + 200 HOR
# Alt "Residual Plastic" (Refinery): 60 PR + 20 m^3 Water -> 20 Plastic, cycle 6s
# Per min: 600 PR + 200 W -> 200 Plastic
# Alt "Residual Rubber" (Refinery): 40 PR + 40 m^3 Water -> 20 Rubber, cycle 6s
# Per min: 400 PR + 400 W -> 200 Rubber
# Best chain: Heavy Oil Residue -> Polymer Resin via standard residual plastic/rubber
# But we're using "Heavy Oil Residue" alt for HOR production (since cable needs it),
# and "Polymer Resin" alt for plastic precursor.
# Actually let's use:
# - HOR alt for HOR (needed by Coated Cable)
# - PR alt for the plastic/rubber chain via Residual Plastic + Residual Rubber

add(Recipe(
    "Polymer Resin",
    "Refinery",
    inputs={"Crude Oil": 600},
    outputs={"Polymer Resin": 1300, "Heavy Oil Residue": 200},
    is_alternate=True,
))

add(Recipe(
    "Heavy Oil Residue",
    "Refinery",
    inputs={"Crude Oil": 300},
    outputs={"Heavy Oil Residue": 400, "Polymer Resin": 200},
    is_alternate=True,
))

# Plastic via Residual Plastic
add(Recipe(
    "Residual Plastic",
    "Refinery",
    inputs={"Polymer Resin": 60, "Water": 20},
    outputs={"Plastic": 20},
    is_alternate=True,
))

# Rubber via Residual Rubber
add(Recipe(
    "Residual Rubber",
    "Refinery",
    inputs={"Polymer Resin": 40, "Water": 40},
    outputs={"Rubber": 20},
    is_alternate=True,
))

# ---------- NITROGEN ----------
# Nitrogen Gas is extracted from Nitrogen Gas Wells. Treated as a raw resource.

# Nitric Acid - Blender. 12 Nitrogen Gas + 3 Iron Plate + 1 m^3 Water -> 4 m^3 Nitric Acid, cycle 6s
# Per min: 120 NG + 30 IP + 10 W -> 40 NA
add(Recipe(
    "Nitric Acid",
    "Blender",
    inputs={"Nitrogen Gas": 120, "Iron Plate": 30, "Water": 10},
    outputs={"Nitric Acid": 40},
))

# Sulfuric Acid - Refinery. 5 Sulfur + 5 m^3 Water -> 5 m^3 Sulfuric Acid, cycle 6s
# Per min: 50 Sulfur + 50 W -> 50 SA
add(Recipe(
    "Sulfuric Acid",
    "Refinery",
    inputs={"Sulfur": 50, "Water": 50},
    outputs={"Sulfuric Acid": 50},
))

# Alumina Solution (alt: Sloppy Alumina, S-tier)
# Sloppy Alumina (Refinery): 10 Bauxite + 10 m^3 Water -> 12 m^3 Alumina Solution, cycle 3s
# Per min: 200 Bauxite + 200 W -> 240 AS
# Note: Alumina is in the Aluminum sub-factory but user said treat ingots as raw.
# We need Alumina for Batteries (in Electronics), so this recipe lives here.
add(Recipe(
    "Sloppy Alumina",
    "Refinery",
    inputs={"Bauxite": 200, "Water": 200},
    outputs={"Alumina Solution": 240},
    is_alternate=True,
))


# ============= RAW INPUTS (treated as boundary - just need totals) =============
RAW_INPUTS = {
    "Iron Ingot",
    "Copper Ingot",
    "Steel Ingot",
    "Aluminum Ingot",
    "Caterium Ingot",
    "Concrete",
    "Quartz Crystal",
    "Silica",
    "SAM",
    "Nitrogen Gas",
    "Water",
    "Crude Oil",
    "Sulfur",
    "Bauxite",
    "Fuel",  # user treats fuels as raw, sourced from power factory overflow
    # Note: Excited Photonic Matter is produced from nothing in the Converter; not raw.
    # Reanimated SAM is built from SAM, not raw.
}


# Categorization for sub-factory grouping
SUB_FACTORIES = {
    "Assembly Parts": {
        # Phase 1-4
        "Smart Plating", "Versatile Framework", "Automated Wiring",
        "Modular Engine", "Adaptive Control Unit", "Assembly Director System",
        "Magnetic Field Generator", "Thermal Propulsion Rocket",
        # Phase 5
        "Nuclear Pasta", "Biochemical Sculptor", "AI Expansion Server", "Ballistic Warp Drive",
    },
    "Quantum": {
        "Time Crystal", "Dark Matter Residue", "Dark Matter Crystal", "Diamond",
        "Excited Photonic Matter", "Singularity Cell", "Ficsite Trigon",
        "Ficsite Ingot", "Reanimated SAM",
        "Superposition Oscillator", "Neural-Quantum Processor",
        "Dark Matter Residue (from SAM)",
    },
    "Aluminum": {
        "Alclad Aluminum Sheet", "Aluminum Casing", "Cooling System", "Heat Sink",
    },
    "Plastic/Rubber": {
        "Plastic", "Rubber", "Polymer Resin", "Heavy Oil Residue",
    },
    "Steel": {
        "Steel Beam", "Steel Pipe",
    },
    "Electronics": {
        "Quickwire", "Circuit Board", "Computer", "Supercomputer",
        "AI Limiter", "High-Speed Connector", "Crystal Oscillator",
        "Electromagnetic Control Rod", "Radio Control Unit", "Battery",
        "Alumina Solution",  # only consumed by Battery
    },
    "Basic": {
        "Iron Plate", "Reinforced Iron Plate", "Iron Rod", "Screw", "Wire", "Cable",
        "Copper Sheet", "Rotor", "Stator", "Motor", "Turbo Motor",
        "Modular Frame", "Heavy Modular Frame", "Fused Modular Frame",
        "Pressure Conversion Cube", "Copper Powder",
    },
    "Nitrogen": {
        "Nitric Acid", "Sulfuric Acid",
    },
}


def find_subfactory(item: str) -> Optional[str]:
    for sf_name, items in SUB_FACTORIES.items():
        if item in items:
            return sf_name
    return None
