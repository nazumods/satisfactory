"""
Solver for Satisfactory production chain.

Approach:
1. Start with target outputs (Phase 5 parts at 4/min each).
2. BFS/topological resolution: for each item, find recipe, compute required machine count,
   add inputs to the demand queue.
3. Handle byproducts (Dark Matter Residue, water from batteries) by tracking surplus.
4. Aggregate per sub-factory.

Byproduct handling: Quantum Encoder recipes produce Dark Matter Residue as a byproduct.
The total DMR produced may or may not match what's needed for Dark Matter Crystal production.
We compute net DMR demand and produce shortfall via "Dark Matter Residue (from SAM)" in PA.
"""

import math
from collections import defaultdict
from typing import Dict, List, Tuple

from recipes import (
    RECIPES, BUILDINGS, RAW_INPUTS, SUB_FACTORIES, TARGETS, find_subfactory,
    RECIPE_PARTS_COST_MULTIPLIER, POWER_CONSUMPTION_MULTIPLIER,
)


def _scaled_input_rate(rate: float, cycle_seconds: float, multiplier: float) -> float:
    """
    The game's "Recipe Parts Cost Multiplier" doesn't scale the per-minute rate smoothly —
    it rounds the recipe's per-craft-cycle INTEGER ingredient count
    (round(amount * multiplier), floored at 1) and recomputes the rate from that, so a 1.25x
    multiplier can leave a 1-per-cycle ingredient unchanged while doubling a 2-per-cycle one.
    We recover the per-cycle amount from the stored per-minute rate and the recipe's cycle
    time, since rate = per_cycle * 60 / cycle_seconds.
    """
    if multiplier == 1.0 or rate <= 0:
        return rate
    per_cycle = round(rate * cycle_seconds / 60)
    if per_cycle <= 0:
        return rate  # no known cycle time — leave unscaled
    new_per_cycle = max(1, round(per_cycle * multiplier))
    return rate * (new_per_cycle / per_cycle)


def solve(targets: Dict[str, float], recipes: Dict = RECIPES,
          boundary_raw: bool = False,
          cost_multiplier: float = RECIPE_PARTS_COST_MULTIPLIER) -> Dict:
    """
    targets: {item_name: per_minute_rate}
    recipes: recipe set to resolve against (defaults to the global RECIPES). Pass a
      restricted set to solve a single sub-factory in isolation.
    boundary_raw: when True, an item with no recipe and not in RAW_INPUTS is treated as
      a raw boundary input instead of raising. Used to stop recursion at a sub-factory
      edge (e.g. Steel Pipe / ECR feeding the Basic factory).
    cost_multiplier: Recipe Parts Cost Multiplier game-mode setting (see _scaled_input_rate).
    Returns a dict with:
      - 'recipes_used': {item: {'rate': total_rate_per_min, 'machines': n_at_full_rate, ...}}
      - 'raw_consumption': {raw_item: total_per_min}
      - 'byproducts': {item: total_per_min produced as byproduct, surplus after consumption}
    """
    RECIPES = recipes  # rebind name locally so the resolution body uses the passed set
    # demand[item] = net per-minute demand (positive = need to produce, negative = surplus)
    demand: Dict[str, float] = defaultdict(float)
    for item, rate in targets.items():
        demand[item] += rate

    # Track what we've fully resolved
    production: Dict[str, float] = defaultdict(float)
    byproducts: Dict[str, float] = defaultdict(float)
    raw: Dict[str, float] = defaultdict(float)

    # Iterate: pick any item with positive net demand that has a recipe
    # Use a worklist; process until no positive demand remains for non-raw items
    iterations = 0
    max_iterations = 1000
    while iterations < max_iterations:
        iterations += 1
        # Find item with positive demand that has a recipe
        target_item = None
        for item, qty in demand.items():
            if qty > 1e-9 and item in RECIPES:
                target_item = item
                break
        if target_item is None:
            # Check for unfulfilled demand (raw inputs are OK)
            unfulfilled = [
                (item, qty) for item, qty in demand.items()
                if qty > 1e-9 and item not in RECIPES and item not in RAW_INPUTS
            ]
            if unfulfilled and not boundary_raw:
                raise RuntimeError(f"No recipe for: {unfulfilled}")
            break

        # Special case: Dark Matter Residue is a byproduct of all QE recipes.
        # Don't run Dark Matter Residue (from SAM) until all QE recipes have run.
        # Defer it if there's any other item with positive demand.
        if target_item == "Dark Matter Residue":
            other_demand = any(
                qty > 1e-9 and item in RECIPES and item != "Dark Matter Residue"
                for item, qty in demand.items()
            )
            if other_demand:
                # find a different one
                next_target = None
                for item, qty in demand.items():
                    if qty > 1e-9 and item in RECIPES and item != "Dark Matter Residue":
                        next_target = item
                        break
                if next_target:
                    target_item = next_target

        recipe = RECIPES[target_item]
        # Need this many output/min
        needed = demand[target_item]
        # Recipe makes recipe.outputs[target_item] per machine per minute
        per_machine = recipe.outputs[target_item]
        n_machines_fractional = needed / per_machine

        # Add inputs to demand
        for inp, in_rate in recipe.inputs.items():
            scaled = _scaled_input_rate(in_rate, recipe.cycle_seconds, cost_multiplier)
            demand[inp] += scaled * n_machines_fractional

        # Add other outputs as byproducts (reduce their demand if any, or surplus)
        for out, out_rate in recipe.outputs.items():
            if out == target_item:
                production[out] += needed
                demand[out] -= needed
            else:
                produced = out_rate * n_machines_fractional
                byproducts[out] += produced
                demand[out] -= produced  # may go negative -> surplus

    # Handle DMR specifically: if there's still positive demand, generate from SAM
    if demand.get("Dark Matter Residue", 0) > 1e-9:
        needed_dmr = demand["Dark Matter Residue"]
        sam_recipe = RECIPES["Dark Matter Residue (from SAM)"]
        per_machine_dmr = sam_recipe.outputs["Dark Matter Residue"]
        n_fractional = needed_dmr / per_machine_dmr
        production["Dark Matter Residue (from SAM)"] += needed_dmr
        for inp, rate in sam_recipe.inputs.items():
            scaled = _scaled_input_rate(rate, sam_recipe.cycle_seconds, cost_multiplier)
            demand[inp] += scaled * n_fractional
        demand["Dark Matter Residue"] = 0
        # Continue resolving any new demand
        while True:
            target_item = None
            for item, qty in demand.items():
                if qty > 1e-9 and item in RECIPES and item != "Dark Matter Residue":
                    target_item = item
                    break
            if target_item is None:
                break
            recipe = RECIPES[target_item]
            needed = demand[target_item]
            per_machine = recipe.outputs[target_item]
            n_fractional = needed / per_machine
            for inp, in_rate in recipe.inputs.items():
                scaled = _scaled_input_rate(in_rate, recipe.cycle_seconds, cost_multiplier)
                demand[inp] += scaled * n_fractional
            for out, out_rate in recipe.outputs.items():
                if out == target_item:
                    production[out] += needed
                    demand[out] -= needed
                else:
                    produced = out_rate * n_fractional
                    byproducts[out] += produced
                    demand[out] -= produced

    # Now collect raw consumption (positive remaining demand for raw items).
    # With boundary_raw, anything left without a recipe is a sub-factory boundary input.
    for item, qty in demand.items():
        if qty > 1e-9 and (item in RAW_INPUTS or (boundary_raw and item not in RECIPES)):
            raw[item] = qty

    # Compute net byproducts (subtract any consumed by other recipes)
    # Actually byproducts already account for consumption via demand subtraction;
    # surplus = -demand[item] for items where demand went negative
    surplus = {}
    for item, qty in demand.items():
        if qty < -1e-9 and item not in RAW_INPUTS:
            surplus[item] = -qty

    return {
        "production": dict(production),
        "raw": dict(raw),
        "byproducts": dict(byproducts),
        "surplus": surplus,
    }


def compute_machine_details(production: Dict[str, float],
                            recipes: Dict = RECIPES,
                            power_multiplier: float = POWER_CONSUMPTION_MULTIPLIER) -> List[Dict]:
    """For each produced item, compute machine count, power, footprint."""
    details = []
    for item, rate in production.items():
        if item not in recipes:
            continue
        recipe = recipes[item]
        building = BUILDINGS[recipe.building]
        per_machine = recipe.outputs[item]
        n_fractional = rate / per_machine
        n_full = math.ceil(n_fractional)
        # Effective clock for full-machine version (avg)
        clock = (n_fractional / n_full) if n_full > 0 else 0
        # Power: use recipe override if set (variable-power buildings have per-recipe avg),
        # else building default
        power_per_machine = recipe.power_override_mw if recipe.power_override_mw is not None else building.power_mw
        # For variable-power buildings (PA, QE, Converter), the listed power_mw is average max
        # For fixed-power, scale linearly with clock^1.6 (game formula approximation)
        # For simplicity, we'll report power at 100% clock (n_fractional as decimal),
        # scaled linearly for fixed buildings
        if building.is_variable_power:
            total_power = n_fractional * power_per_machine  # avg power scales with throughput
        else:
            # Power at clock c is base * c^1.321928 (Satisfactory power exponent)
            # If we run n_full machines at clock c, total = n_full * base * c^1.321928
            # Since c = n_fractional / n_full:
            if n_full > 0 and n_fractional > 0:
                c = n_fractional / n_full
                total_power = n_full * power_per_machine * (c ** 1.321928)
            else:
                total_power = 0
        total_power *= power_multiplier

        # Footprint
        w, l = building.footprint_m
        single_footprint_m2 = w * l
        total_footprint_m2 = single_footprint_m2 * n_full
        # Foundations: bare = building only; with_clearance = building + 1-foundation buffer
        # For "block" of N machines we approximate: machines tiled in a row, share clearance
        # But for planning headroom we report N * with_clearance (worst case)
        foundations_bare = building.foundations_bare * n_full
        # For tiled blocks, the practical footprint is roughly:
        # Total = n_full * bare_dims + perimeter clearance
        # We use simple n_full * with_clearance as a conservative estimate
        foundations_with_clearance = building.foundations_with_clearance * n_full

        details.append({
            "item": item,
            "subfactory": find_subfactory(item),
            "recipe_name": recipe.name,
            "is_alternate": recipe.is_alternate,
            "building": building.name,
            "rate_per_min": rate,
            "machines_fractional": n_fractional,
            "machines_full": n_full,
            "clock_pct": clock * 100,
            "power_mw": total_power,
            "footprint_m2": total_footprint_m2,
            "foundations_bare": foundations_bare,
            "foundations_with_clearance": foundations_with_clearance,
            "single_footprint_m": (w, l),
            "single_foundation_dims": building.foundation_dims,
        })
    return details


if __name__ == "__main__":
    targets = TARGETS
    result = solve(targets)
    details = compute_machine_details(result["production"])

    # Sort by sub-factory then by item
    details.sort(key=lambda d: (d["subfactory"] or "ZZZ", d["item"]))

    print(f"\n{'='*120}")
    print(f"Production targets: {targets}")
    print(f"{'='*120}\n")

    total_power = 0
    total_machines = 0
    total_foundations_bare = 0
    total_foundations_clear = 0
    by_subfactory = defaultdict(lambda: {"power": 0, "machines": 0, "fnd_bare": 0, "fnd_clear": 0, "items": []})

    for d in details:
        sf = d["subfactory"] or "Unknown"
        by_subfactory[sf]["power"] += d["power_mw"]
        by_subfactory[sf]["machines"] += d["machines_full"]
        by_subfactory[sf]["fnd_bare"] += d["foundations_bare"]
        by_subfactory[sf]["fnd_clear"] += d["foundations_with_clearance"]
        by_subfactory[sf]["items"].append(d)
        total_power += d["power_mw"]
        total_machines += d["machines_full"]
        total_foundations_bare += d["foundations_bare"]
        total_foundations_clear += d["foundations_with_clearance"]

    for sf_name in sorted(by_subfactory.keys()):
        sf = by_subfactory[sf_name]
        print(f"\n--- {sf_name} ---")
        print(f"  Total: {sf['machines']} machines, {sf['power']:.1f} MW, "
              f"{sf['fnd_bare']:.0f} fnd bare / {sf['fnd_clear']:.0f} fnd w/clearance")
        for d in sf["items"]:
            alt = " [ALT]" if d["is_alternate"] else ""
            print(f"  {d['item']:<35s}{alt:<6s} | {d['rate_per_min']:>8.2f}/min | "
                  f"{d['machines_full']:>3d}× {d['building']:<22s} @ {d['clock_pct']:>5.1f}% | "
                  f"{d['power_mw']:>7.1f} MW | {d['foundations_bare']:>4.0f}/{d['foundations_with_clearance']:>4.0f} fnd")

    print(f"\n{'='*120}")
    print(f"GRAND TOTAL: {total_machines} machines, {total_power:.1f} MW, "
          f"{total_foundations_bare:.0f} fnd bare / {total_foundations_clear:.0f} fnd w/clearance")
    print(f"{'='*120}")

    print(f"\nRaw consumption:")
    for item, qty in sorted(result["raw"].items()):
        print(f"  {item:<25s}: {qty:>10.2f} /min")

    if result["surplus"]:
        print(f"\nSurplus (overflow available for sinking):")
        for item, qty in sorted(result["surplus"].items()):
            print(f"  {item:<25s}: {qty:>10.2f} /min")
