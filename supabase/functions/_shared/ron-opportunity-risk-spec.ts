/**
 * RON Phase 2D.2i — OPPORTUNITY / RISK FOUNDATION spec V1 (pure producer).
 *
 * THIS IS A READINESS GATE, NOT AN OPPORTUNITY BUILDER.
 *
 * The accepted research record (Research V4) promoted ZERO state variables and the
 * accepted calibration artifact is explicitly `locked_not_calibrated_for_production`.
 * RON therefore has NO calibrated conditional probability, so it may not construct a
 * trade opportunity. This module builds the deterministic, fail-closed layer that can
 * state WHY opportunity construction is unavailable, without inventing a weak substitute.
 *
 * HARD CONTRACT — enforced by the Evidence V1 validator and by the tests:
 *   - no direction other than `neutral` / `unknown`,
 *   - no entry, zone, stop, invalidation level, target, R:R, lot, position, order,
 *     buy/sell instruction, break-even, trailing stop or partial — NOT EVEN AS NULLS,
 *     their ABSENCE is part of the contract,
 *   - no probability, confidence, likelihood, expected value, score, rating or forecast,
 *   - no causal claim, no execution intent, no persistence in this phase,
 *   - Falconer is NEVER a required authority or a readiness gate.
 *
 * Readiness (`ready_for_future_construction`) means only that the frozen PREREQUISITES
 * of a FUTURE, separately versioned construction module are satisfied. Readiness is not
 * a trade authorization and never emits geometry in V1.
 */
import {
  evidenceHash, evidenceTtlMinutes, isIsoUtc, validateEvidence, hashCanonical,
  type EvidenceEnvelopeV1, type EvidenceStatus, type Observation,
  type QualitativeDirection, type RecommendationV1, type RonAgentId,
} from "./ron-agent-contracts.ts";

/** Required, in canonical order. Both must be genuine, sealed, fresh and healthy. */
export const OPPORTUNITY_REQUIRED_AGENTS: readonly RonAgentId[] = [
  "calibration_model_validation",
  "session_market_structure",
] as const;

/** Optional contextual agents. They can NEVER satisfy a required gate. */
export const OPPORTUNITY_OPTIONAL_AGENTS: readonly RonAgentId[] = [
  "cross_asset_correlation",
  "macro_news_geopolitics",
  "pattern_context",
] as const;

/** Deterministic foundation state machine. Precedence is the declaration order. */
export const OPPORTUNITY_READINESS_STATES = [
  "blocked_contract_mismatch",
  "blocked_conflicting_evidence",
  "blocked_future_dated_evidence",
  "blocked_missing_required_evidence",
  "blocked_stale_required_evidence",
  "blocked_required_health",
  "blocked_not_calibrated",
  "ready_for_future_construction",
] as const;

export type OpportunityReadinessState = typeof OPPORTUNITY_READINESS_STATES[number];

/** The ONLY calibration facts this agent reads. It never re-scores Brier/ECE. */
export const OPPORTUNITY_CALIBRATION_FIELDS = [
  "validation_state",
  "publication_state",
  "promoted_state_variable_count",
] as const;

export const OPPORTUNITY_RISK_SPEC_V1 = {
  spec_id: "ron_opportunity_risk_foundation",
  spec_version: 1,
  agent_id: "opportunity_risk",
  agent_version: 1,
  authority_class: "opportunity_construction",
  authority_rank: 5,
  source_health_authoritative: false,
  ttl_multiplier: 1,

  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],

  input_contract: {
    mode: "sealed_evidence_envelopes_only",
    database_reads: false,
    wall_clock_reads: false,
    external_fetch: false,
    llm: false,
    broker_reads: false,
    falconer_is_authority: false,
    falconer_is_required_dependency: false,
    evaluation_anchor: "explicit_source_grounded_normally_session_as_of_bar_completed_close",
    anchor_from_wall_clock_allowed: false,
    evidence_hash_recomputed: true,
    unsealed_evidence_accepted: false,
    malformed_evidence_accepted: false,
    canonical_order: "agent_id_then_agent_version",
    identical_duplicate_policy: "dedupe",
    conflicting_duplicate_policy: "fail_closed",
    future_dated_evidence_policy: "fail_closed_never_negative_age",
    required_agents: OPPORTUNITY_REQUIRED_AGENTS,
    optional_agents: OPPORTUNITY_OPTIONAL_AGENTS,
    optional_agents_can_satisfy_required_gates: false,
    optional_agents_are_source_health_authoritative: false,
  },

  freshness_contract: {
    ttl_source: "EVIDENCE_TTL_POLICY_V1_registered_ttls",
    ttl_spoofing_allowed: false,
    age_basis: "evaluation_anchor_minus_evidence_as_of",
  },

  calibration_contract: {
    source: "accepted_calibration_model_validation_evidence_observations",
    fields_read: OPPORTUNITY_CALIBRATION_FIELDS,
    hardcoded_promotion_assumption: false,
    reinterpretation_of_brier_or_ece_allowed: false,
    required_publication_state: "approved_for_production",
    required_validation_state: "accepted_research_only",
    required_promoted_state_variable_count_minimum: 1,
    research_v4_negative_result_rescored: false,
    research_tables_queried: false,
  },

  promotion_gate: {
    promoted_state_variables_required: true,
    zero_promoted_variables_blocks_construction: true,
    gate_state_when_unpromoted: "blocked_not_calibrated",
  },

  readiness_states: OPPORTUNITY_READINESS_STATES,

  safety_contract: {
    predictive: false,
    causal: false,
    confidence_emitted: false,
    probability_emitted: false,
    expected_value_emitted: false,
    trade_geometry_emitted: false,
    trade_geometry_null_placeholders_emitted: false,
    direction_policy: "neutral_or_unknown_only",
    supported_recommendation: "context_only",
    blocked_recommendation: "no_action",
    readiness_is_not_trade_authorization: true,
    execution_allowed: false,
    execution_path: "signal_only",
    persistence_in_phase_2d2i: false,
  },
} as const;

export function opportunityRiskSpecHash(): Promise<string> {
  return hashCanonical(OPPORTUNITY_RISK_SPEC_V1);
}

/* ------------------------------------------------------------------- inputs */

export interface OpportunityRiskInputV1 {
  instrument: string;
  timeframe: string;
  /** Explicit, source-grounded UTC ISO instant. Never a wall-clock read. */
  evaluation_anchor: string;
  /** Sealed Evidence V1 envelopes produced by the accepted specialists. */
  evidence: readonly EvidenceEnvelopeV1[];
  /** Immutable promoted-state contract input (architecture constant). */
  promoted_state_variables: readonly string[];
  run_id: string;
  trace_id: string;
}

const num = (key: string, value: number, at: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), at });
const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });

const obsText = (e: EvidenceEnvelopeV1, key: string): string | null => {
  const o = e.observations.find((x) => x.key === key);
  return typeof o?.value_text === "string" ? o.value_text : null;
};
const obsNum = (e: EvidenceEnvelopeV1, key: string): number | null => {
  const o = e.observations.find((x) => x.key === key);
  return typeof o?.value_num === "number" && Number.isFinite(o.value_num) ? o.value_num : null;
};

/* ---------------------------------------------------------------- producer */

export async function buildOpportunityRiskEvidenceV1(
  input: OpportunityRiskInputV1,
): Promise<EvidenceEnvelopeV1> {
  const S = OPPORTUNITY_RISK_SPEC_V1;
  const spec_hash = await opportunityRiskSpecHash();
  const anchorMs = Date.parse(input.evaluation_anchor);
  const at = new Date(anchorMs).toISOString();

  const provenance_refs = [`spec:${S.spec_id}:v${S.spec_version}:${spec_hash}`];
  const dependencies: string[] = [];
  const issues: string[] = [];
  const conflicts: string[] = [];
  const blocking: string[] = [];
  const source_timestamps: Record<string, string> = { evaluation_anchor: at };
  const limitations: string[] = [
    "readiness assessment only: this agent cannot and does not construct a trade opportunity",
    "readiness is NOT a trade authorization; construction is a future, separately versioned phase",
    "no trade geometry, no forecast quantity and no action of any kind is emitted",
    "calibration facts are copied verbatim from the accepted calibration evidence and are never re-scored",
  ];
  const observations: Observation[] = [];

  const envelope = (
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
  ): EvidenceEnvelopeV1 => ({
    schema_version: 1,
    agent_id: "opportunity_risk",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: at,
    source_timestamps,
    observations,
    provenance_refs,
    data_health: {
      status: healthStatus,
      freshness_minutes: 0,
      completeness: 1,
      issues,
    },
    uncertainty: { level: "unquantified", limitations },
    conflicts,
    dependencies,
    status,
    direction,
    recommendation,
  });

  const fail = (
    readiness: OpportunityReadinessState, reasons: string[],
  ): EvidenceEnvelopeV1 => {
    for (const r of reasons) if (!blocking.includes(r)) blocking.push(r);
    observations.unshift(
      state("readiness_state", readiness, at),
      state("construction_allowed", "false", at),
    );
    for (const r of blocking) observations.push(state("blocking_reason", r, at));
    issues.push(...blocking);
    return envelope("blocked", "critical", "unknown", "no_action");
  };

  if (!Number.isFinite(anchorMs)) {
    return fail("blocked_contract_mismatch", ["evaluation_anchor_not_utc_iso"]);
  }
  if (!S.instrument_scope.includes(input.instrument as "XAUUSD")
    || !S.timeframe_scope.includes(input.timeframe as "15m")) {
    return fail("blocked_contract_mismatch", ["out_of_scope_instrument_or_timeframe"]);
  }

  /* ---- 1. validate + recompute hash; canonical order independent of input order. */
  const canonical = [...(input.evidence ?? [])].sort((a, b) => {
    const ai = `${a?.agent_id ?? ""}@${a?.agent_version ?? ""}`;
    const bi = `${b?.agent_id ?? ""}@${b?.agent_version ?? ""}`;
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });

  const byAgent = new Map<string, { env: EvidenceEnvelopeV1; hash: string }>();
  for (const e of canonical) {
    const errs = validateEvidence(e);
    if (errs.length) {
      return fail("blocked_contract_mismatch", [`invalid_evidence:${String(e?.agent_id ?? "unknown")}`]);
    }
    const recomputed = await evidenceHash(e);
    if (typeof e.evidence_hash !== "string" || e.evidence_hash !== recomputed) {
      return fail("blocked_contract_mismatch", [`evidence_hash_mismatch_or_unsealed:${e.agent_id}`]);
    }
    if (e.instrument !== input.instrument || e.timeframe !== input.timeframe
      || e.trace_id !== input.trace_id) {
      return fail("blocked_contract_mismatch", [`evidence_scope_mismatch:${e.agent_id}`]);
    }
    if (Date.parse(e.as_of) > anchorMs) {
      return fail("blocked_future_dated_evidence", [`evidence_after_anchor:${e.agent_id}`]);
    }
    const key = `${e.agent_id}@${e.agent_version}`;
    const seen = byAgent.get(key);
    if (seen && seen.hash !== recomputed) {
      return fail("blocked_conflicting_evidence", [`conflicting_duplicate_evidence:${e.agent_id}`]);
    }
    if (!seen) byAgent.set(key, { env: e, hash: recomputed });
  }

  const present = [...byAgent.values()].map((v) => v.env);
  const get = (id: RonAgentId) => present.find((e) => e.agent_id === id) ?? null;
  const ageOf = (e: EvidenceEnvelopeV1) => Math.round((anchorMs - Date.parse(e.as_of)) / 60_000);

  for (const e of present) {
    provenance_refs.push(`evidence:${e.agent_id}:v${e.agent_version}:${e.evidence_hash}`);
    dependencies.push(`${e.agent_id}@${e.agent_version}`);
    source_timestamps[`${e.agent_id}_as_of`] = e.as_of;
  }

  const requiredPresent = OPPORTUNITY_REQUIRED_AGENTS.filter((id) => !!get(id));
  const optionalPresent = OPPORTUNITY_OPTIONAL_AGENTS.filter((id) => !!get(id));

  observations.push(
    num("required_agents_present", requiredPresent.length, at, "agents"),
    num("required_agents_expected", OPPORTUNITY_REQUIRED_AGENTS.length, at, "agents"),
    num("optional_context_agents_present", optionalPresent.length, at, "agents"),
    num("promoted_state_variable_count", input.promoted_state_variables.length, at, "variables"),
  );
  for (const id of optionalPresent) observations.push(state("optional_context_agent", id, at));

  /* ---- 2. required presence. Optional context can never substitute. */
  const missing = OPPORTUNITY_REQUIRED_AGENTS.filter((id) => !get(id));
  if (missing.length) {
    return fail("blocked_missing_required_evidence", missing.map((m) => `missing_required_evidence:${m}`));
  }

  /* ---- 3. freshness at the explicit anchor, using the registered TTLs. */
  const stale: string[] = [];
  let freshCount = 0;
  for (const id of OPPORTUNITY_REQUIRED_AGENTS) {
    const e = get(id)!;
    const age = ageOf(e);
    const ttl = evidenceTtlMinutes(id, input.timeframe);
    observations.push(
      num(`${id}_age_minutes`, age, at, "minutes"),
      num(`${id}_ttl_minutes`, ttl, at, "minutes"),
    );
    if (age > ttl) stale.push(`stale_required_evidence:${id}`); else freshCount++;
  }
  observations.push(num("required_agents_fresh", freshCount, at, "agents"));
  if (stale.length) return fail("blocked_stale_required_evidence", stale);

  /* ---- 4. required source health. Only authoritative required agents can block here. */
  const unhealthy: string[] = [];
  for (const id of OPPORTUNITY_REQUIRED_AGENTS) {
    const e = get(id)!;
    if (e.status === "blocked" || e.data_health.status === "critical") {
      unhealthy.push(`required_evidence_unhealthy:${id}`);
    }
  }
  observations.push(state("required_health_ok", unhealthy.length ? "false" : "true", at));
  if (unhealthy.length) return fail("blocked_required_health", unhealthy);

  /* ---- 5. calibration promotion, read faithfully from the accepted calibration evidence. */
  const cal = get("calibration_model_validation")!;
  const validation_state = obsText(cal, "validation_state") ?? "unknown";
  const publication_state = obsText(cal, "publication_state") ?? "unknown";
  const calPromoted = obsNum(cal, "promoted_state_variable_count");

  observations.push(
    state("calibration_validation_state", validation_state, at),
    state("calibration_publication_state", publication_state, at),
    num("calibration_reported_promoted_state_variable_count", calPromoted ?? -1, at, "variables"),
  );

  const gate: string[] = [];
  if (input.promoted_state_variables.length < S.calibration_contract.required_promoted_state_variable_count_minimum) {
    gate.push("no_promoted_state_variables");
  }
  if (calPromoted == null || calPromoted < 1) gate.push("calibration_reports_no_promoted_state_variables");
  if (publication_state !== S.calibration_contract.required_publication_state) {
    gate.push(`calibration_publication_state_not_approved:${publication_state}`);
  }
  if (validation_state !== S.calibration_contract.required_validation_state) {
    gate.push(`calibration_validation_state_unacceptable:${validation_state}`);
  }

  if (gate.length) {
    for (const g of gate) if (!blocking.includes(g)) blocking.push(g);
    limitations.push(
      "opportunity construction is unavailable: zero state variables are promoted and the accepted " +
      "calibration artifact is not approved for production publication",
    );
    observations.unshift(
      state("readiness_state", "blocked_not_calibrated", at),
      state("construction_allowed", "false", at),
    );
    for (const g of blocking) observations.push(state("blocking_reason", g, at));
    // The READINESS ASSESSMENT itself is supported and complete; construction is not.
    return envelope("supported", "healthy", "neutral", "context_only");
  }

  observations.unshift(
    state("readiness_state", "ready_for_future_construction", at),
    state("construction_allowed", "prerequisites_satisfied_for_future_module_only", at),
  );
  limitations.push(
    "prerequisites for a FUTURE construction module are satisfied; V1 still emits no geometry, " +
    "no probability and no action",
  );
  return envelope("supported", "healthy", "neutral", "context_only");
}
