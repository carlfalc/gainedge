import { describe, expect, it } from "vitest";
import {
  buildHistoricalCohortInsightV2,
  formatSpecialistHistoricalCommentaryV2,
  type HistoricalCohortObservationV2,
} from "../../supabase/functions/_shared/ron-historical-cohort-insight-v2.ts";

const obs = (i: number, over: Partial<HistoricalCohortObservationV2> = {}): HistoricalCohortObservationV2 => ({
  instrument: "XAUUSD",
  timeframe: "15m",
  evaluation_anchor: `2026-06-${String(i + 1).padStart(2, "0")}T21:00:00.000Z`,
  future_data_cutoff: `2026-06-${String(i + 1).padStart(2, "0")}T22:00:00.000Z`,
  weekday: "Monday",
  session: "global_transition",
  local_time_bucket: "17:00",
  pattern: "monday_reopen_expansion",
  direction_context: "bullish",
  volatility_regime: "normal",
  outcome_observed: i < 8,
  favourable_excursion_price: i < 8 ? 10 + i : null,
  adverse_excursion_price: i < 8 ? 3 + i * 0.25 : null,
  point_size: 1,
  bars_to_peak_favourable: i < 8 ? 2 + (i % 3) : null,
  aligned_ha_candles_15m: i < 8 ? 3 + (i % 4) : null,
  ...over,
});

const def = {
  instrument: "XAUUSD",
  timeframe: "15m",
  lookback_start: "2026-05-01T00:00:00.000Z",
  lookback_end: "2026-08-01T00:00:00.000Z",
  outcome_definition: "upside excursion >= 0.8 ATR within four completed 15m bars after Monday reopen",
  dimensions: { weekday: "Monday", pattern: "monday_reopen_expansion" },
  minimum_sample: 8,
} as const;

describe("RON historical cohort insight V2 outcome profile", () => {
  it("reports historical frequency plus potential favourable excursion and HA continuation", () => {
    const rows = Array.from({ length: 10 }, (_, i) => obs(i));
    const insight = buildHistoricalCohortInsightV2(def, rows);
    expect(insight.observed_rate).toBe(0.8);
    expect(insight.outcome_run_profile.qualifying_excursion_observations).toBe(8);
    expect(insight.outcome_run_profile.average_favourable_excursion_points).toBe(13.5);
    expect(insight.outcome_run_profile.median_favourable_excursion_points).toBe(13.5);
    expect(insight.outcome_run_profile.average_bars_to_peak_favourable).toBeGreaterThan(2);
    expect(insight.outcome_run_profile.average_aligned_ha_candles_15m).toBeGreaterThan(3);
    expect(insight.outcome_run_profile.at_least_four_aligned_ha_count).toBe(6);
    expect(insight.outcome_guardrail).toBe("potential_excursion_not_realised_profit");
  });

  it("writes trader-facing commentary with points and 15m Heikin Ashi run length", () => {
    const insight = buildHistoricalCohortInsightV2(def, Array.from({ length: 10 }, (_, i) => obs(i)));
    const text = formatSpecialistHistoricalCommentaryV2({
      specialist: "session_market_structure",
      current_finding: "The Monday reopen is expanding upward.",
      insight,
    });
    expect(text).toContain("8 of 10 observations (80%)");
    expect(text).toContain("average favourable excursion was 13.5 points");
    expect(text).toContain("completed 15m bars on average");
    expect(text).toContain("consecutive aligned 15m Heikin Ashi candles");
    expect(text).toContain("6 of 8 (75%) reached at least four aligned HA candles");
    expect(text).toContain("potential excursion, not realised trade profit");
    expect(text.toLowerCase()).not.toContain("80% probability");
  });

  it("suppresses broker-point output when point-size definitions conflict", () => {
    const rows = Array.from({ length: 10 }, (_, i) => obs(i, i === 4 ? { point_size: 0.1 } : {}));
    const insight = buildHistoricalCohortInsightV2(def, rows);
    expect(insight.outcome_run_profile.average_favourable_excursion_points).toBeNull();
    expect(insight.outcome_run_profile.points_suppressed_reason).toBe("inconsistent_point_size_across_cohort");
    expect(insight.outcome_run_profile.average_favourable_excursion_price).not.toBeNull();
  });

  it("computes run statistics only from qualifying historical outcomes", () => {
    const rows = Array.from({ length: 10 }, (_, i) => obs(i, i >= 8 ? {
      favourable_excursion_price: 999,
      adverse_excursion_price: 999,
      bars_to_peak_favourable: 99,
      aligned_ha_candles_15m: 99,
    } : {}));
    const insight = buildHistoricalCohortInsightV2(def, rows);
    expect(insight.outcome_run_profile.qualifying_excursion_observations).toBe(8);
    expect(insight.outcome_run_profile.average_favourable_excursion_points).toBe(13.5);
    expect(insight.outcome_run_profile.average_bars_to_peak_favourable).toBeLessThan(5);
  });

  it("does not surface numerical frequency when the historical sample is too small", () => {
    const insight = buildHistoricalCohortInsightV2(def, [obs(0), obs(1), obs(2)]);
    expect(insight.observed_rate).toBeNull();
    expect(formatSpecialistHistoricalCommentaryV2({
      specialist: "pattern_context",
      current_finding: "A bullish pattern is forming.",
      insight,
    })).toContain("no numerical rate is surfaced yet");
  });
});
