// Sanity harness for the balancer: parses specs, builds graphs, and checks flow
// conservation at every node, node degrees, and that outputs receive their rates.
import { machineSpellings, parseSpec } from "../src/balancer/parse";
import { buildBalancer } from "../src/balancer/build";
import { layoutGraph } from "../src/balancer/layout";

const SPECS = [
  "1:2", "1:3", "1:4", "1:5", "1:7", "2:3", "3:2", "5:12",
  "120:48,72", "120:60,60", "60:60", "60,60:40,40,40", "780:270,270,240",
  "1:1,2,3", "45,15:1", "1:99", "33.5,66.5:25,75", "120:7,113",
  "324:x22", "324:x21,9", "202.5:x27", "x3:90", "120:x2,x2", "60,60:x8",
  "480:150,150,R", "480:r", "480:R,R", "45,15:r", "120:R,30,R",
];
const BAD = [
  "", "abc", "1:2:3", "120:50,60", "1:0", "-5:5", "1:0.00001",
  "x2:x3", "9:x2,10", "x0:5", "480:x2,R", "100:150,R", "R:R",
];

let failures = 0;
const fail = (spec: string, msg: string) => {
  failures++;
  console.error(`FAIL ${spec}: ${msg}`);
};

for (const raw of SPECS) {
  const p = parseSpec(raw);
  if (!p.ok) { fail(raw, `parse error: ${p.error}`); continue; }
  const b = buildBalancer(p.spec);
  if (!b.ok) { fail(raw, `build error: ${b.error}`); continue; }
  const g = b.graph;
  const eps = 1e-6;

  const inflow = new Map<number, number>();
  const outflow = new Map<number, number>();
  const indeg = new Map<number, number>();
  const outdeg = new Map<number, number>();
  for (const e of g.edges) {
    inflow.set(e.to, (inflow.get(e.to) ?? 0) + e.rate);
    outflow.set(e.from, (outflow.get(e.from) ?? 0) + e.rate);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    outdeg.set(e.from, (outdeg.get(e.from) ?? 0) + 1);
  }

  const outputs: number[] = [];
  for (const n of g.nodes) {
    const fin = inflow.get(n.id) ?? 0;
    const fout = outflow.get(n.id) ?? 0;
    if (n.kind === "input") {
      if (indeg.get(n.id)) fail(raw, `input ${n.id} has inflow`);
      if (Math.abs(fout - n.rate) > eps) fail(raw, `input ${n.id} emits ${fout} != ${n.rate}`);
      if ((outdeg.get(n.id) ?? 0) !== 1) fail(raw, `input ${n.id} outdeg != 1`);
    } else if (n.kind === "output") {
      if (outdeg.get(n.id)) fail(raw, `output ${n.id} has outflow`);
      if (Math.abs(fin - n.rate) > eps) fail(raw, `output ${n.id} gets ${fin} != ${n.rate}`);
      outputs.push(fin);
    } else {
      if (Math.abs(fin - fout) > eps) fail(raw, `${n.kind} ${n.id}: in ${fin} != out ${fout}`);
      if (n.kind === "split") {
        if ((indeg.get(n.id) ?? 0) !== 1) fail(raw, `split ${n.id} indeg != 1`);
        const d = outdeg.get(n.id) ?? 0;
        if (d < 2 || d > 3) fail(raw, `split ${n.id} outdeg ${d}`);
        // Equal split check
        const rates = g.edges.filter((e) => e.from === n.id).map((e) => e.rate);
        if (rates.some((r) => Math.abs(r - rates[0]) > eps)) fail(raw, `split ${n.id} uneven: ${rates}`);
      } else {
        const d = indeg.get(n.id) ?? 0;
        if (d < 2 || d > 3) fail(raw, `merge ${n.id} indeg ${d}`);
        if ((outdeg.get(n.id) ?? 0) !== 1) fail(raw, `merge ${n.id} outdeg != 1`);
      }
    }
  }
  // Output order must match spec order.
  const expected = p.spec.outputs;
  const got = g.nodes.filter((n) => n.kind === "output").map((n) => n.rate);
  if (got.length !== expected.length) fail(raw, `output count ${got.length} != ${expected.length}`);

  const placed = layoutGraph(g);
  if (!isFinite(placed.width) || !isFinite(placed.height)) fail(raw, "layout not finite");
  for (const n of g.nodes) {
    if (!isFinite(placed.x[n.id]) || !isFinite(placed.y[n.id])) fail(raw, `node ${n.id} NaN pos`);
  }

  console.log(
    `ok   ${raw.padEnd(22)} -> ${g.splitters} split, ${g.mergers} merge, ` +
    `loop ${g.loopRate.toFixed(2)}, nodes ${g.nodes.length}, note: ${p.spec.note}`,
  );
}

for (const raw of BAD) {
  const p = parseSpec(raw);
  if (p.ok) {
    const b = buildBalancer(p.spec);
    if (b.ok) fail(raw, "expected rejection but built fine");
    else console.log(`ok   ${raw.padEnd(22)} -> build rejected: ${b.error}`);
  } else {
    console.log(`ok   ${raw.padEnd(22)} -> parse rejected: ${p.error}`);
  }
}

// Balanced/remainder spelling round-trips for machine-split specs.
const TOGGLES: Array<[string, string | null, string | null]> = [
  // [spec, expected balanced, expected remainder] — null expectations mean "no toggle"
  ["324:x22", "324:x22", "324:x21,9"],
  ["324:x21,9", "324:x22", "324:x21,9"],
  ["300:x20", null, null], // divides exactly — no toggle
  ["120:48,72", null, null], // not a machine-split spec
  ["202.5:x27", "202.5:x27", "202.5:x25,2.5"],
];
for (const [raw, balanced, remainder] of TOGGLES) {
  const s = machineSpellings(raw);
  if (balanced === null) {
    if (s) fail(raw, `expected no toggle, got ${JSON.stringify(s)}`);
    else console.log(`ok   ${raw.padEnd(22)} -> no toggle`);
    continue;
  }
  if (!s) { fail(raw, "expected a toggle, got none"); continue; }
  if (s.balanced !== balanced) fail(raw, `balanced ${s.balanced} != ${balanced}`);
  if (s.remainder !== remainder) fail(raw, `remainder ${s.remainder} != ${remainder}`);
  for (const alt of [s.balanced, s.remainder]) {
    const p = parseSpec(alt);
    if (!p.ok) { fail(raw, `spelling ${alt} does not parse: ${p.error}`); continue; }
    const b = buildBalancer(p.spec);
    if (!b.ok) fail(raw, `spelling ${alt} does not build: ${b.error}`);
  }
  console.log(`ok   ${raw.padEnd(22)} -> ${s.current}; even ${s.balanced}, remainder ${s.remainder}`);
}

console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
