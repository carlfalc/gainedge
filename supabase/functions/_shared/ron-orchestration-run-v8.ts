/**
 * RON orchestration run — Coordination Plan V8 (implementation marker
 * `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V7 plan. V1-V7 are imported,
 * never mutated: their plan arrays, spec objects, hashes, run-id derivations and
 * acceptance gates are untouched and stay explicitly replayable.
 *
 * THE ONLY SEMANTIC DELTA from V7: the three anchor-convention specialists are pinned to
 * their new single-anchor V3 specs, and `opportunity_risk` is pinned to the V3
 * compatibility spec that accepts exactly those lineages:
 *
 *   session_market_structure   -> spec 3
 *   pattern_context            -> spec 3
 *   calibration_model_validation -> spec 2   (inherited, anchor-convention neutral)
 *   cross_asset_correlation    -> spec 3
 *   macro_news_geopolitics     -> spec 2     (inherited, anchor-convention neutral)
 *   opportunity_risk           -> spec 3
 *   falconer_signal_source     -> spec 1     (inherited)
 *
 * UNIFORM ANCHOR RULE — ONE RON DECISION = ONE EVALUATION ANCHOR:
 * every specialist in a V8 run is invoked with the EXACT SAME anchor string, a COMPLETED
 * XAUUSD 15m bar CLOSE. There is no per-agent anchor, no per-agent anchor convention and
 * no orchestration-level `-15m` translation anywhere. The analytical bar-open translation
 * exists ONLY inside the V3 specialist implementations and is proven back to orchestration
 * through their own declared provenance.
 *
 * Authority hierarchy, disagreement handling, phases, subject scoping, the single sealed
 * Session -> Pattern dependency, the generic V6 as-returned seal proof, the frozen
 * Calibration V2 / Macro V2 / Falconer V1 gates and immutable persistence are inherited
 * verbatim. No probability, no trade geometry, no execution, no promotion.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import {
  OPPORTUNITY_RISK_AGENT, OPPORTUNITY_RISK_ALLOWED_DIRECTIONS,
  OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS, OPPORTUNITY_FORBIDDEN_KEY_TOKENS,
  assertSpecialistReturnedSealedV6,
} from "./ron-orchestration-run-v6.ts";
import {
  ORCHESTRATION_RUN_PLAN_V7, ORCHESTRATION_RUN_SPEC_V7,
} from "./ron-orchestration-run-v7.ts";
import {
  OPPORTUNITY_READINESS_STATES, OPPORTUNITY_RISK_SPEC_V1,
} from "./ron-opportunity-risk-spec.ts";
import { OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED } from "./ron-opportunity-risk-spec-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import { SESSION_STRUCTURE_SPEC_V3 } from "./ron-session-structure-spec-v3.ts";
import {
  PATTERN_CONTEXT_SPEC_V3, PATTERN_CONTEXT_SPEC_V2_HASH_PINNED,
  SESSION_STRUCTURE_SPEC_V2_HASH_PINNED, SESSION_STRUCTURE_SPEC_V3_HASH_PINNED,
} from "./ron-pattern-structure-context-v3.ts";
import { PATTERN_CONTEXT_SPEC_V2 } from "./ron-pattern-structure-context-v2.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V3, CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED,
} from "./ron-cross-asset-relationship-context-v3.ts";
import { CROSS_ASSET_RELATIONSHIP_SPEC_V2 } from "./ron-cross-asset-relationship-context-v2.ts";
import { OPPORTUNITY_RISK_SPEC_V3 } from "./ron-opportunity-risk-spec-v3.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V8 = 8;

/** The four agents whose specialist spec version V8 re-pins. */
export const SESSION_STRUCTURE_AGENT: RonAgentId = "session_market_structure";
export const PATTERN_CONTEXT_AGENT: RonAgentId = "pattern_context";
export const CROSS_ASSET_AGENT: RonAgentId = "cross_asset_correlation";
export { OPPORTUNITY_RISK_AGENT };

export const SESSION_STRUCTURE_SPEC_VERSION_V8 = 3;
export const PATTERN_CONTEXT_SPEC_VERSION_V8 = 3;
export const CROSS_ASSET_SPEC_VERSION_V8 = 3;
export const OPPORTUNITY_RISK_SPEC_VERSION_V8 = 3;

/** Bar grid of the single accepted timeframe. Used only for anchor-convention proofs. */
const BAR_MS = SESSION_STRUCTURE_SPEC_V3.bar_minutes * 60_000;

/** FULL accepted Opportunity/Risk Compatibility Spec V3 hash. */
export const OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED =
  "15273f91d04b597f1cd03bd169ae784a1b58b3470f394a74aec8d174455fc8f9";

/** FULL accepted Pattern Structure Context Spec V3 hash. */
export const PATTERN_CONTEXT_SPEC_V3_HASH_PINNED =
  "fb337fb1f544f656621350355d792d587405b8995064e1550b5053f9f37205c3";

/** FULL accepted Cross-Asset Relationship Context Spec V3 hash. */
export const CROSS_ASSET_RELATIONSHIP_SPEC_V3_HASH_PINNED =
  "013e0bbd6a839f064d7d9124ff24ac164419a6af156bf3c027b63f8d62069a25";

export { SESSION_STRUCTURE_SPEC_V3_HASH_PINNED };

/* ------------------------------------------------------------ accepted refs */

const S_SPEC_PREFIX = `spec:${SESSION_STRUCTURE_SPEC_V3.spec_id}:`;
const S_BASE_PREFIX = `base_spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v2:`;
const P_SPEC_PREFIX = `spec:${PATTERN_CONTEXT_SPEC_V3.spec_id}:`;
const P_BASE_PREFIX = `base_spec:${PATTERN_CONTEXT_SPEC_V2.spec_id}:v2:`;
const C_SPEC_PREFIX = `spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V3.spec_id}:`;
const C_BASE_PREFIX = `base_spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id}:v2:`;
const O_SPEC_PREFIX = `spec:${OPPORTUNITY_RISK_SPEC_V3.spec_id}:`;
const O_BASE_PREFIX = `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:`;

export const sessionStructureSpecRefV3 = (): string =>
  `${S_SPEC_PREFIX}v3:${SESSION_STRUCTURE_SPEC_V3_HASH_PINNED}`;
export const sessionStructureBaseSpecRefV2 = (): string =>
  `${S_BASE_PREFIX}${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`;
export const patternContextSpecRefV3 = (): string =>
  `${P_SPEC_PREFIX}v3:${PATTERN_CONTEXT_SPEC_V3_HASH_PINNED}`;
export const patternContextBaseSpecRefV2 = (): string =>
  `${P_BASE_PREFIX}${PATTERN_CONTEXT_SPEC_V2_HASH_PINNED}`;
export const crossAssetSpecRefV3 = (): string =>
  `${C_SPEC_PREFIX}v3:${CROSS_ASSET_RELATIONSHIP_SPEC_V3_HASH_PINNED}`;
export const crossAssetBaseSpecRefV2 = (): string =>
  `${C_BASE_PREFIX}${CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED}`;
export const opportunityRiskSpecRefV3 = (): string =>
  `${O_SPEC_PREFIX}v3:${OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED}`;
export const opportunityRiskBaseSpecRefV1 = (): string =>
  `${O_BASE_PREFIX}${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`;

/** Exact dependency + structure-provenance entries Pattern V3 emits. */
export const patternSessionDependencyEntryV8 = (session_hash: string): string =>
  `session_market_structure_evidence:${session_hash}`;
export const patternStructureProvenanceRefV8 = (session_hash: string): string =>
  `structure_context:${SESSION_STRUCTURE_SPEC_V3.spec_id}:v3:${session_hash}`;

/* ------------------------------------------------------------------- plan */

const PIN_V8: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V7.spec_version_pins,
  session_market_structure: SESSION_STRUCTURE_SPEC_VERSION_V8,
  pattern_context: PATTERN_CONTEXT_SPEC_VERSION_V8,
  cross_asset_correlation: CROSS_ASSET_SPEC_VERSION_V8,
  opportunity_risk: OPPORTUNITY_RISK_SPEC_VERSION_V8,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V7. Only the four `spec_version_pin` values differ.
 */
export const ORCHESTRATION_RUN_PLAN_V8: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V7.map((p) => ({
    ...p,
    spec_version_pin: PIN_V8[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V8: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V8.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V8 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V8,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V7.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V7 except "
    + "that session_market_structure, pattern_context and cross_asset_correlation are "
    + "pinned to their single-evaluation-anchor V3 specs and opportunity_risk is pinned "
    + "to the V3 compatibility spec that accepts exactly those lineages; every specialist "
    + "is invoked with ONE identical completed-bar-close evaluation anchor",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v8",

  /** The uniform-anchor rule, declared as contract rather than convention. */
  uniform_anchor_contract: {
    one_decision_one_evaluation_anchor: true,
    evaluation_anchor_means: "completed_bar_close",
    identical_anchor_string_for_every_specialist: true,
    per_agent_anchor_convention: false,
    per_agent_anchor_offset_helper: false,
    orchestration_level_anchor_translation: false,
    analytical_bar_open_translation_owned_by: "v3_specialist_implementations_only",
    analytical_bar_open_equals: "evaluation_anchor_minus_one_bar_exactly",
    forming_bar_consumed: false,
    source_timestamp_after_anchor_allowed: false,
    wall_clock_read_by_orchestration: false,
  },

  session_dependency_acceptance: {
    agent_id: SESSION_STRUCTURE_AGENT,
    requested_spec_version: SESSION_STRUCTURE_SPEC_VERSION_V8,
    spec_id: SESSION_STRUCTURE_SPEC_V3.spec_id,
    accepted_spec_hash: SESSION_STRUCTURE_SPEC_V3_HASH_PINNED,
    base_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    base_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    as_of_equals_evaluation_anchor_required: true,
    as_of_bar_open_equals_anchor_minus_one_bar_required: true,
    as_of_bar_completed_close_equals_anchor_required: true,
  },
  pattern_dependency_binding_verified: true,
  pattern_context: {
    agent_id: PATTERN_CONTEXT_AGENT,
    requested_spec_version: PATTERN_CONTEXT_SPEC_VERSION_V8,
    spec_id: PATTERN_CONTEXT_SPEC_V3.spec_id,
    accepted_spec_hash: PATTERN_CONTEXT_SPEC_V3_HASH_PINNED,
    base_spec_version: PATTERN_CONTEXT_SPEC_V2.spec_version,
    base_spec_hash: PATTERN_CONTEXT_SPEC_V2_HASH_PINNED,
    consumes_sealed_session_v3_evidence: true,
    structure_recomputed: false,
    as_of_equals_evaluation_anchor_required: true,
  },
  calibration_context: ORCHESTRATION_RUN_SPEC_V7.calibration_context,
  cross_asset_context: {
    agent_id: CROSS_ASSET_AGENT,
    requested_spec_version: CROSS_ASSET_SPEC_VERSION_V8,
    spec_id: CROSS_ASSET_RELATIONSHIP_SPEC_V3.spec_id,
    accepted_spec_hash: CROSS_ASSET_RELATIONSHIP_SPEC_V3_HASH_PINNED,
    base_spec_version: CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version,
    base_spec_hash: CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED,
    statistic_recomputed_in_v3: false,
    thresholds_changed_in_v3: false,
    as_of_equals_evaluation_anchor_required: true,
    as_of_bar_open_equals_anchor_minus_one_bar_required: true,
    as_of_bar_completed_close_equals_anchor_required: true,
  },
  macro_context: ORCHESTRATION_RUN_SPEC_V7.macro_context,
  opportunity_risk_context: {
    agent_id: OPPORTUNITY_RISK_AGENT,
    requested_spec_version: OPPORTUNITY_RISK_SPEC_VERSION_V8,
    spec_id: OPPORTUNITY_RISK_SPEC_V3.spec_id,
    accepted_spec_hash: OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED,
    base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
    base_spec_hash: OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED,
    readiness_gate_only: true,
    readiness_logic_inherited_from_v1: true,
    lineage_table_updated_to_v3_specialists: true,
    new_temporal_methodology: false,
    admissible_readiness_states: OPPORTUNITY_READINESS_STATES,
    construction_allowed_true_only_when: "ready_for_future_construction",
    as_of_equals_evaluation_anchor_required: true,
  },
  falconer_signal_source_context: ORCHESTRATION_RUN_SPEC_V7.falconer_signal_source_context,

  spec_version_pins: {
    ...ORCHESTRATION_RUN_SPEC_V7.spec_version_pins,
    session_market_structure: SESSION_STRUCTURE_SPEC_VERSION_V8,
    pattern_context: PATTERN_CONTEXT_SPEC_VERSION_V8,
    cross_asset_correlation: CROSS_ASSET_SPEC_VERSION_V8,
    opportunity_risk: OPPORTUNITY_RISK_SPEC_VERSION_V8,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V8
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V8,
} as const;

export const orchestrationRunPlanHashV8 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V8 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V8 run identity, domain-separated from the v1..v7 run-id domains. */
export async function deriveRunIdV8(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V8.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV8(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V8) {
    out[p.agent_id] = await deriveRunIdV8(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* --------------------------------------------------------------- helpers */

const iso = (ms: number) => new Date(ms).toISOString();

const refsOf = (e: EvidenceEnvelopeV1): string[] =>
  (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");

/** Exactly one ref in the namespace, and it is exactly the accepted one. */
function lineageReasons(
  e: EvidenceEnvelopeV1, prefix: string, expected: string, label: string,
): string[] {
  const found = refsOf(e).filter((p) => p.startsWith(prefix));
  if (found.length !== 1) return [`${label}_ref_count:${found.length}`];
  return found[0] === expected ? [] : [`${label}_ref_invalid`];
}

/** No admitted source instant may postdate the single evaluation anchor. */
function sourceTimestampReasons(
  e: EvidenceEnvelopeV1, anchorMs: number, label: string,
): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(e.source_timestamps ?? {})) {
    if (typeof v !== "string") continue;
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && ms > anchorMs) {
      out.push(`${label}_source_timestamp_after_anchor:${k}`);
    }
  }
  return out;
}

/** The completed-bar-close anchor convention, proven from the envelope's own instants. */
function anchorConventionReasons(
  e: EvidenceEnvelopeV1, anchorMs: number, label: string,
): string[] {
  const out: string[] = [];
  const ts = (e.source_timestamps ?? {}) as Record<string, unknown>;
  if (ts.as_of_bar_open !== iso(anchorMs - BAR_MS)) {
    out.push(`${label}_as_of_bar_open_not_anchor_minus_one_bar`);
  }
  if (ts.as_of_bar_completed_close !== iso(anchorMs)) {
    out.push(`${label}_as_of_bar_completed_close_not_anchor`);
  }
  if (ts.evaluation_anchor !== iso(anchorMs)) {
    out.push(`${label}_evaluation_anchor_not_declared`);
  }
  return out;
}

function anchorEqualityReasons(
  e: EvidenceEnvelopeV1, anchorMs: number, label: string,
): string[] {
  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(atMs)) return [`${label}_as_of_unparseable`];
  if (atMs !== anchorMs) {
    return [atMs > anchorMs
      ? `${label}_as_of_after_evaluation_anchor`
      : `${label}_as_of_not_evaluation_anchor`];
  }
  return [];
}

function anchorMsOf(ctx: OrchestrationContext, label: string): number {
  const ms = Date.parse(ctx.as_of);
  if (!Number.isFinite(ms)) throw new OrchestrationRunError([`${label}_anchor_unparseable`]);
  return ms;
}

const fail = (reasons: string[]) => {
  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());
};

/* -------------------------------------- session structure V3 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Session Structure V3 envelope for
 * this run at the single shared evaluation anchor.
 *
 * Proves (on top of the inherited generic V6 seal/scope gate): `as_of` is EXACTLY the
 * anchor, the accepted V3 spec lineage and inherited V2 base lineage are each present
 * exactly once, the declared analytical bar open is exactly `anchor - one bar`, the
 * declared completed close is exactly the anchor, no source instant postdates the anchor,
 * the envelope status is `supported`, and the forming bar was not consumed.
 */
export async function assertSessionStructureV3Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  const hash = await assertSpecialistReturnedSealedV6(
    candidate, ctx, SESSION_STRUCTURE_AGENT);
  const e = candidate as EvidenceEnvelopeV1;
  const anchorMs = anchorMsOf(ctx, "session_structure_v3");
  const reasons: string[] = [
    ...anchorEqualityReasons(e, anchorMs, "session_structure_v3"),
    ...lineageReasons(e, S_SPEC_PREFIX, sessionStructureSpecRefV3(), "session_structure_v3_spec"),
    ...lineageReasons(e, S_BASE_PREFIX, sessionStructureBaseSpecRefV2(), "session_structure_v3_base_spec"),
    ...anchorConventionReasons(e, anchorMs, "session_structure_v3"),
    ...sourceTimestampReasons(e, anchorMs, "session_structure_v3"),
  ];
  if (e.agent_version !== SESSION_STRUCTURE_SPEC_V3.agent_version) {
    reasons.push("session_structure_v3_wrong_agent_version");
  }
  if (e.status !== "supported") reasons.push("session_structure_v3_not_supported");
  const forming = e.observations.filter((o) => o.key === "forming_bar_consumed");
  if (forming.length !== 1 || forming[0].value_text !== "false") {
    reasons.push("session_structure_v3_forming_bar_declaration_missing");
  }
  fail(reasons);
  return hash;
}

/* ---------------------------------------- pattern context V3 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Pattern Structure Context V3
 * envelope for this run at the single shared evaluation anchor, and it PROVES it consumed
 * exactly the sealed Session V3 envelope identified by `session_hash`.
 */
export async function assertPatternContextV3Sealed(
  candidate: unknown, ctx: OrchestrationContext, session_hash: string,
): Promise<string> {
  const hash = await assertSpecialistReturnedSealedV6(candidate, ctx, PATTERN_CONTEXT_AGENT);
  const e = candidate as EvidenceEnvelopeV1;
  const anchorMs = anchorMsOf(ctx, "pattern_context_v3");
  const reasons: string[] = [
    ...anchorEqualityReasons(e, anchorMs, "pattern_context_v3"),
    ...lineageReasons(e, P_SPEC_PREFIX, patternContextSpecRefV3(), "pattern_context_v3_spec"),
    ...lineageReasons(e, P_BASE_PREFIX, patternContextBaseSpecRefV2(), "pattern_context_v3_base_spec"),
    ...sourceTimestampReasons(e, anchorMs, "pattern_context_v3"),
  ];
  if (e.agent_version !== PATTERN_CONTEXT_SPEC_V3.agent_version) {
    reasons.push("pattern_context_v3_wrong_agent_version");
  }
  const ts = (e.source_timestamps ?? {}) as Record<string, unknown>;
  if (ts.evaluation_anchor !== iso(anchorMs)) {
    reasons.push("pattern_context_v3_evaluation_anchor_not_declared");
  }
  if (ts.analytical_bar_open !== iso(anchorMs - BAR_MS)) {
    reasons.push("pattern_context_v3_analytical_bar_open_not_anchor_minus_one_bar");
  }
  // The consumed Session V3 dependency must be exactly the accepted one, once.
  const deps = (e.dependencies ?? [])
    .filter((d) => typeof d === "string" && d.startsWith("session_market_structure_evidence:"));
  if (deps.length !== 1) {
    reasons.push(`pattern_context_v3_session_dependency_count:${deps.length}`);
  } else if (deps[0] !== patternSessionDependencyEntryV8(session_hash)) {
    reasons.push("pattern_context_v3_session_dependency_hash_divergence");
  }
  const structRefs = refsOf(e).filter((p) => p.startsWith("structure_context:"));
  if (structRefs.length !== 1) {
    reasons.push(`pattern_context_v3_structure_provenance_count:${structRefs.length}`);
  } else if (structRefs[0] !== patternStructureProvenanceRefV8(session_hash)) {
    reasons.push("pattern_context_v3_structure_provenance_hash_divergence");
  }
  fail(reasons);
  return hash;
}

/* ------------------------------------- cross-asset context V3 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Cross-Asset Relationship Context V3
 * envelope for this run: anchored on the shared completed-bar-close anchor, with the
 * analytical bar opening one bar earlier and closing exactly on the anchor, so no evidence
 * bar can close after the anchor and no lookahead exemption is required.
 */
export async function assertCrossAssetContextV3Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  const hash = await assertSpecialistReturnedSealedV6(candidate, ctx, CROSS_ASSET_AGENT);
  const e = candidate as EvidenceEnvelopeV1;
  const anchorMs = anchorMsOf(ctx, "cross_asset_v3");
  const reasons: string[] = [
    ...anchorEqualityReasons(e, anchorMs, "cross_asset_v3"),
    ...lineageReasons(e, C_SPEC_PREFIX, crossAssetSpecRefV3(), "cross_asset_v3_spec"),
    ...lineageReasons(e, C_BASE_PREFIX, crossAssetBaseSpecRefV2(), "cross_asset_v3_base_spec"),
    ...anchorConventionReasons(e, anchorMs, "cross_asset_v3"),
    ...sourceTimestampReasons(e, anchorMs, "cross_asset_v3"),
  ];
  if (e.agent_version !== CROSS_ASSET_RELATIONSHIP_SPEC_V3.agent_version) {
    reasons.push("cross_asset_v3_wrong_agent_version");
  }
  const ts = (e.source_timestamps ?? {}) as Record<string, unknown>;
  if (ts.analytical_bar_open !== iso(anchorMs - BAR_MS)) {
    reasons.push("cross_asset_v3_analytical_bar_open_not_anchor_minus_one_bar");
  }
  fail(reasons);
  return hash;
}

/* ------------------------------------- opportunity / risk V3 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Opportunity/Risk Compatibility V3
 * readiness envelope for this run. Identical readiness semantics to the frozen V1/V2
 * gates; only the accepted spec lineage differs.
 */
export async function assertOpportunityRiskV3Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["opportunity_risk_v3_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const anchorMs = anchorMsOf(ctx, "opportunity_risk_v3");
  const reasons: string[] = [
    ...anchorEqualityReasons(e, anchorMs, "opportunity_risk_v3"),
    ...lineageReasons(e, O_SPEC_PREFIX, opportunityRiskSpecRefV3(), "opportunity_risk_v3_spec"),
    ...lineageReasons(e, O_BASE_PREFIX, opportunityRiskBaseSpecRefV1(), "opportunity_risk_v3_base_spec"),
  ];
  if (e.agent_id !== OPPORTUNITY_RISK_AGENT) reasons.push("opportunity_risk_v3_wrong_agent");
  if (e.agent_version !== OPPORTUNITY_RISK_SPEC_V1.agent_version) {
    reasons.push("opportunity_risk_v3_wrong_agent_version");
  }
  if (validateEvidence(e).length) reasons.push("opportunity_risk_v3_invalid_envelope");
  if (!e.evidence_hash) reasons.push("opportunity_risk_v3_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("opportunity_risk_v3_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("opportunity_risk_v3_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("opportunity_risk_v3_timeframe_mismatch");

  if (!(OPPORTUNITY_RISK_ALLOWED_DIRECTIONS as readonly string[]).includes(String(e.direction))) {
    reasons.push("opportunity_risk_v3_direction_not_contextual");
  }
  if (!(OPPORTUNITY_RISK_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("opportunity_risk_v3_recommendation_not_contextual");
  }

  const observations = Array.isArray(e.observations) ? e.observations : [];
  const readiness = observations.filter((o) => o?.key === "readiness_state");
  const allowedStates = OPPORTUNITY_READINESS_STATES as readonly string[];
  if (readiness.length !== 1) {
    reasons.push(`opportunity_risk_v3_readiness_state_count:${readiness.length}`);
  } else if (!allowedStates.includes(String(readiness[0].value_text))) {
    reasons.push("opportunity_risk_v3_readiness_state_unknown");
  }
  const construction = observations.filter((o) => o?.key === "construction_allowed");
  if (construction.length !== 1) {
    reasons.push(`opportunity_risk_v3_construction_allowed_count:${construction.length}`);
  } else if (readiness.length === 1
    && String(readiness[0].value_text) !== "ready_for_future_construction"
    && String(construction[0].value_text) !== "false") {
    reasons.push("opportunity_risk_v3_construction_claimed_without_ready_state");
  }
  for (const o of observations) {
    const key = String(o?.key ?? "").toLowerCase();
    for (const tok of OPPORTUNITY_FORBIDDEN_KEY_TOKENS) {
      if (key.includes(tok)) reasons.push(`opportunity_risk_v3_forbidden_observation:${key}`);
    }
  }

  fail(reasons);
  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["opportunity_risk_v3_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/* ---------------------------------------------------------------- bindings */

/**
 * Prove the accepted envelope for `agent_id` is the single one present in the final
 * collected seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertAgentBindingV8(
  batch: EvidenceEnvelopeV1[], agent_id: RonAgentId, accepted_hash: string,
): void {
  const found = batch.filter((e) => e?.agent_id === agent_id);
  if (found.length !== 1) {
    throw new OrchestrationRunError([`v8_binding_count:${agent_id}:${found.length}`]);
  }
  if (found[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError([`v8_binding_hash_mismatch:${agent_id}`]);
  }
}

/**
 * Prove the exact sealed Session V3 envelope handed to Pattern is the one in the final
 * batch AND the one Pattern's own sealed evidence cites.
 */
export function assertPatternDependencyBindingV8(
  batch: EvidenceEnvelopeV1[], session_hash: string,
): void {
  assertAgentBindingV8(batch, SESSION_STRUCTURE_AGENT, session_hash);
  const patterns = batch.filter((e) => e?.agent_id === PATTERN_CONTEXT_AGENT);
  if (patterns.length !== 1) {
    throw new OrchestrationRunError([`pattern_dependency_v8_agent_count:${patterns.length}`]);
  }
  const deps = (patterns[0].dependencies ?? [])
    .filter((d) => typeof d === "string" && d.startsWith("session_market_structure_evidence:"));
  if (deps.length !== 1 || deps[0] !== patternSessionDependencyEntryV8(session_hash)) {
    throw new OrchestrationRunError(["pattern_dependency_v8_hash_divergence"]);
  }
  const refs = refsOf(patterns[0]).filter((p) => p.startsWith("structure_context:"));
  if (refs.length !== 1 || refs[0] !== patternStructureProvenanceRefV8(session_hash)) {
    throw new OrchestrationRunError(["pattern_dependency_v8_provenance_divergence"]);
  }
}
