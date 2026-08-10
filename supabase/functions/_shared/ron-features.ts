/**
 * RON deterministic market-state feature computation.
 *
 * Hard rules:
 *  - Pure function of candles at/before the target bar. NEVER reads a future bar.
 *  - Deterministic: same input bars => byte-identical output.
 *  - No LLM calls, no synthetic data. Unknown values are `null`, never invented.
 *  - Read-only imports from falconer-strategy (shared math + session helpers). That
 *    file is NOT modified: Falconer parity is untouched.
 */
import {
  type Candle,
  ema,
  atr,
  toHA,
  sessionStartOf,
  sessionIndexOf,
} from "./falconer-strategy.ts";
import { detectPatterns, type DetectedPattern } from "./ron-patterns.ts";

export const RON_FEATURE_VERSION = 1;

export type Regime = "trending_up" | "trending_down" | "ranging" | "transition";

export interface RonFeatures {
  [key: string]: unknown;
}

export interface RonSnapshot {
  symbol: string;
  timeframe: string;
  bar_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  spread: number | null;
  features: RonFeatures;
  patterns: DetectedPattern[];
  model_signals: Record<string, unknown>;
  feature_version: number;
  data_health: "healthy" | "stale" | "insufficient" | "error";
  source: string;
}

const r = (v: number | null | undefined, dp = 4): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(dp));

/** Wilder RSI over closes. Returns the full series (nulls until warmed). */
function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Wilder ADX / DI+ / DI- */
function adxSeries(candles: Candle[], period = 14) {
  const n = candles.length;
  const adx: (number | null)[] = new Array(n).fill(null);
  const pdi: (number | null)[] = new Array(n).fill(null);
  const mdi: (number | null)[] = new Array(n).fill(null);
  if (n < period * 2 + 1) return { adx, pdi, mdi };

  const tr: number[] = [0], pDM: number[] = [0], mDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    pDM.push(up > dn && up > 0 ? up : 0);
    mDM.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  let trS = 0, pS = 0, mS = 0;
  for (let i = 1; i <= period; i++) { trS += tr[i]; pS += pDM[i]; mS += mDM[i]; }
  const dxs: number[] = [];
  for (let i = period; i < n; i++) {
    if (i > period) {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + pDM[i];
      mS = mS - mS / period + mDM[i];
    }
    const p = trS === 0 ? 0 : (100 * pS) / trS;
    const m = trS === 0 ? 0 : (100 * mS) / trS;
    pdi[i] = p; mdi[i] = m;
    const dx = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
    dxs.push(dx);
    if (dxs.length === period) {
      adx[i] = dxs.reduce((a, b) => a + b, 0) / period;
    } else if (dxs.length > period) {
      adx[i] = ((adx[i - 1] as number) * (period - 1) + dx) / period;
    }
  }
  return { adx, pdi, mdi };
}

/** Stochastic RSI (0-100) of the RSI series. */
function stochRsi(rsi: (number | null)[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(rsi.length).fill(null);
  for (let i = period; i < rsi.length; i++) {
    const win = rsi.slice(i - period + 1, i + 1);
    if (win.some(v => v === null)) continue;
    const vals = win as number[];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    out[i] = hi === lo ? 0 : ((vals[vals.length - 1] - lo) / (hi - lo)) * 100;
  }
  return out;
}

function macdSeries(closes: number[]) {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const line = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(line, 9);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

/** UTC session label used across the product. */
function sessionLabel(hourUtc: number): "Asian" | "London" | "New York" {
  if (hourUtc < 8) return "Asian";
  if (hourUtc < 16) return "London";
  return "New York";
}

function pctRank(values: number[], value: number): number {
  if (!values.length) return 0;
  let below = 0;
  for (const v of values) if (v <= value) below++;
  return (below / values.length) * 100;
}

/**
 * Compute the RON snapshot for `candles[candles.length - 1]`.
 * `candles` MUST be ascending and MUST NOT contain any bar after the target bar.
 */
export function computeRonSnapshot(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  opts: { source?: string; spread?: number | null } = {},
): RonSnapshot {
  const i = candles.length - 1;
  const bar = candles[i];
  const closes = candles.map(c => c.close);
  const insufficient = candles.length < 220;

  const rsi = rsiSeries(closes, 14);
  const { adx, pdi, mdi } = adxSeries(candles, 14);
  const macd = macdSeries(closes);
  const srsi = stochRsi(rsi, 14);
  const atrArr = atr(candles, 14);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const ha = toHA(candles);

  const atrNow = atrArr[i];
  const atrPct = bar.close ? (atrNow / bar.close) * 100 : null;
  const atrHist = atrArr
    .slice(Math.max(0, i - 499), i + 1)
    .map((a, k) => {
      const c = candles[Math.max(0, i - Math.min(i, 499)) + k].close;
      return c ? (a / c) * 100 : 0;
    })
    .filter(v => Number.isFinite(v) && v > 0);
  const volPercentile = atrPct != null && atrHist.length >= 50 ? pctRank(atrHist, atrPct) : null;
  const volRegime = volPercentile == null ? null
    : volPercentile < 25 ? "low" : volPercentile < 75 ? "normal" : "high";

  // ── deterministic structure / regime ─────────────────────────────
  // Swing pivots over the last 60 bars (3-bar fractals, target bar inclusive).
  const win = candles.slice(Math.max(0, i - 59), i + 1);
  const highs: number[] = [], lows: number[] = [];
  for (let k = 3; k < win.length - 3; k++) {
    const isHigh = win.slice(k - 3, k).every(c => c.high < win[k].high) &&
      win.slice(k + 1, k + 4).every(c => c.high <= win[k].high);
    const isLow = win.slice(k - 3, k).every(c => c.low > win[k].low) &&
      win.slice(k + 1, k + 4).every(c => c.low >= win[k].low);
    if (isHigh) highs.push(win[k].high);
    if (isLow) lows.push(win[k].low);
  }
  const hh = highs.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2];
  const lh = highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2];
  const ll = lows.length >= 2 && lows[lows.length - 1] < lows[lows.length - 2];

  const adxNow = adx[i];
  const emaStackUp = e21[i] > e50[i] && e50[i] > e200[i];
  const emaStackDown = e21[i] < e50[i] && e50[i] < e200[i];
  let regime: Regime;
  if (adxNow != null && adxNow >= 25 && emaStackUp && (hh || hl)) regime = "trending_up";
  else if (adxNow != null && adxNow >= 25 && emaStackDown && (lh || ll)) regime = "trending_down";
  else if (adxNow != null && adxNow < 20) regime = "ranging";
  else regime = "transition";

  // ── session / time context (broker 17:00 NY daily boundary) ──────
  const t = bar.time;
  const d = new Date(t);
  const sessStart = sessionStartOf(t, "auto");
  const sessIdx = sessionIndexOf(t, "auto");
  const minutesFromSessionOpen = Math.round((t - sessStart) / 60000);

  // Previous completed broker-session high/low (no lookahead: only bars in earlier sessions).
  let pdh: number | null = null, pdl: number | null = null;
  let dayHigh: number | null = null, dayLow: number | null = null;
  let asianHigh: number | null = null, asianLow: number | null = null;
  const prevIdx = sessIdx - 1;
  for (let k = i; k >= 0 && k > i - 4000; k--) {
    const c = candles[k];
    const s = sessionIndexOf(c.time, "auto");
    if (s === sessIdx) {
      dayHigh = dayHigh == null ? c.high : Math.max(dayHigh, c.high);
      dayLow = dayLow == null ? c.low : Math.min(dayLow, c.low);
      const h = new Date(c.time).getUTCHours();
      if (h < 8) {
        asianHigh = asianHigh == null ? c.high : Math.max(asianHigh, c.high);
        asianLow = asianLow == null ? c.low : Math.min(asianLow, c.low);
      }
    } else if (s === prevIdx) {
      pdh = pdh == null ? c.high : Math.max(pdh, c.high);
      pdl = pdl == null ? c.low : Math.min(pdl, c.low);
    } else if (s < prevIdx) break;
  }
  const posInDayRange = dayHigh != null && dayLow != null && dayHigh > dayLow
    ? ((bar.close - dayLow) / (dayHigh - dayLow)) * 100 : null;

  // ── volume ───────────────────────────────────────────────────────
  const hasVolume = candles.slice(-50).some(c => (c.volume ?? 0) > 0);
  const vol = hasVolume ? (bar.volume ?? null) : null;
  const vols = hasVolume ? candles.slice(Math.max(0, i - 49), i + 1).map(c => c.volume ?? 0) : [];
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const relVolume = vol != null && avgVol ? vol / avgVol : null;

  // ── support / resistance proximity (prior bars only) ─────────────
  const srWin = candles.slice(Math.max(0, i - 119), i + 1);
  const nearestRes = Math.max(...srWin.slice(0, -1).map(c => c.high).filter(h => h > bar.close), Number.NEGATIVE_INFINITY);
  const nearestSup = Math.min(...srWin.slice(0, -1).map(c => c.low).filter(l => l < bar.close), Number.POSITIVE_INFINITY);

  const patterns = detectPatterns(
    candles.slice(Math.max(0, i - 149)).map(c => ({
      time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    })),
  ).slice(0, 6);

  const rsiNow = rsi[i];
  const rsiPrev = rsi[Math.max(0, i - 3)];
  const histNow = macd.hist[i];
  const histPrev = macd.hist[Math.max(0, i - 1)];

  const features: RonFeatures = {
    rsi14: r(rsiNow, 2),
    rsi14_slope3: rsiNow != null && rsiPrev != null ? r(rsiNow - rsiPrev, 2) : null,
    adx14: r(adxNow, 2),
    di_plus: r(pdi[i], 2),
    di_minus: r(mdi[i], 2),
    macd_line: r(macd.line[i], 5),
    macd_signal: r(macd.signal[i], 5),
    macd_hist: r(histNow, 5),
    macd_hist_slope: r(histNow - histPrev, 5),
    macd_state: histNow > 0 ? (histNow >= histPrev ? "bullish_expanding" : "bullish_fading")
      : (histNow <= histPrev ? "bearish_expanding" : "bearish_fading"),
    stoch_rsi: r(srsi[i], 2),
    atr14: r(atrNow, 5),
    atr_pct: r(atrPct, 4),
    volatility_percentile: r(volPercentile, 2),
    volatility_regime: volRegime,
    ema9: r(e9[i], 5),
    ema21: r(e21[i], 5),
    ema50: r(e50[i], 5),
    ema200: r(e200[i], 5),
    ema21_dist_pct: r(((bar.close - e21[i]) / bar.close) * 100, 4),
    ema50_dist_pct: r(((bar.close - e50[i]) / bar.close) * 100, 4),
    ema200_dist_pct: r(((bar.close - e200[i]) / bar.close) * 100, 4),
    ema21_slope: r(e21[i] - e21[Math.max(0, i - 3)], 5),
    ema50_slope: r(e50[i] - e50[Math.max(0, i - 3)], 5),
    ema_stack: emaStackUp ? "up" : emaStackDown ? "down" : "mixed",
    structure: { higher_high: hh, higher_low: hl, lower_high: lh, lower_low: ll },
    regime,
    ha_state: ha[i].close > ha[i].open ? "bullish" : "bearish",
    ha_body_pct: r((Math.abs(ha[i].close - ha[i].open) / Math.max(ha[i].high - ha[i].low, 1e-9)) * 100, 2),
    volume: vol,
    relative_volume: r(relVolume, 3),
    volume_available: hasVolume,
    nearest_resistance: Number.isFinite(nearestRes) ? r(nearestRes, 5) : null,
    nearest_support: Number.isFinite(nearestSup) ? r(nearestSup, 5) : null,
    dist_to_resistance_pct: Number.isFinite(nearestRes) ? r(((nearestRes - bar.close) / bar.close) * 100, 4) : null,
    dist_to_support_pct: Number.isFinite(nearestSup) ? r(((bar.close - nearestSup) / bar.close) * 100, 4) : null,
    session: sessionLabel(d.getUTCHours()),
    hour_utc: d.getUTCHours(),
    weekday_utc: d.getUTCDay(),
    session_open_utc: new Date(sessStart).toISOString(),
    minutes_from_session_open: minutesFromSessionOpen,
    prev_session_high: r(pdh, 5),
    prev_session_low: r(pdl, 5),
    session_high: r(dayHigh, 5),
    session_low: r(dayLow, 5),
    asian_high: r(asianHigh, 5),
    asian_low: r(asianLow, 5),
    position_in_day_range_pct: r(posInDayRange, 2),
    bars_used: candles.length,
  };

  return {
    symbol,
    timeframe,
    bar_time: new Date(bar.time).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: vol,
    spread: opts.spread ?? null,
    features,
    patterns,
    // Falconer trigger state is intentionally NOT evaluated here: doing so would require
    // touching parity-frozen strategy code paths. Structured placeholder for Phase 1B.
    model_signals: {
      falconer_v7_tp3: { evaluated: false, trigger: null, distance_to_trigger: null, note: "not evaluated in slice 1A" },
    },
    feature_version: RON_FEATURE_VERSION,
    data_health: insufficient ? "insufficient" : "healthy",
    source: opts.source ?? "candle_history",
  };
}

/**
 * Deterministic RON state + plain-English explanation.
 * This is evidence labelling only — it is NOT a probability and must never be shown as one.
 */
export function ronStateFrom(features: Record<string, any>): {
  state: "WAIT" | "WATCH" | "SETUP FORMING";
  why: string;
  next: string;
} {
  const adx = features.adx14 as number | null;
  const rsi = features.rsi14 as number | null;
  const regime = features.regime as string;
  const stack = features.ema_stack as string;
  const macd = String(features.macd_state ?? "");
  const trending = regime === "trending_up" || regime === "trending_down";
  const up = regime === "trending_up";

  let score = 0;
  if (trending) score += 2;
  if (adx != null && adx >= 25) score += 1;
  if (stack === "up" || stack === "down") score += 1;
  if (macd.startsWith(up ? "bullish" : "bearish")) score += 1;

  const state = score >= 4 ? "SETUP FORMING" : score >= 2 ? "WATCH" : "WAIT";

  const why = [
    `Regime is ${String(regime).replace("_", " ")}`,
    adx != null ? `ADX ${adx.toFixed(1)} (${adx >= 25 ? "trend strength confirmed" : "trend strength weak"})` : "ADX unavailable",
    `EMA stack ${stack}`,
    rsi != null ? `RSI ${rsi.toFixed(1)}` : "RSI unavailable",
    `MACD ${macd.replace("_", " ")}`,
  ].join(" · ");

  const next = state === "SETUP FORMING"
    ? "Needs a pullback to the 21 EMA holding, then a close back in trend direction."
    : state === "WATCH"
      ? "Needs ADX above 25 and the EMA stack to align before a setup can form."
      : "Needs a directional break out of the current range with expanding ADX.";

  return { state, why, next };
}