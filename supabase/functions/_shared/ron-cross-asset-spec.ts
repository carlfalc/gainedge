/**
 * RON Phase 2D.2g — CROSS-ASSET CORRELATION SPECIALIST spec V1 (pure producer).
 *
 * Fourth genuine specialist producer. It reports OBSERVED CO-MOVEMENT ONLY between the
 * primary XAUUSD 15m series and the frozen counterpart NAS100 15m series, computed from
 * genuine broker-native `candle_history` rows.
 *
 * HARD CONTRACT — this is NOT a model and NOT a forecast:
 *   - no prediction, no causal claim, no confidence, no probability, no expected value,
 *   - no beta, no regression, no target, no trade direction, no threshold labels
 *     ("strong"/"weak"/"bullish"/"bearish"), no score/rating, no p-value/significance,
 *   - envelope `direction` is `neutral` (supported) or `unknown` (not supported), so a
 *     contextual, uncalibrated association can never create a binding directional
 *     conflict in Orchestrator V1 while ZERO state variables are promoted,
 *   - recommendation is always `context_only` or `no_action`.
 *
 * SOURCE / ALIGNMENT CONTRACT:
 *   - The primary XAUUSD leg uses the accepted central quality contract (qv5) plus the
 *     ACCEPTED Session V2 slot classification/segmentation, current segment only.
 *   - NAS100 has NO accepted venue or quality model in RON. Its policy is therefore
 *     `native_presence_only_no_venue_inference`: presence of a native row is the ONLY
 *     signal used. The XAU venue calendar is never applied to NAS100 and an absent NAS100
 *     bar is never explained, imputed or excused.
 *   - Alignment is EXACT TIMESTAMP INTERSECTION. No resampling, filling, interpolation,
 *     nearest-match or synthetic bars exist anywhere in this module.
 *   - Only the conservative COMMON CONTIGUOUS SEGMENT ending at the anchor is analysed:
 *     any gap greater than one 15m bar in the common timestamps resets the segment, so a
 *     return is never computed across a gap.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type EvidenceStatus, type Observation,
  type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";
import { RON_QUALITY_VERSION } from "./ron-data-quality.ts";
import {
  classifySlots, segmentSlots, expectedOpenSlot, SESSION_STRUCTURE_SPEC_V2,
  type Slot, type SlotClass,
} from "./ron-session-structure-spec-v2.ts";
import type { StructureBar } from "./ron-session-structure-spec.ts";

/** FULL accepted Session & Market Structure Spec V2 hash (segmentation dependency). */
export const SESSION_STRUCTURE_SPEC_V2_HASH_PINNED =
  "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b";

/** Frozen counterpart for V1. Exactly one, and it is not configurable. */
export const CROSS_ASSET_COUNTERPART_V1 = "NAS100" as const;

/** Paired simple returns actually used, at most. */
export const CROSS_ASSET_RETURNS_WINDOW = 32;
/** Minimum paired simple returns required before any statistic is asserted. */
export const CROSS_ASSET_MIN_PAIRED_RETURNS = 24;
/** Common bars needed for the minimum paired returns (returns = bars - 1). */
export const CROSS_ASSET_MIN_COMMON_BARS = CROSS_ASSET_MIN_PAIRED_RETURNS + 1;   // 25
/** Common bars consumed at most (returns window + 1). */
export const CROSS_ASSET_MAX_COMMON_BARS = CROSS_ASSET_RETURNS_WINDOW + 1;       // 33

export const CROSS_ASSET_SPEC_V1 = {
  spec_id: "ron_cross_asset_correlation",
  spec_version: 1,
  agent_id: "cross_asset_correlation",
  agent_version: 1,
  authority_class: "contextual",
  authority_rank: 4,
  source_health_authoritative: false,
  ttl_multiplier: 2,

  instrument_scope: ["XAUUSD"],
  counterpart_scope: [CROSS_ASSET_COUNTERPART_V1],
  timeframe_scope: ["15m"],
  bar_minutes: 15,

  primary_contract: {
    source: "candle_history_native",
    quality_version: RON_QUALITY_VERSION,
    critical_fails_closed: true,
    closed_bars_only: true,
    segmentation_spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
    segmentation_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    segmentation_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    current_segment_only: true,
  },

  counterpart_contract: {
    symbol: CROSS_ASSET_COUNTERPART_V1,
    source: "candle_history_native",
    policy: "native_presence_only_no_venue_inference",
    venue_calendar_applied: false,
    quality_model_applied: false,
    absence_is_never_explained: true,
    closed_bars_only: true,
  },

  alignment_contract: {
    method: "exact_timestamp_intersection",
    resampling_allowed: false,
    forward_fill_allowed: false,
    interpolation_allowed: false,
    nearest_match_allowed: false,
    synthetic_bars_allowed: false,
    gap_boundary_minutes: 15,
    gap_resets_common_segment: true,
    cross_gap_returns_allowed: false,
    current_common_segment_only: true,
    anchor_must_be_common_timestamp: true,
  },

  statistic_contract: {
    return_definition: "simple_close_to_close",
    return_formula: "(close_t / close_prev) - 1",
    paired_returns_window: CROSS_ASSET_RETURNS_WINDOW,
    minimum_paired_returns: CROSS_ASSET_MIN_PAIRED_RETURNS,
    estimator: "pearson_r",
    estimator_deterministic: true,
    zero_variance_result: "insufficient_data",
    fabricated_zero_correlation_allowed: false,
    beta_emitted: false,
    regression_emitted: false,
    significance_emitted: false,
    threshold_labels_emitted: false,
  },

  safety_contract: {
    predictive: false,
    causal: false,
    confidence_emitted: false,
    probability_emitted: false,
    expected_value_emitted: false,
    target_emitted: false,
    trade_direction_emitted: false,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    recommendation: "context_only",
    execution_allowed: false,
    execution_path: "signal_only",
    persistence_in_phase_2d2g: false,
  },

  lookback_bars_max: 300,
  lookahead: "none",
} as const;

export function crossAssetSpecHash(): Promise<string> {
  return hashCanonical(CROSS_ASSET_SPEC_V1);
}

const BAR_MS = CROSS_ASSET_SPEC_V1.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* -------------------------------------------------------- canonical inputs */

export interface CounterpartBar {
  time: number;
  close: number;
}

export class CrossAssetSourceConflictError extends Error {
  readonly symbol: string;
  readonly at: string;
  constructor(symbol: string, at: string) {
    super(`conflicting_duplicate_source_rows: ${symbol}@${at}`);
    this.name = "CrossAssetSourceConflictError";
    this.symbol = symbol;
    this.at = at;
  }
}

/**
 * Canonical sort + duplicate policy. IDENTICAL duplicate rows collapse silently (a
 * harmless re-ingestion), CONFLICTING rows at the same timestamp FAIL CLOSED — the
 * producer refuses to pick a winner between two contradictory genuine claims.
 */
function canonicalRows<T extends { time: number }>(
  rows: readonly T[], symbol: string, identity: (r: T) => string,
): T[] {
  const byTime = new Map<number, { row: T; id: string }>();
  for (const r of rows ?? []) {
    if (!r || !Number.isFinite(r.time)) continue;
    const id = identity(r);
    const seen = byTime.get(r.time);
    if (!seen) { byTime.set(r.time, { row: r, id }); continue; }
    if (seen.id !== id) throw new CrossAssetSourceConflictError(symbol, iso(r.time));
  }
  return [...byTime.values()].map((v) => v.row).sort((a, b) => a.time - b.time);
}

const barIdentity = (b: StructureBar) =>
  `${b.open}|${b.high}|${b.low}|${b.close}`;
const counterpartIdentity = (b: CounterpartBar) => `${b.close}`;

/* ------------------------------------------------------------- statistics */

/** Simple close-to-close returns over an exactly contiguous close series. */
export function simpleReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

export interface PearsonResult {
  r: number | null;
  reason: "ok" | "insufficient_sample" | "zero_variance" | "non_finite";
}

/** Deterministic Pearson correlation. Never fabricates 0 when it cannot be computed. */
export function pearson(xs: readonly number[], ys: readonly number[]): PearsonResult {
  const n = Math.min(xs.length, ys.length);
  if (n < CROSS_ASSET_MIN_PAIRED_RETURNS) return { r: null, reason: "insufficient_sample" };
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) {
    return { r: null, reason: "non_finite" };
  }
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  if (!(vx > 0) || !(vy > 0)) return { r: null, reason: "zero_variance" };
  const r = cov / Math.sqrt(vx * vy);
  if (!Number.isFinite(r)) return { r: null, reason: "non_finite" };
  return { r: Math.max(-1, Math.min(1, r)), reason: "ok" };
}

/**
 * Conservative common contiguous segment ENDING at `anchor`: walk backwards through the
 * common timestamps and stop at the first step larger than one bar. A return is therefore
 * never computed across a gap.
 */
export function commonContiguousSegment(
  commonTimes: readonly number[], anchor: number, maxBars: number,
): number[] {
  const asc = [...new Set(commonTimes)].sort((a, b) => a - b);
  if (!asc.length || asc[asc.length - 1] !== anchor) return [];
  const out: number[] = [anchor];
  for (let i = asc.length - 2; i >= 0; i--) {
    if (asc[i + 1] - asc[i] > BAR_MS) break;
    out.push(asc[i]);
    if (out.length >= maxBars) break;
  }
  return out.reverse();
}

/* ------------------------------------------------------------- the producer */

export interface CrossAssetInputV1 {
  instrument: string;
  counterpart: string;
  timeframe: string;
  /** bar OPEN (epoch ms) of the CLOSED bar the evidence describes. */
  as_of: number;
  bars: StructureBar[];
  counterpart_bars: CounterpartBar[];
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  run_id: string;
  trace_id: string;
  newest_source_bar?: number;
  newest_counterpart_bar?: number;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });

export async function buildCrossAssetEvidenceV1(
  input: CrossAssetInputV1,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await crossAssetSpecHash();
  const asOf = input.as_of;
  const asOfClose = asOf + BAR_MS;

  const provenance_refs = [
    `spec:${CROSS_ASSET_SPEC_V1.spec_id}:v${CROSS_ASSET_SPEC_V1.spec_version}:${spec_hash}`,
    `quality_version:${CROSS_ASSET_SPEC_V1.primary_contract.quality_version}`,
    `segmentation:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    `source:${CROSS_ASSET_SPEC_V1.primary_contract.source}:${input.instrument}:${input.timeframe}`,
    `counterpart_source:${CROSS_ASSET_SPEC_V1.counterpart_contract.source}:${input.counterpart}:${input.timeframe}`,
    `counterpart_policy:${CROSS_ASSET_SPEC_V1.counterpart_contract.policy}`,
  ];

  const limitations: string[] = [
    "observed co-movement of completed bars only; association is not causation and is not a forecast",
    `${input.counterpart} venue completeness is NOT inferred: only exact common native bars are analysed and an absent counterpart bar is never explained or filled`,
    "no beta, regression, significance, threshold label, confidence or probability is asserted",
  ];
  const issues: string[] = [];
  const source_timestamps: Record<string, string> = {};
  const observations: Observation[] = [
    state("counterpart_symbol", input.counterpart, iso(asOf)),
    state("alignment_method", CROSS_ASSET_SPEC_V1.alignment_contract.method, iso(asOf)),
    state("counterpart_source_policy", CROSS_ASSET_SPEC_V1.counterpart_contract.policy, iso(asOf)),
  ];

  const dependencies = [
    `quality_contract_v${CROSS_ASSET_SPEC_V1.primary_contract.quality_version}`,
    `session_structure_spec_v${SESSION_STRUCTURE_SPEC_V2.spec_version}`,
    `counterpart_native_series:${input.counterpart}:${input.timeframe}`,
  ];

  let completeness = 1;
  const freshness_minutes = input.newest_source_bar != null && input.newest_source_bar > asOf
    ? Math.round((input.newest_source_bar - asOf) / 60_000)
    : 0;

  const envelope = (
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
  ): EvidenceEnvelopeV1 => ({
    schema_version: 1,
    agent_id: "cross_asset_correlation",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: iso(asOf),
    source_timestamps,
    observations,
    provenance_refs,
    data_health: { status: healthStatus, freshness_minutes, completeness, issues },
    uncertainty: { level: "unquantified", limitations },
    conflicts: [],
    dependencies,
    status,
    direction,
    recommendation,
  });

  // ---- 1. canonical inputs; conflicting same-timestamp rows fail closed.
  let primaryRows: StructureBar[];
  let counterpartRows: CounterpartBar[];
  try {
    primaryRows = canonicalRows(input.bars, input.instrument, barIdentity);
    counterpartRows = canonicalRows(input.counterpart_bars, input.counterpart, counterpartIdentity);
  } catch (err) {
    if (err instanceof CrossAssetSourceConflictError) {
      issues.push(`conflicting_duplicate_source_rows:${err.symbol}`);
      limitations.push("two contradictory genuine rows share one timestamp; no winner is invented");
      observations.push(state("cross_asset_state", "blocked", iso(asOf)));
      return envelope("blocked", "critical", "unknown", "no_action");
    }
    throw err;
  }

  // ---- 2. nothing after as_of is representable.
  const primary = primaryRows.filter((b) => b.time <= asOf);
  const counterpart = counterpartRows.filter((b) => b.time <= asOf && Number.isFinite(b.close));

  if (input.newest_counterpart_bar != null) {
    source_timestamps.newest_counterpart_source_bar = iso(input.newest_counterpart_bar);
  }
  if (input.newest_source_bar != null) {
    source_timestamps.newest_source_bar = iso(input.newest_source_bar);
  }

  // ---- 3. accepted qv5 + Session V2 classification of the primary leg.
  const capStart = asOf - (CROSS_ASSET_SPEC_V1.lookback_bars_max - 1) * BAR_MS;
  const windowStart = primary.length ? Math.max(capStart, primary[0].time) : asOf;
  const slots: Slot[] = classifySlots(windowStart, asOf, primary, input.isQuarantined);
  const count = (c: SlotClass) => slots.filter((s) => s.cls === c).length;
  const admissible_slots = count("admissible");
  const critical_excluded_slots = count("quality_critical");
  const unexpected_missing_slots = count("unexpected_missing");
  const expected_open_slots = admissible_slots + critical_excluded_slots + unexpected_missing_slots;
  completeness = expected_open_slots === 0 ? 1 : admissible_slots / expected_open_slots;

  observations.push(
    num("expected_open_slots", expected_open_slots, iso(asOf), "slots"),
    num("admissible_slots", admissible_slots, iso(asOf), "slots"),
    num("critical_excluded_slots", critical_excluded_slots, iso(asOf), "slots"),
    num("unexpected_missing_slots", unexpected_missing_slots, iso(asOf), "slots"),
    state("venue_state", expectedOpenSlot(asOf) ? "venue_open" : "venue_closed", iso(asOf)),
  );

  const segments = segmentSlots(slots);
  const lastSeg = segments.at(-1) ?? null;
  const currentSegment = lastSeg && lastSeg.bars.at(-1)!.time === asOf ? lastSeg : null;
  const asOfSlot = slots.at(-1)!;

  if (asOfSlot.cls !== "admissible" || !currentSegment) {
    if (asOfSlot.cls === "expected_closed") {
      issues.push("venue_closed_no_bar_expected");
      limitations.push("as_of falls in a scheduled venue closure; no closed primary bar is expected");
      observations.push(state("as_of_bar_status", "market_closed", iso(asOf)));
      observations.push(state("cross_asset_state", "insufficient_data", iso(asOf)));
      return envelope("insufficient_data", "healthy", "unknown", "no_action");
    }
    const critical = asOfSlot.cls === "quality_critical";
    issues.push(critical ? "as_of_bar_quality_critical" : "as_of_bar_missing_from_genuine_source");
    limitations.push("source defect at as_of; never bridged, interpolated or forward-filled");
    observations.push(state("as_of_bar_status", critical ? "quality_critical" : "source_missing", iso(asOf)));
    observations.push(state("cross_asset_state", "blocked", iso(asOf)));
    return envelope("blocked", "critical", "unknown", "no_action");
  }

  let healthStatus: "healthy" | "degraded" | "critical" = "healthy";
  if (critical_excluded_slots > 0) {
    healthStatus = "degraded";
    issues.push(`quality_critical_bars_excluded:${critical_excluded_slots}`);
  }
  if (unexpected_missing_slots > 0) {
    healthStatus = "degraded";
    issues.push(`unexpected_missing_expected_open_slots:${unexpected_missing_slots}`);
  }

  observations.push(
    state("as_of_bar_status", "admissible", iso(asOf)),
    state("primary_segment_start_reason", currentSegment.start_reason, iso(currentSegment.bars[0].time)),
    num("primary_segment_bars", currentSegment.bars.length, iso(asOf), "bars"),
  );
  source_timestamps.as_of_bar_open = iso(asOf);
  source_timestamps.as_of_bar_completed_close = iso(asOfClose);
  source_timestamps.primary_segment_start_bar = iso(currentSegment.bars[0].time);

  // ---- 4. EXACT intersection with the counterpart, restricted to the primary segment.
  const primaryByTime = new Map<number, StructureBar>(currentSegment.bars.map((b) => [b.time, b]));
  const counterpartByTime = new Map<number, CounterpartBar>(counterpart.map((b) => [b.time, b]));
  const commonTimes = [...primaryByTime.keys()].filter((t) => counterpartByTime.has(t)).sort((a, b) => a - b);

  // ---- 5. conservative common contiguous segment ending at the anchor.
  const segTimes = commonContiguousSegment(commonTimes, asOf, CROSS_ASSET_MAX_COMMON_BARS);
  observations.push(
    num("common_bars_available", segTimes.length, iso(asOf), "bars"),
    num("common_timestamps_in_primary_segment", commonTimes.length, iso(asOf), "bars"),
  );

  if (!segTimes.length) {
    issues.push("anchor_not_present_in_counterpart_source");
    limitations.push("the anchor timestamp is not an exact common native bar; nothing is inferred");
    observations.push(state("cross_asset_state", "insufficient_data", iso(asOf)));
    return envelope("insufficient_data", healthStatus, "unknown", "context_only");
  }

  source_timestamps.common_segment_start_bar = iso(segTimes[0]);
  source_timestamps.common_segment_end_bar = iso(segTimes[segTimes.length - 1]);

  if (segTimes.length < CROSS_ASSET_MIN_COMMON_BARS) {
    limitations.push(
      `the current common contiguous segment holds ${segTimes.length} exact common bars, fewer than the ` +
      `${CROSS_ASSET_MIN_COMMON_BARS} required for ${CROSS_ASSET_MIN_PAIRED_RETURNS} paired returns; no statistic is asserted`,
    );
    observations.push(state("cross_asset_state", "insufficient_common_history", iso(asOf)));
    return envelope("insufficient_data", healthStatus, "unknown", "context_only");
  }

  // ---- 6. paired simple close-to-close returns inside the contiguous segment only.
  const xCloses = segTimes.map((t) => primaryByTime.get(t)!.close);
  const yCloses = segTimes.map((t) => counterpartByTime.get(t)!.close);
  const xr = simpleReturns(xCloses);
  const yr = simpleReturns(yCloses);
  const res = pearson(xr, yr);

  observations.push(num("paired_returns_used", res.reason === "ok" ? xr.length : 0, iso(asOf), "returns"));

  if (res.reason !== "ok") {
    issues.push(`correlation_not_computable:${res.reason}`);
    limitations.push(
      res.reason === "zero_variance"
        ? "at least one leg has zero return variance over the paired window; no correlation exists to report"
        : "the paired sample is inadequate; no correlation is fabricated",
    );
    observations.push(state("cross_asset_state", "insufficient_data", iso(asOf)));
    return envelope("insufficient_data", healthStatus, "unknown", "context_only");
  }

  let same = 0, opposite = 0;
  for (let i = 0; i < xr.length; i++) {
    if (xr[i] === 0 || yr[i] === 0) continue;
    if ((xr[i] > 0) === (yr[i] > 0)) same++; else opposite++;
  }

  observations.push(
    num("xau_last_return", xr[xr.length - 1], iso(asOf), "ratio"),
    num("nas100_last_return", yr[yr.length - 1], iso(asOf), "ratio"),
    num("paired_return_correlation", res.r!, iso(asOf), "pearson_r"),
    num("same_sign_pairs", same, iso(asOf), "pairs"),
    num("opposite_sign_pairs", opposite, iso(asOf), "pairs"),
    state("cross_asset_state", "evaluated", iso(asOf)),
  );

  return envelope("supported", healthStatus, "neutral", "context_only");
}
