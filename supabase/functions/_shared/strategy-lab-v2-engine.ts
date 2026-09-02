import {
  DEFAULT_STRATEGY_LAB_V2_COSTS,
  STRATEGY_LAB_V2_CHECKPOINT_VERSION,
  STRATEGY_LAB_V2_GATES,
  STRATEGY_LAB_V2_SEARCH_AGENTS,
  strategyLabV2CheckpointComplete,
  strategyLabV2ChunkSize,
  strategyLabV2EliteCount,
  strategyLabV2PlannedGenerations,
  type StrategyGenomeV2,
  type StrategyLabV2AgentBest,
  type StrategyLabV2AgentCheckpoint,
  type StrategyLabV2AgentId,
  type StrategyLabV2Audit,
  type StrategyLabV2CandidateResult,
  type StrategyLabV2Costs,
  type StrategyLabV2Elite,
  type StrategyLabV2Family,
  type StrategyLabV2FoldResult,
  type StrategyLabV2Metrics,
  type StrategyLabV2Trade,
  type StrategyLabV2Verdict,
} from "./strategy-lab-v2-contracts.ts";

export interface StrategyLabV2Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorsV2 {
  emaFast: number[];
  emaSlow: number[];
  atr: number[];
  rsi: number[];
  macdHistogram: number[];
  roc: number[];
  mean: number[];
  std: number[];
  volumeMean: number[];
}

/**
 * Everything a genome needs from a candle series, computed exactly once per genome.
 * Previously each of the five walk-forward folds recomputed the full indicator set and
 * rescanned `lookback` bars per candle, which is what pushed one agent past the hosted
 * CPU ceiling. The values produced here are identical to the per-fold computation.
 */
interface GenomeContextV2 {
  set: IndicatorsV2;
  priorHigh: number[];
  priorLow: number[];
}

export interface SearchAgentOutputV2 {
  agent_id: StrategyLabV2AgentId;
  seed: number;
  budget: number;
  generated: number;
  tested: number;
  rejected: number;
  generations: number;
  candidates: StrategyLabV2CandidateResult[];
  best: StrategyLabV2CandidateResult | null;
}

export interface StrategyLabV2GenerationOutput {
  agent_id: StrategyLabV2AgentId;
  generation: number;
  evaluated: StrategyLabV2CandidateResult[];
  checkpoint: StrategyLabV2AgentCheckpoint;
  complete: boolean;
}


export interface FinalStrategyV2 {
  verdict: StrategyLabV2Verdict;
  reasons: string[];
  selected: StrategyLabV2CandidateResult | null;
  holdout_metrics: StrategyLabV2Metrics | null;
  stress_metrics: Array<{ scenario: string; metrics: StrategyLabV2Metrics }>;
  probability_pf_above_one: number;
  probability_expectancy_above_zero: number;
  trades: StrategyLabV2Trade[];
  exact_rules: string[];
}

const round = (value: number, digits = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  int(low: number, high: number): number {
    return Math.floor(this.next() * (high - low + 1)) + low;
  }
  float(low: number, high: number, step = 0.05): number {
    return round(Math.round((low + this.next() * (high - low)) / step) * step, 4);
  }
  pick<T>(values: readonly T[]): T {
    return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))];
  }
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

function ema(values: number[], period: number): number[] {
  const output = new Array<number>(values.length);
  if (!values.length) return output;
  const alpha = 2 / (period + 1);
  output[0] = values[0];
  for (let i = 1; i < values.length; i += 1) {
    output[i] = values[i] * alpha + output[i - 1] * (1 - alpha);
  }
  return output;
}

function rollingMean(values: number[], period: number): number[] {
  const output = new Array<number>(values.length).fill(Number.NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) output[i] = sum / period;
  }
  return output;
}

function rollingStd(values: number[], period: number, mean: number[]): number[] {
  const output = new Array<number>(values.length).fill(Number.NaN);
  let sum = 0;
  let square = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    square += values[i] ** 2;
    if (i >= period) {
      sum -= values[i - period];
      square -= values[i - period] ** 2;
    }
    if (i >= period - 1) {
      output[i] = Math.sqrt(Math.max(0, square / period - mean[i] ** 2));
    }
  }
  return output;
}

function atr(candles: StrategyLabV2Candle[], period: number): number[] {
  const trueRange = candles.map((bar, index) => index === 0
    ? bar.high - bar.low
    : Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - candles[index - 1].close),
      Math.abs(bar.low - candles[index - 1].close),
    ));
  return ema(trueRange, period);
}

function rsi(values: number[], period: number): number[] {
  const gains = new Array<number>(values.length).fill(0);
  const losses = new Array<number>(values.length).fill(0);
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    gains[i] = Math.max(0, delta);
    losses[i] = Math.max(0, -delta);
  }
  const averageGain = ema(gains, period);
  const averageLoss = ema(losses, period);
  return values.map((_, index) => averageLoss[index] === 0
    ? (averageGain[index] === 0 ? 50 : 100)
    : 100 - 100 / (1 + averageGain[index] / averageLoss[index]));
}

function indicators(candles: StrategyLabV2Candle[], genome: StrategyGenomeV2): IndicatorsV2 {
  const closes = candles.map((bar) => bar.close);
  const volumes = candles.map((bar) => bar.volume);
  const fastMacd = ema(closes, genome.macd_fast);
  const slowMacd = ema(closes, genome.macd_slow);
  const macd = fastMacd.map((value, index) => value - slowMacd[index]);
  const macdSignal = ema(macd, genome.macd_signal);
  const mean = rollingMean(closes, genome.bollinger_period);
  return {
    emaFast: ema(closes, genome.fast_ema),
    emaSlow: ema(closes, genome.slow_ema),
    atr: atr(candles, genome.atr_period),
    rsi: rsi(closes, genome.rsi_period),
    macdHistogram: macd.map((value, index) => value - macdSignal[index]),
    roc: closes.map((value, index) => index < genome.roc_period
      ? 0
      : (value / closes[index - genome.roc_period] - 1) * 100),
    mean,
    std: rollingStd(closes, genome.bollinger_period, mean),
    volumeMean: rollingMean(volumes, 20),
  };
}

/**
 * `output[i]` is the extreme of `values[max(0, i - lookback) .. i - 1]`, i.e. the strictly
 * prior window, and ±Infinity when that window is empty. A monotonic deque produces the
 * same values as rescanning the window per bar, in O(n) instead of O(n * lookback).
 */
function trailingExtremes(values: number[], lookback: number, mode: "max" | "min"): number[] {
  const length = values.length;
  const output = new Array<number>(length);
  const empty = mode === "max" ? -Infinity : Infinity;
  if (!length) return output;
  const window = Math.max(1, Math.floor(lookback));
  const deque = new Int32Array(length);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < length; i += 1) {
    while (head < tail && deque[head] < i - window) head += 1;
    output[i] = head < tail ? values[deque[head]] : empty;
    const value = values[i];
    while (head < tail && (mode === "max" ? values[deque[tail - 1]] <= value : values[deque[tail - 1]] >= value)) {
      tail -= 1;
    }
    deque[tail] = i;
    tail += 1;
  }
  return output;
}

function prepareGenomeContext(candles: StrategyLabV2Candle[], genome: StrategyGenomeV2): GenomeContextV2 {
  return {
    set: indicators(candles, genome),
    priorHigh: trailingExtremes(candles.map((bar) => bar.high), genome.lookback, "max"),
    priorLow: trailingExtremes(candles.map((bar) => bar.low), genome.lookback, "min"),
  };
}


function directionAllowed(genome: StrategyGenomeV2, direction: "long" | "short") {
  return genome.direction === "both" || genome.direction === direction;
}

function timeAllowed(genome: StrategyGenomeV2, time: number): boolean {
  if (genome.utc_start_hour == null || genome.utc_end_hour == null) return true;
  const hour = new Date(time).getUTCHours();
  return genome.utc_start_hour <= genome.utc_end_hour
    ? hour >= genome.utc_start_hour && hour < genome.utc_end_hour
    : hour >= genome.utc_start_hour || hour < genome.utc_end_hour;
}

function confirmationAllowed(
  direction: "long" | "short",
  index: number,
  genome: StrategyGenomeV2,
  set: IndicatorsV2,
  candle: StrategyLabV2Candle,
): boolean {
  if (genome.confirmation === "none") return true;
  if (genome.confirmation === "rsi") {
    return direction === "long" ? set.rsi[index] > 50 : set.rsi[index] < 50;
  }
  if (genome.confirmation === "macd") {
    return direction === "long"
      ? set.macdHistogram[index] > 0
      : set.macdHistogram[index] < 0;
  }
  return Number.isFinite(set.volumeMean[index]) && candle.volume > 0 &&
    candle.volume >= set.volumeMean[index] * genome.volume_multiplier;
}

function signalAt(
  candles: StrategyLabV2Candle[],
  index: number,
  genome: StrategyGenomeV2,
  context: GenomeContextV2,
): "long" | "short" | null {
  if (!timeAllowed(genome, candles[index].time)) return null;
  const set = context.set;
  const candle = candles[index];
  const previous = candles[index - 1];
  const trendUp = set.emaFast[index] > set.emaSlow[index];
  const trendDown = set.emaFast[index] < set.emaSlow[index];
  const high = context.priorHigh[index];
  const low = context.priorLow[index];
  const range = high - low;
  const atrNow = Math.max(Number.EPSILON, set.atr[index]);

  let signal: "long" | "short" | null = null;

  switch (genome.family) {
    case "ema_cross":
      if (set.emaFast[index] > set.emaSlow[index] && set.emaFast[index - 1] <= set.emaSlow[index - 1]) signal = "long";
      else if (set.emaFast[index] < set.emaSlow[index] && set.emaFast[index - 1] >= set.emaSlow[index - 1]) signal = "short";
      break;
    case "trend_pullback":
      if (trendUp && candle.low <= set.emaFast[index] + atrNow * 0.2 && candle.close > set.emaFast[index]) signal = "long";
      else if (trendDown && candle.high >= set.emaFast[index] - atrNow * 0.2 && candle.close < set.emaFast[index]) signal = "short";
      break;
    case "donchian_breakout":
      if (candle.close > high && previous.close <= high) signal = "long";
      else if (candle.close < low && previous.close >= low) signal = "short";
      break;
    case "volatility_breakout":
      if (candle.close > high && candle.high - candle.low > atrNow * 1.2) signal = "long";
      else if (candle.close < low && candle.high - candle.low > atrNow * 1.2) signal = "short";
      break;
    case "bollinger_reversion": {
      const upper = set.mean[index] + set.std[index] * genome.bollinger_std;
      const lower = set.mean[index] - set.std[index] * genome.bollinger_std;
      if (candle.close < lower && set.rsi[index] <= genome.oversold) signal = "long";
      else if (candle.close > upper && set.rsi[index] >= genome.overbought) signal = "short";
      break;
    }
    case "rsi_reversion":
      if (set.rsi[index - 1] <= genome.oversold && set.rsi[index] > genome.oversold) signal = "long";
      else if (set.rsi[index - 1] >= genome.overbought && set.rsi[index] < genome.overbought) signal = "short";
      break;
    case "macd_momentum":
      if (set.macdHistogram[index] > 0 && set.macdHistogram[index - 1] <= 0) signal = "long";
      else if (set.macdHistogram[index] < 0 && set.macdHistogram[index - 1] >= 0) signal = "short";
      break;
    case "roc_momentum":
      if (set.roc[index] > 0 && set.roc[index - 1] <= 0) signal = "long";
      else if (set.roc[index] < 0 && set.roc[index - 1] >= 0) signal = "short";
      break;
    case "liquidity_sweep":
      if (candle.low < low && candle.close > low && candle.close > candle.open) signal = "long";
      else if (candle.high > high && candle.close < high && candle.close < candle.open) signal = "short";
      break;
    case "fibonacci_pullback":
      if (range > 0 && trendUp && candle.low <= high - range * 0.5 && candle.close >= high - range * 0.618 && candle.close > candle.open) signal = "long";
      else if (range > 0 && trendDown && candle.high >= low + range * 0.5 && candle.close <= low + range * 0.618 && candle.close < candle.open) signal = "short";
      break;
    case "relative_volume_breakout": {
      const volumeReady = Number.isFinite(set.volumeMean[index]) && candle.volume > 0 &&
        candle.volume >= set.volumeMean[index] * genome.volume_multiplier;
      if (volumeReady && candle.close > high) signal = "long";
      else if (volumeReady && candle.close < low) signal = "short";
      break;
    }
    case "hybrid_composer":
      if (trendUp && candle.close > high && set.macdHistogram[index] > 0 && set.rsi[index] > 50) signal = "long";
      else if (trendDown && candle.close < low && set.macdHistogram[index] < 0 && set.rsi[index] < 50) signal = "short";
      break;
  }

  if (!signal || !directionAllowed(genome, signal)) return null;
  if (genome.trend_filter && ((signal === "long" && !trendUp) || (signal === "short" && !trendDown))) return null;
  return confirmationAllowed(signal, index, genome, set, candle) ? signal : null;
}

function emptyMetrics(): StrategyLabV2Metrics {
  return {
    trades: 0, wins: 0, losses: 0, win_rate: 0, win_rate_lower_95: 0,
    profit_factor: 0, expectancy_r: 0, net_return_pct: 0,
    max_drawdown_pct: 0, average_win_r: 0, average_loss_r: 0,
    longest_losing_streak: 0,
  };
}

function metricsFromTrades(trades: StrategyLabV2Trade[], riskFraction = 0.01): StrategyLabV2Metrics {
  if (!trades.length) return emptyMetrics();
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let lossStreak = 0;
  let longestLossStreak = 0;
  const winners: number[] = [];
  const losers: number[] = [];
  for (const trade of trades) {
    equity *= Math.max(0.01, 1 + riskFraction * trade.net_r);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak * 100);
    if (trade.net_r > 0) {
      grossProfit += trade.net_r;
      winners.push(trade.net_r);
      lossStreak = 0;
    } else {
      grossLoss += Math.abs(trade.net_r);
      losers.push(trade.net_r);
      lossStreak += 1;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    }
  }
  const wins = winners.length;
  const winRate = wins / trades.length;
  const z = 1.959964;
  const denominator = 1 + z * z / trades.length;
  const center = winRate + z * z / (2 * trades.length);
  const margin = z * Math.sqrt((winRate * (1 - winRate) + z * z / (4 * trades.length)) / trades.length);
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    win_rate: round(winRate * 100, 2),
    win_rate_lower_95: round(Math.max(0, (center - margin) / denominator) * 100, 2),
    profit_factor: round(grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0, 3),
    expectancy_r: round(trades.reduce((sum, trade) => sum + trade.net_r, 0) / trades.length, 4),
    net_return_pct: round((equity - 1) * 100, 2),
    max_drawdown_pct: round(maxDrawdown, 2),
    average_win_r: round(winners.length ? winners.reduce((a, b) => a + b, 0) / winners.length : 0, 3),
    average_loss_r: round(losers.length ? losers.reduce((a, b) => a + b, 0) / losers.length : 0, 3),
    longest_losing_streak: longestLossStreak,
  };
}

function simulate(
  candles: StrategyLabV2Candle[],
  genome: StrategyGenomeV2,
  start: number,
  end: number,
  costs: StrategyLabV2Costs,
  entryDelay = 0,
  precomputed?: GenomeContextV2,
): StrategyLabV2Trade[] {
  const context = precomputed ?? prepareGenomeContext(candles, genome);
  const set = context.set;
  const trades: StrategyLabV2Trade[] = [];
  const warmup = Math.max(genome.slow_ema, genome.lookback, genome.bollinger_period, genome.macd_slow + genome.macd_signal, 30);
  for (let signalIndex = Math.max(start, warmup); signalIndex < end - 1 - entryDelay;) {
    const direction = signalAt(candles, signalIndex, genome, context);
    if (!direction) { signalIndex += 1; continue; }

    const entryIndex = signalIndex + 1 + entryDelay;
    const entry = candles[entryIndex].open;
    const stopDistance = set.atr[signalIndex] * genome.stop_atr;
    if (!(entry > 0) || !(stopDistance > 0)) { signalIndex += 1; continue; }
    let stop = direction === "long" ? entry - stopDistance : entry + stopDistance;
    const target = direction === "long"
      ? entry + stopDistance * genome.reward_risk
      : entry - stopDistance * genome.reward_risk;
    const lastIndex = Math.min(end - 1, entryIndex + genome.max_bars);
    let exitIndex = lastIndex;
    let exit = candles[lastIndex].close;
    let grossR = direction === "long" ? (exit - entry) / stopDistance : (entry - exit) / stopDistance;
    let exitReason: StrategyLabV2Trade["exit_reason"] = lastIndex === end - 1 ? "segment_end" : "time_stop";

    for (let i = entryIndex; i <= lastIndex; i += 1) {
      const bar = candles[i];
      if (genome.break_even_r != null) {
        const reached = direction === "long"
          ? bar.high >= entry + stopDistance * genome.break_even_r
          : bar.low <= entry - stopDistance * genome.break_even_r;
        if (reached) stop = direction === "long" ? Math.max(stop, entry) : Math.min(stop, entry);
      }
      if (genome.exit_model === "trailing_atr" && i > entryIndex) {
        const trail = set.atr[i] * genome.stop_atr;
        stop = direction === "long"
          ? Math.max(stop, bar.close - trail)
          : Math.min(stop, bar.close + trail);
      }
      const gapStop = direction === "long" ? bar.open <= stop : bar.open >= stop;
      const stopHit = direction === "long" ? bar.low <= stop : bar.high >= stop;
      const targetHit = direction === "long" ? bar.high >= target : bar.low <= target;
      if (gapStop || stopHit) {
        exitIndex = i;
        exit = gapStop ? bar.open : stop;
        grossR = direction === "long" ? (exit - entry) / stopDistance : (entry - exit) / stopDistance;
        exitReason = genome.exit_model === "trailing_atr" ? "trailing_stop" : "stop";
        break;
      }
      if (targetHit) {
        exitIndex = i;
        exit = target;
        grossR = genome.reward_risk;
        exitReason = "target";
        break;
      }
    }
    const roundTripBps = costs.spread_bps + 2 * (costs.commission_bps + costs.slippage_bps);
    const costR = (entry * roundTripBps / 10_000) / stopDistance;
    trades.push({
      direction, signal_time: candles[signalIndex].time,
      opened_at: candles[entryIndex].time, closed_at: candles[exitIndex].time,
      entry: round(entry), exit: round(exit), stop: round(stop), target: round(target),
      gross_r: round(grossR, 4), cost_r: round(costR, 4), net_r: round(grossR - costR, 4),
      exit_reason: exitReason,
    });
    signalIndex = Math.max(signalIndex + 1, exitIndex + 1);
  }
  return trades;
}

export function auditStrategyLabV2Candles(candles: StrategyLabV2Candle[]): StrategyLabV2Audit {
  let duplicates = 0;
  let invalidRows = 0;
  let outOfOrder = 0;
  const seen = new Set<number>();
  const intervals: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const bar = candles[i];
    if (seen.has(bar.time)) duplicates += 1;
    seen.add(bar.time);
    if (i > 0) {
      const interval = bar.time - candles[i - 1].time;
      if (interval <= 0) outOfOrder += 1;
      else intervals.push(interval);
    }
    if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
      bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) ||
      bar.low > bar.high || bar.volume < 0) invalidRows += 1;
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const largeGaps = median ? intervals.filter((value) => value > median * 4).length : 0;
  const holdoutStart = Math.floor(candles.length * 0.85);
  const warnings: string[] = [];
  if (candles.length < STRATEGY_LAB_V2_GATES.minimum_candles) warnings.push("minimum_candles_not_reached");
  if (duplicates) warnings.push("duplicate_timestamps");
  if (invalidRows) warnings.push("invalid_rows");
  if (outOfOrder) warnings.push("out_of_order_timestamps");
  if (largeGaps) warnings.push("large_gaps_require_venue_classification");
  return {
    candles: candles.length,
    first_candle: candles[0]?.time ?? null,
    last_candle: candles.at(-1)?.time ?? null,
    duplicates,
    invalid_rows: invalidRows,
    out_of_order: outOfOrder,
    large_gaps: largeGaps,
    inferred_interval_minutes: median ? round(median / 60_000, 2) : null,
    development_end_index: holdoutStart,
    holdout_start_index: holdoutStart,
    sufficient_for_search: candles.length >= STRATEGY_LAB_V2_GATES.minimum_candles && !duplicates && !invalidRows && !outOfOrder,
    warnings,
  };
}

function canonicalGenome(genome: StrategyGenomeV2): string {
  return JSON.stringify(Object.fromEntries(Object.entries(genome).sort(([a], [b]) => a.localeCompare(b))));
}

function hashGenome(genome: StrategyGenomeV2): string {
  const text = canonicalGenome(genome);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sl2_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function randomGenome(families: readonly StrategyLabV2Family[], rng: SeededRandom): StrategyGenomeV2 {
  const fast = rng.int(3, 60);
  const slow = rng.int(Math.max(fast + 5, 20), 300);
  const macdFast = rng.int(3, 30);
  const macdSlow = rng.int(Math.max(macdFast + 3, 10), 80);
  const useWindow = rng.bool(0.3);
  const startHour = useWindow ? rng.int(0, 20) : null;
  return {
    family: rng.pick(families),
    direction: rng.pick(["both", "long", "short"] as const),
    fast_ema: fast,
    slow_ema: slow,
    lookback: rng.int(5, 240),
    atr_period: rng.int(5, 60),
    stop_atr: rng.float(0.5, 4, 0.1),
    reward_risk: rng.float(0.5, 6, 0.1),
    rsi_period: rng.int(3, 40),
    oversold: rng.int(15, 45),
    overbought: rng.int(55, 85),
    volume_multiplier: rng.float(1.05, 3.5, 0.05),
    max_bars: rng.int(4, 240),
    bollinger_period: rng.int(8, 80),
    bollinger_std: rng.float(1, 3.5, 0.1),
    macd_fast: macdFast,
    macd_slow: macdSlow,
    macd_signal: rng.int(2, 25),
    roc_period: rng.int(2, 60),
    trend_filter: rng.bool(0.65),
    confirmation: rng.pick(["none", "rsi", "macd", "volume"] as const),
    exit_model: rng.pick(["fixed_target", "trailing_atr"] as const),
    break_even_r: rng.bool(0.55) ? rng.float(0.5, 2.5, 0.1) : null,
    utc_start_hour: startHour,
    utc_end_hour: startHour == null ? null : (startHour + rng.int(3, 12)) % 24,
  };
}

function mutateGenome(parent: StrategyGenomeV2, families: readonly StrategyLabV2Family[], rng: SeededRandom): StrategyGenomeV2 {
  const fresh = randomGenome(families, rng);
  const child = { ...parent };
  for (const key of Object.keys(child) as Array<keyof StrategyGenomeV2>) {
    if (rng.bool(0.18)) (child as unknown as Record<string, unknown>)[key] = fresh[key];
  }
  child.family = rng.bool(0.08) ? rng.pick(families) : parent.family;
  if (child.slow_ema <= child.fast_ema) child.slow_ema = Math.min(300, child.fast_ema + 5);
  if (child.overbought <= child.oversold) child.overbought = Math.min(90, child.oversold + 20);
  if (child.macd_slow <= child.macd_fast) child.macd_slow = Math.min(80, child.macd_fast + 3);
  return child;
}

function crossover(a: StrategyGenomeV2, b: StrategyGenomeV2, rng: SeededRandom): StrategyGenomeV2 {
  const child = { ...a };
  for (const key of Object.keys(child) as Array<keyof StrategyGenomeV2>) {
    if (rng.bool()) (child as unknown as Record<string, unknown>)[key] = b[key];
  }
  child.family = rng.bool() ? a.family : b.family;
  if (child.slow_ema <= child.fast_ema) child.slow_ema = Math.min(300, child.fast_ema + 5);
  if (child.macd_slow <= child.macd_fast) child.macd_slow = Math.min(80, child.macd_fast + 3);
  return child;
}

function candidateScore(metrics: StrategyLabV2Metrics, positiveFoldRatio: number, complexity: number): number {
  if (metrics.trades < 12 || metrics.expectancy_r <= -0.15) return -1_000 + metrics.trades;
  const pf = clamp(Math.log(Math.max(0.2, metrics.profit_factor)), -1.5, 1.5);
  const expectancy = clamp(metrics.expectancy_r, -1, 2);
  const returnDrawdown = metrics.net_return_pct / Math.max(5, metrics.max_drawdown_pct);
  const reliability = Math.min(1, metrics.trades / 100);
  return round(100 * reliability * (
    pf * 0.28 + expectancy * 0.24 + clamp(returnDrawdown / 2, -1, 1) * 0.16 +
    (metrics.win_rate_lower_95 / 100) * 0.12 + positiveFoldRatio * 0.2
  ) - complexity * 0.5, 3);
}

function evaluateGenome(
  candles: StrategyLabV2Candle[],
  genome: StrategyGenomeV2,
  costs: StrategyLabV2Costs,
  generation: number,
  parents: string[] = [],
  entryDelay = 0,
): { result: StrategyLabV2CandidateResult; trades: StrategyLabV2Trade[] } {
  const folds: StrategyLabV2FoldResult[] = [];
  const allTrades: StrategyLabV2Trade[] = [];
  const foldCount = 5;
  const foldSize = Math.max(100, Math.floor(candles.length * 0.1));
  const firstFold = Math.max(0, candles.length - foldCount * foldSize);
  const embargo = Math.min(Math.max(genome.lookback, genome.max_bars, genome.slow_ema), Math.floor(foldSize * 0.15));
  // One context for all five folds: the indicator series and trailing extremes depend on
  // the genome and the candle series only, never on the fold window.
  const context = prepareGenomeContext(candles, genome);
  for (let fold = 0; fold < foldCount; fold += 1) {
    const start = firstFold + fold * foldSize + embargo;
    const end = Math.min(candles.length, firstFold + (fold + 1) * foldSize);
    const trades = start < end ? simulate(candles, genome, start, end, costs, entryDelay, context) : [];
    allTrades.push(...trades);
    folds.push({ fold: fold + 1, start_index: start, end_index: end, metrics: metricsFromTrades(trades) });
  }
  const metrics = metricsFromTrades(allTrades);
  const positiveFoldRatio = folds.filter((fold) => fold.metrics.expectancy_r > 0 && fold.metrics.profit_factor > 1).length / folds.length;
  const reasons: string[] = [];
  if (metrics.trades < 30) reasons.push("insufficient_development_oos_trades");
  if (metrics.profit_factor <= 1) reasons.push("development_profit_factor_not_above_one");
  if (metrics.expectancy_r <= 0) reasons.push("development_expectancy_not_positive");
  if (positiveFoldRatio < 0.4) reasons.push("fold_consistency_too_low");
  const complexity = 1 + Number(genome.trend_filter) + Number(genome.confirmation !== "none") +
    Number(genome.break_even_r != null) + Number(genome.utc_start_hour != null) +
    Number(genome.exit_model === "trailing_atr");
  const result: StrategyLabV2CandidateResult = {
    candidate_hash: hashGenome(genome), generation, parent_hashes: parents,
    genome, score: candidateScore(metrics, positiveFoldRatio, complexity), metrics,
    folds, positive_fold_ratio: round(positiveFoldRatio, 3),
    disqualified: reasons.length > 0, disqualification_reasons: reasons,
  };
  return { result, trades: allTrades };
}

function agentFamilies(agentId: StrategyLabV2AgentId): readonly StrategyLabV2Family[] {
  const definition = STRATEGY_LAB_V2_SEARCH_AGENTS.find((agent) => agent.agent_id === agentId);
  if (!definition) throw new Error(`unknown_agent:${agentId}`);
  return definition.families as readonly StrategyLabV2Family[];
}

/**
 * Per-generation RNG seed. Deriving it from (agent seed, generation) instead of carrying a
 * live RNG stream is what makes an interrupted generation replayable: rerunning generation
 * N with the same persisted elites reproduces exactly the same population.
 */
function generationSeed(seed: number, generation: number): number {
  let x = (Math.abs(Math.trunc(seed)) >>> 0) ^ Math.imul(generation >>> 0, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) >>> 0;
  return x || 0x9e3779b9;
}

const byScoreThenHash = (a: { score: number; candidate_hash: string }, b: { score: number; candidate_hash: string }) =>
  b.score - a.score || a.candidate_hash.localeCompare(b.candidate_hash);

export function createStrategyLabV2Checkpoint(options: {
  agentId: StrategyLabV2AgentId;
  seed: number;
  budget: number;
  generations: number;
  seen?: string[];
  elites?: StrategyLabV2Elite[];
  tested?: number;
  generated?: number;
  rejected?: number;
  best?: StrategyLabV2AgentBest | null;
}): StrategyLabV2AgentCheckpoint {
  agentFamilies(options.agentId);
  const budget = Math.max(1, Math.floor(options.budget));
  const chunkSize = strategyLabV2ChunkSize(budget, options.generations);
  const seen = [...new Set(options.seen ?? [])];
  return {
    checkpoint_version: STRATEGY_LAB_V2_CHECKPOINT_VERSION,
    agent_id: options.agentId,
    seed: Math.abs(Math.trunc(options.seed)) >>> 0,
    budget,
    planned_generations: strategyLabV2PlannedGenerations(budget, options.generations),
    chunk_size: chunkSize,
    completed_generations: 0,
    generated: options.generated ?? seen.length,
    tested: options.tested ?? seen.length,
    rejected: options.rejected ?? 0,
    seen,
    elites: (options.elites ?? []).slice(0, strategyLabV2EliteCount(chunkSize)),
    best: options.best ?? null,
  };
}

/**
 * Evaluates exactly one generation — at most `chunk_size` (<= 64) genomes — and returns an
 * advanced checkpoint. The input checkpoint is never mutated, so a caller that fails to
 * persist the result simply replays the identical generation on the next invocation.
 */
export function runStrategyLabV2Generation(
  candles: StrategyLabV2Candle[],
  checkpoint: StrategyLabV2AgentCheckpoint,
  costs: StrategyLabV2Costs = DEFAULT_STRATEGY_LAB_V2_COSTS,
): StrategyLabV2GenerationOutput {
  if (strategyLabV2CheckpointComplete(checkpoint)) {
    return {
      agent_id: checkpoint.agent_id,
      generation: checkpoint.completed_generations,
      evaluated: [],
      checkpoint: { ...checkpoint, seen: [...checkpoint.seen], elites: [...checkpoint.elites] },
      complete: true,
    };
  }
  const families = agentFamilies(checkpoint.agent_id);
  const generation = checkpoint.completed_generations + 1;
  const target = Math.min(checkpoint.chunk_size, checkpoint.budget - checkpoint.tested);
  const rng = new SeededRandom(generationSeed(checkpoint.seed, generation));
  const seen = new Set(checkpoint.seen);
  const elites = checkpoint.elites;
  const population: Array<{ genome: StrategyGenomeV2; parents: string[] }> = [];
  let generated = 0;

  // Generation 1 (and any generation with no surviving elites) seeds a deterministic random
  // population. Later generations cross and mutate the persisted elites, falling back to
  // fresh random genomes only if the elite neighbourhood is exhausted, so the advertised
  // budget is always reached exactly.
  const eliteAttempts = elites.length ? target * 60 : 0;
  for (let attempt = 0; attempt < eliteAttempts && population.length < target; attempt += 1) {
    const parentA = rng.pick(elites);
    const parentB = rng.pick(elites);
    const genome = mutateGenome(crossover(parentA.genome, parentB.genome, rng), families, rng);
    generated += 1;
    const hash = hashGenome(genome);
    if (seen.has(hash)) continue;
    seen.add(hash);
    population.push({ genome, parents: [parentA.candidate_hash, parentB.candidate_hash] });
  }
  const randomAttempts = target * 400;
  for (let attempt = 0; attempt < randomAttempts && population.length < target; attempt += 1) {
    const genome = randomGenome(families, rng);
    generated += 1;
    const hash = hashGenome(genome);
    if (seen.has(hash)) continue;
    seen.add(hash);
    population.push({ genome, parents: [] });
  }
  if (population.length < target) {
    throw new Error(`genome_space_exhausted:${checkpoint.agent_id}:generation_${generation}`);
  }

  const evaluated = population.map((member) =>
    evaluateGenome(candles, member.genome, costs, generation, member.parents).result
  );

  const eliteCount = strategyLabV2EliteCount(checkpoint.chunk_size);
  const nextElites: StrategyLabV2Elite[] = [
    ...elites,
    ...evaluated.map((candidate) => ({
      candidate_hash: candidate.candidate_hash,
      score: candidate.score,
      genome: candidate.genome,
    })),
  ].sort(byScoreThenHash).slice(0, eliteCount);

  const bestOfGeneration = [...evaluated].sort(byScoreThenHash)[0] ?? null;
  const best: StrategyLabV2AgentBest | null = bestOfGeneration && (
      !checkpoint.best ||
      bestOfGeneration.score > checkpoint.best.score ||
      (bestOfGeneration.score === checkpoint.best.score &&
        bestOfGeneration.candidate_hash.localeCompare(checkpoint.best.candidate_hash) < 0)
    )
    ? {
      candidate_hash: bestOfGeneration.candidate_hash,
      score: bestOfGeneration.score,
      metrics: bestOfGeneration.metrics,
    }
    : checkpoint.best;

  const advanced: StrategyLabV2AgentCheckpoint = {
    ...checkpoint,
    completed_generations: generation,
    generated: checkpoint.generated + generated,
    tested: checkpoint.tested + evaluated.length,
    rejected: checkpoint.rejected + evaluated.filter((candidate) => candidate.disqualified).length,
    seen: [...seen],
    elites: nextElites,
    best,
  };

  return {
    agent_id: checkpoint.agent_id,
    generation,
    evaluated,
    checkpoint: advanced,
    complete: strategyLabV2CheckpointComplete(advanced),
  };
}

/**
 * Single-process driver over the same resumable generation runner used by the Edge
 * endpoint, so a chunked multi-invocation search and an in-process search produce
 * identical candidates for identical inputs.
 */
export function searchStrategyLabV2Agent(
  candles: StrategyLabV2Candle[],
  agentId: StrategyLabV2AgentId,
  budget: number,
  generations: number,
  seed: number,
  costs: StrategyLabV2Costs = DEFAULT_STRATEGY_LAB_V2_COSTS,
): SearchAgentOutputV2 {
  let checkpoint = createStrategyLabV2Checkpoint({ agentId, seed, budget, generations });
  const results: StrategyLabV2CandidateResult[] = [];
  while (!strategyLabV2CheckpointComplete(checkpoint)) {
    const output = runStrategyLabV2Generation(candles, checkpoint, costs);
    results.push(...output.evaluated);
    checkpoint = output.checkpoint;
  }
  results.sort(byScoreThenHash);
  return {
    agent_id: agentId,
    seed,
    budget: checkpoint.budget,
    generated: checkpoint.generated,
    tested: checkpoint.tested,
    rejected: checkpoint.rejected,
    generations: checkpoint.completed_generations,
    candidates: results,
    best: results[0] ?? null,
  };
}


function scaledCosts(costs: StrategyLabV2Costs, multiplier: number): StrategyLabV2Costs {
  return {
    spread_bps: costs.spread_bps * multiplier,
    commission_bps: costs.commission_bps * multiplier,
    slippage_bps: costs.slippage_bps * multiplier,
  };
}

function perturbGenome(genome: StrategyGenomeV2, multiplier: number): StrategyGenomeV2 {
  const integer = (value: number, low: number, high: number) => clamp(Math.round(value * multiplier), low, high);
  return {
    ...genome,
    fast_ema: integer(genome.fast_ema, 3, 60),
    slow_ema: integer(genome.slow_ema, Math.max(20, integer(genome.fast_ema, 3, 60) + 5), 300),
    lookback: integer(genome.lookback, 5, 240),
    atr_period: integer(genome.atr_period, 5, 60),
    stop_atr: clamp(round(genome.stop_atr * multiplier, 2), 0.5, 4),
    reward_risk: clamp(round(genome.reward_risk * multiplier, 2), 0.5, 6),
    rsi_period: integer(genome.rsi_period, 3, 40),
    max_bars: integer(genome.max_bars, 4, 240),
  };
}

function bootstrapProbabilities(trades: StrategyLabV2Trade[], runs: number, seed: number) {
  if (!trades.length) return { pf: 0, expectancy: 0 };
  const rng = new SeededRandom(seed);
  let pfAboveOne = 0;
  let expectancyAboveZero = 0;
  const block = Math.max(2, Math.min(8, Math.floor(Math.sqrt(trades.length))));
  for (let run = 0; run < runs; run += 1) {
    const sample: StrategyLabV2Trade[] = [];
    while (sample.length < trades.length) {
      const start = rng.int(0, Math.max(0, trades.length - block));
      sample.push(...trades.slice(start, start + block));
    }
    const metrics = metricsFromTrades(sample.slice(0, trades.length));
    if (metrics.profit_factor > 1) pfAboveOne += 1;
    if (metrics.expectancy_r > 0) expectancyAboveZero += 1;
  }
  return { pf: round(pfAboveOne / runs, 4), expectancy: round(expectancyAboveZero / runs, 4) };
}

export function finaliseStrategyLabV2(
  candles: StrategyLabV2Candle[],
  audit: StrategyLabV2Audit,
  candidates: StrategyLabV2CandidateResult[],
  costs: StrategyLabV2Costs,
  bootstrapRuns: number,
  seed: number,
): FinalStrategyV2 {
  if (!audit.sufficient_for_search) {
    return { verdict: "INCONCLUSIVE_INSUFFICIENT_DATA", reasons: audit.warnings, selected: null,
      holdout_metrics: null, stress_metrics: [], probability_pf_above_one: 0,
      probability_expectancy_above_zero: 0, trades: [], exact_rules: [] };
  }
  const development = candles.slice(0, audit.holdout_start_index);
  const finalists = [...candidates].sort((a, b) => b.score - a.score).slice(0, 12);
  const robust = finalists.map((candidate) => {
    const scenarios = [
      { name: "cost_1.5x", genome: candidate.genome, costs: scaledCosts(costs, 1.5), delay: 0 },
      { name: "cost_2x", genome: candidate.genome, costs: scaledCosts(costs, 2), delay: 0 },
      { name: "entry_delay_1", genome: candidate.genome, costs, delay: 1 },
      { name: "entry_delay_2", genome: candidate.genome, costs, delay: 2 },
      { name: "parameters_minus_10pct", genome: perturbGenome(candidate.genome, 0.9), costs, delay: 0 },
      { name: "parameters_plus_10pct", genome: perturbGenome(candidate.genome, 1.1), costs, delay: 0 },
    ];
    const metrics = scenarios.map((scenario) => ({
      scenario: scenario.name,
      metrics: evaluateGenome(development, scenario.genome, scenario.costs, candidate.generation, [], scenario.delay).result.metrics,
    }));
    const survival = metrics.filter((item) => item.metrics.profit_factor > 1 && item.metrics.expectancy_r > 0).length / metrics.length;
    return { candidate, metrics, survival, robustScore: candidate.score + survival * 25 };
  }).sort((a, b) => b.robustScore - a.robustScore);

  const frozen = robust[0] ?? null;
  if (!frozen) {
    return { verdict: "NO_VIABLE_STRATEGY_FOUND", reasons: ["no_candidates_survived_search"], selected: null,
      holdout_metrics: null, stress_metrics: [], probability_pf_above_one: 0,
      probability_expectancy_above_zero: 0, trades: [], exact_rules: [] };
  }
  const developmentEvaluation = evaluateGenome(development, frozen.candidate.genome, costs, frozen.candidate.generation);
  const probability = bootstrapProbabilities(developmentEvaluation.trades, bootstrapRuns, seed ^ 0xa5a5a5a5);
  const holdoutTrades = simulate(candles, frozen.candidate.genome, audit.holdout_start_index, candles.length, costs);
  const holdoutMetrics = metricsFromTrades(holdoutTrades);
  const reasons: string[] = [];
  if (frozen.candidate.metrics.trades < STRATEGY_LAB_V2_GATES.minimum_development_oos_trades) reasons.push("development_oos_trades_below_gate");
  if (holdoutMetrics.trades < STRATEGY_LAB_V2_GATES.minimum_holdout_trades) reasons.push("holdout_trades_below_gate");
  if (frozen.candidate.positive_fold_ratio < STRATEGY_LAB_V2_GATES.minimum_positive_fold_ratio) reasons.push("fold_consistency_below_gate");
  if (frozen.candidate.metrics.profit_factor < STRATEGY_LAB_V2_GATES.minimum_development_profit_factor) reasons.push("development_profit_factor_below_gate");
  if (holdoutMetrics.profit_factor < STRATEGY_LAB_V2_GATES.minimum_holdout_profit_factor) reasons.push("holdout_profit_factor_below_gate");
  if (probability.pf < STRATEGY_LAB_V2_GATES.minimum_probability_pf_above_one) reasons.push("bootstrap_probability_pf_above_one_below_gate");
  if (holdoutMetrics.max_drawdown_pct > STRATEGY_LAB_V2_GATES.maximum_holdout_drawdown_pct) reasons.push("holdout_drawdown_above_gate");
  if (holdoutMetrics.net_return_pct <= 0) reasons.push("holdout_return_not_positive");
  if (frozen.survival < 0.66) reasons.push("stress_survival_below_gate");
  const verdict: StrategyLabV2Verdict = reasons.length ? "NO_VIABLE_STRATEGY_FOUND" : "VIABLE_STRATEGY_FOUND";
  return {
    verdict, reasons, selected: frozen.candidate, holdout_metrics: holdoutMetrics,
    stress_metrics: frozen.metrics, probability_pf_above_one: probability.pf,
    probability_expectancy_above_zero: probability.expectancy, trades: holdoutTrades,
    exact_rules: describeStrategyLabV2Genome(frozen.candidate.genome),
  };
}

export function describeStrategyLabV2Genome(genome: StrategyGenomeV2): string[] {
  const direction = genome.direction === "both" ? "Long and short" : genome.direction === "long" ? "Long only" : "Short only";
  return [
    `${direction}; ${genome.family.replaceAll("_", " ")} entry family.`,
    `EMA ${genome.fast_ema}/${genome.slow_ema}; trend filter ${genome.trend_filter ? "required" : "not required"}.`,
    `Lookback ${genome.lookback}; confirmation ${genome.confirmation}; RSI(${genome.rsi_period}) ${genome.oversold}/${genome.overbought}.`,
    `MACD ${genome.macd_fast}/${genome.macd_slow}/${genome.macd_signal}; Bollinger ${genome.bollinger_period}/${genome.bollinger_std}.`,
    `Enter at the next bar open; ATR(${genome.atr_period}) stop ${genome.stop_atr}x; target ${genome.reward_risk}R.`,
    `${genome.exit_model.replaceAll("_", " ")}; maximum ${genome.max_bars} bars; break-even ${genome.break_even_r == null ? "disabled" : `${genome.break_even_r}R`}.`,
    genome.utc_start_hour == null ? "No UTC time window." : `UTC window ${genome.utc_start_hour}:00–${genome.utc_end_hour}:00 (not labelled as a venue session).`,
  ];
}
