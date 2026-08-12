import { describe, it, expect } from "vitest";
import { explainPattern, explainPatterns, summariseStructure, type SnapshotPattern } from "@/lib/pattern-interpretation";
import { formatPrintedLocal } from "@/lib/signal-time";

/**
 * Fixtures below are VERBATIM pattern objects read from production
 * ron_market_snapshots (XAUUSD 15m, feature_version=4, bar_time 2026-08-12T03:45:00Z).
 */
const DOUBLE_TOP: SnapshotPattern = {
  pattern_name: "Double Top", direction: "bearish", confidence: 8,
  start_index: 120, end_index: 129,
  key_prices: { neckline: 4367, peaks: [4374.19, 4378.36], target: 4357.725 },
};
const DOUBLE_BOTTOM: SnapshotPattern = {
  pattern_name: "Double Bottom", direction: "bullish", confidence: 8,
  start_index: 125, end_index: 130,
  key_prices: { neckline: 4378.36, target: 4391.984999999999, troughs: [4367, 4362.47] },
};
const SUPPORT: SnapshotPattern = {
  pattern_name: "Support", direction: "bullish", confidence: 7,
  start_index: 50, end_index: 149,
  key_prices: { support: 4367.68 },
};

describe("pattern interpretation — grounded in real snapshot objects", () => {
  it("bearish Double Top cites only its stored neckline", () => {
    const e = explainPattern(DOUBLE_TOP);
    expect(e.title).toBe("Double Top bearish");
    expect(e.direction).toBe("bearish");
    expect(e.strengthens).toContain("4,367");
    expect(e.levels.map(l => l.label)).toEqual(["neckline", "peaks", "measured move"]);
    // every mentioned number must exist in the source object
    const stored = [4367, 4378.36, 4357.725].map(n => n.toLocaleString(undefined, { maximumFractionDigits: 5 }));
    for (const l of e.levels) {
      expect(stored).toContain(l.value.toLocaleString(undefined, { maximumFractionDigits: 5 }));
    }
  });

  it("bullish Support cites its stored support level in both directions of evidence", () => {
    const e = explainPattern(SUPPORT);
    expect(e.title).toBe("Support bullish");
    expect(e.strengthens).toContain("4,367.68");
    expect(e.weakens).toContain("4,367.68");
    expect(e.levels).toEqual([{ label: "support", value: 4367.68 }]);
  });

  it("stays qualitative when the pattern object stores no level", () => {
    const e = explainPattern({ pattern_name: "Support", direction: "bullish", key_prices: {} });
    expect(e.levels).toEqual([]);
    expect(e.strengthens).not.toMatch(/\d/);
    expect(e.weakens).not.toMatch(/\d/);
  });

  it("never invents a neckline for Head & Shoulders without one", () => {
    const withNeck = explainPattern({ pattern_name: "Head & Shoulders", direction: "bearish", key_prices: { neckline: 4400 } });
    expect(withNeck.strengthens).toContain("4,400");
    const without = explainPattern({ pattern_name: "Head & Shoulders", direction: "bearish", key_prices: {} });
    expect(without.strengthens).not.toMatch(/\d/);
  });

  it("names the actual patterns in the real mixed snapshot", () => {
    expect(summariseStructure([DOUBLE_TOP, DOUBLE_BOTTOM, SUPPORT]))
      .toBe("Structure is mixed: bearish Double Top conflicts with bullish Double Bottom and Support.");
  });

  it("never invents support/reversal wording for other mixes", () => {
    const s = summariseStructure([
      { pattern_name: "Bull Flag", direction: "bullish" },
      { pattern_name: "Resistance", direction: "bearish" },
    ])!;
    expect(s).toBe("Structure is mixed: bearish Resistance conflicts with bullish Bull Flag.");
    expect(s.toLowerCase()).not.toContain("support");
    expect(s.toLowerCase()).not.toContain("reversal");
    expect(s.toLowerCase()).not.toContain("continuation");
  });

  it("summarises agreement using the stored names", () => {
    expect(summariseStructure([DOUBLE_BOTTOM, SUPPORT]))
      .toBe("Detected structures agree bullish: Double Bottom + Support.");
    expect(summariseStructure([DOUBLE_TOP, { pattern_name: "Head & Shoulders", direction: "bearish" }]))
      .toBe("Detected structures agree bearish: Double Top + Head & Shoulders.");
  });

  it("falls back safely for unnamed / unknown-direction patterns", () => {
    expect(summariseStructure([])).toBeNull();
    expect(summariseStructure([{ pattern_name: "X" }])).toBeNull();
    expect(summariseStructure([{ direction: "bullish" }, { direction: "bearish" }])).toBeNull();
    expect(summariseStructure([SUPPORT])).toBeNull();
  });

  it("explains at most the three patterns the tile lists, in stored order", () => {
    const list = explainPatterns([DOUBLE_TOP, DOUBLE_BOTTOM, SUPPORT, SUPPORT]);
    expect(list).toHaveLength(3);
    expect(list.map(l => l.title)).toEqual(["Double Top bearish", "Double Bottom bullish", "Support bullish"]);
  });

  it("contains no probability language", () => {
    const text = explainPatterns([DOUBLE_TOP, DOUBLE_BOTTOM, SUPPORT])
      .flatMap(e => [e.meaning, e.strengthens, e.weakens]).join(" ");
    expect(text).not.toMatch(/\b\d+(\.\d+)?%/);
    expect(text.toLowerCase()).not.toContain("probability");
    expect(text.toLowerCase()).not.toContain("confidence");
  });
});

describe("signal printed time", () => {
  it("shows time only for today and date+time otherwise", () => {
    const now = new Date("2026-08-12T10:00:00Z");
    const today = new Date("2026-08-12T08:00:00Z");
    const older = new Date("2026-08-04T08:00:00Z");
    expect(formatPrintedLocal(today, now)).not.toMatch(/[A-Za-z]{3}/);
    expect(formatPrintedLocal(older, now)).toMatch(/[A-Za-z]{3}/);
  });
  it("handles invalid input without throwing", () => {
    expect(formatPrintedLocal("not-a-date")).toBe("unknown time");
  });
});
