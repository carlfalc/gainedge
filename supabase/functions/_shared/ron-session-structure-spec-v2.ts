/**
 * RON Phase 2D.2b-CORR — SESSION & MARKET STRUCTURE SPECIALIST spec V2 (pure producer).
 *
 * FORWARD-ONLY correction of SESSION_STRUCTURE_SPEC_V1. V1 stays byte-frozen in
 * `ron-session-structure-spec.ts` because a persisted audit evidence row was emitted
 * under its hash. V2 keeps agent_id='session_market_structure' and agent_version=1 so it
 * remains compatible with the accepted Agentic Core registry; the SPEC version/hash in
 * `provenance_refs` is what distinguishes a V1 envelope from a V2 envelope.
 *
 * Corrections relative to V1:
 *   1. provenance cites ONLY lineage actually used (no decorative feature/label refs),
 *   2. quality-critical bars and unexpected missing EXPECTED-OPEN slots are HARD
 *      analytical segment boundaries, so no defect can be bridged indirectly through
 *      swings taken from opposite sides of the defect,
 *   3. completeness is measured against EXPECTED source slots in the bounded interval,
 *      not against the lookback cap; expected closures never reduce it,
 *   4. `source_timestamps` contains ONLY instants that exist in the genuine source.
 *
 * Invariants retained from V1: no clock read, no I/O, no Falconer import, no probability,
 * no fabricated bar, no execution path.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
  type EvidenceStatus, type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";
import { classifyRonSession, xauVenueOpen } from "./ron-sessions.ts";
import { expectedClosedReasonV2, RON_VENUE_CALENDAR_VERSION_V2 } from "./ron-venue-calendar-v2.ts";
import { RON_QUALITY_VERSION } from "./ron-data-quality.ts";
import type { StructureBar, StructureState, ConfirmedSwing, StructureEventKind, StructureEvent } from "./ron-session-structure-spec.ts";

export type { StructureBar, StructureState, ConfirmedSwing, StructureEventKind, StructureEvent };

/* ------------------------------------------------------------------ the spec */

export const SESSION_STRUCTURE_SPEC_V2 = {
  spec_id: "ron_session_market_structure",
  spec_version: 2,
  supersedes_spec_version: 1,
  agent_id: "session_market_structure",
  agent_version: 1,
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: 15,

  quality_contract: { quality_version: RON_QUALITY_VERSION, critical_fails_closed: true },

  source_contract: {
    source: "candle_history_native",
    closed_bars_only: true,
    synthetic_allowed: false,
    forward_fill_allowed: false,
    /** Broker/source presence is TRUTH. The calendar is corroborating context only. */
    broker_presence_is_authoritative: true,
    calendar_context: `ron_venue_calendar_v${RON_VENUE_CALENDAR_VERSION_V2}`,
  },

  /**
   * Slot classification over the bounded interval grid. Exactly one class per slot.
   *   admissible             — genuine bar present and not quality-critical
   *   quality_critical       — genuine bar present but quarantined by the central contract
   *   unexpected_missing     — no bar although the slot is expected-open
   *   expected_closed        — no bar and the venue/calendar expects a closure
   */
  slot_classification: {
    classes: ["admissible", "quality_critical", "unexpected_missing", "expected_closed"],
    presence_overrides_calendar: true,
    expected_open_source: "xauVenueOpen AND venue_calendar_v2 expectedClosedReasonV2",
  },

  /** Segmentation: defects cut the analytical history; expected closures never do. */
  segmentation: {
    hard_boundary_on: ["quality_critical", "unexpected_missing"],
    never_boundary_on: ["expected_closed"],
    current_segment: "the maximal admissible run ending at as_of",
    cross_segment_swing_reuse: false,
  },

  /**
   * Swing adjacency is by ELIGIBLE-BAR ADJACENCY WITHIN ONE SEGMENT: the two immediately
   * preceding and two immediately following closed eligible bars. Expected-closed slots
   * may be skipped because they are not eligible bars; no bar is ever invented.
   */
  swing: {
    left_bars: 2,
    right_bars: 2,
    comparison: "strict_greater_for_high_strict_less_for_low",
    equal_extremes_do_not_confirm: true,
    adjacency: "eligible_bar_adjacency_within_segment",
    knowable_rule: "confirmed_at_close_of_second_right_bar",
  },

  structure_state: {
    inputs: "latest_two_confirmed_swing_highs_and_lows_within_the_current_segment",
    up_structure: "higher_high_and_higher_low",
    down_structure: "lower_high_and_lower_low",
    otherwise: "mixed_or_range",
    insufficient: "insufficient_structure",
  },

  events: {
    scope: "the as_of closed bar only",
    level_scope: "current_segment_only",
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

  data_health: {
    completeness_definition:
      "admissible_slots / (expected_open_slots) over the bounded evidence interval; " +
      "expected_closed slots are excluded from both numerator and denominator; " +
      "any slot with a genuine bar present counts as expected-open",
    reduces_completeness: ["quality_critical", "unexpected_missing"],
    fabrication_allowed: false,
  },

  source_timestamps_policy: {
    actual_source_instants_only: true,
    requested_instant_channel: "envelope.as_of + as_of_bar_status observation",
  },

  lookback_bars_max: 500,
  lookahead: "none",
} as const;

export function sessionStructureSpecHashV2(): Promise<string> {
  return hashCanonical(SESSION_STRUCTURE_SPEC_V2);
}

const BAR_MS = SESSION_STRUCTURE_SPEC_V2.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* --------------------------------------------------------------- slot model */

export type SlotClass = "admissible" | "quality_critical" | "unexpected_missing" | "expected_closed";

export interface Slot {
  time: number;
  cls: SlotClass;
  bar: StructureBar | null;
}

/** Expected-open decision. Venue schedule AND calendar closure context must both allow. */
export function expectedOpenSlot(time: number): boolean {
  if (!xauVenueOpen(new Date(time))) return false;
  return expectedClosedReasonV2(time) === null;
}

/**
 * Classify every 15m slot in [from, to] inclusive. Presence of a genuine bar always
 * wins over the calendar: a bar that exists is never re-labelled as a closure.
 */
export function classifySlots(
  from: number, to: number, bars: StructureBar[],
  isQuarantined: (b: { time: number; created_at?: number | null }, m: number) => boolean,
): Slot[] {
  const byTime = new Map<number, StructureBar>();
  for (const b of bars) if (b.time >= from && b.time <= to) byTime.set(b.time, b);
  const out: Slot[] = [];
  for (let t = from; t <= to; t += BAR_MS) {
    const bar = byTime.get(t) ?? null;
    if (bar) {
      out.push({
        time: t,
        cls: isQuarantined(bar, SESSION_STRUCTURE_SPEC_V2.bar_minutes) ? "quality_critical" : "admissible",
        bar,
      });
    } else {
      out.push({ time: t, cls: expectedOpenSlot(t) ? "unexpected_missing" : "expected_closed", bar: null });
    }
  }
  return out;
}

export interface Segment {
  bars: StructureBar[];
  /** Why this segment starts where it does. */
  start_reason: "window_start" | "quality_critical_defect" | "unexpected_missing_slot";
  /** Slot time of the defect that opened this segment (null for window_start). */
  boundary_time: number | null;
}

/** Split the classified slots into admissible segments cut by hard boundaries. */
export function segmentSlots(slots: Slot[]): Segment[] {
  const segments: Segment[] = [];
  let cur: Segment | null = null;
  let pendingReason: Segment["start_reason"] = "window_start";
  let pendingBoundary: number | null = null;

  for (const s of slots) {
    if (s.cls === "expected_closed") continue;                       // never a boundary
    if (s.cls === "admissible") {
      if (!cur) {
        cur = { bars: [], start_reason: pendingReason, boundary_time: pendingBoundary };
        segments.push(cur);
      }
      cur.bars.push(s.bar!);
      continue;
    }
    // hard boundary
    cur = null;
    pendingReason = s.cls === "quality_critical" ? "quality_critical_defect" : "unexpected_missing_slot";
    pendingBoundary = s.time;
  }
  return segments;
}

/* ------------------------------------------------------------------- swings */

/**
 * Confirmed swings over ONE segment. Adjacency is by position in the segment (the two
 * immediately preceding/following ELIGIBLE bars), so an expected closure is skipped
 * without inventing a bar, while a defect can never be skipped because it ended the
 * segment.
 */
export function confirmedSwingsInSegment(seg: StructureBar[], asOfClose: number): ConfirmedSwing[] {
  const out: ConfirmedSwing[] = [];
  for (let i = 2; i + 2 < seg.length; i++) {
    const c = [seg[i - 2], seg[i - 1], seg[i], seg[i + 1], seg[i + 2]];
    const rightClose = c[4].time + BAR_MS;
    if (rightClose > asOfClose) continue;
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

export function structureStateFromV2(swings: ConfirmedSwing[]): StructureState {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  if (highs.length < 2 || lows.length < 2) return "insufficient_structure";
  const [ph, lh] = highs.slice(-2);
  const [pl, ll] = lows.slice(-2);
  if (lh.level > ph.level && ll.level > pl.level) return "up_structure";
  if (lh.level < ph.level && ll.level < pl.level) return "down_structure";
  return "mixed_or_range";
}

export function structureEventAtV2(bar: StructureBar, swings: ConfirmedSwing[]): StructureEvent {
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

export interface AsianRangeV2 {
  status: "observed" | "insufficient";
  high: number | null;
  low: number | null;
  start: number;
  end: number;
  bars_present: number;
  bars_expected: number;
}

export function lastCompletedAsianWindowV2(asOfClose: number): { start: number; end: number } {
  const d = new Date(asOfClose);
  let end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0, 0);
  while (end > asOfClose) end -= 86_400_000;
  return { start: end - 8 * 3_600_000, end };
}

/** Fully observed genuine admissible window, or `insufficient`. Never bridged. */
export function asianRangeV2(admissible: StructureBar[], asOfClose: number): AsianRangeV2 {
  const { start, end } = lastCompletedAsianWindowV2(asOfClose);
  let expected = 0;
  for (let t = start; t < end; t += BAR_MS) if (expectedOpenSlot(t)) expected++;
  const inWin = admissible.filter((b) => b.time >= start && b.time < end && b.time + BAR_MS <= asOfClose);
  if (expected === 0 || inWin.length !== expected) {
    return { status: "insufficient", high: null, low: null, start, end, bars_present: inWin.length, bars_expected: expected };
  }
  return {
    status: "observed",
    high: Math.max(...inWin.map((b) => b.high)),
    low: Math.min(...inWin.map((b) => b.low)),
    start, end, bars_present: inWin.length, bars_expected: expected,
  };
}

/* --------------------------------------------------------------- the producer */

export interface SessionStructureInputV2 {
  instrument: string;
  timeframe: string;
  /** bar OPEN (epoch ms) of the CLOSED bar the evidence describes. */
  as_of: number;
  bars: StructureBar[];
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  run_id: string;
  trace_id: string;
  /** Lineage ids ACTUALLY queried and used. Decorative refs are a contract violation. */
  lineage_refs?: string[];
  newest_source_bar?: number;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });
const event = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "event", value_text: value, ...(at ? { at } : {}) });

export async function buildSessionStructureEvidenceV2(
  input: SessionStructureInputV2,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await sessionStructureSpecHashV2();
  const asOf = input.as_of;
  const asOfClose = asOf + BAR_MS;
  const venueOpenAtAsOf = expectedOpenSlot(asOf);
  const session = classifyRonSession(asOf);

  // Bounded evidence interval: a fixed slot grid ending at as_of. No lookahead is
  // representable because every bar after as_of is dropped before classification.
  const atOrBefore = input.bars.filter((b) => b.time <= asOf).sort((a, b) => a.time - b.time);
  const windowStart = asOf - (SESSION_STRUCTURE_SPEC_V2.lookback_bars_max - 1) * BAR_MS;
  const slots = classifySlots(windowStart, asOf, atOrBefore, input.isQuarantined);

  const count = (c: SlotClass) => slots.filter((s) => s.cls === c).length;
  const admissible_slots = count("admissible");
  const critical_excluded_slots = count("quality_critical");
  const unexpected_missing_slots = count("unexpected_missing");
  const expected_closed_slots = count("expected_closed");
  const expected_open_slots = admissible_slots + critical_excluded_slots + unexpected_missing_slots;
  const native_present_slots = admissible_slots + critical_excluded_slots;
  const completeness = expected_open_slots === 0 ? 0 : admissible_slots / expected_open_slots;

  const segments = segmentSlots(slots);
  const last = segments.at(-1) ?? null;
  const currentSegment = last && last.bars.at(-1)!.time === asOf ? last : null;
  const asOfSlot = slots.at(-1)!;
  const admissibleAll = slots.filter((s) => s.cls === "admissible").map((s) => s.bar!);

  const provenance_refs = [
    `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${spec_hash}`,
    `quality_version:${SESSION_STRUCTURE_SPEC_V2.quality_contract.quality_version}`,
    `venue_calendar_context:v${RON_VENUE_CALENDAR_VERSION_V2}`,
    `source:${SESSION_STRUCTURE_SPEC_V2.source_contract.source}:${input.instrument}:${input.timeframe}`,
    ...(input.lineage_refs ?? []),
  ];

  // ACTUAL source instants only.
  const source_timestamps: Record<string, string> = {};
  if (admissibleAll.length) {
    source_timestamps.oldest_admissible_bar = iso(admissibleAll[0].time);
    source_timestamps.newest_admissible_bar = iso(admissibleAll.at(-1)!.time);
  }
  if (asOfSlot.bar) {
    source_timestamps.as_of_bar_open = iso(asOf);
    source_timestamps.as_of_bar_completed_close = iso(asOfClose);
  }
  if (input.newest_source_bar != null) {
    source_timestamps.newest_source_bar = iso(input.newest_source_bar);
  }

  const limitations: string[] = [
    "deterministic structural context only; no predictive or probabilistic claim",
    "no promoted state variable exists, so no conditional expectation is asserted",
  ];
  const issues: string[] = [];

  const freshness_minutes = input.newest_source_bar != null && input.newest_source_bar > asOf
    ? Math.round((input.newest_source_bar - asOf) / 60_000)
    : 0;

  const observations: Observation[] = [
    state("session_state", session.session, iso(asOf)),
    state("session_overlap", session.overlap ? "overlap" : "single_or_none", iso(asOf)),
    state("venue_state", venueOpenAtAsOf ? "venue_open" : "venue_closed", iso(asOf)),
    num("session_minutes_elapsed", session.minutes_into_session ?? -1, iso(asOf), "minutes"),
    num("expected_open_slots", expected_open_slots, iso(asOf), "slots"),
    num("native_present_slots", native_present_slots, iso(asOf), "slots"),
    num("admissible_slots", admissible_slots, iso(asOf), "slots"),
    num("critical_excluded_slots", critical_excluded_slots, iso(asOf), "slots"),
    num("unexpected_missing_slots", unexpected_missing_slots, iso(asOf), "slots"),
    num("expected_closed_slots", expected_closed_slots, iso(asOf), "slots"),
  ];

  const baseEnvelope = (
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
  ): EvidenceEnvelopeV1 => ({
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
    data_health: { status: healthStatus, freshness_minutes, completeness, issues },
    uncertainty: { level: "unquantified", limitations },
    conflicts: [],
    dependencies: [`quality_contract_v${SESSION_STRUCTURE_SPEC_V2.quality_contract.quality_version}`],
    status,
    direction,
    recommendation,
  });

  // ---- anchor handling: a missing/critical as_of bar is never bridged.
  if (asOfSlot.cls !== "admissible") {
    if (asOfSlot.cls === "expected_closed") {
      issues.push("venue_closed_no_bar_expected");
      limitations.push("as_of falls in a scheduled venue closure; no closed bar is expected");
      observations.push(state("structure_state", "insufficient_structure", iso(asOf)));
      observations.push(state("as_of_bar_status", "market_closed", iso(asOf)));
      observations.push(state("as_of_requested_instant", iso(asOf), iso(asOf)));
      return baseEnvelope("insufficient_data", "healthy", "unknown", "no_action");
    }
    const critical = asOfSlot.cls === "quality_critical";
    issues.push(critical ? "as_of_bar_quality_critical" : "as_of_bar_missing_from_genuine_source");
    limitations.push("source defect at as_of; never bridged, interpolated or forward-filled");
    observations.push(state("structure_state", "insufficient_structure", iso(asOf)));
    observations.push(state("as_of_bar_status", critical ? "quality_critical" : "source_missing", iso(asOf)));
    observations.push(state("as_of_requested_instant", iso(asOf), iso(asOf)));
    return baseEnvelope("blocked", "critical", "unknown", "no_action");
  }

  const asOfBar = asOfSlot.bar!;
  const seg = currentSegment!;
  const swings = confirmedSwingsInSegment(seg.bars, asOfClose);
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const structure = structureStateFromV2(swings);
  const ev = structureEventAtV2(asOfBar, swings);
  const asia = asianRangeV2(admissibleAll, asOfClose);

  observations.push(
    state("as_of_bar_status", "admissible", iso(asOf)),
    state("current_segment_start_reason", seg.start_reason, iso(seg.bars[0].time)),
    num("current_segment_bars", seg.bars.length, iso(asOf), "bars"),
    num("as_of_bar_close_price", asOfBar.close, iso(asOf)),
    num("as_of_bar_high", asOfBar.high, iso(asOf)),
    num("as_of_bar_low", asOfBar.low, iso(asOf)),
    state("structure_state", structure, iso(asOf)),
    num("confirmed_swing_highs_known", highs.length, iso(asOf), "swings"),
    num("confirmed_swing_lows_known", lows.length, iso(asOf), "swings"),
  );
  source_timestamps.current_segment_start_bar = iso(seg.bars[0].time);
  if (seg.boundary_time != null) {
    observations.push(state("current_segment_boundary_at", iso(seg.boundary_time), iso(seg.boundary_time)));
  }

  if (highs.at(-1)) observations.push(num("latest_confirmed_swing_high", highs.at(-1)!.level, iso(highs.at(-1)!.time)));
  if (highs.at(-2)) observations.push(num("previous_confirmed_swing_high", highs.at(-2)!.level, iso(highs.at(-2)!.time)));
  if (lows.at(-1)) observations.push(num("latest_confirmed_swing_low", lows.at(-1)!.level, iso(lows.at(-1)!.time)));
  if (lows.at(-2)) observations.push(num("previous_confirmed_swing_low", lows.at(-2)!.level, iso(lows.at(-2)!.time)));

  observations.push(event("structure_event", ev.kind, iso(asOf)));
  if (ev.level != null) observations.push(num("structure_event_level", ev.level, iso(ev.level_time!)));

  observations.push(state("asian_range_status", asia.status, iso(asOf)));
  if (asia.status === "observed") {
    observations.push(
      num("asian_range_high", asia.high!, iso(asia.start)),
      num("asian_range_low", asia.low!, iso(asia.start)),
    );
  } else {
    limitations.push("asian range window not fully observed from genuine bars");
  }

  let status: EvidenceStatus;
  let direction: QualitativeDirection = "unknown";
  if (structure === "insufficient_structure") {
    status = "insufficient_data";
    limitations.push(
      "fewer than two confirmed swing highs and lows exist inside the current admissible segment; " +
      "older swings across a defect are never borrowed",
    );
  } else {
    status = "supported";
    direction = structure === "up_structure" ? "long" : structure === "down_structure" ? "short" : "neutral";
  }
  limitations.push("direction is qualitative structure context, not a trade recommendation");

  let healthStatus: "healthy" | "degraded" | "critical" = "healthy";
  if (critical_excluded_slots > 0) {
    healthStatus = "degraded";
    issues.push(`quality_critical_bars_excluded:${critical_excluded_slots}`);
  }
  if (unexpected_missing_slots > 0) {
    healthStatus = "degraded";
    issues.push(`unexpected_missing_expected_open_slots:${unexpected_missing_slots}`);
  }
  if (segments.length > 1) {
    issues.push(`analytical_segments_in_window:${segments.length}`);
    limitations.push("historical defects split the window; only the current segment informs structure");
  }

  return baseEnvelope(status, healthStatus, direction, "context_only");
}
