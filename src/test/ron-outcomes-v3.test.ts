/**
 * Phase 2A.2 pure-function proofs for the v3 outcome labeller.
 * SYNTHETIC FIXTURES ONLY — nothing here is persisted market data.
 */
import { describe, it, expect } from "vitest";
import { labelOutcomeV3, metricHashV3 } from "../../supabase/functions/_shared/ron-outcomes-v3";

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

const flat = (n = 15) => bars(n, () => [100, 100.1, 99.9, 100]);

describe("ron-outcomes v3 — boundary + excursion + barrier semantics", () => {
  it("first included 1m bar may open exactly at anchor close; last completes by horizon end", () => {
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, flat(), 15, MIN, "1m", now, alwaysOpen);
    expect(l.coverage_ok).toBe(true);
    expect(l.coverage_class).toBe("complete");
    expect(l.expected_bars).toBe(15);
    expect(new Date(l.first_bar_time!).getTime()).toBe(anchorClose);
    expect(new Date(l.last_bar_time!).getTime() + MIN).toBe(anchorClose + 15 * MIN);
  });

  it("ignores any bar opening before anchor close", () => {
    const pre = [{ time: anchorClose - MIN, open: 100, high: 999, low: 1, close: 100 }];
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, [...pre, ...flat()], 15, MIN, "1m", now, alwaysOpen);
    expect(l.bars_used).toBe(15);
    expect(l.max_high_price).toBe(100.1);
  });

  it("absolute extrema vs directional excursion distances", () => {
    const b = bars(15, (i) => (i === 3 ? [100, 102, 99, 100] : [100, 100.2, 99.8, 100]));
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 2, b, 15, MIN, "1m", now, alwaysOpen);
    expect([l.max_high_price, l.min_low_price]).toEqual([102, 99]);
    expect([l.long_mfe_price, l.long_mae_price]).toEqual([2, 1]);
    expect([l.short_mfe_price, l.short_mae_price]).toEqual([1, 2]);
    expect(l.long_mfe_atr).toBe(1);
    expect(l.short_mfe_atr).toBe(0.5);
  });

  it("same 1m candle touches BOTH barriers => same_bar_ambiguous, never a guess", () => {
    const b = bars(15, (i) => (i === 2 ? [100, 101.5, 98.5, 100] : [100, 100.1, 99.9, 100]));
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, b, 15, MIN, "1m", now, alwaysOpen);
    expect(l.long.first_hit).toBe("same_bar_ambiguous");
    expect(l.long.success).toBeNull();
    expect(l.long.event_eligible).toBe(false);
    expect(l.short.event_eligible).toBe(false);
  });

  it("missing ATR => event ineligible, coverage_class missing_atr", () => {
    const l = labelOutcomeV3(anchorOpen, BAR, 100, null, flat(), 15, MIN, "1m", now, alwaysOpen);
    expect(l.coverage_ok).toBe(true);
    expect(l.coverage_class).toBe("missing_atr");
    expect(l.long.event_eligible).toBe(false);
  });
});

describe("ron-outcomes v3 — exact missing-timestamp coverage classifier", () => {
  const closedFrom = (fromIdx: number) => (d: Date) =>
    d.getTime() < anchorClose + fromIdx * MIN;

  it("pure market boundary: every missing timestamp is venue-closed", () => {
    // venue closes after 10 minutes; only the first 10 bars exist
    const venueOpen = closedFrom(10);
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, flat(10), 15, MIN, "1m", now, venueOpen);
    expect(l.missing_bars).toBe(5);
    expect([l.missing_venue_open, l.missing_venue_closed]).toEqual([0, 5]);
    expect(l.coverage_class).toBe("market_session_boundary");
    expect(l.coverage_ok).toBe(false);
  });

  it("pure open-market hole: every missing timestamp is venue-open", () => {
    const b = flat(15).filter((_, i) => i !== 7);
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, b, 15, MIN, "1m", now, alwaysOpen);
    expect([l.missing_bars, l.missing_venue_open, l.missing_venue_closed]).toEqual([1, 1, 0]);
    expect(l.coverage_class).toBe("genuine_data_gap");
  });

  it("ONE open-market missing minute can never be hidden as market_session_boundary, even alongside many legitimate closed minutes", () => {
    // venue closed for the last 10 minutes (legitimate), plus one open-hours hole at i=2
    const venueOpen = closedFrom(5);
    const b = flat(5).filter((_, i) => i !== 2);
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, b, 15, MIN, "1m", now, venueOpen);
    expect([l.missing_venue_open, l.missing_venue_closed]).toEqual([1, 10]);
    expect(l.coverage_class).toBe("mixed_boundary_and_data_gap");
    expect(l.coverage_class).not.toBe("market_session_boundary");
  });

  it("horizon not elapsed wins over cause classification", () => {
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, [], 15, MIN, "1m", anchorClose + MIN, alwaysOpen);
    expect(l.coverage_class).toBe("horizon_not_elapsed");
    expect(l.exclusion_reason).toBe("horizon_not_elapsed");
  });

  it("duplicate timestamps cannot make an incomplete window look complete", () => {
    const b = flat(15).filter((_, i) => i !== 9);
    const dup = [...b, { ...b[0] }];              // 15 bars, but only 14 unique grid slots
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, dup, 15, MIN, "1m", now, alwaysOpen);
    expect(l.duplicate_timestamps).toBe(1);
    expect(l.bars_used).toBe(14);
    expect(l.missing_bars).toBe(1);
    expect(l.coverage_ok).toBe(false);
    expect(l.coverage_class).toBe("genuine_data_gap");
  });

  it("off-grid timestamps are detected explicitly and never fill a grid slot", () => {
    const b = flat(15).filter((_, i) => i !== 4);
    const offGrid = [...b, { time: anchorClose + 4 * MIN + 30_000, open: 100, high: 100, low: 100, close: 100 }];
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, offGrid, 15, MIN, "1m", now, alwaysOpen);
    expect(l.off_grid_bars).toBe(1);
    expect(l.missing_bars).toBe(1);
    expect(l.coverage_ok).toBe(false);
  });

  it("off-grid extras on an otherwise complete grid are still surfaced, not swallowed", () => {
    const extra = [...flat(15), { time: anchorClose + 30_000, open: 100, high: 100, low: 100, close: 100 }];
    const l = labelOutcomeV3(anchorOpen, BAR, 100, 1, extra, 15, MIN, "1m", now, alwaysOpen);
    expect(l.off_grid_bars).toBe(1);
    expect(l.missing_bars).toBe(0);
    expect(l.coverage_ok).toBe(false);
    expect(l.exclusion_reason).toBe("off_grid_timestamps");
  });
});

describe("ron-outcomes v3 — deterministic hash", () => {
  it("is stable across identical runs and changes when coverage cause changes", async () => {
    const a = await metricHashV3(labelOutcomeV3(anchorOpen, BAR, 100, 1, flat(), 15, MIN, "1m", now, alwaysOpen));
    const b = await metricHashV3(labelOutcomeV3(anchorOpen, BAR, 100, 1, flat(), 15, MIN, "1m", now, alwaysOpen));
    expect(a).toBe(b);
    const short = await metricHashV3(labelOutcomeV3(anchorOpen, BAR, 100, 1, flat(14), 15, MIN, "1m", now, alwaysOpen));
    expect(short).not.toBe(a);
  });
});