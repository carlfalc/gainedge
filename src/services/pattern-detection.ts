/**
 * RON Pattern Detection Service
 * Analyses OHLCV candle data and detects common chart patterns.
 */

export interface OHLCVCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface DetectedPattern {
  pattern_name: string;
  direction: "bullish" | "bearish";
  confidence: number; // 1-10
  start_index: number;
  end_index: number;
  key_prices: {
    neckline?: number;
    target?: number;
    resistance?: number;
    support?: number;
    peaks?: number[];
    troughs?: number[];
    upper_line?: { start: { time: number; price: number }; end: { time: number; price: number } };
    lower_line?: { start: { time: number; price: number }; end: { time: number; price: number } };
  };
}

const TOLERANCE = 0.003; // 0.3% price tolerance for "similar" levels

function similar(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= tol;
}

/** Find local peaks (highs) and troughs (lows) with a lookback window */
function findPivots(candles: OHLCVCandle[], window = 3) {
  const peaks: { index: number; price: number }[] = [];
  const troughs: { index: number; price: number }[] = [];

  for (let i = window; i < candles.length - window; i++) {
    let isPeak = true;
    let isTrough = true;
    for (let j = 1; j <= window; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isPeak = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isTrough = false;
    }
    if (isPeak) peaks.push({ index: i, price: candles[i].high });
    if (isTrough) troughs.push({ index: i, price: candles[i].low });
  }
  return { peaks, troughs };
}

/* ─── Pattern Detectors ─── */

function detectDoubleTop(candles: OHLCVCandle[], peaks: { index: number; price: number }[], troughs: { index: number; price: number }[]): DetectedPattern | null {
  for (let i = peaks.length - 1; i >= 1; i--) {
    const p2 = peaks[i];
    const p1 = peaks[i - 1];
    if (p2.index - p1.index < 5 || p2.index - p1.index > 40) continue;
    if (!similar(p1.price, p2.price, 0.005)) continue;

    // Find trough between peaks
    const middleTroughs = troughs.filter(t => t.index > p1.index && t.index < p2.index);
    if (middleTroughs.length === 0) continue;
    const neckline = Math.min(...middleTroughs.map(t => t.price));
    const peakAvg = (p1.price + p2.price) / 2;
    const height = peakAvg - neckline;
    const target = neckline - height;

    return {
      pattern_name: "Double Top",
      direction: "bearish",
      confidence: Math.min(8, Math.round(5 + (similar(p1.price, p2.price, 0.002) ? 2 : 0) + (middleTroughs.length >= 1 ? 1 : 0))),
      start_index: p1.index,
      end_index: p2.index,
      key_prices: { neckline, target, peaks: [p1.price, p2.price] },
    };
  }
  return null;
}

function detectDoubleBottom(candles: OHLCVCandle[], peaks: { index: number; price: number }[], troughs: { index: number; price: number }[]): DetectedPattern | null {
  for (let i = troughs.length - 1; i >= 1; i--) {
    const t2 = troughs[i];
    const t1 = troughs[i - 1];
    if (t2.index - t1.index < 5 || t2.index - t1.index > 40) continue;
    if (!similar(t1.price, t2.price, 0.005)) continue;

    const middlePeaks = peaks.filter(p => p.index > t1.index && p.index < t2.index);
    if (middlePeaks.length === 0) continue;
    const neckline = Math.max(...middlePeaks.map(p => p.price));
    const troughAvg = (t1.price + t2.price) / 2;
    const height = neckline - troughAvg;
    const target = neckline + height;

    return {
      pattern_name: "Double Bottom",
      direction: "bullish",
      confidence: Math.min(8, Math.round(5 + (similar(t1.price, t2.price, 0.002) ? 2 : 0) + (middlePeaks.length >= 1 ? 1 : 0))),
      start_index: t1.index,
      end_index: t2.index,
      key_prices: { neckline, target, troughs: [t1.price, t2.price] },
    };
  }
  return null;
}

function detectHeadAndShoulders(candles: OHLCVCandle[], peaks: { index: number; price: number }[], troughs: { index: number; price: number }[]): DetectedPattern | null {
  for (let i = peaks.length - 1; i >= 2; i--) {
    const right = peaks[i];
    const head = peaks[i - 1];
    const left = peaks[i - 2];

    if (head.price <= left.price || head.price <= right.price) continue;
    if (!similar(left.price, right.price, 0.01)) continue;
    if (head.index - left.index < 5 || right.index - head.index < 5) continue;

    // Neckline from troughs between
    const leftTroughs = troughs.filter(t => t.index > left.index && t.index < head.index);
    const rightTroughs = troughs.filter(t => t.index > head.index && t.index < right.index);
    if (leftTroughs.length === 0 || rightTroughs.length === 0) continue;

    const neckline = (Math.min(...leftTroughs.map(t => t.price)) + Math.min(...rightTroughs.map(t => t.price))) / 2;
    const height = head.price - neckline;
    const target = neckline - height;

    return {
      pattern_name: "Head & Shoulders",
      direction: "bearish",
      confidence: Math.min(9, Math.round(6 + (similar(left.price, right.price, 0.005) ? 2 : 0) + 1)),
      start_index: left.index,
      end_index: right.index,
      key_prices: { neckline, target, peaks: [left.price, head.price, right.price] },
    };
  }
  return null;
}

function detectAscendingTriangle(candles: OHLCVCandle[], peaks: { index: number; price: number }[], troughs: { index: number; price: number }[]): DetectedPattern | null {
  if (peaks.length < 2 || troughs.length < 2) return null;
  const recentPeaks = peaks.slice(-3);
  const recentTroughs = troughs.slice(-3);

  // Flat resistance
  const peakPrices = recentPeaks.map(p => p.price);
  const peakRange = Math.max(...peakPrices) - Math.min(...peakPrices);
  const avgPeak = peakPrices.reduce((a, b) => a + b, 0) / peakPrices.length;
  if (peakRange / avgPeak > 0.005) return null; // not flat enough

  // Rising lows
  let rising = true;
  for (let i = 1; i < recentTroughs.length; i++) {
    if (recentTroughs[i].price <= recentTroughs[i - 1].price) rising = false;
  }
  if (!rising) return null;

  const resistance = avgPeak;
  const support = recentTroughs[0].price;
  const height = resistance - support;
  const target = resistance + height;
  const startIdx = Math.min(recentPeaks[0].index, recentTroughs[0].index);
  const endIdx = Math.max(recentPeaks[recentPeaks.length - 1].index, recentTroughs[recentTroughs.length - 1].index);

  return {
    pattern_name: "Ascending Triangle",
    direction: "bullish",
    confidence: Math.min(8, 6 + recentPeaks.length - 1),
    start_index: startIdx,
    end_index: endIdx,
    key_prices: {
      resistance,
      target,
      upper_line: { start: { time: candles[recentPeaks[0].index].time, price: resistance }, end: { time: candles[recentPeaks[recentPeaks.length - 1].index].time, price: resistance } },
      lower_line: { start: { time: candles[recentTroughs[0].index].time, price: recentTroughs[0].price }, end: { time: candles[recentTroughs[recentTroughs.length - 1].index].time, price: recentTroughs[recentTroughs.length - 1].price } },
    },
  };
}

function detectDescendingTriangle(candles: OHLCVCandle[], peaks: { index: number; price: number }[], troughs: { index: number; price: number }[]): DetectedPattern | null {
  if (peaks.length < 2 || troughs.length < 2) return null;
  const recentPeaks = peaks.slice(-3);
  const recentTroughs = troughs.slice(-3);

  // Flat support
  const troughPrices = recentTroughs.map(t => t.price);
  const troughRange = Math.max(...troughPrices) - Math.min(...troughPrices);
  const avgTrough = troughPrices.reduce((a, b) => a + b, 0) / troughPrices.length;
  if (troughRange / avgTrough > 0.005) return null;

  // Falling highs
  let falling = true;
  for (let i = 1; i < recentPeaks.length; i++) {
    if (recentPeaks[i].price >= recentPeaks[i - 1].price) falling = false;
  }
  if (!falling) return null;

  const support = avgTrough;
  const resistance = recentPeaks[0].price;
  const height = resistance - support;
  const target = support - height;
  const startIdx = Math.min(recentPeaks[0].index, recentTroughs[0].index);
  const endIdx = Math.max(recentPeaks[recentPeaks.length - 1].index, recentTroughs[recentTroughs.length - 1].index);

  return {
    pattern_name: "Descending Triangle",
    direction: "bearish",
    confidence: Math.min(8, 6 + recentTroughs.length - 1),
    start_index: startIdx,
    end_index: endIdx,
    key_prices: {
      support,
      target,
      upper_line: { start: { time: candles[recentPeaks[0].index].time, price: recentPeaks[0].price }, end: { time: candles[recentPeaks[recentPeaks.length - 1].index].time, price: recentPeaks[recentPeaks.length - 1].price } },
      lower_line: { start: { time: candles[recentTroughs[0].index].time, price: support }, end: { time: candles[recentTroughs[recentTroughs.length - 1].index].time, price: support } },
    },
  };
}

function detectBullFlag(candles: OHLCVCandle[]): DetectedPattern | null {
  const len = candles.length;
  if (len < 20) return null;

  // Look for a sharp move up (pole) followed by a mild downward drift (flag)
  for (let poleEnd = len - 10; poleEnd >= 10; poleEnd--) {
    const poleStart = Math.max(0, poleEnd - 10);
    const poleGain = (candles[poleEnd].close - candles[poleStart].close) / candles[poleStart].close;
    if (poleGain < 0.015) continue; // need at least 1.5% move

    // Flag: next 5-15 candles should drift down mildly
    const flagEnd = Math.min(len - 1, poleEnd + 15);
    if (flagEnd - poleEnd < 4) continue;
    const flagDrop = (candles[flagEnd].close - candles[poleEnd].close) / candles[poleEnd].close;
    if (flagDrop > 0 || flagDrop < -poleGain * 0.6) continue; // should retrace < 60% of pole

    const flagHigh = Math.max(...candles.slice(poleEnd, flagEnd + 1).map(c => c.high));
    const flagLow = Math.min(...candles.slice(poleEnd, flagEnd + 1).map(c => c.low));
    const target = candles[flagEnd].close + (candles[poleEnd].close - candles[poleStart].close);

    return {
      pattern_name: "Bull Flag",
      direction: "bullish",
      confidence: Math.min(8, Math.round(5 + Math.abs(poleGain) * 100)),
      start_index: poleStart,
      end_index: flagEnd,
      key_prices: {
        target,
        upper_line: { start: { time: candles[poleEnd].time, price: flagHigh }, end: { time: candles[flagEnd].time, price: candles[flagEnd].high } },
        lower_line: { start: { time: candles[poleEnd].time, price: flagLow }, end: { time: candles[flagEnd].time, price: candles[flagEnd].low } },
      },
    };
  }
  return null;
}

function detectBearFlag(candles: OHLCVCandle[]): DetectedPattern | null {
  const len = candles.length;
  if (len < 20) return null;

  for (let poleEnd = len - 10; poleEnd >= 10; poleEnd--) {
    const poleStart = Math.max(0, poleEnd - 10);
    const poleDrop = (candles[poleEnd].close - candles[poleStart].close) / candles[poleStart].close;
    if (poleDrop > -0.015) continue;

    const flagEnd = Math.min(len - 1, poleEnd + 15);
    if (flagEnd - poleEnd < 4) continue;
    const flagRise = (candles[flagEnd].close - candles[poleEnd].close) / candles[poleEnd].close;
    if (flagRise < 0 || flagRise > Math.abs(poleDrop) * 0.6) continue;

    const flagHigh = Math.max(...candles.slice(poleEnd, flagEnd + 1).map(c => c.high));
    const flagLow = Math.min(...candles.slice(poleEnd, flagEnd + 1).map(c => c.low));
    const target = candles[flagEnd].close - (candles[poleStart].close - candles[poleEnd].close);

    return {
      pattern_name: "Bear Flag",
      direction: "bearish",
      confidence: Math.min(8, Math.round(5 + Math.abs(poleDrop) * 100)),
      start_index: poleStart,
      end_index: flagEnd,
      key_prices: {
        target,
        upper_line: { start: { time: candles[poleEnd].time, price: candles[poleEnd].high }, end: { time: candles[flagEnd].time, price: flagHigh } },
        lower_line: { start: { time: candles[poleEnd].time, price: candles[poleEnd].low }, end: { time: candles[flagEnd].time, price: flagLow } },
      },
    };
  }
  return null;
}

function detectSupportResistance(candles: OHLCVCandle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const priceRange = Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
  const zoneTolerance = priceRange * 0.005; // 0.5% of range

  // Collect all bounce points
  const bouncePoints: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) bouncePoints.push(candles[i].low);
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) bouncePoints.push(candles[i].high);
  }

  // Cluster bounce points
  const levels: { price: number; count: number }[] = [];
  for (const bp of bouncePoints) {
    const existing = levels.find(l => Math.abs(l.price - bp) <= zoneTolerance);
    if (existing) {
      existing.price = (existing.price * existing.count + bp) / (existing.count + 1);
      existing.count++;
    } else {
      levels.push({ price: bp, count: 1 });
    }
  }

  // Only keep levels with 2+ touches
  const significant = levels.filter(l => l.count >= 2).sort((a, b) => b.count - a.count).slice(0, 4);
  const lastClose = candles[candles.length - 1].close;

  for (const level of significant) {
    patterns.push({
      pattern_name: level.price > lastClose ? "Resistance" : "Support",
      direction: level.price > lastClose ? "bearish" : "bullish",
      confidence: Math.min(9, 4 + level.count),
      start_index: 0,
      end_index: candles.length - 1,
      key_prices: {
        [level.price > lastClose ? "resistance" : "support"]: level.price,
      },
    });
  }

  return patterns;
}

/** Main detection function — analyses candles and returns all detected patterns */
export function detectPatterns(candles: OHLCVCandle[]): DetectedPattern[] {
  if (candles.length < 20) return [];

  // Use last 100 candles for pattern detection
  const slice = candles.slice(-100);
  const { peaks, troughs } = findPivots(slice, 3);
  const results: DetectedPattern[] = [];

  // Check each pattern type — return first match for named patterns
  const doubleTop = detectDoubleTop(slice, peaks, troughs);
  if (doubleTop) results.push(doubleTop);

  const doubleBottom = detectDoubleBottom(slice, peaks, troughs);
  if (doubleBottom) results.push(doubleBottom);

  const hns = detectHeadAndShoulders(slice, peaks, troughs);
  if (hns) results.push(hns);

  const ascTri = detectAscendingTriangle(slice, peaks, troughs);
  if (ascTri) results.push(ascTri);

  const descTri = detectDescendingTriangle(slice, peaks, troughs);
  if (descTri) results.push(descTri);

  const bullFlag = detectBullFlag(slice);
  if (bullFlag) results.push(bullFlag);

  const bearFlag = detectBearFlag(slice);
  if (bearFlag) results.push(bearFlag);

  // Support/Resistance always
  const sr = detectSupportResistance(slice);
  results.push(...sr);

  // Adjust indices to original candle array offset
  const offset = candles.length - slice.length;
  for (const r of results) {
    r.start_index += offset;
    r.end_index += offset;
    // Update time references in key_prices lines
    if (r.key_prices.upper_line) {
      r.key_prices.upper_line.start.time = candles[r.start_index]?.time ?? r.key_prices.upper_line.start.time;
    }
    if (r.key_prices.lower_line) {
      r.key_prices.lower_line.start.time = candles[r.start_index]?.time ?? r.key_prices.lower_line.start.time;
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
