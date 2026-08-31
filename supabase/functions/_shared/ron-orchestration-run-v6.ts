/**
 * RON orchestration run — Coordination Plan V6 (implementation marker
 * `RON_ORCHESTRATION_OPPORTUNITY_RISK_COMPATIBILITY_V6`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V5 plan. V1-V5 are imported,
 * never mutated: their plan arrays, spec objects, hashes and run-id derivations are
 * untouched and stay explicitly replayable.
 *
 * The ONLY semantic difference in V6 is that `opportunity_risk` is invoked with an
 * EXPLICIT `spec_version: 2` pin, so the READINESS gate additionally verifies the accepted
 * Session / Calibration / Pattern / Cross-Asset / Macro specialist lineages already
 * collected by V5, instead of relying on the endpoint's V1 default. The seven agents,
 * canonical order, authority model, phases, subject scope, the Session -> sealed evidence
 * -> Pattern V2 handoff and every earlier acceptance gate are inherited verbatim from V5.
 *
 * Opportunity/Risk V2 stays a READINESS GATE ONLY. It constructs no opportunity, emits no
 * probability, confidence, score, expected value or trade geometry, confers no promotion
 * and never authorises execution. Falconer remains NON-AUTHORITATIVE and is explicitly not
 * a compatibility gate. No specialist is re-run and no database is read by this module.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import {
  OPPORTUNITY_READINESS_STATES, OPPORTUNITY_RISK_SPEC_V1,
} from "./ron-opportunity-risk-spec.ts";
import {
  OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED, OPPORTUNITY_RISK_SPEC_V2,
} from "./ron-opportunity-risk-spec-v2.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import { ORCHESTRATION_RUN_PLAN_V5, ORCHESTRATION_RUN_SPEC_V5 } from "./ron-orchestration-run-v5.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V6 = 6;

/** The one agent whose specialist spec version V6 additionally pins. */
export const OPPORTUNITY_RISK_AGENT: RonAgentId = "opportunity_risk";

/** Exactly one spec_version value may ever be sent for opportunity/risk in a V6 run. */
export const OPPORTUNITY_RISK_SPEC_VERSION_V6 = 2;

/**
 * FULL accepted Opportunity/Risk Evidence Compatibility Spec V2 hash, frozen after its
 * audit correction. Any other value in returned provenance is rejected fail-closed.
 */
export const OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED =
  "66065e535c2b3580f346858684ba0f2fa2e4729d2b37f8c96235b9d37cc55656";

/** FULL accepted Opportunity/Risk Foundation Spec V1 hash (inherited base lineage). */
export const OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED = OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED;

const O_SPEC_ID = OPPORTUNITY_RISK_SPEC_V2.spec_id;

/** V2 identity lives under `spec:`; the inherited V1 identity under `base_spec:`. */
const O_SPEC_PREFIX = `spec:${O_SPEC_ID}:`;
const O_BASE_SPEC_PREFIX = `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:`;

export const opportunityRiskSpecRefV2 = (): string =>
  `${O_SPEC_PREFIX}v${OPPORTUNITY_RISK_SPEC_V2.spec_version}:${OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED}`;

export const opportunityRiskBaseSpecRefV1 = (): string =>
  `${O_BASE_SPEC_PREFIX}v${OPPORTUNITY_RISK_SPEC_V1.spec_version}:${OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED}`;

/**
 * The frozen Opportunity contract emits `direction` in {neutral, unknown} and
 * `recommendation` in {context_only, no_action} only. These sets are the accepted
 * contract, not a new rule invented here.
 */
export const OPPORTUNITY_RISK_ALLOWED_DIRECTIONS = ["neutral", "unknown"] as const;
export const OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS = ["context_only", "no_action"] as const;

/**
 * Observation-key tokens that would indicate the readiness gate had silently become an
 * opportunity builder. Checked against observation KEYS and top-level envelope keys only —
 * never against declared prose limitations, which legitimately say the words.
 */
export const OPPORTUNITY_FORBIDDEN_KEY_TOKENS = [
  "probability", "confidence", "likelihood", "score", "rating", "edge",
  "expected_value", "forecast", "entry", "stop", "invalidation", "target",
  "risk_reward", "rr_", "lot", "position_size", "order", "buy", "sell",
  "break_even", "trailing", "partial", "execution",
] as const;

/** Exact Evidence V1 top-level surface. Anything else is contract expansion. */
const ALLOWED_ENVELOPE_KEYS = new Set([
  "schema_version", "agent_id", "agent_version", "run_id", "trace_id", "instrument",
  "timeframe", "as_of", "source_timestamps", "observations", "provenance_refs",
  "data_health", "uncertainty", "conflicts", "dependencies", "status", "direction",
  "recommendation", "evidence_hash",
]);

/** V6 pins Session, Pattern, Calibration, Cross, Macro (inherited) AND Opportunity (new). */
const PIN_V6: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V5.spec_version_pins,
  opportunity_risk: OPPORTUNITY_RISK_SPEC_VERSION_V6,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V5. Only `spec_version_pin` for opportunity_risk differs.
 */
export const ORCHESTRATION_RUN_PLAN_V6: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V5.map((p) => ({
    ...p,
    spec_version_pin: PIN_V6[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V6: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V6.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V6 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V6,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V5.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V5 except "
    + "that opportunity_risk is pinned to spec_version 2 so the readiness gate verifies "
    + "the accepted specialist evidence lineages already collected in the same run; it "
    + "remains a readiness gate and constructs no opportunity, probability or geometry",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v6",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V5.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  calibration_context: ORCHESTRATION_RUN_SPEC_V5.calibration_context,
  cross_asset_context: ORCHESTRATION_RUN_SPEC_V5.cross_asset_context,
  macro_context: ORCHESTRATION_RUN_SPEC_V5.macro_context,
  /** New in V6, and the ONLY semantic delta from V5. */
  opportunity_risk_context: {
    agent_id: OPPORTUNITY_RISK_AGENT,
    requested_spec_version: OPPORTUNITY_RISK_SPEC_VERSION_V6,
    requested_exactly_once: true,
    spec_id: O_SPEC_ID,
    accepted_spec_hash: OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED,
    base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
    base_spec_hash: OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED,
    readiness_gate_only: true,
    readiness_logic_inherited_from_v1: true,
    evidence_batch_semantics_unchanged: true,
    specialists_rerun: false,
    database_queried_by_orchestration: false,
    authority_model_changed: false,
    falconer_is_compatibility_gate: false,
    falconer_is_authority: false,
    optional_lineage_confers_authority: false,
    probability_published: false,
    trade_geometry_emitted: false,
    promotion_conferred: false,
    execution_allowed: false,
    /** Frozen readiness contract, enforced generally — no single state is hardcoded. */
    admissible_readiness_states: OPPORTUNITY_READINESS_STATES,
    construction_allowed_true_only_when: "ready_for_future_construction",
    current_accepted_state_expectation: {
      note:
        "with PROMOTED_STATE_VARIABLES currently empty the accepted state is "
        + "blocked_not_calibrated; this is an observed current-state expectation, not a "
        + "contract restriction on future admissible readiness states",
    },
    temporal_contract: {
      as_of_equals_evaluation_anchor_required: true,
      anchor_from_wall_clock_allowed: false,
    },
    allowed_directions: OPPORTUNITY_RISK_ALLOWED_DIRECTIONS,
    allowed_recommendations: OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS,
  },
  spec_version_pins: {
    ...ORCHESTRATION_RUN_SPEC_V5.spec_version_pins,
    opportunity_risk: OPPORTUNITY_RISK_SPEC_VERSION_V6,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V6
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V6,
} as const;

export const orchestrationRunPlanHashV6 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V6 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V6 run identity, domain-separated from the v1..v5 run-id domains. */
export async function deriveRunIdV6(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V6.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV6(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V6) {
    out[p.agent_id] = await deriveRunIdV6(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ---------------------------------- opportunity/risk V2 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY a sealed Opportunity/Risk Evidence
 * Compatibility V2 envelope for this run.
 *
 * Rejects: absence, malformed input, wrong agent or agent_version, an unsealed envelope,
 * a hash that does not match its own content, scope/trace mismatch, an `as_of` that is not
 * exactly the explicit evaluation anchor, a missing/wrong/duplicated/extra V2 spec ref, a
 * missing/wrong/duplicated/extra inherited V1 base ref, a direction or recommendation
 * outside the frozen contract, an unknown readiness state, a `construction_allowed` value
 * that claims construction without the ready state, and any probability / confidence /
 * score / geometry / execution key surfacing on the envelope or its observations.
 *
 * Returns the verified sealed evidence hash.
 */
export async function assertOpportunityRiskV2Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["opportunity_risk_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];

  if (e.agent_id !== OPPORTUNITY_RISK_AGENT) reasons.push("opportunity_risk_wrong_agent");
  if (e.agent_version !== OPPORTUNITY_RISK_SPEC_V1.agent_version) {
    reasons.push("opportunity_risk_wrong_agent_version");
  }
  if (validateEvidence(e).length) reasons.push("opportunity_risk_invalid_envelope");
  if (!e.evidence_hash) reasons.push("opportunity_risk_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("opportunity_risk_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("opportunity_risk_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("opportunity_risk_timeframe_mismatch");

  // TEMPORAL: the Opportunity producer uses the explicit evaluation anchor verbatim as the
  // envelope `as_of`. Anything else is a different anchor and is rejected.
  const anchorMs = Date.parse(ctx.as_of);
  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(anchorMs)) reasons.push("opportunity_risk_anchor_unparseable");
  if (!Number.isFinite(atMs)) reasons.push("opportunity_risk_as_of_unparseable");
  else if (Number.isFinite(anchorMs) && atMs !== anchorMs) {
    reasons.push(atMs > anchorMs
      ? "opportunity_risk_as_of_after_evaluation_anchor"
      : "opportunity_risk_as_of_not_evaluation_anchor");
  }

  // SPEC LINEAGE: exactly one accepted V2 `spec:` ref and exactly one accepted V1
  // `base_spec:` ref, with nothing else in either namespace.
  const refs = (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");
  const specRefs = refs.filter((p) => p.startsWith(O_SPEC_PREFIX));
  const baseRefs = refs.filter((p) => p.startsWith(O_BASE_SPEC_PREFIX));
  const v2Ok = specRefs.filter((p) => p === opportunityRiskSpecRefV2());
  const v1Ok = baseRefs.filter((p) => p === opportunityRiskBaseSpecRefV1());
  if (specRefs.length !== 1) {
    reasons.push(`opportunity_risk_spec_ref_count:${specRefs.length}`);
  }
  if (v2Ok.length !== 1) {
    reasons.push(specRefs.length === 0
      ? "opportunity_risk_spec_v2_ref_missing"
      : `opportunity_risk_spec_v2_ref_invalid:${v2Ok.length}`);
  }
  if (baseRefs.length !== 1) {
    reasons.push(`opportunity_risk_base_spec_ref_count:${baseRefs.length}`);
  }
  if (v1Ok.length !== 1) {
    reasons.push(baseRefs.length === 0
      ? "opportunity_risk_base_spec_v1_ref_missing"
      : `opportunity_risk_base_spec_v1_ref_invalid:${v1Ok.length}`);
  }

  // Contextual-only semantics exactly as the frozen Opportunity contract emits them.
  if (!(OPPORTUNITY_RISK_ALLOWED_DIRECTIONS as readonly string[]).includes(String(e.direction))) {
    reasons.push("opportunity_risk_direction_not_contextual");
  }
  if (!(OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("opportunity_risk_recommendation_not_contextual");
  }

  // READINESS: validated GENERALLY against the frozen state machine. No single state is
  // hardcoded as the only admissible one.
  const observations = Array.isArray(e.observations) ? e.observations : [];
  const readinessObs = observations.filter((o) => o?.key === "readiness_state");
  const allowedStates = OPPORTUNITY_READINESS_STATES as readonly string[];
  if (readinessObs.length !== 1) {
    reasons.push(`opportunity_risk_readiness_state_count:${readinessObs.length}`);
  } else if (!allowedStates.includes(String(readinessObs[0].value_text))) {
    reasons.push("opportunity_risk_readiness_state_unknown");
  }
  const constructionObs = observations.filter((o) => o?.key === "construction_allowed");
  if (constructionObs.length !== 1) {
    reasons.push(`opportunity_risk_construction_allowed_count:${constructionObs.length}`);
  } else if (readinessObs.length === 1
    && String(readinessObs[0].value_text) !== "ready_for_future_construction"
    && String(constructionObs[0].value_text) !== "false") {
    reasons.push("opportunity_risk_construction_claimed_without_ready_state");
  }

  // NO construction surface: neither the envelope nor any observation key may carry a
  // probability, confidence, score, edge, geometry or execution field.
  for (const k of Object.keys(e as unknown as Record<string, unknown>)) {
    if (!ALLOWED_ENVELOPE_KEYS.has(k)) reasons.push(`opportunity_risk_unexpected_field:${k}`);
  }
  for (const o of observations) {
    const key = String(o?.key ?? "").toLowerCase();
    for (const tok of OPPORTUNITY_FORBIDDEN_KEY_TOKENS) {
      if (key.includes(tok)) reasons.push(`opportunity_risk_forbidden_observation:${key}`);
    }
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());

  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["opportunity_risk_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/**
 * Prove the accepted opportunity/risk envelope is the single one present in the final
 * collected seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertOpportunityRiskBinding(
  batch: EvidenceEnvelopeV1[], accepted_hash: string,
): void {
  const os = batch.filter((e) => e?.agent_id === OPPORTUNITY_RISK_AGENT);
  if (os.length !== 1) {
    throw new OrchestrationRunError([`opportunity_risk_binding_count:${os.length}`]);
  }
  if (os[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError(["opportunity_risk_binding_hash_mismatch"]);
  }
}

/* ------------------------------- V6 generic as-returned seal integrity gate */

/**
 * V6-ONLY generic integrity gate, applied to EVERY specialist response before any local
 * sealing or collection.
 *
 * It proves the envelope is ALREADY a valid sealed Evidence V1 envelope exactly as the
 * specialist returned it. Orchestration may verify a specialist seal; it must never repair
 * or mint a missing/incorrect `evidence_hash` before acceptance.
 *
 * Minimal, deliberately weaker than the specialised per-agent gates (which stay in force
 * and may impose stricter temporal/lineage semantics):
 *  - envelope exists and is a plain object
 *  - `validateEvidence` clean
 *  - non-empty `evidence_hash`
 *  - recomputed `evidenceHash(candidate) === candidate.evidence_hash`
 *  - exact agent_id / trace_id / instrument / timeframe
 *  - `as_of` parses and is not after the orchestration anchor
 *
 * Confers NO authority, reads NO observation, weights NO signal and mutates nothing.
 * Returns the ORIGINAL specialist-provided evidence hash.
 */
export async function assertSpecialistReturnedSealedV6(
  candidate: unknown, ctx: OrchestrationContext, expected_agent_id: RonAgentId,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError([`specialist_absent_or_malformed:${expected_agent_id}`]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];
  const tag = expected_agent_id;

  if (e.agent_id !== expected_agent_id) reasons.push(`specialist_wrong_agent:${tag}`);
  if (validateEvidence(e).length) reasons.push(`specialist_invalid_envelope:${tag}`);
  if (typeof e.evidence_hash !== "string" || e.evidence_hash.length === 0) {
    reasons.push(`specialist_unsealed:${tag}`);
  }
  if (e.trace_id !== ctx.trace_id) reasons.push(`specialist_trace_mismatch:${tag}`);
  if (e.instrument !== ctx.instrument) reasons.push(`specialist_instrument_mismatch:${tag}`);
  if (e.timeframe !== ctx.timeframe) reasons.push(`specialist_timeframe_mismatch:${tag}`);

  const anchorMs = Date.parse(ctx.as_of);
  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(anchorMs)) reasons.push(`specialist_anchor_unparseable:${tag}`);
  if (!Number.isFinite(atMs)) reasons.push(`specialist_as_of_unparseable:${tag}`);
  else if (Number.isFinite(anchorMs) && atMs > anchorMs) {
    reasons.push(`specialist_as_of_after_evaluation_anchor:${tag}`);
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());

  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError([`specialist_hash_mismatch:${tag}`]);
  }
  return e.evidence_hash as string;
}
