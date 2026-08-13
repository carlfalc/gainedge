/**
 * RON Phase 2D.2k — FALCONER SIGNAL SOURCE spec V1 (pure producer).
 *
 * ACCEPTANCE PATH 2D.2k = K1 (EXISTING JWT / RLS SUBJECT-BOUND READ).
 *
 * The 2D.2j-a gap is resolved WITHOUT new core orchestrator plumbing and WITHOUT any
 * service-role scan of user-scoped data:
 *   - The real production Falconer signal-state source is `falconer_trades`, which is
 *     user-scoped under RLS (`auth.uid() = user_id` for `authenticated` SELECT).
 *   - Signal state is therefore only ever read through a client instantiated with the
 *     CALLER's verified JWT, so Postgres RLS — not application code — is the isolation
 *     boundary. A request with no verified subject NEVER touches `falconer_trades` and
 *     reports `signal_state_available = false` (fail closed).
 *   - The subject is used only to authorize the read. The user id is never accepted from
 *     the request body, never stored, never passed into this pure producer and never
 *     represented in evidence, provenance, dependencies or hashes.
 *   - `falconer_engine_events` remains RUNTIME/EVENT-HEALTH CONTEXT ONLY. For XAUUSD it
 *     contains exclusively `stale_market_data` rows and ZERO `signal_created` rows, so it
 *     is provably not a signal-state source and is never treated as one.
 *
 * Historic note (2D.2j-a = B2), kept because it constrains this contract:
 *   - The real production Falconer signal-state source is `falconer_trades`, which the
 *     existing truthful badge helper (`src/lib/falconer-signal-state.ts`) and the
 *     Dashboard / Signals readers use. That table is USER-SCOPED under RLS.
 *   - RON internal specialists are instrument/timeframe scoped and carry NO accepted
 *     user/subject identity, so a service-role read of `falconer_trades` would merge or
 *     leak multiple users' rows. That is forbidden.
 *   - No safe view, function or endpoint exists that exposes current Falconer signal
 *     state without private/geometry fields.
 *   - `falconer_engine_events` is a RUNTIME/EVENT-HEALTH log only. For XAUUSD it
 *     contains exclusively `stale_market_data` rows and ZERO `signal_created` rows, so
 *     it is provably not a signal-state source.
 *
 * Under K1 the signal-state contract is ACCEPTED but strictly subject-bound: signal state
 * is emitted ONLY from caller-owned rows supplied by a JWT/RLS-scoped read, and never
 * from the runtime event log. With no verified subject the producer stays fail closed and
 * emits no signal state at all.
 *
 * HARD CONTRACT — enforced by the Evidence V1 validator and by the tests:
 *   - Falconer is STRATEGY CONTEXT ONLY. Never a truth label, calibration truth, outcome
 *     truth, source-health authority or promotion evidence.
 *   - Historical TradingView / Pine parity is UNRESOLVED. No parity, win-rate, profit
 *     factor, expectancy, edge or performance claim.
 *   - No probability, confidence, expected value, rating. The runtime setup rating is
 *     DELIBERATELY NOT SURFACED.
 *   - No trade geometry (entry, stop, targets, R:R, size) and no routing field. The
 *     source `context` JSON blob is NOT SELECTED AT ALL, because exact safe JSON-key
 *     projection is unavailable and it demonstrably carries forbidden material.
 *   - No user identifier is read, requested or represented. The pure producer has no
 *     user_id field anywhere in its input or output types.
 *   - Trade geometry, routing, size, PnL, rating, broker ids, payloads, notes, tags and
 *     features are NEVER selected from `falconer_trades`.
 *   - No causal claim, no prediction, no execution intent. `execution_path` stays
 *     `signal_only`, `allow_live_execution` stays false.
 *   - Envelope `direction` is `neutral` (supported) or `unknown` (otherwise). RON never
 *     gains a Falconer direction from this source.
 *   - Absent source rows are NEVER represented as fresh, healthy source data.
 *
 * The Falconer strategy implementation (`_shared/falconer-strategy.ts`) is FROZEN and is
 * neither imported nor re-implemented here. This module performs NO strategy evaluation.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type EvidenceStatus, type Observation,
  type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";

/**
 * Bounded lookback used to FIND the newest runtime event, in minutes. Rows older than
 * this are not representable at all.
 */
export const FALCONER_SOURCE_LOOKBACK_MINUTES = 240;
/**
 * Support window, in minutes. Equals the canonical 15m evidence TTL for a rank-6 agent
 * with `ttl_multiplier: 1` (base 60 x 1 = 60) and never exceeds it. A newest event older
 * than this is reported honestly as `stale`, never as fresh strategy context.
 */
export const FALCONER_SOURCE_FRESH_MINUTES = 60;
/** Maximum source rows admitted into the pure producer. */
export const FALCONER_SOURCE_MAX_ROWS = 200;

/** Event types the verified production runtime emits. Anything else is `other_runtime_event`. */
export const FALCONER_EVENT_TYPES_V1 = [
  "signal_created",
  "setup_filtered",
  "stale_market_data",
  "backfill_required",
  "trade_record_failed",
] as const;

export type FalconerEventType = typeof FALCONER_EVENT_TYPES_V1[number] | "other_runtime_event";

export const FALCONER_SEVERITIES_V1 = ["info", "warning", "error", "critical"] as const;

/**
 * NO `context` key may be read. Exact safe JSON-key projection is not supported by the
 * source contract, and production rows genuinely carry `score`, `threshold`, `entry`,
 * `sl`, `tp3` and `execution_path`. The whole blob is therefore never SELECTed.
 */
export const FALCONER_CONTEXT_ALLOWED_KEYS = [] as const;
export const FALCONER_CONTEXT_FORBIDDEN_KEYS = [
  "score", "threshold", "entry", "sl", "tp1", "tp2", "tp3", "execution_path", "qty", "risk",
] as const;

/**
 * Deterministic no-source representation. With no admissible source row there is no
 * source timestamp at all, so freshness is pinned to the frozen lookback bound (the
 * oldest instant this producer could have observed) and health is `degraded` with zero
 * completeness. Wall clock is never used and no market/source timestamp is invented.
 */
export const FALCONER_NO_SOURCE_FRESHNESS_MINUTES = FALCONER_SOURCE_LOOKBACK_MINUTES;

/** Statuses the frozen Falconer engine treats as live/managed, per `falconer-engine`. */
export const FALCONER_LIVE_MANAGED_STATUSES = ["open", "tp1_hit", "tp2_hit", "be_active"] as const;
/** Terminal statuses the frozen Falconer engine writes. */
export const FALCONER_CLOSED_STATUSES = ["closed_sl", "closed_tp3", "closed_ha_flip"] as const;

export const FALCONER_SIGNAL_SOURCE_SPEC_V1 = {
  spec_id: "ron_falconer_signal_source",
  spec_version: 1,
  agent_id: "falconer_signal_source",
  agent_version: 1,
  authority_class: "strategy_context",
  authority_rank: 6,
  non_authoritative: true,
  source_health_authoritative: false,
  ttl_multiplier: 1,
  falconer_authority: "strategy_context_only",

  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],

  scope_class: "falconer_subject_bound_signal_state_with_runtime_event_context",

  signal_state_contract: {
    status: "accepted_subject_bound_jwt_rls",
    acceptance_path: "K1",
    supersedes_acceptance_decision: "B2",
    signal_state_emitted: true,
    signal_state_requires_verified_subject: true,
    subject_binding: "caller_jwt_verified_then_rls_scoped_read",
    rls_predicate: "auth.uid() = user_id",
    body_supplied_user_id_accepted: false,
    default_or_global_user_allowed: false,
    service_role_read_of_trades_allowed: false,
    cross_user_merge_allowed: false,
    user_identifier_in_evidence: false,
    real_signal_state_table: "falconer_trades",
    real_signal_state_table_is_user_scoped: true,
    mode_scope: ["live"],
    engine_events_are_sole_signal_truth: false,
    engine_events_contain_xauusd_signal_created: false,
    existing_production_readers: [
      "src/lib/falconer-signal-state.ts",
      "src/pages/dashboard/DashboardHome.tsx",
      "src/pages/dashboard/SignalsPage.tsx",
    ],
    engine_live_managed_statuses: FALCONER_LIVE_MANAGED_STATUSES,
    engine_closed_statuses: FALCONER_CLOSED_STATUSES,
    allowed_fields: [
      "id", "symbol", "timeframe", "mode", "direction", "trigger_type",
      "status", "opened_at", "closed_at", "updated_at",
    ],
    forbidden_fields: [
      "user_id", "execution_path", "entry_price", "sl_price", "tp1_price", "tp2_price",
      "tp3_price", "be_level", "qty", "qty1", "qty2", "qty3", "pnl_usd", "setup_score",
      "commission_usd", "swap_usd", "slippage_points", "metaapi_position_ids",
      "broker_deal_ids", "raw_alert_payload", "notes", "tags", "features",
      "actual_entry_price", "actual_exit_price", "backtest_run_id",
    ],
    as_of_rule: "exact_max_of_opened_at_updated_at_closed_at_no_clamp",
    selection_rule: "newest_caller_owned_live_row_by_as_of_then_opened_at_then_id",
    future_row_policy: "exclude_any_row_with_opened_at_updated_at_or_closed_at_after_anchor",
    replay_safety_rule:
      "eligible requires opened_at <= anchor AND updated_at <= anchor AND (closed_at IS NULL OR closed_at <= anchor); future mutations are EXCLUDED, never clamped",
    future_mutation_clamping_allowed: false,
    lookahead_leak_allowed: false,
    timestamp_ordering_rule: "opened_at <= updated_at AND (closed_at IS NULL OR opened_at <= closed_at)",
    terminal_status_requires_closed_at: true,
    endpoint_constrains_updated_at_lte_anchor: true,
    producer_independently_enforces_replay_safety: true,
    availability_semantics: {
      subject_binding_observation: "falconer_subject_binding_verified",
      availability_observation: "falconer_signal_state_available",
      row_exists_observation: "falconer_signal_state_row_exists",
      availability_requires_eligible_row: true,
      binding_alone_implies_availability: false,
    },
    auth_contract: {
      required_jwt_role: "authenticated",
      anon_or_noauth_rejected: true,
      body_supplied_user_id_accepted: false,
      service_role_signal_state_read: false,
    },
    unrecognized_status_policy: "fail_closed_no_lifecycle_invented",
    lifecycle_tokens: ["managed", "terminal", "unrecognized"],
    fresh_minutes: 60,
    stale_managed_recommendation: "no_action",
    terminal_recommendation: "no_action",
    no_row_representation: "insufficient_data_unknown_no_action_degraded",
    backtest_or_other_symbol_fallback_allowed: false,
  },

  source_contract: {
    table: "falconer_engine_events",
    sole_source: false,
    role: "runtime_event_health_context_only",
    verified_against_production_runtime: true,
    allowed_fields: ["id", "symbol", "event_type", "severity", "created_at"],
    forbidden_fields: [
      "user_id", "message", "context",
      "direction", "status", "opened_at", "closed_at", "trigger_type",
      "entry_price", "sl_price", "tp1_price", "tp2_price", "tp3_price",
      "qty", "pnl_usd", "setup_score", "execution_path", "broker_position_ids",
      "broker_deal_ids", "raw_alert_payload", "notes", "features",
    ],
    context_selected: false,
    context_allowed_keys: FALCONER_CONTEXT_ALLOWED_KEYS,
    context_forbidden_keys: FALCONER_CONTEXT_FORBIDDEN_KEYS,
    known_event_types: FALCONER_EVENT_TYPES_V1,
    unknown_event_type_token: "other_runtime_event",
    strategy_module_imported: false,
    strategy_re_evaluated: false,
    signals_derived_from_candles: false,
    lookback_minutes: FALCONER_SOURCE_LOOKBACK_MINUTES,
    fresh_minutes: FALCONER_SOURCE_FRESH_MINUTES,
    max_rows: FALCONER_SOURCE_MAX_ROWS,
    rows_after_anchor_ignored: true,
    canonical_order: ["created_at", "id"],
    identical_duplicate_rows_dedupe_by_id: true,
    conflicting_duplicate_id_fails_closed: true,
    malformed_row_policy: "exclude_and_degrade",
    wall_clock_allowed: false,
    external_fetch_allowed: false,
    broker_reads_allowed: false,
    no_source_representation: {
      status: "insufficient_data",
      data_health_status: "degraded",
      completeness: 0,
      freshness_minutes: FALCONER_NO_SOURCE_FRESHNESS_MINUTES,
      as_of_rule: "frozen_lookback_start_sentinel",
      fresh_or_healthy_when_absent: false,
    },
  },

  authority_contract: {
    historical_truth_allowed: false,
    calibration_authority: false,
    label_authority: false,
    source_health_authority: false,
    promotion_authority: false,
    outcome_truth_authority: false,
    can_override_session_structure: false,
    can_override_opportunity_readiness: false,
    tradingview_parity_claimed: false,
    tradingview_parity_state: "unresolved",
    historical_performance_claimed: false,
  },

  safety_contract: {
    predictive: false,
    causal: false,
    confidence_emitted: false,
    probability_emitted: false,
    expected_value_emitted: false,
    edge_or_rating_emitted: false,
    setup_score_emitted: false,
    signal_state_emitted: true,
    signal_status_emitted: true,
    signal_state_requires_verified_subject: true,
    user_identifier_read: false,
    user_identifier_emitted: false,
    win_rate_emitted: false,
    profit_factor_emitted: false,
    trade_geometry_emitted: false,
    envelope_direction_policy: "neutral_when_supported_unknown_otherwise",
    source_direction_namespace: "falconer_signal_direction",
    source_direction_is_ron_truth: false,
    recommendation_policy: ["context_only", "no_action"],
    execution_allowed: false,
    execution_path: "signal_only",
    order_or_broker_invocation: false,
    persistence_in_phase_2d2j: false,
    persistence_in_phase_2d2k: false,
  },
} as const;

export function falconerSignalSourceSpecHash(): Promise<string> {
  return hashCanonical(FALCONER_SIGNAL_SOURCE_SPEC_V1);
}

const iso = (ms: number) => new Date(ms).toISOString();

/* -------------------------------------------------------- canonical inputs */

/** Exactly the accepted source projection. Nothing private, nothing geometric. */
export interface FalconerEventRow {
  id: string;
  symbol: string;
  event_type: string;
  severity: string;
  /** epoch ms of the DB `created_at`. */
  created_at: number;
}

export class FalconerSourceConflictError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`conflicting_duplicate_source_row_id: ${id}`);
    this.name = "FalconerSourceConflictError";
    this.id = id;
  }
}

function rowIdentity(r: FalconerEventRow): string {
  return `${r.symbol}|${r.event_type}|${r.severity}|${r.created_at}`;
}

export function normalizeEventType(t: string): FalconerEventType {
  return (FALCONER_EVENT_TYPES_V1 as readonly string[]).includes(t)
    ? (t as FalconerEventType)
    : "other_runtime_event";
}

export function isMalformedEventRow(r: FalconerEventRow | null | undefined): boolean {
  if (!r) return true;
  if (typeof r.id !== "string" || !r.id.length) return true;
  if (typeof r.symbol !== "string" || !r.symbol.length) return true;
  if (typeof r.event_type !== "string" || !/^[a-z0-9_]{1,40}$/.test(r.event_type)) return true;
  if (typeof r.severity !== "string" || !(FALCONER_SEVERITIES_V1 as readonly string[]).includes(r.severity)) return true;
  if (typeof r.created_at !== "number" || !Number.isFinite(r.created_at)) return true;
  return false;
}

/**
 * Canonical de-duplication by stable identity. IDENTICAL duplicates collapse; two rows
 * sharing an id but CONTRADICTING each other FAIL CLOSED — no winner is elected.
 */
export function canonicalFalconerRows(rows: readonly FalconerEventRow[]): {
  rows: FalconerEventRow[];
  malformed: number;
} {
  const byId = new Map<string, { row: FalconerEventRow; identity: string }>();
  let malformed = 0;
  for (const r of rows ?? []) {
    if (isMalformedEventRow(r)) { malformed++; continue; }
    const identity = rowIdentity(r);
    const seen = byId.get(r.id);
    if (!seen) { byId.set(r.id, { row: r, identity }); continue; }
    if (seen.identity !== identity) throw new FalconerSourceConflictError(r.id);
  }
  const out = [...byId.values()].map((v) => v.row).sort((a, b) =>
    a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return { rows: out, malformed };
}

/* ------------------------------------------------------------- the producer */

/**
 * Exactly the accepted `falconer_trades` signal-state projection. There is NO user
 * identifier, no geometry, no size, no PnL, no rating and no routing field.
 */
export interface FalconerTradeStateRow {
  id: string;
  symbol: string;
  timeframe: string;
  mode: string;
  direction: string;
  trigger_type: string;
  status: string;
  /** epoch ms */
  opened_at: number;
  /** epoch ms, or null while not closed */
  closed_at: number | null;
  /** epoch ms */
  updated_at: number;
}

export type FalconerLifecycle = "managed" | "terminal" | "unrecognized";

export function falconerLifecycleOf(status: string): FalconerLifecycle {
  if ((FALCONER_LIVE_MANAGED_STATUSES as readonly string[]).includes(status)) return "managed";
  if ((FALCONER_CLOSED_STATUSES as readonly string[]).includes(status)) return "terminal";
  return "unrecognized";
}

export function isMalformedTradeStateRow(r: FalconerTradeStateRow | null | undefined): boolean {
  if (!r) return true;
  for (const k of ["id", "symbol", "timeframe", "mode", "direction", "trigger_type", "status"] as const) {
    if (typeof r[k] !== "string" || !r[k].length) return true;
  }
  if (!["long", "short"].includes(r.direction)) return true;
  if (typeof r.opened_at !== "number" || !Number.isFinite(r.opened_at)) return true;
  if (typeof r.updated_at !== "number" || !Number.isFinite(r.updated_at)) return true;
  if (r.closed_at != null && (typeof r.closed_at !== "number" || !Number.isFinite(r.closed_at))) return true;
  // ordering + terminal-lifecycle integrity: never repaired, never assumed
  if (r.opened_at > r.updated_at) return true;
  if (r.closed_at != null && r.closed_at < r.opened_at) return true;
  if (falconerLifecycleOf(r.status) === "terminal" && r.closed_at == null) return true;
  return false;
}

function tradeIdentity(r: FalconerTradeStateRow): string {
  return [r.symbol, r.timeframe, r.mode, r.direction, r.trigger_type, r.status,
    r.opened_at, r.closed_at ?? "null", r.updated_at].join("|");
}

/** Exact duplicates collapse; contradictory rows sharing one id FAIL CLOSED. */
export function canonicalFalconerTradeRows(rows: readonly FalconerTradeStateRow[]): {
  rows: FalconerTradeStateRow[];
  malformed: number;
} {
  const byId = new Map<string, { row: FalconerTradeStateRow; identity: string }>();
  let malformed = 0;
  for (const r of rows ?? []) {
    if (isMalformedTradeStateRow(r)) { malformed++; continue; }
    const identity = tradeIdentity(r);
    const seen = byId.get(r.id);
    if (!seen) { byId.set(r.id, { row: r, identity }); continue; }
    if (seen.identity !== identity) throw new FalconerSourceConflictError(r.id);
  }
  const out = [...byId.values()].map((v) => v.row).sort((a, b) =>
    a.opened_at - b.opened_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return { rows: out, malformed };
}

/**
 * REPLAY SAFETY (2D.2k-a). A row is only knowable at the anchor when EVERY mutation
 * timestamp it carries is at or before the anchor. A row opened before the anchor but
 * updated/closed after it carries FUTURE state and is excluded outright — never clamped.
 */
export function isReplaySafeTradeRow(r: FalconerTradeStateRow, anchor: number): boolean {
  if (r.opened_at > anchor) return false;
  if (r.updated_at > anchor) return false;
  if (r.closed_at != null && r.closed_at > anchor) return false;
  return true;
}

/**
 * Frozen as_of rule: the EXACT newest source timestamp of a replay-safe row. No clamp is
 * applied or needed, because rows with any future timestamp are already excluded.
 */
export function falconerStateAsOf(r: FalconerTradeStateRow, anchor: number): number {
  void anchor;
  return Math.max(r.opened_at, r.updated_at, r.closed_at ?? Number.NEGATIVE_INFINITY);
}

export interface FalconerSignalSourceInputV1 {
  instrument: string;
  timeframe: string;
  /** epoch ms of the explicit, source-grounded evaluation anchor. */
  evaluation_anchor: number;
  events: FalconerEventRow[];
  run_id: string;
  trace_id: string;
  /**
   * Caller-owned safe `falconer_trades` projection, supplied ONLY when the endpoint has
   * verified a real subject and read the rows under that subject's RLS scope.
   * `null`/`undefined` means NO subject binding: the producer then emits no signal state.
   * There is deliberately no user identifier in this contract.
   */
  signal_state_rows?: readonly FalconerTradeStateRow[] | null;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });
const ref = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "reference", value_text: value, ...(at ? { at } : {}) });

export async function buildFalconerSignalSourceEvidenceV1(
  input: FalconerSignalSourceInputV1,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await falconerSignalSourceSpecHash();
  const anchor = input.evaluation_anchor;
  const lookbackStart = anchor - FALCONER_SOURCE_LOOKBACK_MINUTES * 60_000;

  const provenance_refs = [
    `spec:${FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_id}:v${FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version}:${spec_hash}`,
    `source:${FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract.table}`,
  ];

  const limitations: string[] = [
    "Falconer is STRATEGY CONTEXT ONLY: it is never a truth label, calibration authority, outcome truth, source-health authority or promotion evidence",
    "historical TradingView/Pine parity is UNRESOLVED; no equivalence, hit-rate, profitability or validated-edge claim of any kind is made anywhere in this evidence",
    "this specialist performs no strategy evaluation: it only replays what the frozen Falconer runtime already wrote to its production event log",
    "the runtime rating, trade geometry and routing fields present in source rows are deliberately NOT surfaced",
    "the absence of a runtime event is an absence of SOURCE DATA, not proof that the strategy had nothing to say",
    "falconer_engine_events is a runtime/event-health log only and is NEVER signal state",
    "signal state, when present, is a SUBJECT-BOUND read of the caller's own falconer_trades rows under RLS; it is strategy context only and carries no probability, geometry or execution intent",
    "the source context JSON blob is never selected: exact safe key projection is unsupported and production rows carry geometry and rating material",
  ];
  const issues: string[] = [];
  const source_timestamps: Record<string, string> = { evaluation_anchor: iso(anchor) };
  const observations: Observation[] = [
    state("falconer_source_table", FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract.table, iso(anchor)),
    state("falconer_authority", FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority, iso(anchor)),
    num("source_lookback_minutes", FALCONER_SOURCE_LOOKBACK_MINUTES, iso(anchor), "minutes"),
    num("source_fresh_window_minutes", FALCONER_SOURCE_FRESH_MINUTES, iso(anchor), "minutes"),
    state("falconer_scope_class", FALCONER_SIGNAL_SOURCE_SPEC_V1.scope_class, iso(anchor)),
    state("falconer_signal_state_contract", FALCONER_SIGNAL_SOURCE_SPEC_V1.signal_state_contract.status, iso(anchor)),
  ];
  const dependencies = [`falconer_runtime_events:${input.instrument}`];

  const envelope = (
    as_of: number,
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
    completeness: number,
    freshness_minutes: number,
  ): EvidenceEnvelopeV1 => ({
    schema_version: 1,
    agent_id: "falconer_signal_source",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: iso(as_of),
    source_timestamps,
    observations,
    provenance_refs,
    data_health: { status: healthStatus, freshness_minutes, completeness, issues },
    uncertainty: { level: "unquantified", limitations },
    conflicts: [],
    dependencies,
    status,
    direction,
    recommendation,
  });

  interface Desc {
    as_of: number;
    status: EvidenceStatus;
    health: "healthy" | "degraded" | "critical";
    direction: QualitativeDirection;
    recommendation: RecommendationV1;
    completeness: number;
    freshness_minutes: number;
  }

  // ---- 0. SUBJECT-BOUND SIGNAL STATE (K1). `signal_state_rows == null` means the caller
  // had no verified subject, so nothing at all is read or claimed about signal state.
  const subjectBound = input.signal_state_rows != null;
  observations.push(state("falconer_subject_binding_verified", subjectBound ? "true" : "false", iso(anchor)));
  observations.push(state(
    "falconer_signal_state_mode",
    subjectBound ? "subject_bound_caller_scoped" : "no_subject_binding_fail_closed",
    iso(anchor),
  ));

  let sig: Desc | null = null;
  if (!subjectBound) {
    observations.push(
      state("falconer_signal_state_available", "false", iso(anchor)),
      state("falconer_signal_state_row_exists", "false", iso(anchor)),
    );
    limitations.push("no verified subject accompanied this evaluation, so the user-scoped Falconer signal-state source was never read; signal state is unavailable rather than assumed");
  } else {
    dependencies.push(`falconer_signal_state:${input.instrument}:${input.timeframe}`);
    provenance_refs.push("source:falconer_trades:subject_bound_rls");
    limitations.push("signal state reflects ONLY the requesting subject's own live Falconer rows as enforced by row-level security; it is not a global or cross-user view");

    let tradeRows: FalconerTradeStateRow[] = [];
    let tradeMalformed = 0;
    let tradeConflict = false;
    try {
      const c = canonicalFalconerTradeRows(input.signal_state_rows ?? []);
      tradeRows = c.rows;
      tradeMalformed = c.malformed;
    } catch (err) {
      if (err instanceof FalconerSourceConflictError) tradeConflict = true;
      else throw err;
    }

    if (tradeConflict) {
      issues.push("conflicting_duplicate_signal_state_row_id");
      limitations.push("two contradictory caller-owned rows share one falconer_trades id; no winner is invented");
      observations.push(
        state("falconer_signal_state_available", "false", iso(anchor)),
        state("falconer_signal_state_row_exists", "false", iso(anchor)),
        state("falconer_signal_lifecycle", "blocked", iso(anchor)),
      );
      sig = { as_of: anchor, status: "blocked", health: "critical", direction: "unknown", recommendation: "no_action", completeness: 0, freshness_minutes: 0 };
    } else {
      if (tradeMalformed > 0) {
        issues.push(`malformed_signal_state_rows_excluded:${tradeMalformed}`);
        observations.push(num("malformed_signal_state_rows_excluded", tradeMalformed, iso(anchor), "rows"));
      }
      const scopeRows = tradeRows.filter((r) =>
        r.symbol === input.instrument && r.timeframe === input.timeframe
        && (FALCONER_SIGNAL_SOURCE_SPEC_V1.signal_state_contract.mode_scope as readonly string[]).includes(r.mode));
      // REPLAY SAFETY: any row carrying a mutation timestamp after the anchor is dropped
      // outright. Future status/closed_at can never leak backward into a past replay.
      const eligible = scopeRows.filter((r) => isReplaySafeTradeRow(r, anchor));
      const futureExcluded = scopeRows.length - eligible.length;
      if (futureExcluded > 0) {
        issues.push(`signal_state_rows_excluded_future_mutation:${futureExcluded}`);
        limitations.push("rows whose opened_at, updated_at or closed_at falls after the evaluation anchor were EXCLUDED, never clamped: their later lifecycle was not knowable at this anchor");
        observations.push(num("signal_state_rows_excluded_future_mutation", futureExcluded, iso(anchor), "rows"));
      }
      observations.push(num("signal_state_rows_eligible", eligible.length, iso(anchor), "rows"));

      if (!eligible.length) {
        issues.push("no_caller_owned_live_falconer_row");
        limitations.push("the requesting subject owns no live Falconer row for this instrument and timeframe at this anchor; no backtest row, other symbol or other subject is ever substituted");
        observations.push(
          state("falconer_signal_lifecycle", "insufficient_data", iso(anchor)),
          state("falconer_signal_state_available", "false", iso(anchor)),
          state("falconer_signal_state_row_exists", "false", iso(anchor)),
        );
        sig = {
          as_of: lookbackStart, status: "insufficient_data", health: "degraded",
          direction: "unknown", recommendation: "no_action", completeness: 0,
          freshness_minutes: FALCONER_NO_SOURCE_FRESHNESS_MINUTES,
        };
      } else {
        const scored = eligible
          .map((r) => ({ r, at: falconerStateAsOf(r, anchor) }))
          .sort((a, b) => a.at - b.at || a.r.opened_at - b.r.opened_at
            || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0));
        const picked = scored[scored.length - 1];
        const row = picked.r;
        const at = iso(picked.at);
        const lifecycle = falconerLifecycleOf(row.status);
        const ageMin = Math.max(0, Math.round((anchor - picked.at) / 60_000));

        source_timestamps.falconer_signal_state_as_of = at;
        provenance_refs.push(`falconer_trade:${row.id}:${at}`);
        observations.push(
          state("falconer_signal_state_available", "true", at),
          state("falconer_signal_state_row_exists", "true", at),
          ref("falconer_signal_row_id", row.id, at),
          state("falconer_signal_status", row.status, at),
          state("falconer_signal_direction", row.direction, at),
          state("falconer_trigger_type", row.trigger_type, at),
          state("falconer_opened_at", iso(row.opened_at), at),
          state("falconer_closed_at", row.closed_at == null ? "none" : iso(row.closed_at), at),
          state("falconer_signal_lifecycle", lifecycle, at),
          num("falconer_signal_state_age_minutes", ageMin, iso(anchor), "minutes"),
        );
        limitations.push("falconer_signal_direction is the strategy's own recorded side; it is namespaced, non-binding and never becomes RON's direction");

        if (lifecycle === "unrecognized") {
          issues.push(`unrecognized_falconer_status:${row.status}`);
          limitations.push("the stored status is outside the frozen engine taxonomy; no lifecycle meaning is invented");
          sig = { as_of: picked.at, status: "blocked", health: "critical", direction: "unknown", recommendation: "no_action", completeness: 0, freshness_minutes: ageMin };
        } else if (ageMin > FALCONER_SOURCE_FRESH_MINUTES) {
          issues.push(`falconer_signal_state_older_than_fresh_window:${ageMin}m`);
          sig = { as_of: picked.at, status: "stale", health: "degraded", direction: "unknown", recommendation: "no_action", completeness: 1, freshness_minutes: ageMin };
        } else if (lifecycle === "terminal") {
          limitations.push("the newest caller-owned row is in a terminal engine state: it is historical strategy context, never an actionable signal");
          sig = { as_of: picked.at, status: "supported", health: "healthy", direction: "neutral", recommendation: "no_action", completeness: 1, freshness_minutes: ageMin };
        } else {
          sig = { as_of: picked.at, status: "supported", health: "healthy", direction: "neutral", recommendation: "context_only", completeness: 1, freshness_minutes: ageMin };
        }
      }
    }
  }

  /** Signal state is the primary contract and wins whenever it is subject-bound. */
  const finish = (ev: Desc): EvidenceEnvelopeV1 => {
    const d = sig ?? ev;
    return envelope(d.as_of, d.status, d.health, d.direction, d.recommendation,
      d.completeness, d.freshness_minutes);
  };

  // ---- 1. canonical rows; contradictory duplicate ids fail closed.
  let canonical: FalconerEventRow[];
  let malformed: number;
  try {
    const c = canonicalFalconerRows(input.events);
    canonical = c.rows;
    malformed = c.malformed;
  } catch (err) {
    if (err instanceof FalconerSourceConflictError) {
      issues.push("conflicting_duplicate_source_row_id");
      limitations.push("two contradictory source rows share one falconer_engine_events id; no winner is invented");
      observations.push(state("falconer_runtime_state", "blocked", iso(anchor)));
      return envelope(anchor, "blocked", "critical", "unknown", "no_action", 0, 0);
    }
    throw err;
  }

  if (malformed > 0) {
    issues.push(`malformed_source_rows_excluded:${malformed}`);
    limitations.push("rows with an invalid id, symbol, event type, severity or timestamp were excluded, never repaired");
    observations.push(num("malformed_rows_excluded", malformed, iso(anchor), "rows"));
  }

  // ---- 2. instrument scope + strict bounded lookback ending AT the anchor.
  const inScope = canonical.filter((r) => r.symbol === input.instrument);
  const inWindow = inScope.filter((r) => r.created_at <= anchor && r.created_at >= lookbackStart);

  let admitted = inWindow;
  if (inWindow.length > FALCONER_SOURCE_MAX_ROWS) {
    admitted = inWindow.slice(inWindow.length - FALCONER_SOURCE_MAX_ROWS);
    issues.push(`source_rows_truncated_to_cap:${FALCONER_SOURCE_MAX_ROWS}`);
    limitations.push(`only the newest ${FALCONER_SOURCE_MAX_ROWS} in-window runtime rows are admitted`);
  }

  observations.push(num("runtime_events_in_lookback", admitted.length, iso(anchor), "events"));

  if (!admitted.length) {
    issues.push("no_falconer_runtime_events_in_lookback");
    issues.push("no_source_timestamp_exists");
    limitations.push("no falconer_engine_events row exists for this instrument inside the bounded lookback; no runtime state is invented and absent source data is NOT represented as fresh or healthy");
    observations.push(
      state("falconer_runtime_state", "insufficient_data", iso(anchor)),
      state("falconer_source_timestamp_exists", "false", iso(anchor)),
      num("no_source_freshness_sentinel_minutes", FALCONER_NO_SOURCE_FRESHNESS_MINUTES, iso(anchor), "minutes"),
    );
    // as_of is the frozen lookback-start sentinel: the oldest instant this producer could
    // have observed. It is never the anchor, never wall clock, never an invented source time.
    return finish({
      as_of: lookbackStart, status: "insufficient_data", health: "degraded",
      direction: "unknown", recommendation: "no_action", completeness: 0,
      freshness_minutes: FALCONER_NO_SOURCE_FRESHNESS_MINUTES,
    });
  }

  const newest = admitted[admitted.length - 1];
  const newestAt = iso(newest.created_at);
  const ageMinutes = Math.max(0, Math.round((anchor - newest.created_at) / 60_000));
  source_timestamps.newest_runtime_event = newestAt;
  source_timestamps.source_lookback_start = iso(lookbackStart);

  // ---- 3. deterministic counts over the frozen event-type vocabulary.
  const counts = new Map<FalconerEventType, number>();
  for (const r of admitted) {
    const t = normalizeEventType(r.event_type);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const t of [...FALCONER_EVENT_TYPES_V1, "other_runtime_event"] as FalconerEventType[]) {
    observations.push(num(`runtime_event_${t}_count`, counts.get(t) ?? 0, iso(anchor), "events"));
  }

  observations.push(
    ref("newest_runtime_event_id", newest.id, newestAt),
    state("newest_runtime_event_type", normalizeEventType(newest.event_type), newestAt),
    state("newest_runtime_event_severity", newest.severity, newestAt),
    num("newest_runtime_event_age_minutes", ageMinutes, iso(anchor), "minutes"),
  );
  provenance_refs.push(`falconer_engine_event:${newest.id}:${newestAt}`);

  // ---- 4. newest `signal_created` row, if the runtime actually emitted one.
  const signals = admitted.filter((r) => r.event_type === "signal_created");
  const newestSignal = signals.length ? signals[signals.length - 1] : null;
  if (newestSignal) {
    const at = iso(newestSignal.created_at);
    const sigAge = Math.max(0, Math.round((anchor - newestSignal.created_at) / 60_000));
    observations.push(
      state("falconer_runtime_signal_created_event_present", "true", at),
      ref("newest_signal_event_id", newestSignal.id, at),
      num("newest_signal_event_age_minutes", sigAge, iso(anchor), "minutes"),
    );
    provenance_refs.push(`falconer_engine_event:${newestSignal.id}:${at}`);
  } else {
    observations.push(state("falconer_runtime_signal_created_event_present", "false", iso(anchor)));
    limitations.push("the runtime emitted no signal_created event inside the lookback; no setup or direction is manufactured, and a signal_created event would in any case be runtime evidence, never signal state");
  }

  // ---- 5. freshness against the canonical 15m TTL budget. Never fake-fresh.
  if (ageMinutes > FALCONER_SOURCE_FRESH_MINUTES) {
    issues.push(`newest_runtime_event_older_than_fresh_window:${ageMinutes}m`);
    limitations.push("the newest Falconer runtime event is older than the canonical evidence freshness budget; this strategy context is stale, not current");
    observations.push(state("falconer_runtime_state", "stale", newestAt));
    return finish({
      as_of: newest.created_at, status: "stale", health: "degraded", direction: "unknown",
      recommendation: "no_action", completeness: 1, freshness_minutes: ageMinutes,
    });
  }

  observations.push(state("falconer_runtime_state", "runtime_events_present", newestAt));
  return finish({
    as_of: newest.created_at, status: "supported",
    health: malformed > 0 ? "degraded" : "healthy", direction: "neutral",
    recommendation: "context_only", completeness: 1, freshness_minutes: ageMinutes,
  });
}
