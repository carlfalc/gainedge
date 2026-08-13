/**
 * Phase 2D.2j — FALCONER SIGNAL SOURCE SPECIALIST V1 adversarial + hash-pinned tests.
 *
 * Deterministic synthetic fixtures only. Nothing is persisted. The frozen Falconer
 * strategy module is never imported, never evaluated and never modified.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FALCONER_SIGNAL_SOURCE_SPEC_V1, FALCONER_SOURCE_LOOKBACK_MINUTES,
  FALCONER_SOURCE_FRESH_MINUTES, FALCONER_SOURCE_MAX_ROWS, FALCONER_EVENT_TYPES_V1,
  FALCONER_CONTEXT_ALLOWED_KEYS, FALCONER_CONTEXT_FORBIDDEN_KEYS,
  FALCONER_NO_SOURCE_FRESHNESS_MINUTES, FALCONER_LIVE_MANAGED_STATUSES,
  FALCONER_CLOSED_STATUSES,
  buildFalconerSignalSourceEvidenceV1, falconerSignalSourceSpecHash,
  canonicalFalconerRows, normalizeEventType, FalconerSourceConflictError,
  canonicalFalconerTradeRows, falconerLifecycleOf, falconerStateAsOf,
  isReplaySafeTradeRow,
  type FalconerEventRow, type FalconerTradeStateRow,
} from "../../supabase/functions/_shared/ron-falconer-signal-source-spec.ts";
import {
  sealEvidence, validateEvidence, scanDenylist, evidenceTtlMinutes, agentSpec,
  FALCONER_AUTHORITY,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import {
  patternContextSpecHash, PATTERN_DETECTOR_SOURCE_SHA256,
} from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { crossAssetSpecHash } from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import { macroNewsSpecHash } from "../../supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts";
import { opportunityRiskSpecHash } from "../../supabase/functions/_shared/ron-opportunity-risk-spec.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

/** EXACT frozen full hash of Falconer Signal Source Spec V1. */
const FALCONER_SPEC_V1_HASH_PINNED = "40a4b6f9d465ae0362e1a0ada43e3b699c2674efa30c5dbe9e5a934dcd1005f3";

/** EXACT sha256 of the FROZEN Falconer strategy module. It must never change. */
const FALCONER_STRATEGY_SHA256 =
  "13736f1ed5dabd3f31a15b8db4179ed4e027950ed515034433ae6134a15581fc";

const ANCHOR = Date.parse("2026-08-13T10:00:00Z");
const MIN = 60_000;

const row = (over: Partial<FalconerEventRow> & { id: string }): FalconerEventRow => ({
  symbol: "XAUUSD",
  event_type: "stale_market_data",
  severity: "warning",
  created_at: ANCHOR - 10 * MIN,
  ...over,
});

const build = (events: FalconerEventRow[], anchor = ANCHOR) =>
  buildFalconerSignalSourceEvidenceV1({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor, events,
    run_id: "fixture_run", trace_id: "fixture_trace",
  });

const trade = (over: Partial<FalconerTradeStateRow> & { id: string }): FalconerTradeStateRow => ({
  symbol: "XAUUSD", timeframe: "15m", mode: "live", direction: "long",
  trigger_type: "ha_flip", status: "open",
  opened_at: ANCHOR - 20 * MIN, closed_at: null, updated_at: ANCHOR - 5 * MIN,
  ...over,
});

const buildBound = (
  rows: FalconerTradeStateRow[] | null,
  events: FalconerEventRow[] = [],
  anchor = ANCHOR,
) => buildFalconerSignalSourceEvidenceV1({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor, events,
  run_id: "fixture_run", trace_id: "fixture_trace", signal_state_rows: rows,
});

const obs = (e: { observations: { key: string; value_num?: number; value_text?: string }[] }, key: string) =>
  e.observations.find((o) => o.key === key);

describe("2D.2j — frozen spec identity and immutable upstream", () => {
  it("pins the exact full Falconer Signal Source Spec V1 hash", async () => {
    expect(await falconerSignalSourceSpecHash()).toBe(FALCONER_SPEC_V1_HASH_PINNED);
    expect(await falconerSignalSourceSpecHash()).toBe(await falconerSignalSourceSpecHash());
  });

  it("all accepted upstream specialist hashes are unchanged", async () => {
    expect(await sessionStructureSpecHashV2()).toBe(
      "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await calibrationValidationSpecHash()).toBe(
      "e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(await patternContextSpecHash()).toBe(
      "9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d");
    expect(PATTERN_DETECTOR_SOURCE_SHA256).toBe(
      "2086613c1cc164c9c057e26d14272332444268918d8805b663c14e3a3efaf756");
    expect(await crossAssetSpecHash()).toBe(
      "8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44");
    expect(await macroNewsSpecHash()).toBe(
      "0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f");
    expect(await opportunityRiskSpecHash()).toBe(
      "cb547444826d7a49479d869ad558ee7344733140f0ad0ae0a4d3c8f71461173a");
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("registry identity, rank, non-authority and TTL are unaltered", () => {
    const s = agentSpec("falconer_signal_source")!;
    expect(s.agent_version).toBe(1);
    expect(s.authority_class).toBe("strategy_context");
    expect(s.non_authoritative).toBe(true);
    expect(s.source_health_authoritative).toBe(false);
    expect(s.ttl_multiplier).toBe(1);
    expect(evidenceTtlMinutes("falconer_signal_source", "15m")).toBe(60);
    expect(FALCONER_AUTHORITY).toBe("strategy_context_only");
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.authority_rank).toBe(6);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority).toBe("strategy_context_only");
    expect(FALCONER_SOURCE_FRESH_MINUTES).toBeLessThanOrEqual(
      evidenceTtlMinutes("falconer_signal_source", "15m"));
  });

  it("the FROZEN Falconer strategy module is byte-for-byte unchanged by this phase", () => {
    const bytes = readFileSync("supabase/functions/_shared/falconer-strategy.ts");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FALCONER_STRATEGY_SHA256);
  });

  it("the frozen authority contract denies every form of truth authority", () => {
    const a = FALCONER_SIGNAL_SOURCE_SPEC_V1.authority_contract;
    expect(a.historical_truth_allowed).toBe(false);
    expect(a.calibration_authority).toBe(false);
    expect(a.label_authority).toBe(false);
    expect(a.source_health_authority).toBe(false);
    expect(a.promotion_authority).toBe(false);
    expect(a.outcome_truth_authority).toBe(false);
    expect(a.can_override_session_structure).toBe(false);
    expect(a.can_override_opportunity_readiness).toBe(false);
    expect(a.tradingview_parity_claimed).toBe(false);
    expect(a.tradingview_parity_state).toBe("unresolved");
    expect(a.historical_performance_claimed).toBe(false);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.safety_contract.persistence_in_phase_2d2j).toBe(false);
  });
});

describe("2D.2j — verified source contract", () => {
  it("names the verified production runtime table and its allowed projection only", () => {
    const c = FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract;
    expect(c.table).toBe("falconer_engine_events");
    expect(c.sole_source).toBe(false);
    expect(c.role).toBe("runtime_event_health_context_only");
    expect(c.context_selected).toBe(false);
    expect([...c.allowed_fields]).toEqual(["id", "symbol", "event_type", "severity", "created_at"]);
    expect([...c.forbidden_fields]).toContain("user_id");
    expect([...c.forbidden_fields]).toContain("message");
    expect([...c.forbidden_fields]).toContain("context");
    expect([...c.forbidden_fields]).toContain("direction");
    expect([...c.forbidden_fields]).toContain("status");
    expect([...FALCONER_CONTEXT_ALLOWED_KEYS]).toEqual([]);
    expect([...FALCONER_CONTEXT_FORBIDDEN_KEYS]).toContain("score");
    expect([...FALCONER_CONTEXT_FORBIDDEN_KEYS]).toContain("entry");
    expect(c.strategy_module_imported).toBe(false);
    expect(c.strategy_re_evaluated).toBe(false);
    expect(c.signals_derived_from_candles).toBe(false);
    expect(c.wall_clock_allowed).toBe(false);
  });

  it("declares the Falconer SIGNAL STATE contract as accepted, subject-bound (K1)", () => {
    const g = FALCONER_SIGNAL_SOURCE_SPEC_V1.signal_state_contract;
    expect(g.status).toBe("accepted_subject_bound_jwt_rls");
    expect(g.acceptance_path).toBe("K1");
    expect(g.supersedes_acceptance_decision).toBe("B2");
    expect(g.signal_state_emitted).toBe(true);
    expect(g.signal_state_requires_verified_subject).toBe(true);
    expect(g.subject_binding).toBe("caller_jwt_verified_then_rls_scoped_read");
    expect(g.rls_predicate).toBe("auth.uid() = user_id");
    expect(g.body_supplied_user_id_accepted).toBe(false);
    expect(g.default_or_global_user_allowed).toBe(false);
    expect(g.service_role_read_of_trades_allowed).toBe(false);
    expect(g.cross_user_merge_allowed).toBe(false);
    expect(g.user_identifier_in_evidence).toBe(false);
    expect(g.real_signal_state_table).toBe("falconer_trades");
    expect(g.real_signal_state_table_is_user_scoped).toBe(true);
    expect([...g.mode_scope]).toEqual(["live"]);
    expect([...g.allowed_fields]).toEqual([
      "id", "symbol", "timeframe", "mode", "direction", "trigger_type",
      "status", "opened_at", "closed_at", "updated_at",
    ]);
    expect(g.forbidden_fields).toContain("user_id");
    expect(g.backtest_or_other_symbol_fallback_allowed).toBe(false);
    expect(g.engine_events_contain_xauusd_signal_created).toBe(false);
    expect(g.engine_events_are_sole_signal_truth).toBe(false);
    expect([...g.engine_live_managed_statuses]).toEqual(["open", "tp1_hit", "tp2_hit", "be_active"]);
    expect([...g.engine_closed_statuses]).toEqual(["closed_sl", "closed_tp3", "closed_ha_flip"]);
    expect([...FALCONER_LIVE_MANAGED_STATUSES]).toEqual([...g.engine_live_managed_statuses]);
    expect([...FALCONER_CLOSED_STATUSES]).toEqual([...g.engine_closed_statuses]);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.scope_class)
      .toBe("falconer_subject_bound_signal_state_with_runtime_event_context");
    const sc = FALCONER_SIGNAL_SOURCE_SPEC_V1.safety_contract;
    expect(sc.signal_state_emitted).toBe(true);
    expect(sc.signal_status_emitted).toBe(true);
    expect(sc.signal_state_requires_verified_subject).toBe(true);
    expect(sc.user_identifier_read).toBe(false);
    expect(sc.user_identifier_emitted).toBe(false);
  });

  it("without a verified subject it emits NO signal state and stays fail closed", async () => {
    for (const e of [await build([]), await build([row({ id: "a" })])]) {
      expect(obs(e, "falconer_signal_state_contract")?.value_text)
        .toBe("accepted_subject_bound_jwt_rls");
      expect(obs(e, "falconer_subject_binding_verified")?.value_text).toBe("false");
      expect(obs(e, "falconer_signal_state_available")?.value_text).toBe("false");
      expect(obs(e, "falconer_signal_state_row_exists")?.value_text).toBe("false");
      expect(obs(e, "falconer_signal_state_mode")?.value_text)
        .toBe("no_subject_binding_fail_closed");
      expect(obs(e, "falconer_signal_status")).toBeUndefined();
      expect(obs(e, "falconer_signal_direction")).toBeUndefined();
      const text = JSON.stringify(e).toLowerCase();
      for (const forbidden of ["user_id", "be_active", "tp1_hit", "closed_sl"]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  it("with a verified subject it emits safe signal state and never a user identifier", async () => {
    const e = await buildBound([trade({ id: "t1" })]);
    expect(obs(e, "falconer_subject_binding_verified")?.value_text).toBe("true");
    expect(obs(e, "falconer_signal_state_available")?.value_text).toBe("true");
    expect(obs(e, "falconer_signal_state_mode")?.value_text).toBe("subject_bound_caller_scoped");
    expect(obs(e, "falconer_signal_status")?.value_text).toBe("open");
    expect(obs(e, "falconer_signal_direction")?.value_text).toBe("long");
    expect(obs(e, "falconer_signal_lifecycle")?.value_text).toBe("managed");
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    const text = JSON.stringify(e).toLowerCase();
    for (const forbidden of [
      "user_id", "entry_price", "sl_price", "tp3_price", "pnl", "setup_score",
      "qty", "execution_path", "numeric_probability",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(scanDenylist(e)).toEqual([]);
    expect(validateEvidence(e)).toEqual([]);
  });

  it("subject-bound with no caller-owned live row is insufficient_data, never fresh/healthy", async () => {
    const e = await buildBound([]);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.status).toBe("degraded");
    expect(e.data_health.completeness).toBe(0);
    expect(e.data_health.freshness_minutes).toBe(FALCONER_NO_SOURCE_FRESHNESS_MINUTES);
    expect(obs(e, "falconer_signal_state_row_exists")?.value_text).toBe("false");
  });

  it("2D.2k-a: subject binding and state availability are separate facts", async () => {
    const empty = await buildBound([]);
    expect(obs(empty, "falconer_subject_binding_verified")?.value_text).toBe("true");
    expect(obs(empty, "falconer_signal_state_available")?.value_text).toBe("false");
    expect(obs(empty, "falconer_signal_state_row_exists")?.value_text).toBe("false");
    expect(empty.status).toBe("insufficient_data");
    expect(empty.direction).toBe("unknown");
    expect(empty.recommendation).toBe("no_action");
    expect(empty.data_health.status).toBe("degraded");
  });

  it("A. a row updated after the anchor is excluded; the future status never leaks", async () => {
    const e = await buildBound([trade({
      id: "leak", opened_at: ANCHOR - 60 * MIN, status: "closed_sl",
      closed_at: ANCHOR - 5 * MIN, updated_at: ANCHOR + 60 * MIN,
    })]);
    expect(obs(e, "signal_state_rows_eligible")?.value_num).toBe(0);
    expect(obs(e, "signal_state_rows_excluded_future_mutation")?.value_num).toBe(1);
    expect(obs(e, "falconer_signal_state_available")?.value_text).toBe("false");
    expect(JSON.stringify(e)).not.toContain("closed_sl");
    expect(e.status).toBe("insufficient_data");
  });

  it("B. a terminal row closed after the anchor is excluded; lifecycle never leaks backward", async () => {
    const e = await buildBound([trade({
      id: "future_close", opened_at: ANCHOR - 45 * MIN, status: "closed_tp3",
      closed_at: ANCHOR + 60 * MIN, updated_at: ANCHOR + 60 * MIN,
    })]);
    expect(obs(e, "signal_state_rows_eligible")?.value_num).toBe(0);
    expect(JSON.stringify(e)).not.toContain("closed_tp3");
    expect(e.status).toBe("insufficient_data");
  });

  it("C. a row entirely at or before the anchor keeps an EXACT unclamped as_of", async () => {
    const r = trade({ id: "ok", opened_at: ANCHOR - 40 * MIN, updated_at: ANCHOR - 12 * MIN });
    expect(isReplaySafeTradeRow(r, ANCHOR)).toBe(true);
    expect(falconerStateAsOf(r, ANCHOR)).toBe(ANCHOR - 12 * MIN);
    const e = await buildBound([r]);
    expect(e.as_of).toBe(new Date(ANCHOR - 12 * MIN).toISOString());
    expect(e.data_health.freshness_minutes).toBe(12);
  });

  it("D. a future-mutation row cannot influence selection next to an eligible older row", async () => {
    const safe = trade({ id: "safe", opened_at: ANCHOR - 30 * MIN, updated_at: ANCHOR - 30 * MIN });
    const future = trade({
      id: "future", opened_at: ANCHOR - 20 * MIN, status: "closed_sl",
      closed_at: ANCHOR + 30 * MIN, updated_at: ANCHOR + 30 * MIN,
    });
    const e = await buildBound([safe, future]);
    expect(obs(e, "falconer_signal_row_id")?.value_text).toBe("safe");
    expect(obs(e, "falconer_signal_status")?.value_text).toBe("open");
    const only = await sealEvidence(await buildBound([safe]));
    expect((await sealEvidence(e)).evidence_hash).not.toBe(only.evidence_hash); // exclusion is disclosed
    expect(obs(e, "signal_state_rows_excluded_future_mutation")?.value_num).toBe(1);
  });

  it("E. reversed-order replay with future rows is byte-identical", async () => {
    const rows = [
      trade({ id: "safe", opened_at: ANCHOR - 30 * MIN, updated_at: ANCHOR - 30 * MIN }),
      trade({ id: "future", opened_at: ANCHOR - 20 * MIN, updated_at: ANCHOR + 30 * MIN }),
      trade({ id: "safe2", opened_at: ANCHOR - 50 * MIN, updated_at: ANCHOR - 50 * MIN }),
    ];
    const a = await sealEvidence(await buildBound(rows));
    const b = await sealEvidence(await buildBound([...rows].reverse()));
    expect(a.evidence_hash).toBe(b.evidence_hash);
  });

  it("2D.2k-a: terminal status without closed_at and reversed timestamps are malformed", () => {
    expect(canonicalFalconerTradeRows([
      trade({ id: "t", status: "closed_sl", closed_at: null }),
    ]).malformed).toBe(1);
    expect(canonicalFalconerTradeRows([
      trade({ id: "u", opened_at: ANCHOR - 5 * MIN, updated_at: ANCHOR - 50 * MIN }),
    ]).malformed).toBe(1);
    expect(canonicalFalconerTradeRows([
      trade({ id: "c", status: "closed_sl", opened_at: ANCHOR - 5 * MIN, closed_at: ANCHOR - 50 * MIN }),
    ]).malformed).toBe(1);
  });

  it("never substitutes a backtest row, another symbol, another timeframe or a future row", async () => {
    for (const r of [
      trade({ id: "b", mode: "backtest" }),
      trade({ id: "s", symbol: "NAS100" }),
      trade({ id: "tf", timeframe: "1h" }),
      trade({ id: "f", opened_at: ANCHOR + 5 * MIN }),
    ]) {
      const e = await buildBound([r]);
      expect(e.status).toBe("insufficient_data");
      expect(obs(e, "signal_state_rows_eligible")?.value_num).toBe(0);
    }
  });

  it("terminal and stale states are historical context only, and unknown statuses fail closed", async () => {
    const terminal = await buildBound([trade({
      id: "c", status: "closed_sl", closed_at: ANCHOR - 3 * MIN, updated_at: ANCHOR - 3 * MIN,
    })]);
    expect(terminal.status).toBe("supported");
    expect(terminal.recommendation).toBe("no_action");
    expect(obs(terminal, "falconer_signal_lifecycle")?.value_text).toBe("terminal");

    const stale = await buildBound([trade({
      id: "s", opened_at: ANCHOR - 600 * MIN, updated_at: ANCHOR - 600 * MIN,
    })]);
    expect(stale.status).toBe("stale");
    expect(stale.recommendation).toBe("no_action");

    const weird = await buildBound([trade({ id: "w", status: "quantum_superposition" })]);
    expect(weird.status).toBe("blocked");
    expect(weird.data_health.status).toBe("critical");
    expect(obs(weird, "falconer_signal_lifecycle")?.value_text).toBe("unrecognized");
  });

  it("signal-state helpers are deterministic and fail closed on contradictions", () => {
    expect(falconerLifecycleOf("be_active")).toBe("managed");
    expect(falconerLifecycleOf("closed_tp3")).toBe("terminal");
    expect(falconerLifecycleOf("nonsense")).toBe("unrecognized");
    expect(falconerStateAsOf(trade({ id: "x", updated_at: ANCHOR - 4 * MIN }), ANCHOR))
      .toBe(ANCHOR - 4 * MIN);
    expect(isReplaySafeTradeRow(trade({ id: "x", updated_at: ANCHOR + 99 * MIN }), ANCHOR)).toBe(false);
    const dup = trade({ id: "d" });
    expect(canonicalFalconerTradeRows([dup, { ...dup }]).rows).toHaveLength(1);
    expect(() => canonicalFalconerTradeRows([dup, { ...dup, status: "closed_sl" }]))
      .toThrow(FalconerSourceConflictError);
    expect(canonicalFalconerTradeRows([{ ...dup, direction: "sideways" }]).malformed).toBe(1);
  });

  it("subject-bound evidence replays byte-identically", async () => {
    const rows = [trade({ id: "t1" }), trade({ id: "t2", opened_at: ANCHOR - 10 * MIN })];
    const a = await sealEvidence(await buildBound(rows));
    const b = await sealEvidence(await buildBound([...rows].reverse()));
    expect(a.evidence_hash).toBe(b.evidence_hash);
  });

  it("normalizes unknown event types to the frozen fallback token", () => {
    expect(normalizeEventType("signal_created")).toBe("signal_created");
    expect(normalizeEventType("brand_new_thing")).toBe("other_runtime_event");
    expect(FALCONER_EVENT_TYPES_V1).toContain("signal_created");
  });
});

describe("2D.2j — deterministic producer semantics", () => {
  it("grounds as_of on the exact source event timestamp, not on the anchor", async () => {
    const e = await build([row({ id: "a", created_at: ANCHOR - 7 * MIN })]);
    expect(e.status).toBe("supported");
    expect(e.as_of).toBe(new Date(ANCHOR - 7 * MIN).toISOString());
    expect(e.source_timestamps.newest_runtime_event).toBe(new Date(ANCHOR - 7 * MIN).toISOString());
    expect(obs(e, "newest_runtime_event_age_minutes")?.value_num).toBe(7);
    expect(e.data_health.freshness_minutes).toBe(7);
  });

  it("ignores rows published after the anchor", async () => {
    const e = await build([
      row({ id: "past", created_at: ANCHOR - 20 * MIN }),
      row({ id: "future", created_at: ANCHOR + 5 * MIN }),
    ]);
    expect(obs(e, "runtime_events_in_lookback")?.value_num).toBe(1);
    expect(JSON.stringify(e)).not.toContain("future");
  });

  it("ignores rows for another instrument", async () => {
    const e = await build([row({ id: "nas", symbol: "NAS100" })]);
    expect(e.status).toBe("insufficient_data");
  });

  it("no source rows in the lookback yields honest insufficient_data, never a fake WAIT", async () => {
    const e = await build([]);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(obs(e, "falconer_runtime_state")?.value_text).toBe("insufficient_data");
    expect(JSON.stringify(e).toLowerCase()).not.toContain("wait");
    // absent source data is NEVER represented as fresh or healthy
    expect(e.data_health.status).toBe("degraded");
    expect(e.data_health.completeness).toBe(0);
    expect(e.data_health.freshness_minutes).toBe(FALCONER_NO_SOURCE_FRESHNESS_MINUTES);
    expect(e.data_health.issues).toContain("no_source_timestamp_exists");
    expect(obs(e, "falconer_source_timestamp_exists")?.value_text).toBe("false");
    expect(e.as_of).toBe(new Date(ANCHOR - FALCONER_SOURCE_LOOKBACK_MINUTES * MIN).toISOString());
    expect(e.as_of).not.toBe(new Date(ANCHOR).toISOString());
  });

  it("rows older than the whole lookback are unrepresentable", async () => {
    const e = await build([row({ id: "ancient", created_at: ANCHOR - (FALCONER_SOURCE_LOOKBACK_MINUTES + 1) * MIN })]);
    expect(e.status).toBe("insufficient_data");
  });

  it("a newest event beyond the fresh window is reported as stale, never fake-fresh", async () => {
    const age = FALCONER_SOURCE_FRESH_MINUTES + 30;
    const e = await build([row({ id: "old", created_at: ANCHOR - age * MIN })]);
    expect(e.status).toBe("stale");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.status).toBe("degraded");
    expect(e.data_health.freshness_minutes).toBe(age);
    expect(obs(e, "falconer_runtime_state")?.value_text).toBe("stale");
  });

  it("malformed rows degrade deterministically and are never repaired", async () => {
    const e = await build([
      row({ id: "ok" }),
      { id: "", symbol: "XAUUSD", event_type: "signal_created", severity: "info", created_at: ANCHOR - MIN },
      row({ id: "bad_sev", severity: "loud" }),
      row({ id: "bad_ts", created_at: Number.NaN }),
    ]);
    expect(obs(e, "malformed_rows_excluded")?.value_num).toBe(3);
    expect(e.data_health.status).toBe("degraded");
    expect(obs(e, "runtime_events_in_lookback")?.value_num).toBe(1);
  });

  it("identical duplicates dedupe; a conflicting duplicate id fails closed", async () => {
    const a = row({ id: "dup" });
    const e = await build([a, { ...a }]);
    expect(obs(e, "runtime_events_in_lookback")?.value_num).toBe(1);

    expect(() => canonicalFalconerRows([a, { ...a, severity: "error" }]))
      .toThrow(FalconerSourceConflictError);
    const blocked = await build([a, { ...a, severity: "error" }]);
    expect(blocked.status).toBe("blocked");
    expect(blocked.direction).toBe("unknown");
    expect(blocked.recommendation).toBe("no_action");
    expect(blocked.data_health.status).toBe("critical");
  });

  it("is input-order independent", async () => {
    const rows = [
      row({ id: "a", created_at: ANCHOR - 30 * MIN }),
      row({ id: "b", created_at: ANCHOR - 20 * MIN, event_type: "signal_created", severity: "info" }),
      row({ id: "c", created_at: ANCHOR - 5 * MIN }),
    ];
    const one = await sealEvidence(await build(rows));
    const two = await sealEvidence(await build([...rows].reverse()));
    expect(two.evidence_hash).toBe(one.evidence_hash);
  });

  it("reports a genuine signal_created event without manufacturing one", async () => {
    const withSignal = await build([
      row({ id: "s", created_at: ANCHOR - 12 * MIN, event_type: "signal_created", severity: "info" }),
    ]);
    expect(obs(withSignal, "falconer_runtime_signal_created_event_present")?.value_text).toBe("true");
    expect(obs(withSignal, "newest_signal_event_age_minutes")?.value_num).toBe(12);
    expect(obs(withSignal, "runtime_event_signal_created_count")?.value_num).toBe(1);

    const without = await build([row({ id: "x" })]);
    expect(obs(without, "falconer_runtime_signal_created_event_present")?.value_text).toBe("false");
    expect(obs(without, "runtime_event_signal_created_count")?.value_num).toBe(0);
    expect(without.uncertainty.limitations.join(" | ")).toContain("no setup or direction is manufactured");
  });

  it("provenance cites only the spec and exact source event ids", async () => {
    const e = await build([row({ id: "prov-1", created_at: ANCHOR - 3 * MIN })]);
    expect(e.provenance_refs.some((p) => p.startsWith("spec:ron_falconer_signal_source:v1:"))).toBe(true);
    expect(e.provenance_refs).toContain("source:falconer_engine_events");
    expect(e.provenance_refs.some((p) => p.startsWith("falconer_engine_event:prov-1:"))).toBe(true);
    const joined = e.provenance_refs.join(" ");
    for (const forbidden of ["calibration", "research", "feature", "label", "tradingview", "pine"]) {
      expect(joined.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("2D.2j — truthfulness invariants", () => {
  const cases = async () => [
    await build([]),
    await build([row({ id: "a" })]),
    await build([row({ id: "s", event_type: "signal_created", severity: "info" })]),
    await build([row({ id: "old", created_at: ANCHOR - 200 * MIN })]),
  ];

  it("envelope direction is never long, short or mixed", async () => {
    for (const e of await cases()) expect(["neutral", "unknown"]).toContain(e.direction);
  });

  it("recommendation is context_only when supported and no_action otherwise", async () => {
    for (const e of await cases()) {
      expect(e.recommendation).toBe(e.status === "supported" ? "context_only" : "no_action");
    }
  });

  it("every envelope validates, seals and is denylist clean", async () => {
    for (const e of await cases()) {
      expect(validateEvidence(e)).toEqual([]);
      expect(scanDenylist(e)).toEqual([]);
      await expect(sealEvidence(e)).resolves.toBeTruthy();
    }
  });

  it("carries no performance, parity, probability or trade-geometry field", async () => {
    for (const e of await cases()) {
      const keys = e.observations.map((o) => o.key.toLowerCase()).join(" ");
      for (const forbidden of [
        "probability", "confidence", "likelihood", "expected_value", "edge", "score",
        "rating", "win_rate", "profit_factor", "expectancy", "forecast",
        "entry", "stop", "invalidation", "target", "reward", "lot", "position",
        "order", "trailing", "partial", "break_even",
      ]) {
        expect(keys).not.toContain(forbidden);
      }
      // TradingView/Pine parity is named ONLY inside the frozen limitation that DENIES it.
      const text = JSON.stringify(e).toLowerCase();
      for (const forbidden of [
        "win rate", "profit factor", "expectancy", "matches tradingview",
        "equivalent to tradingview", "validated edge is present", "because",
      ]) {
        expect(text).not.toContain(forbidden);
      }
      for (const line of [...e.uncertainty.limitations, ...e.data_health.issues]) {
        if (/tradingview|pine/i.test(line)) expect(line).toMatch(/UNRESOLVED/);
      }
    }
  });

  it("states its strategy-context-only authority and unresolved parity limitation", async () => {
    const e = await build([row({ id: "a" })]);
    expect(obs(e, "falconer_authority")?.value_text).toBe("strategy_context_only");
    const l = e.uncertainty.limitations.join(" | ");
    expect(l).toContain("STRATEGY CONTEXT ONLY");
    expect(l).toContain("UNRESOLVED");
    expect(l).toContain("no strategy evaluation");
  });
});

describe("2D.2j — purity and endpoint safety", () => {
  const specSrcRaw = readFileSync("supabase/functions/_shared/ron-falconer-signal-source-spec.ts", "utf8");
  /** Executable producer code with the documentation header stripped. */
  const specSrc = specSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "");
  const fnSrcRaw = readFileSync("supabase/functions/ron-agent-falconer-signal-source/index.ts", "utf8");
  const fnSrc = fnSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the pure producer performs no I/O, reads no clock and never touches broker or strategy code", () => {
    for (const forbidden of [
      "Date.now(", "createClient", "fetch(", "Deno.env", "performance.now(", "supabase",
      "falconer-strategy", "pineconnector", "openai",
    ]) {
      expect(specSrc.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // `metaapi` may appear ONLY inside the frozen forbidden-field denylist declaration.
    const metaLines = specSrc.toLowerCase().split("\n").filter((l) => l.includes("metaapi"));
    expect(metaLines.every((l) => l.includes("metaapi_position_ids"))).toBe(true);
  });

  it("the endpoint selects only the frozen allowed projections", () => {
    expect(fnSrc).toContain('.select("id, symbol, event_type, severity, created_at")');
    expect(fnSrc).toContain(".select(TRADE_STATE_COLUMNS)");
    expect(fnSrc).toContain(
      '"id, symbol, timeframe, mode, direction, trigger_type, status, opened_at, closed_at, updated_at"',
    );
    expect(fnSrc).not.toContain("select(\"*\")");
    expect(fnSrc).not.toContain("falconer-strategy");
    // No body-supplied subject and no service-role read of user-scoped trades.
    expect(fnSrc).not.toContain("body.user_id");
    expect(fnSrc).toContain("getClaims");
    expect(fnSrc).toContain("if (subjectBound && subjectClient)");
  });

  it("the endpoint has no write, orchestrator, broker, order or external-fetch path", () => {
    for (const forbidden of [
      ".insert(", ".upsert(", ".update(", ".delete(", ".rpc(",
      "functions.invoke", "openai", "https://api.", "metaapi", "pineconnector",
      "place_order", "send_order", "order_ticket", "trade(",
    ]) {
      expect(fnSrc.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(fnSrc).toContain("persisted: false");
    expect(fnSrc).toContain('execution_path: "signal_only"');
  });

  it("the endpoint enforces fail-closed internal auth", () => {
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnSrc).toContain('json({ error: "unauthorized: internal service-role endpoint" }, 401)');
    expect(fnSrc).toContain("timingSafeEq");
  });

  it("verify_jwt is pinned false with the documented in-code guard", () => {
    const cfg = readFileSync("supabase/config.toml", "utf8");
    expect(cfg).toContain("[functions.ron-agent-falconer-signal-source]");
    const block = cfg.split("[functions.ron-agent-falconer-signal-source]")[1];
    expect(block.split("\n")[1].trim()).toBe("verify_jwt = false");
  });

  it("the bounded cap and lookback are frozen", () => {
    expect(FALCONER_SOURCE_MAX_ROWS).toBe(200);
    expect(FALCONER_SOURCE_LOOKBACK_MINUTES).toBe(240);
    expect(FALCONER_SOURCE_FRESH_MINUTES).toBe(60);
  });
});
