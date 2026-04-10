// Indicator calculation functions for Lightweight Charts

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export function calculateEMA(data: OHLCData[], period: number): LinePoint[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: LinePoint[] = [{ time: data[0].time, value: data[0].close }];
  for (let i = 1; i < data.length; i++) {
    result.push({
      time: data[i].time,
      value: data[i].close * k + result[i - 1].value * (1 - k),
    });
  }
  return result;
}

export function calculateSMA(data: OHLCData[], period: number): LinePoint[] {
  const result: LinePoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export function calculateBollingerBands(data: OHLCData[], period = 20, stdDev = 2) {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const avg = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (data[j].close - avg) ** 2;
    const sd = Math.sqrt(variance / period);
    const t = data[i].time;
    upper.push({ time: t, value: avg + stdDev * sd });
    middle.push({ time: t, value: avg });
    lower.push({ time: t, value: avg - stdDev * sd });
  }
  return { upper, middle, lower };
}

export function calculateRSI(data: OHLCData[], period = 14): LinePoint[] {
  if (data.length < period + 1) return [];
  const result: LinePoint[] = [];
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: data[period].time, value: rsi });
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    const val = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[i].time, value: val });
  }
  return result;
}

export function calculateMACD(data: OHLCData[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  const macdLine: LinePoint[] = [];
  const startIdx = slow - 1;
  for (let i = startIdx; i < data.length; i++) {
    macdLine.push({
      time: data[i].time,
      value: emaFast[i].value - emaSlow[i].value,
    });
  }
  // Signal line (EMA of MACD)
  const signalLine: LinePoint[] = [];
  if (macdLine.length >= signal) {
    const k = 2 / (signal + 1);
    signalLine.push({ time: macdLine[0].time, value: macdLine[0].value });
    for (let i = 1; i < macdLine.length; i++) {
      signalLine.push({
        time: macdLine[i].time,
        value: macdLine[i].value * k + signalLine[i - 1].value * (1 - k),
      });
    }
  }
  // Histogram
  const histogram: LinePoint[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    const sig = signalLine[i]?.value ?? 0;
    histogram.push({ time: macdLine[i].time, value: macdLine[i].value - sig });
  }
  return { macdLine, signalLine, histogram };
}

export function toHeikenAshi(data: OHLCData[]): OHLCData[] {
  if (data.length === 0) return [];
  const first = data[0];
  const firstHaClose = (first.open + first.high + first.low + first.close) / 4;
  const firstHaOpen = (first.open + first.close) / 2;

  const result: OHLCData[] = [{
    time: first.time,
    open: firstHaOpen,
    high: Math.max(first.high, firstHaOpen, firstHaClose),
    low: Math.min(first.low, firstHaOpen, firstHaClose),
    close: firstHaClose,
    volume: first.volume,
  }];

  let prevHaOpen = firstHaOpen;
  let prevHaClose = firstHaClose;

  for (let i = 1; i < data.length; i++) {
    const candle = data[i];
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
    const haOpen = (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(candle.high, haOpen, haClose);
    const haLow = Math.min(candle.low, haOpen, haClose);

    result.push({
      time: candle.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: candle.volume,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return result;
}
