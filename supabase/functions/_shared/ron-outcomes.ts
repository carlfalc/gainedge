/**
 * RON Phase 2A outcome labelling — deterministic, strictly forward-looking.
 *
 * HARD RULES
 *  - BOUNDARY (precise): a label uses ONLY bars that do NOT open before the anchor bar's
 *    CLOSE — the first eligible bar MAY open EXACTLY AT anchor close, because
 *    `candle_history.timestamp` is the bar OPEN time, so that bar covers
 *    [anchorClose, anchorClose + resolution) and does not overlap the anchor bar.
 *    Every included bar must COMPLETE at or before (anchor close + horizon).
 *    This is NOT "strictly after anchor close".
 *  - NOTE (label_version=1 legacy semantics): `mfe_price`/`mae_price` below store the
 *    ABSOLUTE highest/lowest traded price, not excursion distances. v1 rows are kept for
 *    audit only; use `ron-outcomes-v2.ts` for anything downstream.
 *  - Genuine stored candles only. Missing history is never interpolated, bridged or
 *    substituted with a coarser timeframe: it is reported as coverage_ok = false with
 *    a precise exclusion_reason.
 *  - Pure function: same forward bars => byte-identical metrics.
 *  - No trading logic, no order placement, no Falconer signal is used as a label.
 */

export interface FwdBar { time: number; open: number; high: number; low: number; close: number; }

export type ExclusionReason =
  | "no_forward_data"
  | "incomplete_forward_coverage"
  | "forward_gap"
  | "horizon_not_elapsed"
  | "missing_atr";

export interface OutcomeLabel {
  horizon_minutes: number;
  data_resolution: string;
  anchor_price: number;
  atr_at_anchor: number | null;
  forward_close: number | null;
  forward_return_pct: number | null;
  forward_return_atr: number | null;
  mfe_price: number | null;
  mae_price: number | null;
  mfe_pct: number | null;
  mae_pct: number | null;
  mfe_atr: number | null;
  mae_atr: number | null;
  long_excursion_atr: number | null;
  short_excursion_atr: number | null;
  bars_used: number;
  first_bar_time: string | null;
  last_bar_time: string | null;
  coverage_ok: boolean;
  exclusion_reason: ExclusionReason | null;
}

const r = (v: number | null, dp = 6): number | null =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));

/**
 * @param anchorBarTime  snapshot bar OPEN time (ms)
 * @param anchorBarMs    snapshot timeframe length in ms (15m snapshots => 900000)
 * @param anchorPrice    snapshot close (the price a decision would be taken at)
 * @param atr            ATR14 at the anchor bar, for volatility-normalised units
 * @param forward        ALL stored bars of `resolutionMs` in the forward region, ascending.
 *                       May contain extra bars: this function slices them itself.
 */
export function labelOutcome(
  anchorBarTime: number,
  anchorBarMs: number,
  anchorPrice: number,
  atr: number | null,
  forward: FwdBar[],
  horizonMinutes: number,
  resolutionMs: number,
  resolutionLabel: string,
): OutcomeLabel {
  const anchorClose = anchorBarTime + anchorBarMs;      // instant the decision becomes valid
  const horizonEnd = anchorClose + horizonMinutes * 60_000;

  // STRICTLY AFTER the anchor close, and fully completed inside the horizon.
  const win = forward
    .filter((b) => b.time >= anchorClose && b.time + resolutionMs <= horizonEnd)
    .sort((a, b) => a.time - b.time);

  const expected = Math.floor((horizonMinutes * 60_000) / resolutionMs);
  const base: OutcomeLabel = {
    horizon_minutes: horizonMinutes,
    data_resolution: resolutionLabel,
    anchor_price: anchorPrice,
    atr_at_anchor: atr,
    forward_close: null, forward_return_pct: null, forward_return_atr: null,
    mfe_price: null, mae_price: null, mfe_pct: null, mae_pct: null,
    mfe_atr: null, mae_atr: null, long_excursion_atr: null, short_excursion_atr: null,
    bars_used: win.length,
    first_bar_time: win.length ? new Date(win[0].time).toISOString() : null,
    last_bar_time: win.length ? new Date(win[win.length - 1].time).toISOString() : null,
    coverage_ok: false,
    exclusion_reason: null,
  };

  if (!win.length) return { ...base, exclusion_reason: "no_forward_data" };
  if (win.length < expected) return { ...base, exclusion_reason: "incomplete_forward_coverage" };

  // Contiguity: every step must be exactly one bar. A single missing minute is a gap.
  for (let i = 1; i < win.length; i++) {
    if (win[i].time - win[i - 1].time !== resolutionMs) {
      return { ...base, exclusion_reason: "forward_gap" };
    }
  }

  let hi = -Infinity, lo = Infinity;
  for (const b of win) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
  const last = win[win.length - 1].close;
  const mfe = hi - anchorPrice;          // best-case excursion for a long
  const mae = lo - anchorPrice;          // worst-case excursion for a long (<= 0)
  const a = atr && atr > 0 ? atr : null;

  return {
    ...base,
    forward_close: r(last, 5),
    forward_return_pct: r(((last - anchorPrice) / anchorPrice) * 100, 6),
    forward_return_atr: a ? r((last - anchorPrice) / a, 6) : null,
    mfe_price: r(hi, 5),
    mae_price: r(lo, 5),
    mfe_pct: r((mfe / anchorPrice) * 100, 6),
    mae_pct: r((mae / anchorPrice) * 100, 6),
    mfe_atr: a ? r(mfe / a, 6) : null,
    mae_atr: a ? r(mae / a, 6) : null,
    long_excursion_atr: a ? r(mfe / a, 6) : null,
    short_excursion_atr: a ? r(-mae / a, 6) : null,
    coverage_ok: true,
    exclusion_reason: null,
  };
}

/** Stable hash of the deterministic metric payload — used by the idempotence test. */
export async function metricHash(l: OutcomeLabel): Promise<string> {
  const payload = JSON.stringify([
    l.horizon_minutes, l.data_resolution, l.anchor_price, l.forward_close,
    l.forward_return_pct, l.forward_return_atr, l.mfe_price, l.mae_price,
    l.mfe_pct, l.mae_pct, l.mfe_atr, l.mae_atr, l.bars_used,
    l.first_bar_time, l.last_bar_time, l.coverage_ok, l.exclusion_reason,
  ]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
