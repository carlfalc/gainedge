import { describe, expect, it } from "vitest";
import {
  ronChartAnnotationContractPayloadV1,
  validateRonChartAnnotationV1,
  type RonChartAnnotationV1,
} from "../../supabase/functions/_shared/ron-chart-annotation-v1.ts";

const base = (over: Partial<RonChartAnnotationV1> = {}): RonChartAnnotationV1 => ({
  annotation_version: 1,
  id: "xau-demand-20260830-1200",
  symbol: "XAUUSD",
  timeframe: "15m",
  kind: "zone",
  subtype: "demand_zone_rejection",
  direction: "bullish",
  lifecycle: "current",
  source_agent: "session_market_structure",
  source_setup_id: "demand_zone_rejection",
  as_of_bar_time: "2026-08-30T12:15:00.000Z",
  origin_anchor: { bar_time: "2026-08-30T08:15:00.000Z", bar_index: 124, price: 2419.2 },
  last_test_anchor: { bar_time: "2026-08-30T12:00:00.000Z", bar_index: 139, price: 2421.1 },
  retest_count: 2,
  geometry: { type: "zone", low: 2418.5, high: 2423.2 },
  evidence_refs: ["snapshot:XAUUSD:2026-08-30T12:15:00.000Z"],
  provenance: { completed_bars_only: true, feature_version: 7 },
  ...over,
});

describe("RON chart annotation V1", () => {
  it("accepts a chart-ready demand zone with immutable price geometry and provenance", () => {
    expect(validateRonChartAnnotationV1(base())).toEqual({ ok: true });
  });

  it("accepts Fibonacci evidence only when explicit swing anchors and prices are stored", () => {
    const fib = base({
      id: "xau-fib-618",
      kind: "fib",
      subtype: "fib_retracement_reaction",
      direction: "bullish",
      geometry: {
        type: "fib",
        ratio: 0.618,
        price: 2420.85,
        swing_start: { bar_time: "2026-08-29T18:00:00.000Z", bar_index: 80, price: 2398.1 },
        swing_end: { bar_time: "2026-08-30T06:00:00.000Z", bar_index: 128, price: 2457.7 },
      },
    });
    expect(validateRonChartAnnotationV1(fib)).toEqual({ ok: true });

    const missingStart = {
      ...fib,
      geometry: { ...fib.geometry, swing_start: { bar_time: "2026-08-29T18:00:00.000Z" } },
    };
    expect(validateRonChartAnnotationV1(missingStart)).toEqual({ ok: false, reason: "fib_swing_start_required" });
  });

  it("accepts an EMA9/21 cross with exact cross anchor and observed EMA values", () => {
    const ema = base({
      id: "nas100-ema-9-21-cross",
      symbol: "NAS100",
      kind: "ema_event",
      subtype: "ema_9_21_bull_cross",
      direction: "bullish",
      source_agent: "momentum_trend",
      source_setup_id: "ema_9_21_bull_cross",
      origin_anchor: { bar_time: "2026-08-30T14:30:00.000Z", price: 23582.4 },
      as_of_bar_time: "2026-08-30T14:30:00.000Z",
      geometry: {
        type: "ema_event",
        event: "cross",
        fast_period: 9,
        slow_period: 21,
        event_anchor: { bar_time: "2026-08-30T14:30:00.000Z", price: 23582.4 },
        fast_value: 23574.8,
        slow_value: 23572.1,
      },
    });
    expect(validateRonChartAnnotationV1(ema)).toEqual({ ok: true });
  });

  it("rejects ambiguous or incomplete geometry", () => {
    const badZone = { ...base(), geometry: { type: "zone", low: 2423.2, high: 2418.5 } };
    expect(validateRonChartAnnotationV1(badZone)).toEqual({ ok: false, reason: "invalid_zone_geometry" });

    const mismatched = { ...base(), geometry: { type: "level", price: 2420 } };
    expect(validateRonChartAnnotationV1(mismatched)).toEqual({ ok: false, reason: "kind_geometry_mismatch" });
  });

  it("requires an explicit completed-bar cutoff and origin anchor", () => {
    const noCutoff = { ...base(), as_of_bar_time: "" };
    expect(validateRonChartAnnotationV1(noCutoff)).toEqual({ ok: false, reason: "completed_bar_cutoff_required" });

    const noOrigin = { ...base(), origin_anchor: null };
    expect(validateRonChartAnnotationV1(noOrigin)).toEqual({ ok: false, reason: "origin_anchor_required" });
  });

  it("forbids confidence/probability/score and stale current-price-distance fields anywhere in the payload", () => {
    expect(validateRonChartAnnotationV1({ ...base(), confidence: 0.91 })).toEqual({
      ok: false,
      reason: "forbidden_field:confidence",
    });
    expect(validateRonChartAnnotationV1({ ...base(), probability: 0.8 })).toEqual({
      ok: false,
      reason: "forbidden_field:probability",
    });
    expect(validateRonChartAnnotationV1({ ...base(), distance_to_current_price: 17.6 })).toEqual({
      ok: false,
      reason: "forbidden_field:distance_to_current_price",
    });
  });

  it("declares chart-ready geometry while explicitly refusing persisted current-price distance", () => {
    const payload = ronChartAnnotationContractPayloadV1();
    expect(payload).toContain("future_chart_renderer_compatible");
    const distanceFlag = payload.indexOf("current_price_distance_persisted");
    expect(payload[distanceFlag + 1]).toBe(false);
    const confidenceFlag = payload.indexOf("numeric_confidence_probability_score_allowed");
    expect(payload[confidenceFlag + 1]).toBe(false);
  });
});
