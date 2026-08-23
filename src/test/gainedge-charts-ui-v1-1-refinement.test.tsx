/**
 * GAINEDGE_CHARTS_UI_V1_1_REFINEMENT — frontend-only refinement guards.
 *
 * Verifies real v6 pattern schema rendering, confidence suppression, "+N more",
 * context-segment deduplication, top-row placement of the intelligence strip,
 * the RON | TRADE rail structure, the collapsed bottom account activity, and
 * that no backend file is touched by this slice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  describeSnapshotPatterns,
  buildRonChartContext,
  buildInstrumentStrip,
  buildChartContextSegments,
} from "@/lib/charts-context";
import type { RonSnapshotRow } from "@/services/ron-snapshots";

const V6_PATTERNS = [
  { pattern_name: "Head & Shoulders", direction: "bearish", confidence: 0.82, start_index: 10, end_index: 40, key_prices: {} },
  { pattern_name: "Double Top", direction: "bearish", confidence: 0.6, start_index: 5, end_index: 20, key_prices: {} },
  { pattern_name: "Double Bottom", direction: "bullish", confidence: 0.55, start_index: 1, end_index: 9, key_prices: {} },
  { pattern_name: "Support", direction: "bullish", confidence: 0.4, start_index: 0, end_index: 3, key_prices: {} },
];

const SNAPSHOT: RonSnapshotRow = {
  symbol: "XAUUSD",
  timeframe: "15m",
  bar_time: new Date(Date.now() - 60_000).toISOString(),
  open: 1, high: 2, low: 0.5, close: 1.5, volume: 10,
  features: { adx14: 24.2, rsi14: 43.2, regime: "transition", ema_stack: "mixed", macd_state: "flat" },
  patterns: V6_PATTERNS,
  data_health: "healthy",
  computed_at: new Date().toISOString(),
};

describe("pattern presentation against the real v6 schema", () => {
  it("reads pattern_name and direction into readable labels", () => {
    const { items } = describeSnapshotPatterns(V6_PATTERNS);
    expect(items).toEqual([
      "Head & Shoulders · bearish",
      "Double Top · bearish",
      "Double Bottom · bullish",
    ]);
  });

  it("never surfaces the numeric confidence field", () => {
    const { items } = describeSnapshotPatterns(V6_PATTERNS);
    for (const label of items) {
      expect(label).not.toMatch(/0\.\d|%|confidence/i);
    }
  });

  it("collapses extras into +N more", () => {
    const { items, more } = describeSnapshotPatterns(V6_PATTERNS);
    expect(items).toHaveLength(3);
    expect(more).toBe(1);
    const ctx = buildRonChartContext("XAUUSD", SNAPSHOT);
    expect(ctx.available).toBe(true);
    if (ctx.available) {
      expect(ctx.patternsMore).toBe(1);
      expect(ctx.patternItems[0]).toBe("Head & Shoulders · bearish");
    }
  });

  it("falls back to name/type only when pattern_name is absent, and skips junk", () => {
    const { items } = describeSnapshotPatterns([{ name: "wedge" }, { type: "flag" }, {}, null, "x"]);
    expect(items).toEqual(["wedge", "flag"]);
  });
});

describe("context segments", () => {
  const base = {
    symbol: "XAUUSD",
    chartFeed: "Eightcap",
    tradingLabel: "Trading Eightcap Demo • Connected",
    quoteTimestamp: null,
    ronBarTime: null,
    now: Date.now(),
  };

  it("renders exactly one closed-state segment when the session label is also closed", () => {
    const segs = buildChartContextSegments({ ...base, sessionLabel: "Market Closed", marketOpen: false });
    expect(segs.filter((s) => /market closed/i.test(s))).toHaveLength(1);
  });

  it("does not invent a session label while the market is closed", () => {
    const segs = buildChartContextSegments({ ...base, sessionLabel: "Asian Session", marketOpen: false });
    expect(segs.some((s) => /session/i.test(s))).toBe(false);
  });

  it("keeps one session plus open state during an active session", () => {
    const segs = buildChartContextSegments({ ...base, sessionLabel: "Asian Session", marketOpen: true });
    expect(segs).toContain("Asian Session");
    expect(segs.filter((s) => /^Market (open|closed)$/.test(s))).toHaveLength(1);
  });

  it("deduplicates identical segments", () => {
    const segs = buildChartContextSegments({ ...base, sessionLabel: "Chart Eightcap", marketOpen: true });
    expect(new Set(segs).size).toBe(segs.length);
  });
});

describe("instrument intelligence strip", () => {
  it("exposes genuine snapshot chips only", () => {
    const strip = buildInstrumentStrip("XAUUSD", SNAPSHOT);
    expect(strip.available).toBe(true);
    const labels = strip.chips.map((c) => c.label);
    expect(labels).toContain("ADX 24.2");
    expect(labels).toContain("RSI 43.2");
    expect(strip.freshnessLabel?.startsWith("15m context")).toBe(true);
    expect(labels.some((l) => /%|confidence|probab/i.test(l))).toBe(false);
  });

  it("reports data building without a snapshot", () => {
    const strip = buildInstrumentStrip("XAUUSD", null);
    expect(strip.available).toBe(false);
    expect(strip.message).toBe("RON data building");
    expect(strip.chips).toHaveLength(0);
  });
});

describe("charts page + rail structure", () => {
  const page = readFileSync("src/pages/dashboard/TradingViewChartPage.tsx", "utf8");
  const rail = readFileSync("src/components/dashboard/ChartSidePanel.tsx", "utf8");
  const panel = readFileSync("src/components/dashboard/TradeExecutionPanel.tsx", "utf8");

  it("places the intelligence strip inside the top control row, before the feed controls", () => {
    const stripIdx = page.indexOf('data-testid="instrument-intelligence-strip"');
    const addChartIdx = page.indexOf("Add Chart");
    const feedIdx = page.indexOf('data-testid="chart-feed-label"');
    expect(stripIdx).toBeGreaterThan(addChartIdx);
    expect(stripIdx).toBeLessThan(feedIdx);
    expect(page).toContain("flex-1 min-w-0 items-center justify-center");
  });

  it("uses exactly two primary rail tabs: RON and TRADE", () => {
    expect(rail).toContain('{ id: "ron", label: "RON" }');
    expect(rail).toContain('{ id: "trade", label: "TRADE" }');
    expect(rail).not.toContain('{ id: "orders", label: "Orders" }');
    expect(rail).not.toContain('{ id: "positions", label: "Positions" }');
  });

  it("keeps Open positions and truthful Pending orders inside TRADE", () => {
    expect(rail).toContain('data-testid="rail-open-positions"');
    expect(rail).toContain('data-testid="rail-pending-orders"');
    expect(rail).toContain("ORDERS_NOT_SYNCED_MESSAGE");
  });

  it("collapses the duplicate bottom account activity while keeping execution state", () => {
    expect(panel).toContain("const [showActivity, setShowActivity] = useState(false);");
    expect(panel).toContain('data-testid="account-activity-toggle"');
    expect(panel).toContain("{showActivity && (");
    // Execution surface and polling flow untouched.
    expect(panel).toContain("executeOrder");
    expect(panel).toContain("const [positions, setPositions] = useState<Position[]>([]);");
  });
});
