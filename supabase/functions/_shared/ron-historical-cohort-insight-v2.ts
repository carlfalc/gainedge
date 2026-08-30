/**
 * GAINEDGE_RON_HISTORICAL_COHORT_INSIGHT_V2
 *
 * Forward-only extension of V1. Adds measured OUTCOME RUN CHARACTERISTICS so a specialist
 * can explain not only how often a historical cohort met its preregistered definition,
 * but how far and how long the qualifying moves actually ran.
 *
 * Guardrails:
 *   - historical observed frequency is never today's predictive probability;
 *   - favourable excursion is potential price movement, never realised trade profit;
 *   - no entry, stop, target, spread, slippage or position size is assumed;
 *   - Heikin Ashi continuation uses CLOSED 15m HA candles only;
 *   - broker-point summaries require one consistent, explicit point_size across the rows;
 *   - future_data_cutoff must remain inside the research window.
 */
import { wilson95, sampleQuality, type CohortDimension, type SampleQuality } from "./ron-historical-cohort-insight-v1.ts";

export const RON_HISTORICAL_COHORT_INSIGHT_VERSION_V2 = 2;

export interface HistoricalCohortObservationV2 {
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  future_data_cutoff: string;
  weekday: string;
  session: string;
  local_time_bucket: string;
  pattern: string;
  direction_context: string;
  volatility_regime: string;
  outcome_observed: boolean;

  /** Maximum favourable price excursion from the cohort anchor in raw instrument price units. */
  favourable_excursion_price?: number | null;
  /** Maximum adverse price excursion from the cohort anchor in raw instrument price units. */
  adverse_excursion_price?: number | null;
  /** Explicit broker point size used to convert raw price excursion to broker points. */
  point_size?: number | null;
  /** Number of completed 15m bars from anchor until maximum favourable excursion. */
  bars_to_peak_favourable?: number | null;
  /** Consecutive CLOSED 15m Heikin Ashi candles aligned with the observed direction. */
  aligned_ha_candles_15m?: number | null;
}

export interface HistoricalCohortDefinitionV2 {
  instrument: string;
  timeframe: string;
  lookback_start: string;
  lookback_end: string;
  outcome_definition: string;
  dimensions: Partial<Record<CohortDimension, string>>;
  minimum_sample: number;
}

export interface HistoricalOutcomeRunProfileV2 {
  /** Rows that both met the outcome definition and had usable excursion data. */
  qualifying_excursion_observations: number;
  average_favourable_excursion_price: number | null;
  median_favourable_excursion_price: number | null;
  average_adverse_excursion_price: number | null;

  /** Only surfaced when all qualifying point-measured rows use the same explicit point size. */
  point_size: number | null;
  average_favourable_excursion_points: number | null;
  median_favourable_excursion_points: number | null;
  average_adverse_excursion_points: number | null;
  points_suppressed_reason: string | null;

  bars_to_peak_observations: number;
  average_bars_to_peak_favourable: number | null;
  median_bars_to_peak_favourable: number | null;

  ha_continuation_observations: number;
  average_aligned_ha_candles_15m: number | null;
  median_aligned_ha_candles_15m: number | null;
  at_least_four_aligned_ha_count: number;
  at_least_four_aligned_ha_rate: number | null;
  at_least_four_aligned_ha_interval_95: { lower: number; upper: number } | null;
}

export interface HistoricalCohortInsightV2 {
  version: 2;
  instrument: string;
  timeframe: string;
  lookback_start: string;
  lookback_end: string;
  dimensions: Partial<Record<CohortDimension, string>>;
  outcome_definition: string;
  eligible_observations: number;
  observed_outcomes: number;
  observed_rate: number | null;
  observed_rate_interval_95: { lower: number; upper: number } | null;
  sample_quality: SampleQuality;
  sufficient_to_surface_rate: boolean;
  latest_future_data_cutoff: string | null;
  outcome_run_profile: HistoricalOutcomeRunProfileV2;
  language_guardrail: "historical_frequency_not_current_probability";
  outcome_guardrail: "potential_excursion_not_realised_profit";
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

function isoMs(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`invalid_iso:${value}`);
  return ms;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
}

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}

function matchesDimension(row: HistoricalCohortObservationV2, key: CohortDimension, expected: string): boolean {
  return String(row[key]) === expected;
}

function buildRunProfile(qualifying: readonly HistoricalCohortObservationV2[]): HistoricalOutcomeRunProfileV2 {
  const excursionRows = qualifying.filter((r) => finiteNonNegative(r.favourable_excursion_price));
  const favourablePrice = excursionRows.map((r) => Number(r.favourable_excursion_price));
  const adversePrice = excursionRows
    .filter((r) => finiteNonNegative(r.adverse_excursion_price))
    .map((r) => Number(r.adverse_excursion_price));

  const pointRows = excursionRows.filter((r) => finiteNonNegative(r.point_size) && Number(r.point_size) > 0);
  const pointSizes = [...new Set(pointRows.map((r) => Number(r.point_size)))];
  const consistentPointSize = pointRows.length > 0 && pointRows.length === excursionRows.length && pointSizes.length === 1
    ? pointSizes[0]
    : null;
  const favourablePoints = consistentPointSize == null
    ? []
    : excursionRows.map((r) => Number(r.favourable_excursion_price) / consistentPointSize);
  const adversePoints = consistentPointSize == null
    ? []
    : excursionRows
      .filter((r) => finiteNonNegative(r.adverse_excursion_price))
      .map((r) => Number(r.adverse_excursion_price) / consistentPointSize);

  const peakBars = qualifying
    .filter((r) => Number.isInteger(r.bars_to_peak_favourable) && Number(r.bars_to_peak_favourable) >= 0)
    .map((r) => Number(r.bars_to_peak_favourable));
  const ha = qualifying
    .filter((r) => Number.isInteger(r.aligned_ha_candles_15m) && Number(r.aligned_ha_candles_15m) >= 0)
    .map((r) => Number(r.aligned_ha_candles_15m));
  const ha4 = ha.filter((n) => n >= 4).length;

  let pointsSuppressed: string | null = null;
  if (excursionRows.length && !pointRows.length) pointsSuppressed = "point_size_missing";
  else if (pointRows.length !== excursionRows.length) pointsSuppressed = "point_size_missing_on_some_rows";
  else if (pointSizes.length > 1) pointsSuppressed = "inconsistent_point_size_across_cohort";

  return {
    qualifying_excursion_observations: excursionRows.length,
    average_favourable_excursion_price: average(favourablePrice),
    median_favourable_excursion_price: median(favourablePrice),
    average_adverse_excursion_price: average(adversePrice),
    point_size: consistentPointSize,
    average_favourable_excursion_points: average(favourablePoints),
    median_favourable_excursion_points: median(favourablePoints),
    average_adverse_excursion_points: average(adversePoints),
    points_suppressed_reason: pointsSuppressed,
    bars_to_peak_observations: peakBars.length,
    average_bars_to_peak_favourable: average(peakBars),
    median_bars_to_peak_favourable: median(peakBars),
    ha_continuation_observations: ha.length,
    average_aligned_ha_candles_15m: average(ha),
    median_aligned_ha_candles_15m: median(ha),
    at_least_four_aligned_ha_count: ha4,
    at_least_four_aligned_ha_rate: ha.length ? round(ha4 / ha.length) : null,
    at_least_four_aligned_ha_interval_95: ha.length ? wilson95(ha4, ha.length) : null,
  };
}

export function buildHistoricalCohortInsightV2(
  definition: HistoricalCohortDefinitionV2,
  observations: readonly HistoricalCohortObservationV2[],
): HistoricalCohortInsightV2 {
  const from = isoMs(definition.lookback_start);
  const to = isoMs(definition.lookback_end);
  if (to <= from) throw new Error("invalid_lookback_window");
  const minSample = Math.max(1, Math.floor(definition.minimum_sample));

  const eligible = observations.filter((row) => {
    if (row.instrument !== definition.instrument || row.timeframe !== definition.timeframe) return false;
    const anchor = isoMs(row.evaluation_anchor);
    const cutoff = isoMs(row.future_data_cutoff);
    if (anchor < from || anchor >= to || cutoff > to || cutoff < anchor) return false;
    return Object.entries(definition.dimensions).every(([key, expected]) =>
      expected == null || matchesDimension(row, key as CohortDimension, expected));
  });

  const n = eligible.length;
  const qualifying = eligible.filter((r) => r.outcome_observed);
  const k = qualifying.length;
  const sufficient = n >= minSample;
  const latestCutoff = eligible.length
    ? [...eligible].map((r) => r.future_data_cutoff).sort().slice(-1)[0]
    : null;

  return {
    version: RON_HISTORICAL_COHORT_INSIGHT_VERSION_V2,
    instrument: definition.instrument,
    timeframe: definition.timeframe,
    lookback_start: new Date(from).toISOString(),
    lookback_end: new Date(to).toISOString(),
    dimensions: { ...definition.dimensions },
    outcome_definition: definition.outcome_definition,
    eligible_observations: n,
    observed_outcomes: k,
    observed_rate: sufficient ? round(k / n) : null,
    observed_rate_interval_95: sufficient ? wilson95(k, n) : null,
    sample_quality: sampleQuality(n),
    sufficient_to_surface_rate: sufficient,
    latest_future_data_cutoff: latestCutoff,
    outcome_run_profile: buildRunProfile(qualifying),
    language_guardrail: "historical_frequency_not_current_probability",
    outcome_guardrail: "potential_excursion_not_realised_profit",
  };
}

export function formatSpecialistHistoricalCommentaryV2(input: {
  specialist: string;
  current_finding: string;
  insight: HistoricalCohortInsightV2;
}): string {
  const i = input.insight;
  if (!i.sufficient_to_surface_rate || i.observed_rate == null) {
    return `${input.specialist}: ${input.current_finding} Historical comparison is available, `
      + `but only ${i.eligible_observations} eligible observation(s) match this cohort, so no numerical rate is surfaced yet.`;
  }

  const dims = Object.entries(i.dimensions).map(([k, v]) => `${k}=${v}`).join(", ") || "all eligible bars";
  const pct = Math.round(i.observed_rate * 100);
  const p = i.outcome_run_profile;
  const run: string[] = [];

  if (p.average_favourable_excursion_points != null) {
    run.push(`among qualifying outcomes, average favourable excursion was ${p.average_favourable_excursion_points} points`
      + (p.median_favourable_excursion_points != null ? ` (median ${p.median_favourable_excursion_points})` : ""));
  } else if (p.average_favourable_excursion_price != null) {
    run.push(`among qualifying outcomes, average favourable excursion was ${p.average_favourable_excursion_price} raw price units`
      + (p.median_favourable_excursion_price != null ? ` (median ${p.median_favourable_excursion_price})` : ""));
  }
  if (p.average_bars_to_peak_favourable != null) {
    run.push(`peak favourable excursion arrived after ${p.average_bars_to_peak_favourable} completed 15m bars on average`);
  }
  if (p.average_aligned_ha_candles_15m != null) {
    const haPct = p.at_least_four_aligned_ha_rate == null ? null : Math.round(p.at_least_four_aligned_ha_rate * 100);
    run.push(`the move averaged ${p.average_aligned_ha_candles_15m} consecutive aligned 15m Heikin Ashi candles`
      + (haPct == null ? "" : `; ${p.at_least_four_aligned_ha_count} of ${p.ha_continuation_observations} (${haPct}%) reached at least four aligned HA candles`));
  }

  const runText = run.length ? ` Outcome profile: ${run.join("; ")}.` : "";
  return `${input.specialist}: ${input.current_finding} In the defined historical cohort (${dims}), `
    + `${i.observed_outcomes} of ${i.eligible_observations} observations (${pct}%) met the preregistered outcome definition: `
    + `${i.outcome_definition}.${runText} These are historical observed outcomes and potential excursion, not realised trade profit or a prediction for the current bar.`;
}

export function historicalCohortInsightV2Payload() {
  return [
    "ron_historical_cohort_insight_version", RON_HISTORICAL_COHORT_INSIGHT_VERSION_V2,
    "historical_frequency_not_current_probability", true,
    "potential_excursion_not_realised_profit", true,
    "favourable_excursion_price", true,
    "explicit_point_size_required_for_points", true,
    "bars_to_peak", true,
    "closed_15m_heikin_ashi_continuation", true,
    "future_data_cutoff_required", true,
    "trade_entry_exit_assumed", false,
  ];
}
