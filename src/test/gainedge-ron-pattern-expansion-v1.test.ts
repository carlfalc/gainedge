/**
 * GAINEDGE_RON_PATTERN_EXPANSION_V1
 *
 * Proves the additive expansion of the named-pattern catalogue from 7 to 11 without any
 * change to the pinned base detector, and proves the educational preview handles the new
 * geometry under the existing stored-data truth rules.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectPatterns, type OHLCVCandle,
} from "../../supabase/functions/_shared/ron-patterns";
import {
  detectExpansionPatterns, detectInverseHeadAndShoulders, detectConvergingStructure,
  RON_NAMED_PATTERN_CATALOGUE_V1, EXPANSION_PATTERN_NAMES, MIN_STRUCTURE_SPAN_BARS,
} from "../../supabase/functions/_shared/ron-patterns-expansion-v1";
import { PATTERN_DETECTOR_SOURCE_SHA256 } from "../../supabase/functions/_shared/ron-pattern-context-spec";
import { PATTERN_GLOSSARY, patternGlossary, extractPatternGeometry } from "@/lib/pattern-preview";
import {
  RON_FEATURE_VERSION, RON_FEATURE_VERSION_V6,
} from "../../supabase/functions/_shared/ron-features";
import {
  CURRENT_RON_SNAPSHOT_FEATURE_VERSION, CURRENT_RON_FEATURE_VERSION, CURRENT_RON_LABEL_VERSION,
} from "@/services/ron-snapshots";

/* ── deterministic fixture builders ──────────────────────────────── */

const BAR_MS = 900;
const EPS = 0.6;

/** Linear interpolation between explicit (index, price) pivots → OHLC candles. */
function zigzag(pivots: [number, number][], length: number): OHLCVCandle[] {
  const value = (i: number): number => {
    for (let k = 0; k < pivots.length - 1; k++) {
      const [x0, y0] = pivots[k];
      const [x1, y1] = pivots[k + 1];
      if (i >= x0 && i <= x1) return y0 + ((y1 - y0) * (i - x0)) / (x1 - x0);
    }
    return i < pivots[0][0] ? pivots[0][1] : pivots[pivots.length - 1][1];
  };
  const out: OHLCVCandle[] = [];
  for (let i = 0; i < length; i++) {
    const v = value(i);
    out.push({ time: 1_700_000_000 + i * BAR_MS, open: v, high: v + EPS, low: v - EPS, close: v, volume: 100 });
  }
  return out;
}

/** Oscillation of given half-period whose centre and amplitude evolve linearly. */
function oscillate(opts: {
  length: number; half: number;
  centreStart: number; centreEnd: number;
  ampStart: number; ampEnd: number;
}): OHLCVCandle[] {
  const { length, half, centreStart, centreEnd, ampStart, ampEnd } = opts;
  const pivots: [number, number][] = [];
  let up = true;
  for (let i = 0; i <= length - 1; i += half) {
    const t = i / (length - 1);
    const centre = centreStart + (centreEnd - centreStart) * t;
    const amp = ampStart + (ampEnd - ampStart) * t;
    pivots.push([i, centre + (up ? amp : -amp)]);
    up = !up;
  }
  return zigzag(pivots, length);
}

const SYMMETRICAL = oscillate({ length: 97, half: 8, centreStart: 2400, centreEnd: 2400, ampStart: 34, ampEnd: 7 });
const RISING_WEDGE = oscillate({ length: 97, half: 8, centreStart: 2380, centreEnd: 2430, ampStart: 30, ampEnd: 7 });
const FALLING_WEDGE = oscillate({ length: 97, half: 8, centreStart: 2430, centreEnd: 2380, ampStart: 30, ampEnd: 7 });
/** Constant-amplitude channel: boundaries parallel, never converging. */
const PARALLEL_CHANNEL = oscillate({ length: 97, half: 8, centreStart: 2400, centreEnd: 2400, ampStart: 25, ampEnd: 25 });
const RISING_CHANNEL = oscillate({ length: 97, half: 8, centreStart: 2380, centreEnd: 2440, ampStart: 25, ampEnd: 25 });
const FALLING_CHANNEL = oscillate({ length: 97, half: 8, centreStart: 2440, centreEnd: 2380, ampStart: 25, ampEnd: 25 });

/** Inverse H&S: left shoulder, deeper head, comparable right shoulder. */
const INVERSE_HNS = zigzag(
  [[0, 2440], [10, 2400], [20, 2432], [32, 2360], [44, 2430], [56, 2402], [70, 2445]],
  75,
);
/** Near miss: the "head" is not meaningfully lower than the shoulders. */
const INVERSE_HNS_NEAR_MISS = zigzag(
  [[0, 2440], [10, 2400], [20, 2432], [32, 2399], [44, 2430], [56, 2401], [70, 2445]],
  75,
);

const pick = (list: { pattern_name: string }[], name: string) =>
  list.find((p) => p.pattern_name === name) ?? null;

/* ── 1. base detector untouched ──────────────────────────────────── */

describe("1. the pinned base detector is behaviourally unchanged", () => {
  it("keeps the pinned source hash of _shared/ron-patterns.ts", () => {
    const src = readFileSync(resolve("supabase/functions/_shared/ron-patterns.ts"), "utf8");
    expect(createHash("sha256").update(src).digest("hex")).toBe(PATTERN_DETECTOR_SOURCE_SHA256);
  });

  it("still emits only the original 7 named patterns plus Support/Resistance", () => {
    const originals = new Set([
      "Double Top", "Double Bottom", "Head & Shoulders", "Ascending Triangle",
      "Descending Triangle", "Bull Flag", "Bear Flag", "Support", "Resistance",
    ]);
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE, INVERSE_HNS, PARALLEL_CHANNEL]) {
      for (const p of detectPatterns(fx)) expect(originals.has(p.pattern_name)).toBe(true);
    }
  });

  it("expansion never mutates or reorders the base output", () => {
    const base = detectPatterns(RISING_WEDGE);
    const snapshot = JSON.parse(JSON.stringify(base));
    detectExpansionPatterns(RISING_WEDGE, base);
    expect(base).toEqual(snapshot);
  });

  it("declares exactly 11 named patterns", () => {
    expect(RON_NAMED_PATTERN_CATALOGUE_V1).toHaveLength(11);
    expect([...EXPANSION_PATTERN_NAMES]).toEqual([
      "Inverse Head & Shoulders", "Symmetrical Triangle", "Rising Wedge", "Falling Wedge",
    ]);
  });
});

/* ── 2. Inverse Head & Shoulders ─────────────────────────────────── */

describe("2. Inverse Head & Shoulders", () => {
  it("detects the bullish three-trough structure and stores mirrored geometry", () => {
    const p = pick(detectExpansionPatterns(INVERSE_HNS), "Inverse Head & Shoulders")!;
    expect(p).toBeTruthy();
    expect(p.direction).toBe("bullish");
    const troughs = p.key_prices.troughs!;
    expect(troughs).toHaveLength(3);
    // Head is the middle trough and is genuinely the lowest.
    expect(troughs[1]).toBeLessThan(troughs[0]);
    expect(troughs[1]).toBeLessThan(troughs[2]);
    // Mirrored measured move: neckline + (neckline - head).
    expect(p.key_prices.target!).toBeCloseTo(p.key_prices.neckline! * 2 - troughs[1], 6);
    expect(p.key_prices.target!).toBeGreaterThan(p.key_prices.neckline!);
    expect(p.start_index).toBeLessThan(p.end_index);
  });

  it("rejects a near miss where the head is not meaningfully lower", () => {
    expect(pick(detectExpansionPatterns(INVERSE_HNS_NEAR_MISS), "Inverse Head & Shoulders")).toBeNull();
  });

  it("stores no invented pivot candle positions", () => {
    const p = pick(detectExpansionPatterns(INVERSE_HNS), "Inverse Head & Shoulders")!;
    expect(p.key_prices.upper_line).toBeUndefined();
    expect(p.key_prices.lower_line).toBeUndefined();
  });
});

/* ── 3. Symmetrical Triangle ─────────────────────────────────────── */

describe("3. Symmetrical Triangle", () => {
  const p = pick(detectExpansionPatterns(SYMMETRICAL), "Symmetrical Triangle");

  it("detects genuine two-sided contraction", () => {
    expect(p).toBeTruthy();
    expect(p!.end_index - p!.start_index).toBeGreaterThanOrEqual(MIN_STRUCTURE_SPAN_BARS);
  });

  it("is neutral and never fabricates a breakout side or target", () => {
    expect(p!.direction).toBe("neutral");
    expect(p!.key_prices.target).toBeUndefined();
  });

  it("stores converging upper and lower boundary coordinates", () => {
    const u = p!.key_prices.upper_line!, l = p!.key_prices.lower_line!;
    expect(u.end.price).toBeLessThan(u.start.price);   // descending upper
    expect(l.end.price).toBeGreaterThan(l.start.price); // ascending lower
    expect(u.end.price - l.end.price).toBeLessThan(u.start.price - l.start.price);
  });

  it("rejects an ordinary constant-width range", () => {
    expect(pick(detectExpansionPatterns(PARALLEL_CHANNEL), "Symmetrical Triangle")).toBeNull();
  });
});

/* ── 4 & 5. Wedges ───────────────────────────────────────────────── */

describe("4. Rising Wedge", () => {
  const p = pick(detectExpansionPatterns(RISING_WEDGE), "Rising Wedge");

  it("detects both boundaries rising and converging", () => {
    expect(p).toBeTruthy();
    expect(p!.direction).toBe("bearish");
    const u = p!.key_prices.upper_line!, l = p!.key_prices.lower_line!;
    expect(u.end.price).toBeGreaterThan(u.start.price);
    expect(l.end.price).toBeGreaterThan(l.start.price);
    expect(l.end.price - l.start.price).toBeGreaterThan(u.end.price - u.start.price);
  });

  it("stores no fabricated breakout target", () => {
    expect(p!.key_prices.target).toBeUndefined();
  });

  it("rejects a parallel rising channel", () => {
    expect(pick(detectExpansionPatterns(RISING_CHANNEL), "Rising Wedge")).toBeNull();
  });
});

describe("5. Falling Wedge", () => {
  const p = pick(detectExpansionPatterns(FALLING_WEDGE), "Falling Wedge");

  it("detects both boundaries falling and converging", () => {
    expect(p).toBeTruthy();
    expect(p!.direction).toBe("bullish");
    const u = p!.key_prices.upper_line!, l = p!.key_prices.lower_line!;
    expect(u.end.price).toBeLessThan(u.start.price);
    expect(l.end.price).toBeLessThan(l.start.price);
    expect(u.start.price - u.end.price).toBeGreaterThan(l.start.price - l.end.price);
  });

  it("stores no fabricated breakout target", () => {
    expect(p!.key_prices.target).toBeUndefined();
  });

  it("rejects a parallel falling channel", () => {
    expect(pick(detectExpansionPatterns(FALLING_CHANNEL), "Falling Wedge")).toBeNull();
  });
});

/* ── 6. dedupe / precedence ──────────────────────────────────────── */

describe("6. deterministic dedupe and precedence", () => {
  it("emits at most one converging-boundary pattern per fixture", () => {
    const converging = new Set(["Symmetrical Triangle", "Rising Wedge", "Falling Wedge"]);
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE, INVERSE_HNS, PARALLEL_CHANNEL]) {
      const hits = detectExpansionPatterns(fx).filter((p) => converging.has(p.pattern_name));
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });

  it("suppresses a converging structure that overlaps a base triangle", () => {
    const p = pick(detectExpansionPatterns(RISING_WEDGE), "Rising Wedge")!;
    const fakeBase = [{
      pattern_name: "Ascending Triangle", direction: "bullish" as const, confidence: 7,
      start_index: p.start_index, end_index: p.end_index, key_prices: {},
    }];
    expect(pick(detectExpansionPatterns(RISING_WEDGE, fakeBase), "Rising Wedge")).toBeNull();
    // A non-overlapping base triangle suppresses nothing.
    const far = [{ ...fakeBase[0], start_index: 0, end_index: 1 }];
    expect(pick(detectExpansionPatterns(RISING_WEDGE, far), "Rising Wedge")).toBeTruthy();
  });

  it("never emits Support or Resistance as a named expansion pattern", () => {
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE, INVERSE_HNS]) {
      for (const p of detectExpansionPatterns(fx)) {
        expect(["Support", "Resistance"]).not.toContain(p.pattern_name);
      }
    }
  });
});

/* ── 7. stored geometry is real and bounded ──────────────────────── */

describe("7. stored geometry is real and bounded to the detector span", () => {
  it("keeps indices inside the input window and line times on real candles", () => {
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE, INVERSE_HNS]) {
      const times = new Set(fx.map((c) => c.time));
      for (const p of detectExpansionPatterns(fx)) {
        expect(p.start_index).toBeGreaterThanOrEqual(0);
        expect(p.end_index).toBeLessThanOrEqual(fx.length - 1);
        expect(p.start_index).toBeLessThan(p.end_index);
        for (const line of [p.key_prices.upper_line, p.key_prices.lower_line]) {
          if (!line) continue;
          expect(times.has(line.start.time)).toBe(true);
          expect(times.has(line.end.time)).toBe(true);
          expect(line.start.time).toBe(fx[p.start_index].time);
          expect(line.end.time).toBe(fx[p.end_index].time);
        }
      }
    }
  });

  it("reads no candle after the evaluated window (truncation cannot resurrect data)", () => {
    const truncated = SYMMETRICAL.slice(0, 60);
    const a = detectExpansionPatterns(truncated);
    const b = detectExpansionPatterns(truncated.concat([]));
    expect(a).toEqual(b);
  });

  it("returns nothing for too-short input", () => {
    expect(detectExpansionPatterns(SYMMETRICAL.slice(0, 10))).toEqual([]);
  });

  it("exposes pure detector helpers deterministically", () => {
    expect(detectInverseHeadAndShoulders(INVERSE_HNS, [], [])).toBeNull();
    expect(detectConvergingStructure([], [], [])).toBeNull();
  });
});

/* ── 8 & 9. preview integration ──────────────────────────────────── */

describe("8. preview glossary covers all 11 named patterns", () => {
  it("has neutral teaching copy for every catalogue entry", () => {
    for (const name of RON_NAMED_PATTERN_CATALOGUE_V1) {
      const g = patternGlossary(name);
      expect(g, name).toBeTruthy();
      expect(g!.what.length).toBeGreaterThan(20);
      expect(g!.reading.length).toBeGreaterThan(20);
      expect(g!.measured.length).toBeGreaterThan(20);
    }
    expect(Object.keys(PATTERN_GLOSSARY)).toHaveLength(11);
  });

  it("keeps Support and Resistance out of the named-pattern glossary", () => {
    expect(patternGlossary("Support")).toBeNull();
    expect(patternGlossary("Resistance")).toBeNull();
  });
});

describe("9. preview geometry follows stored-data truth rules", () => {
  it("draws exact boundary lines for triangles and wedges", () => {
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE]) {
      const p = detectExpansionPatterns(fx).find((x) => x.pattern_name !== "Inverse Head & Shoulders");
      if (!p) continue;
      const g = extractPatternGeometry(p);
      expect(g.hasExactGeometry).toBe(true);
      expect(g.lines.map((l) => l.label)).toEqual(["Upper boundary", "Lower boundary"]);
      expect(g.levels).toEqual([]);          // no invented price-only levels
      expect(g.spanBars).toBe(p.end_index - p.start_index + 1);
    }
  });

  it("draws Inverse H&S pivots as price-only reference levels", () => {
    const p = pick(detectExpansionPatterns(INVERSE_HNS), "Inverse Head & Shoulders")!;
    const g = extractPatternGeometry(p);
    expect(g.hasExactGeometry).toBe(false);
    expect(g.hasPriceOnlyPivots).toBe(true);
    expect(g.levels.map((l) => l.label))
      .toEqual(["Neckline", "Measured move", "Trough 1", "Trough 2", "Trough 3"]);
    expect(g.direction).toBe("bullish");
  });

  it("carries a neutral direction through the preview without a side", () => {
    const p = pick(detectExpansionPatterns(SYMMETRICAL), "Symmetrical Triangle")!;
    expect(extractPatternGeometry(p).direction).toBe("neutral");
  });
});

/* ── 10 & 11. safety scope ───────────────────────────────────────── */

describe("10. no probability and no recommendation is introduced", () => {
  const src = readFileSync(resolve("supabase/functions/_shared/ron-patterns-expansion-v1.ts"), "utf8");

  it("introduces no probability field or BUY/SELL wording", () => {
    expect(src).not.toMatch(/numeric_probability|probability\s*[:=]/);
    expect(src).not.toMatch(/\b(BUY|SELL|LONG|SHORT)\b/);
    for (const fx of [SYMMETRICAL, RISING_WEDGE, FALLING_WEDGE, INVERSE_HNS]) {
      for (const p of detectExpansionPatterns(fx)) {
        expect(Object.keys(p)).not.toContain("probability");
        expect(Number.isInteger(p.confidence)).toBe(true);
        expect(p.confidence).toBeLessThanOrEqual(10);
      }
    }
  });

  it("adds no probability or recommendation wording to the new glossary copy", () => {
    for (const name of EXPANSION_PATTERN_NAMES) {
      const g = patternGlossary(name)!;
      const text = `${g.what} ${g.reading} ${g.measured}`.toLowerCase();
      expect(text).not.toMatch(/\b\d+(\.\d+)?%/);
      expect(text).not.toContain("probability");
      expect(text).not.toContain("buy ");
      expect(text).not.toContain("sell ");
    }
  });
});

describe("11. scope containment", () => {
  const src = readFileSync(resolve("supabase/functions/_shared/ron-patterns-expansion-v1.ts"), "utf8");

  it("imports nothing from execution, orchestration, broker or research surfaces", () => {
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./ron-patterns.ts"]);
  });

  it("uses no randomness, clock or network", () => {
    expect(src).not.toMatch(/Math\.random|Date\.now|fetch\(|createClient/);
  });
});

describe("12. GAINEDGE_RON_PATTERN_EXPANSION_V1_LINEAGE_FIX — forward-only feature v7", () => {
  const featSrc = readFileSync(resolve("supabase/functions/_shared/ron-features.ts"), "utf8");
  const readerSrc = readFileSync(resolve("src/services/ron-snapshots.ts"), "utf8");

  it("stamps snapshots produced with the 11-pattern catalogue as feature_version 7", () => {
    expect(RON_FEATURE_VERSION).toBe(7);
    expect(featSrc).toContain("export const RON_FEATURE_VERSION = 7;");
    // The writer stamps the active constant, never a literal.
    expect(featSrc).toContain("const featureVersion = opts.featureVersion ?? RON_FEATURE_VERSION;");
    expect(featSrc).toContain("feature_version: featureVersion,");
  });

  it("keeps v6 as immutable legacy 7-pattern semantics", () => {
    expect(RON_FEATURE_VERSION_V6).toBe(6);
    expect(featSrc).toMatch(/v6 rows carry 7-pattern semantics FOREVER/);
    // Nothing recomputes or rewrites a legacy version.
    expect(featSrc).not.toMatch(/RON_FEATURE_VERSION_V6\s*[,)]/);
  });

  it("pins the live UI reader to exactly 7 and never mixes versions", () => {
    expect(CURRENT_RON_SNAPSHOT_FEATURE_VERSION).toBe(7);
    expect(readerSrc).not.toContain('.in("feature_version"');
  });

  it("does not touch the research lineage constants", () => {
    expect(CURRENT_RON_FEATURE_VERSION).toBe(4);
    expect(CURRENT_RON_LABEL_VERSION).toBe(5);
  });

  it("still exposes all 11 named patterns under v7", () => {
    expect(RON_NAMED_PATTERN_CATALOGUE_V1).toHaveLength(11);
  });
});
