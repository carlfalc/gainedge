import { describe, expect, it } from "vitest";
import {
  buildHistoricalCohortInsight,
  formatSpecialistHistoricalCommentary,
  wilson95,
  type HistoricalCohortObservation,
} from "../../supabase/functions/_shared/ron-historical-cohort-insight-v1.ts";

const obs = (over: Partial<HistoricalCohortObservation> = {}): HistoricalCohortObservation => ({
  instrument: "XAUUSD",
  timeframe: "15m",
  evaluation_anchor: "2026-06-01T21:00:00.000Z",
  future_data_cutoff: "2026-06-01T22:00:00.000Z",
  weekday: "Monday",
  session: "global_transition",
  local_time_bucket: "17:00",
  pattern: "monday_reopen_expansion",
  direction_context: "bullish",
  volatility_regime: "normal",
  outcome_observed: true,
  ...over,
});

const def = {
  instrument: "XAUUSD",
  timeframe: "15m",
  lookback_start: "2026-05-01T00:00:00.000Z",
  lookback_end: "2026-08-01T00:00:00.000Z",
  outcome_definition: "upside excursion >= 0.8 ATR within four completed 15m bars after Monday reopen",
  dimensions: {
    weekday: "Monday",
    pattern: "monday_reopen_expansion",
  },
  minimum_sample: 8,
} as const;

describe("RON historical cohort insight V1", () => {
  it("surfaces observed historical frequency only when sample minimum is met", () => {
    const rows = Array.from({ length: 10 }, (_, i) => obs({
      evaluation_anchor: `2026-06-${String(i + 1).padStart(2, "0")}T21:00:00.000Z`,
      future_data_cutoff: `2026-06-${String(i + 1).padStart(2, "0")}T22:00:00.000Z`,
      outcome_observed: i < 8,
    }));
    const insight = buildHistoricalCohortInsight(def, rows);
    expect(insight.eligible_observations).toBe(10);
    expect(insight.observed_outcomes).toBe(8);
    expect(insight.observed_rate).toBe(0.8);
    expect(insight.observed_rate_interval_95).not.toBeNull();
    expect(insight.language_guardrail).toBe("historical_frequency_not_current_probability");
  });

  it("hides the rate when the cohort is too small", () => {
    const insight = buildHistoricalCohortInsight(def, [obs(), obs({ evaluation_anchor: "2026-06-08T21:00:00.000Z", future_data_cutoff: "2026-06-08T22:00:00.000Z" })]);
    expect(insight.sufficient_to_surface_rate).toBe(false);
    expect(insight.observed_rate).toBeNull();
    expect(formatSpecialistHistoricalCommentary({
      specialist: "pattern_context",
      current_finding: "Monday reopen expansion is forming.",
      insight,
    })).toContain("no numerical rate is surfaced yet");
  });

  it("excludes rows whose scored future cutoff leaks past the research window", () => {
    const insight = buildHistoricalCohortInsight(def, [obs({
      evaluation_anchor: "2026-07-31T23:45:00.000Z",
      future_data_cutoff: "2026-08-01T00:45:00.000Z",
    })]);
    expect(insight.eligible_observations).toBe(0);
  });

  it("filters by instrument, timeframe and exact cohort dimensions", () => {
    const rows = [
      obs(),
      obs({ instrument: "NAS100" }),
      obs({ weekday: "Tuesday" }),
      obs({ pattern: "other_pattern" }),
    ];
    const insight = buildHistoricalCohortInsight({ ...def, minimum_sample: 1 }, rows);
    expect(insight.eligible_observations).toBe(1);
  });

  it("produces specialist commentary with numerator, denominator and guardrail language", () => {
    const rows = Array.from({ length: 10 }, (_, i) => obs({
      evaluation_anchor: `2026-07-${String(i + 1).padStart(2, "0")}T21:00:00.000Z`,
      future_data_cutoff: `2026-07-${String(i + 1).padStart(2, "0")}T22:00:00.000Z`,
      outcome_observed: i < 8,
    }));
    const insight = buildHistoricalCohortInsight(def, rows);
    const text = formatSpecialistHistoricalCommentary({
      specialist: "session_market_structure",
      current_finding: "The Monday reopen is expanding upward.",
      insight,
    });
    expect(text).toContain("8 of 10 observations (80%)");
    expect(text).toContain("observed historical frequency, not a prediction");
    expect(text.toLowerCase()).not.toContain("80% probability");
    expect(text.toLowerCase()).not.toContain("win rate");
  });

  it("uses Wilson intervals rather than naive zero-width certainty", () => {
    const interval = wilson95(8, 10)!;
    expect(interval.lower).toBeLessThan(0.8);
    expect(interval.upper).toBeGreaterThan(0.8);
    expect(interval.upper).toBeLessThanOrEqual(1);
  });
});
