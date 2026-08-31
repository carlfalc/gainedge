import { describe, expect, it } from "vitest";
import {
  buildRonChartAnnotationDisplayV1,
  buildRonChartAnnotationDisplaysFromFeaturesV1,
  liveAnnotationDistancePriceUnits,
} from "@/lib/ron-chart-annotations";
import type { RonChartAnnotationV1 } from "../../supabase/functions/_shared/ron-chart-annotation-v1.ts";

const demand: RonChartAnnotationV1 = {
  annotation_version: 1,
  id: "xau-demand",
  symbol: "XAUUSD",
  timeframe: "15m",
  kind: "zone",
  subtype: "demand_zone_rejection",
  direction: "bullish",
  lifecycle: "retested",
  source_agent: "session_market_structure",
  source_setup_id: "demand_zone_rejection",
  as_of_bar_time: "2026-08-30T12:15:00.000Z",
  origin_anchor: { bar_time: "2026-08-23T14:15:00.000Z", price: 2420.1 },
  last_test_anchor: { bar_time: "2026-08-30T11:45:00.000Z", price: 2421.1 },
  retest_count: 2,
  geometry: { type: "zone", low: 2418.5, high: 2423.2 },
};

describe("RON chart annotation presentation V1", () => {
  it("formats an exact demand zone and derives live distance from the current quote", () => {
    const display = buildRonChartAnnotationDisplayV1(demand, 2440.8);
    expect(display?.title).toBe("Demand zone");
    expect(display?.primary).toBe("2418.50–2423.20");
    expect(display?.retestLabel).toBe("2 retests");
    expect(display?.liveDistanceLabel).toBe("17.60 price units from current quote");
  });

  it("reports zero derived distance when price is currently inside a zone", () => {
    expect(liveAnnotationDistancePriceUnits(demand, 2420)).toBe(0);
    expect(buildRonChartAnnotationDisplayV1(demand, 2420)?.liveDistanceLabel)
      .toBe("Price is inside/at this level now");
  });

  it("formats Fib and EMA-cross objects without inventing chart coordinates", () => {
    const fib: RonChartAnnotationV1 = {
      ...demand,
      id: "xau-fib",
      kind: "fib",
      subtype: "fib_retracement_reaction",
      geometry: {
        type: "fib",
        ratio: 0.618,
        price: 2420.85,
        swing_start: { bar_time: "2026-08-29T10:00:00.000Z", price: 2398.1 },
        swing_end: { bar_time: "2026-08-30T06:00:00.000Z", price: 2457.7 },
      },
    };
    const ema: RonChartAnnotationV1 = {
      ...demand,
      id: "xau-ema",
      kind: "ema_event",
      subtype: "ema_9_21_bull_cross",
      source_agent: "momentum_trend",
      geometry: {
        type: "ema_event",
        event: "cross",
        fast_period: 9,
        slow_period: 21,
        event_anchor: { bar_time: "2026-08-30T12:00:00.000Z", price: 2424.3 },
        fast_value: 2423.8,
        slow_value: 2423.4,
      },
    };
    expect(buildRonChartAnnotationDisplayV1(fib)?.primary).toBe("61.8% · 2420.85");
    expect(buildRonChartAnnotationDisplayV1(ema)?.primary).toBe("EMA9/21 · 2424.30");
  });

  it("reads only explicit chart_annotations_v1 and silently drops invalid payloads", () => {
    const rows = buildRonChartAnnotationDisplaysFromFeaturesV1({
      chart_annotations_v1: [demand, { ...demand, id: "bad", probability: 0.9 }],
    }, 2440.8);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("xau-demand");
    expect(buildRonChartAnnotationDisplaysFromFeaturesV1({ something_else: [] })).toEqual([]);
  });
});
