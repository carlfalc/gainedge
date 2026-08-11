/**
 * RON Phase 2C proofs — deterministic market-data quality detector (quality_version = 1).
 * SYNTHETIC FIXTURES ONLY. No production candle is read, written or deleted here.
 */
import { describe, it, expect } from "vitest";
import {
  detectBarQuality, evidenceHash, tradableChildGrid, RON_QUALITY_VERSION,
} from "../../supabase/functions/_shared/ron-data-quality";
import { xauVenueOpen } from "../../supabase/functions/_shared/ron-sessions";
import {
  resolveSourceClockV2, NoGenuineSourceClockError,
} from "../../supabase/functions/_shared/ron-calibration";

const MIN = 60_000;
const opts = { barMinutes: 15, venueOpen: xauVenueOpen };
const bar = (t: number, o = 100, h = 101, l = 99, c = 100.5, volume = 500) =>
  ({ time: t, open: o, high: h, low: l, close: c, volume });
const kids = (t: number, n = 15, f: (i: number) => [number, number, number, number] = () => [100, 101, 99, 100.5]) =>
  Array.from({ length: n }, (_, i) => {
    const [o, h, l, c] = f(i);
    return { time: t + i * MIN, open: o, high: h, low: l, close: c };
  });

describe("venue-break hard rule (DST aware)", () => {
  const knownArtifacts = [
    "2026-04-16T21:45:00.000Z",
    "2026-04-23T21:45:00.000Z",
    "2026-04-30T21:45:00.000Z",
    "2026-05-07T21:45:00.000Z",
    "2026-05-14T21:45:00.000Z",
  ];

  it("flags every known 21:45Z provider rollup artifact as critical", () => {
    for (const iso of knownArtifacts) {
      const flags = detectBarQuality(bar(Date.parse(iso), 100, 180, 90, 175, 90000), [], opts);
      expect(flags).toHaveLength(1);
      expect(flags[0].rule_code).toBe("venue_break_bar");
      expect(flags[0].severity).toBe("critical");
      expect(flags[0].quality_version).toBe(RON_QUALITY_VERSION);
      expect(flags[0].bar_time).toBe(iso);
    }
  });

  it("EDT: 21:45Z is inside the break, 20:45Z and 22:15Z are not", () => {
    expect(detectBarQuality(bar(Date.UTC(2026, 5, 10, 21, 45)), [], opts)[0]?.rule_code).toBe("venue_break_bar");
    expect(detectBarQuality(bar(Date.UTC(2026, 5, 10, 20, 45)), kids(Date.UTC(2026, 5, 10, 20, 45)), opts)).toEqual([]);
    expect(detectBarQuality(bar(Date.UTC(2026, 5, 10, 22, 15)), kids(Date.UTC(2026, 5, 10, 22, 15)), opts)).toEqual([]);
  });

  it("EST: the break shifts to 22:00-23:00Z", () => {
    // 2026-01-14 (EST, UTC-5): 22:45Z = 17:45 NY -> break; 21:45Z = 16:45 NY -> tradable.
    expect(detectBarQuality(bar(Date.UTC(2026, 0, 14, 22, 45)), [], opts)[0]?.rule_code).toBe("venue_break_bar");
    expect(detectBarQuality(bar(Date.UTC(2026, 0, 14, 21, 45)), kids(Date.UTC(2026, 0, 14, 21, 45)), opts)).toEqual([]);
  });

  it("does not restrict RON to Asia — London, overlap and NY bars are clean", () => {
    for (const h of [2, 8, 13, 15, 19]) {              // Asia, London, overlap, NY, late NY
      const t = Date.UTC(2026, 5, 10, h, 0);
      expect(detectBarQuality(bar(t), kids(t), opts)).toEqual([]);
    }
  });

  it("preserves raw OHLC in evidence without altering the input bar", () => {
    const b = bar(Date.parse("2026-04-16T21:45:00.000Z"), 3300.1, 3400.2, 3290.3, 3395.4, 91234);
    const snapshot = JSON.stringify(b);
    const f = detectBarQuality(b, [], opts)[0];
    expect(JSON.stringify(b)).toBe(snapshot);
    expect(f.evidence).toMatchObject({ bar_open: 3300.1, bar_high: 3400.2, bar_low: 3290.3, bar_close: 3395.4, volume: 91234 });
  });
});

describe("child-coverage evidence (never synthesised)", () => {
  const t = Date.UTC(2026, 5, 10, 13, 0);

  it("no stored 1m children => unverifiable, informational, not corruption", () => {
    const f = detectBarQuality(bar(t), [], opts)[0];
    expect(f.rule_code).toBe("unverifiable_1m_coverage");
    expect(f.severity).toBe("info");
    expect(f.evidence.verdict).toBe("unknown_not_corrupt");
    expect(f.evidence.child_count).toBe(0);
    expect(f.evidence.expected_children).toBe(15);
  });

  it("the known 2026-05-15 -> 2026-07-31 1m outage reads as unverifiable, never filled", () => {
    const outage = Date.UTC(2026, 5, 12, 10, 0);
    const f = detectBarQuality(bar(outage), [], opts)[0];
    expect(f.rule_code).toBe("unverifiable_1m_coverage");
    expect(f.severity).not.toBe("critical");
  });

  it("partial children => warning with the exact missing timestamps", () => {
    const f = detectBarQuality(bar(t), kids(t, 12), opts)[0];
    expect(f.rule_code).toBe("child_coverage_incomplete");
    expect(f.severity).toBe("warning");
    expect(f.evidence.missing_children).toBe(3);
    expect(f.evidence.missing_timestamps).toEqual([
      new Date(t + 12 * MIN).toISOString(),
      new Date(t + 13 * MIN).toISOString(),
      new Date(t + 14 * MIN).toISOString(),
    ]);
  });

  it("full children that reconcile => no flag at all", () => {
    expect(detectBarQuality(bar(t, 100, 101, 99, 100.5), kids(t), opts)).toEqual([]);
  });

  it("full children that do not reconcile => warning, never critical", () => {
    const f = detectBarQuality(bar(t, 100, 140, 99, 100.5), kids(t), opts)[0];
    expect(f.rule_code).toBe("ohlc_reconciliation_mismatch");
    expect(f.severity).toBe("warning");
    expect(f.evidence.reconstructed).toMatchObject({ high: 101 });
  });

  it("a huge genuine range that reconciles is NOT flagged (no N-sigma verdicts)", () => {
    const big = kids(t, 15, (i) => [100, 100 + i * 5, 99, 100 + i * 5]);
    expect(detectBarQuality(bar(t, 100, 170, 99, 170), big, opts)).toEqual([]);
  });

  it("only tradable minutes are expected inside a bar", () => {
    // 2026-06-10 20:45Z EDT = 16:45 NY: fully tradable, 15 expected minutes.
    expect(tradableChildGrid(Date.UTC(2026, 5, 10, 20, 45), 15, xauVenueOpen)).toHaveLength(15);
    // 21:45Z opens inside the break: zero tradable minutes.
    expect(tradableChildGrid(Date.UTC(2026, 5, 10, 21, 45), 15, xauVenueOpen)).toHaveLength(0);
  });
});

describe("idempotence", () => {
  it("same inputs produce identical flags and identical evidence hashes", async () => {
    const t = Date.UTC(2026, 5, 10, 13, 0);
    const a = detectBarQuality(bar(t), kids(t, 9), opts);
    const b = detectBarQuality(bar(t), kids(t, 9), opts);
    expect(a).toEqual(b);
    expect(await evidenceHash("XAUUSD", "15m", a[0])).toBe(await evidenceHash("XAUUSD", "15m", b[0]));
  });

  it("different evidence produces a different hash", async () => {
    const t = Date.UTC(2026, 5, 10, 13, 0);
    const a = detectBarQuality(bar(t), kids(t, 9), opts)[0];
    const b = detectBarQuality(bar(t), kids(t, 8), opts)[0];
    expect(await evidenceHash("XAUUSD", "15m", a)).not.toBe(await evidenceHash("XAUUSD", "15m", b));
  });
});

describe("calibration source clock fails closed", () => {
  it("throws NO_GENUINE_SOURCE_CLOCK when no genuine 1m candle exists", () => {
    expect(() => resolveSourceClockV2(null, null)).toThrow(NoGenuineSourceClockError);
    expect(() => resolveSourceClockV2(null, "")).toThrow(/NO_GENUINE_SOURCE_CLOCK/);
  });

  it("uses the genuine market candle when available", () => {
    expect(resolveSourceClockV2(null, "2026-08-11T12:34:00.000Z")).toEqual({
      source_as_of: "2026-08-11T12:34:00.000Z", source_clock: "market_1m_candle",
    });
  });

  it("still allows an explicit frozen replay instant", () => {
    expect(resolveSourceClockV2("2026-07-01T00:00:00.000Z", null)).toEqual({
      source_as_of: "2026-07-01T00:00:00.000Z", source_clock: "explicit",
    });
  });
});
