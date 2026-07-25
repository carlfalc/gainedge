import type { Candle } from "./falconer-strategy.ts";

export interface PatternEvidence {
  names: string[];
  scoreBoost: number;
}

/**
 * Deterministic, non-predictive pattern evidence used to explain/rank an
 * already-valid Falconer signal. It never creates or cancels a strategy entry.
 */
export function analyseBullishPatterns(candles: Candle[]): PatternEvidence {
  if (candles.length < 25) return { names: [], scoreBoost: 0 };
  const sample = candles.slice(-60);
  const names: string[] = [];
  const current = sample[sample.length - 1];
  const previous = sample[sample.length - 2];

  if (
    previous.close < previous.open &&
    current.close > current.open &&
    current.open <= previous.close &&
    current.close >= previous.open
  ) {
    names.push("bullish_engulfing");
  }

  const pivots: number[] = [];
  for (let index = 2; index < sample.length - 2; index++) {
    const low = sample[index].low;
    if (
      low < sample[index - 1].low &&
      low < sample[index - 2].low &&
      low <= sample[index + 1].low &&
      low <= sample[index + 2].low
    ) pivots.push(low);
  }
  const lastPivots = pivots.slice(-3);
  if (lastPivots.length === 3 && lastPivots[0] < lastPivots[1] && lastPivots[1] < lastPivots[2]) {
    names.push("three_higher_lows");
  }
  if (lastPivots.length >= 2) {
    const [first, second] = lastPivots.slice(-2);
    const distance = Math.abs(first - second) / Math.max(first, second, 1e-9);
    if (distance <= 0.003) names.push("double_bottom_zone");
  }

  const recentResistance = Math.max(...sample.slice(-21, -1).map(candle => candle.high));
  if (current.close > recentResistance && current.close > current.open) {
    names.push("twenty_bar_breakout");
  }

  return { names, scoreBoost: Math.min(8, names.length * 3) };
}

