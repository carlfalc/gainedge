/**
 * RON Phase 2D.2a — Agentic Core v1: DETERMINISTIC ORCHESTRATOR / SYNTHESIS.
 *
 * RON is the orchestrator, not a peer specialist. This module is PURE: given the same
 * validated Evidence V1 envelopes and the same context it produces byte-identical
 * decision and explanation payloads, and therefore identical hashes. There is no hidden
 * mutable model state, no clock read and no I/O, so any stored decision can be replayed
 * from its stored evidence alone.
 *
 * SAFETY POSTURE (hard invariants, enforced in code and tests)
 *   - `execution_allowed` is always false and `execution_path` is always "signal_only".
 *   - `numeric_probability` is always null: Research V4 promoted ZERO state variables.
 *   - Falconer (strategy context) can never override a higher-authority fact.
 *   - Opportunity construction can never complete while PROMOTED_STATE_VARIABLES is empty.
 *   - Critical/blocked/stale authoritative source or calibration evidence FAILS CLOSED.
 */
import { PROMOTED_STATE_VARIABLES } from "./ron-agentic-architecture.ts";
import {
  EVIDENCE_TTL_POLICY_V1, EvidenceContractError, RON_AGENT_IDS, RON_AGENT_REGISTRY,
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, authorityRankOf, evidenceHash, evidenceTtlMinutes,
  hashCanonical, registryHash, validateEvidence,
  type EvidenceEnvelopeV1, type QualitativeDirection, type RecommendationV1, type RonAgentId,
} from "./ron-agent-contracts.ts";

export const RON_ORCHESTRATOR_VERSION = 1;
export const RON_DECISION_SCHEMA_VERSION = 1;
export const RON_EXPLANATION_SCHEMA_VERSION = 1;

/** Specialists whose absence materially degrades the decision. */
export const EXPECTED_AGENTS_V1: readonly RonAgentId[] = [
  "session_market_structure", "calibration_model_validation",
] as const;

export type RonDecisionState =
  | "DATA_BLOCKED"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_CONTEXT"
  | "OPPORTUNITY_INCOMPLETE"
  | "CONTEXT_SUPPORTED"
  | "RESEARCH_ONLY";

const STATE_RECOMMENDATION: Record<RonDecisionState, RecommendationV1> = {
  DATA_BLOCKED: "no_action",
  INSUFFICIENT_EVIDENCE: "wait",
  CONFLICTING_CONTEXT: "observe",
  OPPORTUNITY_INCOMPLETE: "opportunity_incomplete",
  CONTEXT_SUPPORTED: "context_only",
  RESEARCH_ONLY: "research_only",
};

export interface OrchestrationContext {
  trace_id: string;
  instrument: string;
  timeframe: string;
  /** Decision instant (UTC ISO). Staleness is measured against this, never against "now". */
  as_of: string;
  expected_agents?: readonly RonAgentId[];
}

export interface EvidenceRef {
  agent_id: RonAgentId;
  agent_version: number;
  run_id: string;
  evidence_hash: string;
  authority_rank: number;
  status: string;
  stale: boolean;
  age_minutes: number;
  ttl_minutes: number;
}

export interface Disagreement {
  kind: "directional" | "strategy" | "data_health" | "declared_conflict";
  agents: string[];
  detail: string;
  /** True when the disagreement was recorded but is NOT allowed to bind the decision. */
  non_binding: boolean;
}

export interface RonDecisionStateV1 {
  decision_schema_version: number;
  orchestrator_version: number;
  evidence_schema_version: number;
  registry_hash: string;
  ttl_policy_version: number;
  trace_id: string;
  decision_id: string;
  instrument: string;
  timeframe: string;
  as_of: string;
  state: RonDecisionState;
  recommendation: RecommendationV1;
  direction: QualitativeDirection;
  numeric_probability: null;
  execution_allowed: false;
  execution_path: "signal_only";
  data_health: {
    worst_status: "healthy" | "degraded" | "critical";
    authoritative_worst_status: "healthy" | "degraded" | "critical";
    stale_agents: string[];
    issues: string[];
  };
  coverage: {
    present_agents: string[];
    missing_expected_agents: string[];
    unexpected_agents: string[];
  };
  agreements: string[];
  disagreements: Disagreement[];
  blocking_reasons: string[];
  promoted_state_variables: string[];
  evidence_refs: EvidenceRef[];
  decision_hash: string;
}

export interface AskRONExplanationPayloadV1 {
  explanation_schema_version: number;
  decision_id: string;
  trace_id: string;
  instrument: string;
  timeframe: string;
  as_of: string;
  state: RonDecisionState;
  recommendation: RecommendationV1;
  direction: QualitativeDirection;
  why: string[];
  what_would_change: string[];
  missing_or_conflicting: string[];
  data_health: string[];
  source_refs: string[];
  explanation_hash: string;
}

/* ------------------------------------------------------------- ordering */

/** Canonical, order-independent input ordering: authority, then stable identity fields. */
export function canonicalOrder(list: EvidenceEnvelopeV1[]): EvidenceEnvelopeV1[] {
  return [...list].sort((a, b) => {
    const ra = authorityRankOf(a.agent_id), rb = authorityRankOf(b.agent_id);
    if (ra !== rb) return ra - rb;
    if (a.agent_id !== b.agent_id) return a.agent_id < b.agent_id ? -1 : 1;
    if (a.as_of !== b.as_of) return a.as_of < b.as_of ? -1 : 1;
    return (a.run_id ?? "") < (b.run_id ?? "") ? -1 : 1;
  });
}

const minutesBetween = (later: string, earlier: string) =>
  (Date.parse(later) - Date.parse(earlier)) / 60_000;

/* ------------------------------------------------------------ synthesis */

export async function synthesizeDecision(
  raw: EvidenceEnvelopeV1[],
  ctx: OrchestrationContext,
): Promise<{ decision: RonDecisionStateV1; explanation: AskRONExplanationPayloadV1 }> {
  // 1. Fail closed on any contract violation BEFORE synthesis.
  const reasons: string[] = [];
  raw.forEach((e, i) => validateEvidence(e).forEach((r) => reasons.push(`[${i}] ${r}`)));
  if (!Array.isArray(raw) || raw.length === 0) reasons.push("empty_evidence_batch");
  raw.forEach((e, i) => {
    if (e?.instrument !== ctx.instrument) reasons.push(`[${i}] instrument_mismatch`);
    if (e?.timeframe !== ctx.timeframe) reasons.push(`[${i}] timeframe_mismatch`);
    if (e?.trace_id !== ctx.trace_id) reasons.push(`[${i}] trace_id_mismatch`);
    if (e?.as_of && Date.parse(e.as_of) > Date.parse(ctx.as_of)) {
      reasons.push(`[${i}] evidence_after_decision_as_of`);
    }
  });
  const seen = new Set<string>();
  for (const e of raw) {
    if (seen.has(e.agent_id)) reasons.push(`duplicate_agent_evidence: ${e.agent_id}`);
    seen.add(e.agent_id);
  }
  if (reasons.length) throw new EvidenceContractError(reasons);

  const ordered = canonicalOrder(raw);

  // 2. Freshness against the explicit policy (never against wall-clock "now").
  const refs: EvidenceRef[] = [];
  for (const e of ordered) {
    const ttl = evidenceTtlMinutes(e.agent_id, e.timeframe);
    const age = minutesBetween(ctx.as_of, e.as_of);
    refs.push({
      agent_id: e.agent_id,
      agent_version: e.agent_version,
      run_id: e.run_id,
      evidence_hash: e.evidence_hash ?? await evidenceHash(e),
      authority_rank: authorityRankOf(e.agent_id),
      status: e.status,
      stale: age > ttl || e.status === "stale",
      age_minutes: age,
      ttl_minutes: ttl,
    });
  }
  const refOf = (id: string) => refs.find((r) => r.agent_id === id)!;

  // 3. Coverage.
  const present = ordered.map((e) => e.agent_id);
  const expected = ctx.expected_agents ?? EXPECTED_AGENTS_V1;
  const missing = expected.filter((a) => !present.includes(a));
  const unexpected = present.filter((a) => !RON_AGENT_IDS.includes(a));

  // 4. Data health. Only source-health-authoritative agents bind the decision;
  //    Falconer's own health can never blockade RON.
  const rank = { healthy: 0, degraded: 1, critical: 2 } as const;
  const worseOf = (a: keyof typeof rank, b: keyof typeof rank) => (rank[a] >= rank[b] ? a : b);
  let worst: keyof typeof rank = "healthy";
  let authWorst: keyof typeof rank = "healthy";
  const issues: string[] = [];
  for (const e of ordered) {
    worst = worseOf(worst, e.data_health.status);
    if (agentSpec(e.agent_id)!.source_health_authoritative) {
      authWorst = worseOf(authWorst, e.data_health.status);
    }
    for (const i of e.data_health.issues) issues.push(`${e.agent_id}: ${i}`);
  }
  const staleAgents = refs.filter((r) => r.stale).map((r) => r.agent_id);

  // 5. Blocking conditions — authority classes 1 and 2 only.
  const blocking: string[] = [];
  for (const e of ordered) {
    const spec = agentSpec(e.agent_id)!;
    const binding = authorityRankOf(e.agent_id) <= 2 || spec.source_health_authoritative;
    if (!binding || spec.non_authoritative) continue;
    if (e.data_health.status === "critical") blocking.push(`critical_data_health: ${e.agent_id}`);
    if (e.status === "blocked") blocking.push(`blocked_evidence: ${e.agent_id}`);
    if (refOf(e.agent_id).stale) blocking.push(`stale_authoritative_evidence: ${e.agent_id}`);
  }

  // 6. Disagreements. Directional conflict is RECORDED, never averaged or voted away.
  const disagreements: Disagreement[] = [];
  const agreements: string[] = [];
  const directional = ordered.filter(
    (e) => e.direction && !["neutral", "unknown"].includes(e.direction)
      && e.status === "supported",
  );
  const authoritativeDirections = directional.filter((e) => !agentSpec(e.agent_id)!.non_authoritative);
  const distinct = [...new Set(authoritativeDirections.map((e) => e.direction as string))].sort();
  if (distinct.length > 1) {
    disagreements.push({
      kind: "directional",
      agents: authoritativeDirections.map((e) => e.agent_id).sort(),
      detail: `directional disagreement: ${distinct.join(" vs ")}`,
      non_binding: false,
    });
  } else if (distinct.length === 1 && authoritativeDirections.length > 1) {
    agreements.push(`directional agreement: ${distinct[0]}`);
  }
  // Falconer disagreement is strategy context only and can never bind the state.
  for (const e of directional.filter((x) => agentSpec(x.agent_id)!.non_authoritative)) {
    if (distinct.length === 1 && e.direction !== distinct[0]) {
      disagreements.push({
        kind: "strategy",
        agents: [e.agent_id, ...authoritativeDirections.map((a) => a.agent_id)].sort(),
        detail: `strategy context (${e.agent_id}) reports ${e.direction} against ${distinct[0]}; non-authoritative`,
        non_binding: true,
      });
    }
  }
  for (const e of ordered) {
    for (const c of e.conflicts) {
      disagreements.push({
        kind: "declared_conflict", agents: [e.agent_id], detail: `${e.agent_id}: ${c}`,
        non_binding: agentSpec(e.agent_id)!.non_authoritative,
      });
    }
  }
  if (authWorst !== "healthy") {
    disagreements.push({
      kind: "data_health", agents: ordered.map((e) => e.agent_id).sort(),
      detail: `authoritative data health: ${authWorst}`, non_binding: false,
    });
  }

  // 7. State machine, in strict precedence order.
  const supportedCount = ordered.filter((e) => e.status === "supported").length;
  const bindingDisagreement = disagreements.some((d) => d.kind === "directional" && !d.non_binding);
  let state: RonDecisionState;
  if (blocking.length) state = "DATA_BLOCKED";
  else if (missing.length || supportedCount === 0) state = "INSUFFICIENT_EVIDENCE";
  else if (bindingDisagreement) state = "CONFLICTING_CONTEXT";
  else if (present.includes("opportunity_risk")) state = "OPPORTUNITY_INCOMPLETE";
  else if (
    ordered.some((e) => agentSpec(e.agent_id)!.authority_class === "contextual" && e.status === "supported")
  ) state = "CONTEXT_SUPPORTED";
  else state = "RESEARCH_ONLY";

  // Opportunity can NEVER be complete while nothing is promoted.
  if (PROMOTED_STATE_VARIABLES.length !== 0) {
    throw new Error("orchestrator_v1_invariant: promoted state variables require a new contract");
  }

  const direction: QualitativeDirection =
    state === "DATA_BLOCKED" || state === "INSUFFICIENT_EVIDENCE" ? "unknown"
      : bindingDisagreement ? "mixed"
        : distinct.length === 1 ? (distinct[0] as QualitativeDirection)
          : "neutral";

  const decisionCore = {
    decision_schema_version: RON_DECISION_SCHEMA_VERSION,
    orchestrator_version: RON_ORCHESTRATOR_VERSION,
    evidence_schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    registry_hash: await registryHash(),
    ttl_policy_version: EVIDENCE_TTL_POLICY_V1.policy_version,
    trace_id: ctx.trace_id,
    instrument: ctx.instrument,
    timeframe: ctx.timeframe,
    as_of: ctx.as_of,
    state,
    recommendation: STATE_RECOMMENDATION[state],
    direction,
    numeric_probability: null as null,
    execution_allowed: false as const,
    execution_path: "signal_only" as const,
    data_health: {
      worst_status: worst, authoritative_worst_status: authWorst,
      stale_agents: [...staleAgents].sort(), issues: [...issues].sort(),
    },
    coverage: {
      present_agents: [...present].sort(),
      missing_expected_agents: [...missing].sort(),
      unexpected_agents: [...unexpected].sort(),
    },
    agreements: [...agreements].sort(),
    disagreements,
    blocking_reasons: [...new Set(blocking)].sort(),
    promoted_state_variables: [...PROMOTED_STATE_VARIABLES],
    evidence_refs: refs,
  };

  const decision_hash = await hashCanonical(decisionCore);
  const decision_id = decision_hash.slice(0, 32);
  const decision: RonDecisionStateV1 = { ...decisionCore, decision_id, decision_hash };

  const explanation = await buildExplanation(decision, ordered);
  return { decision, explanation };
}

/* ---------------------------------------------------------- explanation */

/**
 * Deterministic Ask RON explanation payload. Every line is composed ONLY from tokens
 * that already exist in the accepted evidence or in the decision. It never introduces a
 * probability, price, timestamp, source, event or direction, never converts association
 * or event timing into causation, never hides a disagreement and never presents Falconer
 * as ground truth. `assertGrounded` enforces this at build time (fail closed).
 */
export async function buildExplanation(
  decision: Omit<RonDecisionStateV1, "explanation_hash"> & { decision_hash: string },
  evidence: EvidenceEnvelopeV1[],
): Promise<AskRONExplanationPayloadV1> {
  const why: string[] = [`state: ${decision.state}`, `recommendation: ${decision.recommendation}`];
  for (const e of canonicalOrder(evidence)) {
    const spec = agentSpec(e.agent_id)!;
    const suffix = spec.non_authoritative
      ? " [strategy context only, not ground truth]"
      : ` [authority: ${spec.authority_class}]`;
    why.push(`${e.agent_id}: status=${e.status}${e.direction ? `, direction=${e.direction}` : ""}${suffix}`);
  }
  if (decision.direction === "unknown" || decision.direction === "mixed") {
    why.push(`qualitative direction: ${decision.direction}`);
  }
  why.push("no calibrated conditional probability exists: zero promoted state variables");

  const what_would_change: string[] = [];
  if (decision.coverage.missing_expected_agents.length) {
    what_would_change.push(
      `evidence from: ${decision.coverage.missing_expected_agents.join(", ")}`,
    );
  }
  if (decision.data_health.stale_agents.length) {
    what_would_change.push(`fresher evidence from: ${decision.data_health.stale_agents.join(", ")}`);
  }
  if (decision.blocking_reasons.length) {
    what_would_change.push(`resolution of: ${decision.blocking_reasons.join("; ")}`);
  }
  what_would_change.push("a promoted state variable from an accepted research run");

  const missing_or_conflicting = [
    ...decision.coverage.missing_expected_agents.map((a) => `missing specialist: ${a}`),
    ...decision.disagreements.map(
      (d) => `${d.kind}${d.non_binding ? " (non-binding)" : ""}: ${d.detail}`,
    ),
  ];

  const data_health = [
    `worst: ${decision.data_health.worst_status}`,
    `authoritative worst: ${decision.data_health.authoritative_worst_status}`,
    ...decision.data_health.issues,
  ];

  const source_refs = [...new Set(
    evidence.flatMap((e) => [
      ...e.provenance_refs,
      ...Object.keys(e.source_timestamps).map((k) => `${e.agent_id}:${k}`),
    ]),
  )].sort();

  const core = {
    explanation_schema_version: RON_EXPLANATION_SCHEMA_VERSION,
    decision_id: decision.decision_id,
    trace_id: decision.trace_id,
    instrument: decision.instrument,
    timeframe: decision.timeframe,
    as_of: decision.as_of,
    state: decision.state,
    recommendation: decision.recommendation,
    direction: decision.direction,
    why, what_would_change, missing_or_conflicting, data_health, source_refs,
  };

  const grounding = assertGrounded(core, evidence, decision);
  if (grounding.length) throw new EvidenceContractError(grounding.map((g) => `explanation_ungrounded: ${g}`));

  return { ...core, explanation_hash: await hashCanonical(core) };
}

const CAUSAL_PHRASES = [
  "because", "caused", "causes", "due to", "therefore", "led to", "resulted in",
  "drove", "as a result", "so it will", "which means it will",
];

/** Returns every grounding violation found in an explanation payload. */
export function assertGrounded(
  payload: Record<string, unknown>,
  evidence: EvidenceEnvelopeV1[],
  decision: { as_of: string; timeframe: string; direction: string },
): string[] {
  const bad: string[] = [];

  const allowedTimestamps = new Set<string>([decision.as_of]);
  const allowedNumbers = new Set<string>();
  const allowedDirections = new Set<string>(["neutral", "unknown", "mixed", decision.direction]);
  for (const e of evidence) {
    allowedTimestamps.add(e.as_of);
    for (const v of Object.values(e.source_timestamps)) allowedTimestamps.add(v);
    if (e.direction) allowedDirections.add(e.direction);
    for (const o of e.observations) {
      if (o.at) allowedTimestamps.add(o.at);
      if (typeof o.value_num === "number") allowedNumbers.add(String(o.value_num));
      if (o.value_text) for (const n of o.value_text.match(/\d+(?:\.\d+)?/g) ?? []) allowedNumbers.add(n);
    }
    for (const n of e.timeframe.match(/\d+(?:\.\d+)?/g) ?? []) allowedNumbers.add(n);
  }
  for (const n of decision.timeframe.match(/\d+(?:\.\d+)?/g) ?? []) allowedNumbers.add(n);

  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(payload);

  for (const s of strings) {
    const lower = s.toLowerCase();
    for (const p of CAUSAL_PHRASES) {
      if (lower.includes(p)) bad.push(`causal_overclaim "${p}" in "${s}"`);
    }
    if (/\d\s*%/.test(s) || /\bprobab|\bconfidence\b|\blikelihood\b|\bodds\b/i.test(s)) {
      bad.push(`probability_language in "${s}"`);
    }
    // Timestamps must exist in evidence or the decision.
    for (const t of s.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g) ?? []) {
      if (!allowedTimestamps.has(t)) bad.push(`ungrounded_timestamp ${t}`);
    }
    // Direction words must be supportable.
    for (const d of ["long", "short"]) {
      const re = new RegExp(`\\b${d}\\b`);
      if (re.test(lower) && !allowedDirections.has(d)) bad.push(`ungrounded_direction ${d} in "${s}"`);
    }
    // Any remaining numeric token must exist in the evidence (prices included).
    const stripped = s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "");
    for (const n of stripped.match(/\d+(?:\.\d+)?/g) ?? []) {
      if (!allowedNumbers.has(n)) bad.push(`ungrounded_number ${n} in "${s}"`);
    }
  }
  return bad;
}

/* -------------------------------------------------------- reconstruction */

/**
 * Pure replay: rebuild a decision from stored evidence envelopes alone and return the
 * recomputed hashes. Identity with the stored hashes proves no hidden state.
 */
export async function reconstructDecision(
  storedEvidence: EvidenceEnvelopeV1[],
  ctx: OrchestrationContext,
): Promise<{ decision: RonDecisionStateV1; explanation: AskRONExplanationPayloadV1 }> {
  return await synthesizeDecision(storedEvidence, ctx);
}

/** Registry rows for persistence — one per specialist, versioned and hashed. */
export function registryRows() {
  return RON_AGENT_REGISTRY.map((a) => ({
    agent_id: a.agent_id,
    agent_version: a.agent_version,
    authority_class: a.authority_class,
    authority_rank: authorityRankOf(a.agent_id),
    non_authoritative: a.non_authoritative,
    source_health_authoritative: a.source_health_authoritative,
    ttl_multiplier: a.ttl_multiplier,
    purpose: a.purpose,
    registry_version: 1,
  }));
}