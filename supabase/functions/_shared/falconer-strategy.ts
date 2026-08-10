// Falconer v7 TP3 33-33-34 — TypeScript port of the canonical Pine v5 strategy.
// Longs only. Pure functions: the SAME module powers the live engine and the backtest.
//
// CANONICAL SOURCE OF TRUTH: strategy/falconer_v7_tp3.pine (owner-supplied 2026-05-30).
// This port mirrors that Pine exactly. Key faithful details (do not "simplify" away):
//   • Trend filter is DAILY: dTrendUp = emaD50 rising, close > emaD50, AND close > emaD200.
//   • Strong-HA filter: every entry needs 2 consecutive green Heiken-Ashi bars (haGreen & haGreen[1]).
//   • atrPct band 0.05–0.80 (% of price).
//   • tpLong: trend pullback where the bar LOW touches the ±0.15%-of-price band around EMA21.
//   • sqzUp: squeeze released (sqzOn[i-2] && !sqzOn[i]) AND close > upperBB[i-1].
//   • swPDL / swAL: PRIOR-bar sweep (low[1] < level, close[1] > level) + close > close[1].
//   • swAL sweeps the Asian-session LOW (22:00–06:00 UTC), not the high.
//
// Daily semantics: emaD50/emaD200/pdl are taken from the most recent COMPLETED daily bar
// (non-repainting, lookahead-off equivalent). The live engine must feed ~300 daily bars so
// EMA200 is warmed; runBacktest aggregates daily from the intraday window (EMA200 is
// under-warmed early in a short window — see note in runBacktest).

export interface Candle {
  time: number;   // ms epoch (bar close time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StrategyConfig {
  // risk
  riskUsd: number;          // default 200
  rrTp1: number;            // 1.5
  rrTp2: number;            // 3
  rrTp3: number;            // 5
  beR: number;              // 1.0 — move SL to BE when price hits entry + beR * R
  pct1: number;             // 33
  pct2: number;             // 33  (pct3 = 100 - pct1 - pct2)
  // filters
  minAtrPct: number;        // 0.05  (% of price)
  maxAtrPct: number;        // 0.80  (% of price) — Pine maxATRp
  pullbackTol: number;      // 0.0015 — pullback band as a FRACTION OF CLOSE (Pine tolDist = close * pullbackTol)
  // Asian session (UTC hours); start>end means the window wraps past midnight (Pine "2200-0600")
  asianStartHour: number;   // 22
  asianEndHour: number;     // 6
  // symbol meta — units bridge ONLY (never used in P&L; see below)
  /** Contracts per 1.0 broker lot (XAUUSD = 100 oz per lot). Used solely to convert Pine
   *  contracts into MT5 lots for order routing. */
  pipValuePerLot: number;
  // Pine parity knobs — P&L unit definition
  /** Pine `dpu`: USD per contract per 1.0 unit of price move. Canonical script uses 1.0, so
   *  every P&L in this engine is (exit - entry) * contracts * dpu, exactly like Pine. */
  dollarPerUnit?: number;
  minQty?: number;          // Pine `math.max(qty, 1.0)` floor (default 1.0)
  /** UTC hour at which the broker DAILY session opens, or "auto" for the DST-aware
   *  17:00 New York boundary (21:00 UTC in EDT, 22:00 UTC in EST). */
  dailySessionOffsetHour?: SessionOffset;
}

export const DEFAULT_CONFIG: StrategyConfig = {
  riskUsd: 200,
  rrTp1: 1.5,
  rrTp2: 3.0,
  rrTp3: 5.0,
  beR: 1.0,
  pct1: 33,
  pct2: 33,
  minAtrPct: 0.05,
  maxAtrPct: 0.80,
  pullbackTol: 0.0015,
  asianStartHour: 22,
  asianEndHour: 6,
  pipValuePerLot: 100, // gold default
  dollarPerUnit: 1.0,
  minQty: 1.0,
  dailySessionOffsetHour: "auto",
};

/* ──────────── Indicators ──────────── */

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Population standard deviation over a rolling window (matches Pine ta.stdev default). */
export function stdev(values: number[], period: number): number[] {
  const basis = sma(values, period);
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += (values[j] - basis[i]) ** 2;
    out[i] = Math.sqrt(sum / period);
  }
  return out;
}

export function atr(candles: Candle[], period: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
  }
  // RMA (Wilder) — matches Pine ta.atr
  const out: number[] = new Array(tr.length).fill(NaN);
  if (tr.length < period) return out;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bb(values: number[], period: number, mult: number) {
  const basis = sma(values, period);
  const sd = stdev(values, period);
  const upper = basis.map((b, i) => b + mult * sd[i]);
  const lower = basis.map((b, i) => b - mult * sd[i]);
  return { basis, upper, lower };
}

/** Keltner channel using the SAME basis as Bollinger (SMA), so the squeeze test
 *  reduces exactly to Pine's: 2*stdev < kcMult*atr (basis cancels). */
export function kc(candles: Candle[], period: number, mult: number) {
  const closes = candles.map(c => c.close);
  const basis = sma(closes, period);
  const atrArr = atr(candles, period);
  const upper = basis.map((b, i) => b + mult * atrArr[i]);
  const lower = basis.map((b, i) => b - mult * atrArr[i]);
  return { basis, upper, lower };
}

/**
 * Bollinger/Keltner squeeze flag per bar, matching Pine:
 *   basis = sma(close,len); upBB = basis+bbMult*stdev; loBB = basis-bbMult*stdev
 *   rng = atr(len); upKC = basis+kcMult*rng; loKC = basis-kcMult*rng
 *   sqzOn = loBB > loKC and upBB < upKC   →   bbMult*stdev < kcMult*atr
 */
export function squeezeSeries(candles: Candle[], len = 20, bbMult = 2, kcMult = 1.5): boolean[] {
  const closes = candles.map(c => c.close);
  const sd = stdev(closes, len);
  const atrArr = atr(candles, len);
  return closes.map((_, i) => {
    if (Number.isNaN(sd[i]) || Number.isNaN(atrArr[i])) return false;
    return bbMult * sd[i] < kcMult * atrArr[i];
  });
}

/** Heiken Ashi candles derived from regular OHLC. */
export function toHA(candles: Candle[]): Candle[] {
  const ha: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
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

/* ──────────── Daily higher-timeframe context ──────────── */

export interface DailyBar { time: number; date: string; open: number; high: number; low: number; close: number; }

const DAY_MS = 86_400_000;

/** Daily-session offset: fixed UTC hour, or "auto" = DST-aware broker session (17:00 New York). */
export type SessionOffset = number | "auto";

/** UTC offset (hours behind UTC) of America/New_York at `ms` — 4 during EDT, 5 during EST. */
const nyOffsetCache = new Map<number, number>();
export function newYorkUtcOffsetHours(ms: number): number {
  const dayKey = Math.floor(ms / DAY_MS);
  const cached = nyOffsetCache.get(dayKey);
  if (cached !== undefined) return cached;
  const d = new Date(ms);
  const asUTC = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const asNY = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const off = Math.round((asUTC.getTime() - asNY.getTime()) / 3_600_000);
  nyOffsetCache.set(dayKey, off);
  return off;
}

/**
 * DST-aware broker daily-session opening UTC hour: MT5 servers roll the daily bar at
 * 17:00 New York → 21:00 UTC during EDT, 22:00 UTC during EST.
 */
export function brokerSessionOffsetHour(ms: number): number {
  return 17 + newYorkUtcOffsetHours(ms);
}

function offsetHourAt(off: SessionOffset, ms: number): number {
  return off === "auto" ? brokerSessionOffsetHour(ms) : off;
}

/**
 * M3 — session-aligned daily bucketing.
 * A broker daily candle stamped at 21:00 UTC belongs to the session [21:00, next 21:00),
 * NOT to the prior UTC calendar day. `sessionIndex` is the integer index of that session.
 *
 * With "auto" the index is computed in New York local time (session starts 17:00 NY), so it
 * stays continuous across DST switches — the transition session is simply 23h or 25h long.
 */
export function sessionIndexOf(ms: number, offsetHour: SessionOffset): number {
  if (offsetHour === "auto") {
    const nyLocalMs = ms - newYorkUtcOffsetHours(ms) * 3_600_000;
    return Math.floor((nyLocalMs - 17 * 3_600_000) / DAY_MS);
  }
  return Math.floor((ms - offsetHour * 3_600_000) / DAY_MS);
}

/** UTC timestamp at which the session containing `ms` opens. */
export function sessionStartOf(ms: number, offsetHour: SessionOffset): number {
  const h = offsetHourAt(offsetHour, ms);
  if (offsetHour === "auto") {
    return sessionIndexOf(ms, offsetHour) * DAY_MS + 17 * 3_600_000 + newYorkUtcOffsetHours(ms) * 3_600_000;
  }
  return sessionIndexOf(ms, offsetHour) * DAY_MS + h * 3_600_000;
}

function sessionKey(ms: number, offsetHour: SessionOffset): string {
  const start = sessionStartOf(ms, offsetHour);
  return new Date(start).toISOString().slice(0, 10);
}

/** Infer the daily-session opening UTC hour from the modal timestamp hour of daily bars. */
export function inferSessionOffsetHour(bars: { time: number }[], fallback = 21): number {
  if (!bars.length) return fallback;
  const counts = new Map<number, number>();
  for (const b of bars) {
    const h = new Date(b.time).getUTCHours();
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best = fallback, bestN = -1;
  for (const [h, n] of counts) if (n > bestN) { best = h; bestN = n; }
  return best;
}

/** Aggregate intraday candles into session-aligned daily bars (ascending). */
export function aggregateDaily(candles: Candle[], offsetHour: SessionOffset = "auto"): DailyBar[] {
  const days: DailyBar[] = [];
  let cur: DailyBar | null = null;
  let curIdx = NaN;
  for (const c of candles) {
    const idx = sessionIndexOf(c.time, offsetHour);
    if (!cur || idx !== curIdx) {
      if (cur) days.push(cur);
      curIdx = idx;
      cur = {
        time: sessionStartOf(c.time, offsetHour),
        date: sessionKey(c.time, offsetHour),
        open: c.open, high: c.high, low: c.low, close: c.close,
      };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
    }
  }
  if (cur) days.push(cur);
  return days;
}

export interface DailySeries {
  bars: DailyBar[];
  ema50: number[];
  ema200: number[];
  /** session index per daily bar */
  sessionIdx: number[];
  offsetHour: SessionOffset;
}

/**
 * Build a daily series from already-daily broker bars (live engine) or from intraday candles.
 * When daily bars are supplied their stamps define the session offset (M3); intraday
 * aggregation uses `offsetHour` (default = broker session open, 21:00 UTC).
 */
export function computeDailySeries(input: DailyBar[] | Candle[], offsetHour?: SessionOffset): DailySeries {
  const isDaily = input.length > 0 && "date" in (input[0] as DailyBar);
  let bars: DailyBar[];
  let off: SessionOffset;
  if (isDaily) {
    bars = input as DailyBar[];
    off = offsetHour ?? "auto";
  } else {
    // treat "daily-spaced" plain candles as daily bars too
    const cs = input as Candle[];
    const dailySpaced = cs.length > 1 && (cs[1].time - cs[0].time) >= DAY_MS - 3_600_000;
    off = offsetHour ?? "auto";
    if (dailySpaced) {
      bars = cs.map(c => ({ time: c.time, date: sessionKey(c.time, off), open: c.open, high: c.high, low: c.low, close: c.close }));
    } else {
      bars = aggregateDaily(cs, off);
    }
  }
  const closes = bars.map(b => b.close);
  return {
    bars,
    ema50: closes.length ? ema(closes, 50) : [],
    ema200: closes.length ? ema(closes, 200) : [],
    sessionIdx: bars.map(b => sessionIndexOf(b.time, off)),
    offsetHour: off,
  };
}

export interface DailyContext {
  emaD50: number;
  emaD50Prev: number;   // value of the SECURITY SERIES on the previous intraday bar (Pine emaD50[1])
  emaD200: number;
  pdl: number;          // request.security("D", low[1]) → low of the bar BEFORE the last completed daily bar
}

/** Index of the last COMPLETED daily bar for an intraday bar time (lookahead_off, session-aligned). */
export function lastCompletedDailyIndex(ds: DailySeries, barTimeMs: number): number {
  const cur = sessionIndexOf(barTimeMs, ds.offsetHour);
  let k = -1;
  for (let i = ds.bars.length - 1; i >= 0; i--) {
    if (ds.sessionIdx[i] < cur) { k = i; break; }
  }
  return k;
}

/**
 * Pine `request.security(tf="D", …, lookahead_off)` emulation for an intraday bar.
 *
 * M1 — Historical Pine HTF semantics: with lookahead OFF, on HISTORICAL bars
 * `request.security` returns the value of the LAST CLOSED daily bar and holds it constant
 * for every intraday bar of the developing session. The series is therefore a step function
 * that only changes on the first intraday bar of a new session.
 * `emaD50[1]` is that same projected series evaluated on intraday bar i-1, so
 * `dTrendUp = emaD50 > emaD50[1]` can only be TRUE on the session-rollover bar.
 * (The developing-close variant repaints and does NOT reproduce the canonical backtest.)
 *
 * M2 — `pdl = request.security("D", low[1])`: index [1] is taken INSIDE the daily series, so
 * relative to the developing daily bar it is the LAST COMPLETED daily bar's low.
 *
 * M3 — bucketing and completion are session-aligned (broker daily bars stamped 21:00 UTC
 * belong to the session that STARTS at 21:00). A still-forming daily session is only ever
 * seen through intraday data up to the current bar — never its future OHLC.
 */
export function dailyContextFor(
  ds: DailySeries,
  barTimeMs: number,
  prevBarTimeMs?: number,
  developingClose?: number,
  prevDevelopingClose?: number,
): DailyContext | null {
  const k = lastCompletedDailyIndex(ds, barTimeMs);
  if (k < 0 || !Number.isFinite(ds.ema50[k]) || !Number.isFinite(ds.ema200[k])) return null;

  const emaD50 = ds.ema50[k];
  const emaD200 = ds.ema200[k];

  // emaD50[1] = projected series on the PREVIOUS intraday bar → same last-closed-daily value
  // unless that previous bar belonged to an earlier session (rollover).
  let emaD50Prev = emaD50;
  if (prevBarTimeMs !== undefined) {
    const kPrev = lastCompletedDailyIndex(ds, prevBarTimeMs);
    if (kPrev >= 0 && Number.isFinite(ds.ema50[kPrev])) emaD50Prev = ds.ema50[kPrev];
    else if (kPrev < 0) return null;
  } else {
    if (k < 1) return null;
    emaD50Prev = ds.ema50[k - 1];
  }

  return { emaD50, emaD50Prev, emaD200, pdl: ds.bars[k].low };
}

/* ──────────── Asian session (locked low/high) ──────────── */

function inAsianHour(hourUtc: number, cfg: StrategyConfig): boolean {
  const { asianStartHour: s, asianEndHour: e } = cfg;
  return s > e ? (hourUtc >= s || hourUtc < e) : (hourUtc >= s && hourUtc < e);
}

export interface AsianLocked { lockedLo: (number | null)[]; lockedHi: (number | null)[]; }

/**
 * Per-bar locked Asian-session low/high, mirroring Pine's stateful var logic:
 * accumulate hi/lo while in session; lock them on the first bar after the session ends;
 * the locked values persist until the next session ends.
 */
export function asianLockedSeries(candles: Candle[], cfg: StrategyConfig): AsianLocked {
  const lockedLo: (number | null)[] = new Array(candles.length).fill(null);
  const lockedHi: (number | null)[] = new Array(candles.length).fill(null);
  let aHi: number | null = null;
  let aLo: number | null = null;
  let curLo: number | null = null;
  let curHi: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const h = new Date(candles[i].time).getUTCHours();
    const inA = inAsianHour(h, cfg);
    const inAprev = i > 0 ? inAsianHour(new Date(candles[i - 1].time).getUTCHours(), cfg) : false;
    if (inA && !inAprev) {
      aHi = candles[i].high; aLo = candles[i].low;
    } else if (inA) {
      aHi = Math.max(aHi ?? candles[i].high, candles[i].high);
      aLo = Math.min(aLo ?? candles[i].low, candles[i].low);
    }
    if (!inA && inAprev) { curHi = aHi; curLo = aLo; }
    lockedLo[i] = curLo;
    lockedHi[i] = curHi;
  }
  return { lockedLo, lockedHi };
}

/* ──────────── Trigger evaluation ──────────── */

export type TriggerType = "tpLong" | "sqzUp" | "swPDL" | "swAL";

export interface TriggerResult {
  fired: boolean;
  type?: TriggerType;
}

/**
 * Faithful Falconer v7 long-entry test for closed bar i. Encapsulates BOTH the
 * per-trigger conditions and the global filters (atr band, strong HA, daily trend).
 * Mirrors Pine precedence: tpLong → sqzUp → swPDL → swAL.
 */
export interface BarContext {
  // Heiken-Ashi
  haGreen: boolean;
  haGreenPrev: boolean;
  haRedPrev: boolean;
  // price
  close: number;
  closePrev: number;
  low: number;
  lowPrev: number;
  // intraday indicators
  ema21: number;
  atrPct: number;
  upBBPrev: number;     // upperBB[i-1]
  sqzReleased: boolean; // sqzOn[i-2] && !sqzOn[i]
  // daily context (completed bars)
  emaD50: number;
  emaD50Prev: number;
  emaD200: number;
  // levels
  pdl: number | null;
  lockedLo: number | null;
  cfg: StrategyConfig;
}

export function evaluateLongTrigger(ctx: BarContext): TriggerResult {
  const {
    haGreen, haGreenPrev, haRedPrev, close, closePrev, low, lowPrev,
    ema21, atrPct, upBBPrev, sqzReleased,
    emaD50, emaD50Prev, emaD200, pdl, lockedLo, cfg,
  } = ctx;

  // ── Global filters (apply to every entry) ──
  const atrOK = atrPct >= cfg.minAtrPct && atrPct <= cfg.maxAtrPct;
  const dTrendUp = emaD50 > emaD50Prev;
  const haOK = haGreen;                         // haOKlong
  const haOKstrong = haGreen && haGreenPrev;    // haOKlongStrong (2 consecutive green HA)
  const trendOK = dTrendUp;                     // trendOKlong
  const trendOKstrong = dTrendUp && close > emaD200; // trendOKlongStrong
  if (!(atrOK && haOK && haOKstrong && trendOK && trendOKstrong)) return { fired: false };

  // ── Per-trigger conditions ──
  const trendUp = close > emaD50 && dTrendUp;
  const tolDist = close * cfg.pullbackTol;
  const pullbackLow = low <= ema21 + tolDist && low >= ema21 - tolDist;
  const haFlipG = haGreen && haRedPrev;

  // 1) tpLong — trend pullback to EMA21, HA confirms
  if (trendUp && pullbackLow && haGreen && (haFlipG || haGreenPrev)) {
    return { fired: true, type: "tpLong" };
  }
  // 2) sqzUp — squeeze release upward through prior upper Bollinger
  if (sqzReleased && close > upBBPrev && haGreen) {
    return { fired: true, type: "sqzUp" };
  }
  // 3) swPDL — prior bar swept previous-day low and reclaimed, momentum up
  if (pdl !== null && lowPrev < pdl && closePrev > pdl && close > closePrev && haGreen) {
    return { fired: true, type: "swPDL" };
  }
  // 4) swAL — prior bar swept Asian-session LOW and reclaimed, momentum up
  if (lockedLo !== null && lowPrev < lockedLo && closePrev > lockedLo && close > closePrev && haGreen) {
    return { fired: true, type: "swAL" };
  }
  return { fired: false };
}

/* ──────────── Position math ──────────── */

export interface OpenPosition {
  entry: number;
  sl: number;
  /** Pine keeps L-TP1's original stop when BE fires; only TP2/TP3 legs move to entry. */
  slLeg1: number;
  tp1: number;
  tp2: number;
  tp3: number;
  beLevel: number;
  qty: number;
  /** Broker lots = qty * dpu / pipValuePerLot (documented unit conversion). */
  lots: number;
  qty1: number;
  qty2: number;
  qty3: number;
  filled1: boolean;
  filled2: boolean;
  filled3: boolean;
  beDone: boolean;
  /** realized P&L accumulated from partially closed legs */
  realized: number;
  trigger: TriggerType;
  openedAt: number;
}

export function buildPosition(
  entry: number,
  rawSL: number,
  trigger: TriggerType,
  openedAt: number,
  cfg: StrategyConfig,
): OpenPosition {
  const r = Math.max(entry - rawSL, 1e-9);
  const tp1 = entry + cfg.rrTp1 * r;
  const tp2 = entry + cfg.rrTp2 * r;
  const tp3 = entry + cfg.rrTp3 * r;
  const beLevel = entry + cfg.beR * r;

  // Pine: qty = math.max(riskUSD / (riskD * dpu), 1.0); qty3 = qty - qty1 - qty2
  const dpu = cfg.dollarPerUnit ?? 1;
  const minQty = cfg.minQty ?? 1;
  const totalQty = Math.max(cfg.riskUsd / (r * dpu), minQty);
  const qty1 = totalQty * (cfg.pct1 / 100);
  const qty2 = totalQty * (cfg.pct2 / 100);
  const qty3 = totalQty - qty1 - qty2;
  const lots = cfg.pipValuePerLot > 0 ? (totalQty * dpu) / cfg.pipValuePerLot : totalQty;

  return {
    entry, sl: rawSL, slLeg1: rawSL, tp1, tp2, tp3, beLevel,
    qty: totalQty, lots, qty1, qty2, qty3,
    filled1: false, filled2: false, filled3: false, beDone: false, realized: 0,
    trigger, openedAt,
  };
}

/* ──────────── Backtest replay ──────────── */

export interface BacktestTrade {
  openedAt: number;
  closedAt: number;
  trigger: TriggerType;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  exitReason: "tp3" | "sl" | "ha_flip" | "be_stop";
  pnlUsd: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: { t: number; equity: number }[];
  netPnlUsd: number;
  netPnlPct: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
}

/**
 * Bar-by-bar replay using the faithful entry logic.
 *
 * Pass a warmed daily series to reproduce the live daily EMA50/EMA200/PDL context.
 * The intraday aggregation fallback remains available for isolated pure-function tests.
 */
export function runBacktest(
  candles: Candle[],
  cfg: StrategyConfig,
  initialEquity = 10_000,
  dailyCandles?: Candle[],
  /** First bar index to trade from — exclude indicator warm-up (default 25). */
  startIndex = 25,
): BacktestResult {
  const closes = candles.map(c => c.close);
  const ema21 = ema(closes, 21);
  const atrArr = atr(candles, 14);
  const bbBands = bb(closes, 20, 2);
  const sqz = squeezeSeries(candles, 20, 2, 1.5);
  const ha = toHA(candles);
  const asian = asianLockedSeries(candles, cfg);
  const ds = computeDailySeries(dailyCandles?.length ? dailyCandles : candles, cfg.dailySessionOffsetHour);
  const dpu = cfg.dollarPerUnit ?? 1;

  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  let equity = initialEquity;
  let peak = equity;
  let maxDD = 0;
  let pos: OpenPosition | null = null;

  for (let i = Math.max(1, startIndex); i < candles.length; i++) {
    const c = candles[i];

    // Manage existing position (Pine leg semantics: L-TP1 keeps its ORIGINAL stop after BE;
    // only the TP2/TP3 legs are re-issued with stop = entry).
    if (pos) {
      const p = pos;
      let realized = 0;
      // stops first (conservative intrabar assumption)
      if (!p.filled1 && c.low <= p.slLeg1) { realized += (p.slLeg1 - p.entry) * p.qty1 * dpu; p.filled1 = true; }
      const restStop = p.beDone ? p.entry : p.sl;
      if (c.low <= restStop) {
        if (!p.filled2) realized += (restStop - p.entry) * p.qty2 * dpu;
        if (!p.filled3) realized += (restStop - p.entry) * p.qty3 * dpu;
        equity += realized + p.realized;
        trades.push({
          openedAt: p.openedAt, closedAt: c.time, trigger: p.trigger,
          entry: p.entry, sl: restStop, tp1: p.tp1, tp2: p.tp2, tp3: p.tp3,
          exitReason: p.beDone ? "be_stop" : "sl", pnlUsd: realized + p.realized,
        });
        pos = null;
      } else {
        p.realized += realized;
        if (!p.filled1 && c.high >= p.tp1) { p.filled1 = true; p.realized += (p.tp1 - p.entry) * p.qty1 * dpu; }
        if (!p.filled2 && c.high >= p.tp2) { p.filled2 = true; p.realized += (p.tp2 - p.entry) * p.qty2 * dpu; }
        if (!p.beDone && c.high >= p.beLevel) { p.sl = p.entry; p.beDone = true; }
        if (!p.filled3 && c.high >= p.tp3) {
          p.filled3 = true;
          p.realized += (p.tp3 - p.entry) * p.qty3 * dpu;
          equity += p.realized;
          trades.push({
            openedAt: p.openedAt, closedAt: c.time, trigger: p.trigger,
            entry: p.entry, sl: p.sl, tp1: p.tp1, tp2: p.tp2, tp3: p.tp3,
            exitReason: "tp3", pnlUsd: p.realized,
          });
          pos = null;
        } else if (p.beDone) {
          // Pine: after BE, two consecutive red HA bars close the remainder at bar close
          const haRed = ha[i].close < ha[i].open;
          const haRedPrev = ha[i - 1].close < ha[i - 1].open;
          if (haRed && haRedPrev) {
            const exitPx = c.close;
            const remaining = (p.filled1 ? 0 : p.qty1) + (p.filled2 ? 0 : p.qty2) + (p.filled3 ? 0 : p.qty3);
            const pnl = p.realized + (exitPx - p.entry) * remaining * dpu;
            equity += pnl;
            trades.push({
              openedAt: p.openedAt, closedAt: c.time, trigger: p.trigger,
              entry: p.entry, sl: p.sl, tp1: p.tp1, tp2: p.tp2, tp3: p.tp3,
              exitReason: "ha_flip", pnlUsd: pnl,
            });
            pos = null;
          }
        }
      }
    }

    // New entry only when flat
    if (!pos) {
      const dctx = dailyContextFor(ds, c.time, candles[i - 1].time, c.close, candles[i - 1].close);
      const atrPct = (atrArr[i] / c.close) * 100;
      if (dctx && Number.isFinite(atrArr[i])) {
        const trig = evaluateLongTrigger({
          haGreen: ha[i].close > ha[i].open,
          haGreenPrev: ha[i - 1].close > ha[i - 1].open,
          haRedPrev: ha[i - 1].close < ha[i - 1].open,
          close: c.close, closePrev: candles[i - 1].close,
          low: c.low, lowPrev: candles[i - 1].low,
          ema21: ema21[i],
          atrPct,
          upBBPrev: bbBands.upper[i - 1],
          sqzReleased: (sqz[i - 2] ?? false) && !sqz[i],
          emaD50: dctx.emaD50, emaD50Prev: dctx.emaD50Prev, emaD200: dctx.emaD200,
          pdl: dctx.pdl,
          lockedLo: asian.lockedLo[i],
          cfg,
        });
        if (trig.fired && trig.type) {
          const rawSL = Math.min(c.low, candles[i - 1].low) - 0.25 * atrArr[i];
          pos = buildPosition(c.close, rawSL, trig.type, c.time, cfg);
        }
      }
    }

    peak = Math.max(peak, equity);
    const dd = ((peak - equity) / peak) * 100;
    maxDD = Math.max(maxDD, dd);
    equityCurve.push({ t: c.time, equity });
  }

  const wins = trades.filter(t => t.pnlUsd > 0).length;
  const losses = trades.filter(t => t.pnlUsd <= 0).length;
  const grossWin = trades.filter(t => t.pnlUsd > 0).reduce((a, t) => a + t.pnlUsd, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlUsd < 0).reduce((a, t) => a + t.pnlUsd, 0));
  const netPnlUsd = equity - initialEquity;

  return {
    trades,
    equityCurve,
    netPnlUsd,
    netPnlPct: (netPnlUsd / initialEquity) * 100,
    wins,
    losses,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    maxDrawdownPct: maxDD,
  };
}

/* ──────────── PineConnector formatting ──────────── */

export function buildPineConnectorEntry(
  license: string,
  brokerSymbol: string,
  pos: OpenPosition,
  riskPct: number,
  cfg: StrategyConfig,
): string {
  const pct3 = Math.max(0, 100 - cfg.pct1 - cfg.pct2);
  return [
    license,
    "buy",
    brokerSymbol,
    `risk=${riskPct}`,
    `sl=${pos.sl.toFixed(2)}`,
    `tp1=${pos.tp1.toFixed(2)}`,
    `tp1size=${cfg.pct1}`,
    `tp2=${pos.tp2.toFixed(2)}`,
    `tp2size=${cfg.pct2}`,
    `tp3=${pos.tp3.toFixed(2)}`,
    `tp3size=${pct3}`,
    "comment=v7TP3_entry",
  ].join(",");
}

export function buildPineConnectorBreakeven(license: string, brokerSymbol: string): string {
  return `${license},breakeven,${brokerSymbol},comment=v7TP3_BE`;
}

export function buildPineConnectorClose(license: string, brokerSymbol: string): string {
  return `${license},closelong,${brokerSymbol},comment=v7TP3_HAflip`;
}
