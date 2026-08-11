/**
 * Phase 2A.1 pure-function proofs for the v2 outcome labeller.
 * SYNTHETIC FIXTURES ONLY — nothing here is persisted market data.
 */
import { describe, it, expect } from "vitest";
import { labelOutcomeV2 } from "../../supabase/functions/_shared/ron-outcomes-v2";

const MIN = 60_000;
const BAR = 15 * MIN;
const anchorOpen = Date.UTC(2026, 2, 3, 12, 0, 0);
const anchorClose = anchorOpen + BAR;
const alwaysOpen = () => true;
const now = Date.UTC(2026, 6, 1);

const bars = (n: number, f: (i: number) => [number, number, number, number], from = anchorClose) =>
  Array.from({ length: n }, (_, i) => {
    const [o, h, l, c] = f(i);
    return { time: from + i * MIN, open: o, high: h, low: l, close: c };
  });

describe("ron-outcomes v2", () => {
  it("boundary: first included 1m bar may open exactly at anchor close, last completes by horizon end", () => {
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 1, bars(15, () => [100, 100.1, 99.9, 100]), 15, MIN, "1m", now, alwaysOpen);
    expect(l.coverage_ok).toBe(true);
    expect(l.bars_used).toBe(15);
    expect(new Date(l.first_bar_time!).getTime()).toBe(anchorClose);
    expect(new Date(l.last_bar_time!).getTime() + MIN).toBe(anchorClose + 15 * MIN);
  });

  it("ignores any bar opening before anchor close", () => {
    const pre = [{ time: anchorClose - MIN, open: 100, high: 999, low: 1, close: 100 }];
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 1, [...pre, ...bars(15, () => [100, 100.1, 99.9, 100])], 15, MIN, "1m", now, alwaysOpen);
    expect(l.bars_used).toBe(15);
    expect(l.max_high_price).toBe(100.1);
  });

  it("absolute extrema vs directional excursion distances", () => {
    const b = bars(15, (i) => (i === 3 ? [100, 102, 99, 100] : [100, 100.2, 99.8, 100]));
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 2, b, 15, MIN, "1m", now, alwaysOpen);
    expect(l.max_high_price).toBe(102);
    expect(l.min_low_price).toBe(99);
    expect(l.long_mfe_price).toBe(2);
    expect(l.long_mae_price).toBe(1);
    expect(l.short_mfe_price).toBe(1);
    expect(l.short_mae_price).toBe(2);
    expect(l.long_mfe_atr).toBe(1);
    expect(l.short_mfe_atr).toBe(0.5);
  });

  it("long target hit first => success true, short adverse => success false", () => {
    const b = bars(15, (i) => (i === 5 ? [100, 101.5, 99.9, 101] : [100, 100.2, 99.9, 100]));
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 1, b, 15, MIN, "1m", now, alwaysOpen);
    expect(l.long.first_hit).toBe("target");
    expect(l.long.success).toBe(true);
    expect(l.short.first_hit).toBe("adverse");
    expect(l.short.success).toBe(false);
    expect(l.long.first_hit_time).toBe(new Date(anchorClose + 5 * MIN).toISOString());
  });

  it("same 1m candle touches BOTH barriers => same_bar_ambiguous, never a guess", () => {
    const b = bars(15, (i) => (i === 2 ? [100, 101.5, 98.5, 100] : [100, 100.1, 99.9, 100]));
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 1, b, 15, MIN, "1m", now, alwaysOpen);
    expect(l.long.first_hit).toBe("same_bar_ambiguous");
    expect(l.long.success).toBeNull();
    expect(l.long.event_eligible).toBe(false);
    expect(l.short.first_hit).toBe("same_bar_ambiguous");
    expect(l.short.event_eligible).toBe(false);
  });

  it("no barrier touched => neither, eligible, success false", () => {
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 5, bars(15, () => [100, 100.5, 99.5, 100]), 15, MIN, "1m", now, alwaysOpen);
    expect(l.long.first_hit).toBe("neither");
    expect(l.long.event_eligible).toBe(true);
    expect(l.long.success).toBe(false);
  });

  it("missing ATR => event ineligible and coverage_class missing_atr", () => {
    const l = labelOutcomeV2(anchorOpen, BAR, 100, null, bars(15, () => [100, 100.5, 99.5, 100]), 15, MIN, "1m", now, alwaysOpen);
    expect(l.coverage_ok).toBe(true);
    expect(l.coverage_class).toBe("missing_atr");
    expect(l.long.event_eligible).toBe(false);
    expect(l.long.first_hit).toBe("missing_atr");
    expect(l.long.success).toBeNull();
  });

  it("classifies a venue-closed shortfall as market_session_boundary, an open-hours hole as genuine_data_gap", () => {
    const short = bars(5, () => [100, 100.1, 99.9, 100]);
    const closed = labelOutcomeV2(anchorOpen, BAR, 100, 1, short, 15, MIN, "1m", now, (d) => d.getTime() < anchorClose + 5 * MIN);
    expect(closed.coverage_class).toBe("market_session_boundary");
    const gap = labelOutcomeV2(anchorOpen, BAR, 100, 1, short, 15, MIN, "1m", now, alwaysOpen);
    expect(gap.coverage_class).toBe("genuine_data_gap");
  });

  it("horizon that has not elapsed is not a data defect", () => {
    const l = labelOutcomeV2(anchorOpen, BAR, 100, 1, [], 15, MIN, "1m", anchorClose + 60_000, alwaysOpen);
    expect(l.coverage_class).toBe("horizon_not_elapsed");
  });
});