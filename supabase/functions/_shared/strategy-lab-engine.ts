import {
  DEFAULT_STRATEGY_LAB_COSTS,
  STRATEGY_LAB_AGENTS,
  STRATEGY_LAB_MIN_CANDLES,
  STRATEGY_LAB_PROMOTION_GATE_V1,
  STRATEGY_LAB_RECOMMENDED_CANDLES,
  STRATEGY_LAB_VERSION,
  type StrategyFamily,
  type StrategyLabCostModel,
} from "./strategy-lab-contracts.ts";

export interface LabCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyCandidateConfig {
  id: string;
  family: StrategyFamily;
  fastEma: number;
  slowEma: number;
  lookback: number;
  atrPeriod: number;
  stopAtr: number;
  rewardRisk: number;
  rsiPeriod: number;
  oversold: number;
  overbought: number;
  volumeMultiplier: number;
  maxBarsInTrade: number;
}

export interface LabTrade {
  direction: "long" | "short";
  signalTime: number;
  openedAt: number;
  closedAt: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  resultR: number;
  exitReason: "stop" | "target" | "time_stop" | "segment_end";
}

export interface LabMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netReturnPct: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPct: number;
  endingEquity: number;
}

export interface DataAudit {
  candleCount: number;
  validCandleCount: number;
  duplicateTimestamps: number;
  outOfOrderTimestamps: number;
  invalidOhlcRows: number;
  largeTimeGaps: number;
  inferredIntervalMinutes: number | null;
  sourceGatePassed: boolean;
  recommendedSampleReached: boolean;
  warnings: string[];
}

export interface CandidateResult {
  candidate: StrategyCandidateConfig;
  train: LabMetrics;
  validation: LabMetrics;
  holdout: LabMetrics;
  validationScore: number;
  rank: number;
  selected: boolean;
  promotionEligible: boolean;
  promotionReasons: string[];
  explanation: string;
}

export interface StrategyLabResult {
  strategyLabVersion: number;
  executionAllowed: false;
  candleCount: number;
  audit: DataAudit;
  split: { trainEnd: number; validationEnd: number; holdoutStart: number };
  agentRuns: Array<{
    agentId: string;
    agentVersion: number;
    status: "complete" | "blocked" | "not_applicable";
    detail: string;
  }>;
  candidates: CandidateResult[];
  champion: CandidateResult | null;
  championTrades: LabTrade[];
  equityCurve: Array<{ time: number; equity: number }>;
}

interface IndicatorSet {
  emaFast: number[];
  emaSlow: number[];
  atr: number[];
  rsi: number[];
  macdHistogram: number[];
  sma20: number[];
  std20: number[];
  volumeSma20: number[];
}

const round = (value: number, digits = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const out = new Array<number>(values.length);
  const alpha = 2 / (period + 1);
  out[0] = values[0];
  for (let i = 1; i < values.length; i += 1) {
    out[i] = values[i] * alpha + out[i - 1] * (1 - alpha);
  }
  return out;
}

function rollingMean(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function rollingStd(
  values: number[],
  period: number,
  means: number[],
): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  for (let i = period - 1; i < values.length; i += 1) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      variance += (values[j] - means[i]) ** 2;
    }
    out[i] = Math.sqrt(variance / period);
  }
  return out;
}

function atr(candles: LabCandle[], period: number): number[] {
  const tr = candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - candles[i - 1].close),
      Math.abs(candle.low - candles[i - 1].close),
    );
  });
  return ema(tr, period);
}

function rsi(values: number[], period: number): number[] {
  const gains = new Array<number>(values.length).fill(0);
  const losses = new Array<number>(values.length).fill(0);
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gains[i] = Math.max(change, 0);
    losses[i] = Math.max(-change, 0);
  }
  const avgGain = ema(gains, period);
  const avgLoss = ema(losses, period);
  return values.map((_, i) => {
    if (avgLoss[i] === 0) return avgGain[i] === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgGain[i] / avgLoss[i]);
  });
}

function indicators(
  candles: LabCandle[],
  config: StrategyCandidateConfig,
): IndicatorSet {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const fast12 = ema(closes, 12);
  const slow26 = ema(closes, 26);
  const macd = fast12.map((value, i) => value - slow26[i]);
  const macdSignal = ema(macd, 9);
  const sma20 = rollingMean(closes, 20);
  return {
    emaFast: ema(closes, config.fastEma),
    emaSlow: ema(closes, config.slowEma),
    atr: atr(candles, config.atrPeriod),
    rsi: rsi(closes, config.rsiPeriod),
    macdHistogram: macd.map((value, i) => value - macdSignal[i]),
    sma20,
    std20: rollingStd(closes, 20, sma20),
    volumeSma20: rollingMean(volumes, 20),
  };
}

function priorExtreme(
  candles: LabCandle[],
  index: number,
  lookback: number,
  field: "high" | "low",
): number {
  const start = Math.max(0, index - lookback);
  let value = field === "high" ? -Infinity : Infinity;
  for (let i = start; i < index; i += 1) {
    value = field === "high"
      ? Math.max(value, candles[i].high)
      : Math.min(value, candles[i].low);
  }
  return value;
}

function signalAt(
  candles: LabCandle[],
  index: number,
  config: StrategyCandidateConfig,
  set: IndicatorSet,
): "long" | "short" | null {
  if (index < Math.max(config.slowEma, config.lookback, 30)) return null;
  const candle = candles[index];
  const previous = candles[index - 1];
  const trendUp = set.emaFast[index] > set.emaSlow[index];
  const trendDown = set.emaFast[index] < set.emaSlow[index];
  const high = priorExtreme(candles, index, config.lookback, "high");
  const low = priorExtreme(candles, index, config.lookback, "low");
  const atrNow = Math.max(set.atr[index], Number.EPSILON);

  switch (config.family) {
    case "trend_pullback":
      if (
        trendUp && candle.low <= set.emaFast[index] + atrNow * 0.15 &&
        candle.close > set.emaFast[index] && set.rsi[index] >= 45 &&
        set.rsi[index] <= 65
      ) return "long";
      if (
        trendDown && candle.high >= set.emaFast[index] - atrNow * 0.15 &&
        candle.close < set.emaFast[index] && set.rsi[index] >= 35 &&
        set.rsi[index] <= 55
      ) return "short";
      return null;
    case "range_breakout":
      if (trendUp && candle.close > high && previous.close <= high) {
        return "long";
      }
      if (trendDown && candle.close < low && previous.close >= low) {
        return "short";
      }
      return null;
    case "mean_reversion": {
      const upper = set.sma20[index] + set.std20[index] * 2;
      const lower = set.sma20[index] - set.std20[index] * 2;
      if (candle.close < lower && set.rsi[index] <= config.oversold) {
        return "long";
      }
      if (candle.close > upper && set.rsi[index] >= config.overbought) {
        return "short";
      }
      return null;
    }
    case "momentum_transition":
      if (
        trendUp && set.macdHistogram[index] > 0 &&
        set.macdHistogram[index - 1] <= 0 && set.rsi[index] > 50
      ) return "long";
      if (
        trendDown && set.macdHistogram[index] < 0 &&
        set.macdHistogram[index - 1] >= 0 && set.rsi[index] < 50
      ) return "short";
      return null;
    case "liquidity_sweep":
      if (
        candle.low < low && candle.close > low && candle.close > candle.open
      ) return "long";
      if (
        candle.high > high && candle.close < high && candle.close < candle.open
      ) return "short";
      return null;
    case "relative_volume_breakout": {
      const volumeReady = Number.isFinite(set.volumeSma20[index]) &&
        candle.volume > 0 &&
        candle.volume >= set.volumeSma20[index] * config.volumeMultiplier;
      if (volumeReady && trendUp && candle.close > high) return "long";
      if (volumeReady && trendDown && candle.close < low) return "short";
      return null;
    }
    case "fibonacci_pullback": {
      const range = high - low;
      if (!(range > 0)) return null;
      const longUpper = high - range * 0.5;
      const longLower = high - range * 0.618;
      const shortLower = low + range * 0.5;
      const shortUpper = low + range * 0.618;
      if (
        trendUp && candle.low <= longUpper && candle.close >= longLower &&
        candle.close > candle.open
      ) return "long";
      if (
        trendDown && candle.high >= shortLower && candle.close <= shortUpper &&
        candle.close < candle.open
      ) return "short";
      return null;
    }
  }
}

function emptyMetrics(initialEquity: number): LabMetrics {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netReturnPct: 0,
    profitFactor: 0,
    expectancyR: 0,
    maxDrawdownPct: 0,
    endingEquity: initialEquity,
  };
}

function simulate(
  candles: LabCandle[],
  config: StrategyCandidateConfig,
  start: number,
  end: number,
  initialEquity: number,
  riskFraction: number,
  costs: StrategyLabCostModel,
): {
  metrics: LabMetrics;
  trades: LabTrade[];
  equityCurve: Array<{ time: number; equity: number }>;
} {
  if (end - start < 2) {
    return {
      metrics: emptyMetrics(initialEquity),
      trades: [],
      equityCurve: [],
    };
  }
  const set = indicators(candles, config);
  const trades: LabTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number }> = [];
  let equity = initialEquity;
  let peak = initialEquity;
  let maxDrawdownPct = 0;
  let grossProfitR = 0;
  let grossLossR = 0;

  for (
    let signalIndex = Math.max(start, config.slowEma, config.lookback, 30);
    signalIndex < end - 1;
  ) {
    const direction = signalAt(candles, signalIndex, config, set);
    if (!direction) {
      signalIndex += 1;
      continue;
    }
    const entryIndex = signalIndex + 1;
    const entry = candles[entryIndex].open;
    const stopDistance = set.atr[signalIndex] * config.stopAtr;
    if (!(entry > 0) || !(stopDistance > 0)) {
      signalIndex += 1;
      continue;
    }
    const stop = direction === "long"
      ? entry - stopDistance
      : entry + stopDistance;
    const target = direction === "long"
      ? entry + stopDistance * config.rewardRisk
      : entry - stopDistance * config.rewardRisk;
    const lastIndex = Math.min(end - 1, entryIndex + config.maxBarsInTrade);
    let exitIndex = lastIndex;
    let exit = candles[lastIndex].close;
    let rawR = direction === "long"
      ? (exit - entry) / stopDistance
      : (entry - exit) / stopDistance;
    let exitReason: LabTrade["exitReason"] = lastIndex === end - 1
      ? "segment_end"
      : "time_stop";

    for (let i = entryIndex; i <= lastIndex; i += 1) {
      const bar = candles[i];
      const stopHit = direction === "long" ? bar.low <= stop : bar.high >= stop;
      const targetHit = direction === "long"
        ? bar.high >= target
        : bar.low <= target;
      // Conservative bar rule: when both levels trade inside one OHLC bar, the stop wins.
      if (stopHit) {
        exitIndex = i;
        exit = stop;
        rawR = -1;
        exitReason = "stop";
        break;
      }
      if (targetHit) {
        exitIndex = i;
        exit = target;
        rawR = config.rewardRisk;
        exitReason = "target";
        break;
      }
    }

    const roundTripBps = costs.spread_bps +
      2 * (costs.commission_bps + costs.slippage_bps);
    const costR = (entry * roundTripBps / 10_000) / stopDistance;
    const resultR = rawR - costR;
    equity *= Math.max(0.01, 1 + riskFraction * resultR);
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(
      maxDrawdownPct,
      peak > 0 ? (peak - equity) / peak * 100 : 0,
    );
    if (resultR > 0) grossProfitR += resultR;
    else grossLossR += Math.abs(resultR);
    trades.push({
      direction,
      signalTime: candles[signalIndex].time,
      openedAt: candles[entryIndex].time,
      closedAt: candles[exitIndex].time,
      entry: round(entry),
      exit: round(exit),
      stop: round(stop),
      target: round(target),
      resultR: round(resultR),
      exitReason,
    });
    equityCurve.push({
      time: candles[exitIndex].time,
      equity: round(equity, 2),
    });
    signalIndex = Math.max(signalIndex + 1, exitIndex + 1);
  }

  const wins = trades.filter((trade) => trade.resultR > 0).length;
  const losses = trades.length - wins;
  const expectancyR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.resultR, 0) / trades.length
    : 0;
  return {
    trades,
    equityCurve,
    metrics: {
      trades: trades.length,
      wins,
      losses,
      winRate: round(trades.length ? wins / trades.length * 100 : 0, 2),
      netReturnPct: round((equity / initialEquity - 1) * 100, 2),
      profitFactor: round(
        grossLossR > 0 ? grossProfitR / grossLossR : grossProfitR > 0 ? 99 : 0,
        2,
      ),
      expectancyR: round(expectancyR, 3),
      maxDrawdownPct: round(maxDrawdownPct, 2),
      endingEquity: round(equity, 2),
    },
  };
}

export function auditCandles(candles: LabCandle[]): DataAudit {
  let duplicateTimestamps = 0;
  let outOfOrderTimestamps = 0;
  let invalidOhlcRows = 0;
  const intervals: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    if (seen.has(candle.time)) duplicateTimestamps += 1;
    seen.add(candle.time);
    if (i > 0) {
      const interval = candle.time - candles[i - 1].time;
      if (interval <= 0) outOfOrderTimestamps += 1;
      else intervals.push(interval);
    }
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(
        Number.isFinite,
      ) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > candle.high
    ) {
      invalidOhlcRows += 1;
    }
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals.length
    ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    : 0;
  const largeTimeGaps = medianInterval > 0
    ? intervals.filter((interval) => interval > medianInterval * 4).length
    : 0;
  const warnings: string[] = [];
  if (candles.length < STRATEGY_LAB_MIN_CANDLES) {
    warnings.push("minimum_1000_candles_not_reached");
  }
  if (candles.length < STRATEGY_LAB_RECOMMENDED_CANDLES) {
    warnings.push("recommended_20000_candles_not_reached");
  }
  if (duplicateTimestamps) warnings.push("duplicate_timestamps_present");
  if (outOfOrderTimestamps) warnings.push("timestamps_not_strictly_increasing");
  if (invalidOhlcRows) warnings.push("invalid_ohlc_rows_present");
  if (largeTimeGaps) warnings.push("large_time_gaps_require_venue_review");
  return {
    candleCount: candles.length,
    validCandleCount: candles.length - invalidOhlcRows,
    duplicateTimestamps,
    outOfOrderTimestamps,
    invalidOhlcRows,
    largeTimeGaps,
    inferredIntervalMinutes: medianInterval
      ? round(medianInterval / 60_000, 2)
      : null,
    sourceGatePassed: candles.length >= STRATEGY_LAB_MIN_CANDLES &&
      duplicateTimestamps === 0 && outOfOrderTimestamps === 0 &&
      invalidOhlcRows === 0,
    recommendedSampleReached:
      candles.length >= STRATEGY_LAB_RECOMMENDED_CANDLES,
    warnings,
  };
}

export function candidateGrid(): StrategyCandidateConfig[] {
  const candidates: StrategyCandidateConfig[] = [];
  const families: StrategyFamily[] = [
    "trend_pullback",
    "range_breakout",
    "mean_reversion",
    "momentum_transition",
    "liquidity_sweep",
    "relative_volume_breakout",
    "fibonacci_pullback",
  ];
  for (const family of families) {
    for (const variant of [0, 1, 2]) {
      const fastEma = [9, 14, 21][variant];
      const slowEma = [50, 100, 200][variant];
      const lookback = [20, 40, 80][variant];
      const rewardRisk = [1.5, 2, 3][variant];
      candidates.push({
        id: `${family}_v${variant + 1}`,
        family,
        fastEma,
        slowEma,
        lookback,
        atrPeriod: 14,
        stopAtr: [1.25, 1.5, 2][variant],
        rewardRisk,
        rsiPeriod: 14,
        oversold: [25, 30, 35][variant],
        overbought: [75, 70, 65][variant],
        volumeMultiplier: [1.25, 1.5, 2][variant],
        maxBarsInTrade: [32, 48, 64][variant],
      });
    }
  }
  return candidates;
}

function validationScore(metrics: LabMetrics): number {
  if (!metrics.trades) return 0;
  const tradeReliability = Math.min(metrics.trades / 30, 1);
  const profitFactor = Math.min(metrics.profitFactor / 2, 1.25);
  const returnQuality = clamp((metrics.netReturnPct + 5) / 20, 0, 1.25);
  const drawdownQuality = clamp(1 - metrics.maxDrawdownPct / 25, 0, 1);
  const expectancyQuality = clamp((metrics.expectancyR + 0.25) / 0.75, 0, 1.25);
  return round(
    100 * tradeReliability * (
      profitFactor * 0.3 + returnQuality * 0.25 + drawdownQuality * 0.2 +
      expectancyQuality * 0.25
    ),
    2,
  );
}

function promotionDecision(
  validation: LabMetrics,
  holdout: LabMetrics,
  audit: DataAudit,
) {
  const gate = STRATEGY_LAB_PROMOTION_GATE_V1;
  const reasons: string[] = [];
  if (!audit.sourceGatePassed) reasons.push("source_gate_failed");
  if (!audit.recommendedSampleReached) {
    reasons.push("recommended_sample_not_reached");
  }
  if (validation.trades < gate.min_validation_trades) {
    reasons.push("validation_trade_count_below_gate");
  }
  if (holdout.trades < gate.min_holdout_trades) {
    reasons.push("holdout_trade_count_below_gate");
  }
  if (validation.profitFactor < gate.min_validation_profit_factor) {
    reasons.push("validation_profit_factor_below_gate");
  }
  if (holdout.profitFactor < gate.min_holdout_profit_factor) {
    reasons.push("holdout_profit_factor_below_gate");
  }
  if (holdout.maxDrawdownPct > gate.max_holdout_drawdown_pct) {
    reasons.push("holdout_drawdown_above_gate");
  }
  if (gate.require_positive_holdout_return && holdout.netReturnPct <= 0) {
    reasons.push("holdout_return_not_positive");
  }
  return { eligible: reasons.length === 0, reasons };
}

function explanation(config: StrategyCandidateConfig): string {
  const names: Record<StrategyFamily, string> = {
    trend_pullback: "EMA trend pullback with RSI state confirmation",
    range_breakout: "range breakout aligned with the EMA regime",
    mean_reversion: "Bollinger and RSI mean-reversion response",
    momentum_transition: "MACD momentum transition aligned with the EMA regime",
    liquidity_sweep: "prior-range liquidity-sweep price-action proxy",
    relative_volume_breakout:
      "range breakout confirmed by relative CFD tick volume",
    fibonacci_pullback:
      "50–61.8% mathematical retracement inside the EMA regime",
  };
  return `${
    names[config.family]
  }; ATR(${config.atrPeriod}) stop ${config.stopAtr}×, target ${config.rewardRisk}R, next-bar-open entries.`;
}

export function runStrategyLab(
  candles: LabCandle[],
  options: {
    initialEquity?: number;
    riskFraction?: number;
    costs?: StrategyLabCostModel;
    candidates?: StrategyCandidateConfig[];
  } = {},
): StrategyLabResult {
  const initialEquity = options.initialEquity ?? 10_000;
  const riskFraction = clamp(options.riskFraction ?? 0.01, 0.001, 0.03);
  const costs = options.costs ?? DEFAULT_STRATEGY_LAB_COSTS;
  const audit = auditCandles(candles);
  const trainEnd = Math.floor(candles.length * 0.6);
  const validationEnd = Math.floor(candles.length * 0.8);
  const agentRuns = STRATEGY_LAB_AGENTS.map((agent) => ({
    agentId: agent.agent_id,
    agentVersion: agent.agent_version,
    status: (!audit.sourceGatePassed && agent.agent_id !== "data_integrity")
      ? "blocked" as const
      : agent.agent_id === "macro_cross_asset" ||
          agent.agent_id === "session_venue"
      ? "not_applicable" as const
      : "complete" as const,
    detail: agent.agent_id === "macro_cross_asset"
      ? "No point-in-time macro or cross-asset evidence was supplied to this candle-only run."
      : agent.agent_id === "session_venue"
      ? "No authoritative venue-calendar evidence was supplied; V1 candidates apply no session constraint."
      : agent.agent_id === "data_integrity"
      ? (audit.sourceGatePassed
        ? "Source gate passed."
        : `Source gate blocked: ${audit.warnings.join(",")}`)
      : (!audit.sourceGatePassed
        ? "Blocked by the source gate."
        : agent.purpose),
  }));

  if (!audit.sourceGatePassed) {
    return {
      strategyLabVersion: STRATEGY_LAB_VERSION,
      executionAllowed: false,
      candleCount: candles.length,
      audit,
      split: { trainEnd, validationEnd, holdoutStart: validationEnd },
      agentRuns,
      candidates: [],
      champion: null,
      championTrades: [],
      equityCurve: [],
    };
  }

  const raw = (options.candidates ?? candidateGrid()).map((candidate) => {
    const train = simulate(
      candles,
      candidate,
      0,
      trainEnd,
      initialEquity,
      riskFraction,
      costs,
    ).metrics;
    const validation = simulate(
      candles,
      candidate,
      trainEnd,
      validationEnd,
      initialEquity,
      riskFraction,
      costs,
    ).metrics;
    const holdout = simulate(
      candles,
      candidate,
      validationEnd,
      candles.length,
      initialEquity,
      riskFraction,
      costs,
    ).metrics;
    const gate = promotionDecision(validation, holdout, audit);
    return {
      candidate,
      train,
      validation,
      holdout,
      validationScore: validationScore(validation),
      rank: 0,
      selected: false,
      promotionEligible: gate.eligible,
      promotionReasons: gate.reasons,
      explanation: explanation(candidate),
    };
  }).sort((a, b) =>
    b.validationScore - a.validationScore ||
    a.candidate.id.localeCompare(b.candidate.id)
  );

  const candidates = raw.map((result, index) => ({
    ...result,
    rank: index + 1,
    selected: index === 0,
  }));
  const champion = candidates[0] ?? null;
  const championRun = champion
    ? simulate(
      candles,
      champion.candidate,
      validationEnd,
      candles.length,
      initialEquity,
      riskFraction,
      costs,
    )
    : { trades: [], equityCurve: [] };
  return {
    strategyLabVersion: STRATEGY_LAB_VERSION,
    executionAllowed: false,
    candleCount: candles.length,
    audit,
    split: { trainEnd, validationEnd, holdoutStart: validationEnd },
    agentRuns,
    candidates,
    champion,
    championTrades: championRun.trades,
    equityCurve: championRun.equityCurve,
  };
}
