/**
 * RON Phase 2D.2a — Agentic Core v1: EVIDENCE CONTRACT V1 + SPECIALIST REGISTRY.
 *
 * Pure, deterministic, dependency-free. No I/O, no clock reads, no trading behaviour.
 *
 * This module is the single source of truth for:
 *   1. the seven specialist agent ids, their versions and their AUTHORITY class,
 *   2. the strict Evidence V1 envelope schema and its fail-closed validator,
 *   3. canonical serialization + content hashing used for persistence and replay.
 *
 * TRUTHFULNESS INVARIANTS (enforced, not documented):
 *   - No numeric probability/confidence anywhere in an envelope. Research V4 promoted
 *     ZERO state variables, so RON has no calibrated conditional probability to emit.
 *   - No free-form causal assertion. Macro/news evidence may report timing, source,
 *     surprise and observed reaction; it may not claim causation as fact.
 *   - No secrets, tokens, credentials, broker/account identifiers, balances or equity.
 *   - Unknown schema_version, agent_id or agent_version FAILS CLOSED.
 */

export const RON_EVIDENCE_SCHEMA_VERSION = 1;
export const RON_AGENT_REGISTRY_VERSION = 1;

/* ------------------------------------------------------------------ registry */

export type RonAgentId =
  | "session_market_structure"
  | "pattern_context"
  | "cross_asset_correlation"
  | "macro_news_geopolitics"
  | "opportunity_risk"
  | "calibration_model_validation"
  | "falconer_signal_source";

/**
 * Deterministic authority classes. Precedence is by RANK (lower wins on factual
 * conflict). Authority is NEVER resolved by averaging confidences or majority vote.
 */
export type AuthorityClass =
  | "source_data_health"            // rank 1
  | "calibration_validation"        // rank 2
  | "deterministic_market_structure"// rank 3
  | "contextual"                    // rank 4
  | "opportunity_construction"      // rank 5
  | "strategy_context";             // rank 6 (lowest)

export const AUTHORITY_RANK: Record<AuthorityClass, number> = {
  source_data_health: 1,
  calibration_validation: 2,
  deterministic_market_structure: 3,
  contextual: 4,
  opportunity_construction: 5,
  strategy_context: 6,
};

export interface AgentSpec {
  agent_id: RonAgentId;
  agent_version: number;
  authority_class: AuthorityClass;
  purpose: string;
  /** True when the agent may never establish a fact that binds the orchestrator. */
  non_authoritative: boolean;
  /** May this agent's `data_health` block bind orchestrator source-health decisions? */
  source_health_authoritative: boolean;
  /** Evidence lifetime multiplier applied to the timeframe TTL. */
  ttl_multiplier: number;
}

/** The seven specialists. RON itself is the ORCHESTRATOR, not a peer specialist. */
export const RON_AGENT_REGISTRY: readonly AgentSpec[] = [
  {
    agent_id: "session_market_structure",
    agent_version: 1,
    authority_class: "deterministic_market_structure",
    purpose: "Deterministic session/venue and market-structure observations from genuine bars.",
    non_authoritative: false,
    source_health_authoritative: true,
    ttl_multiplier: 1,
  },
  {
    agent_id: "pattern_context",
    agent_version: 1,
    authority_class: "contextual",
    purpose: "Qualitative pattern context; never a predictive claim.",
    non_authoritative: false,
    source_health_authoritative: false,
    ttl_multiplier: 1,
  },
  {
    agent_id: "cross_asset_correlation",
    agent_version: 1,
    authority_class: "contextual",
    purpose: "Observed cross-asset co-movement context, reported as association only.",
    non_authoritative: false,
    source_health_authoritative: false,
    ttl_multiplier: 2,
  },
  {
    agent_id: "macro_news_geopolitics",
    agent_version: 1,
    authority_class: "contextual",
    purpose: "Event timing, source and observed market reaction. Never causation as fact.",
    non_authoritative: false,
    source_health_authoritative: false,
    ttl_multiplier: 4,
  },
  {
    agent_id: "opportunity_risk",
    agent_version: 1,
    authority_class: "opportunity_construction",
    purpose: "Assembles qualitative opportunity context; cannot complete one without promoted variables.",
    non_authoritative: false,
    source_health_authoritative: false,
    ttl_multiplier: 1,
  },
  {
    agent_id: "calibration_model_validation",
    agent_version: 1,
    authority_class: "calibration_validation",
    purpose: "Validity/staleness of the accepted calibration and research lineage.",
    non_authoritative: false,
    source_health_authoritative: true,
    ttl_multiplier: 8,
  },
  {
    agent_id: "falconer_signal_source",
    agent_version: 1,
    authority_class: "strategy_context",
    purpose:
      "STRATEGY CONTEXT ONLY. Surfaces Falconer status/signals. Non-authoritative: it can " +
      "never supply truth labels, calibration authority or source-health authority, and can " +
      "never override broker/market/calibration evidence.",
    non_authoritative: true,
    source_health_authoritative: false,
    ttl_multiplier: 1,
  },
] as const;

export const RON_AGENT_IDS = RON_AGENT_REGISTRY.map((a) => a.agent_id);

export function agentSpec(id: string): AgentSpec | undefined {
  return RON_AGENT_REGISTRY.find((a) => a.agent_id === id);
}

export function authorityRankOf(id: RonAgentId): number {
  return AUTHORITY_RANK[agentSpec(id)!.authority_class];
}

/** Falconer authority label, asserted explicitly so it can be tested. */
export const FALCONER_AUTHORITY = "strategy_context_only" as const;

/* ------------------------------------------------------------- TTL policy v1 */

export const EVIDENCE_TTL_POLICY_V1 = {
  policy_version: 1,
  /** Base freshness budget in minutes, keyed by evidence timeframe. */
  base_minutes_by_timeframe: { "1m": 5, "5m": 20, "15m": 60, "1h": 240, "4h": 720, "1d": 2880 } as Record<string, number>,
  /** Fallback when the timeframe is not in the table. */
  fallback_minutes: 60,
} as const;

export function evidenceTtlMinutes(agent_id: RonAgentId, timeframe: string): number {
  const base = EVIDENCE_TTL_POLICY_V1.base_minutes_by_timeframe[timeframe]
    ?? EVIDENCE_TTL_POLICY_V1.fallback_minutes;
  return base * agentSpec(agent_id)!.ttl_multiplier;
}

/* ------------------------------------------------------------- TTL policy v2 */

/**
 * Agents whose evidence `as_of` is an ARTIFACT CLOCK, not a market clock.
 *
 * `calibration_model_validation` reports the validity of a SEALED, accepted calibration /
 * research artifact. Its `as_of` is the artifact's immutable source instant, which by
 * construction never advances with market time. Measuring it against a market-freshness
 * budget is a category error: the evidence is not "stale market data", it is a correctly
 * dated statement about a frozen artifact. Its own `status` / `data_health` remain the
 * authoritative statement of whether that artifact is still acceptable, and TTL policy v2
 * changes nothing about those.
 */
export const ARTIFACT_CLOCK_AGENTS: readonly RonAgentId[] = [
  "calibration_model_validation",
] as const;

/**
 * Forward-only TTL policy v2. Identical market-freshness budgets to v1; the ONLY delta is
 * that artifact-clock agents are exempt from the market-clock TTL. Policy v1 is frozen and
 * remains the default for every run that does not explicitly opt in.
 */
export const EVIDENCE_TTL_POLICY_V2 = {
  policy_version: 2,
  base_minutes_by_timeframe: EVIDENCE_TTL_POLICY_V1.base_minutes_by_timeframe,
  fallback_minutes: EVIDENCE_TTL_POLICY_V1.fallback_minutes,
  supersedes_policy_version: EVIDENCE_TTL_POLICY_V1.policy_version,
  artifact_clock_agents: ARTIFACT_CLOCK_AGENTS,
  artifact_clock_exempt_from_market_ttl: true,
  market_clock_budgets_changed: false,
  health_or_status_gates_changed: false,
} as const;

export function isArtifactClockAgent(agent_id: RonAgentId): boolean {
  return ARTIFACT_CLOCK_AGENTS.includes(agent_id);
}

/**
 * Finite, JSON-safe, deterministic exemption sentinel (10 years in minutes). A non-finite
 * value could not be canonically hashed or persisted, so the exemption is expressed as an
 * explicit, replayable budget no genuine artifact age can exceed.
 */
export const ARTIFACT_CLOCK_TTL_SENTINEL_MINUTES = 5_256_000;

export function evidenceTtlMinutesV2(agent_id: RonAgentId, timeframe: string): number {
  if (isArtifactClockAgent(agent_id)) return ARTIFACT_CLOCK_TTL_SENTINEL_MINUTES;
  return evidenceTtlMinutes(agent_id, timeframe);
}

/** Resolve the registered TTL under an explicit policy version. Unknown -> v1. */
export function resolveEvidenceTtlMinutes(
  policy_version: number, agent_id: RonAgentId, timeframe: string,
): number {
  return policy_version === EVIDENCE_TTL_POLICY_V2.policy_version
    ? evidenceTtlMinutesV2(agent_id, timeframe)
    : evidenceTtlMinutes(agent_id, timeframe);
}

/* ------------------------------------------------------------ evidence types */

export type EvidenceStatus =
  | "supported" | "insufficient_data" | "conflicting" | "stale" | "blocked";

export type QualitativeDirection = "long" | "short" | "neutral" | "mixed" | "unknown";

export type UncertaintyLevel = "low" | "moderate" | "high" | "unquantified";

/** Allowed recommendations for this non-production phase. No trade actions exist. */
export type RecommendationV1 =
  | "observe" | "wait" | "research_only" | "context_only"
  | "opportunity_incomplete" | "no_action";

export const RECOMMENDATIONS_V1: readonly RecommendationV1[] = [
  "observe", "wait", "research_only", "context_only", "opportunity_incomplete", "no_action",
] as const;

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  "supported", "insufficient_data", "conflicting", "stale", "blocked",
] as const;

export const DIRECTIONS: readonly QualitativeDirection[] = [
  "long", "short", "neutral", "mixed", "unknown",
] as const;

export const UNCERTAINTY_LEVELS: readonly UncertaintyLevel[] = [
  "low", "moderate", "high", "unquantified",
] as const;

/** Structured observation. Deliberately NOT free prose and NOT a causal statement. */
export type ObservationKind = "measurement" | "state" | "event" | "reference";

export const OBSERVATION_KINDS: readonly ObservationKind[] = [
  "measurement", "state", "event", "reference",
] as const;

export interface Observation {
  key: string;
  kind: ObservationKind;
  /** Numeric measurement value (never a probability — see the denylist). */
  value_num?: number;
  /** Enumerated/textual state or reference id. Short tokens only. */
  value_text?: string;
  unit?: string;
  /** UTC ISO instant the observation refers to. */
  at?: string;
}

export interface DataHealth {
  status: "healthy" | "degraded" | "critical";
  /** Age of the newest underlying source datum, in minutes. */
  freshness_minutes: number;
  /** 0..1 fraction of the expected source rows present. */
  completeness: number;
  issues: string[];
}

export interface Uncertainty {
  level: UncertaintyLevel;
  limitations: string[];
}

export interface EvidenceEnvelopeV1 {
  schema_version: number;
  agent_id: RonAgentId;
  agent_version: number;
  run_id: string;
  trace_id: string;
  instrument: string;
  timeframe: string;
  /** UTC ISO instant the evidence describes. */
  as_of: string;
  /** Named UTC ISO source instants backing the evidence. */
  source_timestamps: Record<string, string>;
  observations: Observation[];
  /** Accepted-artifact or genuine-source references (ids only, never credentials). */
  provenance_refs: string[];
  data_health: DataHealth;
  uncertainty: Uncertainty;
  conflicts: string[];
  dependencies: string[];
  status: EvidenceStatus;
  direction?: QualitativeDirection;
  recommendation: RecommendationV1;
  /** Filled by `sealEvidence`; excluded from its own hash preimage. */
  evidence_hash?: string;
}

/* ----------------------------------------------------- canonical hashing */

/** Deterministic serialization: object keys sorted, arrays order-preserving. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export async function hashCanonical(value: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(value)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Content hash of an envelope, computed over everything EXCEPT `evidence_hash`. */
export async function evidenceHash(e: EvidenceEnvelopeV1): Promise<string> {
  const { evidence_hash: _drop, ...rest } = e;
  return await hashCanonical(rest);
}

/** Validate then attach the content hash. Fails closed on any contract violation. */
export async function sealEvidence(e: EvidenceEnvelopeV1): Promise<EvidenceEnvelopeV1> {
  const errs = validateEvidence(e);
  if (errs.length) throw new EvidenceContractError(errs);
  return { ...e, evidence_hash: await evidenceHash(e) };
}

/* --------------------------------------------------------------- denylists */

/** Probability-like keys. Evidence V1 carries NO numeric probability of any kind. */
export const PROBABILITY_KEY_TOKENS = [
  "probability", "prob_", "confidence", "likelihood", "odds", "certainty",
  "win_rate", "expected_value", "edge_pct", "score_pct", "p_hit", "p_win",
] as const;

/** Secret / private-account shaped keys. Never persisted in evidence. */
export const SECRET_KEY_TOKENS = [
  "token", "secret", "api_key", "apikey", "password", "passphrase", "credential",
  "authorization", "bearer", "private_key", "account", "login", "balance", "equity",
  "broker", "metaapi", "license", "connection_id", "pineconnector",
] as const;

/** Keys that would let an agent assert causation as fact. */
export const CAUSAL_KEY_TOKENS = ["causal", "caused_by", "causes", "because"] as const;

const SECRET_VALUE_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,   // JWT
  /\bsk-[A-Za-z0-9]{16,}/,                        // API key
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
];

export interface DenylistHit { path: string; rule: string; }

/**
 * Token match on a WORD boundary. Substring matching would flag the envelope's own
 * `uncertainty` field via the "certainty" token, so a preceding letter disqualifies a hit.
 */
export function hasDeniedToken(key: string, tokens: readonly string[]): boolean {
  const norm = key.toLowerCase();
  return tokens.some((t) => new RegExp(`(^|[^a-z])${t}`).test(norm));
}

/** Recursive key/value denylist scan over an arbitrary payload. */
export function scanDenylist(value: unknown, path = "$"): DenylistHit[] {
  const hits: DenylistHit[] = [];
  if (typeof value === "string") {
    for (const re of SECRET_VALUE_PATTERNS) {
      if (re.test(value)) hits.push({ path, rule: "secret_value_shape" });
    }
    return hits;
  }
  if (value === null || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...scanDenylist(v, `${path}[${i}]`)));
    return hits;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const norm = k.toLowerCase();
    const p = `${path}.${k}`;
    if (hasDeniedToken(norm, PROBABILITY_KEY_TOKENS)) {
      hits.push({ path: p, rule: "probability_key_forbidden" });
    }
    if (hasDeniedToken(norm, SECRET_KEY_TOKENS)) {
      hits.push({ path: p, rule: "secret_or_private_account_key_forbidden" });
    }
    if (hasDeniedToken(norm, CAUSAL_KEY_TOKENS)) {
      hits.push({ path: p, rule: "causal_claim_key_forbidden" });
    }
    hits.push(...scanDenylist(v, p));
  }
  return hits;
}

/* -------------------------------------------------------------- validation */

export class EvidenceContractError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`evidence_contract_violation: ${reasons.join("; ")}`);
    this.name = "EvidenceContractError";
    this.reasons = reasons;
  }
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z$/;

export function isIsoUtc(s: unknown): boolean {
  return typeof s === "string" && ISO_UTC.test(s) && !Number.isNaN(Date.parse(s));
}

/** Deny-by-default validation. Returns EVERY reason, never just the first. */
export function validateEvidence(e: unknown): string[] {
  const r: string[] = [];
  if (e === null || typeof e !== "object" || Array.isArray(e)) return ["envelope_not_an_object"];
  const v = e as Record<string, unknown>;

  if (v.schema_version !== RON_EVIDENCE_SCHEMA_VERSION) {
    r.push(`unknown_schema_version: ${String(v.schema_version)}`);
  }
  const spec = typeof v.agent_id === "string" ? agentSpec(v.agent_id) : undefined;
  if (!spec) r.push(`unknown_agent_id: ${String(v.agent_id)}`);
  else if (v.agent_version !== spec.agent_version) {
    r.push(`unknown_agent_version: ${String(v.agent_id)}@${String(v.agent_version)}`);
  }

  for (const k of ["run_id", "trace_id", "instrument", "timeframe"]) {
    if (typeof v[k] !== "string" || !(v[k] as string).length) r.push(`missing_field: ${k}`);
  }
  if (!isIsoUtc(v.as_of)) r.push("as_of_not_utc_iso");

  const ts = v.source_timestamps;
  if (ts === null || typeof ts !== "object" || Array.isArray(ts)) r.push("source_timestamps_not_a_map");
  else {
    for (const [k, val] of Object.entries(ts as Record<string, unknown>)) {
      if (!isIsoUtc(val)) r.push(`source_timestamp_not_utc_iso: ${k}`);
    }
  }

  if (!Array.isArray(v.observations)) r.push("observations_not_an_array");
  else {
    (v.observations as unknown[]).forEach((o, i) => {
      if (o === null || typeof o !== "object" || Array.isArray(o)) {
        r.push(`observation_not_an_object: ${i}`); return;
      }
      const ob = o as Record<string, unknown>;
      if (typeof ob.key !== "string" || !ob.key.length) r.push(`observation_missing_key: ${i}`);
      else {
        const nk = ob.key.toLowerCase();
        if (hasDeniedToken(nk, PROBABILITY_KEY_TOKENS)) {
          r.push(`probability_key_forbidden at $.observations[${i}].key`);
        }
        if (hasDeniedToken(nk, SECRET_KEY_TOKENS)) {
          r.push(`secret_or_private_account_key_forbidden at $.observations[${i}].key`);
        }
        if (hasDeniedToken(nk, CAUSAL_KEY_TOKENS)) {
          r.push(`causal_claim_key_forbidden at $.observations[${i}].key`);
        }
      }
      if (!OBSERVATION_KINDS.includes(ob.kind as ObservationKind)) {
        r.push(`observation_unknown_kind: ${i}:${String(ob.kind)}`);
      }
      if (ob.value_num !== undefined && typeof ob.value_num !== "number") {
        r.push(`observation_value_num_not_number: ${i}`);
      }
      if (ob.value_num === undefined && typeof ob.value_text !== "string") {
        r.push(`observation_without_value: ${i}`);
      }
      if (ob.at !== undefined && !isIsoUtc(ob.at)) r.push(`observation_at_not_utc_iso: ${i}`);
    });
  }

  for (const k of ["provenance_refs", "conflicts", "dependencies"]) {
    if (!Array.isArray(v[k]) || (v[k] as unknown[]).some((x) => typeof x !== "string")) {
      r.push(`not_a_string_array: ${k}`);
    }
  }

  const dh = v.data_health as Record<string, unknown> | undefined;
  if (!dh || typeof dh !== "object") r.push("missing_data_health");
  else {
    if (!["healthy", "degraded", "critical"].includes(String(dh.status))) {
      r.push(`data_health_unknown_status: ${String(dh.status)}`);
    }
    if (typeof dh.freshness_minutes !== "number" || dh.freshness_minutes < 0) {
      r.push("data_health_freshness_invalid");
    }
    if (typeof dh.completeness !== "number" || dh.completeness < 0 || dh.completeness > 1) {
      r.push("data_health_completeness_invalid");
    }
    if (!Array.isArray(dh.issues)) r.push("data_health_issues_not_an_array");
  }

  const un = v.uncertainty as Record<string, unknown> | undefined;
  if (!un || typeof un !== "object") r.push("missing_uncertainty");
  else {
    if (!UNCERTAINTY_LEVELS.includes(un.level as UncertaintyLevel)) {
      r.push(`uncertainty_unknown_level: ${String(un.level)}`);
    }
    if (!Array.isArray(un.limitations)) r.push("uncertainty_limitations_not_an_array");
  }

  if (!EVIDENCE_STATUSES.includes(v.status as EvidenceStatus)) {
    r.push(`unknown_status: ${String(v.status)}`);
  }
  if (v.direction !== undefined && !DIRECTIONS.includes(v.direction as QualitativeDirection)) {
    r.push(`unknown_direction: ${String(v.direction)}`);
  }
  if (!RECOMMENDATIONS_V1.includes(v.recommendation as RecommendationV1)) {
    r.push(`unknown_recommendation: ${String(v.recommendation)}`);
  }

  // Falconer is strategy context only: it may never claim a supported factual state
  // about source health or calibration, and its own data_health is non-binding.
  if (spec?.non_authoritative) {
    if ((v.recommendation as string) === "context_only" && (v.status as string) === "blocked") {
      // allowed: it can report itself blocked
    }
    const claimsAuthority = (v.provenance_refs as string[] | undefined)?.some(
      (p) => typeof p === "string" && /^calibration_/.test(p),
    );
    if (claimsAuthority) r.push("non_authoritative_agent_cited_calibration_authority");
  }

  for (const hit of scanDenylist(v)) r.push(`${hit.rule} at ${hit.path}`);
  return r;
}

/** Registry identity hash — persisted with every decision so replay is auditable. */
export function registryPayload() {
  return {
    registry_version: RON_AGENT_REGISTRY_VERSION,
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    ttl_policy: EVIDENCE_TTL_POLICY_V1,
    authority_rank: AUTHORITY_RANK,
    agents: [...RON_AGENT_REGISTRY]
      .sort((a, b) => (a.agent_id < b.agent_id ? -1 : 1)),
  };
}

export async function registryHash(): Promise<string> {
  return await hashCanonical(registryPayload());
}