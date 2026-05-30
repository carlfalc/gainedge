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
  // symbol meta
  pipValuePerLot: number;   // USD per 1.0 lot per 1 unit price move (gold = 100)
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

function utcDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Aggregate intraday candles into UTC-day bars (ascending). */
export function aggregateDaily(candles: Candle[]): DailyBar[] {
  const days: DailyBar[] = [];
  let cur: DailyBar | null = null;
  for (const c of candles) {
    const key = utcDateKey(c.time);
    if (!cur || cur.date !== key) {
      if (cur) days.push(cur);
      cur = { time: c.time, date: key, open: c.open, high: c.high, low: c.low, close: c.close };
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
}

/** Build a daily series from already-daily bars (live engine) or pass intraday and aggregate. */
export function computeDailySeries(input: DailyBar[] | Candle[]): DailySeries {
  const bars: DailyBar[] = (input.length > 0 && "date" in (input[0] as DailyBar))
    ? (input as DailyBar[])
    : aggregateDaily(input as Candle[]);
  const closes = bars.map(b => b.close);
  return {
    bars,
    ema50: closes.length ? ema(closes, 50) : [],
    ema200: closes.length ? ema(closes, 200) : [],
  };
}

export interface DailyContext {
  emaD50: number;
  emaD50Prev: number;
  emaD200: number;
  pdl: number;     // previous completed day's low
}

/**
 * Daily context for an intraday bar, using only COMPLETED daily bars (the last daily bar
 * whose UTC date is strictly before the intraday bar's UTC date). This is the
 * non-repainting, lookahead-off equivalent of Pine's request.security("D", …).
 * Returns null when there is not enough daily history (need ≥2 completed days).
 */
export function dailyContextFor(ds: DailySeries, barTimeMs: number): DailyContext | null {
  const today = utcDateKey(barTimeMs);
  // last index with date < today
  let k = -1;
  for (let i = ds.bars.length - 1; i >= 0; i--) {
    if (ds.bars[i].date < today) { k = i; break; }
  }
  if (k < 1) return null;
  return {
    emaD50: ds.ema50[k],
    emaD50Prev: ds.ema50[k - 1],
    emaD200: ds.ema200[k],
    pdl: ds.bars[k].low,
  };
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
  tp1: number;
  tp2: number;
  tp3: number;
  beLevel: number;
  qty: number;
  qty1: number;
  qty2: number;
  qty3: number;
  filled1: boolean;
  filled2: boolean;
  filled3: boolean;
  beDone: boolean;
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

  // lots = risk_usd / (R * pip_value_per_lot)
  const totalQty = cfg.riskUsd / (r * cfg.pipValuePerLot);
  const pct3 = Math.max(0, 100 - cfg.pct1 - cfg.pct2);
  const qty1 = totalQty * (cfg.pct1 / 100);
  const qty2 = totalQty * (cfg.pct2 / 100);
  const qty3 = totalQty * (pct3 / 100);

  return {
    entry, sl: rawSL, tp1, tp2, tp3, beLevel,
    qty: totalQty, qty1, qty2, qty3,
    filled1: false, filled2: false, filled3: false, beDone: false,
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
 * NOTE on daily warmup: the daily series is aggregated from the same intraday window.
 * EMA50 converges within ~50 trading days; EMA200 needs ~200 and will be under-warmed
 * early in a short backtest window, so the close>emaD200 strong filter is approximate at
 * the start. The LIVE engine avoids this by fetching ~300 dedicated daily bars. Treat the
 * backtest as directional validation, not an exact reproduction of the TradingView report.
 */
export function runBacktest(
  candles: Candle[],
  cfg: StrategyConfig,
  initialEquity = 10_000,
): BacktestResult {
  const closes = candles.map(c => c.close);
  const ema21 = ema(closes, 21);
  const atrArr = atr(candles, 14);
  const bbBands = bb(closes, 20, 2);
  const sqz = squeezeSeries(candles, 20, 2, 1.5);
  const ha = toHA(candles);
  const asian = asianLockedSeries(candles, cfg);
  const ds = computeDailySeries(candles);

  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  let equity = initialEquity;
  let peak = equity;
  let maxDD = 0;
  let pos: OpenPosition | null = null;

  for (let i = 25; i < candles.length; i++) {
    const c = candles[i];

    // Manage existing position
    if (pos) {
      // SL hit first (conservative)
      if (c.low <= pos.sl) {
        const remaining = (pos.filled1 ? 0 : pos.qty1) + (pos.filled2 ? 0 : pos.qty2) + (pos.filled3 ? 0 : pos.qty3);
        const pnl = (pos.sl - pos.entry) * remaining * cfg.pipValuePerLot
          + (pos.filled1 ? (pos.tp1 - pos.entry) * pos.qty1 * cfg.pipValuePerLot : 0)
          + (pos.filled2 ? (pos.tp2 - pos.entry) * pos.qty2 * cfg.pipValuePerLot : 0);
        equity += pnl;
        trades.push({
          openedAt: pos.openedAt, closedAt: c.time, trigger: pos.trigger,
          entry: pos.entry, sl: pos.sl, tp1: pos.tp1, tp2: pos.tp2, tp3: pos.tp3,
          exitReason: pos.beDone ? "be_stop" : "sl", pnlUsd: pnl,
        });
        pos = null;
      } else {
        if (!pos.filled1 && c.high >= pos.tp1) pos.filled1 = true;
        if (!pos.filled2 && c.high >= pos.tp2) pos.filled2 = true;
        if (!pos.beDone && c.high >= pos.beLevel) { pos.sl = pos.entry; pos.beDone = true; }
        if (!pos.filled3 && c.high >= pos.tp3) {
          pos.filled3 = true;
          const pnl = (pos.tp1 - pos.entry) * pos.qty1 * cfg.pipValuePerLot
            + (pos.tp2 - pos.entry) * pos.qty2 * cfg.pipValuePerLot
            + (pos.tp3 - pos.entry) * pos.qty3 * cfg.pipValuePerLot;
          equity += pnl;
          trades.push({
            openedAt: pos.openedAt, closedAt: c.time, trigger: pos.trigger,
            entry: pos.entry, sl: pos.sl, tp1: pos.tp1, tp2: pos.tp2, tp3: pos.tp3,
            exitReason: "tp3", pnlUsd: pnl,
          });
          pos = null;
        } else if (pos && pos.beDone) {
          // HA-flip exit: two consecutive red HA bars
          const haRed = ha[i].close < ha[i].open;
          const haRedPrev = ha[i - 1].close < ha[i - 1].open;
          if (haRed && haRedPrev) {
            const exitPx = c.close;
            const remaining = (pos.filled3 ? 0 : pos.qty3) + (pos.filled2 ? 0 : pos.qty2) + (pos.filled1 ? 0 : pos.qty1);
            const pnl = (exitPx - pos.entry) * remaining * cfg.pipValuePerLot
              + (pos.filled1 ? (pos.tp1 - pos.entry) * pos.qty1 * cfg.pipValuePerLot : 0)
              + (pos.filled2 ? (pos.tp2 - pos.entry) * pos.qty2 * cfg.pipValuePerLot : 0);
            equity += pnl;
            trades.push({
              openedAt: pos.openedAt, closedAt: c.time, trigger: pos.trigger,
              entry: pos.entry, sl: pos.sl, tp1: pos.tp1, tp2: pos.tp2, tp3: pos.tp3,
              exitReason: "ha_flip", pnlUsd: pnl,
            });
            pos = null;
          }
        }
      }
    }

    // New entry only when flat
    if (!pos) {
      const dctx = dailyContextFor(ds, c.time);
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
