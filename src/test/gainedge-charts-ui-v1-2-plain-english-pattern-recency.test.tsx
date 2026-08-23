/**
 * GAINEDGE_CHARTS_UI_V1_2_PLAIN_ENGLISH_PATTERN_RECENCY — Charts presentation guards.
 *
 * Proves: plain-English RON stance without BUY/SELL; named-pattern ordering by
 * end_index recency (never confidence); latest vs earlier separation; barsAgo derived
 * only from valid provenance under the 150-bar pattern-input contract; Support/
 * Resistance excluded from the named count and surfaced separately; numeric confidence
 * never displayed; no fabricated lifecycle wording; no backend files touched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  RON_STATE_PLAIN,
  ronPlainStatus,
  regimeContextLabel,
  buildPatternContext,
  buildInstrumentStrip,
  patternInputBars,
  PATTERN_INPUT_MAX_BARS,
  PATTERN_CONTEXT_NOTE,
} from "@/lib/charts-context";
import type { RonSnapshotRow } from "@/services/ron-snapshots";

/** Mirrors the production XAUUSD 15m v6 snapshot inspected at 2026-08-21T20:45Z. */
const PROD_PATTERNS = [
  { pattern_name: "Head & Shoulders", direction: "bearish", confidence: 0.91, start_index: 40, end_index: 77, key_prices: {} },
  { pattern_name: "Double Top", direction: "bearish", confidence: 0.72, start_index: 90, end_index: 112, key_prices: {} },
  { pattern_name: "Double Bottom", direction: "bullish", confidence: 0.55, start_index: 100, end_index: 116, key_prices: {} },
  { pattern_name: "Support", direction: "bullish", confidence: 0.6, start_index: 0, end_index: 149, key_prices: { support: 3324.55 } },
  { pattern_name: "Support", direction: "bullish", confidence: 0.5, start_index: 0, end_index: 149, key_prices: { support: 3310.2 } },
  { pattern_name: "Support", direction: "bullish", confidence: 0.4, start_index: 0, end_index: 149, key_prices: { support: 3298.05 } },
];

const FEATURES = {
  adx14: 24.2, rsi14: 43.2, regime: "transition", ema_stack: "mixed", macd_state: "flat",
  provenance: { window_size: 150 },
};

const snapshot = (over: Partial<RonSnapshotRow> = {}): RonSnapshotRow => ({
  symbol: "XAUUSD",
  timeframe: "15m",
  bar_time: new Date(Date.now() - 60_000).toISOString(),
  open: 1, high: 2, low: 0.5, close: 1.5, volume: 10,
  features: FEATURES,
  patterns: PROD_PATTERNS,
  data_health: "healthy",
  computed_at: new Date().toISOString(),
  ...over,
});

describe("A. plain-English RON status", () => {
  it("maps every state without inventing BUY/SELL", () => {
    expect(RON_STATE_PLAIN.WAIT).toBe("RON: WAITING");
    expect(RON_STATE_PLAIN.WATCH).toBe("RON: WATCHING");
    expect(RON_STATE_PLAIN["SETUP FORMING"]).toBe("RON: SETUP FORMING");
    for (const v of Object.values(RON_STATE_PLAIN)) {
      expect(v).not.toMatch(/\b(buy|sell|long|short|entry)\b/i);
    }
    expect(ronPlainStatus("WATCH")).toBe("RON: WATCHING");
  });

  it("only labels direction context for unambiguous trending regimes", () => {
    expect(regimeContextLabel("trending_up")).toBe("Bullish context");
    expect(regimeContextLabel("trending_down")).toBe("Bearish context");
    expect(regimeContextLabel("transition")).toBeNull();
    expect(regimeContextLabel("ranging")).toBeNull();
    expect(regimeContextLabel(undefined)).toBeNull();
  });

  it("puts the plain status and secondary freshness on the strip", () => {
    const s = buildInstrumentStrip("XAUUSD", snapshot());
    // transition regime + ADX 24.2 + mixed stack scores 0 → WAIT, rendered plainly.
    expect(s.statusLabel).toBe("RON: WAITING");
    expect(s.contextLabel).toBeNull();
    expect(s.freshnessLabel).toMatch(/^15m context · .+ ago$/);
    expect(s.chips.map((c) => c.id)).not.toContain("ron-age");
    expect(JSON.stringify(s)).not.toMatch(/\b(BUY|SELL)\b/);
  });

  it("renders WATCHING plainly when the evidence scores a watch state", () => {
    const s = buildInstrumentStrip("XAUUSD", snapshot({
      features: { ...FEATURES, regime: "ranging", adx14: 27, ema_stack: "up" },
    }));
    expect(s.statusLabel).toBe("RON: WATCHING");
    expect(s.contextLabel).toBeNull();
  });


  it("shows a bullish context label when the regime is genuinely trending up", () => {
    const s = buildInstrumentStrip("XAUUSD", snapshot({
      features: { ...FEATURES, regime: "trending_up", adx14: 31, ema_stack: "up", macd_state: "bullish" },
    }));
    expect(s.contextLabel).toBe("Bullish context");
    expect(s.statusLabel).toBe("RON: SETUP FORMING");
  });
});

describe("B. pattern recency context", () => {
  const ctx = buildPatternContext(PROD_PATTERNS, FEATURES, "15m");

  it("sorts named patterns by end_index recency, not by confidence", () => {
    expect(ctx.latest?.name).toBe("Double Bottom");
    expect(ctx.earlier.map((p) => p.name)).toEqual(["Double Top", "Head & Shoulders"]);
    // Highest confidence (0.91 Head & Shoulders) is deliberately last.
    expect(ctx.earlier.at(-1)?.name).toBe("Head & Shoulders");
  });

  it("distinguishes the latest detection from earlier ones", () => {
    expect(ctx.latest).not.toBeNull();
    expect(ctx.earlier).toHaveLength(2);
    expect(ctx.earlier.some((p) => p.key === ctx.latest?.key)).toBe(false);
  });

  it("derives barsAgo from the 150-bar pattern-input contract", () => {
    expect(PATTERN_INPUT_MAX_BARS).toBe(150);
    expect(patternInputBars(FEATURES)).toBe(150);
    expect(ctx.latest?.barsAgo).toBe(33);
    expect(ctx.latest?.barsAgoLabel).toBe("33 bars ago");
    expect(ctx.earlier[0].barsAgoLabel).toBe("37 bars ago");
    expect(ctx.earlier[1].barsAgoLabel).toBe("72 bars ago");
    expect(ctx.latest?.approxSpanLabel).toBe("~8h 15m of 15m bars");
  });

  it("caps the window at 150 bars and rejects invalid provenance", () => {
    expect(patternInputBars({ provenance: { window_size: 400 } })).toBe(150);
    expect(patternInputBars({ provenance: { window_size: 80 } })).toBe(80);
    expect(patternInputBars({ provenance: { window_size: 0 } })).toBeNull();
    expect(patternInputBars({ provenance: { window_size: "150" } })).toBeNull();
    expect(patternInputBars({})).toBeNull();
  });

  it("omits age entirely when provenance or end_index is unavailable", () => {
    const noProv = buildPatternContext(PROD_PATTERNS, { adx14: 1 }, "15m");
    expect(noProv.latest?.barsAgo).toBeNull();
    expect(noProv.latest?.barsAgoLabel).toBeNull();
    const noEnd = buildPatternContext([{ pattern_name: "Flag", direction: "bullish" }], FEATURES, "15m");
    expect(noEnd.latest?.barsAgoLabel).toBeNull();
  });

  it("excludes Support/Resistance from the named count and surfaces them separately", () => {
    expect(ctx.namedCount).toBe(3);
    expect(ctx.earlier.concat(ctx.latest ? [ctx.latest] : []).some((p) => /support|resistance/i.test(p.name))).toBe(false);
    expect(ctx.levels).toHaveLength(3);
    expect(ctx.levels[0]).toEqual({ kind: "Support", price: "3324.55" });
  });

  it("never surfaces numeric confidence", () => {
    const serialised = JSON.stringify(ctx);
    expect(serialised).not.toMatch(/confidence/i);
    for (const p of [ctx.latest!, ...ctx.earlier]) {
      expect(p.label).not.toMatch(/0\.\d|%/);
    }
  });

  it("fabricates no lifecycle wording for named detections", () => {
    const serialised = JSON.stringify(ctx);
    expect(serialised).not.toMatch(/\b(current|active|confirmed|validated|invalidated)\b/i);
  });
});

describe("C/D. rail copy and structure", () => {
  const rail = readFileSync("src/components/dashboard/ChartSidePanel.tsx", "utf8");
  const page = readFileSync("src/pages/dashboard/TradingViewChartPage.tsx", "utf8");

  it("renames the section to Pattern context and drops 'Current patterns'", () => {
    expect(rail).toContain("Pattern context");
    expect(rail).not.toContain("Current patterns");
  });

  it("includes the rolling-window microcopy", () => {
    expect(PATTERN_CONTEXT_NOTE).toContain("rolling window");
    expect(PATTERN_CONTEXT_NOTE).toContain("not as current signals");
    expect(rail).toContain("PATTERN_CONTEXT_NOTE");
  });

  it("renders latest, earlier disclosure and level context", () => {
    expect(rail).toContain('data-testid="pattern-latest"');
    expect(rail).toContain('data-testid="pattern-earlier-toggle"');
    expect(rail).toContain('data-testid="ron-levels"');
    expect(rail).toContain("Current level context");
  });

  it("keeps the opportunity-engine disclaimer", () => {
    expect(rail).toContain("the opportunity engine is not yet live in the UI");
  });

  it("shows plain status in both the rail and the top strip", () => {
    expect(rail).toContain("ronPlainStatus(ron.state)");
    expect(page).toContain('data-testid="strip-ron-status"');
    expect(page).toContain("strip.statusLabel");
  });
});

describe("F8. no backend files changed by this slice", () => {
  it("keeps all logic in src/", () => {
    expect(existsSync("src/lib/charts-context.ts")).toBe(true);
    const helpers = readFileSync("src/lib/charts-context.ts", "utf8");
    expect(helpers).not.toMatch(/supabase\/functions/);
  });
});
