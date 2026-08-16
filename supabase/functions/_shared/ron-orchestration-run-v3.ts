/**
 * RON orchestration run — Coordination Plan V3 (implementation marker
 * `RON_ORCHESTRATION_CALIBRATION_CONTEXT_V3`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V2 plan. V1 and V2 are imported,
 * never mutated: their plan arrays, spec objects, hashes and run-id derivations are
 * untouched and stay explicitly replayable.
 *
 * The ONLY semantic difference in V3 is that `calibration_model_validation` is invoked
 * with an EXPLICIT `spec_version: 2` pin, so RON receives the audited descriptive
 * Calibration Diagnostic Context V2 evidence instead of the endpoint's V1 default. The
 * seven agents, canonical order, authority model, the Session -> sealed evidence ->
 * Pattern V2 handoff and the Opportunity/Risk evidence-batch behaviour are inherited
 * verbatim from V2.
 *
 * Calibration V2 remains NON-AUTHORITATIVE contextual evidence: neutral direction,
 * research_only recommendation, no probability, no confidence, no trade geometry, no
 * promotion and no execution authority. The gate below fails closed if the returned
 * calibration evidence is missing, is V1, carries the wrong / duplicate / ambiguous spec
 * provenance, or drifts from neutral research_only.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { CALIBRATION_VALIDATION_SPEC_V1 } from "./ron-calibration-validation-spec.ts";
import { CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2 } from "./ron-calibration-diagnostic-context-v2.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import {
  ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_SPEC_V2,
  type AgentCallPlanEntryV2,
} from "./ron-orchestration-run-v2.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V3 = 3;

/** The one agent whose specialist spec version V3 additionally pins. */
export const CALIBRATION_CONTEXT_AGENT: RonAgentId = "calibration_model_validation";

/** Exactly one spec_version value may ever be sent for calibration in a V3 run. */
export const CALIBRATION_CONTEXT_SPEC_VERSION_V3 = 2;

/**
 * FULL accepted Calibration Diagnostic Context Spec V2 hash (inherited, never re-derived
 * here). Any other value in returned provenance is rejected.
 */
export const CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED =
  "f2d41d336fe706099d0269e8c23f0ce46717bf2eced696c2f51459a27876543a";

const CAL_SPEC_ID = CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id;

/* ------------------------------------------- accepted artifact temporal identity */

/**
 * The accepted Calibration/Research artifact clocks are frozen in
 * `CALIBRATION_VALIDATION_SPEC_V1`. V3 DERIVES them rather than duplicating literals, and
 * fails closed if the two accepted `source_as_of` (or `source_bar_cutoff`) instants ever
 * diverge instead of silently picking one.
 */
const R_ACCEPTED = CALIBRATION_VALIDATION_SPEC_V1.accepted_research_v4;
const C_ACCEPTED = CALIBRATION_VALIDATION_SPEC_V1.accepted_calibration_v8;

const instant = (s: string): string => {
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) {
    throw new OrchestrationRunError(["calibration_context_accepted_artifact_clock_unparseable"]);
  }
  return new Date(ms).toISOString();
};

const agree = (a: string, b: string, reason: string): string => {
  const ia = instant(a), ib = instant(b);
  if (ia !== ib) throw new OrchestrationRunError([reason]);
  return ia;
};

/** Exact accepted Research V4 source_as_of === accepted Calibration v8 source_as_of. */
export const ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3: string = agree(
  R_ACCEPTED.source_as_of, C_ACCEPTED.source_as_of,
  "calibration_context_accepted_artifact_as_of_divergent",
);

/** Exact accepted shared source_bar_cutoff. */
export const ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3: string = agree(
  R_ACCEPTED.source_bar_cutoff, C_ACCEPTED.source_bar_cutoff,
  "calibration_context_accepted_artifact_bar_cutoff_divergent",
);

const ACCEPTED_AS_OF_MS = Date.parse(ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3);

/** Envelope source_timestamps keys that must bind exactly to the accepted artifact. */
const REQUIRED_SOURCE_TIMESTAMPS_V3: readonly (readonly [string, string])[] = [
  ["research_run_source_as_of", ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3],
  ["calibration_run_source_as_of", ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3],
  ["research_run_source_bar_cutoff", ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3],
  ["calibration_run_source_bar_cutoff", ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3],
];

/** `spec:<spec_id>:v...` refs are the ONLY accepted spec-identity statements. */
const CAL_SPEC_PREFIX = `spec:${CAL_SPEC_ID}:`;
const CAL_SPEC_V2_PREFIX = `${CAL_SPEC_PREFIX}v${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_version}:`;

export const calibrationContextSpecRefV2 = (): string =>
  `${CAL_SPEC_V2_PREFIX}${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED}`;

/** V3 pins Session V2, Pattern V2 (inherited) AND Calibration V2 (new in V3). */
const PIN_V3: Partial<Record<RonAgentId, number>> = {
  session_market_structure: 2,
  pattern_context: 2,
  calibration_model_validation: CALIBRATION_CONTEXT_SPEC_VERSION_V3,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V2. Only `spec_version_pin` for calibration differs.
 */
export const ORCHESTRATION_RUN_PLAN_V3: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V2.map((p) => ({
    ...p,
    spec_version_pin: PIN_V3[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V3: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V3.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V3 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V3,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V2.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V2 except "
    + "that calibration_model_validation is pinned to spec_version 2 so RON receives the "
    + "audited descriptive calibration diagnostic context as non-authoritative evidence",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v3",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V2.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  /** New in V3, and the ONLY semantic delta from V2. */
  calibration_context: {
    agent_id: CALIBRATION_CONTEXT_AGENT,
    requested_spec_version: CALIBRATION_CONTEXT_SPEC_VERSION_V3,
    requested_exactly_once: true,
    base_spec_id: CALIBRATION_VALIDATION_SPEC_V1.spec_id,
    accepted_spec_hash: CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED,
    authority_added: false,
    direction_weighting_added: false,
    probability_published: false,
    promotion_conferred: false,
    required_direction: "neutral",
    required_recommendation: "research_only",
    accepted_artifact_as_of: ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3,
    accepted_artifact_bar_cutoff: ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3,
    evidence_as_of_must_equal_accepted_artifact: true,
    orchestration_anchor_must_be_at_or_after_artifact: true,
    wall_clock_freshness_required: false,
    bound_source_timestamp_keys: REQUIRED_SOURCE_TIMESTAMPS_V3.map(([k]) => k),
  },
  spec_version_pins: {
    session_market_structure: 2,
    pattern_context: 2,
    calibration_model_validation: CALIBRATION_CONTEXT_SPEC_VERSION_V3,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V3
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V3,
} as const;

export const orchestrationRunPlanHashV3 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V3 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V3 run identity, domain-separated from `ron_orch_run_v1` and `ron_orch_run_v2`. */
export async function deriveRunIdV3(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V3.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV3(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V3) {
    out[p.agent_id] = await deriveRunIdV3(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* -------------------------------------- calibration V2 context acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY a sealed Calibration Diagnostic Context V2
 * envelope for this run.
 *
 * Rejects: absence, malformed input, the wrong agent, an unsealed envelope, a hash that
 * does not match its own content, scope/anchor mismatch, missing calibration spec
 * provenance, V1 spec provenance, a wrong spec hash, duplicated or ambiguous spec
 * provenance, and any drift away from neutral / research_only contextual semantics.
 *
 * Returns the verified sealed evidence hash.
 */
export async function assertCalibrationContextV2Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["calibration_context_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];

  if (e.agent_id !== CALIBRATION_CONTEXT_AGENT) reasons.push("calibration_context_wrong_agent");
  if (validateEvidence(e).length) reasons.push("calibration_context_invalid_envelope");
  if (!e.evidence_hash) reasons.push("calibration_context_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("calibration_context_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("calibration_context_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("calibration_context_timeframe_mismatch");

  const anchorMs = Date.parse(ctx.as_of);
  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(anchorMs)) reasons.push("calibration_context_anchor_unparseable");
  else if (!Number.isFinite(atMs)) reasons.push("calibration_context_as_of_unparseable");
  else if (atMs > anchorMs) reasons.push("calibration_context_after_anchor");

  const refs = (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");
  const specRefs = refs.filter((p) => p.startsWith(CAL_SPEC_PREFIX));
  if (specRefs.length !== 1) {
    reasons.push(`calibration_context_spec_provenance_count:${specRefs.length}`);
  } else if (!specRefs[0].startsWith(CAL_SPEC_V2_PREFIX)) {
    reasons.push("calibration_context_spec_version_not_2");
  } else if (specRefs[0] !== calibrationContextSpecRefV2()) {
    reasons.push("calibration_context_spec_hash_mismatch");
  }

  // Contextual-only semantics: V2 may never arrive as a directional or actionable claim.
  if (e.direction !== "neutral") reasons.push("calibration_context_direction_not_neutral");
  if (e.recommendation !== "research_only") {
    reasons.push("calibration_context_recommendation_not_research_only");
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());

  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["calibration_context_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/**
 * Prove the accepted calibration envelope is the single calibration envelope present in
 * the final collected seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertCalibrationContextBinding(
  batch: EvidenceEnvelopeV1[], accepted_hash: string,
): void {
  const cals = batch.filter((e) => e?.agent_id === CALIBRATION_CONTEXT_AGENT);
  if (cals.length !== 1) {
    throw new OrchestrationRunError([`calibration_context_binding_count:${cals.length}`]);
  }
  if (cals[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError(["calibration_context_binding_hash_divergence"]);
  }
}
