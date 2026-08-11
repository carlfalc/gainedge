/**
 * RON Phase 2A.1 outcome labelling — label_version = 2.
 *
 * WHY A NEW VERSION
 * -----------------
 * label_version=1 rows are PRESERVED untouched for audit. v1 stored `mfe_price = highest
 * traded price` and `mae_price = lowest traded price` — absolute extrema whose names read
 * like excursion distances. v2 makes every field unambiguous and adds a deterministic,
 * strategy-agnostic symmetric ATR barrier event. All future calibration MUST target v2.
 *
 * HARD RULES (unchanged from v1 where they were already correct)
 *  - Genuine stored 1m candles only. Nothing is interpolated, bridged or resampled.
 *  - Pure function: same forward bars => byte-identical outputs.
 *  - No trading logic, no strategy, no order placement. The barrier event is a market-state
 *    observation, NOT a Falconer win probability and NOT a recommendation.
 *
 * FORWARD-BAR BOUNDARY SEMANTICS (proved against candle_history: `timestamp` = bar OPEN)
 *  - anchorClose = anchor bar OPEN + anchor timeframe length; it is the instant the
 *    completed 15m bar finishes and a decision could first be taken.
 *  - No included 1m bar OPENS BEFORE anchorClose.
 *  - The first eligible 1m bar MAY open EXACTLY AT anchorClose (that bar covers
 *    [anchorClose, anchorClose+60s) and does not overlap the completed 15m bar).
 *  - Every included 1m bar COMPLETES (open + 60s) at or before horizon end.
 *  This is "no bar opens before anchor close", NOT "strictly after anchor close".
 */

export interface FwdBarV2 { time: number; open: number; high: number; low: number; close: number; }

export type CoverageClass =
  | "complete"
  | "market_session_boundary"
  | "genuine_data_gap"
  | "horizon_not_elapsed"
  | "missing_atr"
  | "other_incomplete";

export type FirstHit = "target" | "adverse" | "neither" | "same_bar_ambiguous" | "missing_atr";

export interface BarrierResult {
  first_hit: FirstHit;
  /** true only when the target barrier was touched first; null when undeterminable. */
  success: boolean | null;
  event_eligible: boolean;
  first_hit_time: string | null;
}

export interface OutcomeLabelV2 {
  horizon_minutes: number;
  data_resolution: string;
  anchor_price: number;
  atr_at_anchor: number | null;

  forward_close: number | null;
  forward_return_pct: number | null;
  forward_return_atr: number | null;

  /** Absolute extrema actually traded in the forward window. */
  max_high_price: number | null;
  min_low_price: number | null;

  /** Signed-distance excursions (always >= 0), per direction. */
  long_mfe_price: number | null;
  long_mae_price: number | null;
  short_mfe_price: number | null;
  short_mae_price: number | null;
  long_mfe_atr: number | null;
  long_mae_atr: number | null;
  short_mfe_atr: number | null;
  short_mae_atr: number | null;

  barrier_atr_mult: number;
  barrier_version: number;
  long: BarrierResult;
  short: BarrierResult;

  bars_used: number;
  first_bar_time: string | null;
  last_bar_time: string | null;
  coverage_ok: boolean;
  coverage_class: CoverageClass;
  exclusion_reason: string | null;
}

export const BARRIER_ATR_MULT = 1.0;
export const BARRIER_VERSION = 1;

const r = (v: number | null, dp = 6): number | null =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));

const INELIGIBLE = (reason: FirstHit): BarrierResult =>
  ({ first_hit: reason, success: null, event_eligible: false, first_hit_time: null });

/**
 * Symmetric ATR barrier event for ONE direction.
 * If both barriers are touched inside the SAME 1m candle the intrabar order is unknowable
 * from OHLC — we mark `same_bar_ambiguous`, success=null, event_eligible=false. We never
 * guess from open/close ordering.
 */
function barrier(
  bars: FwdBarV2[], target: number, adverse: number, dir: "long" | "short",
): BarrierResult {
  for (const b of bars) {
    const hitT = dir === "long" ? b.high >= target : b.low <= target;
    const hitA = dir === "long" ? b.low <= adverse : b.high >= adverse;
    if (hitT && hitA) {
      return { first_hit: "same_bar_ambiguous", success: null, event_eligible: false, first_hit_time: new Date(b.time).toISOString() };
    }
    if (hitT) return { first_hit: "target", success: true, event_eligible: true, first_hit_time: new Date(b.time).toISOString() };
    if (hitA) return { first_hit: "adverse", success: false, event_eligible: true, first_hit_time: new Date(b.time).toISOString() };
  }
  // Neither barrier touched inside the horizon: a real, observed non-event.
  return { first_hit: "neither", success: false, event_eligible: true, first_hit_time: null };
}

/**
 * @param venueOpen  pure predicate: was the venue open at this instant? Used ONLY to
 *                   classify WHY a label is ineligible. It never bridges or compresses
 *                   time: clock-time horizon semantics are unchanged from v1.
 */
export function labelOutcomeV2(
  anchorBarTime: number,
  anchorBarMs: number,
  anchorPrice: number,
  atr: number | null,
  forward: FwdBarV2[],
  horizonMinutes: number,
  resolutionMs: number,
  resolutionLabel: string,
  nowMs: number,
  venueOpen: (d: Date) => boolean,
): OutcomeLabelV2 {
  const anchorClose = anchorBarTime + anchorBarMs;
  const horizonEnd = anchorClose + horizonMinutes * 60_000;

  const win = forward
    .filter((b) => b.time >= anchorClose && b.time + resolutionMs <= horizonEnd)
    .sort((a, b) => a.time - b.time);

  const expected = Math.floor((horizonMinutes * 60_000) / resolutionMs);

  const base: OutcomeLabelV2 = {
    horizon_minutes: horizonMinutes,
    data_resolution: resolutionLabel,
    anchor_price: anchorPrice,
    atr_at_anchor: atr,
    forward_close: null, forward_return_pct: null, forward_return_atr: null,
    max_high_price: null, min_low_price: null,
    long_mfe_price: null, long_mae_price: null, short_mfe_price: null, short_mae_price: null,
    long_mfe_atr: null, long_mae_atr: null, short_mfe_atr: null, short_mae_atr: null,
    barrier_atr_mult: BARRIER_ATR_MULT,
    barrier_version: BARRIER_VERSION,
    long: INELIGIBLE("neither"),
    short: INELIGIBLE("neither"),
    bars_used: win.length,
    first_bar_time: win.length ? new Date(win[0].time).toISOString() : null,
    last_bar_time: win.length ? new Date(win[win.length - 1].time).toISOString() : null,
    coverage_ok: false,
    coverage_class: "other_incomplete",
    exclusion_reason: null,
  };

  /** Classify WHY the window is short. Never a guess: falls back to other_incomplete. */
  const classifyShortfall = (): CoverageClass => {
    if (horizonEnd > nowMs) return "horizon_not_elapsed";
    // Count clock minutes inside the window during which the venue was closed.
    let closedMinutes = 0;
    for (let t = anchorClose; t + resolutionMs <= horizonEnd; t += resolutionMs) {
      if (!venueOpen(new Date(t))) closedMinutes++;
    }
    const missing = expected - win.length;
    if (closedMinutes === 0) return "genuine_data_gap";
    if (missing <= closedMinutes) return "market_session_boundary";
    return "other_incomplete";
  };

  if (!win.length) {
    const cls = classifyShortfall();
    return { ...base, coverage_class: cls, exclusion_reason: cls === "horizon_not_elapsed" ? "horizon_not_elapsed" : "no_forward_data" };
  }
  if (win.length < expected) {
    const cls = classifyShortfall();
    return { ...base, coverage_class: cls, exclusion_reason: cls === "horizon_not_elapsed" ? "horizon_not_elapsed" : "incomplete_forward_coverage" };
  }
  for (let i = 1; i < win.length; i++) {
    if (win[i].time - win[i - 1].time !== resolutionMs) {
      return { ...base, coverage_class: "genuine_data_gap", exclusion_reason: "forward_gap" };
    }
  }

  let hi = -Infinity, lo = Infinity;
  for (const b of win) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const last = win[win.length - 1].close;
  const a = atr && atr > 0 ? atr : null;

  const upDist = Math.max(0, hi - anchorPrice);
  const downDist = Math.max(0, anchorPrice - lo);

  const longRes = a
    ? barrier(win, anchorPrice + BARRIER_ATR_MULT * a, anchorPrice - BARRIER_ATR_MULT * a, "long")
    : INELIGIBLE("missing_atr");
  const shortRes = a
    ? barrier(win, anchorPrice - BARRIER_ATR_MULT * a, anchorPrice + BARRIER_ATR_MULT * a, "short")
    : INELIGIBLE("missing_atr");

  return {
    ...base,
    forward_close: r(last, 5),
    forward_return_pct: r(((last - anchorPrice) / anchorPrice) * 100, 6),
    forward_return_atr: a ? r((last - anchorPrice) / a, 6) : null,
    max_high_price: r(hi, 5),
    min_low_price: r(lo, 5),
    long_mfe_price: r(upDist, 5),
    long_mae_price: r(downDist, 5),
    short_mfe_price: r(downDist, 5),
    short_mae_price: r(upDist, 5),
    long_mfe_atr: a ? r(upDist / a, 6) : null,
    long_mae_atr: a ? r(downDist / a, 6) : null,
    short_mfe_atr: a ? r(downDist / a, 6) : null,
    short_mae_atr: a ? r(upDist / a, 6) : null,
    long: longRes,
    short: shortRes,
    coverage_ok: true,
    coverage_class: a ? "complete" : "missing_atr",
    exclusion_reason: null,
  };
}

/** Stable hash over EVERY deterministic v2 output. Excludes labelled_at/created_at/updated_at. */
export async function metricHashV2(l: OutcomeLabelV2): Promise<string> {
  const payload = JSON.stringify([
    "v2", l.horizon_minutes, l.data_resolution, l.anchor_price, l.atr_at_anchor,
    l.forward_close, l.forward_return_pct, l.forward_return_atr,
    l.max_high_price, l.min_low_price,
    l.long_mfe_price, l.long_mae_price, l.short_mfe_price, l.short_mae_price,
    l.long_mfe_atr, l.long_mae_atr, l.short_mfe_atr, l.short_mae_atr,
    l.barrier_atr_mult, l.barrier_version,
    l.long.first_hit, l.long.success, l.long.event_eligible, l.long.first_hit_time,
    l.short.first_hit, l.short.success, l.short.event_eligible, l.short.first_hit_time,
    l.bars_used, l.first_bar_time, l.last_bar_time,
    l.coverage_ok, l.coverage_class, l.exclusion_reason,
  ]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}