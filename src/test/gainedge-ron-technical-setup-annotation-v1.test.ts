import { describe, expect, it } from "vitest";
import { buildTechnicalSetupChartAnnotationV1 } from "../../supabase/functions/_shared/ron-technical-setup-annotation-v1.ts";

describe("RON technical setup → chart annotation V1", () => {
  it("maps a demand-zone rejection into a bullish chart-ready zone", () => {
    const result = buildTechnicalSetupChartAnnotationV1({
      id: "xau-demand-retest",
      symbol: "XAUUSD",
      timeframe: "15m",
      setup_id: "demand_zone_rejection",
      direction: "bullish",
      lifecycle: "retested",
      source_agent: "session_market_structure",
      as_of_bar_time: "2026-08-30T12:15:00.000Z",
      origin_anchor: { bar_time: "2026-08-30T08:15:00.000Z", price: 2420.1 },
      last_test_anchor: { bar_time: "2026-08-30T12:00:00.000Z", price: 2421.1 },
      retest_count: 2,
      geometry: { type: "zone", low: 2418.5, high: 2423.2 },
      evidence_refs: ["snapshot:xau:1215"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.kind).toBe("zone");
    expect(result.annotation.subtype).toBe("demand_zone_rejection");
    expect(result.annotation.provenance?.completed_bars_only).toBe(true);
  });

  it("maps a 61.8 Fib reaction only when explicit swing geometry is supplied", () => {
    const result = buildTechnicalSetupChartAnnotationV1({
      id: "nas-fib-618",
      symbol: "NAS100",
      timeframe: "15m",
      setup_id: "fib_retracement_reaction",
      direction: "bullish",
      lifecycle: "current",
      source_agent: "pattern_context",
      as_of_bar_time: "2026-08-30T14:45:00.000Z",
      origin_anchor: { bar_time: "2026-08-30T14:45:00.000Z", price: 23542.7 },
      geometry: {
        type: "fib",
        ratio: 0.618,
        price: 23542.7,
        swing_start: { bar_time: "2026-08-30T09:00:00.000Z", price: 23380.2 },
        swing_end: { bar_time: "2026-08-30T13:30:00.000Z", price: 23642.9 },
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects geometry from the wrong setup family instead of coercing it", () => {
    const result = buildTechnicalSetupChartAnnotationV1({
      id: "bad",
      symbol: "XAUUSD",
      timeframe: "15m",
      setup_id: "ema_9_21_bull_cross",
      direction: "bullish",
      lifecycle: "detected",
      source_agent: "momentum_trend",
      as_of_bar_time: "2026-08-30T12:15:00.000Z",
      origin_anchor: { bar_time: "2026-08-30T12:15:00.000Z", price: 2424.3 },
      geometry: { type: "level", price: 2424.3 },
    });
    expect(result).toEqual({ ok: false, reason: "setup_geometry_mismatch:ema:level" });
  });

  it("rejects a direction that contradicts a frozen directional setup definition", () => {
    const result = buildTechnicalSetupChartAnnotationV1({
      id: "bad-direction",
      symbol: "XAUUSD",
      timeframe: "15m",
      setup_id: "ema_9_21_bull_cross",
      direction: "bearish",
      lifecycle: "detected",
      source_agent: "momentum_trend",
      as_of_bar_time: "2026-08-30T12:15:00.000Z",
      origin_anchor: { bar_time: "2026-08-30T12:15:00.000Z", price: 2424.3 },
      geometry: {
        type: "ema_event",
        event: "cross",
        fast_period: 9,
        slow_period: 21,
        event_anchor: { bar_time: "2026-08-30T12:15:00.000Z", price: 2424.3 },
        fast_value: 2423.8,
        slow_value: 2423.4,
      },
    });
    expect(result).toEqual({ ok: false, reason: "setup_direction_mismatch:bullish:bearish" });
  });
});
