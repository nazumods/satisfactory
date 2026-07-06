# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this repo is

A Satisfactory **Phase 5 production planner**, in two parts that model the same domain:

1. **Python CLI (repo root)** — the canonical solver. Resolves the full manufacturing
   chain for a set of targets and renders a markdown plan.
   - `recipes.py` — recipe database, building defs, sub-factory groupings, `TARGETS`.
   - `solver.py` — BFS chain solver (recursive inputs, byproducts like Dark Matter Residue).
   - `generate_doc.py` — renders solver output to `plan.md`.
   - `plan.md` — **generated; never edit by hand.**
2. **`apps/factory-planner`** — an interactive React + TypeScript + Vite web app that
   re-implements the solver in TS so alternate recipes and tier gating can be explored
   live in the browser. Deployed to GitHub Pages.

**The two implementations must stay consistent.** The TS app mirrors `recipes.py` verbatim
so it reproduces `plan.md`'s machine counts and power for the same recipe selection. If you
change recipe data or solver logic in one, check whether the other needs the same change.

**Intentional divergence — external supply.** The web app can mark parts as externally
supplied (a subsidy with an optional /min cap), so the solver draws from that supply before
producing. This is a live, interactive-only concept with no Python counterpart; `solver.py`
stays the all-produced canonical baseline that `plan.md` reflects. With no supplies set, the
TS `solve(...)` reproduces the Python numbers exactly, so the two remain consistent for the
baseline. Don't try to "sync" the supply feature into `recipes.py`/`solver.py`.

**Cost Multipliers game mode.** Both solvers support Satisfactory's Advanced Game Settings
"Recipe Parts Cost Multiplier" and "Power Consumption Multiplier" (`Multipliers` in
`solver.ts` / `cost_multiplier`+`power_multiplier` params in `solver.py`, default 1.0 = a
no-op reproducing the baseline). The parts-cost multiplier does **not** scale per-minute
rates smoothly — the game rounds each ingredient's per-craft-cycle *integer* amount
(`round(amount * multiplier)`, floored at 1) and recomputes the rate from that. Every
`Recipe` therefore carries a `cycleSeconds`/`cycle_seconds` field so the solver can recover
that integer (`rate * cycleSeconds / 60`). **When adding a new recipe, look up its real
craft-cycle time (recipes.py comments or satisfactory.wiki.gg) — don't guess it** — a wrong
cycle time silently produces wrong multiplier scaling for that recipe while leaving the
default-multiplier baseline unaffected (which is why typechecking won't catch it).

## Commands

### Python (repo root)
```
python generate_doc.py > plan.md   # regenerate the plan after editing recipes.py
python solver.py                   # raw solver output (machines/power/foundations), no markdown
```
Edit `TARGETS` in `recipes.py` to change what's produced and at what rate.

### Web app (`apps/factory-planner`)
```
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # type-check + production build to dist/
npm run typecheck  # tsc -b --noEmit — run this to verify TS changes
```
There is no test runner. Verify changes with `npm run typecheck` plus the sanity check:
```
npx esbuild scripts/check.ts --bundle --platform=node --format=esm --outfile=scripts/check.mjs && node scripts/check.mjs
```
`scripts/check.ts` solves the all-standard baseline and the user's alt config and prints
totals (validated against `plan.md`).

## App layout (`apps/factory-planner/src`)

- `Root.tsx` — hash-route switch: `#/balancer/<spec>` shows the belt balancer, anything
  else the planner (`App.tsx`). Hash routing because GitHub Pages serves from a subpath.
- `data/` — `recipes.ts` (recipe data, items/min at 100% clock), `types.ts`.
- `solver/` — `solver.ts` (chain solver), `model.ts` (derived indexes, tiers), `attribution.ts`
  (on-site folding), `altAnalysis.ts` (marginal alt impacts), `flows.ts` (inter-factory flows).
- `balancer/` — belt-balancer view logic: `parse.ts` (spec grammar, e.g. `120:48,72` or
  `1:5`), `build.ts` (splitter/merger graph, feedback loop for non-2^a·3^b ratios),
  `layout.ts` (layered SVG layout). Interactive-only, no Python counterpart (like external
  supply). Sanity-check invariants with `scripts/check-balancer.ts` (same esbuild+node
  invocation as `scripts/check.ts`).
- `components/` — `SummaryBar.tsx`, `FactoryView.tsx`, `AltPanel.tsx`, `SupplyPanel.tsx`
  (external-supply controls), `BalancerView.tsx` (balancer page), plus `App.tsx` (root).
- `ui/` — `format.ts` (number/power formatting), `persist.ts` (localStorage), `route.ts`
  (hash routing).
- `styles.css` — all styling, single file, themed with CSS variables (`var(--accent)`, etc.).

### UI state persistence
Persisted settings live in localStorage under `factory-planner:setups:v1` via `ui/persist.ts`
(named setups, each holding a full `PersistedState`; the pre-multi-setup key
`factory-planner:state:v1` is read once as a legacy fallback). To add a new persisted
setting: add the field to `PersistedState`, lift the state into `App.tsx`, include it in the
`saveSetups(...)` effect, and validate it on load (guard against stale/corrupt storage — see
the `valid*` helpers in `App.tsx`).

## Conventions

- **Keep files under 200–300 lines when possible.** Split a growing module or component
  rather than letting it sprawl.
- TypeScript is strict; 2-space indentation. Match the style of surrounding code.
- React function components with hooks; lift shared state to `App.tsx` and pass props down.
- Keep styling in `styles.css` using the existing CSS variables — don't introduce a CSS-in-JS
  layer or per-component stylesheets.
- Match the comment density and naming of the file you're editing.

## Deployment

Pushing to `main` with changes under `apps/factory-planner/**` triggers the GitHub Pages
deploy in `.github/workflows/deploy.yml` (`npm ci && npm run build`, publishes `dist/`).
Vite `base` is `"./"` so the build works from the Pages subpath. Only commit/push when asked.
