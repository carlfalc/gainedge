/**
 * RON post-K1 orchestration run — Coordination Plan V1 (implementation marker 2D.2l).
 *
 * PURE module. It contains no I/O, no database client, no network call and no secret.
 * It only describes, deterministically:
 *   1. WHICH of the seven registered specialists are called, in WHICH order, and with
 *      which anchor parameter and subject scope;
 *   2. HOW a per-agent run identity is derived from (trace_id, anchor, agent_id) so an
 *      identical replay produces byte-identical run identities;
 *   3. WHETHER a collected Evidence V1 batch is a complete, non-duplicated, correctly
 *      anchored seven-agent collection (fail closed otherwise);
 *   4. WHICH audit rows may be persisted, plus a fail-closed scan that rejects any
 *      secret / JWT / user-sensitive Falconer field before it can reach the database.
 *
 * It does NOT change orchestration semantics, EXPECTED_AGENTS_V1, registry authority,
 * TTLs, calibration/research artifacts, Falconer strategy logic or execution behaviour.
 */
import {
  authorityRankOf, hashCanonical,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type {
  AskRONExplanationPayloadV1, OrchestrationContext, RonDecisionStateV1,
} from "./ron-orchestrator.ts";

export const RON_ORCHESTRATION_RUN_VERSION = 1;

export class OrchestrationRunError extends Error {
  override readonly name = "OrchestrationRunError";
  constructor(readonly reasons: string[]) {
    super(`orchestration_run_contract_violation: ${reasons.join("; ")}`);
  }
}

/* -------------------------------------------------------------- call plan */

export interface AgentCallPlanEntry {
  agent_id: RonAgentId;
  /** Existing deployed specialist endpoint. No new specialist is introduced. */
  function_name: string;
  /** 1 = independent producer, 2 = derived (consumes phase-1 sealed evidence). */
  phase: 1 | 2;
  /** Body field this specialist reads the explicit anchor from. */
  anchor_param: "as_of" | "evaluation_anchor";
  /**
   * `caller_subject_bound` agents are read through the CALLER's JWT under RLS. When no
   * verified authenticated subject is present the call is still made, without any user
   * token, and the specialist fails closed as unavailable. It is never omitted, never
   * service-role scanned across users and never fabricated.
   */
  subject_scope: "subject_independent" | "caller_subject_bound";
  /** True when the specialist requires the phase-1 sealed envelopes as input. */
  requires_evidence_batch: boolean;
}

const PLAN: readonly AgentCallPlanEntry[] = [
  {
    agent_id: "session_market_structure", function_name: "ron-agent-session-structure",
    phase: 1, anchor_param: "as_of", subject_scope: "subject_independent",
    requires_evidence_batch: false,
  },
  {
    agent_id: "calibration_model_validation", function_name: "ron-agent-calibration-validation",
    phase: 1, anchor_param: "as_of", subject_scope: "subject_independent",
    requires_evidence_batch: false,
  },
  {
    agent_id: "pattern_context", function_name: "ron-agent-pattern-context",
    phase: 1, anchor_param: "as_of", subject_scope: "subject_independent",
    requires_evidence_batch: false,
  },
  {
    agent_id: "cross_asset_correlation", function_name: "ron-agent-cross-asset-correlation",
    phase: 1, anchor_param: "as_of", subject_scope: "subject_independent",
    requires_evidence_batch: false,
  },
  {
    agent_id: "macro_news_geopolitics", function_name: "ron-agent-macro-news-geopolitics",
    phase: 1, anchor_param: "evaluation_anchor", subject_scope: "subject_independent",
    requires_evidence_batch: false,
  },
  {
    agent_id: "falconer_signal_source", function_name: "ron-agent-falconer-signal-source",
    phase: 1, anchor_param: "evaluation_anchor", subject_scope: "caller_subject_bound",
    requires_evidence_batch: false,
  },
  {
    agent_id: "opportunity_risk", function_name: "ron-agent-opportunity-risk",
    phase: 2, anchor_param: "evaluation_anchor", subject_scope: "subject_independent",
    requires_evidence_batch: true,
  },
] as const;

/** Canonical call order: phase, then authority rank, then agent_id. Input-order free. */
export const ORCHESTRATION_RUN_PLAN_V1: readonly AgentCallPlanEntry[] = [...PLAN].sort((a, b) => {
  if (a.phase !== b.phase) return a.phase - b.phase;
  const ra = authorityRankOf(a.agent_id), rb = authorityRankOf(b.agent_id);
  if (ra !== rb) return ra - rb;
  return a.agent_id < b.agent_id ? -1 : 1;
});

export const ORCHESTRATION_RUN_PLAN_AGENTS: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V1.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V1 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION,
  purpose: "explicitly invoked seven-agent collection + deterministic orchestration + opt-in audit persistence",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  /**
   * The existing audit schema exposes no multi-table transaction boundary to an edge
   * function. Persistence is therefore ORDERED + IDEMPOTENT (content-addressed upserts
   * that ignore duplicates), NOT atomic. This limitation is declared rather than hidden.
   */
  persistence_atomicity: "ordered_idempotent_upserts_not_transactional",
  persistence_order: ["ron_agent_registry", "ron_agent_runs", "ron_agent_evidence",
    "ron_orchestrator_decisions", "ron_decision_evidence"],
  plan: ORCHESTRATION_RUN_PLAN_V1,
} as const;

export const orchestrationRunPlanHash = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V1 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/**
 * Deterministic per-agent run identity. Same trace + anchor + agent ⇒ same run_id, so a
 * replay cannot create a second semantic run row for the same logical work.
 */
export async function deriveRunId(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ron_orch_run_v1|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIds(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V1) {
    out[p.agent_id] = await deriveRunId(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------------------------------ collection checks */

/** Fail closed unless the batch is exactly the planned seven, correctly anchored. */
export function assertCollectionComplete(
  batch: EvidenceEnvelopeV1[], ctx: OrchestrationContext,
): void {
  const reasons: string[] = [];
  if (!Array.isArray(batch)) throw new OrchestrationRunError(["evidence_batch_not_array"]);

  const seen = new Set<string>();
  for (const e of batch) {
    if (seen.has(e?.agent_id)) reasons.push(`duplicate_agent_evidence: ${e.agent_id}`);
    seen.add(e?.agent_id);
    if (!ORCHESTRATION_RUN_PLAN_AGENTS.includes(e?.agent_id)) {
      reasons.push(`unplanned_agent_evidence: ${String(e?.agent_id)}`);
    }
    if (!e?.evidence_hash) reasons.push(`unsealed_evidence: ${String(e?.agent_id)}`);
    if (e?.trace_id !== ctx.trace_id) reasons.push(`trace_id_mismatch: ${String(e?.agent_id)}`);
    if (e?.instrument !== ctx.instrument) reasons.push(`instrument_mismatch: ${String(e?.agent_id)}`);
    if (e?.timeframe !== ctx.timeframe) reasons.push(`timeframe_mismatch: ${String(e?.agent_id)}`);
    if (e?.as_of && Date.parse(e.as_of) > Date.parse(ctx.as_of)) {
      reasons.push(`evidence_after_anchor: ${String(e?.agent_id)}`);
    }
  }
  for (const a of ORCHESTRATION_RUN_PLAN_AGENTS) {
    if (!seen.has(a)) reasons.push(`missing_planned_agent: ${a}`);
  }
  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());
}

/* ------------------------------------------------- sensitive-content guard */

/** Substrings that must never appear anywhere in a persisted payload. */
const FORBIDDEN_SUBSTRINGS: readonly string[] = [
  "authorization", "bearer ", "access_token", "refresh_token", "service_role",
  "apikey", "api_key", "password", "eyj",
];

/** Field names that must never appear as a key in a persisted payload. */
const FORBIDDEN_KEYS: readonly string[] = [
  "user_id", "account_id", "metaapi_account_id", "metaapi_position_ids", "broker_deal_ids",
  "login_id", "encrypted_password", "balance", "equity", "pnl_usd", "commission_usd",
  "swap_usd", "entry_price", "actual_entry_price", "actual_exit_price", "sl_price",
  "tp1_price", "tp2_price", "tp3_price", "be_level", "qty", "qty1", "qty2", "qty3",
  "notes", "tags", "raw_alert_payload", "pineconnector_license", "jwt", "token",
];

function walkKeys(value: unknown, hit: (key: string) => void): void {
  if (Array.isArray(value)) { for (const v of value) walkKeys(v, hit); return; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      hit(k.toLowerCase());
      walkKeys(v, hit);
    }
  }
}

/** Fail closed BEFORE any write if a payload carries secret or user-sensitive content. */
export function assertPersistSafe(payload: unknown, label: string): void {
  const reasons: string[] = [];
  const serialized = JSON.stringify(payload ?? null).toLowerCase();
  for (const s of FORBIDDEN_SUBSTRINGS) {
    if (serialized.includes(s)) reasons.push(`${label}: forbidden_content:${s.trim()}`);
  }
  walkKeys(payload, (k) => {
    if (FORBIDDEN_KEYS.includes(k)) reasons.push(`${label}: forbidden_key:${k}`);
  });
  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());
}

/* ------------------------------------------------------- persistence rows */

export interface PersistencePlan {
  runs: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  decision: Record<string, unknown>;
  links: Record<string, unknown>[];
}

/**
 * Pure mapping of sealed evidence + decision onto the EXISTING audit schema. No new
 * table, no new column, no probability, no execution allowance.
 */
export function buildPersistencePlan(
  sealed: EvidenceEnvelopeV1[],
  decision: RonDecisionStateV1,
  explanation: AskRONExplanationPayloadV1,
): PersistencePlan {
  const plan: PersistencePlan = {
    runs: sealed.map((e) => ({
      run_id: e.run_id, trace_id: e.trace_id, agent_id: e.agent_id,
      agent_version: e.agent_version, schema_version: e.schema_version,
      instrument: e.instrument, timeframe: e.timeframe, as_of: e.as_of,
    })),
    evidence: sealed.map((e) => ({
      evidence_hash: e.evidence_hash, schema_version: e.schema_version, run_id: e.run_id,
      trace_id: e.trace_id, agent_id: e.agent_id, agent_version: e.agent_version,
      instrument: e.instrument, timeframe: e.timeframe, as_of: e.as_of,
      source_timestamps: e.source_timestamps, observations: e.observations,
      provenance_refs: e.provenance_refs, data_health: e.data_health,
      uncertainty: e.uncertainty, conflicts: e.conflicts, dependencies: e.dependencies,
      status: e.status, direction: e.direction ?? null, recommendation: e.recommendation,
      envelope: e,
    })),
    decision: {
      decision_id: decision.decision_id, decision_hash: decision.decision_hash,
      explanation_hash: explanation.explanation_hash, trace_id: decision.trace_id,
      orchestrator_version: decision.orchestrator_version,
      decision_schema_version: decision.decision_schema_version,
      evidence_schema_version: decision.evidence_schema_version,
      registry_hash: decision.registry_hash,
      ttl_policy_version: decision.ttl_policy_version,
      instrument: decision.instrument, timeframe: decision.timeframe, as_of: decision.as_of,
      state: decision.state, recommendation: decision.recommendation,
      direction: decision.direction,
      numeric_probability: null, execution_allowed: false, execution_path: "signal_only",
      decision, explanation,
    },
    links: decision.evidence_refs.map((r, i) => ({
      decision_id: decision.decision_id, evidence_hash: r.evidence_hash, ordinal: i,
      authority_rank: r.authority_rank, agent_id: r.agent_id,
    })),
  };

  assertPersistSafe(plan, "persistence_plan");
  return plan;
}
