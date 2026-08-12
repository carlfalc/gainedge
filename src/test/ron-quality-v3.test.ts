import { describe, it, expect } from "vitest";
import {
  detectBarQuality, RON_QUALITY_VERSION, isQuarantined,
} from "../../supabase/functions/_shared/ron-data-quality";
import {
  canonicalFeatureWindow, buildEligibleSeries, RON_WINDOW_CONTRACT, RON_CANONICAL_WINDOW,
} from "../../supabase/functions/_shared/ron-window";
import { criticalRulesForBar } from "../../supabase/functions/_shared/ron-quality-contract";

const MIN = 60_000;
const alwaysOpen = () => true;

describe("Phase 2C.2 — quality v3 multi-finding", () => {
  it("is version 3", () => expect(RON_QUALITY_VERSION).toBe(3));

  it("reports BOTH the premature-write critical rule and the reconciliation evidence", () => {
    const barOpen = Date.UTC(2026, 7, 10, 1, 45);
    const bar = {
      time: barOpen, open: 100, high: 110, low: 90, close: 105, volume: 10,
      created_at: barOpen + 5 * MIN, // written before the 15m close
    };
    // 15 genuine children that do NOT reconcile with the stored bar
    const children = Array.from({ length: 15 }, (_, i) => ({
      time: barOpen + i * MIN, open: 100, high: 101, low: 99, close: 100,
    }));
    const flags = detectBarQuality(bar, children, { barMinutes: 15, venueOpen: alwaysOpen });
    const codes = flags.map((f) => f.rule_code).sort();
    expect(codes).toContain("premature_bar_persisted");
    expect(codes).toContain("ohlc_reconciliation_mismatch");
    expect(isQuarantined(flags)).toBe(true);
    expect(flags.every((f) => f.quality_version === 3)).toBe(true);
  });

  it("emits no flags for a clean, reconciled, on-time bar", () => {
    const barOpen = Date.UTC(2026, 7, 10, 2, 0);
    const children = Array.from({ length: 15 }, (_, i) => ({
      time: barOpen + i * MIN, open: 100, high: 101, low: 99, close: 100,
    }));
    const flags = detectBarQuality(
      { time: barOpen, open: 100, high: 101, low: 99, close: 100, created_at: barOpen + 15 * MIN },
      children, { barMinutes: 15, venueOpen: alwaysOpen },
    );
    expect(flags).toEqual([]);
  });

  it("central contract agrees with the detector on hard rules", () => {
    const barOpen = Date.UTC(2026, 7, 10, 1, 45);
    expect(criticalRulesForBar({ time: barOpen, created_at: barOpen + MIN }, 15))
      .toContain("premature_bar_persisted");
  });
});

describe("Phase 2C.2 — canonical feature window v4", () => {
  const base = Date.UTC(2026, 0, 1);
  const bars = Array.from({ length: 2000 }, (_, i) => ({ time: base + i * 15 * MIN }));
  const badTime = bars[1000].time;
  const quarantined = (b: { time: number }) => b.time === badTime;

  it("removes quarantined bars BEFORE slicing, so the window is still full", () => {
    const target = bars[1999].time;
    const res = canonicalFeatureWindow(bars, target, 15, quarantined);
    expect(RON_WINDOW_CONTRACT).toBe("last_1500_quality_eligible");
    expect(res.targetEligible).toBe(true);
    expect(res.window.length).toBe(RON_CANONICAL_WINDOW);
    expect(res.window.some((b) => b.time === badTime)).toBe(false);
    expect(res.excludedCriticalCount).toBe(1);
    expect(res.eligibleCount).toBe(1999);
  });

  it("produces no window when the target bar itself is quarantined", () => {
    const res = canonicalFeatureWindow(bars, badTime, 15, quarantined);
    expect(res.targetEligible).toBe(false);
    expect(res.window).toEqual([]);
  });

  it("batch series and single-target window agree exactly (no live/backfill drift)", () => {
    const { eligible } = buildEligibleSeries(bars, 15, quarantined);
    const target = bars[1999].time;
    const batch = eligible.slice(-RON_CANONICAL_WINDOW).map((b) => b.time);
    const single = canonicalFeatureWindow(bars, target, 15, quarantined).window.map((b) => b.time);
    expect(single).toEqual(batch);
  });
});
