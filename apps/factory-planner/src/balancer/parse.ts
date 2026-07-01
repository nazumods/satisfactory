// Parsing of balancer specs from the URL hash, e.g. "120:48,72", "1:5" or "324:x22".
//
// Grammar: `<inputs>:<outputs>`, each side a comma-separated list of terms. A term is a
// positive number (a rate) or `xN` — N belts sharing the side's residual rate equally
// (machine feeds: `324:x22` = 324/min split evenly over 22 machines, `324:x21,9` = 21
// machines at full rate plus a 9/min remainder). Only one side may use x-terms.
// Plain-number specs are read as, in order:
//   1. Sums match            -> literal rates ("120:48,72" = 120/min in, 48+72/min out).
//   2. `N:M` single integers -> belt counts: N equal belts balanced into M equal belts.
//   3. `1:a,b,...`           -> split one belt in the ratio a:b:... (input = sum).
//   4. `a,b,...:1`           -> merge belts given in ratio a:b:... into one.
// Anything else is an error (mismatched rate sums are almost always a typo).

export interface ParsedSpec {
  inputs: number[]; // rates; sum equals sum(outputs)
  outputs: number[];
  /** Exact integer split weights per output, when x-terms make rates non-terminating. */
  outputWeights?: number[];
  note: string; // human-readable statement of how the spec was read
}

export type ParseResult = { ok: true; spec: ParsedSpec } | { ok: false; error: string };

type Term = { kind: "rate"; value: number } | { kind: "x"; count: number };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function gcd2(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function parseTerms(raw: string): Term[] | null {
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length === 0 || parts.some((p) => p === "")) return null;
  const terms: Term[] = [];
  for (const p of parts) {
    const xm = /^x(\d+)$/i.exec(p);
    if (xm) {
      const count = Number(xm[1]);
      if (count < 1) return null;
      terms.push({ kind: "x", count });
    } else {
      const n = Number(p);
      if (!Number.isFinite(n) || n <= 0) return null;
      terms.push({ kind: "rate", value: n });
    }
  }
  return terms;
}

const hasX = (ts: Term[]) => ts.some((t) => t.kind === "x");
const rateSum = (ts: Term[]) => sum(ts.map((t) => (t.kind === "rate" ? t.value : 0)));

/** Trim float noise for display / spec round-tripping. */
const disp = (n: number) => String(Number(n.toFixed(2)));

const fmtList = (xs: number[]) => xs.map(disp).join(" + ");

/**
 * Expand a side's x-terms against the opposite side's total. Returns per-belt rates in
 * term order plus exact integer weights (rates scaled by 10^4·K, so `324:x22` doesn't
 * lose the 324/22 ratio to decimal rounding).
 */
function resolveX(
  terms: Term[],
  otherSum: number,
): { rates: number[]; weights: number[]; note: string } | { error: string } {
  const K = sum(terms.map((t) => (t.kind === "x" ? t.count : 0)));
  const explicit = rateSum(terms);
  const residual = otherSum - explicit;
  if (residual <= 0) {
    return { error: `xN belts need spare rate to share (explicit terms already use ${disp(explicit)}).` };
  }
  const residScaled = Math.round(residual * 10000);
  const rates: number[] = [];
  const weights: number[] = [];
  const noteParts: string[] = [];
  for (const t of terms) {
    if (t.kind === "rate") {
      const scaled = Math.round(t.value * 10000);
      if (Math.abs(scaled - t.value * 10000) > 1e-3) {
        return { error: "Rates must have at most 4 decimal places." };
      }
      rates.push(t.value);
      weights.push(scaled * K);
      noteParts.push(disp(t.value));
    } else {
      for (let i = 0; i < t.count; i++) {
        rates.push(residual / K);
        weights.push(residScaled);
      }
      noteParts.push(`${t.count}×${disp(residual / K)}`);
    }
  }
  return { rates, weights, note: noteParts.join(" + ") };
}

export function parseSpec(raw: string): ParseResult {
  let text: string;
  try {
    text = decodeURIComponent(raw).trim();
  } catch {
    return { ok: false, error: "Malformed URL encoding in spec." };
  }
  if (!text) return { ok: false, error: "Enter a spec like 120:48,72 or 1:5." };

  const sides = text.split(":");
  if (sides.length !== 2) {
    return { ok: false, error: "Spec must be <inputs>:<outputs>, e.g. 120:48,72." };
  }
  const leftTerms = parseTerms(sides[0]);
  const rightTerms = parseTerms(sides[1]);
  if (!leftTerms || !rightTerms) {
    return { ok: false, error: "Each side must be comma-separated positive numbers or xN counts." };
  }

  // x-terms: one side shares the other side's total.
  if (hasX(leftTerms) && hasX(rightTerms)) {
    return { ok: false, error: "Only one side can use xN counts." };
  }
  if (hasX(rightTerms)) {
    const inputs = leftTerms.map((t) => (t.kind === "rate" ? t.value : 0));
    const r = resolveX(rightTerms, sum(inputs));
    if ("error" in r) return { ok: false, error: r.error };
    return {
      ok: true,
      spec: {
        inputs,
        outputs: r.rates,
        outputWeights: r.weights,
        note: `${fmtList(inputs)}/min in → ${r.note}/min out`,
      },
    };
  }
  if (hasX(leftTerms)) {
    const outputs = rightTerms.map((t) => (t.kind === "rate" ? t.value : 0));
    const r = resolveX(leftTerms, sum(outputs));
    if ("error" in r) return { ok: false, error: r.error };
    return {
      ok: true,
      spec: {
        inputs: r.rates,
        outputs,
        note: `${r.note}/min in → ${fmtList(outputs)}/min out`,
      },
    };
  }

  const left = leftTerms.map((t) => (t.kind === "rate" ? t.value : 0));
  const right = rightTerms.map((t) => (t.kind === "rate" ? t.value : 0));
  const inSum = sum(left);
  const outSum = sum(right);

  // 1. Literal rates.
  if (Math.abs(inSum - outSum) < 1e-6) {
    return {
      ok: true,
      spec: {
        inputs: left,
        outputs: right,
        note: `${fmtList(left)}/min in → ${fmtList(right)}/min out`,
      },
    };
  }

  // 2. N:M belt counts (classic "2:3 balancer").
  if (
    left.length === 1 && right.length === 1 &&
    Number.isInteger(left[0]) && Number.isInteger(right[0])
  ) {
    const n = left[0];
    const m = right[0];
    const total = (n * m) / gcd2(n, m); // lcm, so per-belt rates stay integral
    return {
      ok: true,
      spec: {
        inputs: Array(n).fill(total / n),
        outputs: Array(m).fill(total / m),
        note: `${n} belt${n > 1 ? "s" : ""} → ${m} equal belt${m > 1 ? "s" : ""} (ratio units)`,
      },
    };
  }

  // 3 & 4. One side is a bare `1`: the other side is a pure ratio.
  if (left.length === 1 && left[0] === 1) {
    return {
      ok: true,
      spec: {
        inputs: [outSum],
        outputs: right,
        note: `split 1 belt in the ratio ${right.join(" : ")}`,
      },
    };
  }
  if (right.length === 1 && right[0] === 1) {
    return {
      ok: true,
      spec: {
        inputs: left,
        outputs: [inSum],
        note: `merge belts in the ratio ${left.join(" : ")}`,
      },
    };
  }

  return {
    ok: false,
    error: `Input and output rates must sum equal (got ${inSum} vs ${outSum}).`,
  };
}

/**
 * The two spellings of a machine-split spec (`R:xN` even, `R:xM,rem` full-machines +
 * remainder), for the balanced/remainder toggle. Null when the spec isn't that shape
 * or the split is exact (both spellings coincide).
 */
export function machineSpellings(
  raw: string,
): { balanced: string; remainder: string; current: "balanced" | "remainder" } | null {
  let text: string;
  try {
    text = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  const m = /^([^:x]+):x(\d+)(?:,([\d.]+))?$/i.exec(text);
  if (!m) return null;
  const inputs = parseTerms(m[1]);
  if (!inputs || hasX(inputs)) return null;
  const total = rateSum(inputs);
  const xCount = Number(m[2]);
  const tail = m[3] !== undefined ? Number(m[3]) : null;
  if (xCount < 1 || (tail !== null && !(tail > 0))) return null;

  // Belt count N of the even spelling; for `xM,rem` the remainder belt is the Nth.
  const n = tail === null ? xCount : xCount + 1;
  if (n < 2) return null;
  const full = Math.ceil(total / n); // full-machine rate implied by an even N-way split
  const fullCount = Math.floor(total / full);
  const rem = Number((total - fullCount * full).toFixed(4));
  if (rem <= 0) return null; // divides exactly — the spellings coincide
  const left = m[1].trim();
  return {
    balanced: `${left}:x${n}`,
    remainder: `${left}:x${fullCount},${rem}`,
    current: tail === null ? "balanced" : "remainder",
  };
}
