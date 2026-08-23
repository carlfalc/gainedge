/**
 * GAINEDGE_DASHBOARD_UI_V1 — behavioural + truthfulness tests for the dashboard slice.
 *
 * These cover the pure layers (summary language, pulse derivation, scanner ranking)
 * and assert the honesty rules the slice is required to hold:
 *   - no fabricated market data anywhere on the dashboard
 *   - no probability / confidence / entry / stop / target language
 *   - no "since last login" claim (there is no persisted last-login marker)
 *   - no opportunity-lifecycle language (nothing persisted yet)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  ronSummarySentence, ronEvidenceChips, ronEmptyState,
  regimePhrase, momentumPhrase, trendStrengthPhrase,
} from "@/lib/dashboard-ron-summary";
import {
  buildPulseItems, pulseLatestTimestamp, rankSnapshots,
  PULSE_EMPTY_TEXT, PULSE_SUBTITLE, type PulseSnapshot,
} from "@/lib/dashboard-pulse";
import {
  topMovers, ronWatchList, dataHealthIssues, completedBarChangePct, SCANNER_LIMIT,
  type ScannerSnapshotInput,
} from "@/lib/dashboard-scanners";

const FEATURES = {
  regime: "trending_up",
  adx14: 18.2,
  rsi14: 57.4,
  ema_stack: "up",
  macd_state: "bullish_expanding",
  stoch_rsi: 66.1,
  atr_pct: 0.234,
};

const snap = (over: Partial<PulseSnapshot> = {}): PulseSnapshot => ({
  symbol: "XAUUSD",
  timeframe: "15m",
  bar_time: "2026-08-21T20:45:00.000Z",
  data_health: "healthy",
  features: FEATURES,
  state: "WATCH",
  ...over,
});

describe("RON summary language", () => {
  it("builds an analyst-style sentence only from present fields", () => {
    const s = ronSummarySentence(FEATURES)!;
    expect(s).toContain("Up-trending regime");
    expect(s).toContain("Bullish momentum is expanding");
    expect(s).toContain("trend strength remains weak");
    expect(s).toContain("No qualified opportunity is available.");
  });

  it("never emits probability, confidence, entry, stop or target language", () => {
    const s = ronSummarySentence(FEATURES)!.toLowerCase();
    for (const banned of ["probability", "confidence", "% chance", "entry", "stop", "target", "buy", "sell"]) {
      expect(s.includes(banned), `summary must not contain "${banned}"`).toBe(false);
    }
  });

  it("omits fields that are absent rather than inventing them", () => {
    const s = ronSummarySentence({ regime: "ranging" })!;
    expect(s).toBe("Ranging regime. No qualified opportunity is available.");
    expect(s).not.toContain("ADX");
  });

  it("returns null when there is no snapshot at all", () => {
    expect(ronSummarySentence(null)).toBeNull();
    expect(ronSummarySentence(undefined)).toBeNull();
  });

  it("passes unknown tokens through verbatim instead of guessing", () => {
    expect(regimePhrase("squeeze_build")).toBe("squeeze build regime");
    expect(momentumPhrase("flat")).toBe("MACD is flat");
    expect(regimePhrase(null)).toBeNull();
    expect(trendStrengthPhrase(null)).toBeNull();
    expect(trendStrengthPhrase(41)).toBe("trend strength is very strong");
  });
});

describe("evidence chips", () => {
  it("renders one chip per present field, with tone", () => {
    const chips = ronEvidenceChips(FEATURES);
    expect(chips.map((c) => c.label)).toEqual(["ADX", "RSI", "MACD", "EMA", "StochRSI", "ATR%"]);
    expect(chips.find((c) => c.label === "MACD")!.tone).toBe("up");
    expect(chips.find((c) => c.label === "ADX")!.tone).toBe("neutral");
  });

  it("drops missing fields and returns nothing without features", () => {
    expect(ronEvidenceChips({ rsi14: 50 }).map((c) => c.label)).toEqual(["RSI"]);
    expect(ronEvidenceChips(null)).toEqual([]);
  });
});

describe("empty state", () => {
  it("states plainly what exists and what does not", () => {
    const e = ronEmptyState({ hasQuote: true, hasSignalHistory: false, symbol: "US30" });
    expect(e.headline).toBe("RON data building");
    expect(e.available).toEqual(["live broker quote"]);
    expect(e.unavailable).toContain("RON snapshot");
    expect(e.note).toContain("not a current assessment");
  });
});

describe("RON Pulse derivation", () => {
  const base = {
    news: [{ headline: "Gold steady before CPI", published_at: "2026-08-21T19:00:00.000Z", instruments: ["XAUUSD"] }],
    sessionLabel: "New York",
    sessionInstant: "2026-08-21T21:00:00.000Z",
    marketOpen: true,
  };

  it("leads with the highest-attention tracked market", () => {
    const items = buildPulseItems({
      ...base,
      snapshots: [snap({ symbol: "US30", state: "WAIT" }), snap({ symbol: "XAUUSD", state: "SETUP FORMING" })],
    });
    expect(items[0].kind).toBe("ron_state");
    expect(items[0].title).toBe("XAUUSD 15m · SETUP FORMING");
    expect(items[0].timestamp).toBe("2026-08-21T20:45:00.000Z");
    expect(items[0].timestampLabel).toBe("completed 15m close");
  });

  it("raises a data-health item only when a snapshot really reports one", () => {
    const healthy = buildPulseItems({ ...base, snapshots: [snap()] });
    expect(healthy.some((i) => i.kind === "data_health")).toBe(false);
    const bad = buildPulseItems({ ...base, snapshots: [snap({ data_health: "stale" })] });
    const item = bad.find((i) => i.kind === "data_health")!;
    expect(item.title).toBe("Data health: stale");
    expect(item.tone).toBe("red");
  });

  it("labels the market-closed case instead of implying live activity", () => {
    const items = buildPulseItems({ ...base, snapshots: [snap()], marketOpen: false });
    const s = items.find((i) => i.kind === "session")!;
    expect(s.title).toBe("Market closed");
    expect(s.tone).toBe("amber");
  });

  it("is a 'latest market update', never a since-last-login claim", () => {
    expect(PULSE_SUBTITLE).toBe("Latest market update");
    expect(PULSE_SUBTITLE.toLowerCase()).not.toContain("login");
    expect(PULSE_EMPTY_TEXT).toBe("No material change in your tracked markets.");
  });

  it("never emits opportunity-lifecycle language (nothing is persisted yet)", () => {
    const items = buildPulseItems({ ...base, snapshots: [snap({ state: "SETUP FORMING" })] });
    const blob = JSON.stringify(items).toLowerCase();
    for (const banned of ["strengthening", "confirmed opportunity", "invalidated", "weakening", "probability"]) {
      expect(blob.includes(banned), `pulse must not contain "${banned}"`).toBe(false);
    }
  });

  it("returns nothing to show when there is genuinely no source", () => {
    expect(buildPulseItems({ snapshots: [], news: [], sessionLabel: null, sessionInstant: null, marketOpen: true })).toEqual([]);
  });

  it("reports the newest source instant across items", () => {
    const items = buildPulseItems({ ...base, snapshots: [snap()] });
    expect(pulseLatestTimestamp(items)).toBe("2026-08-21T21:00:00.000Z");
    expect(pulseLatestTimestamp([])).toBeNull();
  });

  it("ranks by watch state then recency", () => {
    const ranked = rankSnapshots([
      snap({ symbol: "A", state: "WAIT", bar_time: "2026-08-21T20:45:00.000Z" }),
      snap({ symbol: "B", state: "WATCH", bar_time: "2026-08-21T20:00:00.000Z" }),
      snap({ symbol: "C", state: "WATCH", bar_time: "2026-08-21T20:30:00.000Z" }),
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(["C", "B", "A"]);
  });
});

describe("market scanners", () => {
  const rows: ScannerSnapshotInput[] = [
    { symbol: "XAUUSD", timeframe: "15m", bar_time: "2026-08-21T20:45:00.000Z", open: 100, close: 101, data_health: "healthy", state: "WATCH" },
    { symbol: "US30", timeframe: "15m", bar_time: "2026-08-21T20:45:00.000Z", open: 100, close: 98, data_health: "stale", state: "WAIT" },
    { symbol: "NAS100", timeframe: "15m", bar_time: "2026-08-21T20:30:00.000Z", open: 100, close: 100, data_health: "healthy", state: "SETUP FORMING" },
  ];

  it("measures movers on the completed bar only", () => {
    expect(completedBarChangePct(100, 101)).toBeCloseTo(1);
    expect(completedBarChangePct(0, 101)).toBeNull();
    const up = topMovers(rows, "up");
    expect(up.map((m) => m.symbol)).toEqual(["XAUUSD"]);
    expect(up[0].bar_time).toBe("2026-08-21T20:45:00.000Z");
    expect(topMovers(rows, "down").map((m) => m.symbol)).toEqual(["US30"]);
  });

  it("caps every scanner at the top five", () => {
    const many: ScannerSnapshotInput[] = Array.from({ length: 9 }, (_, i) => ({
      symbol: `S${i}`, timeframe: "15m", bar_time: "2026-08-21T20:45:00.000Z",
      open: 100, close: 100 + i + 1, data_health: "healthy", state: "WATCH",
    }));
    expect(topMovers(many, "up")).toHaveLength(SCANNER_LIMIT);
    expect(ronWatchList(many)).toHaveLength(SCANNER_LIMIT);
  });

  it("orders the RON watch list by state then recency", () => {
    expect(ronWatchList(rows).map((r) => r.symbol)).toEqual(["NAS100", "XAUUSD", "US30"]);
  });

  it("surfaces only genuinely non-healthy snapshots", () => {
    expect(dataHealthIssues(rows).map((r) => r.symbol)).toEqual(["US30"]);
    expect(dataHealthIssues(rows.filter((r) => r.data_health === "healthy"))).toEqual([]);
  });
});

describe("no fabricated market data remains on the dashboard", () => {
  it("deletes the hardcoded Movers & Shakers widget", () => {
    expect(existsSync("src/components/dashboard/MoversShakersWidget.tsx")).toBe(false);
  });

  it("does not reference the removed widget anywhere", () => {
    const home = readFileSync("src/pages/dashboard/DashboardHome.tsx", "utf8");
    expect(home).not.toContain("MoversShakersWidget");
    expect(home).toContain("MarketScannersWidget");
    expect(home).toContain("RonPulse");
  });
});

describe("instrument tile", () => {
  const card = readFileSync("src/components/dashboard/InstrumentCard.tsx", "utf8");

  it("defaults to the compact glance state and gates detail behind disclosure", () => {
    expect(card).toContain("expanded");
    expect(card).toContain("More detail");
    const panel = readFileSync("src/components/dashboard/InstrumentTrackingPanel.tsx", "utf8");
    expect(panel).toContain("useState<Set<string>>(new Set())");
  });

  it("carries the exact stored pair into Ask RON", () => {
    expect(card).toContain("askRonContextTitle");
    const panel = readFileSync("src/components/dashboard/InstrumentTrackingPanel.tsx", "utf8");
    expect(panel).toContain("askRonContextHref(symbol, timeframe)");
  });

  it("keeps the honest opportunity placeholder rather than inventing levels", () => {
    expect(card).toContain("No qualified RON opportunity yet");
    expect(card).toContain("Not calibrated yet");
  });

  it("dates pattern context so it cannot read as current", () => {
    expect(card).toContain("Detected on the completed");
  });
});
