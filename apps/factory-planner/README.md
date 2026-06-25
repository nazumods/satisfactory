# Factory Planner (React)

An interactive companion to the Python solver in the repo root. It re-implements the
production-chain solver in TypeScript so you can explore **alternate recipes** and **tier
gating** live in the browser — without re-running `generate_doc.py`.

## What it does

- **Factory tables** — switch between sub-factories (Steel, Electronics, Quantum, …) and
  see every produced item with its recipe, building, machine count, clock, power, and
  foundations, plus per-factory **inputs** (and where each comes from) and **outputs**.
  Two extra views — *Σ Raw inputs* and *⇪ Surplus* — show the boundary feed and byproducts.
- **Alternate recipes** — the full wiki-verified set of alternates for every product in the
  plan (~65). All **off by default**; tick the ones you've unlocked and press **Recompute** to
  re-solve. Ticking an alt for a product replaces its standard recipe (radio within a product).
  A **filter box** (with an ✕ to clear) narrows the list by recipe, product, building, or factory.
- **Priority ranking** — alts are ranked by marginal impact (power %, raw-input reduction, or
  a combined score). Each card shows how much power/raw it saves vs. the standard recipe and
  **which factories are affected** (e.g. `Steel −293 MW`, `Electronics −451 MW`) and **which
  resources change** (e.g. `−1,187 Coal`, `−1,043 Iron Ingot`).
- **Two tracks** — factories are grouped into the **Project Assembly** line (the Space Elevator
  deliverables: Plating → Framework → Engine → Propulsion → Final Assembly) and the **Support**
  factories that feed it, each ordered by build sequence. Electronics is split into early
  **Electronics** (basic components) and late **Advanced Electronics** (aluminum-era control parts).
- **Tier selector** — set the tier you're at. Factories and alternates above your tier are
  **grayed out but still visible** for planning ahead. Each factory's build-order tier and track
  are set explicitly in `FACTORY_META` (in `recipes.ts`) — edit that to reorder. The headline
  **machines / power / foundations reflect the current-tier requirement** (only factories you can
  build now), with the full-plan total shown beneath as a hint.
- **Make on-site vs. belt** — cheap commodity parts (Screws, Wire, Steel Pipe, …) are marked
  *made on-site* by default: they're built inside each consuming factory instead of belted
  from a central hub. Toggle any candidate in the "Made on-site" bar. On-site parts stay fully
  counted in power / raw / foundation totals (their machines fold into each consumer and their
  raws roll up to ingots), they just don't clutter the inter-factory flows. The **Σ Raw inputs**
  view then shows the true boundary feed (ores, ingots, fluids).

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Data

Recipe data lives in [`src/data/recipes.ts`](src/data/recipes.ts) (items/min at 100% clock).

- Recipes that the root `recipes.py` defines are mirrored verbatim, so this app reproduces
  `plan.md`'s per-sub-factory machine counts and power when the same alternates are selected.
- Standard (non-alt) recipes for items where `recipes.py` only stored the alt are sourced from
  satisfactory.wiki.gg, so an "all-standard" baseline exists.
- Iron Plate / Copper Sheet / Wire are modeled here (the Python plan belts them in as raw) so
  basic-tier alternates (Iron Wire, Stitched Iron Plate, Coated Cable, …) are explorable; this
  means the app's raw-input totals roll further up to ingots than `plan.md`'s.

Building unlock tiers, raw-input availability tiers, and per-recipe tiers are all in
`recipes.ts` / `src/solver/model.ts` and easy to edit.

**Correction vs. recipes.py:** the Python file labels *Heat-Fused Frame* as a Heavy Modular
Frame alternate, but per the wiki it actually produces *Fused* Modular Frame (Heavy Modular
Frame → Fused). This app puts it on Fused Modular Frame and gives Heavy Modular Frame its real
alternates (Heavy Encased Frame, Heavy Flexible Frame). A few alternates introduce extra inputs
(Petroleum Coke, Compacted Coal, Turbofuel, Limestone, packaged fluids); supporting standard
recipes for those are included so the tree stays closed.

### Sanity check

`scripts/check.ts` solves the all-standard baseline and the user's alt config and prints
totals (validated against `plan.md`). Run it with:

```
npx esbuild scripts/check.ts --bundle --platform=node --format=esm --outfile=scripts/check.mjs && node scripts/check.mjs
```
