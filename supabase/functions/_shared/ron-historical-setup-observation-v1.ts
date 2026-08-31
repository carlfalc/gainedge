/**
 * GAINEDGE_RON_HISTORICAL_SETUP_OBSERVATION_V1
 *
 * Pure bridge from chart-ready technical annotations to measured, forward-only setup
 * outcomes. The output is research evidence for specialist commentary; it is never a
 * current-bar probability, a trade result, or an execution instruction.
 */
import type { Candle } from "./falconer-strategy.ts";
import type { RonChartAnnotationV1 } from "./ron-chart-annotation-v1.ts";
import type { RonSessionContextV5 } from "./ron-session-context-v5.ts";
import {
  buildHistoricalCohortInsightV2,
  formatSpecialistHistoricalCommentaryV2,
  type HistoricalCohortInsightV2,
  type HistoricalCohortObservationV2,
} from "./ron-historical-cohort-insight-v2.ts";

export const RON_HISTORICAL_SETUP_OBSERVATION_VERSION = 1;
export const RON_HISTORICAL_SETUP_HORIZON_BARS = 4;
export const RON_HISTORICAL_SETUP_OUTCOME_ATR = 0.8;
export const RON_HISTORICAL_SETUP_MINIMUM_SAMPLE = 8;

const BAR_MS = 15 * 60_000;

export interface HistoricalSetupObservationV1 extends HistoricalCohortObservationV2 {
  observation_version: 1;
  setup_id: string;
  source_agent: string;
  horizon_bars: number;
  outcome_atr_threshold: number;
}

export interface CurrentHistoricalSetupV1 {
  setup_id: string;
  source_agent: string;
  direction_context: "bullish" | "bearish";
  finding: string;
}

export interface SpecialistHistoricalCommentaryV1 {
  source_agent: string;
  setup_id: string;
  finding: string;
  selected_cohort: "exact" | "session" | "setup";
  insight: HistoricalCohortInsightV2;
  commentary: string;
  strongest_session: {
    session: string;
    eligible_observations: number;
    observed_outcomes: number;
    observed_rate: number;
  } | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (n: number, dp = 8) => Number(n.toFixed(dp));

/** Display-unit contract. Indices/metals use one price unit; FX uses one pip. */
export function historicalDisplayPointSize(instrument: string): number | null {
  if (["XAUUSD", "NAS100", "HK50", "GER40"].includes(instrument)) return 1;
  if (["NZDUSD", "USDCAD"].includes(instrument)) return 0.0001;
  return null;
}

function setupFinding(a: RonChartAnnotationV1): string {
  const label = a.subtype.replace(/_/g, " ");
  if (a.geometry.type === "zone") {
    return `${label} at ${a.geometry.low}-${a.geometry.high}`;
  }
  if ("price" in a.geometry && finite(a.geometry.price)) {
    return `${label} at ${a.geometry.price}`;
  }
  if (a.geometry.type === "ema_event") {
    return `${label} with EMA${a.geometry.fast_period}`
      + (a.geometry.slow_period ? `/EMA${a.geometry.slow_period}` : "");
  }
  return label;
}

export function currentHistoricalSetupsV1(
  annotations: readonly RonChartAnnotationV1[],
): CurrentHistoricalSetupV1[] {
  const out = new Map<string, CurrentHistoricalSetupV1>();
  for (const a of annotations) {
    if (!a || (a.direction !== "bullish" && a.direction !== "bearish")) continue;
    if (["broken", "invalidated", "historical"].includes(a.lifecycle)) continue;
    const setupId = String(a.source_setup_id ?? a.subtype ?? "").trim();
    const sourceAgent = String(a.source_agent ?? "").trim();
    if (!setupId || !sourceAgent) continue;
    // Passive reference geometry is chart context, not a setup observation. It becomes
    // cohort-eligible only when the detector records a reaction/retest/break. EMA stacks
    // are the one explicit current-state setup family and may remain cohort-eligible.
    const passiveReference = [
      "support_level", "resistance_level", "demand_zone", "supply_zone",
      "classical_pivot_level", "fib_retracement_level",
    ].includes(setupId);
    if (passiveReference) continue;
    const key = `${sourceAgent}|${setupId}|${a.direction}`;
    if (!out.has(key)) {
      out.set(key, {
        setup_id: setupId,
        source_agent: sourceAgent,
        direction_context: a.direction,
        finding: setupFinding(a),
      });
    }
  }
  return [...out.values()];
}

function contiguousForwardBars(
  snapshotBarTime: number,
  forwardBars: readonly Candle[],
  horizonBars: number,
): Candle[] {
  const byTime = new Map(forwardBars.map((b) => [b.time, b]));
  const first = snapshotBarTime + BAR_MS;
  const out: Candle[] = [];
  for (let i = 0; i < horizonBars; i++) {
    const b = byTime.get(first + i * BAR_MS);
    if (!b) return [];
    out.push(b);
  }
  return out;
}

function alignedHaRun(
  anchor: Candle,
  future: readonly Candle[],
  direction: "bullish" | "bearish",
): number {
  let priorOpen = (anchor.open + anchor.close) / 2;
  let priorClose = (anchor.open + anchor.high + anchor.low + anchor.close) / 4;
  let run = 0;
  for (const b of future) {
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = (priorOpen + priorClose) / 2;
    const aligned = direction === "bullish" ? close > open : close < open;
    if (!aligned) break;
    run++;
    priorOpen = open;
    priorClose = close;
  }
  return run;
}

/**
 * Produces one outcome row per active directional technical setup at a historical anchor.
 * Returns no rows unless the full future horizon and anchor ATR are genuinely available.
 */
export function buildHistoricalSetupObservationsV1(args: {
  instrument: string;
  timeframe: string;
  snapshot_bar_time: string;
  snapshot_bar: Candle;
  atr_at_anchor: number | null;
  volatility_regime: string;
  annotations: readonly RonChartAnnotationV1[];
  forward_bars: readonly Candle[];
  session_context: RonSessionContextV5;
  horizon_bars?: number;
}): HistoricalSetupObservationV1[] {
  const horizon = Math.max(1, Math.floor(args.horizon_bars ?? RON_HISTORICAL_SETUP_HORIZON_BARS));
  const anchorMs = Date.parse(args.snapshot_bar_time);
  const atr = args.atr_at_anchor;
  if (!Number.isFinite(anchorMs) || !finite(atr) || atr <= 0) return [];
  if (args.snapshot_bar.time !== anchorMs) return [];
  const future = contiguousForwardBars(anchorMs, args.forward_bars, horizon);
  if (future.length !== horizon) return [];

  const setups = currentHistoricalSetupsV1(args.annotations);
  if (!setups.length) return [];
  const pointSize = historicalDisplayPointSize(args.instrument);
  const cutoff = new Date(future[future.length - 1].time + BAR_MS).toISOString();
  const highest = Math.max(...future.map((b) => b.high));
  const lowest = Math.min(...future.map((b) => b.low));

  return setups.map((setup) => {
    const bullish = setup.direction_context === "bullish";
    const favourable = bullish
      ? Math.max(0, highest - args.snapshot_bar.close)
      : Math.max(0, args.snapshot_bar.close - lowest);
    const adverse = bullish
      ? Math.max(0, args.snapshot_bar.close - lowest)
      : Math.max(0, highest - args.snapshot_bar.close);
    let peakIndex = 0;
    for (let i = 1; i < future.length; i++) {
      const better = bullish
        ? future[i].high > future[peakIndex].high
        : future[i].low < future[peakIndex].low;
      if (better) peakIndex = i;
    }
    return {
      observation_version: RON_HISTORICAL_SETUP_OBSERVATION_VERSION,
      setup_id: setup.setup_id,
      source_agent: setup.source_agent,
      horizon_bars: horizon,
      outcome_atr_threshold: RON_HISTORICAL_SETUP_OUTCOME_ATR,
      instrument: args.instrument,
      timeframe: args.timeframe,
      evaluation_anchor: new Date(anchorMs + BAR_MS).toISOString(),
      future_data_cutoff: cutoff,
      weekday: args.session_context.cohort_dimensions.weekday,
      session: args.session_context.cohort_dimensions.session,
      local_time_bucket: args.session_context.cohort_dimensions.local_time_bucket,
      pattern: setup.setup_id,
      direction_context: setup.direction_context,
      volatility_regime: args.volatility_regime || "unknown",
      outcome_observed: favourable >= RON_HISTORICAL_SETUP_OUTCOME_ATR * atr,
      favourable_excursion_price: round(favourable),
      adverse_excursion_price: round(adverse),
      point_size: pointSize,
      bars_to_peak_favourable: peakIndex + 1,
      aligned_ha_candles_15m: alignedHaRun(args.snapshot_bar, future, setup.direction_context),
    };
  });
}

function definitionFor(
  current: CurrentHistoricalSetupV1,
  dimensions: Record<string, string>,
  lookbackStart: string,
  lookbackEnd: string,
) {
  return {
    instrument: "",
    timeframe: "",
    lookback_start: lookbackStart,
    lookback_end: lookbackEnd,
    outcome_definition:
      `favourable excursion reached at least ${RON_HISTORICAL_SETUP_OUTCOME_ATR} ATR `
      + `within ${RON_HISTORICAL_SETUP_HORIZON_BARS} completed 15m bars`,
    dimensions: {
      pattern: current.setup_id,
      direction_context: current.direction_context,
      ...dimensions,
    },
    minimum_sample: RON_HISTORICAL_SETUP_MINIMUM_SAMPLE,
  };
}

function strongestSession(
  current: CurrentHistoricalSetupV1,
  rows: readonly HistoricalSetupObservationV1[],
) {
  const grouped = new Map<string, HistoricalSetupObservationV1[]>();
  for (const r of rows) {
    if (r.setup_id !== current.setup_id || r.direction_context !== current.direction_context) continue;
    const bucket = grouped.get(r.session) ?? [];
    bucket.push(r);
    grouped.set(r.session, bucket);
  }
  return [...grouped.entries()]
    .map(([session, values]) => ({
      session,
      eligible_observations: values.length,
      observed_outcomes: values.filter((v) => v.outcome_observed).length,
      observed_rate: values.length
        ? values.filter((v) => v.outcome_observed).length / values.length
        : 0,
    }))
    .filter((x) => x.eligible_observations >= RON_HISTORICAL_SETUP_MINIMUM_SAMPLE)
    .sort((a, b) => b.observed_rate - a.observed_rate
      || b.eligible_observations - a.eligible_observations
      || a.session.localeCompare(b.session))[0] ?? null;
}

/** Selects the narrowest sufficiently-sized cohort, then formats agent-specific facts. */
export function buildSpecialistHistoricalCommentariesV1(args: {
  instrument: string;
  timeframe: string;
  current_setups: readonly CurrentHistoricalSetupV1[];
  current_session: RonSessionContextV5;
  volatility_regime: string;
  observations: readonly HistoricalSetupObservationV1[];
  lookback_start: string;
  lookback_end: string;
}): SpecialistHistoricalCommentaryV1[] {
  return args.current_setups.map((current) => {
    const candidates: Array<{ name: "exact" | "session" | "setup"; dimensions: Record<string, string> }> = [
      { name: "exact", dimensions: {
        weekday: args.current_session.cohort_dimensions.weekday,
        session: args.current_session.cohort_dimensions.session,
        local_time_bucket: args.current_session.cohort_dimensions.local_time_bucket,
        volatility_regime: args.volatility_regime || "unknown",
      } },
      { name: "session", dimensions: { session: args.current_session.cohort_dimensions.session } },
      { name: "setup", dimensions: {} },
    ];

    let selected = candidates[candidates.length - 1];
    let insight: HistoricalCohortInsightV2 | null = null;
    for (const candidate of candidates) {
      const definition = definitionFor(current, candidate.dimensions, args.lookback_start, args.lookback_end);
      definition.instrument = args.instrument;
      definition.timeframe = args.timeframe;
      const built = buildHistoricalCohortInsightV2(definition, args.observations);
      selected = candidate;
      insight = built;
      if (built.sufficient_to_surface_rate) break;
    }
    const finalInsight = insight!;
    const strongest = strongestSession(current, args.observations);
    let commentary = formatSpecialistHistoricalCommentaryV2({
      specialist: current.source_agent,
      current_finding: current.finding,
      insight: finalInsight,
    });
    if (strongest && strongest.session !== args.current_session.cohort_dimensions.session) {
      commentary += ` The strongest sufficiently sampled session cohort was ${strongest.session}: `
        + `${strongest.observed_outcomes} of ${strongest.eligible_observations} observations met the same definition.`;
    }
    return {
      source_agent: current.source_agent,
      setup_id: current.setup_id,
      finding: current.finding,
      selected_cohort: selected.name,
      insight: finalInsight,
      commentary,
      strongest_session: strongest,
    };
  });
}
