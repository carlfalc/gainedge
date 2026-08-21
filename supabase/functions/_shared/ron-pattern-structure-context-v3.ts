/**
 * RON — PATTERN + MARKET-STRUCTURE CONTEXT SPECIALIST spec V3 (pure producer).
 *
 * Implementation marker `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3`.
 *
 * FORWARD-ONLY anchor-convention adaptation of the frozen PATTERN_CONTEXT_SPEC_V2.
 * V1 and V2 stay BYTE-IDENTICAL and fully replayable: this module imports their frozen
 * producers/helpers and never mutates them.
 *
 * THE ONLY DELTA — the anchor convention, identical to Session Structure V3:
 *   V2  `as_of` = bar OPEN of the completed analytical bar.
 *   V3  `evaluation_anchor` = completed 15m bar CLOSE, and the authoritative analytical
 *       bar open is EXACTLY `evaluation_anchor - 15m`.
 *
 * ONE RON DECISION = ONE EXPLICIT EVALUATION ANCHOR. Every specialist in a V3-anchored
 * run is called with the SAME instant; no agent is silently called at a different time.
 *
 * The structural dependency is consumed from a SEALED SESSION STRUCTURE V3 envelope at the
 * SAME trace / instrument / timeframe / evaluation anchor. Structure is never recomputed
 * here, exactly as in V2, so no second structural truth is ever asserted.
 *
 * SAFETY INVARIANTS retained verbatim: descriptive compatibility only, no probability, no
 * confidence, no score, no forecast, no edge, no causal claim, `direction` neutral/unknown,
 * `recommendation` context_only/no_action, no execution path, no lookahead, no clock read.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import {
  buildPatternContextEvidenceV1, PATTERN_CONTEXT_SPEC_V1, PATTERN_CONTEXT_MAX,
  PATTERN_DETECTOR_SOURCE_SHA256,
  type PatternContextInputV1, type PatternOrientation,
} from "./ron-pattern-context-spec.ts";
import {
  levelRelationToClose, patternStructureCompatibility, PATTERN_CONTEXT_SPEC_V2,
  type PatternStructureCompatibility, type StructureEventText, type StructureStateText,
} from "./ron-pattern-structure-context-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import {
  SESSION_STRUCTURE_SPEC_V3, SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
} from "./ron-session-structure-spec-v3.ts";

export { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED };

/** FULL accepted Pattern Structure Context Spec V2 hash (inherited, never re-derived). */
export const PATTERN_CONTEXT_SPEC_V2_HASH_PINNED =
  "0c29c45b8d2bb9d24f096697ce3d64ed630fa8f8124d8de09043aa72f7448a14";

/** FULL Session Structure Spec V3 hash. Pinned by the V3 acceptance gate below. */
export const SESSION_STRUCTURE_SPEC_V3_HASH_PINNED =
  "0ea4ecd19d22d4a013f63f4fd44b4a6e89b47fe13be4cf6deed785c99252bc80";

/** Every way the sealed Session V3 dependency can fail. All fail CLOSED. */
export type SessionContextRejectionV3 =
  | "session_context_absent"
  | "session_context_malformed_envelope"
  | "session_context_wrong_agent"
  | "session_context_unsealed"
  | "session_context_hash_mismatch"
  | "session_context_trace_mismatch"
  | "session_context_instrument_mismatch"
  | "session_context_timeframe_mismatch"
  | "session_context_anchor_mismatch"
  | "session_context_not_supported"
  | "session_context_spec_provenance_mismatch"
  | "session_context_base_spec_provenance_mismatch"
  | "session_context_source_timestamp_mismatch"
  | "session_context_required_observation_conflict"
  | "session_context_structure_state_absent"
  | "session_context_structure_state_unrecognised"
  | "session_context_structure_event_absent"
  | "session_context_structure_event_unrecognised"
  | "session_context_close_observation_invalid";

/** Every way a V3 evaluation anchor can be inadmissible. All fail CLOSED. */
export type PatternV3AnchorRejection =
  | "evaluation_anchor_not_finite"
  | "evaluation_anchor_not_bar_close_aligned"
  | "source_bar_after_evaluation_anchor";

export class PatternStructureV3AnchorError extends Error {
  override readonly name = "PatternStructureV3AnchorError";
  constructor(readonly reason: PatternV3AnchorRejection, readonly detail?: string) {
    super(`pattern_structure_v3_anchor_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export const PATTERN_CONTEXT_SPEC_V3 = {
  spec_id: PATTERN_CONTEXT_SPEC_V2.spec_id,
  spec_version: 3,
  supersedes_spec_version: PATTERN_CONTEXT_SPEC_V2.spec_version,
  agent_id: PATTERN_CONTEXT_SPEC_V2.agent_id,
  agent_version: PATTERN_CONTEXT_SPEC_V2.agent_version,
  authority_class: PATTERN_CONTEXT_SPEC_V2.authority_class,
  instrument_scope: PATTERN_CONTEXT_SPEC_V2.instrument_scope,
  timeframe_scope: PATTERN_CONTEXT_SPEC_V2.timeframe_scope,
  bar_minutes: PATTERN_CONTEXT_SPEC_V2.bar_minutes,

  /** The single semantic delta from V2, declared explicitly. */
  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    authoritative_analytical_bar_open: "evaluation_anchor_minus_one_bar_exactly",
    envelope_as_of_equals_evaluation_anchor: true,
    anchor_must_be_bar_grid_aligned: true,
    same_anchor_for_every_specialist_in_the_run: true,
    per_agent_anchor_convention: false,
    forming_bar_consumed: false,
    bars_after_analytical_open_consumed: false,
    source_timestamp_after_anchor_allowed: false,
    wall_clock_read: false,
    rejections: [
      "evaluation_anchor_not_finite",
      "evaluation_anchor_not_bar_close_aligned",
      "source_bar_after_evaluation_anchor",
    ],
  },

  /** Everything else is the frozen V2 contract, inherited by construction. */
  inherits: {
    from_spec_version: PATTERN_CONTEXT_SPEC_V2.spec_version,
    from_spec_hash: PATTERN_CONTEXT_SPEC_V2_HASH_PINNED,
    geometry_contract_unchanged: true,
    detector_unchanged: true,
    detector_source_sha256: PATTERN_DETECTOR_SOURCE_SHA256,
    compatibility_vocabulary_unchanged: true,
    compatibility_mapping_reused_verbatim: true,
    reference_level_relation_unchanged: true,
    confidence_still_discarded: true,
    target_projection_still_discarded: true,
    max_emitted_patterns: PATTERN_CONTEXT_MAX,
    v2_replayable_by_spec_version_2: true,
    v1_replayable_by_spec_version_1: true,
  },

  quality_contract: PATTERN_CONTEXT_SPEC_V2.quality_contract,
  source_contract: PATTERN_CONTEXT_SPEC_V2.source_contract,
  segmentation_dependency: PATTERN_CONTEXT_SPEC_V2.segmentation_dependency,
  detector: PATTERN_CONTEXT_SPEC_V2.detector,
  emitted_reference_levels: PATTERN_CONTEXT_SPEC_V2.emitted_reference_levels,
  max_emitted_patterns: PATTERN_CONTEXT_MAX,
  lookback_bars_max: PATTERN_CONTEXT_SPEC_V2.lookback_bars_max,
  lookahead: "none",

  /** Identical dependency discipline as V2, re-pointed at the Session V3 lineage. */
  structure_context_dependency: {
    ...PATTERN_CONTEXT_SPEC_V2.structure_context_dependency,
    mode: "consume_sealed_session_v3_evidence",
    source_spec_version: SESSION_STRUCTURE_SPEC_V3.spec_version,
    source_spec_hash: SESSION_STRUCTURE_SPEC_V3_HASH_PINNED,
    source_base_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    source_base_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    accepted_spec_provenance_ref:
      `spec:${SESSION_STRUCTURE_SPEC_V3.spec_id}:v${SESSION_STRUCTURE_SPEC_V3.spec_version}:${SESSION_STRUCTURE_SPEC_V3_HASH_PINNED}`,
    accepted_base_spec_provenance_ref:
      `base_spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    requires_same_evaluation_anchor: true,
    required_source_timestamps: [
      "as_of_bar_open", "as_of_bar_completed_close", "evaluation_anchor",
    ],
    staleness_tolerance_minutes: 0,
  },

  compatibility_contract: PATTERN_CONTEXT_SPEC_V2.compatibility_contract,
  reference_level_relation_contract: PATTERN_CONTEXT_SPEC_V2.reference_level_relation_contract,

  temporal_semantics: {
    ...PATTERN_CONTEXT_SPEC_V2.temporal_semantics,
    envelope_anchor_convention: "completed_bar_close_evaluation_anchor",
    geometry_observed_up_to: "analytical_bar_open_equals_anchor_minus_one_bar",
    consumed_close_observation_timestamped_at: "analytical_bar_open",
  },

  safety_contract: PATTERN_CONTEXT_SPEC_V2.safety_contract,
} as const;

export function patternContextSpecHashV3(): Promise<string> {
  return hashCanonical(PATTERN_CONTEXT_SPEC_V3);
}

const BAR_MS = PATTERN_CONTEXT_SPEC_V3.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const pad2 = (n: number) => String(n).padStart(2, "0");

const num = (key: string, value: number, at: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), at });
const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });

const STRUCTURE_STATES: readonly string[] =
  ["up_structure", "down_structure", "mixed_or_range", "insufficient_structure"];
const STRUCTURE_EVENTS: readonly string[] =
  ["break_up", "break_down", "sweep_high", "sweep_low", "none"];

const SESSION_SPEC_PREFIX = `spec:${SESSION_STRUCTURE_SPEC_V3.spec_id}:`;
const SESSION_BASE_SPEC_PREFIX = `base_spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:`;
const SESSION_SPEC_V3_REF =
  PATTERN_CONTEXT_SPEC_V3.structure_context_dependency.accepted_spec_provenance_ref;
const SESSION_BASE_SPEC_V2_REF =
  PATTERN_CONTEXT_SPEC_V3.structure_context_dependency.accepted_base_spec_provenance_ref;

/* ------------------------------------------- sealed session V3 context adapter */

export interface AcceptedSessionContextV3 {
  ok: true;
  structure_state: StructureStateText;
  structure_event: StructureEventText;
  as_of_close: number | null;
  evaluation_anchor: number;
  analytical_bar_open: number;
  evidence_hash: string;
}
export interface RejectedSessionContextV3 {
  ok: false;
  reason: SessionContextRejectionV3;
}
export type SessionContextResultV3 = AcceptedSessionContextV3 | RejectedSessionContextV3;

/** SINGLETON accessor: duplicate or conflicting keys are never silently collapsed. */
function singleObs(e: EvidenceEnvelopeV1, key: string):
  { kind: "absent" } | { kind: "conflict" } | { kind: "one"; obs: Observation } {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length === 0) return { kind: "absent" };
  if (all.length > 1) return { kind: "conflict" };
  return { kind: "one", obs: all[0] };
}

/**
 * Validate a SEALED Session Structure V3 envelope for use as pattern structure context
 * under the SINGLE shared evaluation anchor.
 *
 * Fails closed on: absence, a malformed/invalid envelope, the wrong agent, a missing or
 * mismatching `evidence_hash`, any trace/instrument/timeframe mismatch, ANY anchor other
 * than exactly the shared evaluation anchor, a non-`supported` status, spec/base-spec
 * lineage that is not exactly the accepted Session V3 lineage, inconsistent bar-open /
 * completed-close / evaluation-anchor source instants, and a missing or unrecognised
 * structure state or structure event. Nothing is ever inferred from a rejected envelope.
 */
export async function acceptSessionStructureContextV3(
  sealed: unknown,
  scope: {
    trace_id: string; instrument: string; timeframe: string; evaluation_anchor: number;
  },
): Promise<SessionContextResultV3> {
  if (sealed == null) return { ok: false, reason: "session_context_absent" };
  if (typeof sealed !== "object" || Array.isArray(sealed)) {
    return { ok: false, reason: "session_context_malformed_envelope" };
  }
  const e = sealed as EvidenceEnvelopeV1;
  if (e.agent_id !== SESSION_STRUCTURE_SPEC_V3.agent_id
    || e.agent_version !== SESSION_STRUCTURE_SPEC_V3.agent_version) {
    return { ok: false, reason: "session_context_wrong_agent" };
  }
  if (validateEvidence(e).length) {
    return { ok: false, reason: "session_context_malformed_envelope" };
  }
  if (typeof e.evidence_hash !== "string" || !e.evidence_hash) {
    return { ok: false, reason: "session_context_unsealed" };
  }
  if (await evidenceHash(e) !== e.evidence_hash) {
    return { ok: false, reason: "session_context_hash_mismatch" };
  }
  if (e.trace_id !== scope.trace_id) return { ok: false, reason: "session_context_trace_mismatch" };
  if (e.instrument !== scope.instrument) return { ok: false, reason: "session_context_instrument_mismatch" };
  if (e.timeframe !== scope.timeframe) return { ok: false, reason: "session_context_timeframe_mismatch" };

  const anchor = scope.evaluation_anchor;
  const sessionAsOf = Date.parse(e.as_of);
  if (!Number.isFinite(sessionAsOf)) {
    return { ok: false, reason: "session_context_malformed_envelope" };
  }
  // ONE anchor for the whole run: no earlier, no later, no tolerance.
  if (sessionAsOf !== anchor) return { ok: false, reason: "session_context_anchor_mismatch" };

  if (e.status !== "supported") return { ok: false, reason: "session_context_not_supported" };

  const refs = (Array.isArray(e.provenance_refs) ? e.provenance_refs : [])
    .filter((p): p is string => typeof p === "string");
  const specRefs = refs.filter((p) => p.startsWith(SESSION_SPEC_PREFIX));
  if (specRefs.length !== 1 || specRefs[0] !== SESSION_SPEC_V3_REF) {
    return { ok: false, reason: "session_context_spec_provenance_mismatch" };
  }
  const baseRefs = refs.filter((p) => p.startsWith(SESSION_BASE_SPEC_PREFIX));
  if (baseRefs.length !== 1 || baseRefs[0] !== SESSION_BASE_SPEC_V2_REF) {
    return { ok: false, reason: "session_context_base_spec_provenance_mismatch" };
  }

  // The V3 anchor convention must be proven from the envelope's own source instants.
  const ts = e.source_timestamps ?? {};
  if (ts.evaluation_anchor !== iso(anchor)
    || ts.as_of_bar_open !== iso(anchor - BAR_MS)
    || ts.as_of_bar_completed_close !== iso(anchor)) {
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
    structure_event: evText as StructureEventText,
    as_of_close,
    evaluation_anchor: anchor,
    analytical_bar_open: anchor - BAR_MS,
    evidence_hash: e.evidence_hash,
  };
}

/* ----------------------------------------------------------------- producer */

export interface PatternStructureContextInputV3
  extends Omit<PatternContextInputV1, "as_of"> {
  /** COMPLETED 15m bar CLOSE (epoch ms). The analytical bar open is anchor - 15m. */
  evaluation_anchor: number;
  /** OPTIONAL sealed Session Structure V3 envelope at the SAME shared anchor. */
  session_evidence?: unknown;
}

/**
 * V3 producer. Geometry is produced by the FROZEN V1 detector pipeline at the
 * authoritative analytical bar open, and the V2 descriptive compatibility mapping is
 * reused verbatim. Only the envelope anchor convention and the Session V3 dependency
 * lineage differ from V2.
 */
export async function buildPatternStructureContextEvidenceV3(
  input: PatternStructureContextInputV3,
): Promise<EvidenceEnvelopeV1> {
  const anchor = input.evaluation_anchor;
  if (!Number.isFinite(anchor)) {
    throw new PatternStructureV3AnchorError("evaluation_anchor_not_finite");
  }
  if (anchor % BAR_MS !== 0) {
    throw new PatternStructureV3AnchorError(
      "evaluation_anchor_not_bar_close_aligned", iso(anchor));
  }
  if (input.newest_source_bar != null && input.newest_source_bar > anchor) {
    throw new PatternStructureV3AnchorError(
      "source_bar_after_evaluation_anchor", iso(input.newest_source_bar));
  }

  const barOpen = anchor - BAR_MS;
  const at = iso(barOpen);

  const base = await buildPatternContextEvidenceV1({
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: barOpen,
    // Defence in depth: the frozen V1 producer also filters to `time <= as_of`.
    bars: input.bars.filter((b) => b.time <= barOpen),
    isQuarantined: input.isQuarantined,
    run_id: input.run_id,
    trace_id: input.trace_id,
    newest_source_bar: input.newest_source_bar,
  });
  const spec_hash = await patternContextSpecHashV3();

  const observations: Observation[] = [...base.observations];
  const limitations: string[] = [
    ...base.uncertainty.limitations,
    "structure compatibility is a DESCRIPTIVE relationship between chart geometry and the " +
    "consumed structural state; it is not a probability, confidence, signal strength, " +
    "forecast, edge, confirmation measure, recommendation or causal claim",
    "an alignment or opposition state is NOT evidence that a chart pattern works",
    "structural context is consumed from the accepted Session Structure V3 specialist and " +
    "is never recomputed here, so no second structural truth is asserted",
    "the evaluation anchor is a COMPLETED bar close shared by every specialist in the run; " +
    "the authoritative analytical bar is the one opening exactly one bar earlier and no " +
    "forming bar is ever consumed",
  ];
  const provenance_refs: string[] = [
    `spec:${PATTERN_CONTEXT_SPEC_V3.spec_id}:v${PATTERN_CONTEXT_SPEC_V3.spec_version}:${spec_hash}`,
    `base_spec:${PATTERN_CONTEXT_SPEC_V2.spec_id}:v${PATTERN_CONTEXT_SPEC_V2.spec_version}:${PATTERN_CONTEXT_SPEC_V2_HASH_PINNED}`,
    ...base.provenance_refs.filter(
      (p) => !p.startsWith(`spec:${PATTERN_CONTEXT_SPEC_V1.spec_id}:v1:`)),
  ];
  const dependencies = [...base.dependencies];
  const source_timestamps: Record<string, string> = {
    ...base.source_timestamps,
    evaluation_anchor: iso(anchor),
    analytical_bar_open: iso(barOpen),
    analytical_bar_completed_close: iso(anchor),
  };

  const ctx = await acceptSessionStructureContextV3(input.session_evidence, {
    trace_id: input.trace_id, instrument: input.instrument,
    timeframe: input.timeframe, evaluation_anchor: anchor,
  });

  observations.push(
    state("evaluation_anchor_convention", "completed_bar_close", at),
    state("analytical_bar_open_instant", iso(barOpen), at),
    state("forming_bar_consumed", "false", at),
    state("structure_context_semantics", "current_at_evaluation_anchor", at),
    state("structure_context_source", "sealed_session_market_structure_v3_evidence", at),
  );

  if (!ctx.ok) {
    observations.push(
      state("structure_context_availability", "unavailable", at),
      state("structure_context_rejection_reason", ctx.reason, at),
      state("current_structure_state", "insufficient_structure_context", at),
      state("pattern_structure_compatibility_state", "insufficient_structure_context", at),
    );
    limitations.push(
      `no admissible sealed Session V3 structure context (${ctx.reason}); ` +
      "structure is reported unavailable and is never inferred",
    );
  } else {
    dependencies.push(`session_market_structure_evidence:${ctx.evidence_hash}`);
    provenance_refs.push(
      `structure_context:${SESSION_STRUCTURE_SPEC_V3.spec_id}:v${SESSION_STRUCTURE_SPEC_V3.spec_version}:${ctx.evidence_hash}`,
    );
    source_timestamps.structure_context_evaluation_anchor = iso(ctx.evaluation_anchor);
    source_timestamps.structure_context_analytical_bar_open = iso(ctx.analytical_bar_open);
    observations.push(
      state("structure_context_availability", "available", at),
      state("current_structure_state", ctx.structure_state, at),
      state("current_structure_event", ctx.structure_event, at),
    );
    if (ctx.as_of_close != null) {
      observations.push(num("structure_context_analytical_close", ctx.as_of_close, at));
    }
  }

  const structure: StructureStateText | null = ctx.ok ? ctx.structure_state : null;
  const close = ctx.ok ? ctx.as_of_close : null;

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
    const compat = patternStructureCompatibility(orientation as PatternOrientation, structure);
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
    observations.push(state("pattern_structure_context_state",
      count === 0
        ? "no_pattern_geometry_to_relate"
        : (ctx.ok ? "related_to_current_structure" : "insufficient_structure_context"), at));
  }

  return {
    ...base,
    as_of: iso(anchor),
    observations,
    provenance_refs,
    dependencies,
    source_timestamps,
    uncertainty: { level: "unquantified", limitations },
  };
}
