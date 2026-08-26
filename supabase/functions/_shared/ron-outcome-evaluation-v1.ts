/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — OUTCOME EVALUATION V1 (pure).
 *
 * Describes, after the fact, WHAT ACTUALLY HAPPENED to price following a material RON
 * event. Strict separation of knowledge:
 *
 *   A. what RON knew at the live anchor T  -> the immutable event / context record
 *   B. what happened after T               -> THIS module, appended, never overwriting A
 *   C. later interpretation                -> the lessons ledger, carrying `reviewed_at`
 *
 * Truthfulness rules encoded here:
 *   • DESCRIPTIVE ONLY. Vocabulary is follow-through/excursion. Never "profit", "win",
 *     "loss", "R", "target hit" — no order, entry, stop or size is ever assumed.
 *   • CLOSED BARS ONLY. A horizon is evaluated only when every bar it needs is complete
 *     and present; a partial horizon stays pending rather than being reported short.
 *   • EXPLICIT CUTOFF. Every result carries the exact future-data cutoff it used, so a
 *     later re-read can prove no data past that instant influenced it.
 *   • NO CAUSALITY. A follow-through classification is an observation about price, never
 *     a claim that the event caused it.
 */
export const RON_OUTCOME_EVALUATION_VERSION = 1;

export const OUTCOME_HORIZONS_BARS: readonly number[] = [1, 2, 4, 8, 16];

export const FOLLOW_THROUGH_STATES = [
  "aligned_follow_through",
  "mixed_two_sided",
  "adverse_follow_through",
  "flat_no_material_movement",
  "direction_context_not_directional",
] as const;
export type FollowThroughState = typeof FOLLOW_THROUGH_STATES[number];

export interface OutcomeBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OutcomeInput {
  instrument: string;
  timeframe: string;
  /** Live anchor T. Bars used are strictly those that OPEN at or after T. */
  evaluation_anchor: string;
  direction_context: string;
  horizon_bars: number;
  bar_ms: number;
  /** Reference price = close of the analytical bar that ended at T. */
  reference_price: number;
  /** Candles at or after T, any order. Only fully completed bars may be supplied. */
  bars: readonly OutcomeBar[];
}

export type OutcomeRejection =
  | "invalid_horizon"
  | "invalid_reference_price"
  | "insufficient_completed_bars"
  | "non_contiguous_bars";

export class OutcomeEvaluationError extends Error {
  override readonly name = "OutcomeEvaluationError";
  constructor(readonly reason: OutcomeRejection, readonly detail?: string) {
    super(`ron_outcome_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export interface OutcomeResult {
  outcome_version: number;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  horizon_bars: number;
  bars_observed: number;
  reference_price: number;
  last_price: number;
  price_change: number;
  price_change_pct: number;
  /** Maximum FAVOURABLE excursion relative to the stated direction context. */
  mfe: number;
  /** Maximum ADVERSE excursion relative to the stated direction context. */
  mae: number;
  mfe_pct: number;
  mae_pct: number;
  direction_context: string;
  follow_through: FollowThroughState;
  tags: string[];
  /** Exact instant beyond which NO data was consulted. */
  future_data_cutoff: string;
}

const round = (n: number, dp = 8) => Number(n.toFixed(dp));

function directionOf(context: string): 1 | -1 | 0 {
  const c = String(context ?? "").toLowerCase();
  if (c.includes("bull") || c.includes("long") || c.includes("up")) return 1;
  if (c.includes("bear") || c.includes("short") || c.includes("down")) return -1;
  return 0;
}

/**
 * Returns the completed bars, in order, that belong to the horizon — or null when the
 * horizon is not yet fully observable. Never pads, never interpolates, never reuses a bar.
 */
export function horizonBars(
  bars: readonly OutcomeBar[], anchorMs: number, horizon: number, barMs: number,
): OutcomeBar[] | null {
  const wanted: OutcomeBar[] = [];
  const byTime = new Map<number, OutcomeBar>();
  for (const b of bars) {
    const t = Date.parse(b.timestamp);
    if (Number.isFinite(t)) byTime.set(t, b);
  }
  for (let i = 0; i < horizon; i++) {
    const bar = byTime.get(anchorMs + i * barMs);
    if (!bar) return null;
    wanted.push(bar);
  }
  return wanted;
}

export function evaluateOutcome(input: OutcomeInput): OutcomeResult {
  if (!Number.isInteger(input.horizon_bars) || input.horizon_bars <= 0) {
    throw new OutcomeEvaluationError("invalid_horizon", String(input.horizon_bars));
  }
  if (!Number.isFinite(input.reference_price) || input.reference_price <= 0) {
    throw new OutcomeEvaluationError("invalid_reference_price", String(input.reference_price));
  }
  const anchorMs = Date.parse(input.evaluation_anchor);
  const window = horizonBars(input.bars, anchorMs, input.horizon_bars, input.bar_ms);
  if (!window) {
    throw new OutcomeEvaluationError("insufficient_completed_bars", String(input.horizon_bars));
  }

  const ref = input.reference_price;
  const highest = Math.max(...window.map((b) => b.high));
  const lowest = Math.min(...window.map((b) => b.low));
  const last = window[window.length - 1].close;

  const dir = directionOf(input.direction_context);
  const upExcursion = Math.max(0, highest - ref);
  const downExcursion = Math.max(0, ref - lowest);
  const favourable = dir === 1 ? upExcursion : dir === -1 ? downExcursion : Math.max(upExcursion, downExcursion);
  const adverse = dir === 1 ? downExcursion : dir === -1 ? upExcursion : Math.min(upExcursion, downExcursion);
  const signedMove = dir === 0 ? 0 : (last - ref) * dir;

  let follow: FollowThroughState;
  const span = favourable + adverse;
  if (dir === 0) follow = "direction_context_not_directional";
  else if (span === 0) follow = "flat_no_material_movement";
  else {
    const share = favourable / span;
    if (share >= 0.75 && signedMove > 0) follow = "aligned_follow_through";
    else if (share <= 0.25 && signedMove < 0) follow = "adverse_follow_through";
    else follow = "mixed_two_sided";
  }

  const tags: string[] = [
    `horizon_${input.horizon_bars}_bars`,
    `bars_observed_${window.length}`,
    "closed_bars_only",
    "descriptive_price_observation_no_execution_assumed",
  ];
  if (dir === 0) tags.push("direction_context_not_directional");
  if (adverse > 0 && favourable === 0) tags.push("adverse_excursion_only");
  if (favourable > 0 && adverse === 0) tags.push("favourable_excursion_only");

  return {
    outcome_version: RON_OUTCOME_EVALUATION_VERSION,
    instrument: input.instrument,
    timeframe: input.timeframe,
    evaluation_anchor: new Date(anchorMs).toISOString(),
    horizon_bars: input.horizon_bars,
    bars_observed: window.length,
    reference_price: round(ref),
    last_price: round(last),
    price_change: round(last - ref),
    price_change_pct: round(((last - ref) / ref) * 100, 6),
    mfe: round(favourable),
    mae: round(adverse),
    mfe_pct: round((favourable / ref) * 100, 6),
    mae_pct: round((adverse / ref) * 100, 6),
    direction_context: input.direction_context,
    follow_through: follow,
    tags,
    future_data_cutoff: new Date(anchorMs + input.horizon_bars * input.bar_ms).toISOString(),
  };
}

/* ------------------------------------------------------------- lessons ledger */

export interface LessonInput {
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  reviewed_at: string;
  outcomes: readonly OutcomeResult[];
}

export interface LessonRecord {
  lesson_version: number;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  reviewed_at: string;
  future_data_cutoff: string;
  horizons_covered: number[];
  lifecycle_path: string[];
  reason_tags: string[];
  note: string;
}

/**
 * Post-event interpretation, written ONLY from already-appended outcome rows. It carries
 * the maximum cutoff of the outcomes it summarises, so hindsight is bounded and provable.
 */
export function buildLesson(input: LessonInput): LessonRecord | null {
  const outcomes = [...input.outcomes].sort((a, b) => a.horizon_bars - b.horizon_bars);
  if (outcomes.length === 0) return null;

  const path = outcomes.map((o) => `${o.horizon_bars}:${o.follow_through}`);
  const aligned = outcomes.filter((o) => o.follow_through === "aligned_follow_through").length;
  const adverse = outcomes.filter((o) => o.follow_through === "adverse_follow_through").length;

  const tags: string[] = [`aligned_horizons_${aligned}`, `adverse_horizons_${adverse}`];
  if (aligned === outcomes.length) tags.push("aligned_at_every_observed_horizon");
  if (adverse === outcomes.length) tags.push("adverse_at_every_observed_horizon");
  if (aligned > 0 && adverse > 0) tags.push("outcome_changed_sign_across_horizons");
  tags.push("post_event_review_no_causal_claim");

  const cutoff = outcomes
    .map((o) => o.future_data_cutoff)
    .sort()
    .slice(-1)[0];

  return {
    lesson_version: 1,
    instrument: input.instrument,
    timeframe: input.timeframe,
    evaluation_anchor: outcomes[0].evaluation_anchor,
    reviewed_at: input.reviewed_at,
    future_data_cutoff: cutoff,
    horizons_covered: outcomes.map((o) => o.horizon_bars),
    lifecycle_path: path,
    reason_tags: tags,
    note:
      `Observed price behaviour after the event at ${outcomes.length} completed horizon(s): `
      + `${path.join(", ")}. This records what price did after the anchor and asserts no `
      + `cause, no probability and no trade result.`,
  };
}
