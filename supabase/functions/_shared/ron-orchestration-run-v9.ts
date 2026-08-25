/**
 * RON orchestration run — Coordination Plan V9 (implementation marker
 * `GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V8 plan. V1-V8 are imported,
 * never mutated: their plan arrays, spec objects, hashes, run-id derivations and
 * acceptance gates are untouched and stay explicitly replayable.
 *
 * THE ONLY SEMANTIC DELTA from V8:
 *   opportunity_risk           -> spec 4   (artifact-clock TTL correction)
 *   ttl_policy_version         -> 2        (artifact-clock agents exempt from market TTL)
 *
 * Every other pin is inherited verbatim (Session V3, Pattern V3, Cross-Asset V3,
 * Calibration V2, Macro V2, Falconer V1), as are the uniform-anchor contract, authority
 * hierarchy, phases, the sealed Session -> Pattern dependency, the generic V6 as-returned
 * seal proof and immutable persistence.
 *
 * WHY: `calibration_model_validation` reports on a SEALED accepted calibration artifact.
 * Its `as_of` is that artifact's immutable source instant and can never advance with
 * market time, so the market-clock TTL permanently marked it stale and blockaded every
 * unattended decision as DATA_BLOCKED. Policy v2 exempts artifact-clock evidence ONLY.
 * The artifact's own status/data_health still bind, so an unhealthy or blocked calibration
 * envelope still fails closed, and no market-clock budget was widened for any other agent.
 *
 * No probability, no trade geometry, no execution, no promotion.
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, EVIDENCE_TTL_POLICY_V2, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import {
  OPPORTUNITY_RISK_AGENT, OPPORTUNITY_RISK_ALLOWED_DIRECTIONS,
  OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS, OPPORTUNITY_FORBIDDEN_KEY_TOKENS,
} from "./ron-orchestration-run-v6.ts";
import {
  ORCHESTRATION_RUN_PLAN_V8, ORCHESTRATION_RUN_SPEC_V8, RON_ORCHESTRATION_RUN_VERSION_V8,
} from "./ron-orchestration-run-v8.ts";
import {
  OPPORTUNITY_READINESS_STATES, OPPORTUNITY_RISK_SPEC_V1,
} from "./ron-opportunity-risk-spec.ts";
import { OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED } from "./ron-opportunity-risk-spec-v2.ts";
import {
  OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED, OPPORTUNITY_RISK_SPEC_V4, opportunityRiskSpecHashV4,
} from "./ron-opportunity-risk-spec-v4.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V9 = 9;

export const OPPORTUNITY_RISK_SPEC_VERSION_V9 = 4;
export const TTL_POLICY_VERSION_V9 = EVIDENCE_TTL_POLICY_V2.policy_version;
export { OPPORTUNITY_RISK_AGENT };

const O_SPEC_PREFIX = `spec:${OPPORTUNITY_RISK_SPEC_V4.spec_id}:`;
const O_BASE_PREFIX = `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:`;

export const opportunityRiskBaseSpecRefV1 = (): string =>
  `${O_BASE_PREFIX}${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`;
export const opportunityRiskSpecRefV4 = async (): Promise<string> =>
  `${O_SPEC_PREFIX}v4:${await opportunityRiskSpecHashV4()}`;

/* ------------------------------------------------------------------- plan */

const PIN_V9: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V8.spec_version_pins,
  opportunity_risk: OPPORTUNITY_RISK_SPEC_VERSION_V9,
};

/** Same seven specialists, same canonical order. Only the opportunity_risk pin differs. */
export const ORCHESTRATION_RUN_PLAN_V9: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V8.map((p) => ({
    ...p,
    spec_version_pin: PIN_V9[p.agent_id] ?? p.spec_version_pin ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V9: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V9.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V9 = {
  ...ORCHESTRATION_RUN_SPEC_V8,
  run_version: RON_ORCHESTRATION_RUN_VERSION_V9,
  supersedes_run_version: RON_ORCHESTRATION_RUN_VERSION_V8,
  purpose:
    "unattended seven-agent collection identical to Orchestration Run V8 except that "
    + "opportunity_risk is pinned to the V4 artifact-clock TTL spec and the run is "
    + "evaluated under registered TTL policy v2, which exempts artifact-clock evidence "
    + "(the sealed calibration artifact) from the market-freshness budget only",
  run_id_domain: "ron_orch_run_v9",
  spec_version_pins: PIN_V9,

  ttl_contract: {
    ttl_policy_version: TTL_POLICY_VERSION_V9,
    supersedes_ttl_policy_version: EVIDENCE_TTL_POLICY_V2.supersedes_policy_version,
    artifact_clock_agents: EVIDENCE_TTL_POLICY_V2.artifact_clock_agents,
    market_clock_budgets_changed: false,
    health_or_status_gates_changed: false,
    future_dated_evidence_gate_changed: false,
  },

  opportunity_risk_context: {
    ...ORCHESTRATION_RUN_SPEC_V8.opportunity_risk_context,
    requested_spec_version: OPPORTUNITY_RISK_SPEC_VERSION_V9,
    spec_id: OPPORTUNITY_RISK_SPEC_V4.spec_id,
    inherited_compatibility_spec_version: 3,
    inherited_compatibility_spec_hash: OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED,
    base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
    base_spec_hash: OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED,
    readiness_gate_only: true,
  },
} as const;

export const orchestrationRunPlanHashV9 = (): Promise<string> =>
  hashCanonical({ spec: ORCHESTRATION_RUN_SPEC_V9, plan: ORCHESTRATION_RUN_PLAN_V9 });

/* ------------------------------------------------------------- run ids */

export async function deriveRunIdV9(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const h = await hashCanonical({
    domain: ORCHESTRATION_RUN_SPEC_V9.run_id_domain, trace_id, anchor_iso, agent_id,
  });
  return `${ORCHESTRATION_RUN_SPEC_V9.run_id_domain}_${h.slice(0, 32)}`;
}

export async function deriveRunIdsV9(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V9) {
    out[p.agent_id] = await deriveRunIdV9(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------------ opportunity / risk V4 acceptance gate */

const refsOf = (e: EvidenceEnvelopeV1): string[] =>
  Array.isArray(e?.provenance_refs) ? e.provenance_refs.filter((r) => typeof r === "string") : [];

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Opportunity/Risk V4 readiness
 * envelope for this run. Identical structural rules to the frozen V3 gate; only the
 * accepted spec lineage differs.
 */
export async function assertOpportunityRiskV4Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["opportunity_risk_v4_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const anchorMs = Date.parse(ctx.as_of);
  if (!Number.isFinite(anchorMs)) {
    throw new OrchestrationRunError(["opportunity_risk_v4_anchor_unparseable"]);
  }
  const reasons: string[] = [];

  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(atMs)) reasons.push("opportunity_risk_v4_as_of_unparseable");
  else if (atMs > anchorMs) reasons.push("opportunity_risk_v4_as_of_after_evaluation_anchor");
  else if (atMs !== anchorMs) reasons.push("opportunity_risk_v4_as_of_not_evaluation_anchor");

  const specRefs = refsOf(e).filter((p) => p.startsWith(`${O_SPEC_PREFIX}v4:`));
  if (specRefs.length !== 1) reasons.push(`opportunity_risk_v4_spec_ref_count:${specRefs.length}`);
  else if (specRefs[0] !== await opportunityRiskSpecRefV4()) {
    reasons.push("opportunity_risk_v4_spec_ref_invalid");
  }
  const baseRefs = refsOf(e).filter((p) => p.startsWith(O_BASE_PREFIX));
  if (baseRefs.length !== 1) {
    reasons.push(`opportunity_risk_v4_base_spec_ref_count:${baseRefs.length}`);
  } else if (baseRefs[0] !== opportunityRiskBaseSpecRefV1()) {
    reasons.push("opportunity_risk_v4_base_spec_ref_invalid");
  }
  const inherited = refsOf(e).filter(
    (p) => p.startsWith(`inherited_spec:${OPPORTUNITY_RISK_SPEC_V4.spec_id}:v3:`),
  );
  if (inherited.length !== 1
    || inherited[0] !== `inherited_spec:${OPPORTUNITY_RISK_SPEC_V4.spec_id}:v3:${OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED}`) {
    reasons.push("opportunity_risk_v4_inherited_v3_spec_ref_invalid");
  }

  if (e.agent_id !== OPPORTUNITY_RISK_AGENT) reasons.push("opportunity_risk_v4_wrong_agent");
  if (e.agent_version !== OPPORTUNITY_RISK_SPEC_V1.agent_version) {
    reasons.push("opportunity_risk_v4_wrong_agent_version");
  }
  if (validateEvidence(e).length) reasons.push("opportunity_risk_v4_invalid_envelope");
  if (!e.evidence_hash) reasons.push("opportunity_risk_v4_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("opportunity_risk_v4_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("opportunity_risk_v4_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("opportunity_risk_v4_timeframe_mismatch");

  if (!(OPPORTUNITY_RISK_ALLOWED_DIRECTIONS as readonly string[]).includes(String(e.direction))) {
    reasons.push("opportunity_risk_v4_direction_not_contextual");
  }
  if (!(OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("opportunity_risk_v4_recommendation_not_contextual");
  }

  const observations = Array.isArray(e.observations) ? e.observations : [];
  const readiness = observations.filter((o) => o?.key === "readiness_state");
  const allowedStates = OPPORTUNITY_READINESS_STATES as readonly string[];
  if (readiness.length !== 1) {
    reasons.push(`opportunity_risk_v4_readiness_state_count:${readiness.length}`);
  } else if (!allowedStates.includes(String(readiness[0].value_text))) {
    reasons.push("opportunity_risk_v4_readiness_state_unknown");
  }
  const construction = observations.filter((o) => o?.key === "construction_allowed");
  if (construction.length !== 1) {
    reasons.push(`opportunity_risk_v4_construction_allowed_count:${construction.length}`);
  } else if (readiness.length === 1
    && String(readiness[0].value_text) !== "ready_for_future_construction"
    && String(construction[0].value_text) !== "false") {
    reasons.push("opportunity_risk_v4_construction_claimed_without_ready_state");
  }
  const declaredTtl = observations.find((o) => o?.key === "ttl_policy_version")?.value_text;
  if (String(declaredTtl) !== String(TTL_POLICY_VERSION_V9)) {
    reasons.push("opportunity_risk_v4_ttl_policy_version_not_declared");
  }
  for (const o of observations) {
    const key = String(o?.key ?? "").toLowerCase();
    for (const tok of OPPORTUNITY_FORBIDDEN_KEY_TOKENS) {
      if (key.includes(tok)) reasons.push(`opportunity_risk_v4_forbidden_observation:${key}`);
    }
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());
  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["opportunity_risk_v4_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/** Binding proof in the final collected seven-agent batch (same rule as V8). */
export function assertAgentBindingV9(
  batch: EvidenceEnvelopeV1[], agent_id: RonAgentId, accepted_hash: string,
): void {
  const found = batch.filter((e) => e?.agent_id === agent_id);
  if (found.length !== 1) {
    throw new OrchestrationRunError([`v9_binding_count:${agent_id}:${found.length}`]);
  }
  if (found[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError([`v9_binding_hash_mismatch:${agent_id}`]);
  }
}
