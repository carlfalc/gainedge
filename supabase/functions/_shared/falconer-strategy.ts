// Falconer v7 TP3 33-33-34 — TypeScript port of the Pine v5 strategy.
// Longs only. Pure functions: same module used by live engine and backtest.

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
  riskUsd: number;          // default 100
  rrTp1: number;            // 1.5
  rrTp2: number;            // 3
  rrTp3: number;            // 5
  beR: number;              // 1.0 — move SL to BE when price hits entry + beR * R
  pct1: number;             // 33
  pct2: number;             // 33  (pct3 = 100 - pct1 - pct2)
  // filters
  minAtrPct: number;        // 0.05  (% of price)
  maxAtrPct: number;        // 2.0
  pullbackTol: number;      // 0.25 * ATR allowance for pullback triggers
  // session
  asianStartHour: number;   // 0  UTC
  asianEndHour: number;     // 7  UTC
  // symbol meta
  pipValuePerLot: number;   // USD per 1.0 lot per 1 unit price move (gold = 100)
}

export const DEFAULT_CONFIG: StrategyConfig = {
  riskUsd: 100,
  rrTp1: 1.5,
  rrTp2: 3.0,
  rrTp3: 5.0,
  beR: 1.0,
  pct1: 33,
  pct2: 33,
  minAtrPct: 0.05,
  maxAtrPct: 2.0,
  pullbackTol: 0.25,
  asianStartHour: 0,
  asianEndHour: 7,
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
  const upper: number[] = [], lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += (values[j] - basis[i]) ** 2;
    const sd = Math.sqrt(sum / period);
    upper.push(basis[i] + mult * sd);
    lower.push(basis[i] - mult * sd);
  }
  return { basis, upper, lower };
}

export function kc(candles: Candle[], period: number, mult: number) {
  const closes = candles.map(c => c.close);
  const basis = ema(closes, period);
  const atrArr = atr(candles, period);
  const upper = basis.map((b, i) => b + mult * atrArr[i]);
  const lower = basis.map((b, i) => b - mult * atrArr[i]);
  return { basis, upper, lower };
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

/* ──────────── Trigger evaluation ──────────── */

export type TriggerType = "tpLong" | "sqzUp" | "swPDL" | "swAL";

export interface TriggerResult {
  fired: boolean;
  type?: TriggerType;
}

/**
 * Falconer v7 long triggers, evaluated on bar i (closed bar).
 * Returns first matching trigger, mirroring Pine precedence.
 * Inputs are already-computed series so this stays O(1) per bar in backtests.
 */
export interface BarContext {
  i: number;
  haGreen: boolean;
  haGreenPrev: boolean;
  close: number;
  closePrev: number;
  low: number;
  ema9: number;
  ema21: number;
  ema9Prev: number;
  ema21Prev: number;
  atrVal: number;
  squeezeOn: boolean;
  squeezeOnPrev: boolean;
  asianHigh: number | null;
  pdl: number | null;
  cfg: StrategyConfig;
}

export function evaluateLongTrigger(ctx: BarContext): TriggerResult {
  const {
    haGreen, haGreenPrev, close, closePrev, low,
    ema9, ema21, ema9Prev, ema21Prev, atrVal,
    squeezeOn, squeezeOnPrev, asianHigh, pdl, cfg,
  } = ctx;

  if (!haGreen) return { fired: false };

  // Trend filter: 9 EMA above 21 EMA, price above 9 EMA
  const trendUp = ema9 > ema21 && close > ema9;

  // 1) tpLong — trend pullback to EMA9, HA flips green
  if (trendUp && haGreen && !haGreenPrev) {
    const touchedEma = low <= ema9 + cfg.pullbackTol * atrVal;
    if (touchedEma) return { fired: true, type: "tpLong" };
  }

  // 2) sqzUp — squeeze release upward
  if (squeezeOnPrev && !squeezeOn && close > ema21 && haGreen) {
    return { fired: true, type: "sqzUp" };
  }

  // 3) swPDL — sweep previous day low and reclaim
  if (pdl !== null && low < pdl && close > pdl && haGreen) {
    return { fired: true, type: "swPDL" };
  }

  // 4) swAL — sweep Asian low (using asianHigh as session ref; Pine v7 sweeps asianLow)
  if (asianHigh !== null && close > asianHigh && closePrev <= asianHigh && haGreen) {
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

/* ──────────── Session helpers ──────────── */

/** Returns the Asian-session high seen so far for the UTC day of `bar`. */
export function asianSessionHigh(candles: Candle[], i: number, cfg: StrategyConfig): number | null {
  const day = new Date(candles[i].time).getUTCDate();
  let hi: number | null = null;
  for (let j = i; j >= 0; j--) {
    const d = new Date(candles[j].time);
    if (d.getUTCDate() !== day) break;
    const h = d.getUTCHours();
    if (h >= cfg.asianStartHour && h < cfg.asianEndHour) {
      hi = hi === null ? candles[j].high : Math.max(hi, candles[j].high);
    }
  }
  return hi;
}

/** Previous-day low based on UTC day boundary. */
export function previousDayLow(candles: Candle[], i: number): number | null {
  const todayDay = new Date(candles[i].time).getUTCDate();
  let prevDay: number | null = null;
  let low: number | null = null;
  for (let j = i; j >= 0; j--) {
    const d = new Date(candles[j].time).getUTCDate();
    if (d === todayDay) continue;
    if (prevDay === null) prevDay = d;
    if (d !== prevDay) break;
    low = low === null ? candles[j].low : Math.min(low, candles[j].low);
  }
  return low;
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

export function runBacktest(
  candles: Candle[],
  cfg: StrategyConfig,
  initialEquity = 10_000,
): BacktestResult {
  const closes = candles.map(c => c.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const atrArr = atr(candles, 14);
  const bbBands = bb(closes, 20, 2);
  const kcBands = kc(candles, 20, 1.5);
  const ha = toHA(candles);

  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  let equity = initialEquity;
  let peak = equity;
  let maxDD = 0;
  let pos: OpenPosition | null = null;

  for (let i = 25; i < candles.length; i++) {
    const c = candles[i];
    const squeezeOn = bbBands.upper[i] < kcBands.upper[i] && bbBands.lower[i] > kcBands.lower[i];
    const squeezeOnPrev = bbBands.upper[i - 1] < kcBands.upper[i - 1] && bbBands.lower[i - 1] > kcBands.lower[i - 1];

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
      const atrPct = (atrArr[i] / c.close) * 100;
      if (atrPct >= cfg.minAtrPct && atrPct <= cfg.maxAtrPct) {
        const trig = evaluateLongTrigger({
          i,
          haGreen: ha[i].close > ha[i].open,
          haGreenPrev: ha[i - 1].close > ha[i - 1].open,
          close: c.close, closePrev: candles[i - 1].close, low: c.low,
          ema9: ema9[i], ema21: ema21[i],
          ema9Prev: ema9[i - 1], ema21Prev: ema21[i - 1],
          atrVal: atrArr[i],
          squeezeOn, squeezeOnPrev,
          asianHigh: asianSessionHigh(candles, i, cfg),
          pdl: previousDayLow(candles, i),
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