// Throwaway numeric + integrity check. Bundle with esbuild, run via node.
import { solve } from "../src/solver/solver";
import { attribute } from "../src/solver/attribution";
import { RECIPES, TARGETS, ONSITE_DEFAULT } from "../src/data/recipes";
import {
  DEFAULT_RECIPE_BY_PRODUCT, ALT_RECIPES, RECIPES_BY_PRODUCT, SUBFACTORY_TIERS, itemTier,
} from "../src/solver/model";
import { computeAltImpacts } from "../src/solver/altAnalysis";
import { findSubfactory } from "../src/data/recipes";

const stdSelection: Record<string, string> = {};
for (const [p, r] of Object.entries(DEFAULT_RECIPE_BY_PRODUCT)) stdSelection[p] = r.id;

const base = solve(TARGETS, stdSelection);
console.log("=== ALL-STANDARD BASELINE ===");
console.log("machines:", base.totalMachines, "power MW:", base.totalPowerMw.toFixed(1));
console.log("recipes total:", RECIPES.length, "| alternates:", ALT_RECIPES.length);

console.log("\n=== DATA INTEGRITY ===");
let problems = 0;
for (const [product, recs] of Object.entries(RECIPES_BY_PRODUCT)) {
  const std = recs.filter((r) => !r.alt);
  if (std.length !== 1) {
    console.log(`  ⚠ ${product}: ${std.length} standard recipes (expected 1)`);
    problems++;
  }
  if (findSubfactory(product) === "Other") {
    console.log(`  ⚠ ${product}: not assigned to a sub-factory`);
    problems++;
  }
}
console.log(problems === 0 ? "  OK — every product has exactly 1 standard recipe and a sub-factory" : `  ${problems} problem(s)`);

console.log("\n=== TIERS ===");
console.log(JSON.stringify(SUBFACTORY_TIERS));

console.log("\n=== ALT IMPACTS (all, tier 9) — NaN/finite check + top 14 ===");
const impacts = computeAltImpacts(TARGETS, stdSelection, 9);
const bad = impacts.filter((im) => !isFinite(im.powerSavedMw) || !isFinite(im.rawSaved));
console.log("alts ranked:", impacts.length, "| non-finite:", bad.length);
for (const im of impacts.slice(0, 14)) {
  console.log(
    `${im.recipe.id.padEnd(28)} T${im.tier} ${im.powerSavedMw >= 0 ? "-" : "+"}${Math.abs(im.powerSavedMw).toFixed(0)}MW ` +
    `(${(im.powerSavedPct * 100).toFixed(1)}%) rawΔ=${(-im.rawSaved).toFixed(0)}  ${im.product}`,
  );
}

console.log("\n=== SPOT-CHECK new alternates solve cleanly ===");
for (const altId of ["Caterium Circuit Board", "Pink Diamonds", "Heat-Fused Frame", "Turbo Pressure Motor", "Heavy Encased Frame"]) {
  const alt = ALT_RECIPES.find((a) => a.id === altId)!;
  const sel = { ...stdSelection, [alt.product]: alt.id };
  const res = solve(TARGETS, sel);
  console.log(`  ${altId.padEnd(26)} -> ${alt.product.padEnd(20)} power ${res.totalPowerMw.toFixed(0)}MW machines ${res.totalMachines}`);
}

console.log("\nitemTier Petroleum Coke:", itemTier("Petroleum Coke"),
  "Packaged Turbofuel:", itemTier("Packaged Turbofuel"),
  "Limestone:", itemTier("Limestone"));

console.log("\n=== FLOW CONSERVATION (export to factories == sum of imports) ===");
{
  const av = attribute(base, new Set(ONSITE_DEFAULT));
  const exported: Record<string, number> = {}; // factory-bound exports per item
  const imported: Record<string, number> = {}; // factory-sourced imports per item
  for (const F of Object.values(av.factories)) {
    for (const o of F.outputs) {
      const ext = o.rate
        - (o.isTarget ? (TARGETS[o.item] ?? 0) : 0)
        - (o.isSurplus ? (base.surplus[o.item] ?? 0) : 0);
      if ((o.destinations?.length ?? 0) > 0) exported[o.item] = (exported[o.item] ?? 0) + ext;
    }
    for (const i of F.inputs) {
      if (i.source !== "RAW") imported[i.item] = (imported[i.item] ?? 0) + i.rate;
    }
  }
  const items = new Set([...Object.keys(exported), ...Object.keys(imported)]);
  let mismatches = 0;
  for (const it of items) {
    const e = exported[it] ?? 0, im = imported[it] ?? 0;
    if (Math.abs(e - im) > 0.01) {
      console.log(`  ⚠ ${it}: exported ${e.toFixed(2)} vs imported ${im.toFixed(2)}`);
      mismatches++;
    }
  }
  console.log(mismatches === 0 ? "  OK — every inter-factory export matches its imports" : `  ${mismatches} mismatch(es)`);
}
