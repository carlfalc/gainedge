/**
 * RON Phase 2A.2 outcome labelling — label_version = 3 (CANONICAL).
 *
 * WHY A NEW VERSION
 * -----------------
 * v1 and v2 rows are PRESERVED untouched for audit. v2's excursion + ±1 ATR barrier
 * arithmetic is structurally sound and is carried over unchanged. The single defect
 * corrected here is the coverage-CAUSE classifier: v2 compared only totals
 * (`missing <= closedMinutes`), so a genuine open-market data hole could be reported as
 * `market_session_boundary` whenever the same horizon also contained enough legitimate
 * venue-closed minutes. Because `coverage_class` participates in the metric hash and in
 * later selection-bias analysis, the fix ships as v3 rather than a rewrite of v2.
 *
 * v3 classifies the ACTUAL MISSING TIMESTAMPS:
 *   - build the exact expected 1m open grid: anchorClose .. horizonEnd - resolution
 *   - compare against the UNIQUE, EXACT-GRID observed timestamps
 *   - classify each missing timestamp by venue state, never by aggregate counts
 * Duplicate and off-grid bars are detected explicitly and can never make an incomplete
 * window look complete.
 *
 * HARD RULES (unchanged)
 *  - Genuine stored 1m candles only; nothing interpolated, bridged or resampled.
 *  - Strict CLOCK-TIME horizons: daily breaks, weekends and the known May→Jul 1m outage
 *    are never compressed away.
 *  - Pure function: same inputs => byte-identical outputs.
 *  - No trading logic. The barrier event is a market-state observation, NOT a Falconer
 *    win probability and NOT a recommendation.
 *
 * FORWARD-BAR BOUNDARY SEMANTICS (candle_history `timestamp` = bar OPEN)
 *  - anchorClose = anchor bar OPEN + anchor timeframe length.
 *  - No included 1m bar OPENS BEFORE anchorClose; the first eligible bar MAY open
 *    EXACTLY AT anchorClose; every included bar COMPLETES at or before horizon end.
 */

export interface FwdBarV3 { time: number; open: number; high: number; low: number; close: number; }

export type CoverageClassV3 =
  | "complete"
  | "market_session_boundary"
  | "genuine_data_gap"
  | "mixed_boundary_and_data_gap"
  | "horizon_not_elapsed"
  | "missing_atr"
  | "other_incomplete";

export type FirstHitV3 = "target" | "adverse" | "neither" | "same_bar_ambiguous" | "missing_atr";

export interface BarrierResultV3 {
  first_hit: FirstHitV3;
  success: boolean | null;
  event_eligible: boolean;
  first_hit_time: string | null;
}

export interface OutcomeLabelV3 {
  horizon_minutes: number;
  data_resolution: string;
  anchor_price: number;
  atr_at_anchor: number | null;

  forward_close: number | null;
  forward_return_pct: number | null;
  forward_return_atr: number | null;

  max_high_price: number | null;
  min_low_price: number | null;

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
  long: BarrierResultV3;
  short: BarrierResultV3;

  bars_used: number;
  first_bar_time: string | null;
  last_bar_time: string | null;

  /** Exact-grid coverage accounting — all deterministic, all hashed. */
  expected_bars: number;
  missing_bars: number;
  missing_venue_open: number;
  missing_venue_closed: number;
  duplicate_timestamps: number;
  off_grid_bars: number;

  coverage_ok: boolean;
  coverage_class: CoverageClassV3;
  exclusion_reason: string | null;
}

export const BARRIER_ATR_MULT_V3 = 1.0;
export const BARRIER_VERSION_V3 = 1;

const r = (v: number | null, dp = 6): number | null =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));

const INELIGIBLE = (reason: FirstHitV3): BarrierResultV3 =>
  ({ first_hit: reason, success: null, event_eligible: false, first_hit_time: null });

/**
 * Symmetric ATR barrier event for ONE direction. If both barriers are touched inside the
 * SAME 1m candle the intrabar order is unknowable from OHLC — `same_bar_ambiguous`,
 * success=null, event_eligible=false. We never guess from open/close ordering.
 */
function barrier(
  bars: FwdBarV3[], target: number, adverse: number, dir: "long" | "short",
): BarrierResultV3 {
  for (const b of bars) {
    const hitT = dir === "long" ? b.high >= target : b.low <= target;
    const hitA = dir === "long" ? b.low <= adverse : b.high >= adverse;
    if (hitT && hitA) {
      return { first_hit: "same_bar_ambiguous", success: null, event_eligible: false, first_hit_time: new Date(b.time).toISOString() };
    }
    if (hitT) return { first_hit: "target", success: true, event_eligible: true, first_hit_time: new Date(b.time).toISOString() };
    if (hitA) return { first_hit: "adverse", success: false, event_eligible: true, first_hit_time: new Date(b.time).toISOString() };
  }
  return { first_hit: "neither", success: false, event_eligible: true, first_hit_time: null };
}

/**
 * @param venueOpen pure predicate: was the venue open at this instant? Used ONLY to
 *                  classify WHY specific expected timestamps are absent. It never bridges
 *                  or compresses time.
 */
export function labelOutcomeV3(
  anchorBarTime: number,
  anchorBarMs: number,
  anchorPrice: number,
  atr: number | null,
  forward: FwdBarV3[],
  horizonMinutes: number,
  resolutionMs: number,
  resolutionLabel: string,
  nowMs: number,
  venueOpen: (d: Date) => boolean,
): OutcomeLabelV3 {
  const anchorClose = anchorBarTime + anchorBarMs;
  const horizonEnd = anchorClose + horizonMinutes * 60_000;

  // Exact expected open-time grid.
  const grid: number[] = [];
  for (let t = anchorClose; t + resolutionMs <= horizonEnd; t += resolutionMs) grid.push(t);
  const gridSet = new Set(grid);

  // Observed bars inside the window; dedupe on exact timestamp, count anomalies.
  const inWindow = forward.filter((b) => b.time >= anchorClose && b.time + resolutionMs <= horizonEnd);
  const seen = new Map<number, FwdBarV3>();
  let duplicates = 0;
  let offGrid = 0;
  for (const b of inWindow) {
    if (!gridSet.has(b.time)) { offGrid++; continue; }
    if (seen.has(b.time)) { duplicates++; continue; }
    seen.set(b.time, b);
  }
  const win = [...seen.values()].sort((a, b) => a.time - b.time);

  const missing = grid.filter((t) => !seen.has(t));
  let missingOpen = 0;
  let missingClosed = 0;
  for (const t of missing) (venueOpen(new Date(t)) ? missingOpen++ : missingClosed++);

  const base: OutcomeLabelV3 = {
    horizon_minutes: horizonMinutes,
    data_resolution: resolutionLabel,
    anchor_price: anchorPrice,
    atr_at_anchor: atr,
    forward_close: null, forward_return_pct: null, forward_return_atr: null,
    max_high_price: null, min_low_price: null,
    long_mfe_price: null, long_mae_price: null, short_mfe_price: null, short_mae_price: null,
    long_mfe_atr: null, long_mae_atr: null, short_mfe_atr: null, short_mae_atr: null,
    barrier_atr_mult: BARRIER_ATR_MULT_V3,
    barrier_version: BARRIER_VERSION_V3,
    long: INELIGIBLE("neither"),
    short: INELIGIBLE("neither"),
    bars_used: win.length,
    first_bar_time: win.length ? new Date(win[0].time).toISOString() : null,
    last_bar_time: win.length ? new Date(win[win.length - 1].time).toISOString() : null,
    expected_bars: grid.length,
    missing_bars: missing.length,
    missing_venue_open: missingOpen,
    missing_venue_closed: missingClosed,
    duplicate_timestamps: duplicates,
    off_grid_bars: offGrid,
    coverage_ok: false,
    coverage_class: "other_incomplete",
    exclusion_reason: null,
  };

  if (missing.length > 0) {
    if (horizonEnd > nowMs) {
      return { ...base, coverage_class: "horizon_not_elapsed", exclusion_reason: "horizon_not_elapsed" };
    }
    // Classify the MISSING TIMESTAMPS THEMSELVES — never aggregate counts.
    const cls: CoverageClassV3 =
      missingOpen === 0 ? "market_session_boundary"
        : missingClosed === 0 ? "genuine_data_gap"
          : "mixed_boundary_and_data_gap";
    return {
      ...base,
      coverage_class: cls,
      exclusion_reason: win.length === 0 ? "no_forward_data" : "incomplete_forward_coverage",
    };
  }

  // Grid is complete. Off-grid bars are still an explicit anomaly, never silently ignored.
  if (offGrid > 0) {
    return { ...base, coverage_class: "other_incomplete", exclusion_reason: "off_grid_timestamps" };
  }

  let hi = -Infinity, lo = Infinity;
  for (const b of win) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const last = win[win.length - 1].close;
  const a = atr && atr > 0 ? atr : null;

  const upDist = Math.max(0, hi - anchorPrice);
  const downDist = Math.max(0, anchorPrice - lo);

  const longRes = a
    ? barrier(win, anchorPrice + BARRIER_ATR_MULT_V3 * a, anchorPrice - BARRIER_ATR_MULT_V3 * a, "long")
    : INELIGIBLE("missing_atr");
  const shortRes = a
    ? barrier(win, anchorPrice - BARRIER_ATR_MULT_V3 * a, anchorPrice + BARRIER_ATR_MULT_V3 * a, "short")
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

/** Stable hash over EVERY deterministic v3 output. Excludes labelled_at/created_at/updated_at. */
export async function metricHashV3(l: OutcomeLabelV3): Promise<string> {
  const payload = JSON.stringify([
    "v3", l.horizon_minutes, l.data_resolution, l.anchor_price, l.atr_at_anchor,
    l.forward_close, l.forward_return_pct, l.forward_return_atr,
    l.max_high_price, l.min_low_price,
    l.long_mfe_price, l.long_mae_price, l.short_mfe_price, l.short_mae_price,
    l.long_mfe_atr, l.long_mae_atr, l.short_mfe_atr, l.short_mae_atr,
    l.barrier_atr_mult, l.barrier_version,
    l.long.first_hit, l.long.success, l.long.event_eligible, l.long.first_hit_time,
    l.short.first_hit, l.short.success, l.short.event_eligible, l.short.first_hit_time,
    l.bars_used, l.first_bar_time, l.last_bar_time,
    l.expected_bars, l.missing_bars, l.missing_venue_open, l.missing_venue_closed,
    l.duplicate_timestamps, l.off_grid_bars,
    l.coverage_ok, l.coverage_class, l.exclusion_reason,
  ]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}