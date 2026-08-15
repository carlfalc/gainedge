/**
 * RON — PATTERN + MARKET-STRUCTURE CONTEXT SPECIALIST spec V2 (pure producer).
 *
 * FORWARD-ONLY extension of `ron-pattern-context-spec.ts` V1. V1 stays byte-frozen: its
 * spec hash (`9983d79b…`) is pinned by accepted tests and by any replayed V1 evidence.
 * This module ADDS a separately hashed spec version with the SAME `agent_id`
 * (`pattern_context`) and `agent_version` (1); only `spec_version` / spec hash in
 * `provenance_refs` distinguishes a V1 envelope from a V2 envelope.
 *
 * WHAT V2 ADDS — and nothing else:
 *   V1's deterministic chart geometry is reproduced UNCHANGED (name / orientation /
 *   reference levels; heuristic confidence and textbook target remain structurally
 *   discarded). V2 attaches a DESCRIPTIVE statement of how that geometry SITS RELATIVE TO
 *   THE CURRENT STRUCTURAL STATE, sourced from a SEALED Session & Market Structure V2
 *   evidence envelope at the SAME trace / instrument / timeframe / anchor.
 *
 * HARD CONTRACT — the compatibility state is DESCRIPTIVE ONLY. It is explicitly NOT:
 *   a probability, a confidence, a signal strength, a forecast, an edge, a confirmation
 *   score, a recommendation, a causal claim, or evidence that a pattern "works".
 *   No probability-like number or percentage is emitted anywhere. `direction` stays
 *   `neutral` / `unknown` exactly as in V1, so pattern context can never become a binding
 *   directional authority. Recommendation stays `context_only` / `no_action`.
 *
 * NO SECOND STRUCTURAL TRUTH: V2 never recomputes swings, structure state or structure
 * events. It CONSUMES the accepted Session V2 specialist's sealed output, revalidating
 * the envelope and recomputing its evidence hash, and fails closed otherwise.
 *
 * NO NEW THRESHOLD: the reference-level relationship uses EXACT ORDERING against the
 * completed analytical close only. There is no tolerance, distance bucket or band.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import {
  buildPatternContextEvidenceV1, PATTERN_CONTEXT_SPEC_V1, PATTERN_CONTEXT_MAX,
  PATTERN_DETECTOR_SOURCE_SHA256, SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
  type PatternContextInputV1, type PatternOrientation,
} from "./ron-pattern-context-spec.ts";

export { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED };

/** Structure states as defined by the ACCEPTED Session V2 spec. Nothing new is coined. */
export type StructureStateText =
  | "up_structure" | "down_structure" | "mixed_or_range" | "insufficient_structure";

/** Structure events as defined by the ACCEPTED Session V2 spec. Nothing new is coined. */
export type StructureEventText =
  | "break_up" | "break_down" | "sweep_high" | "sweep_low" | "none";

/** Finite DESCRIPTIVE compatibility vocabulary. Never a score and never ordered. */
export type PatternStructureCompatibility =
  | "aligned_with_current_structure"
  | "opposed_to_current_structure"
  | "mixed_or_not_directional"
  | "insufficient_structure_context";

/** Every way the sealed session dependency can fail. All fail CLOSED. */
export type SessionContextRejection =
  | "session_context_absent"
  | "session_context_malformed_envelope"
  | "session_context_wrong_agent"
  | "session_context_unsealed"
  | "session_context_hash_mismatch"
  | "session_context_trace_mismatch"
  | "session_context_instrument_mismatch"
  | "session_context_timeframe_mismatch"
  | "session_context_after_pattern_anchor"
  | "session_context_anchor_mismatch"
  | "session_context_not_supported"
  | "session_context_spec_provenance_mismatch"
  | "session_context_source_timestamp_mismatch"
  | "session_context_required_observation_conflict"
  | "session_context_structure_state_absent"
  | "session_context_structure_state_unrecognised"
  | "session_context_structure_event_absent"
  | "session_context_structure_event_unrecognised"
  | "session_context_close_observation_invalid";

export const PATTERN_CONTEXT_SPEC_V2 = {
  spec_id: "ron_pattern_context",
  spec_version: 2,
  supersedes_spec_version: 1,
  agent_id: "pattern_context",
  agent_version: 1,
  authority_class: "contextual",

  instrument_scope: PATTERN_CONTEXT_SPEC_V1.instrument_scope,
  timeframe_scope: PATTERN_CONTEXT_SPEC_V1.timeframe_scope,
  /** DERIVED from V1, never redeclared, so V2 cannot drift from its geometry source. */
  bar_minutes: PATTERN_CONTEXT_SPEC_V1.bar_minutes,

  inherits: {
    from_spec_version: 1,
    geometry_contract_unchanged: true,
    detector_unchanged: true,
    detector_source_sha256: PATTERN_DETECTOR_SOURCE_SHA256,
    confidence_still_discarded: true,
    target_projection_still_discarded: true,
    bar_indices_still_discarded: true,
    max_emitted_patterns: PATTERN_CONTEXT_MAX,
    v1_replayable_by_spec_version_1: true,
  },

  quality_contract: PATTERN_CONTEXT_SPEC_V1.quality_contract,
  source_contract: PATTERN_CONTEXT_SPEC_V1.source_contract,
  segmentation_dependency: PATTERN_CONTEXT_SPEC_V1.segmentation_dependency,
  detector: PATTERN_CONTEXT_SPEC_V1.detector,
  emitted_reference_levels: PATTERN_CONTEXT_SPEC_V1.emitted_reference_levels,
  max_emitted_patterns: PATTERN_CONTEXT_MAX,
  lookback_bars_max: PATTERN_CONTEXT_SPEC_V1.lookback_bars_max,
  lookahead: "none",

  /**
   * Structure context is CONSUMED from the accepted Session V2 specialist, never
   * recomputed here. A second, independently derived structural truth is forbidden.
   */
  structure_context_dependency: {
    mode: "consume_sealed_session_v2_evidence",
    recomputes_structure_independently: false,
    recomputes_swings: false,
    source_agent_id: SESSION_STRUCTURE_SPEC_V2.agent_id,
    source_agent_version: SESSION_STRUCTURE_SPEC_V2.agent_version,
    source_spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
    source_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    source_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    evidence_hash_recomputed_and_compared: true,
    requires_same_trace_id: true,
    requires_same_instrument: true,
    requires_same_timeframe: true,
    requires_same_evaluation_anchor: true,
    evidence_after_pattern_anchor_rejected: true,
    requires_exact_accepted_spec_provenance_ref: true,
    accepted_spec_provenance_ref:
      `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    requires_singleton_required_observations: true,
    required_singleton_observations: ["structure_state", "structure_event"],
    optional_singleton_observations: ["as_of_bar_close_price"],
    structure_event_inferred_when_absent: false,
    requires_matching_source_timestamps: true,
    required_source_timestamps: ["as_of_bar_open", "as_of_bar_completed_close"],
    staleness_tolerance_minutes: 0,
    staleness_tolerance_invented: false,
    optional_input: true,
    absent_or_rejected_yields: "insufficient_structure_context",
    inferred_structure_on_rejection: false,
    rejection_reasons: [
      "session_context_absent",
      "session_context_malformed_envelope",
      "session_context_wrong_agent",
      "session_context_unsealed",
      "session_context_hash_mismatch",
      "session_context_trace_mismatch",
      "session_context_instrument_mismatch",
      "session_context_timeframe_mismatch",
      "session_context_after_pattern_anchor",
      "session_context_anchor_mismatch",
      "session_context_not_supported",
      "session_context_spec_provenance_mismatch",
      "session_context_source_timestamp_mismatch",
      "session_context_required_observation_conflict",
      "session_context_structure_state_absent",
      "session_context_structure_state_unrecognised",
      "session_context_structure_event_absent",
      "session_context_structure_event_unrecognised",
      "session_context_close_observation_invalid",
    ],
  },

  compatibility_contract: {
    states: [
      "aligned_with_current_structure",
      "opposed_to_current_structure",
      "mixed_or_not_directional",
      "insufficient_structure_context",
    ],
    derivation: "exact_pairing_of_pattern_orientation_with_consumed_structure_state",
    is_probability: false,
    is_a_score: false,
    is_signal_strength: false,
    is_forecast: false,
    is_an_edge: false,
    is_a_confirmation_measure: false,
    is_a_recommendation: false,
    asserts_causation: false,
    asserts_pattern_efficacy: false,
    ordered_or_rankable: false,
    numeric_encoding_emitted: false,
  },

  reference_level_relation_contract: {
    compared_against: "session_v2_as_of_bar_close_price",
    comparison: "exact_ordering_only",
    relations: ["above_close", "below_close", "equal_to_close"],
    tolerance_applied: false,
    distance_bucket_emitted: false,
    distance_emitted: false,
    new_price_levels_invented: false,
    textbook_target_invented: false,
    stop_or_entry_or_rr_emitted: false,
  },

  temporal_semantics: {
    structure_context_is: "current_at_the_evaluation_anchor",
    geometry_is: "observed_over_the_current_admissible_segment_up_to_the_anchor",
    explicit_current_vs_historical_observation: true,
    envelope_anchor_convention: "bar_open_of_the_completed_analytical_bar",
    consumed_close_observation_timestamped_at: "session_v2_bar_open_as_of",
    completed_close_instant_carried_in: "source_timestamps.structure_context_as_of_bar_completed_close",
    observation_at_after_envelope_as_of_emitted: false,
    lookahead: "none",
  },

  safety_contract: {
    ...PATTERN_CONTEXT_SPEC_V1.safety_contract,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    binding_directional_authority: false,
    persistence_in_this_phase: false,
    llm_used: false,
    external_fetch_used: false,
    allow_live_execution: false,
  },
} as const;

export function patternContextSpecHashV2(): Promise<string> {
  return hashCanonical(PATTERN_CONTEXT_SPEC_V2);
}

const BAR_MS = PATTERN_CONTEXT_SPEC_V2.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const pad2 = (n: number) => String(n).padStart(2, "0");

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });

const STRUCTURE_STATES: readonly string[] =
  ["up_structure", "down_structure", "mixed_or_range", "insufficient_structure"];
const STRUCTURE_EVENTS: readonly string[] =
  ["break_up", "break_down", "sweep_high", "sweep_low", "none"];

/* ------------------------------------------- sealed session context adapter */

export interface AcceptedSessionContext {
  ok: true;
  structure_state: StructureStateText;
  structure_event: StructureEventText;
  as_of_close: number | null;
  as_of: number;
  evidence_hash: string;
}
export interface RejectedSessionContext {
  ok: false;
  reason: SessionContextRejection;
}
export type SessionContextResult = AcceptedSessionContext | RejectedSessionContext;

const obsOf = (e: EvidenceEnvelopeV1, key: string) =>
  e.observations.find((o) => o.key === key);

/**
 * SINGLETON accessor. Evidence V1 does not enforce unique observation keys, so duplicate
 * or conflicting keys are rejected HERE rather than silently collapsed.
 */
function singleObs(e: EvidenceEnvelopeV1, key: string):
  { kind: "absent" } | { kind: "conflict" } | { kind: "one"; obs: Observation } {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length === 0) return { kind: "absent" };
  if (all.length > 1) return { kind: "conflict" };
  return { kind: "one", obs: all[0] };
}

const ACCEPTED_SESSION_SPEC_PROVENANCE_PREFIX =
  `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v`;
const ACCEPTED_SESSION_SPEC_PROVENANCE_REF =
  `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`;

/**
 * Validate a SEALED Session V2 envelope for use as pattern structure context.
 *
 * Fails closed on: absence, a malformed/invalid envelope, the wrong agent, a missing or
 * mismatching `evidence_hash`, any trace/instrument/timeframe mismatch, an anchor after
 * (or simply not equal to) the pattern anchor, a non-`supported` status, and a missing or
 * unrecognised structure state. Nothing is ever inferred from a rejected envelope.
 */
export async function acceptSessionStructureContext(
  sealed: unknown,
  scope: { trace_id: string; instrument: string; timeframe: string; as_of: number },
): Promise<SessionContextResult> {
  if (sealed == null) return { ok: false, reason: "session_context_absent" };
  if (typeof sealed !== "object" || Array.isArray(sealed)) {
    return { ok: false, reason: "session_context_malformed_envelope" };
  }
  const e = sealed as EvidenceEnvelopeV1;
  if (e.agent_id !== SESSION_STRUCTURE_SPEC_V2.agent_id
    || e.agent_version !== SESSION_STRUCTURE_SPEC_V2.agent_version) {
    return { ok: false, reason: "session_context_wrong_agent" };
  }
  if (validateEvidence(e).length) return { ok: false, reason: "session_context_malformed_envelope" };
  if (typeof e.evidence_hash !== "string" || !e.evidence_hash) {
    return { ok: false, reason: "session_context_unsealed" };
  }
  if (await evidenceHash(e) !== e.evidence_hash) {
    return { ok: false, reason: "session_context_hash_mismatch" };
  }
  if (e.trace_id !== scope.trace_id) return { ok: false, reason: "session_context_trace_mismatch" };
  if (e.instrument !== scope.instrument) return { ok: false, reason: "session_context_instrument_mismatch" };
  if (e.timeframe !== scope.timeframe) return { ok: false, reason: "session_context_timeframe_mismatch" };

  const sessionAsOf = Date.parse(e.as_of);
  if (!Number.isFinite(sessionAsOf)) return { ok: false, reason: "session_context_malformed_envelope" };
  // Evidence describing a LATER bar than the pattern anchor would be lookahead.
  if (sessionAsOf > scope.as_of) return { ok: false, reason: "session_context_after_pattern_anchor" };
  // Anything earlier is stale for a "current structure" claim. There is no accepted
  // staleness tolerance, so exact equality is the only fail-closed rule available.
  if (sessionAsOf !== scope.as_of) return { ok: false, reason: "session_context_anchor_mismatch" };

  if (e.status !== "supported") return { ok: false, reason: "session_context_not_supported" };

  // EXACT accepted Session V2 spec provenance: never merely "same agent, same version".
  const specRefs = (Array.isArray(e.provenance_refs) ? e.provenance_refs : [])
    .filter((p) => typeof p === "string" && p.startsWith(ACCEPTED_SESSION_SPEC_PROVENANCE_PREFIX));
  if (specRefs.length !== 1 || specRefs[0] !== ACCEPTED_SESSION_SPEC_PROVENANCE_REF) {
    return { ok: false, reason: "session_context_spec_provenance_mismatch" };
  }

  // Bar-open / completed-close source instants must match the accepted convention exactly.
  const ts = e.source_timestamps ?? {};
  if (ts.as_of_bar_open !== iso(sessionAsOf)
    || ts.as_of_bar_completed_close !== iso(sessionAsOf + BAR_MS)) {
    return { ok: false, reason: "session_context_source_timestamp_mismatch" };
  }

  const stObs = singleObs(e, "structure_state");
  if (stObs.kind === "conflict") return { ok: false, reason: "session_context_required_observation_conflict" };
  const st = stObs.kind === "one" ? stObs.obs.value_text : undefined;
  if (typeof st !== "string" || !st) return { ok: false, reason: "session_context_structure_state_absent" };
  if (!STRUCTURE_STATES.includes(st)) {
    return { ok: false, reason: "session_context_structure_state_unrecognised" };
  }

  // A structure event is NEVER inferred: `none` must be an OBSERVED fact, not a fallback.
  const evObs = singleObs(e, "structure_event");
  if (evObs.kind === "conflict") return { ok: false, reason: "session_context_required_observation_conflict" };
  if (evObs.kind === "absent") return { ok: false, reason: "session_context_structure_event_absent" };
  const evText = evObs.obs.value_text;
  if (typeof evText !== "string" || !STRUCTURE_EVENTS.includes(evText)) {
    return { ok: false, reason: "session_context_structure_event_unrecognised" };
  }
  const structure_event = evText as StructureEventText;

  // The analytical close is OPTIONAL, but if present it must be exactly one finite number.
  const closeSingle = singleObs(e, "as_of_bar_close_price");
  if (closeSingle.kind === "conflict") {
    return { ok: false, reason: "session_context_required_observation_conflict" };
  }
  let as_of_close: number | null = null;
  if (closeSingle.kind === "one") {
    const v = closeSingle.obs.value_num;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, reason: "session_context_close_observation_invalid" };
    }
    as_of_close = v;
  }

  return {
    ok: true,
    structure_state: st as StructureStateText,
    structure_event,
    as_of_close,
    as_of: sessionAsOf,
    evidence_hash: e.evidence_hash,
  };
}

/* ------------------------------------------------ descriptive compatibility */

/**
 * PURE, TOTAL pairing of pattern orientation with the CONSUMED structure state.
 *
 * This is a vocabulary mapping, not a measurement: no value is ranked, scored, weighted
 * or converted to a number anywhere in this module.
 */
export function patternStructureCompatibility(
  orientation: PatternOrientation,
  structure: StructureStateText | null,
): PatternStructureCompatibility {
  if (structure === null || structure === "insufficient_structure") {
    return "insufficient_structure_context";
  }
  if (structure === "mixed_or_range") return "mixed_or_not_directional";
  if (structure === "up_structure") {
    return orientation === "bullish"
      ? "aligned_with_current_structure" : "opposed_to_current_structure";
  }
  return orientation === "bearish"
    ? "aligned_with_current_structure" : "opposed_to_current_structure";
}

export type LevelRelation = "above_close" | "below_close" | "equal_to_close";

/** EXACT ordering against the completed analytical close. No tolerance whatsoever. */
export function levelRelationToClose(level: number, close: number): LevelRelation {
  if (level > close) return "above_close";
  if (level < close) return "below_close";
  return "equal_to_close";
}

/* --------------------------------------------------------------- the producer */

export interface PatternStructureContextInputV2 extends PatternContextInputV1 {
  /**
   * OPTIONAL sealed Session & Market Structure V2 envelope at the SAME
   * trace/instrument/timeframe/anchor. Absent or rejected => `insufficient_structure_context`.
   */
  session_evidence?: unknown;
}

/**
 * V2 producer. Builds the frozen V1 geometry evidence first (identical semantics), then
 * attaches consumed structural context. The V1 envelope is never mutated.
 */
export async function buildPatternStructureContextEvidenceV2(
  input: PatternStructureContextInputV2,
): Promise<EvidenceEnvelopeV1> {
  const base = await buildPatternContextEvidenceV1({
    instrument: input.instrument, timeframe: input.timeframe, as_of: input.as_of,
    bars: input.bars, isQuarantined: input.isQuarantined,
    run_id: input.run_id, trace_id: input.trace_id,
    newest_source_bar: input.newest_source_bar,
  });
  const spec_hash = await patternContextSpecHashV2();
  const asOf = input.as_of;
  const at = iso(asOf);

  const observations: Observation[] = [...base.observations];
  const limitations: string[] = [
    ...base.uncertainty.limitations,
    "structure compatibility is a DESCRIPTIVE relationship between chart geometry and the " +
    "consumed structural state; it is not a probability, confidence, signal strength, " +
    "forecast, edge, confirmation measure, recommendation or causal claim",
    "an alignment or opposition state is NOT evidence that a chart pattern works",
    "structural context is consumed from the accepted Session V2 specialist and is never " +
    "recomputed here, so no second structural truth is asserted",
    "reference-level relationships use exact ordering against the completed analytical " +
    "close only; no tolerance, distance or projected level is emitted",
  ];
  const issues: string[] = [...base.data_health.issues];
  const provenance_refs: string[] = [
    `spec:${PATTERN_CONTEXT_SPEC_V2.spec_id}:v${PATTERN_CONTEXT_SPEC_V2.spec_version}:${spec_hash}`,
    ...base.provenance_refs.filter((p) => !p.startsWith(`spec:${PATTERN_CONTEXT_SPEC_V1.spec_id}:v1:`)),
  ];
  const dependencies = [...base.dependencies];
  const source_timestamps: Record<string, string> = { ...base.source_timestamps };

  const ctx = await acceptSessionStructureContext(input.session_evidence, {
    trace_id: input.trace_id, instrument: input.instrument,
    timeframe: input.timeframe, as_of: asOf,
  });

  // Current-vs-historical semantics are explicit at the evaluation anchor.
  observations.push(
    state("structure_context_semantics", "current_at_evaluation_anchor", at),
    state("structure_context_source", "sealed_session_market_structure_v2_evidence", at),
  );

  if (!ctx.ok) {
    observations.push(
      state("structure_context_availability", "unavailable", at),
      state("structure_context_rejection_reason", ctx.reason, at),
      state("current_structure_state", "insufficient_structure_context", at),
      state("pattern_structure_compatibility_state", "insufficient_structure_context", at),
    );
    limitations.push(
      `no admissible sealed Session V2 structure context (${ctx.reason}); ` +
      "structure is reported unavailable and is never inferred",
    );
  } else {
    dependencies.push(`session_market_structure_evidence:${ctx.evidence_hash}`);
    provenance_refs.push(
      `structure_context:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${ctx.evidence_hash}`,
    );
    source_timestamps.structure_context_as_of = iso(ctx.as_of);
    // The ACTUAL completed-close instant is carried as a source timestamp, never as an
    // observation timestamped after the envelope anchor.
    source_timestamps.structure_context_as_of_bar_completed_close = iso(ctx.as_of + BAR_MS);
    observations.push(
      state("structure_context_availability", "available", at),
      state("current_structure_state", ctx.structure_state, at),
      state("current_structure_event", ctx.structure_event, at),
    );
    if (ctx.as_of_close != null) {
      observations.push(num("structure_context_analytical_close", ctx.as_of_close, iso(ctx.as_of + BAR_MS)));
    }
  }

  const structure: StructureStateText | null = ctx.ok ? ctx.structure_state : null;
  const close = ctx.ok ? ctx.as_of_close : null;

  // ---- per-pattern descriptive context, in V1's canonical order, from V1's own keys.
  const count = base.observations.filter((o) => /^pattern_\d\d_orientation$/.test(o.key)).length;
  const tally: Record<PatternStructureCompatibility, number> = {
    aligned_with_current_structure: 0,
    opposed_to_current_structure: 0,
    mixed_or_not_directional: 0,
    insufficient_structure_context: 0,
  };

  for (let i = 1; i <= count; i++) {
    const p = `pattern_${pad2(i)}`;
    const orientation = base.observations.find((o) => o.key === `${p}_orientation`)?.value_text;
    if (orientation !== "bullish" && orientation !== "bearish") continue;
    const compat = patternStructureCompatibility(orientation, structure);
    tally[compat]++;
    observations.push(state(`${p}_structure_compatibility`, compat, at));

    if (close == null) continue;
    for (const level of ["neckline", "support", "resistance"] as const) {
      const v = base.observations.find((o) => o.key === `${p}_${level}`)?.value_num;
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      observations.push(state(`${p}_${level}_relation_to_close`, levelRelationToClose(v, close), at));
    }
  }

  if (base.status === "supported") {
    observations.push(
      num("patterns_aligned_with_current_structure", tally.aligned_with_current_structure, at, "patterns"),
      num("patterns_opposed_to_current_structure", tally.opposed_to_current_structure, at, "patterns"),
      num("patterns_mixed_or_not_directional", tally.mixed_or_not_directional, at, "patterns"),
      num("patterns_without_structure_context", tally.insufficient_structure_context, at, "patterns"),
    );
    if (count === 0) {
      // Zero patterns remains a VALID supported contextual result, not a failure.
      observations.push(state("pattern_structure_context_state", "no_pattern_geometry_to_relate", at));
    } else {
      observations.push(state("pattern_structure_context_state",
        ctx.ok ? "related_to_current_structure" : "insufficient_structure_context", at));
    }
  }

  return {
    ...base,
    observations,
    provenance_refs,
    dependencies,
    source_timestamps,
    uncertainty: { level: "unquantified", limitations },
    data_health: { ...base.data_health, issues },
  };
}
