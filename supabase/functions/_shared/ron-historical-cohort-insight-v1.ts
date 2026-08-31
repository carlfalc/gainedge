/**
 * GAINEDGE_RON_HISTORICAL_COHORT_INSIGHT_V1
 *
 * Pure research layer for evidence-grounded historical observations that RON specialists
 * may cite when explaining a CURRENT finding. This is deliberately separate from the
 * live Evidence V1 envelope, which correctly forbids numeric predictive probabilities.
 *
 * This module reports OBSERVED HISTORICAL FREQUENCY only. It never converts a cohort rate
 * into today's probability, never claims causality, and never describes a trade as a win.
 */
export const RON_HISTORICAL_COHORT_INSIGHT_VERSION = 1;

export type CohortDimension =
  | "weekday"
  | "session"
  | "local_time_bucket"
  | "pattern"
  | "direction_context"
  | "volatility_regime";

export interface HistoricalCohortObservation {
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  /** Exact UTC cutoff of the future bars used to score this historical observation. */
  future_data_cutoff: string;
  weekday: string;
  session: string;
  local_time_bucket: string;
  pattern: string;
  direction_context: string;
  volatility_regime: string;
  /**
   * Observed outcome under a preregistered definition, e.g. max upside excursion >= 0.8 ATR
   * within four completed 15m bars after the cohort anchor.
   */
  outcome_observed: boolean;
}

export interface HistoricalCohortDefinition {
  instrument: string;
  timeframe: string;
  lookback_start: string;
  lookback_end: string;
  outcome_definition: string;
  dimensions: Partial<Record<CohortDimension, string>>;
  /** Minimum eligible observations before a numerical rate may be surfaced. */
  minimum_sample: number;
}

export type SampleQuality = "insufficient" | "small" | "moderate" | "substantial";

export interface HistoricalCohortInsight {
  version: 1;
  instrument: string;
  timeframe: string;
  lookback_start: string;
  lookback_end: string;
  dimensions: Partial<Record<CohortDimension, string>>;
  outcome_definition: string;
  eligible_observations: number;
  observed_outcomes: number;
  /** Descriptive sample frequency, NEVER today's probability. */
  observed_rate: number | null;
  /** Wilson 95% interval for the historical sample proportion. */
  observed_rate_interval_95: { lower: number; upper: number } | null;
  sample_quality: SampleQuality;
  sufficient_to_surface_rate: boolean;
  latest_future_data_cutoff: string | null;
  language_guardrail: "historical_frequency_not_current_probability";
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

function isoMs(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`invalid_iso:${value}`);
  return ms;
}

function matchesDimension(
  row: HistoricalCohortObservation,
  key: CohortDimension,
  expected: string,
): boolean {
  return String(row[key]) === expected;
}

/** Wilson score interval, z=1.96. Stable for small samples and rates near 0/1. */
export function wilson95(successes: number, total: number): { lower: number; upper: number } | null {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || total <= 0 || successes < 0 || successes > total) {
    return null;
  }
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  const den = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / den;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / den;
  return { lower: round(Math.max(0, centre - margin)), upper: round(Math.min(1, centre + margin)) };
}

export function sampleQuality(n: number): SampleQuality {
  if (n < 8) return "insufficient";
  if (n < 20) return "small";
  if (n < 50) return "moderate";
  return "substantial";
}

export function buildHistoricalCohortInsight(
  definition: HistoricalCohortDefinition,
  observations: readonly HistoricalCohortObservation[],
): HistoricalCohortInsight {
  const from = isoMs(definition.lookback_start);
  const to = isoMs(definition.lookback_end);
  if (to <= from) throw new Error("invalid_lookback_window");
  const minSample = Math.max(1, Math.floor(definition.minimum_sample));

  const eligible = observations.filter((row) => {
    if (row.instrument !== definition.instrument || row.timeframe !== definition.timeframe) return false;
    const anchor = isoMs(row.evaluation_anchor);
    const cutoff = isoMs(row.future_data_cutoff);
    if (anchor < from || anchor >= to) return false;
    // Future scoring used by a historical row must itself be fully inside the research cutoff.
    if (cutoff > to || cutoff < anchor) return false;
    return Object.entries(definition.dimensions).every(([key, expected]) =>
      expected == null || matchesDimension(row, key as CohortDimension, expected));
  });

  const n = eligible.length;
  const k = eligible.filter((r) => r.outcome_observed).length;
  const sufficient = n >= minSample;
  const latestCutoff = eligible.length
    ? [...eligible].map((r) => r.future_data_cutoff).sort().slice(-1)[0]
    : null;

  return {
    version: RON_HISTORICAL_COHORT_INSIGHT_VERSION,
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
    language_guardrail: "historical_frequency_not_current_probability",
  };
}

export interface SpecialistHistoricalCommentaryInput {
  specialist: string;
  current_finding: string;
  insight: HistoricalCohortInsight;
}

/**
 * Deterministic commentary template. The word "probability" is intentionally absent.
 * A specialist can speak naturally around this payload later, but these facts remain the
 * source of truth and must be preserved in the rendered explanation.
 */
export function formatSpecialistHistoricalCommentary(
  input: SpecialistHistoricalCommentaryInput,
): string {
  const i = input.insight;
  if (!i.sufficient_to_surface_rate || i.observed_rate == null) {
    return `${input.specialist}: ${input.current_finding} Historical comparison is available, `
      + `but only ${i.eligible_observations} eligible observation(s) match this cohort, so no `
      + `numerical rate is surfaced yet.`;
  }

  const pct = Math.round(i.observed_rate * 100);
  const dims = Object.entries(i.dimensions).map(([k, v]) => `${k}=${v}`).join(", ") || "all eligible bars";
  return `${input.specialist}: ${input.current_finding} In the defined historical cohort (${dims}), `
    + `${i.observed_outcomes} of ${i.eligible_observations} observations (${pct}%) met the `
    + `preregistered outcome definition: ${i.outcome_definition}. This is an observed historical `
    + `frequency, not a prediction for the current bar.`;
}

export function historicalCohortInsightPayload() {
  return [
    "ron_historical_cohort_insight_version", RON_HISTORICAL_COHORT_INSIGHT_VERSION,
    "historical_frequency_not_current_probability", true,
    "sample_size_required", true,
    "confidence_interval", "wilson_95",
    "future_data_cutoff_required", true,
    "causal_claims_allowed", false,
    "trade_win_loss_language_allowed", false,
  ];
}
