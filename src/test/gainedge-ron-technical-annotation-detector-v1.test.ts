import { describe, expect, it } from "vitest";
import {
  detectRonTechnicalAnnotationsV1,
  technicalAnnotationDetectorPayloadV1,
} from "../../supabase/functions/_shared/ron-technical-annotation-detector-v1.ts";
import {
  validateRonChartAnnotationV1,
} from "../../supabase/functions/_shared/ron-chart-annotation-v1.ts";
import type { Candle } from "../../supabase/functions/_shared/falconer-strategy.ts";

const START = Date.parse("2026-08-01T00:00:00.000Z");
const candles: Candle[] = Array.from({ length: 320 }, (_, i) => {
  const drift = i * 0.18;
  const wave = Math.sin(i / 5) * 7 + Math.sin(i / 17) * 4;
  const close = 2400 + drift + wave;
  const open = close - Math.sin(i / 3) * 1.8;
  return {
    time: START + i * 15 * 60_000,
    open,
    high: Math.max(open, close) + 2.2,
    low: Math.min(open, close) - 2.1,
    close,
    volume: 100 + (i % 20),
  };
});

describe("RON technical annotation detector V1", () => {
  it("produces deterministic, validated chart geometry from completed candles", () => {
    const one = detectRonTechnicalAnnotationsV1("XAUUSD", "15m", candles);
    const two = detectRonTechnicalAnnotationsV1("XAUUSD", "15m", candles);
    expect(one).toEqual(two);
    expect(one.length).toBeGreaterThan(4);
    expect(one.every((row) => validateRonChartAnnotationV1(row).ok)).toBe(true);
    const kinds = new Set(one.map((row) => row.kind));
    for (const kind of ["zone", "level", "pivot", "fib"]) expect(kinds.has(kind as any)).toBe(true);
  });

  it("never anchors evidence after the supplied completed-bar cutoff", () => {
    const rows = detectRonTechnicalAnnotationsV1("GER40", "15m", candles);
    const cutoff = candles[candles.length - 1].time;
    for (const row of rows) {
      expect(Date.parse(row.as_of_bar_time)).toBe(cutoff);
      expect(Date.parse(row.origin_anchor.bar_time)).toBeLessThanOrEqual(cutoff);
      expect(JSON.stringify(row)).not.toMatch(/confidence|probability|score/i);
    }
  });

  it("declares all requested technical families without execution semantics", () => {
    const payload = JSON.stringify(technicalAnnotationDetectorPayloadV1());
    for (const family of ["supply_demand", "support_resistance", "pivot", "fibonacci", "ema"]) {
      expect(payload).toContain(family);
    }
    expect(payload).toContain('"trade_instruction",false');
  });
});
