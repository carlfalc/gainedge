/**
 * RON Phase 2D.2e — PATTERN CONTEXT SPECIALIST spec V1 (pure producer).
 *
 * Third genuine specialist producer. It emits DETERMINISTIC CHART-GEOMETRY CONTEXT for
 * XAUUSD 15m from genuine broker-native bars, gated by the accepted central quality
 * contract (qv5) and segmented with the ACCEPTED Session V2 slot logic so no defect is
 * ever bridged.
 *
 * IT IS NOT A MODEL. Hard contract:
 *   - the legacy detector's heuristic `confidence` (1-10) is DISCARDED entirely and is
 *     never renamed into another quasi-score,
 *   - the detector's textbook `target` projection is DISCARDED entirely,
 *   - implementation-relative bar indices are never emitted,
 *   - the envelope `direction` is `neutral` (supported) or `unknown` (not supported) so
 *     this uncalibrated contextual detector can never create a binding directional
 *     conflict in Orchestrator V1 while ZERO state variables are promoted,
 *   - recommendation is `context_only`,
 *   - no probability, no forecast, no causation, no execution path.
 *
 * The upstream detector `_shared/ron-patterns.ts` is CONSUMED UNCHANGED; its exact source
 * digest is frozen below and regression-tested.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type EvidenceStatus, type Observation,
  type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";
import { RON_QUALITY_VERSION } from "./ron-data-quality.ts";
import { RON_VENUE_CALENDAR_VERSION_V2 } from "./ron-venue-calendar-v2.ts";
import {
  classifySlots, segmentSlots, expectedOpenSlot, SESSION_STRUCTURE_SPEC_V2,
  type Slot, type SlotClass,
} from "./ron-session-structure-spec-v2.ts";
import type { StructureBar } from "./ron-session-structure-spec.ts";
import { detectPatterns, type DetectedPattern, type OHLCVCandle } from "./ron-patterns.ts";

/**
 * SHA-256 of the EXACT current `supabase/functions/_shared/ron-patterns.ts` source.
 * Pinned so the consumed detector semantics cannot drift silently underneath this spec.
 */
export const PATTERN_DETECTOR_SOURCE_SHA256 =
  "2086613c1cc164c9c057e26d14272332444268918d8805b663c14e3a3efaf756";

/** FULL accepted Session & Market Structure Spec V2 hash (segmentation dependency). */
export const SESSION_STRUCTURE_SPEC_V2_HASH_PINNED =
  "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b";

/** Detector minimum bars, as actually enforced inside `detectPatterns`. */
export const PATTERN_DETECTOR_MIN_BARS = 20;
/** Detector internal lookback slice, as actually enforced inside `detectPatterns`. */
export const PATTERN_DETECTOR_SLICE_BARS = 100;
/** Deterministic cap on emitted contexts, applied in CANONICAL DESCRIPTIVE ORDER. */
export const PATTERN_CONTEXT_MAX = 8;

export const PATTERN_CONTEXT_SPEC_V1 = {
  spec_id: "ron_pattern_context",
  spec_version: 1,
  agent_id: "pattern_context",
  agent_version: 1,
  authority_class: "contextual",
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: 15,

  quality_contract: { quality_version: RON_QUALITY_VERSION, critical_fails_closed: true },

  source_contract: {
    source: "candle_history_native",
    closed_bars_only: true,
    synthetic_allowed: false,
    forward_fill_allowed: false,
    snapshot_patterns_column_used: false,
    broker_presence_is_authoritative: true,
    calendar_context: `ron_venue_calendar_v${RON_VENUE_CALENDAR_VERSION_V2}`,
  },

  segmentation_dependency: {
    spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
    spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    hard_boundary_on: ["quality_critical", "unexpected_missing"],
    never_boundary_on: ["expected_closed"],
    current_segment_only: true,
  },

  detector: {
    module: "_shared/ron-patterns.ts",
    entrypoint: "detectPatterns",
    detector_source_sha256: PATTERN_DETECTOR_SOURCE_SHA256,
    min_bars: PATTERN_DETECTOR_MIN_BARS,
    internal_slice_bars: PATTERN_DETECTOR_SLICE_BARS,
    modified_for_this_phase: false,
    lookahead: "none",
  },

  safety_contract: {
    confidence_discarded: true,
    target_projection_discarded: true,
    bar_indices_discarded: true,
    raw_detector_object_embedded: false,
    ordering_depends_on_confidence: false,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    predictive_claim: false,
    execution_allowed: false,
    execution_path: "signal_only",
    recommendation: "context_only",
  },

  emitted_reference_levels: ["neckline", "support", "resistance", "peaks", "troughs"],
  canonical_order_keys: ["name", "orientation", "neckline", "support", "resistance", "peaks", "troughs"],
  max_emitted_patterns: PATTERN_CONTEXT_MAX,

  lookback_bars_max: 300,
  lookahead: "none",
} as const;

export function patternContextSpecHash(): Promise<string> {
  return hashCanonical(PATTERN_CONTEXT_SPEC_V1);
}

const BAR_MS = PATTERN_CONTEXT_SPEC_V1.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* ------------------------------------------------------- safe normalization */

export type PatternOrientation = "bullish" | "bearish";

/**
 * SAFE canonical pattern context. Deliberately contains NO confidence, NO target and NO
 * bar index. This is the ONLY shape that may reach an Evidence V1 envelope.
 */
export interface SafePatternContext {
  name: string;
  orientation: PatternOrientation;
  neckline?: number;
  support?: number;
  resistance?: number;
  peaks?: number[];
  troughs?: number[];
}

const slug = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const finiteList = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return out.length ? out : undefined;
};

/**
 * Project raw detector output onto the safe canonical context collection.
 *
 * Pure and total: malformed / non-finite reference levels are dropped rather than
 * emitted, `confidence` and `target` are structurally unreachable, and the output order
 * is a canonical descriptive sort so it can never depend on detector array order or on
 * the discarded heuristic score.
 */
export function normalizePatternContexts(
  patterns: readonly DetectedPattern[],
  cap: number = PATTERN_CONTEXT_MAX,
): SafePatternContext[] {
  const safe: SafePatternContext[] = [];
  for (const p of patterns ?? []) {
    if (!p || typeof p.pattern_name !== "string") continue;
    if (p.direction !== "bullish" && p.direction !== "bearish") continue;
    const name = slug(p.pattern_name);
    if (!name) continue;
    const kp = (p.key_prices ?? {}) as Record<string, unknown>;
    const entry: SafePatternContext = { name, orientation: p.direction };
    const neckline = finite(kp.neckline);
    const support = finite(kp.support);
    const resistance = finite(kp.resistance);
    const peaks = finiteList(kp.peaks);
    const troughs = finiteList(kp.troughs);
    if (neckline !== undefined) entry.neckline = neckline;
    if (support !== undefined) entry.support = support;
    if (resistance !== undefined) entry.resistance = resistance;
    if (peaks) entry.peaks = [...peaks].sort((a, b) => a - b);
    if (troughs) entry.troughs = [...troughs].sort((a, b) => a - b);
    safe.push(entry);
  }

  const key = (c: SafePatternContext) => [
    c.name, c.orientation,
    c.neckline ?? "", c.support ?? "", c.resistance ?? "",
    (c.peaks ?? []).join("|"), (c.troughs ?? []).join("|"),
  ].join("\u0000");

  const deduped = new Map<string, SafePatternContext>();
  for (const c of safe) if (!deduped.has(key(c))) deduped.set(key(c), c);

  return [...deduped.values()]
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    .slice(0, Math.max(0, cap));
}

/* ------------------------------------------------------------- the producer */

export interface PatternContextInputV1 {
  instrument: string;
  timeframe: string;
  /** bar OPEN (epoch ms) of the CLOSED bar the evidence describes. */
  as_of: number;
  bars: StructureBar[];
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  run_id: string;
  trace_id: string;
  newest_source_bar?: number;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });

const pad2 = (n: number) => String(n).padStart(2, "0");

export async function buildPatternContextEvidenceV1(
  input: PatternContextInputV1,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await patternContextSpecHash();
  const asOf = input.as_of;
  const asOfClose = asOf + BAR_MS;

  // Bars strictly at or before as_of. Nothing after as_of is representable, so a future
  // bar can never alter this evidence.
  const atOrBefore = input.bars.filter((b) => b.time <= asOf).sort((a, b) => a.time - b.time);
  const capStart = asOf - (PATTERN_CONTEXT_SPEC_V1.lookback_bars_max - 1) * BAR_MS;
  const windowStart = atOrBefore.length ? Math.max(capStart, atOrBefore[0].time) : asOf;

  // ACCEPTED Session V2 slot classification + segmentation. Defects are hard boundaries.
  const slots: Slot[] = classifySlots(windowStart, asOf, atOrBefore, input.isQuarantined);
  const count = (c: SlotClass) => slots.filter((s) => s.cls === c).length;
  const admissible_slots = count("admissible");
  const critical_excluded_slots = count("quality_critical");
  const unexpected_missing_slots = count("unexpected_missing");
  const expected_closed_slots = count("expected_closed");
  const expected_open_slots = admissible_slots + critical_excluded_slots + unexpected_missing_slots;
  const native_present_slots = admissible_slots + critical_excluded_slots;
  const completeness = expected_open_slots === 0 ? 1 : admissible_slots / expected_open_slots;

  const segments = segmentSlots(slots);
  const last = segments.at(-1) ?? null;
  const currentSegment = last && last.bars.at(-1)!.time === asOf ? last : null;
  const asOfSlot = slots.at(-1)!;
  const admissibleAll = slots.filter((s) => s.cls === "admissible").map((s) => s.bar!);

  const provenance_refs = [
    `spec:${PATTERN_CONTEXT_SPEC_V1.spec_id}:v${PATTERN_CONTEXT_SPEC_V1.spec_version}:${spec_hash}`,
    `detector_source_sha256:${PATTERN_DETECTOR_SOURCE_SHA256}`,
    `quality_version:${PATTERN_CONTEXT_SPEC_V1.quality_contract.quality_version}`,
    `segmentation:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    `venue_calendar_context:v${RON_VENUE_CALENDAR_VERSION_V2}`,
    `source:${PATTERN_CONTEXT_SPEC_V1.source_contract.source}:${input.instrument}:${input.timeframe}`,
  ];

  const source_timestamps: Record<string, string> = {};
  if (admissibleAll.length) {
    source_timestamps.oldest_admissible_bar = iso(admissibleAll[0].time);
    source_timestamps.newest_admissible_bar = iso(admissibleAll.at(-1)!.time);
  }
  if (asOfSlot.cls === "admissible") {
    source_timestamps.as_of_bar_open = iso(asOf);
    source_timestamps.as_of_bar_completed_close = iso(asOfClose);
  }
  if (input.newest_source_bar != null) {
    source_timestamps.newest_source_bar = iso(input.newest_source_bar);
  }

  const limitations: string[] = [
    "deterministic chart-geometry context only; no predictive or probabilistic claim",
    "detector heuristic score and textbook price projection are discarded, not reported",
    "pattern geometry is descriptive; it is not a trade recommendation",
  ];
  const issues: string[] = [];

  const freshness_minutes = input.newest_source_bar != null && input.newest_source_bar > asOf
    ? Math.round((input.newest_source_bar - asOf) / 60_000)
    : 0;

  const observations: Observation[] = [
    num("expected_open_slots", expected_open_slots, iso(asOf), "slots"),
    num("native_present_slots", native_present_slots, iso(asOf), "slots"),
    num("admissible_slots", admissible_slots, iso(asOf), "slots"),
    num("critical_excluded_slots", critical_excluded_slots, iso(asOf), "slots"),
    num("unexpected_missing_slots", unexpected_missing_slots, iso(asOf), "slots"),
    num("expected_closed_slots", expected_closed_slots, iso(asOf), "slots"),
    state("venue_state", expectedOpenSlot(asOf) ? "venue_open" : "venue_closed", iso(asOf)),
  ];

  const baseEnvelope = (
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
  ): EvidenceEnvelopeV1 => ({
    schema_version: 1,
    agent_id: "pattern_context",
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
    dependencies: [
      `quality_contract_v${PATTERN_CONTEXT_SPEC_V1.quality_contract.quality_version}`,
      `session_structure_spec_v${SESSION_STRUCTURE_SPEC_V2.spec_version}`,
      `pattern_detector_sha256:${PATTERN_DETECTOR_SOURCE_SHA256}`,
    ],
    status,
    direction,
    recommendation,
  });

  // ---- anchor handling: a missing/critical as_of bar is never bridged.
  if (asOfSlot.cls !== "admissible") {
    if (asOfSlot.cls === "expected_closed") {
      issues.push("venue_closed_no_bar_expected");
      limitations.push("as_of falls in a scheduled venue closure; no closed bar is expected");
      observations.push(state("as_of_bar_status", "market_closed", iso(asOf)));
      observations.push(state("pattern_context_state", "insufficient_data", iso(asOf)));
      return baseEnvelope("insufficient_data", "healthy", "unknown", "no_action");
    }
    const critical = asOfSlot.cls === "quality_critical";
    issues.push(critical ? "as_of_bar_quality_critical" : "as_of_bar_missing_from_genuine_source");
    limitations.push("source defect at as_of; never bridged, interpolated or forward-filled");
    observations.push(state("as_of_bar_status", critical ? "quality_critical" : "source_missing", iso(asOf)));
    observations.push(state("pattern_context_state", "blocked", iso(asOf)));
    return baseEnvelope("blocked", "critical", "unknown", "no_action");
  }

  const seg = currentSegment!;
  observations.push(
    state("as_of_bar_status", "admissible", iso(asOf)),
    state("current_segment_start_reason", seg.start_reason, iso(seg.bars[0].time)),
    num("current_segment_bars", seg.bars.length, iso(asOf), "bars"),
  );
  source_timestamps.current_segment_start_bar = iso(seg.bars[0].time);
  if (seg.boundary_time != null) {
    observations.push(state("current_segment_boundary_at", iso(seg.boundary_time), iso(seg.boundary_time)));
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
  if (segments.length > 1) {
    issues.push(`analytical_segments_in_window:${segments.length}`);
    limitations.push("historical defects split the window; only the current segment is analysed");
  }

  // ---- detector runs ONLY on the current admissible segment.
  if (seg.bars.length < PATTERN_DETECTOR_MIN_BARS) {
    limitations.push(
      `current admissible segment holds ${seg.bars.length} bars, fewer than the detector minimum ` +
      `of ${PATTERN_DETECTOR_MIN_BARS}; no pattern geometry is asserted`,
    );
    observations.push(state("pattern_context_state", "insufficient_segment_history", iso(asOf)));
    return baseEnvelope("insufficient_data", healthStatus, "unknown", "context_only");
  }

  const candles: OHLCVCandle[] = seg.bars.map((b) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
  }));
  const contexts = normalizePatternContexts(detectPatterns(candles));

  observations.push(
    state("pattern_context_state", "evaluated", iso(asOf)),
    num("pattern_count", contexts.length, iso(asOf), "patterns"),
    num("bullish_geometry_count", contexts.filter((c) => c.orientation === "bullish").length, iso(asOf), "patterns"),
    num("bearish_geometry_count", contexts.filter((c) => c.orientation === "bearish").length, iso(asOf), "patterns"),
    num("detector_input_bars", candles.length, iso(asOf), "bars"),
  );

  contexts.forEach((c, i) => {
    const p = `pattern_${pad2(i + 1)}`;
    observations.push(state(`${p}_name`, c.name, iso(asOf)));
    observations.push(state(`${p}_orientation`, c.orientation, iso(asOf)));
    if (c.neckline !== undefined) observations.push(num(`${p}_neckline`, c.neckline, iso(asOf)));
    if (c.support !== undefined) observations.push(num(`${p}_support`, c.support, iso(asOf)));
    if (c.resistance !== undefined) observations.push(num(`${p}_resistance`, c.resistance, iso(asOf)));
    (c.peaks ?? []).forEach((v, j) => observations.push(num(`${p}_peak_${pad2(j + 1)}`, v, iso(asOf))));
    (c.troughs ?? []).forEach((v, j) => observations.push(num(`${p}_trough_${pad2(j + 1)}`, v, iso(asOf))));
  });

  if (contexts.length === 0) {
    limitations.push("no chart-geometry pattern met the detector's deterministic criteria");
  }

  // Zero patterns is a VALID contextual result, not a plumbing failure.
  return baseEnvelope("supported", healthStatus, "neutral", "context_only");
}
