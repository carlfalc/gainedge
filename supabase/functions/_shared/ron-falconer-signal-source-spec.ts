/**
 * RON Phase 2D.2j-a — FALCONER RUNTIME-EVENT CONTEXT spec V1 (pure producer).
 *
 * ACCEPTANCE DECISION 2D.2j-a = B2 (SOURCE CONTRACT GAP).
 *
 * The registered rank-6 specialist `falconer_signal_source` CANNOT supply Falconer
 * SIGNAL STATE under the current RON internal contract, and this module must never
 * pretend otherwise:
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
 * Therefore this spec is deliberately narrowed to RUNTIME EVENT CONTEXT ONLY and
 * declares the signal-state contract as an explicit, fail-closed UNACCEPTED GAP. Signal
 * state, direction, status, opened/closed timestamps and trade geometry are NOT emitted.
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
 *   - No user identifier is read, requested or represented.
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

  scope_class: "falconer_runtime_event_context_only",

  signal_state_contract: {
    status: "unaccepted_gap",
    acceptance_decision: "B2",
    signal_state_emitted: false,
    real_signal_state_table: "falconer_trades",
    real_signal_state_table_is_user_scoped: true,
    ron_internal_user_subject_contract_exists: false,
    safe_signal_state_view_or_function_exists: false,
    service_role_scan_of_user_scoped_trades_allowed: false,
    engine_events_contain_xauusd_signal_created: false,
    engine_events_are_sole_signal_truth: false,
    existing_production_readers: [
      "src/lib/falconer-signal-state.ts",
      "src/pages/dashboard/DashboardHome.tsx",
      "src/pages/dashboard/SignalsPage.tsx",
    ],
    engine_live_managed_statuses: FALCONER_LIVE_MANAGED_STATUSES,
    engine_closed_statuses: FALCONER_CLOSED_STATUSES,
    gap_resolution_requires_separately_approved_phase: true,
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
      "qty", "pnl_usd", "setup_score", "execution_path", "metaapi_position_ids",
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
    signal_state_emitted: false,
    signal_status_emitted: false,
    user_identifier_read: false,
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
  context?: Record<string, unknown> | null;
}

export class FalconerSourceConflictError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`conflicting_duplicate_source_row_id: ${id}`);
    this.name = "FalconerSourceConflictError";
    this.id = id;
  }
}

function safeContext(ctx: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ctx || typeof ctx !== "object") return out;
  for (const k of FALCONER_CONTEXT_ALLOWED_KEYS) {
    const v = (ctx as Record<string, unknown>)[k];
    if (typeof v === "string" && v.length && v.length <= 64) out[k] = v;
  }
  return out;
}

function rowIdentity(r: FalconerEventRow): string {
  const ctx = safeContext(r.context);
  const ctxKey = Object.keys(ctx).sort().map((k) => `${k}=${ctx[k]}`).join(",");
  return `${r.symbol}|${r.event_type}|${r.severity}|${r.created_at}|${ctxKey}`;
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

export interface FalconerSignalSourceInputV1 {
  instrument: string;
  timeframe: string;
  /** epoch ms of the explicit, source-grounded evaluation anchor. */
  evaluation_anchor: number;
  events: FalconerEventRow[];
  run_id: string;
  trace_id: string;
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
  ];
  const issues: string[] = [];
  const source_timestamps: Record<string, string> = { evaluation_anchor: iso(anchor) };
  const observations: Observation[] = [
    state("falconer_source_table", FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract.table, iso(anchor)),
    state("falconer_authority", FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority, iso(anchor)),
    num("source_lookback_minutes", FALCONER_SOURCE_LOOKBACK_MINUTES, iso(anchor), "minutes"),
    num("source_fresh_window_minutes", FALCONER_SOURCE_FRESH_MINUTES, iso(anchor), "minutes"),
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
    limitations.push("no falconer_engine_events row exists for this instrument inside the bounded lookback; no runtime state is invented");
    observations.push(state("falconer_runtime_state", "insufficient_data", iso(anchor)));
    return envelope(anchor, "insufficient_data", malformed > 0 ? "degraded" : "healthy",
      "unknown", "no_action", 0, 0);
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

  const newestCtx = safeContext(newest.context);
  observations.push(
    ref("newest_runtime_event_id", newest.id, newestAt),
    state("newest_runtime_event_type", normalizeEventType(newest.event_type), newestAt),
    state("newest_runtime_event_severity", newest.severity, newestAt),
    num("newest_runtime_event_age_minutes", ageMinutes, iso(anchor), "minutes"),
  );
  if (newestCtx.candle) observations.push(state("newest_runtime_event_source_candle", newestCtx.candle, newestAt));
  if (newestCtx.timeframe) observations.push(state("newest_runtime_event_source_timeframe", newestCtx.timeframe, newestAt));
  provenance_refs.push(`falconer_engine_event:${newest.id}:${newestAt}`);

  // ---- 4. newest `signal_created` row, if the runtime actually emitted one.
  const signals = admitted.filter((r) => r.event_type === "signal_created");
  const newestSignal = signals.length ? signals[signals.length - 1] : null;
  if (newestSignal) {
    const at = iso(newestSignal.created_at);
    const sigAge = Math.max(0, Math.round((anchor - newestSignal.created_at) / 60_000));
    observations.push(
      state("falconer_signal_present_in_lookback", "true", at),
      ref("newest_signal_event_id", newestSignal.id, at),
      num("newest_signal_event_age_minutes", sigAge, iso(anchor), "minutes"),
    );
    provenance_refs.push(`falconer_engine_event:${newestSignal.id}:${at}`);
  } else {
    observations.push(state("falconer_signal_present_in_lookback", "false", iso(anchor)));
    limitations.push("the runtime emitted no signal_created event inside the lookback; no WAIT, setup or direction is manufactured");
  }

  // ---- 5. freshness against the canonical 15m TTL budget. Never fake-fresh.
  if (ageMinutes > FALCONER_SOURCE_FRESH_MINUTES) {
    issues.push(`newest_runtime_event_older_than_fresh_window:${ageMinutes}m`);
    limitations.push("the newest Falconer runtime event is older than the canonical evidence freshness budget; this strategy context is stale, not current");
    observations.push(state("falconer_runtime_state", "stale", newestAt));
    return envelope(newest.created_at, "stale", "degraded", "unknown", "no_action", 1, ageMinutes);
  }

  observations.push(state("falconer_runtime_state", "runtime_events_present", newestAt));
  return envelope(
    newest.created_at, "supported", malformed > 0 ? "degraded" : "healthy",
    "neutral", "context_only", 1, ageMinutes,
  );
}
