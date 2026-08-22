/**
 * RON — OPPORTUNITY CONTEXT spec V1 (pure producer).
 *
 * Implementation marker `GAINEDGE_RON_OPPORTUNITY_CONTEXT_V1`.
 *
 * PURPOSE
 * Combine ALREADY-ACCEPTED evidence (HA Pattern Context V1 plus optional sealed Session
 * V3 / Pattern V3 / Cross-Asset V3 / Macro V2 envelopes) into a transparent, ordered
 * OPPORTUNITY LIFECYCLE with an explicit direction context, an explicit setup family, an
 * explicit data-health state and a full reason-token trail.
 *
 * WHAT THIS MODULE IS NOT
 *   - not a probability, confidence, score, odds, edge, expected value or forecast,
 *   - not a BUY/SELL recommendation, entry, stop, target or order geometry,
 *   - not a causal claim,
 *   - not an execution path (`execution_allowed=false`, `execution_path=signal_only`),
 *   - not a registered RON agent: it emits a PURE typed intermediate, never an
 *     EvidenceEnvelope with a new registry agent id,
 *   - not persisted, not scheduled, not wired into any orchestration run version,
 *   - not a mutation of ANY frozen artifact (RON V1-V8, HA V1, Falconer, specialists).
 *
 * PURITY
 * No DB, no network, no wall clock, no randomness. Every output is a deterministic
 * function of the explicit inputs.
 *
 * AUTHORITY MODEL (explicit, never implicit)
 *   1. Session Structure V3      — AUTHORITATIVE structure input.
 *   2. HA Pattern Context V1     — deterministic descriptive pattern/context input
 *                                  (currently outside the agent registry).
 *   3. Pattern Context V3        — contextual support/disagreement ONLY.
 *   4. Cross-Asset V3            — contextual ONLY, NEVER a direction authority.
 *   5. Macro V2                  — contextual adjacency/caution ONLY, NEVER direction,
 *                                  NEVER causality.
 *   6. Calibration V2            — NOT consumed here; numeric probability stays null.
 *   7. Falconer                  — NOT consumed in lifecycle construction at all.
 *
 * ANCHOR CONVENTION (identical to Session V3 / Pattern V3 / HA V1)
 *   `evaluation_anchor` = COMPLETED 15m bar CLOSE, grid aligned, and `as_of == anchor`.
 *
 * THRESHOLD DISCIPLINE
 * No numeric threshold constant is introduced. Every decision is a comparison between
 * already-accepted categorical states. There is no hidden numeric score anywhere.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import {
  acceptSessionStructureContextV3, PATTERN_CONTEXT_SPEC_V3,
  type SessionContextResultV3,
} from "./ron-pattern-structure-context-v3.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V3,
} from "./ron-cross-asset-relationship-context-v3.ts";
import { MACRO_NEWS_SPEC_V2 } from "./ron-macro-temporal-context-v2.ts";
import {
  HA_PATTERN_CONTEXT_SPEC_V1, type HaPatternContextResultV1,
} from "./ron-ha-pattern-context-spec-v1.ts";

/* ------------------------------------------------------------------- spec */

export const OPPORTUNITY_CONTEXT_SPEC_V1 = {
  spec_id: "ron_opportunity_context",
  spec_version: 1,
  /** Deliberately narrow. Widening scope is a NEW spec version, never a patch. */
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: HA_PATTERN_CONTEXT_SPEC_V1.bar_minutes,

  registry_status: {
    registered_ron_agent: false,
    emits_evidence_envelope: false,
    persisted: false,
    wired_into_orchestration_run_version: null,
    notification_channel_bound: false,
    ui_bound: false,
  },

  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    authoritative_analytical_bar_open: "evaluation_anchor_minus_one_bar_exactly",
    as_of_equals_evaluation_anchor: true,
    anchor_must_be_bar_grid_aligned: true,
    same_anchor_for_every_specialist_in_the_run: true,
    per_agent_anchor_convention: false,
    forming_bar_consumed: false,
    wall_clock_read: false,
    rejections: [
      "evaluation_anchor_not_finite",
      "evaluation_anchor_not_bar_close_aligned",
      "instrument_out_of_scope",
      "timeframe_out_of_scope",
      "ha_context_anchor_mismatch",
      "ha_context_scope_mismatch",
      "ha_context_spec_mismatch",
    ],
  },

  authority_model: {
    session_structure_v3: "authoritative_structure_input",
    ha_pattern_context_v1: "descriptive_pattern_context_input_outside_registry",
    pattern_context_v3: "contextual_support_or_disagreement_only",
    cross_asset_v3: "contextual_only_never_direction_authority",
    macro_v2: "contextual_adjacency_and_caution_only_never_direction_never_causality",
    calibration_v2: "not_consumed_numeric_probability_unavailable",
    falconer_signal_source: "not_consumed_in_lifecycle_construction",
  },

  /** Every emitted family with its full CLOSED vocabulary. Nothing else may be emitted. */
  vocabularies: {
    direction_context: ["bullish", "bearish", "neutral", "mixed", "unavailable"],
    direction_authority: [
      "session_aligned", "session_event_relevant", "ha_only_contextual",
      "conflicted", "none",
    ],
    setup_family: [
      "ha_trend_continuation", "ha_transition_with_ema",
      "compression_expansion_structure", "momentum_reconfirmation", "mixed_or_none",
    ],
    lifecycle: [
      "none", "watch", "forming", "strengthening", "confirmed", "weakening", "invalidated",
    ],
    material_change_type: [
      "none", "new_forming", "strengthened", "confirmed", "weakened", "invalidated",
      "direction_reversal", "data_blocked",
    ],
    data_state: ["healthy", "degraded", "blocked", "unavailable"],
    pattern_context_state: ["supportive", "disagreeing", "neutral", "unavailable"],
    cross_asset_context_state: ["supportive", "disagreeing", "neutral", "unavailable"],
    macro_context_state: ["relevant", "neutral", "unavailable"],
  },

  /** Exact ordered rule tables. FIRST MATCH WINS in every table. */
  rules: {
    data_state: [
      "D1 blocked: a supplied context envelope is INADMISSIBLE under its own contract, " +
      "or an admissible envelope reports data_health.status == 'critical' or status == 'blocked'",
      "D2 unavailable: the HA context lifecycle is 'unavailable' (no admissible HA geometry)",
      "D3 degraded: an admissible supplied envelope reports data_health.status == 'degraded'",
      "D4 healthy: otherwise",
      "a data defect is NEVER reported as market invalidation",
    ],
    direction_context: [
      "reference direction = the HA trend_sequence direction (bullish|bearish only)",
      "X1 unavailable: data_state in ('blocked','unavailable'), or HA trend_sequence == 'insufficient'",
      "X2 neutral: HA trend_sequence in ('neutral','alternating') -> direction_authority 'none'",
      "X3 mixed: sealed Session V3 admissible AND its structure_state OPPOSES the HA " +
      "direction (up_structure vs bearish, down_structure vs bullish) -> authority 'conflicted'",
      "X4 <ha direction>: sealed Session V3 admissible AND structure_state ALIGNS " +
      "(up_structure with bullish, down_structure with bearish) -> authority 'session_aligned'",
      "X5 <ha direction>: sealed Session V3 admissible, structure not directional, and the " +
      "OBSERVED structure_event does not contradict the HA direction and is not 'none' " +
      "(break_up/sweep_low with bullish, break_down/sweep_high with bearish) -> authority " +
      "'session_event_relevant'",
      "X6 <ha direction>: otherwise (Session absent, inadmissible, or non-directional) -> " +
      "authority 'ha_only_contextual', which CAPS the lifecycle below 'confirmed'",
      "direction is NEVER derived from Cross-Asset, Macro or Falconer evidence",
    ],
    setup_family: [
      "every non-'mixed_or_none' family requires at least TWO independent evidence families",
      "S1 mixed_or_none: direction_context not in ('bullish','bearish')",
      "S2 ha_trend_continuation: HA run_length >= 2 AND (matching EMA alignment OR " +
      "momentum_confirmation == 'agreement' OR structure_relevance == 'with_structure')",
      "S3 ha_transition_with_ema: HA colour_transition is the directional flip INTO the " +
      "direction AND ema_relationship is the matching alignment or matching cross_forming",
      "S4 momentum_reconfirmation: momentum_confirmation == 'agreement' AND " +
      "ema_relationship is the matching alignment",
      "S5 compression_expansion_structure: compression_expansion in " +
      "('compressed','expanding') AND structure_relevance in ('with_structure','at_relevant_level')",
      "S6 mixed_or_none: otherwise",
      "a single indicator event on its own can NEVER produce a setup family",
    ],
    lifecycle: [
      "R0 none (data): data_state in ('blocked','unavailable') -> lifecycle 'none'; this is " +
      "explicitly NOT market invalidation",
      "R0b invalidated: prior_state in ('forming','strengthening','confirmed','weakening') " +
      "AND prior_direction_context is directional AND either " +
      "(a) HA colour_transition flips AGAINST the prior direction and additionally either " +
      "authoritative Session structure conflicts with the prior direction or the EMA " +
      "relationship flipped against the prior direction, or " +
      "(b) authoritative Session structure_state opposes the prior direction",
      "R1 confirmed: direction directional AND direction_authority in ('session_aligned'," +
      "'session_event_relevant') AND setup_family != 'mixed_or_none' AND HA lifecycle == " +
      "'confirmed' AND momentum_confirmation == 'agreement' AND ema_relationship is the " +
      "matching alignment AND structure_relevance != 'against_structure' AND " +
      "pattern_context_state != 'disagreeing' AND cross_asset_context_state != 'disagreeing' " +
      "AND data_state == 'healthy'. Macro can NEVER promote to confirmed",
      "R3 weakening (evaluated before strengthening: deterioration dominates): direction " +
      "directional AND an opportunity exists (setup_family != 'mixed_or_none' OR prior_state " +
      "in ('forming','strengthening','confirmed')) AND any of: HA lifecycle == 'weakening'; " +
      "body_dynamics == 'contracting' AND momentum_confirmation == 'weakening'; " +
      "opposing_wick_emergence in ('emerging','persisting') AND ema_relationship in " +
      "('convergence','mixed'); structure_relevance == 'against_structure'",
      "R2 strengthening: direction directional AND setup_family != 'mixed_or_none' AND HA " +
      "lifecycle in ('strengthening','confirmed') AND structure_relevance != " +
      "'against_structure' AND either (body_dynamics == 'expanding' AND " +
      "opposing_wick_emergence in ('none','insufficient')) or (momentum_confirmation == " +
      "'agreement' AND ema_relationship is the matching alignment)",
      "R4 forming: direction directional AND setup_family != 'mixed_or_none' AND at least " +
      "one INDEPENDENT confirming family is present (matching EMA alignment or matching " +
      "cross_forming, OR momentum_confirmation == 'agreement', OR structure_relevance in " +
      "('with_structure','at_relevant_level'))",
      "R5 watch: direction directional AND setup_family != 'mixed_or_none' but no " +
      "independent confirming family is present yet",
      "R6 none: otherwise (a lone HA colour flip or a lone EMA cross always lands here)",
      "no hidden numeric score is used at any point",
    ],
    material_change_type: [
      "compares the SUPPLIED prior_state / prior_direction_context with the CURRENT " +
      "lifecycle and direction_context; nothing is persisted and no alert is emitted",
      "M1 data_blocked: data_state in ('blocked','unavailable')",
      "M2 invalidated: lifecycle == 'invalidated' AND prior_state != 'invalidated'",
      "M3 direction_reversal: prior_direction_context and direction_context are both " +
      "directional and OPPOSITE",
      "M4 confirmed: lifecycle == 'confirmed' AND prior_state != 'confirmed'",
      "M5 weakened: lifecycle == 'weakening' AND prior_state in " +
      "('forming','strengthening','confirmed')",
      "M6 strengthened: lifecycle == 'strengthening' AND prior_state in " +
      "(absent,'none','watch','forming')",
      "M7 new_forming: lifecycle in ('watch','forming') AND prior_state in " +
      "(absent,'none','invalidated')",
      "M8 none: otherwise",
    ],
    context_states: [
      "pattern_context_state: unavailable when no admissible sealed Pattern V3 envelope; " +
      "otherwise supportive when at least one emitted pattern orientation matches the " +
      "direction and none opposes it, disagreeing when at least one opposes and none " +
      "matches, neutral in every other case (including no emitted pattern geometry)",
      "cross_asset_context_state: unavailable when no admissible sealed Cross-Asset V3 " +
      "envelope or its observed cross_asset_relationship_state is 'blocked'/" +
      "'context_unavailable'; otherwise NEUTRAL. The frozen Cross-Asset evidence exposes NO " +
      "direction-relative supportive/disagreeing state, so none is invented and Cross-Asset " +
      "can never create direction nor promote a lifecycle",
      "macro_context_state: unavailable when no admissible sealed Macro V2 envelope or its " +
      "observed macro_temporal_context_state is the unsupported-base state; 'relevant' when " +
      "observed price context is present; 'neutral' otherwise. Adjacency is NOT causality",
    ],
  },

  reuse_contract: {
    ha_context_spec_id: HA_PATTERN_CONTEXT_SPEC_V1.spec_id,
    ha_context_spec_version: HA_PATTERN_CONTEXT_SPEC_V1.spec_version,
    ha_states_consumed: [
      "trend_sequence", "run_length", "body_dynamics", "wick_character",
      "opposing_wick_emergence", "colour_transition", "compression_expansion",
      "ema_relationship", "momentum_confirmation", "structure_relevance", "lifecycle",
    ],
    sealed_evidence_consumed: [
      "session_market_structure_v3.structure_state",
      "session_market_structure_v3.structure_event",
      "pattern_context_v3.pattern_NN_orientation",
      "cross_asset_correlation_v3.cross_asset_relationship_state",
      "macro_news_geopolitics_v2.macro_temporal_context_state",
    ],
    authority_fields_recomputed: false,
    new_numeric_thresholds_introduced: 0,
  },

  safety_contract: {
    emits_probability: false,
    emits_confidence: false,
    emits_score: false,
    emits_odds: false,
    emits_expected_value: false,
    emits_forecast: false,
    emits_recommendation: false,
    emits_entry_stop_target_or_order_geometry: false,
    emits_causal_claim: false,
    execution_allowed: false,
    execution_path: "signal_only",
    persists: false,
    reads_database: false,
    reads_network: false,
    reads_wall_clock: false,
    deterministic: true,
    hash_pinned: true,
  },
} as const;

export function opportunityContextSpecHashV1(): Promise<string> {
  return hashCanonical(OPPORTUNITY_CONTEXT_SPEC_V1);
}

/* -------------------------------------------------------------- primitives */

const BAR_MS = OPPORTUNITY_CONTEXT_SPEC_V1.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

export type OpportunityDirection =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.direction_context[number];
export type OpportunityDirectionAuthority =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.direction_authority[number];
export type OpportunitySetupFamily =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.setup_family[number];
export type OpportunityLifecycle =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.lifecycle[number];
export type OpportunityMaterialChange =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.material_change_type[number];
export type OpportunityDataState =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.data_state[number];
export type PatternContextState =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.pattern_context_state[number];
export type CrossAssetContextState =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.cross_asset_context_state[number];
export type MacroContextState =
  typeof OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies.macro_context_state[number];

export type OpportunityContextRejection =
  | "evaluation_anchor_not_finite"
  | "evaluation_anchor_not_bar_close_aligned"
  | "instrument_out_of_scope"
  | "timeframe_out_of_scope"
  | "ha_context_anchor_mismatch"
  | "ha_context_scope_mismatch"
  | "ha_context_spec_mismatch";

export class OpportunityContextAnchorError extends Error {
  override readonly name = "OpportunityContextAnchorError";
  constructor(readonly reason: OpportunityContextRejection, readonly detail?: string) {
    super(`opportunity_context_v1_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ inputs */

export interface OpportunityContextInputV1 {
  instrument: string;
  timeframe: string;
  /** COMPLETED bar CLOSE, epoch ms, grid aligned. */
  evaluation_anchor: number;
  /** REQUIRED accepted HA Pattern Context V1 result at the SAME anchor. */
  ha_context: HaPatternContextResultV1;
  /** OPTIONAL sealed Session Structure V3 envelope at the SAME anchor (authoritative). */
  session_evidence?: unknown;
  /** OPTIONAL sealed Pattern Context V3 envelope at the SAME anchor (contextual). */
  pattern_evidence?: unknown;
  /** OPTIONAL sealed Cross-Asset Relationship V3 envelope at the SAME anchor (contextual). */
  cross_asset_evidence?: unknown;
  /** OPTIONAL sealed Macro V2 envelope at or before the anchor (contextual only). */
  macro_evidence?: unknown;
  /** Opportunity lifecycle observed at the PREVIOUS anchor, if any. */
  prior_state?: OpportunityLifecycle | null;
  /** Direction context observed at the PREVIOUS anchor, if any. */
  prior_direction_context?: OpportunityDirection | null;
  /** EMA relationship observed at the PREVIOUS anchor, if any (invalidation input). */
  prior_ema_relationship?: string | null;
  trace_id: string;
  run_id: string;
}

/* ------------------------------------------------------------------ output */

export interface OpportunityContextResultV1 {
  spec_id: string;
  spec_version: number;
  spec_hash: string;
  instrument: string;
  timeframe: string;
  trace_id: string;
  run_id: string;
  /** Equal to the evaluation anchor by contract. */
  as_of: string;
  evaluation_anchor: string;
  analytical_bar_open: string;
  direction_context: OpportunityDirection;
  direction_authority: OpportunityDirectionAuthority;
  setup_family: OpportunitySetupFamily;
  lifecycle: OpportunityLifecycle;
  material_change_type: OpportunityMaterialChange;
  data_state: OpportunityDataState;
  data_blocked: boolean;
  pattern_context_state: PatternContextState;
  cross_asset_context_state: CrossAssetContextState;
  macro_context_state: MacroContextState;
  context_admissibility: Record<string, { available: boolean; rejection_reason: string | null }>;
  reason_tokens: string[];
  observations: Observation[];
  limitations: string[];
  execution_allowed: false;
  execution_path: "signal_only";
  numeric_probability: null;
}

/* ------------------------------------------ generic sealed-envelope acceptance */

export type EnvelopeRejection =
  | "context_absent"
  | "context_malformed_envelope"
  | "context_wrong_agent"
  | "context_unsealed"
  | "context_hash_mismatch"
  | "context_trace_mismatch"
  | "context_instrument_mismatch"
  | "context_timeframe_mismatch"
  | "context_anchor_mismatch";

interface AcceptedEnvelope { ok: true; envelope: EvidenceEnvelopeV1 }
interface RejectedEnvelope { ok: false; reason: EnvelopeRejection }
type EnvelopeResult = AcceptedEnvelope | RejectedEnvelope;

/**
 * Validate a sealed contextual envelope. Fails CLOSED on absence, malformation, the wrong
 * agent, a missing/mismatching seal, and any trace/instrument/timeframe/anchor mismatch.
 * Authority fields are read verbatim and are NEVER recomputed.
 */
async function acceptEnvelope(
  sealed: unknown,
  spec: { agent_id: string; agent_version: number },
  scope: {
    trace_id: string; instrument: string; timeframe: string;
    evaluation_anchor: number; anchor_mode: "equals" | "at_or_before";
  },
): Promise<EnvelopeResult> {
  if (sealed == null) return { ok: false, reason: "context_absent" };
  if (typeof sealed !== "object" || Array.isArray(sealed)) {
    return { ok: false, reason: "context_malformed_envelope" };
  }
  const e = sealed as EvidenceEnvelopeV1;
  if (e.agent_id !== spec.agent_id || e.agent_version !== spec.agent_version) {
    return { ok: false, reason: "context_wrong_agent" };
  }
  if (validateEvidence(e).length) return { ok: false, reason: "context_malformed_envelope" };
  if (typeof e.evidence_hash !== "string" || !e.evidence_hash) {
    return { ok: false, reason: "context_unsealed" };
  }
  if (await evidenceHash(e) !== e.evidence_hash) {
    return { ok: false, reason: "context_hash_mismatch" };
  }
  if (e.trace_id !== scope.trace_id) return { ok: false, reason: "context_trace_mismatch" };
  if (e.instrument !== scope.instrument) {
    return { ok: false, reason: "context_instrument_mismatch" };
  }
  if (e.timeframe !== scope.timeframe) {
    return { ok: false, reason: "context_timeframe_mismatch" };
  }
  const asOf = Date.parse(e.as_of);
  if (!Number.isFinite(asOf)) return { ok: false, reason: "context_malformed_envelope" };
  const anchorOk = scope.anchor_mode === "equals"
    ? asOf === scope.evaluation_anchor
    : asOf <= scope.evaluation_anchor;
  if (!anchorOk) return { ok: false, reason: "context_anchor_mismatch" };
  return { ok: true, envelope: e };
}

const obsText = (e: EvidenceEnvelopeV1, key: string): string | null => {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length !== 1) return null;
  return typeof all[0].value_text === "string" ? all[0].value_text : null;
};

/* ---------------------------------------------------------------- producer */

export async function buildOpportunityContextV1(
  input: OpportunityContextInputV1,
): Promise<OpportunityContextResultV1> {
  const anchor = input.evaluation_anchor;
  if (typeof anchor !== "number" || !Number.isFinite(anchor)) {
    throw new OpportunityContextAnchorError("evaluation_anchor_not_finite");
  }
  if (anchor % BAR_MS !== 0) {
    throw new OpportunityContextAnchorError(
      "evaluation_anchor_not_bar_close_aligned", iso(anchor));
  }
  if (!(OPPORTUNITY_CONTEXT_SPEC_V1.instrument_scope as readonly string[])
    .includes(input.instrument)) {
    throw new OpportunityContextAnchorError("instrument_out_of_scope", input.instrument);
  }
  if (!(OPPORTUNITY_CONTEXT_SPEC_V1.timeframe_scope as readonly string[])
    .includes(input.timeframe)) {
    throw new OpportunityContextAnchorError("timeframe_out_of_scope", input.timeframe);
  }

  const ha = input.ha_context;
  if (!ha || typeof ha !== "object" || ha.spec_id !== HA_PATTERN_CONTEXT_SPEC_V1.spec_id
    || ha.spec_version !== HA_PATTERN_CONTEXT_SPEC_V1.spec_version) {
    throw new OpportunityContextAnchorError("ha_context_spec_mismatch");
  }
  if (ha.instrument !== input.instrument || ha.timeframe !== input.timeframe
    || ha.trace_id !== input.trace_id) {
    throw new OpportunityContextAnchorError("ha_context_scope_mismatch");
  }
  if (ha.evaluation_anchor !== iso(anchor) || ha.as_of !== iso(anchor)) {
    throw new OpportunityContextAnchorError("ha_context_anchor_mismatch", ha.evaluation_anchor);
  }

  const barOpen = anchor - BAR_MS;
  const at = iso(barOpen);
  const reason: string[] = [];
  const limitations: string[] = [
    "opportunity context is a DESCRIPTIVE combination of already-accepted categorical " +
    "evidence; it is not a probability, confidence, score, odds, expected value, forecast, " +
    "edge, recommendation or causal claim",
    "the evaluation anchor is a COMPLETED bar close shared by every input; the authoritative " +
    "analytical bar opens exactly one bar earlier and no forming bar is ever consumed",
    "no numeric threshold constant is introduced; every decision is an ordered comparison " +
    "of accepted categorical states with no hidden score",
    "this module is not a registered RON agent, emits no evidence envelope, persists " +
    "nothing and triggers no notification",
  ];

  /* ---- 1. contextual admissibility ------------------------------------- */
  const session: SessionContextResultV3 = await acceptSessionStructureContextV3(
    input.session_evidence ?? null,
    {
      trace_id: input.trace_id, instrument: input.instrument,
      timeframe: input.timeframe, evaluation_anchor: anchor,
    },
  );
  const patternRes = await acceptEnvelope(input.pattern_evidence ?? null, {
    agent_id: PATTERN_CONTEXT_SPEC_V3.agent_id,
    agent_version: PATTERN_CONTEXT_SPEC_V3.agent_version,
  }, {
    trace_id: input.trace_id, instrument: input.instrument, timeframe: input.timeframe,
    evaluation_anchor: anchor, anchor_mode: "equals",
  });
  const crossRes = await acceptEnvelope(input.cross_asset_evidence ?? null, {
    agent_id: CROSS_ASSET_RELATIONSHIP_SPEC_V3.agent_id,
    agent_version: CROSS_ASSET_RELATIONSHIP_SPEC_V3.agent_version,
  }, {
    trace_id: input.trace_id, instrument: input.instrument, timeframe: input.timeframe,
    evaluation_anchor: anchor, anchor_mode: "equals",
  });
  const macroRes = await acceptEnvelope(input.macro_evidence ?? null, {
    agent_id: MACRO_NEWS_SPEC_V2.agent_id,
    agent_version: MACRO_NEWS_SPEC_V2.agent_version,
  }, {
    trace_id: input.trace_id, instrument: input.instrument, timeframe: input.timeframe,
    evaluation_anchor: anchor, anchor_mode: "at_or_before",
  });

  const supplied = {
    session: input.session_evidence != null,
    pattern: input.pattern_evidence != null,
    cross_asset: input.cross_asset_evidence != null,
    macro: input.macro_evidence != null,
  };
  const context_admissibility: OpportunityContextResultV1["context_admissibility"] = {
    session_structure_v3: {
      available: session.ok,
      rejection_reason: session.ok ? null : session.reason,
    },
    pattern_context_v3: {
      available: patternRes.ok,
      rejection_reason: patternRes.ok ? null : patternRes.reason,
    },
    cross_asset_v3: {
      available: crossRes.ok,
      rejection_reason: crossRes.ok ? null : crossRes.reason,
    },
    macro_v2: {
      available: macroRes.ok,
      rejection_reason: macroRes.ok ? null : macroRes.reason,
    },
  };

  /* ---- 2. data_state ---------------------------------------------------- */
  const admissible: EvidenceEnvelopeV1[] = [];
  if (patternRes.ok) admissible.push(patternRes.envelope);
  if (crossRes.ok) admissible.push(crossRes.envelope);
  if (macroRes.ok) admissible.push(macroRes.envelope);

  const inadmissibleSupplied =
    (supplied.session && !session.ok) || (supplied.pattern && !patternRes.ok)
    || (supplied.cross_asset && !crossRes.ok) || (supplied.macro && !macroRes.ok);
  const criticalEnvelope = admissible.some(
    (e) => e.data_health?.status === "critical" || e.status === "blocked");
  const degradedEnvelope = admissible.some((e) => e.data_health?.status === "degraded");

  let data_state: OpportunityDataState;
  if (inadmissibleSupplied || criticalEnvelope) {
    data_state = "blocked";
    reason.push(inadmissibleSupplied
      ? "data_state:D1_blocked_inadmissible_supplied_context"
      : "data_state:D1_blocked_critical_source_health");
  } else if (ha.states.lifecycle === "unavailable") {
    data_state = "unavailable"; reason.push("data_state:D2_unavailable_ha_context");
  } else if (degradedEnvelope) {
    data_state = "degraded"; reason.push("data_state:D3_degraded_source_health");
  } else {
    data_state = "healthy"; reason.push("data_state:D4_healthy");
  }
  const dataBlocked = data_state === "blocked" || data_state === "unavailable";
  if (dataBlocked) {
    limitations.push(
      "the data state is not admissible for opportunity construction; this is a DATA " +
      "condition and is explicitly NOT a market invalidation",
    );
  }

  /* ---- 3. direction_context -------------------------------------------- */
  const haDirection: "bullish" | "bearish" | null =
    ha.states.trend_sequence === "bullish" || ha.states.trend_sequence === "bearish"
      ? ha.states.trend_sequence : null;
  const opposite = (d: "bullish" | "bearish") => d === "bullish" ? "bearish" : "bullish";
  const structureState = session.ok ? session.structure_state : null;
  const structureEvent = session.ok ? session.structure_event : null;
  const structureAligns = (d: "bullish" | "bearish") =>
    (structureState === "up_structure" && d === "bullish")
    || (structureState === "down_structure" && d === "bearish");
  const structureOpposes = (d: "bullish" | "bearish") =>
    (structureState === "up_structure" && d === "bearish")
    || (structureState === "down_structure" && d === "bullish");
  const eventSupports = (d: "bullish" | "bearish") =>
    d === "bullish"
      ? structureEvent === "break_up" || structureEvent === "sweep_low"
      : structureEvent === "break_down" || structureEvent === "sweep_high";

  let direction_context: OpportunityDirection;
  let direction_authority: OpportunityDirectionAuthority;
  if (dataBlocked || ha.states.trend_sequence === "insufficient") {
    direction_context = "unavailable"; direction_authority = "none";
    reason.push("direction_context:X1_unavailable");
  } else if (haDirection == null) {
    direction_context = "neutral"; direction_authority = "none";
    reason.push(`direction_context:X2_neutral_${ha.states.trend_sequence}`);
  } else if (session.ok && structureOpposes(haDirection)) {
    direction_context = "mixed"; direction_authority = "conflicted";
    reason.push(`direction_context:X3_mixed_session_conflict_${structureState}`);
  } else if (session.ok && structureAligns(haDirection)) {
    direction_context = haDirection; direction_authority = "session_aligned";
    reason.push(`direction_context:X4_${haDirection}_session_aligned`);
  } else if (session.ok && structureEvent !== "none" && eventSupports(haDirection)) {
    direction_context = haDirection; direction_authority = "session_event_relevant";
    reason.push(`direction_context:X5_${haDirection}_session_event_${structureEvent}`);
  } else {
    direction_context = haDirection; direction_authority = "ha_only_contextual";
    reason.push(`direction_context:X6_${haDirection}_ha_only_contextual`);
    limitations.push(
      "no authoritative Session Structure V3 alignment is available for this direction; " +
      "the opportunity lifecycle is capped below `confirmed`",
    );
  }
  const direction: "bullish" | "bearish" | null =
    direction_context === "bullish" || direction_context === "bearish"
      ? direction_context : null;

  /* ---- 4. contextual states -------------------------------------------- */
  let pattern_context_state: PatternContextState;
  if (!patternRes.ok) {
    pattern_context_state = "unavailable";
    reason.push(`pattern_context_state:unavailable_${patternRes.reason}`);
  } else if (direction == null) {
    pattern_context_state = "neutral";
    reason.push("pattern_context_state:neutral_no_direction");
  } else {
    const orientations = patternRes.envelope.observations
      .filter((o) => /^pattern_\d\d_orientation$/.test(o.key))
      .map((o) => o.value_text);
    const matching = orientations.filter((o) => o === direction).length;
    const opposing = orientations.filter((o) => o === opposite(direction)).length;
    if (matching > 0 && opposing === 0) {
      pattern_context_state = "supportive"; reason.push("pattern_context_state:supportive");
    } else if (opposing > 0 && matching === 0) {
      pattern_context_state = "disagreeing"; reason.push("pattern_context_state:disagreeing");
    } else {
      pattern_context_state = "neutral"; reason.push("pattern_context_state:neutral");
    }
  }

  let cross_asset_context_state: CrossAssetContextState;
  if (!crossRes.ok) {
    cross_asset_context_state = "unavailable";
    reason.push(`cross_asset_context_state:unavailable_${crossRes.reason}`);
  } else {
    const relState = obsText(crossRes.envelope, "cross_asset_relationship_state");
    if (relState === "evaluated") {
      cross_asset_context_state = "neutral";
      reason.push("cross_asset_context_state:neutral_no_direction_relative_state_exposed");
    } else {
      cross_asset_context_state = "unavailable";
      reason.push(`cross_asset_context_state:unavailable_${relState ?? "state_absent"}`);
    }
  }
  limitations.push(
    "cross-asset evidence is contextual only: it can never create a direction, can never " +
    "promote a lifecycle and asserts no causal relationship",
  );

  let macro_context_state: MacroContextState;
  if (!macroRes.ok) {
    macro_context_state = "unavailable";
    reason.push(`macro_context_state:unavailable_${macroRes.reason}`);
  } else {
    const macroState = obsText(macroRes.envelope, "macro_temporal_context_state");
    if (macroState === "observed_price_context_present") {
      macro_context_state = "relevant";
      reason.push("macro_context_state:relevant_observed_price_context_present");
    } else if (macroState == null
      || macroState === "unavailable_base_news_evidence_not_supported") {
      macro_context_state = "unavailable";
      reason.push(`macro_context_state:unavailable_${macroState ?? "state_absent"}`);
    } else {
      macro_context_state = "neutral";
      reason.push(`macro_context_state:neutral_${macroState}`);
    }
  }
  if (macro_context_state === "relevant") {
    limitations.push(
      "macro context is temporal adjacency only: it adds caution, never direction, never " +
      "a promotion to `confirmed` and never a causal claim",
    );
  }

  /* ---- 5. setup_family --------------------------------------------------- */
  const s = ha.states;
  const matchingAlignment = direction === "bullish"
    ? "bullish_alignment" : direction === "bearish" ? "bearish_alignment" : null;
  const matchingCross = direction === "bullish"
    ? "bullish_cross_forming" : direction === "bearish" ? "bearish_cross_forming" : null;
  const emaAligned = matchingAlignment != null && s.ema_relationship === matchingAlignment;
  const emaCrossForming = matchingCross != null && s.ema_relationship === matchingCross;
  const momentumAgrees = s.momentum_confirmation === "agreement";
  const flipInto = direction === "bullish"
    ? s.colour_transition === "bearish_to_bullish"
    : direction === "bearish" ? s.colour_transition === "bullish_to_bearish" : false;

  let setup_family: OpportunitySetupFamily;
  if (direction == null) {
    setup_family = "mixed_or_none"; reason.push("setup_family:S1_mixed_or_none_no_direction");
  } else if (s.run_length >= 2
    && (emaAligned || momentumAgrees || s.structure_relevance === "with_structure")) {
    setup_family = "ha_trend_continuation"; reason.push("setup_family:S2_ha_trend_continuation");
  } else if (flipInto && (emaAligned || emaCrossForming)) {
    setup_family = "ha_transition_with_ema"; reason.push("setup_family:S3_ha_transition_with_ema");
  } else if (momentumAgrees && emaAligned) {
    setup_family = "momentum_reconfirmation"; reason.push("setup_family:S4_momentum_reconfirmation");
  } else if ((s.compression_expansion === "compressed" || s.compression_expansion === "expanding")
    && (s.structure_relevance === "with_structure" || s.structure_relevance === "at_relevant_level")) {
    setup_family = "compression_expansion_structure";
    reason.push("setup_family:S5_compression_expansion_structure");
  } else {
    setup_family = "mixed_or_none"; reason.push("setup_family:S6_mixed_or_none");
  }

  /* ---- 6. lifecycle ------------------------------------------------------ */
  const priorState = input.prior_state ?? null;
  const priorDirection: "bullish" | "bearish" | null =
    input.prior_direction_context === "bullish" || input.prior_direction_context === "bearish"
      ? input.prior_direction_context : null;
  const priorOpportunity = priorState === "forming" || priorState === "strengthening"
    || priorState === "confirmed" || priorState === "weakening";
  const emaFlippedAgainstPrior = priorDirection != null && (
    s.ema_relationship === (priorDirection === "bullish"
      ? "bearish_alignment" : "bullish_alignment")
    || s.ema_relationship === (priorDirection === "bullish"
      ? "bearish_cross_forming" : "bullish_cross_forming"));
  const colourFlipAgainstPrior = priorDirection === "bullish"
    ? s.colour_transition === "bullish_to_bearish"
    : priorDirection === "bearish" ? s.colour_transition === "bearish_to_bullish" : false;
  const sessionConflictsPrior = session.ok && priorDirection != null
    && structureOpposes(priorDirection);
  const confirmingFamily = emaAligned || emaCrossForming || momentumAgrees
    || s.structure_relevance === "with_structure" || s.structure_relevance === "at_relevant_level";
  const deterioration = s.lifecycle === "weakening"
    || (s.body_dynamics === "contracting" && s.momentum_confirmation === "weakening")
    || ((s.opposing_wick_emergence === "emerging" || s.opposing_wick_emergence === "persisting")
      && (s.ema_relationship === "convergence" || s.ema_relationship === "mixed"))
    || s.structure_relevance === "against_structure";

  let lifecycle: OpportunityLifecycle;
  if (dataBlocked) {
    lifecycle = "none"; reason.push(`lifecycle:R0_none_data_${data_state}`);
  } else if (priorOpportunity && priorDirection != null
    && ((colourFlipAgainstPrior && (sessionConflictsPrior || emaFlippedAgainstPrior))
      || sessionConflictsPrior)) {
    lifecycle = "invalidated";
    reason.push(`lifecycle:R0b_invalidated_from_${priorState}_${priorDirection}`);
  } else if (direction != null
    && (direction_authority === "session_aligned"
      || direction_authority === "session_event_relevant")
    && setup_family !== "mixed_or_none"
    && s.lifecycle === "confirmed" && momentumAgrees && emaAligned
    && s.structure_relevance !== "against_structure"
    && pattern_context_state !== "disagreeing"
    && cross_asset_context_state !== "disagreeing"
    && data_state === "healthy") {
    lifecycle = "confirmed"; reason.push("lifecycle:R1_confirmed_authoritative_alignment");
  } else if (direction != null && (setup_family !== "mixed_or_none" || priorOpportunity)
    && deterioration) {
    lifecycle = "weakening"; reason.push("lifecycle:R3_weakening_deterioration_dominates");
  } else if (direction != null && setup_family !== "mixed_or_none"
    && (s.lifecycle === "strengthening" || s.lifecycle === "confirmed")
    && s.structure_relevance !== "against_structure"
    && ((s.body_dynamics === "expanding"
      && (s.opposing_wick_emergence === "none" || s.opposing_wick_emergence === "insufficient"))
      || (momentumAgrees && emaAligned))) {
    lifecycle = "strengthening"; reason.push("lifecycle:R2_strengthening_multi_family");
  } else if (direction != null && setup_family !== "mixed_or_none" && confirmingFamily) {
    lifecycle = "forming"; reason.push("lifecycle:R4_forming_independent_confirming_family");
  } else if (direction != null && setup_family !== "mixed_or_none") {
    lifecycle = "watch"; reason.push("lifecycle:R5_watch_incomplete_context");
  } else {
    lifecycle = "none"; reason.push("lifecycle:R6_none_no_admissible_multi_family_setup");
  }

  /* ---- 7. material_change_type ------------------------------------------ */
  let material_change_type: OpportunityMaterialChange;
  if (dataBlocked) {
    material_change_type = "data_blocked"; reason.push("material_change_type:M1_data_blocked");
  } else if (lifecycle === "invalidated" && priorState !== "invalidated") {
    material_change_type = "invalidated"; reason.push("material_change_type:M2_invalidated");
  } else if (priorDirection != null && direction != null && priorDirection !== direction) {
    material_change_type = "direction_reversal";
    reason.push("material_change_type:M3_direction_reversal");
  } else if (lifecycle === "confirmed" && priorState !== "confirmed") {
    material_change_type = "confirmed"; reason.push("material_change_type:M4_confirmed");
  } else if (lifecycle === "weakening" && priorOpportunity && priorState !== "weakening") {
    material_change_type = "weakened"; reason.push("material_change_type:M5_weakened");
  } else if (lifecycle === "strengthening"
    && (priorState == null || priorState === "none" || priorState === "watch"
      || priorState === "forming")) {
    material_change_type = "strengthened"; reason.push("material_change_type:M6_strengthened");
  } else if ((lifecycle === "watch" || lifecycle === "forming")
    && (priorState == null || priorState === "none" || priorState === "invalidated")) {
    material_change_type = "new_forming"; reason.push("material_change_type:M7_new_forming");
  } else {
    material_change_type = "none"; reason.push("material_change_type:M8_none");
  }

  /* ---- 8. observations --------------------------------------------------- */
  const st = (key: string, value: string): Observation =>
    ({ key, kind: "state", value_text: value, at });
  const observations: Observation[] = [
    st("opportunity_evaluation_anchor_convention", "completed_bar_close"),
    st("opportunity_analytical_bar_open_instant", at),
    st("opportunity_forming_bar_consumed", "false"),
    st("opportunity_direction_context", direction_context),
    st("opportunity_direction_authority", direction_authority),
    st("opportunity_setup_family", setup_family),
    st("opportunity_lifecycle", lifecycle),
    st("opportunity_material_change_type", material_change_type),
    st("opportunity_data_state", data_state),
    st("opportunity_pattern_context_state", pattern_context_state),
    st("opportunity_cross_asset_context_state", cross_asset_context_state),
    st("opportunity_macro_context_state", macro_context_state),
    st("opportunity_ha_lifecycle_consumed", ha.states.lifecycle),
    st("opportunity_ha_trend_sequence_consumed", ha.states.trend_sequence),
    st("opportunity_session_structure_state_consumed", structureState ?? "unavailable"),
    st("opportunity_session_structure_event_consumed", structureEvent ?? "unavailable"),
  ];
  for (const [key, value] of Object.entries(context_admissibility)) {
    observations.push(st(
      `opportunity_context_admissibility_${key}`,
      value.available ? "available" : `unavailable:${value.rejection_reason}`,
    ));
  }
  for (const token of reason) observations.push(st("opportunity_reason_token", token));

  return {
    spec_id: OPPORTUNITY_CONTEXT_SPEC_V1.spec_id,
    spec_version: OPPORTUNITY_CONTEXT_SPEC_V1.spec_version,
    spec_hash: await opportunityContextSpecHashV1(),
    instrument: input.instrument,
    timeframe: input.timeframe,
    trace_id: input.trace_id,
    run_id: input.run_id,
    as_of: iso(anchor),
    evaluation_anchor: iso(anchor),
    analytical_bar_open: at,
    direction_context,
    direction_authority,
    setup_family,
    lifecycle,
    material_change_type,
    data_state,
    data_blocked: dataBlocked,
    pattern_context_state,
    cross_asset_context_state,
    macro_context_state,
    context_admissibility,
    reason_tokens: reason,
    observations,
    limitations,
    execution_allowed: false,
    execution_path: "signal_only",
    numeric_probability: null,
  };
}
