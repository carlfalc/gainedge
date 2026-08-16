/**
 * RON orchestration run — Coordination Plan V2 (implementation marker
 * `RON_ORCHESTRATION_SESSION_TO_PATTERN_V2`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V1 plan. V1 is imported, never
 * mutated: its plan array, spec object, hash and run-id derivation are untouched and stay
 * explicitly replayable.
 *
 * The ONLY semantic difference in V2 is a single explicit, declared dependency:
 *   `pattern_context` consumes EXACTLY the sealed `session_market_structure` Evidence V1
 *   envelope already collected earlier in the SAME run — nothing else. Session is called
 *   exactly once; its structure truth is never recomputed inside Pattern.
 *
 * PURE module: no I/O, no database client, no network call, no secret. It does not
 * publish a probability, does not allow execution, does not promote a state variable,
 * does not persist by default and adds no cron/auto-run/dashboard wiring.
 */
import {
  evidenceHash, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import { hashCanonical } from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import {
  acceptSessionStructureContext, SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
} from "./ron-pattern-structure-context-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import {
  ORCHESTRATION_RUN_PLAN_V1, ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError,
  type AgentCallPlanEntry,
} from "./ron-orchestration-run.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V2 = 2;

/** The one agent whose sealed evidence Pattern V2 is allowed to consume. */
export const PATTERN_SESSION_DEPENDENCY_AGENT: RonAgentId = "session_market_structure";

/** The agent whose sealed evidence must PROVE it consumed the Session dependency. */
export const PATTERN_DEPENDENT_AGENT: RonAgentId = "pattern_context";

/** Exact dependency entry Pattern V2 emits for a consumed sealed Session envelope. */
export const patternSessionDependencyEntry = (session_hash: string): string =>
  `session_market_structure_evidence:${session_hash}`;

const PATTERN_SESSION_DEPENDENCY_PREFIX = "session_market_structure_evidence:";
const PATTERN_STRUCTURE_PROVENANCE_PREFIX =
  `structure_context:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:`;

export interface AgentCallPlanEntryV2 extends AgentCallPlanEntry {
  /**
   * Sealed single-agent evidence dependencies handed to this specialist by name. Empty
   * for every agent except `pattern_context`. This is NOT the phase-2 evidence batch.
   */
  depends_on_sealed_evidence: readonly RonAgentId[];
  /** Body field the dependency is delivered in (null when there is no dependency). */
  dependency_param: "session_evidence" | null;
  /**
   * Explicit specialist spec version requested by the orchestrator instead of relying on
   * the endpoint's mutable default. `null` documents an agent that still historically
   * relies on its endpoint default — that limitation is declared, not silently widened.
   */
  spec_version_pin: number | null;
}

const PIN: Partial<Record<RonAgentId, number>> = {
  session_market_structure: 2,
  pattern_context: 2,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping and same phase routing as V1. Session already precedes Pattern in the canonical
 * order, so no reordering is required or performed.
 */
export const ORCHESTRATION_RUN_PLAN_V2: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V1.map((p) => ({
    ...p,
    depends_on_sealed_evidence: p.agent_id === "pattern_context"
      ? [PATTERN_SESSION_DEPENDENCY_AGENT] as const
      : [] as const,
    dependency_param: p.agent_id === "pattern_context" ? "session_evidence" : null,
    spec_version_pin: PIN[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V2: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V2.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V2 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V2,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V1.run_version,
  purpose:
    "explicitly invoked seven-agent collection with ONE declared sealed dependency "
    + "(pattern_context consumes sealed session_market_structure evidence), deterministic "
    + "orchestration and opt-in audit persistence",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v2",
  /**
   * The pre-Pattern gate requires the ACCEPTED Session V2 contract (the frozen Pattern V2
   * acceptance function), not merely a sealed envelope carrying the same agent id.
   */
  session_dependency_acceptance: {
    contract: "pattern_v2_accept_session_structure_context",
    requires_accepted_session_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    second_structural_truth_invented: false,
    sealed_session_v1_rejected: true,
  },
  /** After Pattern returns, its own evidence must cite exactly the handed Session hash. */
  pattern_dependency_binding_verified: true,
  /** Declared limitation: only Pattern and its Session dependency are version-pinned. */
  spec_version_pins: { session_market_structure: 2, pattern_context: 2 },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V2
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V2,
} as const;

export const orchestrationRunPlanHashV2 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V2 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/**
 * V2 run identity. Domain-separated from V1 (`ron_orch_run_v1`) so semantically different
 * orchestration can never collide with a V1 run row for the same trace/anchor/agent.
 */
export async function deriveRunIdV2(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V2.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV2(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V2) {
    out[p.agent_id] = await deriveRunIdV2(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------------------- sealed session dependency gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Session V2 envelope for this run.
 *
 * Rejects: absence, malformed input, the wrong agent, an unsealed envelope, a hash that
 * does not match its own content, and any trace / instrument / timeframe / anchor scope
 * mismatch. Returns the verified sealed evidence hash so the caller can prove later that
 * the SAME envelope reached both Pattern and the final collected batch.
 */
export async function assertSessionDependencySealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["session_dependency_absent_or_malformed"]);
  }
  const anchorMs = Date.parse(ctx.as_of);
  if (!Number.isFinite(anchorMs)) {
    throw new OrchestrationRunError(["session_dependency_anchor_unparseable"]);
  }
  // Reuse the FROZEN Pattern V2 acceptance contract verbatim so the orchestrator gate and
  // Pattern cannot diverge and no second acceptance truth is invented here.
  const accepted = await acceptSessionStructureContext(candidate, {
    trace_id: ctx.trace_id, instrument: ctx.instrument,
    timeframe: ctx.timeframe, as_of: anchorMs,
  });
  if (accepted.ok === false) {
    throw new OrchestrationRunError([
      accepted.reason.replace(/^session_context_/, "session_dependency_"),
    ]);
  }
  // Defence in depth: the accepted contract already proves these, restated explicitly.
  const e = candidate as EvidenceEnvelopeV1;
  if (e.agent_id !== PATTERN_SESSION_DEPENDENCY_AGENT) {
    throw new OrchestrationRunError(["session_dependency_wrong_agent"]);
  }
  if (validateEvidence(e).length) {
    throw new OrchestrationRunError(["session_dependency_invalid_envelope"]);
  }
  if (await evidenceHash(e) !== accepted.evidence_hash) {
    throw new OrchestrationRunError(["session_dependency_hash_mismatch"]);
  }
  return accepted.evidence_hash;
}

/**
 * Prove the exact envelope handed to Pattern is the one present in the final collected
 * seven-agent batch. Fails closed on absence, duplication or any hash divergence.
 */
export function assertSessionDependencyBinding(
  batch: EvidenceEnvelopeV1[], handed_hash: string,
): void {
  const sessions = batch.filter((e) => e?.agent_id === PATTERN_SESSION_DEPENDENCY_AGENT);
  if (sessions.length !== 1) {
    throw new OrchestrationRunError([`session_dependency_binding_count:${sessions.length}`]);
  }
  if (sessions[0].evidence_hash !== handed_hash) {
    throw new OrchestrationRunError(["session_dependency_binding_hash_divergence"]);
  }
}

/**
 * Prove PATTERN ACTUALLY CONSUMED the exact sealed Session envelope handed to it.
 *
 * The sealed Pattern evidence must carry EXACTLY ONE `session_market_structure_evidence:`
 * dependency entry and it must equal the handed Session hash. Any missing, duplicated or
 * divergent dependency — and any structure-context provenance ref citing a different
 * Session hash — fails closed BEFORE synthesis.
 */
export function assertPatternDependencyBinding(
  batch: EvidenceEnvelopeV1[], handed_hash: string,
): void {
  const patterns = batch.filter((e) => e?.agent_id === PATTERN_DEPENDENT_AGENT);
  if (patterns.length !== 1) {
    throw new OrchestrationRunError([`pattern_dependency_binding_agent_count:${patterns.length}`]);
  }
  const deps = (patterns[0].dependencies ?? [])
    .filter((d) => typeof d === "string" && d.startsWith(PATTERN_SESSION_DEPENDENCY_PREFIX));
  if (deps.length !== 1) {
    throw new OrchestrationRunError([`pattern_dependency_binding_count:${deps.length}`]);
  }
  if (deps[0] !== patternSessionDependencyEntry(handed_hash)) {
    throw new OrchestrationRunError(["pattern_dependency_binding_hash_divergence"]);
  }
  const refs = (patterns[0].provenance_refs ?? [])
    .filter((p) => typeof p === "string" && p.startsWith(PATTERN_STRUCTURE_PROVENANCE_PREFIX));
  if (refs.length !== 1) {
    throw new OrchestrationRunError([`pattern_dependency_provenance_count:${refs.length}`]);
  }
  if (refs[0] !== `${PATTERN_STRUCTURE_PROVENANCE_PREFIX}${handed_hash}`) {
    throw new OrchestrationRunError(["pattern_dependency_provenance_hash_divergence"]);
  }
}