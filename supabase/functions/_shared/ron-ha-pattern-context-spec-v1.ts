/**
 * RON — HEIKIN ASHI PATTERN CONTEXT SPECIALIST spec V1 (pure producer).
 *
 * Implementation marker `GAINEDGE_RON_HA_PATTERN_CONTEXT_V1`.
 *
 * PURPOSE
 * Make Heikin Ashi a first-class RON evidence family focused on PATTERN RELEVANCE
 * (sequence, body dynamics, wick character, contextual confirmation, structural
 * relevance and a transparent lifecycle) rather than merely "what colour is the candle".
 *
 * WHAT THIS MODULE IS NOT
 *   - not a probability, confidence, score, odds, edge, expected value or forecast,
 *   - not a BUY/SELL recommendation, entry, stop, target or order geometry,
 *   - not a causal claim,
 *   - not an execution path (`execution_allowed=false`, `execution_path=signal_only`),
 *   - not a mutation of ANY frozen artifact. Falconer, RON V1-V7, Session/Pattern V3,
 *     calibration/probability governance and Research V4 history are untouched.
 *
 * PURITY
 * No DB, no network, no wall clock, no randomness. Every output is a deterministic
 * function of the explicit inputs. The HA formula is the CANONICAL Falconer formula,
 * re-implemented here (the frozen `falconer-strategy.ts` is never edited to share a
 * helper) and proven equivalent by conformance fixtures in the test suite.
 *
 * THRESHOLD DISCIPLINE
 * This module invents NO numeric threshold constants. Everything is either
 *   (a) exact HA OHLC geometry (equality / strict inequality), or
 *   (b) a relative comparison between adjacent completed HA bars, or
 *   (c) a REUSE of an already-accepted categorical feature produced elsewhere
 *       (`volatility_regime`, `ema_stack`, `macd_state`, DI relation, RSI slope sign,
 *       sealed Session Structure V3 `structure_state` / `structure_event`).
 * Where exact support is missing, the CONSERVATIVE state is emitted
 * (`insufficient` / `unavailable` / `forming`), never a manufactured certainty.
 *
 * ANCHOR CONVENTION (identical to Session V3 / Pattern V3)
 *   `evaluation_anchor` = COMPLETED 15m bar CLOSE.
 *   The authoritative analytical bar OPENS exactly `evaluation_anchor - 15m`.
 *   No forming bar is ever consumed and no source timestamp may exceed the anchor.
 */
import {
  hashCanonical, type Observation,
} from "./ron-agent-contracts.ts";
import {
  acceptSessionStructureContextV3, type SessionContextResultV3,
} from "./ron-pattern-structure-context-v3.ts";

/* ------------------------------------------------------------------- spec */

export const HA_PATTERN_CONTEXT_SPEC_V1 = {
  spec_id: "ron_ha_pattern_context",
  spec_version: 1,
  /** V1 scope is deliberately narrow. Widening is a NEW spec version, never a patch. */
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: 15,

  ha_source_contract: {
    formula: "canonical_heikin_ashi",
    ha_close: "(open + high + low + close) / 4",
    ha_open_first_bar: "(open + close) / 2",
    ha_open_subsequent: "(prev_ha_open + prev_ha_close) / 2",
    ha_high: "max(bar_high, ha_open, ha_close)",
    ha_low: "min(bar_low, ha_open, ha_close)",
    equivalent_to: "supabase/functions/_shared/falconer-strategy.ts:toHA",
    frozen_falconer_file_modified: false,
    seeded_from_first_supplied_bar: true,
    completed_bars_only: true,
  },

  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    authoritative_analytical_bar_open: "evaluation_anchor_minus_one_bar_exactly",
    envelope_as_of_equals_evaluation_anchor: true,
    anchor_must_be_bar_grid_aligned: true,
    same_anchor_for_every_specialist_in_the_run: true,
    per_agent_anchor_convention: false,
    forming_bar_consumed: false,
    source_timestamp_after_anchor_allowed: false,
    wall_clock_read: false,
    rejections: [
      "evaluation_anchor_not_finite",
      "evaluation_anchor_not_bar_close_aligned",
      "instrument_out_of_scope",
      "timeframe_out_of_scope",
      "source_bar_after_evaluation_anchor",
      "newest_analytical_bar_not_at_anchor_minus_one_bar",
    ],
  },

  /** Every emitted family, with its full closed vocabulary. Nothing else may be emitted. */
  evidence_families: {
    trend_sequence: ["bullish", "bearish", "alternating", "neutral", "insufficient"],
    body_dynamics: ["expanding", "contracting", "stable", "insufficient"],
    wick_character: ["no_opposite_wick", "opposing_wick_present", "both_sides", "insufficient"],
    opposing_wick_emergence: ["none", "emerging", "persisting", "insufficient"],
    colour_transition: [
      "none", "bearish_to_bullish", "bullish_to_bearish", "alternating", "insufficient",
    ],
    compression_expansion: ["compressed", "expanding", "normal", "unavailable"],
    ema_relationship: [
      "bullish_alignment", "bearish_alignment", "bullish_cross_forming",
      "bearish_cross_forming", "convergence", "mixed", "unavailable",
    ],
    momentum_confirmation: ["agreement", "mixed", "weakening", "unavailable"],
    structure_relevance: [
      "with_structure", "against_structure", "at_relevant_level", "neutral", "unavailable",
    ],
    lifecycle: [
      "forming", "strengthening", "confirmed", "weakening", "invalidated", "unavailable",
    ],
  },

  /** Exact, ordered rule definitions. First match wins in every family. */
  rules: {
    trend_sequence: [
      "R1 insufficient: fewer than 2 completed HA bars",
      "R2 neutral: newest HA body is exactly zero (ha_close == ha_open)",
      "R3 bullish|bearish: newest colour run length >= 2, direction = newest colour",
      "R4 alternating: run length == 1 and the last 4 HA colours strictly alternate",
      "R5 neutral: otherwise",
    ],
    run_length: "count of consecutive newest-colour HA bars ending at the analytical bar",
    body_dynamics: [
      "R1 insufficient: fewer than 3 completed HA bars",
      "R2 expanding: |body0| > |body1| > |body2|",
      "R3 contracting: |body0| < |body1| < |body2|",
      "R4 stable: otherwise",
    ],
    wick_character: [
      "opposite wick = lower wick for a bullish HA bar, upper wick for a bearish HA bar",
      "upper wick = ha_high - max(ha_open, ha_close); lower wick = min(ha_open, ha_close) - ha_low",
      "R1 insufficient: no completed HA bar, or newest HA body is exactly zero",
      "R2 no_opposite_wick: opposite wick is exactly zero",
      "R3 both_sides: both wicks are strictly positive",
      "R4 opposing_wick_present: otherwise",
    ],
    opposing_wick_emergence: [
      "R1 insufficient: fewer than 2 HA bars, either of the last two bodies is zero, " +
      "or the last two HA colours differ",
      "R2 none: the newest bar has no opposite wick",
      "R3 emerging: newest bar has an opposite wick and the previous bar did not",
      "R4 persisting: both the newest and previous bars have an opposite wick",
    ],
    colour_transition: [
      "R1 insufficient: fewer than 2 HA bars or either of the last two bodies is zero",
      "R2 alternating: the last 4 HA colours strictly alternate",
      "R3 bearish_to_bullish: previous bar bearish, newest bar bullish",
      "R4 bullish_to_bearish: previous bar bullish, newest bar bearish",
      "R5 none: otherwise",
    ],
    compression_expansion: [
      "REUSES the accepted snapshot feature `volatility_regime` verbatim; no new threshold",
      "low -> compressed, high -> expanding, normal -> normal, absent/unknown -> unavailable",
    ],
    ema_relationship: [
      "REUSES accepted snapshot features ema9, ema21, ema_stack (and prior-bar ema9/ema21)",
      "R1 unavailable: ema9 or ema21 absent/non-finite",
      "R2 bullish_cross_forming: prior observations present and the ema9-ema21 sign flipped " +
      "from <=0 to >0 between the prior and the analytical bar",
      "R3 bearish_cross_forming: prior observations present and the sign flipped from >=0 to <0",
      "R4 bullish_alignment: ema9 > ema21 and ema_stack == 'up'",
      "R5 bearish_alignment: ema9 < ema21 and ema_stack == 'down'",
      "R6 convergence: prior observations present and |ema9-ema21| strictly decreased",
      "R7 mixed: otherwise",
    ],
    momentum_confirmation: [
      "REUSES accepted features di_plus/di_minus, macd_state, rsi14_slope3. No new threshold.",
      "reference direction = the HA trend_sequence direction (bullish|bearish only)",
      "R1 unavailable: no bullish/bearish HA direction, or any of the three inputs absent",
      "R2 votes: DI (di_plus > di_minus => bullish, di_minus > di_plus => bearish, tie => none), " +
      "MACD (macd_state prefix bullish|bearish), RSI (rsi14_slope3 > 0 => bullish, < 0 => bearish, " +
      "0 => none)",
      "R3 agreement: all three votes equal the HA direction and macd_state ends with '_expanding'",
      "R4 weakening: all three votes equal the HA direction and macd_state ends with '_fading'",
      "R5 mixed: otherwise",
    ],
    structure_relevance: [
      "CONSUMES a sealed Session Structure V3 envelope at the SAME evaluation anchor; " +
      "structure is never recomputed and its authority fields are never re-derived",
      "R1 unavailable: no admissible sealed Session V3 context, or no HA direction",
      "R2 at_relevant_level: consumed structure_event is not 'none'",
      "R3 with_structure: up_structure with a bullish HA direction, or down_structure with bearish",
      "R4 against_structure: up_structure with bearish, or down_structure with bullish",
      "R5 neutral: otherwise (mixed_or_range / insufficient_structure)",
    ],
    lifecycle: [
      "R1 unavailable: trend_sequence == 'insufficient'",
      "R2 invalidated: colour_transition is a directional flip AND prior_lifecycle is " +
      "'strengthening' or 'confirmed'",
      "R3 confirmed: trend_sequence directional AND body_dynamics == 'expanding' AND " +
      "wick_character == 'no_opposite_wick' AND momentum_confirmation == 'agreement' AND " +
      "ema_relationship is the matching directional alignment AND " +
      "structure_relevance != 'against_structure'",
      "R4 weakening: body_dynamics == 'contracting' OR opposing_wick_emergence in " +
      "('emerging','persisting') OR momentum_confirmation == 'weakening'. Deteriorating " +
      "evidence always dominates strengthening evidence",
      "R5 strengthening (reached only when R4 did not match, so no deteriorating " +
      "opposite-wick state is possible here): trend_sequence directional AND " +
      "run_length >= 2 AND body_dynamics == 'expanding' AND " +
      "(momentum_confirmation == 'agreement' OR ema_relationship is the matching alignment)",
      "R6 forming: otherwise (conservative default)",
      "no hidden numeric score is used at any point; every decision emits reason tokens",
    ],
  },

  reuse_contract: {
    snapshot_features_consumed: [
      "ema9", "ema21", "ema_stack", "ema21_slope",
      "adx14", "di_plus", "di_minus", "macd_state", "rsi14", "rsi14_slope3",
      "volatility_regime", "regime",
    ],
    sealed_evidence_consumed: [
      "session_market_structure_v3.structure_state",
      "session_market_structure_v3.structure_event",
    ],
    new_numeric_thresholds_introduced: 0,
    ha_state_semantics_source: "ron_market_snapshots.features.ha_state (bullish|bearish)",
    ha_body_pct_semantics_source: "ron_market_snapshots.features.ha_body_pct",
  },

  relevance_contract: {
    raw_observation_separated_from_context: true,
    contextual_confirmation_separated_from_relevance: true,
    relevance_separated_from_lifecycle: true,
    families_never_collapsed_into_a_single_number: true,
  },

  safety_contract: {
    emits_probability: false,
    emits_confidence: false,
    emits_score: false,
    emits_forecast: false,
    emits_expected_value: false,
    emits_recommendation: false,
    emits_entry_stop_target_or_order_geometry: false,
    emits_causal_claim: false,
    execution_allowed: false,
    execution_path: "signal_only",
    persists: false,
    reads_database: false,
    reads_network: false,
    reads_wall_clock: false,
    deterministic: true,
    hash_pinned: true,
  },
} as const;

export function haPatternContextSpecHashV1(): Promise<string> {
  return hashCanonical(HA_PATTERN_CONTEXT_SPEC_V1);
}

/* -------------------------------------------------------------- primitives */

const BAR_MS = HA_PATTERN_CONTEXT_SPEC_V1.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

export interface HaSourceBar {
  /** Bar OPEN instant, epoch ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HaBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * CANONICAL Heikin Ashi, byte-for-byte the same arithmetic as the frozen Falconer
 * `toHA`. Implemented here so the frozen strategy file is never touched; equivalence
 * is proven by conformance fixtures in `src/test/ron-ha-pattern-context-v1.test.ts`.
 */
export function canonicalHeikinAshi(bars: HaSourceBar[]): HaBar[] {
  const ha: HaBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0
      ? (c.open + c.close) / 2
      : (ha[i - 1].open + ha[i - 1].close) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    ha.push({ time: c.time, open, high, low, close });
  }
  return ha;
}

export type HaColour = "bullish" | "bearish" | "neutral";

export const haColour = (b: HaBar): HaColour =>
  b.close > b.open ? "bullish" : b.close < b.open ? "bearish" : "neutral";

export const haBody = (b: HaBar): number => Math.abs(b.close - b.open);
export const haUpperWick = (b: HaBar): number => b.high - Math.max(b.open, b.close);
export const haLowerWick = (b: HaBar): number => Math.min(b.open, b.close) - b.low;

/** The wick on the side that OPPOSES the bar's own direction. Null for a zero body. */
export function haOppositeWick(b: HaBar): number | null {
  const c = haColour(b);
  if (c === "neutral") return null;
  return c === "bullish" ? haLowerWick(b) : haUpperWick(b);
}

/* ------------------------------------------------------------ admissibility */

export type HaAnchorRejection =
  | "evaluation_anchor_not_finite"
  | "evaluation_anchor_not_bar_close_aligned"
  | "instrument_out_of_scope"
  | "timeframe_out_of_scope"
  | "source_bar_after_evaluation_anchor"
  | "newest_analytical_bar_not_at_anchor_minus_one_bar";

export class HaPatternContextAnchorError extends Error {
  override readonly name = "HaPatternContextAnchorError";
  constructor(readonly reason: HaAnchorRejection, readonly detail?: string) {
    super(`ha_pattern_context_v1_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------- inputs */

/** The already-accepted snapshot feature subset this module REUSES. Nothing is invented. */
export interface HaSnapshotFeatures {
  ema9?: number | null;
  ema21?: number | null;
  ema_stack?: string | null;
  ema21_slope?: number | null;
  adx14?: number | null;
  di_plus?: number | null;
  di_minus?: number | null;
  macd_state?: string | null;
  rsi14?: number | null;
  rsi14_slope3?: number | null;
  volatility_regime?: string | null;
  regime?: string | null;
}

export type HaLifecycle =
  | "forming" | "strengthening" | "confirmed" | "weakening" | "invalidated" | "unavailable";

export interface HaPatternContextInputV1 {
  instrument: string;
  timeframe: string;
  /** COMPLETED bar CLOSE, epoch ms, grid aligned. Analytical bar opens anchor - 15m. */
  evaluation_anchor: number;
  /** Ascending COMPLETED raw bars keyed by bar OPEN. Bars after the analytical bar are rejected. */
  bars: HaSourceBar[];
  /** Accepted snapshot features AT the analytical bar. Optional; absence degrades to unavailable. */
  features?: HaSnapshotFeatures | null;
  /** Accepted snapshot features at the PRIOR completed bar. Enables cross-forming/convergence. */
  prior_features?: HaSnapshotFeatures | null;
  /** OPTIONAL sealed Session Structure V3 envelope at the SAME evaluation anchor. */
  session_evidence?: unknown;
  /** The lifecycle state observed at the PREVIOUS anchor, if any. Enables invalidation. */
  prior_lifecycle?: HaLifecycle | null;
  trace_id: string;
  run_id: string;
}

/* ------------------------------------------------------------------ output */

export type TrendSequenceState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.trend_sequence[number];
export type BodyDynamicsState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.body_dynamics[number];
export type WickCharacterState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.wick_character[number];
export type OpposingWickEmergenceState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.opposing_wick_emergence[number];
export type ColourTransitionState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.colour_transition[number];
export type CompressionExpansionState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.compression_expansion[number];
export type EmaRelationshipState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.ema_relationship[number];
export type MomentumConfirmationState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.momentum_confirmation[number];
export type StructureRelevanceState =
  typeof HA_PATTERN_CONTEXT_SPEC_V1.evidence_families.structure_relevance[number];

export interface HaPatternContextStatesV1 {
  trend_sequence: TrendSequenceState;
  run_length: number;
  body_dynamics: BodyDynamicsState;
  wick_character: WickCharacterState;
  opposing_wick_emergence: OpposingWickEmergenceState;
  colour_transition: ColourTransitionState;
  compression_expansion: CompressionExpansionState;
  ema_relationship: EmaRelationshipState;
  momentum_confirmation: MomentumConfirmationState;
  structure_relevance: StructureRelevanceState;
  lifecycle: HaLifecycle;
}

/**
 * Pure typed intermediate. A LATER slice may wrap this in an Evidence V1 envelope;
 * this module intentionally neither seals nor persists anything.
 */
export interface HaPatternContextResultV1 {
  spec_id: string;
  spec_version: number;
  spec_hash: string;
  instrument: string;
  timeframe: string;
  trace_id: string;
  run_id: string;
  /** Equal to the evaluation anchor by contract. */
  as_of: string;
  evaluation_anchor: string;
  analytical_bar_open: string;
  ha_bars_considered: number;
  states: HaPatternContextStatesV1;
  /** Transparent, ordered rule provenance for every categorical decision. */
  reason_tokens: string[];
  observations: Observation[];
  limitations: string[];
  structure_context: { available: boolean; rejection_reason: string | null };
  execution_allowed: false;
  execution_path: "signal_only";
  numeric_probability: null;
}

/* ---------------------------------------------------------------- producer */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function strictlyAlternating(colours: HaColour[]): boolean {
  if (colours.length < 4) return false;
  const last4 = colours.slice(-4);
  if (last4.some((c) => c === "neutral")) return false;
  for (let i = 1; i < last4.length; i++) if (last4[i] === last4[i - 1]) return false;
  return true;
}

export async function buildHaPatternContextV1(
  input: HaPatternContextInputV1,
): Promise<HaPatternContextResultV1> {
  const anchor = input.evaluation_anchor;
  if (!isNum(anchor)) throw new HaPatternContextAnchorError("evaluation_anchor_not_finite");
  if (anchor % BAR_MS !== 0) {
    throw new HaPatternContextAnchorError("evaluation_anchor_not_bar_close_aligned", iso(anchor));
  }
  if (!(HA_PATTERN_CONTEXT_SPEC_V1.instrument_scope as readonly string[])
    .includes(input.instrument)) {
    throw new HaPatternContextAnchorError("instrument_out_of_scope", input.instrument);
  }
  if (!(HA_PATTERN_CONTEXT_SPEC_V1.timeframe_scope as readonly string[])
    .includes(input.timeframe)) {
    throw new HaPatternContextAnchorError("timeframe_out_of_scope", input.timeframe);
  }

  const barOpen = anchor - BAR_MS;
  const at = iso(barOpen);

  const sorted = [...input.bars].sort((a, b) => a.time - b.time);
  for (const b of sorted) {
    // A bar OPENING after the analytical bar would close after the anchor: lookahead.
    if (b.time > barOpen) {
      throw new HaPatternContextAnchorError("source_bar_after_evaluation_anchor", iso(b.time));
    }
  }
  if (sorted.length === 0 || sorted[sorted.length - 1].time !== barOpen) {
    throw new HaPatternContextAnchorError(
      "newest_analytical_bar_not_at_anchor_minus_one_bar",
      sorted.length ? iso(sorted[sorted.length - 1].time) : "no_bars",
    );
  }

  const ha = canonicalHeikinAshi(sorted);
  const n = ha.length;
  const colours = ha.map(haColour);
  const reason: string[] = [];
  const limitations: string[] = [
    "Heikin Ashi context is DESCRIPTIVE geometry plus reuse of already-accepted " +
    "categorical features; it is not a probability, confidence, score, forecast, edge, " +
    "recommendation or causal claim",
    "the evaluation anchor is a COMPLETED bar close; the authoritative analytical bar " +
    "opens exactly one bar earlier and no forming bar is ever consumed",
    "no numeric threshold constant is introduced by this specialist; unsupported states " +
    "are reported conservatively as insufficient/unavailable",
  ];

  /* ---- 1. trend_sequence + run length --------------------------------- */
  const last = n ? ha[n - 1] : null;
  const lastColour: HaColour = last ? haColour(last) : "neutral";
  let runLength = 0;
  if (last && lastColour !== "neutral") {
    for (let i = n - 1; i >= 0 && colours[i] === lastColour; i--) runLength++;
  }
  let trend_sequence: TrendSequenceState;
  if (n < 2) { trend_sequence = "insufficient"; reason.push("trend_sequence:R1_insufficient_bars"); }
  else if (lastColour === "neutral") {
    trend_sequence = "neutral"; reason.push("trend_sequence:R2_zero_body");
  } else if (runLength >= 2) {
    trend_sequence = lastColour; reason.push(`trend_sequence:R3_run_${lastColour}_${runLength}`);
  } else if (strictlyAlternating(colours)) {
    trend_sequence = "alternating"; reason.push("trend_sequence:R4_strict_alternation");
  } else { trend_sequence = "neutral"; reason.push("trend_sequence:R5_default_neutral"); }

  const direction: "bullish" | "bearish" | null =
    trend_sequence === "bullish" || trend_sequence === "bearish" ? trend_sequence : null;

  /* ---- 2. body_dynamics ------------------------------------------------ */
  let body_dynamics: BodyDynamicsState;
  if (n < 3) { body_dynamics = "insufficient"; reason.push("body_dynamics:R1_insufficient_bars"); }
  else {
    const b0 = haBody(ha[n - 1]), b1 = haBody(ha[n - 2]), b2 = haBody(ha[n - 3]);
    if (b0 > b1 && b1 > b2) { body_dynamics = "expanding"; reason.push("body_dynamics:R2_expanding"); }
    else if (b0 < b1 && b1 < b2) { body_dynamics = "contracting"; reason.push("body_dynamics:R3_contracting"); }
    else { body_dynamics = "stable"; reason.push("body_dynamics:R4_stable"); }
  }

  /* ---- 3. wick_character ---------------------------------------------- */
  let wick_character: WickCharacterState;
  const oppositeWick = last ? haOppositeWick(last) : null;
  if (!last || oppositeWick == null) {
    wick_character = "insufficient"; reason.push("wick_character:R1_insufficient");
  } else if (oppositeWick === 0) {
    wick_character = "no_opposite_wick"; reason.push("wick_character:R2_no_opposite_wick");
  } else if (haUpperWick(last) > 0 && haLowerWick(last) > 0) {
    wick_character = "both_sides"; reason.push("wick_character:R3_both_sides");
  } else {
    wick_character = "opposing_wick_present"; reason.push("wick_character:R4_opposing_wick_present");
  }

  /* ---- 4. opposing_wick_emergence ------------------------------------- */
  let opposing_wick_emergence: OpposingWickEmergenceState;
  const prevBar = n >= 2 ? ha[n - 2] : null;
  const prevOpposite = prevBar ? haOppositeWick(prevBar) : null;
  if (!last || !prevBar || oppositeWick == null || prevOpposite == null
    || haColour(last) !== haColour(prevBar)) {
    opposing_wick_emergence = "insufficient";
    reason.push("opposing_wick_emergence:R1_insufficient");
  } else if (oppositeWick === 0) {
    opposing_wick_emergence = "none"; reason.push("opposing_wick_emergence:R2_none");
  } else if (prevOpposite === 0) {
    opposing_wick_emergence = "emerging"; reason.push("opposing_wick_emergence:R3_emerging");
  } else {
    opposing_wick_emergence = "persisting"; reason.push("opposing_wick_emergence:R4_persisting");
  }

  /* ---- 5. colour_transition ------------------------------------------- */
  let colour_transition: ColourTransitionState;
  if (n < 2 || lastColour === "neutral" || haColour(ha[n - 2]) === "neutral") {
    colour_transition = "insufficient"; reason.push("colour_transition:R1_insufficient");
  } else if (strictlyAlternating(colours)) {
    colour_transition = "alternating"; reason.push("colour_transition:R2_alternating");
  } else {
    const prevColour = haColour(ha[n - 2]);
    if (prevColour === "bearish" && lastColour === "bullish") {
      colour_transition = "bearish_to_bullish"; reason.push("colour_transition:R3_bearish_to_bullish");
    } else if (prevColour === "bullish" && lastColour === "bearish") {
      colour_transition = "bullish_to_bearish"; reason.push("colour_transition:R4_bullish_to_bearish");
    } else { colour_transition = "none"; reason.push("colour_transition:R5_none"); }
  }

  /* ---- 6. compression_expansion (REUSED volatility_regime) ------------- */
  const f = input.features ?? null;
  const volRegime = typeof f?.volatility_regime === "string" ? f.volatility_regime : null;
  let compression_expansion: CompressionExpansionState;
  if (volRegime === "low") { compression_expansion = "compressed"; reason.push("compression_expansion:reuse_volatility_regime_low"); }
  else if (volRegime === "high") { compression_expansion = "expanding"; reason.push("compression_expansion:reuse_volatility_regime_high"); }
  else if (volRegime === "normal") { compression_expansion = "normal"; reason.push("compression_expansion:reuse_volatility_regime_normal"); }
  else { compression_expansion = "unavailable"; reason.push("compression_expansion:unavailable_no_accepted_regime"); }

  /* ---- 7. ema_relationship (REUSED ema9/ema21/ema_stack) --------------- */
  const e9 = isNum(f?.ema9) ? f!.ema9 as number : null;
  const e21 = isNum(f?.ema21) ? f!.ema21 as number : null;
  const pf = input.prior_features ?? null;
  const pe9 = isNum(pf?.ema9) ? pf!.ema9 as number : null;
  const pe21 = isNum(pf?.ema21) ? pf!.ema21 as number : null;
  const priorEmaAvailable = pe9 != null && pe21 != null;
  const stack = typeof f?.ema_stack === "string" ? f.ema_stack : null;
  let ema_relationship: EmaRelationshipState;
  if (e9 == null || e21 == null) {
    ema_relationship = "unavailable"; reason.push("ema_relationship:R1_unavailable");
  } else {
    const gap = e9 - e21;
    const priorGap = priorEmaAvailable ? (pe9 as number) - (pe21 as number) : null;
    if (priorGap != null && priorGap <= 0 && gap > 0) {
      ema_relationship = "bullish_cross_forming"; reason.push("ema_relationship:R2_bullish_cross_forming");
    } else if (priorGap != null && priorGap >= 0 && gap < 0) {
      ema_relationship = "bearish_cross_forming"; reason.push("ema_relationship:R3_bearish_cross_forming");
    } else if (gap > 0 && stack === "up") {
      ema_relationship = "bullish_alignment"; reason.push("ema_relationship:R4_bullish_alignment");
    } else if (gap < 0 && stack === "down") {
      ema_relationship = "bearish_alignment"; reason.push("ema_relationship:R5_bearish_alignment");
    } else if (priorGap != null && Math.abs(gap) < Math.abs(priorGap)) {
      ema_relationship = "convergence"; reason.push("ema_relationship:R6_convergence");
    } else { ema_relationship = "mixed"; reason.push("ema_relationship:R7_mixed"); }
  }

  /* ---- 8. momentum_confirmation (REUSED DI / MACD / RSI slope) --------- */
  const diP = isNum(f?.di_plus) ? f!.di_plus as number : null;
  const diM = isNum(f?.di_minus) ? f!.di_minus as number : null;
  const macdState = typeof f?.macd_state === "string" ? f.macd_state : null;
  const rsiSlope = isNum(f?.rsi14_slope3) ? f!.rsi14_slope3 as number : null;
  let momentum_confirmation: MomentumConfirmationState;
  if (direction == null || diP == null || diM == null || macdState == null || rsiSlope == null) {
    momentum_confirmation = "unavailable"; reason.push("momentum_confirmation:R1_unavailable");
  } else {
    const diVote = diP > diM ? "bullish" : diM > diP ? "bearish" : "none";
    const macdVote = macdState.startsWith("bullish") ? "bullish"
      : macdState.startsWith("bearish") ? "bearish" : "none";
    const rsiVote = rsiSlope > 0 ? "bullish" : rsiSlope < 0 ? "bearish" : "none";
    const allAgree = diVote === direction && macdVote === direction && rsiVote === direction;
    if (allAgree && macdState.endsWith("_expanding")) {
      momentum_confirmation = "agreement"; reason.push("momentum_confirmation:R3_agreement");
    } else if (allAgree && macdState.endsWith("_fading")) {
      momentum_confirmation = "weakening"; reason.push("momentum_confirmation:R4_weakening");
    } else {
      momentum_confirmation = "mixed";
      reason.push(`momentum_confirmation:R5_mixed_di_${diVote}_macd_${macdVote}_rsi_${rsiVote}`);
    }
  }

  /* ---- 9. structure_relevance (CONSUMED sealed Session V3) ------------- */
  const ctx: SessionContextResultV3 = await acceptSessionStructureContextV3(
    input.session_evidence ?? null,
    {
      trace_id: input.trace_id, instrument: input.instrument,
      timeframe: input.timeframe, evaluation_anchor: anchor,
    },
  );
  const ctxRejection: string | null = ctx.ok === true ? null : ctx.reason;
  let structure_relevance: StructureRelevanceState;
  if (!ctx.ok || direction == null) {
    structure_relevance = "unavailable";
    reason.push(`structure_relevance:R1_unavailable_${ctxRejection ?? "no_ha_direction"}`);
    if (!ctx.ok) {
      limitations.push(
        `no admissible sealed Session Structure V3 context (${ctxRejection}); structural ` +
        "relevance is reported unavailable and is never inferred",
      );
    }
  } else if (ctx.structure_event !== "none") {
    structure_relevance = "at_relevant_level";
    reason.push(`structure_relevance:R2_at_relevant_level_${ctx.structure_event}`);
  } else if ((ctx.structure_state === "up_structure" && direction === "bullish")
    || (ctx.structure_state === "down_structure" && direction === "bearish")) {
    structure_relevance = "with_structure"; reason.push("structure_relevance:R3_with_structure");
  } else if ((ctx.structure_state === "up_structure" && direction === "bearish")
    || (ctx.structure_state === "down_structure" && direction === "bullish")) {
    structure_relevance = "against_structure"; reason.push("structure_relevance:R4_against_structure");
  } else {
    structure_relevance = "neutral"; reason.push("structure_relevance:R5_neutral");
  }

  /* ---- 10. lifecycle --------------------------------------------------- */
  const matchingAlignment = direction === "bullish"
    ? "bullish_alignment" : direction === "bearish" ? "bearish_alignment" : null;
  const directionalFlip = colour_transition === "bearish_to_bullish"
    || colour_transition === "bullish_to_bearish";
  const priorLifecycle = input.prior_lifecycle ?? null;

  let lifecycle: HaLifecycle;
  if (trend_sequence === "insufficient") {
    lifecycle = "unavailable"; reason.push("lifecycle:R1_unavailable");
  } else if (directionalFlip
    && (priorLifecycle === "strengthening" || priorLifecycle === "confirmed")) {
    lifecycle = "invalidated"; reason.push(`lifecycle:R2_invalidated_from_${priorLifecycle}`);
  } else if (direction != null && body_dynamics === "expanding"
    && wick_character === "no_opposite_wick" && momentum_confirmation === "agreement"
    && ema_relationship === matchingAlignment
    && structure_relevance !== "against_structure") {
    lifecycle = "confirmed"; reason.push("lifecycle:R3_confirmed_multi_family_alignment");
  } else if (body_dynamics === "contracting"
    || opposing_wick_emergence === "emerging" || opposing_wick_emergence === "persisting"
    || momentum_confirmation === "weakening") {
    lifecycle = "weakening"; reason.push("lifecycle:R4_weakening");
  } else if (direction != null && runLength >= 2 && body_dynamics === "expanding"
    // R4 already excluded every deteriorating opposite-wick state.
    && (momentum_confirmation === "agreement" || ema_relationship === matchingAlignment)) {
    lifecycle = "strengthening"; reason.push("lifecycle:R5_strengthening");
  } else {
    lifecycle = "forming"; reason.push("lifecycle:R6_forming_conservative_default");
  }

  const states: HaPatternContextStatesV1 = {
    trend_sequence, run_length: runLength, body_dynamics, wick_character,
    opposing_wick_emergence, colour_transition, compression_expansion,
    ema_relationship, momentum_confirmation, structure_relevance, lifecycle,
  };

  const st = (key: string, value: string): Observation =>
    ({ key, kind: "state", value_text: value, at });
  const observations: Observation[] = [
    st("ha_evaluation_anchor_convention", "completed_bar_close"),
    st("ha_analytical_bar_open_instant", at),
    st("ha_forming_bar_consumed", "false"),
    st("ha_trend_sequence", trend_sequence),
    { key: "ha_run_length", kind: "measurement", value_num: runLength, unit: "bars", at },
    st("ha_body_dynamics", body_dynamics),
    st("ha_wick_character", wick_character),
    st("ha_opposing_wick_emergence", opposing_wick_emergence),
    st("ha_colour_transition", colour_transition),
    st("ha_compression_expansion", compression_expansion),
    st("ha_ema_relationship", ema_relationship),
    st("ha_momentum_confirmation", momentum_confirmation),
    st("ha_structure_relevance", structure_relevance),
    st("ha_lifecycle", lifecycle),
    { key: "ha_bars_considered", kind: "measurement", value_num: n, unit: "bars", at },
  ];
  if (last) {
    observations.push(
      { key: "ha_open", kind: "measurement", value_num: last.open, at },
      { key: "ha_high", kind: "measurement", value_num: last.high, at },
      { key: "ha_low", kind: "measurement", value_num: last.low, at },
      { key: "ha_close", kind: "measurement", value_num: last.close, at },
    );
  }
  for (const token of reason) {
    observations.push(st("ha_reason_token", token));
  }

  return {
    spec_id: HA_PATTERN_CONTEXT_SPEC_V1.spec_id,
    spec_version: HA_PATTERN_CONTEXT_SPEC_V1.spec_version,
    spec_hash: await haPatternContextSpecHashV1(),
    instrument: input.instrument,
    timeframe: input.timeframe,
    trace_id: input.trace_id,
    run_id: input.run_id,
    as_of: iso(anchor),
    evaluation_anchor: iso(anchor),
    analytical_bar_open: at,
    ha_bars_considered: n,
    states,
    reason_tokens: reason,
    observations,
    limitations,
    structure_context: {
      available: ctx.ok,
      rejection_reason: ctxRejection,
    },
    execution_allowed: false,
    execution_path: "signal_only",
    numeric_probability: null,
  };
}
