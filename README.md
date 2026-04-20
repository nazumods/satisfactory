# satisfactory

Production planning tool for Satisfactory Phase 5. Solves the full manufacturing chain for a set of target outputs and generates a formatted markdown plan with machine counts, power budgets, and foundation footprints.

## Files

| File | Purpose |
|---|---|
| `recipes.py` | Recipe database, building definitions, sub-factory groupings, and target config (`TARGETS`) |
| `solver.py` | BFS production chain solver — resolves all inputs recursively, handles byproducts (Dark Matter Residue) |
| `generate_doc.py` | Renders solver output to `plan.md` |
| `plan.md` | Generated output — don't edit by hand |

## Usage

Edit `TARGETS` in `recipes.py` to set what you want to produce and at what rate:

```python
TARGETS = {
    "Nuclear Pasta": 4,
    "Biochemical Sculptor": 4,
    "AI Expansion Server": 1,
    "Ballistic Warp Drive": 1,
}
```

Then regenerate the plan:

```
python generate_doc.py > plan.md
```

To see raw solver output (machine counts, power, foundations per item) without the markdown formatting:

```
python solver.py
```

## What the plan includes

- **Summary** — total machines, average power draw, foundation count across all sub-factories
- **Per sub-factory tables** — every produced item with machine count, clock speed, power, and foundation footprint
- **Interface flows** — what moves between sub-factories and what belt/pipe tier is needed
- **Raw inputs** — everything that flows in from outside (ingots, fluids, SAM, concrete, fuel)
- **Surplus** — byproducts available for sinking or use elsewhere
- **Recipe choices** — which alternates are active and why
- **Building footprint appendix** — foundation dimensions per building type with per-building clearance

## Tuning clearance

Each building in `recipes.py` has a `clearance_m` tuple `(width, length)` defining extra space per side in meters. Default is `(8, 8)` (one foundation buffer each side). Set either value to `0` to allow machines to be placed edge-to-edge on that axis:

```python
"Constructor": Building("Constructor", 4, (8, 10), clearance_m=(0, 6)),
```

## Recipe alternates

Alternates are selected from the community S/A/B-tier ranking. Active choices are listed at the top of `recipes.py` with conflict resolution notes. To swap a recipe, replace the relevant `add(Recipe(...))` call in `recipes.py` and re-run.
