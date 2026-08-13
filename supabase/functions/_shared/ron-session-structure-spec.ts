/**
 * RON Phase 2D.2b — SESSION & MARKET STRUCTURE SPECIALIST v1 (pure producer).
 *
 * Deterministic ANALYTICAL CONTEXT ONLY. This module:
 *   - never reads a clock (every temporal fact is derived from the caller's `as_of`),
 *   - never performs I/O, never imports Falconer, never emits a probability,
 *   - never bridges a source gap, never infers a swing across a missing bar,
 *   - never returns a trade instruction or execution path.
 *
 * The full logic is frozen in SESSION_STRUCTURE_SPEC_V1 BEFORE any output is inspected;
 * its canonical hash is carried in every envelope's provenance so a reviewer can prove
 * which semantics produced a given evidence hash.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
  type EvidenceStatus, type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";
import { classifyRonSession, xauVenueOpen } from "./ron-sessions.ts";
import { RON_QUALITY_VERSION } from "./ron-data-quality.ts";

/* ------------------------------------------------------------------ the spec */

export const SESSION_STRUCTURE_SPEC_V1 = {
  spec_id: "ron_session_market_structure",
  spec_version: 1,
  agent_id: "session_market_structure",
  agent_version: 1,
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: 15,

  /** Bars are eligible only under the accepted central quality contract. */
  quality_contract: { quality_version: RON_QUALITY_VERSION, critical_fails_closed: true },

  /** Genuine broker-native closed bars only. No resample / interpolation / fill. */
  source_contract: {
    source: "candle_history_native",
    closed_bars_only: true,
    synthetic_allowed: false,
    forward_fill_allowed: false,
  },

  /** Confirmed swing definition. Right side must be CLOSED before the swing is knowable. */
  swing: {
    left_bars: 2,
    right_bars: 2,
    comparison: "strict_greater_for_high_strict_less_for_low",
    equal_extremes_do_not_confirm: true,
    /** All 5 bars must be time-contiguous eligible bars — never across a gap. */
    require_contiguous_cluster: true,
    knowable_rule: "confirmed_at_close_of_second_right_bar",
  },

  structure_state: {
    inputs: "latest_two_confirmed_swing_highs_and_lows",
    up_structure: "higher_high_and_higher_low",
    down_structure: "lower_high_and_lower_low",
    otherwise: "mixed_or_range",
    insufficient: "insufficient_structure",
  },

  events: {
    scope: "the as_of closed bar only",
    break_rule: "close beyond a swing level that was already KNOWABLE before this bar opened",
    sweep_rule: "high/low trades beyond such a level but the same bar closes back inside",
    predictive_claim: false,
  },

  asian_range: {
    window_utc: "22:00_to_06:00",
    definition: "accepted RON Asian-range window, unchanged",
    requires_fully_observed_window: true,
    never_uses_bars_after_as_of: true,
  },

  lookback_bars_max: 500,
  lookahead: "none",
} as const;

export function sessionStructureSpecHash(): Promise<string> {
  return hashCanonical(SESSION_STRUCTURE_SPEC_V1);
}

/* ---------------------------------------------------------------- structures */

export interface StructureBar {
  /** bar OPEN, epoch ms */
  time: number;
  open: number; high: number; low: number; close: number;
  created_at?: number | null;
}

export type StructureState =
  | "up_structure" | "down_structure" | "mixed_or_range" | "insufficient_structure";

export interface ConfirmedSwing {
  kind: "high" | "low";
  /** bar OPEN of the pivot bar */
  time: number;
  level: number;
  /** bar OPEN of the second right-side bar — the swing is unknown before its CLOSE. */
  knowable_from: number;
}

const BAR_MS = SESSION_STRUCTURE_SPEC_V1.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Confirmed swings over an ascending list of ELIGIBLE bars.
 * A pivot needs 2 contiguous eligible bars on each side; the second right bar must have
 * CLOSED at or before `asOfClose`, otherwise the swing is not yet knowable.
 */
export function confirmedSwings(eligible: StructureBar[], asOfClose: number): ConfirmedSwing[] {
  const out: ConfirmedSwing[] = [];
  for (let i = 2; i + 2 < eligible.length + 0; i++) {
    const c = eligible.slice(i - 2, i + 3);
    if (c.length < 5) continue;
    // contiguity: never infer a swing across a gap or missing bar
    let contiguous = true;
    for (let k = 1; k < 5; k++) if (c[k].time - c[k - 1].time !== BAR_MS) contiguous = false;
    if (!contiguous) continue;
    const rightClose = c[4].time + BAR_MS;
    if (rightClose > asOfClose) continue;               // not knowable yet
    const p = c[2];
    if (p.high > c[0].high && p.high > c[1].high && p.high > c[3].high && p.high > c[4].high) {
      out.push({ kind: "high", time: p.time, level: p.high, knowable_from: rightClose });
    }
    if (p.low < c[0].low && p.low < c[1].low && p.low < c[3].low && p.low < c[4].low) {
      out.push({ kind: "low", time: p.time, level: p.low, knowable_from: rightClose });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export function structureStateFrom(swings: ConfirmedSwing[]): StructureState {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  if (highs.length < 2 || lows.length < 2) return "insufficient_structure";
  const [ph, lh] = highs.slice(-2);
  const [pl, ll] = lows.slice(-2);
  if (lh.level > ph.level && ll.level > pl.level) return "up_structure";
  if (lh.level < ph.level && ll.level < pl.level) return "down_structure";
  return "mixed_or_range";
}

export type StructureEventKind = "break_up" | "break_down" | "sweep_high" | "sweep_low" | "none";

export interface StructureEvent {
  kind: StructureEventKind;
  level: number | null;
  level_time: number | null;
}

/**
 * Event on the as_of bar only, against levels that were KNOWABLE before that bar OPENED.
 * Break takes precedence over sweep on the same side; up is evaluated before down.
 */
export function structureEventAt(
  bar: StructureBar, swings: ConfirmedSwing[],
): StructureEvent {
  const known = swings.filter((s) => s.knowable_from <= bar.time);
  const hi = known.filter((s) => s.kind === "high").at(-1) ?? null;
  const lo = known.filter((s) => s.kind === "low").at(-1) ?? null;
  if (hi && bar.close > hi.level) return { kind: "break_up", level: hi.level, level_time: hi.time };
  if (lo && bar.close < lo.level) return { kind: "break_down", level: lo.level, level_time: lo.time };
  if (hi && bar.high > hi.level && bar.close <= hi.level) {
    return { kind: "sweep_high", level: hi.level, level_time: hi.time };
  }
  if (lo && bar.low < lo.level && bar.close >= lo.level) {
    return { kind: "sweep_low", level: lo.level, level_time: lo.time };
  }
  return { kind: "none", level: null, level_time: null };
}

/* -------------------------------------------------------------- Asian range */

export interface AsianRange {
  status: "observed" | "insufficient";
  high: number | null;
  low: number | null;
  start: number | null;
  end: number | null;
  bars_present: number;
  bars_expected: number;
}

/** Start (22:00 UTC) of the most recent Asian window that fully CLOSED at or before `asOfClose`. */
export function lastCompletedAsianWindow(asOfClose: number): { start: number; end: number } {
  const d = new Date(asOfClose);
  // candidate end = 06:00 UTC of the as_of day; walk back until end <= asOfClose
  let end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0, 0);
  while (end > asOfClose) end -= 86_400_000;
  return { start: end - 8 * 3_600_000, end };
}

export function asianRange(eligible: StructureBar[], asOfClose: number): AsianRange {
  const { start, end } = lastCompletedAsianWindow(asOfClose);
  let expected = 0;
  for (let t = start; t < end; t += BAR_MS) if (xauVenueOpen(new Date(t))) expected++;
  const inWin = eligible.filter((b) => b.time >= start && b.time < end && b.time + BAR_MS <= asOfClose);
  if (expected === 0 || inWin.length !== expected) {
    return {
      status: "insufficient", high: null, low: null, start, end,
      bars_present: inWin.length, bars_expected: expected,
    };
  }
  return {
    status: "observed",
    high: Math.max(...inWin.map((b) => b.high)),
    low: Math.min(...inWin.map((b) => b.low)),
    start, end, bars_present: inWin.length, bars_expected: expected,
  };
}

/* --------------------------------------------------------------- the producer */

export interface SessionStructureInput {
  instrument: string;
  timeframe: string;
  /** bar OPEN (epoch ms) of the CLOSED bar the evidence describes. */
  as_of: number;
  /** Ascending source bars. Anything after `as_of` is discarded before analysis. */
  bars: StructureBar[];
  /** Central quality contract predicate — never a local re-implementation. */
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  run_id: string;
  trace_id: string;
  /** Lineage ids actually used (quality/feature/recovery refs). */
  lineage_refs?: string[];
  /** Newest genuine source bar OPEN available to the caller, for source-lag reporting. */
  newest_source_bar?: number;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });
const event = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "event", value_text: value, ...(at ? { at } : {}) });

/**
 * Build the Evidence V1 envelope. PURE: identical inputs => identical envelope bytes.
 * The returned envelope is unsealed; the caller seals it with `sealEvidence`.
 */
export async function buildSessionStructureEvidence(
  input: SessionStructureInput,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await sessionStructureSpecHash();
  const asOf = input.as_of;
  const asOfClose = asOf + BAR_MS;
  const venueOpenAtAsOf = xauVenueOpen(new Date(asOf));
  const session = classifyRonSession(asOf);

  // 1. no lookahead is representable: everything after as_of is dropped first.
  const atOrBefore = input.bars
    .filter((b) => b.time <= asOf)
    .sort((a, b) => a.time - b.time);
  const eligibleAll = atOrBefore.filter((b) => !input.isQuarantined(b, SESSION_STRUCTURE_SPEC_V1.bar_minutes));
  const eligible = eligibleAll.slice(-SESSION_STRUCTURE_SPEC_V1.lookback_bars_max);
  const excludedCritical = atOrBefore.length - eligibleAll.length;
  const asOfBar = eligible.at(-1)?.time === asOf ? eligible.at(-1)! : null;

  const observations: Observation[] = [
    state("session_state", session.session, iso(asOf)),
    state("session_overlap", session.overlap ? "overlap" : "single_or_none", iso(asOf)),
    state("venue_state", venueOpenAtAsOf ? "venue_open" : "venue_closed", iso(asOf)),
    num("session_minutes_elapsed", session.minutes_into_session ?? -1, iso(asOf), "minutes"),
    num("eligible_bars_used", eligible.length, iso(asOf), "bars"),
    num("critical_bars_excluded", excludedCritical, iso(asOf), "bars"),
  ];

  const provenance_refs = [
    `spec:${SESSION_STRUCTURE_SPEC_V1.spec_id}:v${SESSION_STRUCTURE_SPEC_V1.spec_version}:${spec_hash}`,
    `quality_version:${SESSION_STRUCTURE_SPEC_V1.quality_contract.quality_version}`,
    `source:${SESSION_STRUCTURE_SPEC_V1.source_contract.source}:${input.instrument}:${input.timeframe}`,
    ...(input.lineage_refs ?? []),
  ];
  const source_timestamps: Record<string, string> = { as_of_bar_open: iso(asOf), as_of_bar_close: iso(asOfClose) };
  if (eligible.length) {
    source_timestamps.oldest_bar_used = iso(eligible[0].time);
    source_timestamps.newest_eligible_bar = iso(eligible.at(-1)!.time);
  }
  if (input.newest_source_bar != null) {
    source_timestamps.newest_source_bar = iso(input.newest_source_bar);
  }

  const limitations: string[] = [
    "deterministic structural context only; no predictive or probabilistic claim",
    "no promoted state variable exists, so no conditional expectation is asserted",
  ];
  const issues: string[] = [];

  // freshness is derived, never clock-read: lag of as_of behind the newest genuine bar.
  const freshness_minutes = input.newest_source_bar != null && input.newest_source_bar > asOf
    ? Math.round((input.newest_source_bar - asOf) / 60_000)
    : 0;

  let status: EvidenceStatus;
  let direction: QualitativeDirection = "unknown";
  let recommendation: RecommendationV1 = "context_only";
  let healthStatus: "healthy" | "degraded" | "critical" = "healthy";

  if (!asOfBar) {
    // Distinguish MARKET CLOSED from a genuine source defect. Both fail closed for
    // structure, but only the latter is a data-health failure.
    if (!venueOpenAtAsOf) {
      status = "insufficient_data";
      recommendation = "no_action";
      issues.push("venue_closed_no_bar_expected");
      limitations.push("as_of falls in a scheduled venue closure; no closed bar is expected");
      observations.push(state("structure_state", "insufficient_structure", iso(asOf)));
      observations.push(state("as_of_bar_status", "market_closed", iso(asOf)));
    } else {
      status = "blocked";
      recommendation = "no_action";
      healthStatus = "critical";
      const quarantined = atOrBefore.some((b) => b.time === asOf);
      issues.push(quarantined ? "as_of_bar_quality_critical" : "as_of_bar_missing_from_genuine_source");
      limitations.push("source defect at as_of; never bridged, interpolated or forward-filled");
      observations.push(state("structure_state", "insufficient_structure", iso(asOf)));
      observations.push(state("as_of_bar_status", quarantined ? "quality_critical" : "source_missing", iso(asOf)));
    }
    return {
      schema_version: 1,
      agent_id: "session_market_structure",
      agent_version: 1,
      run_id: input.run_id,
      trace_id: input.trace_id,
      instrument: input.instrument,
      timeframe: input.timeframe,
      as_of: iso(asOf),
      source_timestamps,
      observations,
      provenance_refs,
      data_health: {
        status: healthStatus,
        freshness_minutes,
        completeness: eligible.length ? 1 : 0,
        issues,
      },
      uncertainty: { level: "unquantified", limitations },
      conflicts: [],
      dependencies: [`quality_contract_v${SESSION_STRUCTURE_SPEC_V1.quality_contract.quality_version}`],
      status,
      direction: "unknown",
      recommendation,
    };
  }

  const swings = confirmedSwings(eligible, asOfClose);
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const structure = structureStateFrom(swings);
  const ev = structureEventAt(asOfBar, swings);
  const asia = asianRange(eligible, asOfClose);

  observations.push(
    num("as_of_bar_close_price", asOfBar.close, iso(asOf)),
    num("as_of_bar_high", asOfBar.high, iso(asOf)),
    num("as_of_bar_low", asOfBar.low, iso(asOf)),
    state("structure_state", structure, iso(asOf)),
    num("confirmed_swing_highs_known", highs.length, iso(asOf), "swings"),
    num("confirmed_swing_lows_known", lows.length, iso(asOf), "swings"),
  );
  if (highs.at(-1)) observations.push(num("latest_confirmed_swing_high", highs.at(-1)!.level, iso(highs.at(-1)!.time)));
  if (highs.at(-2)) observations.push(num("previous_confirmed_swing_high", highs.at(-2)!.level, iso(highs.at(-2)!.time)));
  if (lows.at(-1)) observations.push(num("latest_confirmed_swing_low", lows.at(-1)!.level, iso(lows.at(-1)!.time)));
  if (lows.at(-2)) observations.push(num("previous_confirmed_swing_low", lows.at(-2)!.level, iso(lows.at(-2)!.time)));

  observations.push(event("structure_event", ev.kind, iso(asOf)));
  if (ev.level != null) {
    observations.push(num("structure_event_level", ev.level, iso(ev.level_time!)));
  }

  observations.push(state("asian_range_status", asia.status, iso(asOf)));
  if (asia.status === "observed") {
    observations.push(
      num("asian_range_high", asia.high!, iso(asia.start!)),
      num("asian_range_low", asia.low!, iso(asia.start!)),
    );
  } else {
    limitations.push("asian range window not fully observed from genuine bars");
  }

  if (structure === "insufficient_structure") {
    status = "insufficient_data";
    limitations.push("fewer than two confirmed swing highs and lows are knowable at as_of");
  } else {
    status = "supported";
    direction = structure === "up_structure" ? "long" : structure === "down_structure" ? "short" : "neutral";
  }
  limitations.push("direction is qualitative structure context, not a trade recommendation");

  if (excludedCritical > 0) {
    healthStatus = "degraded";
    issues.push(`quality_critical_bars_excluded:${excludedCritical}`);
  }

  return {
    schema_version: 1,
    agent_id: "session_market_structure",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: iso(asOf),
    source_timestamps,
    observations,
    provenance_refs,
    data_health: {
      status: healthStatus,
      freshness_minutes,
      completeness: Math.min(1, eligible.length / SESSION_STRUCTURE_SPEC_V1.lookback_bars_max),
      issues,
    },
    uncertainty: { level: "unquantified", limitations },
    conflicts: [],
    dependencies: [`quality_contract_v${SESSION_STRUCTURE_SPEC_V1.quality_contract.quality_version}`],
    status,
    direction,
    recommendation: "context_only",
  };
}
