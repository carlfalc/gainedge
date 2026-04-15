import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Indicator calculations (server-side) ─── */
function calcEMA(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const k = 2 / (period + 1);
  const r = [closes[0]];
  for (let i = 1; i < closes.length; i++) r.push(closes[i] * k + r[i - 1] * (1 - k));
  return r;
}

function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gainSum += ch; else lossSum += Math.abs(ch);
  }
  let avgGain = gainSum / period, avgLoss = lossSum / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? Math.abs(ch) : 0)) / period;
  }
  return avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function calcADX(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period * 2) return null;
  let trSum = 0, pDmSum = 0, nDmSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    const pDm = Math.max(0, highs[i] - highs[i - 1]);
    const nDm = Math.max(0, lows[i - 1] - lows[i]);
    trSum += tr; pDmSum += pDm; nDmSum += nDm;
  }
  if (trSum === 0) return null;
  const pDi = (pDmSum / trSum) * 100;
  const nDi = (nDmSum / trSum) * 100;
  const dx = (pDi + nDi) === 0 ? 0 : Math.abs(pDi - nDi) / (pDi + nDi) * 100;
  return +dx.toFixed(1);
}

function calcStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14): number | null {
  if (closes.length < rsiPeriod + stochPeriod + 1) return null;
  const rsis: number[] = [];
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= rsiPeriod; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gainSum += ch; else lossSum += Math.abs(ch);
  }
  let avgGain = gainSum / rsiPeriod, avgLoss = lossSum / rsiPeriod;
  rsis.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = rsiPeriod + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (rsiPeriod - 1) + (ch > 0 ? ch : 0)) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + (ch < 0 ? Math.abs(ch) : 0)) / rsiPeriod;
    rsis.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  if (rsis.length < stochPeriod) return null;
  const recent = rsis.slice(-stochPeriod);
  const min = Math.min(...recent), max = Math.max(...recent);
  if (max === min) return 50;
  return +((rsis[rsis.length - 1] - min) / (max - min) * 100).toFixed(1);
}

function calcMACDStatus(closes: number[]): string {
  const emaFast = calcEMA(closes, 12);
  const emaSlow = calcEMA(closes, 26);
  if (emaFast.length < 26 || emaSlow.length < 26) return "Neutral";
  const macdVal = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];
  const prevMacd = emaFast[emaFast.length - 2] - emaSlow[emaSlow.length - 2];
  if (macdVal > 0 && macdVal > prevMacd) return "Bullish";
  if (macdVal < 0 && macdVal < prevMacd) return "Bearish";
  return "Neutral";
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    sum += tr;
  }
  return sum / period;
}

function validateTradeLevels(direction: string, entry: number | null, tp: number | null, sl: number | null) {
  if (!entry || !tp || !sl) return false;
  if (direction === "BUY") return tp > entry && sl < entry;
  if (direction === "SELL") return tp < entry && sl > entry;
  return false;
}

function ensureMinimumStopDistance(entry: number, direction: string, atrDistance: number, symbol: string) {
  const fallbackPipSize = symbol.includes("JPY") ? 0.01 : symbol === "XAUUSD" || symbol === "GOLD" ? 0.1 : ["US30", "NAS100", "SPX500", "UK100", "GER40", "HK50", "JPN225", "AUS200"].some((idx) => symbol.includes(idx)) ? 1 : 0.0001;
  const minDistance = Math.max(atrDistance, fallbackPipSize);
  return direction === "BUY" ? +(entry - minDistance).toFixed(5) : +(entry + minDistance).toFixed(5);
}

/* ─── Buy/Sell Volume & Cumulative Delta ─── */
function calcBuySellVolume(open: number, high: number, low: number, close: number, volume: number) {
  const range = high - low;
  if (range === 0 || volume === 0) return { buy: 0, sell: 0 };
  const buy = volume * ((close - low) / range);
  const sell = volume * ((high - close) / range);
  return { buy: +buy.toFixed(2), sell: +sell.toFixed(2) };
}

/* ─── Liquidity Zone Detection ─── */
function detectLiquidityZones(candles: any[], symbol: string, timeframe: string) {
  const zones: any[] = [];
  if (candles.length < 10) return zones;

  // Order Blocks: strong move candle preceded by opposite candle
  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    const currBody = Math.abs(curr.close - curr.open);
    const avgBody = candles.slice(Math.max(0, i - 10), i).reduce((s: number, c: any) => s + Math.abs(c.close - c.open), 0) / Math.min(i, 10);

    // Bullish OB: bearish candle followed by strong bullish move
    if (currBody > avgBody * 2 && curr.close > curr.open && prev.close < prev.open) {
      zones.push({
        symbol, timeframe, zone_type: "order_block_bull",
        price_high: prev.open, price_low: prev.close,
        created_at_candle: prev.time, status: "active",
      });
    }
    // Bearish OB: bullish candle followed by strong bearish move
    if (currBody > avgBody * 2 && curr.close < curr.open && prev.close > prev.open) {
      zones.push({
        symbol, timeframe, zone_type: "order_block_bear",
        price_high: prev.close, price_low: prev.open,
        created_at_candle: prev.time, status: "active",
      });
    }

    // Fair Value Gap (FVG)
    if (i >= 2) {
      const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];
      // Bullish FVG: gap between c1.high and c3.low
      if (c3.low > c1.high) {
        zones.push({
          symbol, timeframe, zone_type: "fvg_bull",
          price_high: c3.low, price_low: c1.high,
          created_at_candle: c2.time, status: "active",
        });
      }
      // Bearish FVG: gap between c3.high and c1.low
      if (c3.high < c1.low) {
        zones.push({
          symbol, timeframe, zone_type: "fvg_bear",
          price_high: c1.low, price_low: c3.high,
          created_at_candle: c2.time, status: "active",
        });
      }
    }
  }

  // Liquidity pools: swing highs/lows with equal-level clusters
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high &&
        candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 2].high) {
      swingHighs.push(candles[i].high);
    }
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low &&
        candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 2].low) {
      swingLows.push(candles[i].low);
    }
  }

  // Cluster equal highs (within 0.05%) as liquidity pools
  const threshold = candles[candles.length - 1].close * 0.0005;
  for (let i = 0; i < swingHighs.length; i++) {
    const cluster = swingHighs.filter(h => Math.abs(h - swingHighs[i]) < threshold);
    if (cluster.length >= 2) {
      zones.push({
        symbol, timeframe, zone_type: "liquidity_pool_high",
        price_high: Math.max(...cluster), price_low: Math.min(...cluster),
        created_at_candle: candles[candles.length - 1].time, status: "active",
      });
    }
  }
  for (let i = 0; i < swingLows.length; i++) {
    const cluster = swingLows.filter(l => Math.abs(l - swingLows[i]) < threshold);
    if (cluster.length >= 2) {
      zones.push({
        symbol, timeframe, zone_type: "liquidity_pool_low",
        price_high: Math.max(...cluster), price_low: Math.min(...cluster),
        created_at_candle: candles[candles.length - 1].time, status: "active",
      });
    }
  }

  return zones.slice(0, 20); // Limit per scan
}

/* ─── MTF Alignment ─── */
function determineTrendDirection(closes: number[]): string {
  if (closes.length < 5) return "neutral";
  const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : sma5;
  if (sma5 > sma20 * 1.001) return "bullish";
  if (sma5 < sma20 * 0.999) return "bearish";
  return "neutral";
}

/* ─── MetaApi helpers ─── */
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai";
const CLIENT_API_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440,
};

const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  NAS100: ["NDX100", "NAS100", "USTEC", "NAS100.i"],
  US30: ["US30", "DJ30", "US30.i"],
  XAUUSD: ["XAUUSD", "GOLD", "XAUUSD.i"],
  XAGUSD: ["XAGUSD", "SILVER", "XAGUSD.i"],
  SPX500: ["SPX500", "SP500", "SPX500.i"],
  UK100: ["UK100", "FTSE100", "UK100.i"],
  GER40: ["GER40", "DAX40", "GER40.i"],
  AUDUSD: ["AUDUSD.i", "AUDUSD"],
  NZDUSD: ["NZDUSD.i", "NZDUSD"],
  EURUSD: ["EURUSD.i", "EURUSD"],
  GBPUSD: ["GBPUSD.i", "GBPUSD"],
  USDJPY: ["USDJPY.i", "USDJPY"],
  USDCAD: ["USDCAD.i", "USDCAD"],
  USDCHF: ["USDCHF.i", "USDCHF"],
};

function getBrokerVariants(symbol: string): string[] {
  return BROKER_SYMBOL_MAP[symbol] || [symbol];
}

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCandlesFromBroker(token: string, accountId: string, symbol: string, timeframe: string, limit: number) {
  const tfMinutes = TF_MINUTES[timeframe] || 15;
  const start = new Date(Date.now() - limit * tfMinutes * 60000).toISOString();
  const variants = getBrokerVariants(symbol);
  for (const variant of variants) {
    try {
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(variant)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${limit}`;
      const res = await fetchWithTimeout(url, { headers: { "auth-token": token } });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch { /* try next variant */ }
  }
  throw new Error(`No valid broker symbol found for ${symbol} (tried: ${variants.join(", ")})`);
}

async function fetchPriceFromBroker(token: string, accountId: string, symbol: string) {
  const variants = getBrokerVariants(symbol);
  for (const variant of variants) {
    try {
      const url = `${CLIENT_API_URL}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(variant)}/current-price`;
      const res = await fetchWithTimeout(url, { headers: { "auth-token": token } });
      if (!res.ok) { await res.text(); continue; }
      return await res.json();
    } catch { /* try next variant */ }
  }
  return null;
}

/* ─── Mock data fallback ─── */
function generateMockData(symbol: string) {
  const basePrices: Record<string, number> = {
    XAUUSD: 3250, US30: 42500, NAS100: 21200, NZDUSD: 0.5950, AUDUSD: 0.6450,
    EURUSD: 1.0850, GBPUSD: 1.2650, USDJPY: 155.50,
  };
  const base = basePrices[symbol] ?? 100;
  const vol = base * 0.002;
  const sparkline: number[] = [];
  let p = base;
  for (let i = 0; i < 20; i++) {
    p += (Math.random() - 0.48) * vol;
    sparkline.push(+p.toFixed(5));
  }
  const last = sparkline[sparkline.length - 1];
  const first = sparkline[0];
  const direction = last > first * 1.001 ? "up" : last < first * 0.999 ? "down" : "flat";
  return {
    bid: +(last - vol * 0.1).toFixed(5),
    ask: +(last + vol * 0.1).toFixed(5),
    last_price: +last.toFixed(5),
    rsi: +(40 + Math.random() * 30).toFixed(1),
    adx: +(15 + Math.random() * 25).toFixed(1),
    macd_status: Math.random() > 0.5 ? "Bullish" : "Bearish",
    stoch_rsi: +(20 + Math.random() * 60).toFixed(1),
    volume_today: Math.round(5000 + Math.random() * 15000),
    market_open: true,
    sparkline_data: sparkline,
    price_direction: direction,
    last_candle_time: null as string | null,
  };
}

/* ─── RON V1 (Legacy): analysis with NO-TRADE filters ─── */
function detectSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 13 && h < 22) return "new_york";
  if (h >= 7 && h < 16) return "london";
  if (h >= 0 && h < 9) return "asian";
  return "off_hours";
}

interface AnalysisResult {
  direction: string;
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  risk_reward: string | null;
  ema_crossover_status: string;
  ema_crossover_direction: string | null;
  reasoning: string;
  verdict: string;
  rsi: number | null;
  adx: number | null;
  macd_status: string | null;
  stoch_rsi: number | null;
}

function findSwingLow(lows: number[], endIdx: number, lookback = 20): number {
  const start = Math.max(0, endIdx - lookback);
  let minVal = lows[start];
  for (let i = start + 1; i <= endIdx; i++) {
    if (lows[i] < minVal) minVal = lows[i];
  }
  return minVal;
}

function findSwingHigh(highs: number[], endIdx: number, lookback = 20): number {
  const start = Math.max(0, endIdx - lookback);
  let maxVal = highs[start];
  for (let i = start + 1; i <= endIdx; i++) {
    if (highs[i] > maxVal) maxVal = highs[i];
  }
  return maxVal;
}

// ─── ATR multiplier per instrument category ───
function getAtrSlMultiplier(symbol: string, category?: string): number {
  if (symbol === "XAUUSD" || symbol === "GOLD") return 2.0;
  if (category === "Commodities") return 2.0;
  // Indices and Forex all use 1.5
  return 1.5;
}

// ─── V1 Legacy Analysis (ATR-based SL/TP per instrument) ───
// When useV1Pure is true, the ONLY entry condition is a confirmed EMA 4/17 crossover.
// No ADX, ATR-range, or EMA-flatness filters are applied. Confidence is scored by
// indicator alignment but does NOT gate signal firing.
function runAnalysisV1(candles: any[], useV1Pure = false, rrRatio = 2.0, symbolCategory?: string, symbolName?: string): AnalysisResult {
  const closes = candles.map((c: any) => c.close);
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);
  const volumes = candles.map((c: any) => c.tickVolume || 0);

  // EMA 4/17 crossover — use CLOSED candle
  const ema4 = calcEMA(closes, 4);
  const ema17 = calcEMA(closes, 17);
  const lastIdx = ema4.length - 1;
  const currFast = ema4[lastIdx];
  const currSlow = ema17[lastIdx];
  const prevFast = ema4[lastIdx - 1];
  const prevSlow = ema17[lastIdx - 1];

  let crossoverStatus = "NONE";
  let crossoverDir: string | null = null;
  if (prevFast <= prevSlow && currFast > currSlow) {
    crossoverStatus = "CONFIRMED"; crossoverDir = "BULLISH";
  } else if (prevFast >= prevSlow && currFast < currSlow) {
    crossoverStatus = "CONFIRMED"; crossoverDir = "BEARISH";
  } else if (Math.abs(currFast - currSlow) / currSlow < 0.0003) {
    crossoverStatus = "FORMING";
    crossoverDir = currFast > currSlow ? "BULLISH" : "BEARISH";
  }

  const rsi = calcRSI(closes);
  const adx = calcADX(highs, lows, closes);
  const macd = calcMACDStatus(closes);
  const stochRsi = calcStochRSI(closes);
  const atr = calcATR(highs, lows, closes);
  const avgVolume = volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : 0;
  const lastVolume = volumes[volumes.length - 1] || 0;

  // ─── V1 NO-TRADE FILTERS (SKIPPED when useV1Pure) ───
  if (!useV1Pure) {
    const reasons: string[] = [];
    let noTrade = false;

    if (adx !== null && adx < 20) {
      noTrade = true;
      reasons.push(`ADX at ${adx} — no clear trend, staying flat`);
    }

    if (atr !== null) {
      const avgAtr = calcATR(highs.slice(0, -14), lows.slice(0, -14), closes.slice(0, -14));
      if (avgAtr && atr < avgAtr * 0.6) {
        noTrade = true;
        reasons.push("Price in tight range — ATR well below average");
      }
    }

    if (crossoverStatus === "NONE") {
      const emaDiff = Math.abs(currFast - currSlow) / currSlow;
      const prevDiff = Math.abs(prevFast - prevSlow) / prevSlow;
      if (emaDiff < 0.001 && prevDiff < 0.001) {
        noTrade = true;
        reasons.push("EMAs flat and parallel — no crossover forming");
      }
    }

    if (noTrade) {
      return {
        direction: "NO TRADE", confidence: 1, entry_price: null, take_profit: null,
        stop_loss: null, risk_reward: null, ema_crossover_status: crossoverStatus,
        ema_crossover_direction: crossoverDir,
        reasoning: `[Legacy V1] ${reasons.join(". ")}. No trade conditions met.`,
        verdict: "NO_TRADE", rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
      };
    }
  }

  // ─── V1 CONFIDENCE SCORING ───
  // In V1 Pure mode, confidence is informational only — every crossover fires a signal
  let confidence = 0;
  const tradeReasons: string[] = [];

  if (crossoverStatus === "CONFIRMED" && crossoverDir === "BULLISH") {
    confidence += 3; tradeReasons.push("Confirmed bullish EMA crossover on closed candle");
  } else if (crossoverStatus === "CONFIRMED" && crossoverDir === "BEARISH") {
    confidence += 3; tradeReasons.push("Confirmed bearish EMA crossover on closed candle");
  } else if (crossoverStatus === "FORMING") {
    confidence += 1; tradeReasons.push(`EMA crossover forming (${crossoverDir})`);
  }

  const isBullish = crossoverDir === "BULLISH" || (crossoverStatus === "NONE" && currFast > currSlow);
  const isBearish = crossoverDir === "BEARISH" || (crossoverStatus === "NONE" && currFast < currSlow);
  if (rsi !== null) {
    if (isBullish && rsi > 55) { confidence += 1; tradeReasons.push(`RSI ${rsi} supports bullish momentum`); }
    else if (isBearish && rsi < 45) { confidence += 1; tradeReasons.push(`RSI ${rsi} supports bearish momentum`); }
    if (!useV1Pure && rsi >= 45 && rsi <= 55) { confidence -= 2; tradeReasons.push(`RSI ${rsi} in neutral zone — reduced conviction`); }
  }

  if (macd === "Bullish" && isBullish) { confidence += 1; tradeReasons.push("MACD bullish momentum aligned"); }
  else if (macd === "Bearish" && isBearish) { confidence += 1; tradeReasons.push("MACD bearish momentum aligned"); }

  if (adx !== null && adx > 25) { confidence += 1; tradeReasons.push(`ADX at ${adx} confirms trend strength`); }
  else if (adx !== null && adx > 20) { confidence += 1; tradeReasons.push(`ADX at ${adx} above 20`); }

  if (stochRsi !== null) {
    if (isBullish && stochRsi > 60) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bullish`); }
    else if (isBearish && stochRsi < 40) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bearish`); }
  }

  if (lastVolume > avgVolume * 1.2 && crossoverStatus === "CONFIRMED") {
    confidence += 1; tradeReasons.push("Volume spike on crossover candle");
  }

  confidence = Math.max(1, Math.min(10, confidence));

  // ─── V1 Pure: every confirmed crossover IS a signal ───
  let direction: string;
  let verdict: string;

  if (useV1Pure) {
    // In pure V1 mode, a confirmed crossover always generates a signal
    if (crossoverStatus === "CONFIRMED") {
      direction = crossoverDir === "BULLISH" ? "BUY" : "SELL";
      verdict = direction;
      // Ensure minimum confidence of 5 so signal is always created
      confidence = Math.max(5, confidence);
    } else if (crossoverStatus === "FORMING") {
      direction = crossoverDir === "BULLISH" ? "BUY" : "SELL";
      verdict = "WAIT";
      confidence = Math.max(3, confidence);
    } else {
      // No crossover at all — WAIT (not NO TRADE)
      direction = "WAIT";
      verdict = "WAIT";
    }
  } else {
    // Original V1 logic with confidence gating
    if (confidence >= 5 && crossoverStatus === "CONFIRMED") {
      direction = crossoverDir === "BULLISH" ? "BUY" : "SELL";
      verdict = direction;
    } else if (confidence >= 3 && crossoverStatus !== "NONE") {
      direction = isBullish ? "BUY" : "SELL";
      verdict = "WAIT"; confidence = Math.min(confidence, 4);
    } else {
      direction = "WAIT"; verdict = "WAIT"; confidence = Math.min(confidence, 3);
    }
  }

  // ─── V1 ENTRY / TP / SL (ATR-based, capped to prevent insane distances) ───
  const lastClose = closes[closes.length - 1];
  let entry: number | null = null;
  let tp: number | null = null;
  let sl: number | null = null;
  let rr: string | null = null;

  if (direction === "BUY" || direction === "SELL") {
    entry = +lastClose.toFixed(5);
    const atrVal = calcATR(highs, lows, closes);

    if (atrVal && atrVal > 0) {
      // ATR multiplier varies by instrument type
      const slMult = getAtrSlMultiplier(symbolName || "", symbolCategory);
      const tpMult = slMult * rrRatio; // TP = SL_mult × user R:R ratio

      const atrSl = atrVal * slMult;
      const atrTp = atrVal * tpMult;

      if (direction === "BUY") {
        sl = +(entry - atrSl).toFixed(5);
        tp = +(entry + atrTp).toFixed(5);
      } else {
        sl = +(entry + atrSl).toFixed(5);
        tp = +(entry - atrTp).toFixed(5);
      }

      // ─── SANITY CHECK: SL distance > 2% of entry = something wrong ───
      const slDistPct = Math.abs(entry - sl) / entry;
      if (slDistPct > 0.02) {
        // Skip — this would be an insane SL distance
        entry = null; sl = null; tp = null; rr = null;
        direction = "WAIT";
        verdict = "WAIT";
        tradeReasons.push(`ATR SL distance ${(slDistPct * 100).toFixed(1)}% exceeds 2% safety cap — signal blocked`);
      } else {
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp - entry);
        rr = risk > 0 ? `${(reward / risk).toFixed(1)}:1` : `${rrRatio.toFixed(1)}:1`;
        tradeReasons.push(`ATR14=${atrVal.toFixed(5)}, SL=${atrSl.toFixed(5)} (${slMult}xATR), TP=${atrTp.toFixed(5)} (${tpMult.toFixed(1)}xATR, R:R ${rrRatio}:1)`);
      }
    } else {
      // Fallback: percentage-based
      const pctSl = lastClose * 0.005;
      const pctTp = lastClose * 0.005 * rrRatio;
      if (direction === "BUY") {
        sl = +(entry - pctSl).toFixed(5);
        tp = +(entry + pctTp).toFixed(5);
      } else {
        sl = +(entry + pctSl).toFixed(5);
        tp = +(entry - pctTp).toFixed(5);
      }
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      rr = risk > 0 ? `${(reward / risk).toFixed(1)}:1` : `${rrRatio.toFixed(1)}:1`;
    }
  }

  const reasoningText = tradeReasons.length > 0
    ? `[Legacy V1] ${tradeReasons.join(". ")}. ${entry ? `Entry at ${entry} with SL at ${sl}. R:R ${rr}.` : ""}`
    : `[Legacy V1] No clear setup forming. Monitoring price action.`;

  return {
    direction, confidence, entry_price: entry, take_profit: tp, stop_loss: sl,
    risk_reward: rr, ema_crossover_status: crossoverStatus,
    ema_crossover_direction: crossoverDir, reasoning: reasoningText, verdict,
    rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
  };
}

// ─── RON V2: Knowledge Base layer on top of V1 ───
interface KnowledgeRule {
  id: string;
  category: string;
  rule_name: string;
  rule_text: string;
  priority: number;
  is_active: boolean;
  version: string;
}

function countCrossovers(ema4: number[], ema17: number[], lookback: number): number {
  let count = 0;
  const start = Math.max(1, ema4.length - lookback);
  for (let i = start; i < ema4.length; i++) {
    const prevAbove = ema4[i - 1] > ema17[i - 1];
    const currAbove = ema4[i] > ema17[i];
    if (prevAbove !== currAbove) count++;
  }
  return count;
}

function calcSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(values[i]); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function applyV2Rules(v1Result: AnalysisResult, candles: any[], rules: KnowledgeRule[], session: string, recentSignalCount: number): AnalysisResult {
  if (rules.length === 0) return v1Result;

  const closes = candles.map((c: any) => c.close);
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);
  const ema4 = calcEMA(closes, 4);
  const ema17 = calcEMA(closes, 17);

  let confidence = v1Result.confidence;
  const v2Notes: string[] = [];
  let forceNoTrade = false;

  // Get active rules by category
  const noTradeRules = rules.filter(r => r.category === "no_trade_rules" && r.is_active);
  const entryRules = rules.filter(r => r.category === "entry_rules" && r.is_active);
  const sessionRules = rules.filter(r => r.category === "session_rules" && r.is_active);
  const riskRules = rules.filter(r => r.category === "risk_management" && r.is_active);

  // ─── Apply NO-TRADE rules FIRST (priority 9+ override to NO_TRADE) ───
  for (const rule of noTradeRules) {
    if (rule.rule_name === "Low ADX Filter" && v1Result.adx !== null && v1Result.adx < 18) {
      if (rule.priority >= 9) forceNoTrade = true;
      v2Notes.push(`ADX ${v1Result.adx} < 18 — no trend ✗`);
    }

    if (rule.rule_name === "Choppy Market Detection") {
      const crossovers = countCrossovers(ema4, ema17, 25);
      if (crossovers >= 3) {
        if (rule.priority >= 9) forceNoTrade = true;
        v2Notes.push(`${crossovers} crossovers in 25 candles — choppy ✗`);
      } else {
        v2Notes.push("Not in choppy market ✓");
      }
    }

    if (rule.rule_name === "Overtrading Prevention" && recentSignalCount >= 2) {
      if (rule.priority >= 8) forceNoTrade = true;
      v2Notes.push(`${recentSignalCount} signals in 2h window — overtrading ✗`);
    }

    if (rule.rule_name === "RSI Extreme Caution" && v1Result.rsi !== null) {
      if (v1Result.rsi > 75 && v1Result.direction === "BUY") {
        confidence -= 1;
        v2Notes.push(`RSI ${v1Result.rsi} overbought — no BUY ✗`);
        if (rule.priority >= 8) forceNoTrade = true;
      }
      if (v1Result.rsi < 25 && v1Result.direction === "SELL") {
        confidence -= 1;
        v2Notes.push(`RSI ${v1Result.rsi} oversold — no SELL ✗`);
        if (rule.priority >= 8) forceNoTrade = true;
      }
    }

    if (rule.rule_name === "Tight Range Filter") {
      const recent10 = candles.slice(-10);
      const range10 = Math.max(...recent10.map((c: any) => c.high)) - Math.min(...recent10.map((c: any) => c.low));
      const avg50 = candles.slice(-50);
      const range50 = avg50.length > 0 ? (Math.max(...avg50.map((c: any) => c.high)) - Math.min(...avg50.map((c: any) => c.low))) / (avg50.length / 10) : range10;
      if (range10 < range50 * 0.5) {
        v2Notes.push("Tight range — market too quiet ✗");
        if (rule.priority >= 7) confidence -= 1;
      }
    }
  }

  if (forceNoTrade) {
    return {
      ...v1Result,
      direction: "NO TRADE", confidence: 0, verdict: "NO_TRADE",
      entry_price: null, take_profit: null, stop_loss: null, risk_reward: null,
      reasoning: `${v1Result.reasoning} [RON V2] ${v2Notes.join(" | ")} | BLOCKED by knowledge base rules.`,
    };
  }

  // ─── Apply ENTRY rules ───
  for (const rule of entryRules) {
    if (rule.rule_name === "EMA Crossover Confirmation" && v1Result.ema_crossover_status === "CONFIRMED") {
      if (rule.priority >= 9) confidence += 1;
      v2Notes.push("Crossover confirmed on closed candle ✓");
    }

    if (rule.rule_name === "Multiple Confluence Required") {
      let confluenceCount = 0;
      if (v1Result.ema_crossover_status === "CONFIRMED") confluenceCount++;
      if (v1Result.rsi !== null && ((v1Result.direction === "BUY" && v1Result.rsi > 55) || (v1Result.direction === "SELL" && v1Result.rsi < 45))) confluenceCount++;
      if (v1Result.macd_status === "Bullish" && v1Result.direction === "BUY") confluenceCount++;
      if (v1Result.macd_status === "Bearish" && v1Result.direction === "SELL") confluenceCount++;
      if (v1Result.adx !== null && v1Result.adx > 25) confluenceCount++;
      v2Notes.push(`Multiple confluence: ${confluenceCount}/5 indicators aligned ${confluenceCount >= 3 ? "✓" : "✗"}`);
      if (confluenceCount < 3 && rule.priority >= 9) confidence -= 1;
    }

    if (rule.rule_name === "Fresh Crossover Only") {
      const crossovers = countCrossovers(ema4, ema17, 20);
      if (crossovers >= 3) {
        v2Notes.push(`${crossovers} crossovers in 20 candles — not fresh ✗`);
        if (rule.priority >= 9) confidence -= 2;
      }
    }

    if (rule.rule_name === "Trend Alignment" && closes.length >= 50) {
      const sma50 = calcSMA(closes, 50);
      const smaSlope = sma50[sma50.length - 1] - sma50[sma50.length - 5];
      const trendUp = smaSlope > 0;
      if ((v1Result.direction === "BUY" && !trendUp) || (v1Result.direction === "SELL" && trendUp)) {
        confidence -= 2;
        v2Notes.push(`SMA50 conflicts with ${v1Result.direction} — reduced confidence ✗`);
      } else if ((v1Result.direction === "BUY" && trendUp) || (v1Result.direction === "SELL" && !trendUp)) {
        v2Notes.push(`SMA50 aligns with ${v1Result.direction} ✓`);
      }
    }
  }

  // ─── Apply SESSION rules ───
  const utcHour = new Date().getUTCHours();
  for (const rule of sessionRules) {
    if (rule.rule_name === "London Open Power" && utcHour >= 8 && utcHour < 9) {
      confidence += 1;
      v2Notes.push("London session open +1 bonus ✓");
    }
    if (rule.rule_name === "NY/London Overlap" && utcHour >= 13 && utcHour < 17) {
      confidence += 1;
      v2Notes.push("NY/London overlap +1 bonus ✓");
    }
    if (rule.rule_name === "Asian Session Caution" && utcHour >= 0 && utcHour < 8) {
      v2Notes.push("Asian session — tighter TP applied");
    }
  }

  // ─── Apply RISK rules: ATR-based SL/TP with structural validation ───
  let entry = v1Result.entry_price;
  let tp = v1Result.take_profit;
  let sl = v1Result.stop_loss;
  let rr = v1Result.risk_reward;

  if (entry && (v1Result.direction === "BUY" || v1Result.direction === "SELL")) {
    const atrVal = calcATR(highs, lows, closes);

    for (const rule of riskRules) {
      if ((rule.rule_name === "Stop Loss Behind Structure" || rule.rule_name === "V2 Structure-Based SL") && atrVal) {
        const minSl = atrVal; // Never tighter than 1x ATR
        if (v1Result.direction === "BUY") {
          const swingLow = findSwingLow(lows, lows.length - 1, 20);
          const swingDist = entry - swingLow;
          const atrDist = atrVal * 1.5;
          const slDist = Math.max(swingDist, atrDist, minSl);
          sl = +(entry - slDist).toFixed(5);
          v2Notes.push(`SL behind swing low, ATR-validated at ${sl} ✓`);
        } else {
          const swingHigh = findSwingHigh(highs, highs.length - 1, 20);
          const swingDist = swingHigh - entry;
          const atrDist = atrVal * 1.5;
          const slDist = Math.max(swingDist, atrDist, minSl);
          sl = +(entry + slDist).toFixed(5);
          v2Notes.push(`SL behind swing high, ATR-validated at ${sl} ✓`);
        }
      }
    }

    // Enforce minimum 2:1 R:R
    if (sl && entry) {
      const risk = Math.abs(entry - sl);
      // TP must be at least 2x risk
      const minTp = v1Result.direction === "BUY" ? +(entry + risk * 2).toFixed(5) : +(entry - risk * 2).toFixed(5);
      tp = tp ? (v1Result.direction === "BUY" ? Math.max(tp, minTp) : Math.min(tp, minTp)) : minTp;
      tp = +tp.toFixed(5);

      const reward = Math.abs(tp - entry);
      const rrVal = risk > 0 ? reward / risk : 2;
      rr = `${rrVal.toFixed(1)}:1`;
      v2Notes.push(`R:R ${rr} ✓`);

      // Asian session: tighter TP (but still enforce 1.4:1 minimum)
      if (utcHour >= 0 && utcHour < 8 && sessionRules.some(r => r.rule_name === "Asian Session Caution")) {
        tp = v1Result.direction === "BUY" ? +(entry + risk * 1.4).toFixed(5) : +(entry - risk * 1.4).toFixed(5);
        rr = "1.4:1";
      }

      // V2 Asymmetric R:R Enforcement — NO_TRADE if can't achieve 2:1
      if (rrVal < 2 && riskRules.some(r => (r.rule_name === "Minimum R:R 2:1" || r.rule_name === "V2 Asymmetric R:R Enforcement") && r.priority >= 10)) {
        v2Notes.push("R:R below 2:1 — structure doesn't support trade ✗");
        forceNoTrade = true;
      }
    }
  }

  if (forceNoTrade) {
    return {
      ...v1Result,
      direction: "NO TRADE", confidence: 0, verdict: "NO_TRADE",
      entry_price: null, take_profit: null, stop_loss: null, risk_reward: null,
      reasoning: `${v1Result.reasoning} [RON V2] ${v2Notes.join(" | ")} | BLOCKED — insufficient R:R or knowledge base rules.`,
    };
  }

  // ─── Final confidence clamping ───
  confidence = Math.max(0, Math.min(10, confidence));

  // V2: require >= 6 for BUY/SELL
  let finalDirection = v1Result.direction;
  let finalVerdict = v1Result.verdict;
  if (confidence < 6 && (finalDirection === "BUY" || finalDirection === "SELL")) {
    finalVerdict = "WAIT";
  }

  const convictionLabel = confidence >= 8 ? "HIGH CONVICTION" : confidence >= 6 ? "MODERATE" : "LOW";
  v2Notes.push(`${session} session active`);
  v2Notes.push(`Final confidence: ${confidence}/10 ${convictionLabel} ${finalDirection}`);

  const fullReasoning = `${v1Result.reasoning} [RON V2] ${v2Notes.join(" | ")}`;

  return {
    ...v1Result,
    direction: finalDirection,
    confidence,
    verdict: finalVerdict,
    entry_price: entry,
    take_profit: tp,
    stop_loss: sl,
    risk_reward: rr,
    reasoning: fullReasoning,
  };
}

// Wrapper: runs V1, then optionally layers V2
// useV1Pure: when true, V1 fires on every EMA crossover with no additional filters
function runAnalysis(candles: any[], v2Rules: KnowledgeRule[] = [], session = "", recentSignalCount = 0, useV2 = true, useV1Pure = false, rrRatio = 2.0, symbolCategory?: string, symbolName?: string): AnalysisResult {
  const v1Result = runAnalysisV1(candles, useV1Pure, rrRatio, symbolCategory, symbolName);
  if (!useV2 || v2Rules.length === 0) return v1Result;
  return applyV2Rules(v1Result, candles, v2Rules, session, recentSignalCount);
}

/* ─── Session detection for volume summaries ─── */
const SESSION_DEFS = [
  { key: "asian", startUtc: 0, endUtc: 8 },
  { key: "london", startUtc: 8, endUtc: 16 },
  { key: "new_york", startUtc: 16, endUtc: 21 },
];

function getCompletedSessions(utcHour: number): typeof SESSION_DEFS {
  return SESSION_DEFS.filter(s => utcHour >= s.endUtc);
}

async function fetchHourlyCandles(token: string, accountId: string, symbol: string, startISO: string, endISO: string) {
  const variants = getBrokerVariants(symbol);
  for (const variant of variants) {
    try {
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(variant)}/timeframes/1h/candles?startTime=${encodeURIComponent(startISO)}&limit=500`;
      const res = await fetch(url, { headers: { "auth-token": token } });
      if (!res.ok) continue;
      const candles = await res.json();
      if (Array.isArray(candles) && candles.length > 0) {
        const startTs = new Date(startISO).getTime();
        const endTs = new Date(endISO).getTime();
        return candles.filter((c: any) => {
          const t = new Date(c.time).getTime();
          return t >= startTs && t < endTs;
        });
      }
    } catch { /* try next */ }
  }
  return [];
}

// Market hours gate: skip scanning during closed hours, but allow 2hr pre-open warmup
// Forex/Commodities/Indices all share the same weekend window:
//   Closed: Friday 21:00 UTC → Sunday 19:00 UTC (2hrs before Sunday 21:00 open)
// The ~1hr daily break for commodities/indices is intentionally scanned through.
function isMarketClosed(): boolean {
  const now = new Date();
  const dayUTC = now.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  const hourUTC = now.getUTCHours();

  // Saturday: always closed
  if (dayUTC === 6) return true;

  // Friday after 21:00 UTC: closed
  if (dayUTC === 5 && hourUTC >= 21) return true;

  // Sunday before 19:00 UTC: closed (markets open ~21:00, but we start scanning 2hrs early)
  if (dayUTC === 0 && hourUTC < 19) return true;

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Check market hours — skip chart/signal scanning when markets are closed
    if (isMarketClosed()) {
      return new Response(JSON.stringify({ success: true, message: "Markets closed — skipping scan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get all users with their instruments INCLUDING timeframe
    const { data: instruments } = await supabase
      .from("user_instruments")
      .select("user_id, symbol, timeframe");

    if (!instruments || instruments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No instruments to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Timeframe ranking for shortest-wins resolution
    const TF_MINUTES: Record<string, number> = {
      "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1H": 60, "4h": 240, "4H": 240, "1d": 1440, "1D": 1440,
    };
    const tfToMinutes = (tf: string) => TF_MINUTES[tf] ?? 15;

    // Group by user, preserving timeframe per instrument — keep SHORTEST timeframe per symbol
    interface UserInstrument { symbol: string; timeframe: string; }
    const userInstruments = new Map<string, UserInstrument[]>();
    for (const row of instruments) {
      const list = userInstruments.get(row.user_id) || [];
      const existing = list.find(i => i.symbol === row.symbol);
      const rowTf = row.timeframe || "15m";
      if (existing) {
        // Keep the shortest timeframe
        if (tfToMinutes(rowTf) < tfToMinutes(existing.timeframe)) {
          existing.timeframe = rowTf;
        }
      } else {
        list.push({ symbol: row.symbol, timeframe: rowTf });
      }
      userInstruments.set(row.user_id, list);
    }

    // Unique symbol+timeframe combos to fetch — resolve to shortest across all users
    const symbolTfSet = new Map<string, string>();
    for (const list of userInstruments.values()) {
      for (const inst of list) {
        const existing = symbolTfSet.get(inst.symbol);
        if (!existing || tfToMinutes(inst.timeframe) < tfToMinutes(existing)) {
          symbolTfSet.set(inst.symbol, inst.timeframe);
        }
      }
    }

    // Hardcoded account ID — no provisioning
    const accountId = "ea940a26-d263-4017-ad2c-0412f8399b69";

    // Get existing last_candle_time from live_market_data (for candle close detection)
    const { data: existingLive } = await supabase
      .from("live_market_data")
      .select("user_id, symbol, last_candle_time");
    const prevCandleTimes = new Map<string, string | null>();
    if (existingLive) {
      for (const row of existingLive as any[]) {
        prevCandleTimes.set(`${row.user_id}:${row.symbol}`, row.last_candle_time);
      }
    }

    // ─── TIME BUDGET: track elapsed time to skip non-critical work ───
    const startTime = Date.now();
    const elapsed = () => Date.now() - startTime;
    const TIME_LIMIT_CRITICAL = 100_000; // 100s: skip non-critical after this
    const TIME_LIMIT_HARD = 130_000;     // 130s: bail out entirely

    // Fetch data for all symbols IN PARALLEL with concurrency limit
    const symbolData = new Map<string, any>();
    const symbolCandles = new Map<string, any[]>();
    let usedLive = false;

    const symbolEntries = [...symbolTfSet.entries()];

    if (METAAPI_TOKEN && accountId) {
      // Process in batches of 5 to avoid overwhelming the API
      const BATCH_SIZE = 5;
      for (let b = 0; b < symbolEntries.length; b += BATCH_SIZE) {
        if (elapsed() > TIME_LIMIT_CRITICAL) {
          console.warn(`Time budget exceeded at symbol fetch (${elapsed()}ms) — using mock for remaining`);
          break;
        }
        const batch = symbolEntries.slice(b, b + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async ([symbol, timeframe]) => {
            const [candles, price] = await Promise.all([
              fetchCandlesFromBroker(METAAPI_TOKEN!, accountId, symbol, timeframe, 100),
              fetchPriceFromBroker(METAAPI_TOKEN!, accountId, symbol),
            ]);
            return { symbol, timeframe, candles, price };
          })
        );

        for (const res of results) {
          if (res.status === "rejected") {
            console.warn(`Broker fetch failed:`, res.reason?.message || res.reason);
            continue;
          }
          const { symbol, timeframe, candles, price } = res.value;
          if (candles && candles.length > 0) {
            symbolCandles.set(symbol, candles);
            usedLive = true;

            // ─── PERSIST CANDLES TO candle_history with buy/sell volume ───
            let cumulativeDelta = 0;
            const candleRows = candles.map((c: any) => {
              const vol = c.tickVolume || 0;
              const bsv = calcBuySellVolume(c.open, c.high, c.low, c.close, vol);
              cumulativeDelta += (bsv.buy - bsv.sell);
              return {
                symbol, timeframe, timestamp: c.time,
                open: c.open, high: c.high, low: c.low, close: c.close,
                volume: vol, buy_volume: bsv.buy, sell_volume: bsv.sell,
                cumulative_delta: +cumulativeDelta.toFixed(2),
              };
            });
            const { error: chErr } = await supabase
              .from("candle_history")
              .upsert(candleRows, { onConflict: "symbol,timeframe,timestamp", ignoreDuplicates: true });
            if (chErr) console.warn(`candle_history insert warn for ${symbol}:`, chErr.message);

            const closes = candles.map((c: any) => c.close);
            const lastPrice = price?.bid ?? closes[closes.length - 1];
            const highs = candles.map((c: any) => c.high);
            const lows = candles.map((c: any) => c.low);

            const rsi = calcRSI(closes);
            const adx = calcADX(highs, lows, closes);
            const macd = calcMACDStatus(closes);
            const stochRsi = calcStochRSI(closes);

            const sparkline = closes.slice(-20);
            const first = sparkline[0];
            const last = sparkline[sparkline.length - 1];
            const direction = last > first * 1.001 ? "up" : last < first * 0.999 ? "down" : "flat";

            const lastCandle = candles[candles.length - 1];
            const tfMin = TF_MINUTES[timeframe] || 15;
            const candleBucket = Math.floor(new Date(lastCandle.time).getTime() / (tfMin * 60000));

            symbolData.set(symbol, {
              bid: price?.bid ?? +(lastPrice - lastPrice * 0.0001).toFixed(5),
              ask: price?.ask ?? +(lastPrice + lastPrice * 0.0001).toFixed(5),
              last_price: +lastPrice.toFixed(5),
              rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
              volume_today: candles.reduce((s: number, c: any) => s + (c.tickVolume || 0), 0),
              market_open: true,
              sparkline_data: sparkline,
              price_direction: direction,
              last_candle_time: new Date(candleBucket * tfMin * 60000).toISOString(),
            });
          }
        }
      }
    }

    // Fill remaining with mock
    for (const [symbol, timeframe] of symbolEntries) {
      if (!symbolData.has(symbol)) {
        const mock = generateMockData(symbol);
        const tfMin = TF_MINUTES[timeframe] || 15;
        const candleBucket = Math.floor(Date.now() / (tfMin * 60000));
        mock.last_candle_time = new Date(candleBucket * tfMin * 60000).toISOString();
        symbolData.set(symbol, mock);
      }
    }

    // ─── SPIKE / ANOMALY DETECTION ───
    const spikeAlerts: { symbol: string; magnitude: number; direction: string }[] = [];

    for (const [symbol, candles] of symbolCandles) {
      if (!Array.isArray(candles) || candles.length < 6) continue;
      const recent = candles.slice(-6);
      const priceNow = recent[recent.length - 1].close;
      const price5Ago = recent[0].close;
      const pctMove = ((priceNow - price5Ago) / price5Ago) * 100;

      if (Math.abs(pctMove) >= 1.0) {
        spikeAlerts.push({
          symbol,
          magnitude: +pctMove.toFixed(2),
          direction: pctMove > 0 ? "up" : "down",
        });

        // Update symbolData with spike info
        const sd = symbolData.get(symbol);
        if (sd) {
          sd.last_spike_at = new Date().toISOString();
          sd.spike_magnitude = +Math.abs(pctMove).toFixed(2);
        }

        // Rate-limit: max 1 spike alert per instrument per hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existingSpike } = await supabase
          .from("news_items")
          .select("id")
          .eq("source", "SPIKE_ALERT")
          .contains("instruments_affected", [symbol])
          .gte("published_at", oneHourAgo)
          .limit(1);

        if (!existingSpike || existingSpike.length === 0) {
          await supabase.from("news_items").insert({
            headline: `⚡ SPIKE DETECTED — ${symbol} moved ${pctMove > 0 ? "+" : ""}${pctMove.toFixed(1)}% in 5 candles`,
            source: "SPIKE_ALERT",
            impact: "high",
            instruments_affected: [symbol],
          });
        }
      }

      // Anomalous candle detection: single candle range > 5x average (raised from 3x)
      const ranges = candles.map((c: any) => c.high - c.low);
      const avgRange = ranges.reduce((a: number, b: number) => a + b, 0) / ranges.length;
      const lastRange = ranges[ranges.length - 1];
      if (avgRange > 0 && lastRange > avgRange * 5) {
        const anomalyMag = (lastRange / avgRange).toFixed(1);
        // Rate-limit: max 1 anomaly alert per instrument per hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existingAnomaly } = await supabase
          .from("news_items")
          .select("id")
          .eq("source", "SPIKE_ALERT")
          .contains("instruments_affected", [symbol])
          .gte("published_at", oneHourAgo)
          .limit(1);

        if (!existingAnomaly || existingAnomaly.length === 0) {
          await supabase.from("news_items").insert({
            headline: `🕯️ Anomalous candle on ${symbol} — range ${anomalyMag}x average`,
            source: "SPIKE_ALERT",
            impact: "medium",
            instruments_affected: [symbol],
          });
        }
      }
    }

    // Upsert live_market_data for each user
    const upserts: any[] = [];
    for (const [userId, instList] of userInstruments) {
      for (const inst of instList) {
        const data = symbolData.get(inst.symbol);
        if (!data) continue;
        upserts.push({
          user_id: userId,
          symbol: inst.symbol,
          ...data,
          updated_at: new Date().toISOString(),
        });
      }

      // Insert spike insights for each user
      for (const spike of spikeAlerts) {
        if (instList.some(i => i.symbol === spike.symbol)) {
          await supabase.from("insights").insert({
            user_id: userId,
            insight_type: "spike_detection",
            title: `⚡ ${spike.symbol} Spike: ${spike.direction === "up" ? "+" : ""}${spike.magnitude}%`,
            description: `Price moved ${spike.magnitude}% in 5 candles. ${spike.direction === "up" ? "Bullish" : "Bearish"} spike detected — monitor for continuation or reversal.`,
            symbol: spike.symbol,
            severity: Math.abs(spike.magnitude) >= 2 ? "high" : "medium",
            data: { magnitude: spike.magnitude, direction: spike.direction },
          });
        }
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from("live_market_data")
        .upsert(upserts, { onConflict: "user_id,symbol" });
      if (error) console.error("Upsert error:", error);
    }

    // ─── RON AUTO-SCAN: detect candle closes with STRICT DEDUP ───
    // Load V2 knowledge base rules
    const { data: v2Rules } = await supabase.from("falconer_knowledge").select("*").eq("is_active", true);
    const activeRules: KnowledgeRule[] = (v2Rules || []) as KnowledgeRule[];

    // Load instrument library for pip sizes
    const { data: instrumentLib } = await supabase.from("instrument_library").select("symbol, pip_size, pip_value_per_lot, category");
    const pipSizeMap = new Map<string, number>();
    const pipValueMap = new Map<string, number>();
    const categoryMap = new Map<string, string>();
    if (instrumentLib) {
      for (const il of instrumentLib) {
        pipSizeMap.set(il.symbol, il.pip_size);
        pipValueMap.set(il.symbol, il.pip_value_per_lot);
        categoryMap.set(il.symbol, il.category);
      }
    }

    // Helper: get pip size for a symbol
    function getPipSize(symbol: string): number {
      if (pipSizeMap.has(symbol)) return pipSizeMap.get(symbol)!;
      // Fallback heuristics
      if (symbol.includes("JPY")) return 0.01;
      if (symbol === "XAUUSD" || symbol === "GOLD") return 0.1; // Gold: 10 pips per $1 move
      if (["US30", "NAS100", "SPX500", "UK100", "GER40", "HK50", "JPN225", "AUS200"].some(idx => symbol.includes(idx))) return 1.0;
      return 0.0001; // Standard forex
    }

    // Helper: convert price diff to pips
    function priceToPips(priceDiff: number, symbol: string): number {
      const pipSize = getPipSize(symbol);
      return pipSize > 0 ? priceDiff / pipSize : 0;
    }

    let autoScans = 0;
    let signalsCreated = 0;
    const session = detectSession();

    for (const [userId, instList] of userInstruments) {
      const [profileRes, sigPrefRes] = await Promise.all([
        supabase.from("profiles").select("default_candle_type, ema_fast, ema_slow, signals_paused, rr_ratio").eq("id", userId).single(),
        supabase.from("user_signal_preferences").select("signal_engine").eq("user_id", userId).maybeSingle(),
      ]);
      const profile = profileRes.data;

      // ─── KILL SWITCH: skip signal generation if paused ───
      const signalsPaused = Boolean(profile?.signals_paused);

      // User's R:R ratio preference (default 2.0)
      const rrRatio = (profile as any)?.rr_ratio ?? 2.0;

      // Determine engine: v1 = pure V1 (no filters, crossover only), v2 = V2 rules, v1v2 = combined
      const signalEngine = sigPrefRes.data?.signal_engine || "v1"; // Default to V1
      const useV2 = signalEngine === "v2" || signalEngine === "v1v2";
      const useV1Pure = signalEngine === "v1"; // Pure V1: only EMA crossover, no extra filters

      for (const inst of instList) {
        const data = symbolData.get(inst.symbol);
        if (!data || !data.last_candle_time) continue;

        const prevKey = `${userId}:${inst.symbol}`;
        const prevTime = prevCandleTimes.get(prevKey);
        const newTime = data.last_candle_time;

        // Candle close detected: new candle time differs from previous
        if (prevTime && newTime && prevTime !== newTime) {
          console.log(`Candle close: ${inst.symbol} (${inst.timeframe}) user ${userId.slice(0, 8)}`);

          // Count recent signals for overtrading prevention
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { count: recentSignalCount } = await supabase
            .from("signals")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("symbol", inst.symbol)
            .gte("created_at", twoHoursAgo);

          const candles = symbolCandles.get(inst.symbol);
          let analysis: AnalysisResult;

          if (candles && candles.length > 20) {
            const instCategory = categoryMap.get(inst.symbol);
            analysis = runAnalysis(candles, activeRules, session, recentSignalCount || 0, useV2, useV1Pure, rrRatio, instCategory, inst.symbol);
          } else {
            // Mock analysis — still apply RON logic
            const mockRsi = data.rsi;
            const mockAdx = data.adx;
            const mockMacd = data.macd_status;
            const mockStoch = data.stoch_rsi;
            
            // Apply NO-TRADE filter for mock too (skip in V1 Pure mode)
            if (!useV1Pure && mockAdx !== null && mockAdx < 20) {
              analysis = {
                direction: "NO TRADE", confidence: 1, entry_price: null, take_profit: null,
                stop_loss: null, risk_reward: null, ema_crossover_status: "NONE",
                ema_crossover_direction: null,
                reasoning: `RON: ADX at ${mockAdx} — no clear trend. Staying flat until momentum develops.`,
                verdict: "NO_TRADE", rsi: mockRsi, adx: mockAdx, macd_status: mockMacd, stoch_rsi: mockStoch,
              };
            } else {
              const bullish = (mockRsi > 55 ? 1 : 0) + (mockMacd === "Bullish" ? 1 : 0) + (mockStoch > 60 ? 1 : 0) + (mockAdx > 25 ? 1 : 0);
              const bearish = (mockRsi < 45 ? 1 : 0) + (mockMacd === "Bearish" ? 1 : 0) + (mockStoch < 40 ? 1 : 0) + (mockAdx > 25 ? 1 : 0);
              const dir = bullish >= 3 ? "BUY" : bearish >= 3 ? "SELL" : "WAIT";
              const conf = Math.max(1, Math.min(10, Math.max(bullish, bearish) + 1));
              const lastPrice = data.last_price || 100;
              const range = lastPrice * 0.005;

              analysis = {
                direction: dir, confidence: conf,
                entry_price: dir !== "WAIT" ? lastPrice : null,
                take_profit: dir === "BUY" ? +(lastPrice + range * 2).toFixed(5) : dir === "SELL" ? +(lastPrice - range * 2).toFixed(5) : null,
                stop_loss: dir === "BUY" ? +(lastPrice - range).toFixed(5) : dir === "SELL" ? +(lastPrice + range).toFixed(5) : null,
                risk_reward: dir !== "WAIT" ? "2.0:1" : null,
                ema_crossover_status: "NONE", ema_crossover_direction: null,
                reasoning: `RON: Auto-scan on ${inst.timeframe}. RSI ${mockRsi}, ADX ${mockAdx}, MACD ${mockMacd}, StochRSI ${mockStoch}. ${dir === "WAIT" ? "No clear setup — monitoring." : `${dir} signal with ${conf}/10 confidence.`}`,
                verdict: dir === "WAIT" ? "WAIT" : dir, rsi: mockRsi, adx: mockAdx, macd_status: mockMacd, stoch_rsi: mockStoch,
              };
            }
          }

          // ─── STRICT SCAN DEDUPLICATION ───
          // Check most recent scan for this user+symbol
          const { data: lastScan } = await supabase
            .from("scan_results")
           .select("id, direction, entry_price, verdict")
            .eq("user_id", userId)
            .eq("symbol", inst.symbol)
            .order("scanned_at", { ascending: false })
            .limit(1);

          let shouldInsertScan = true;
          if (lastScan && lastScan.length > 0) {
            const prev = lastScan[0];
            const dirChanged = prev.direction !== analysis.direction;
            const entryChanged = analysis.entry_price && prev.entry_price
              ? Math.abs(prev.entry_price - analysis.entry_price) / analysis.entry_price > 0.005
              : false;

            // Skip scan if nothing meaningful changed (same direction AND entry within 0.5%)
            if (!dirChanged && !entryChanged) {
              shouldInsertScan = false;
              // Just update the timestamp on existing scan
              await supabase.from("scan_results")
                .update({ scanned_at: new Date().toISOString() })
                .eq("id", prev.id);
              console.log(`Dedup skip: ${inst.symbol} — same direction, entry within 0.5%`);
            }
          }

          if (shouldInsertScan) {
            const { error: scanErr } = await supabase.from("scan_results").insert({
              user_id: userId, symbol: inst.symbol, direction: analysis.direction,
              confidence: analysis.confidence, entry_price: analysis.entry_price,
              take_profit: analysis.take_profit, stop_loss: analysis.stop_loss,
              risk_reward: analysis.risk_reward, rsi: analysis.rsi, adx: analysis.adx,
              macd_status: analysis.macd_status, stoch_rsi: analysis.stoch_rsi,
              ema_crossover_status: analysis.ema_crossover_status,
              ema_crossover_direction: analysis.ema_crossover_direction,
              reasoning: analysis.reasoning, verdict: analysis.verdict,
              timeframe: inst.timeframe, candle_type: profile?.default_candle_type || "heiken_ashi",
              session, scanned_at: new Date().toISOString(),
            });
            if (scanErr) console.error(`Scan insert error for ${inst.symbol}:`, scanErr);
            else autoScans++;

            // ─── PATTERN BOOST: check for active patterns ───
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: activePatterns } = await supabase
              .from("insights")
              .select("data, title")
              .eq("user_id", userId)
              .eq("symbol", inst.symbol)
              .eq("insight_type", "pattern_detected")
              .gte("created_at", oneHourAgo)
              .order("created_at", { ascending: false })
              .limit(1);

            if (activePatterns && activePatterns.length > 0) {
              const patData = activePatterns[0].data as any;
              if (patData?.direction) {
                const patternAligns =
                  (patData.direction === "bullish" && analysis.direction === "BUY") ||
                  (patData.direction === "bearish" && analysis.direction === "SELL");
                if (patternAligns) {
                  analysis.confidence = Math.min(10, analysis.confidence + 1);
                  analysis.reasoning += ` [RON Pattern] ${patData.pattern} pattern aligns with signal — confidence boosted.`;
                  console.log(`Pattern boost: ${inst.symbol} ${patData.pattern} aligns with ${analysis.direction}`);
                }
              }
            }

            if (signalsPaused) {
              console.log(`Signals paused for user ${userId.slice(0, 8)} — scan saved, signal creation skipped for ${inst.symbol}`);
              continue;
            }

            const hasValidTradeLevels = validateTradeLevels(analysis.direction, analysis.entry_price, analysis.take_profit, analysis.stop_loss);
            if (!hasValidTradeLevels && analysis.entry_price && analysis.stop_loss) {
              analysis.stop_loss = ensureMinimumStopDistance(analysis.entry_price, analysis.direction, Math.abs(analysis.entry_price - analysis.stop_loss), inst.symbol);
            }

            const validAfterAdjustment = validateTradeLevels(analysis.direction, analysis.entry_price, analysis.take_profit, analysis.stop_loss);

            // ─── SIGNAL CREATION: strict ONE active signal per instrument ───
            if (analysis.confidence >= 5 && validAfterAdjustment && (analysis.direction === "BUY" || analysis.direction === "SELL") && analysis.entry_price && analysis.take_profit && analysis.stop_loss) {
              // RULE 1: Only ONE pending signal per instrument at any time
              const { data: existingPending } = await supabase
                .from("signals")
                .select("id, direction, entry_price")
                .eq("user_id", userId)
                .eq("symbol", inst.symbol)
                .eq("result", "pending")
                .limit(1);

              if (existingPending && existingPending.length > 0) {
                console.log(`Dedup: ${inst.symbol} already has a PENDING signal — skipping`);
              } else {
                // RULE 2: Candle-period dedup — max one signal per candle window
                const tfMin = TF_MINUTES[inst.timeframe] || 15;
                const candleWindowStart = new Date(Math.floor(Date.now() / (tfMin * 60000)) * tfMin * 60000).toISOString();
                const { data: candlePeriodSignals } = await supabase
                  .from("signals")
                  .select("id")
                  .eq("user_id", userId)
                  .eq("symbol", inst.symbol)
                  .gte("created_at", candleWindowStart)
                  .limit(1);

                if (candlePeriodSignals && candlePeriodSignals.length > 0) {
                  console.log(`Candle-period dedup: ${inst.symbol} already has signal in current ${inst.timeframe} window`);
                } else {
                  const { data: latestScan } = await supabase
                    .from("scan_results")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("symbol", inst.symbol)
                    .order("scanned_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  await supabase.from("signals").insert({
                    user_id: userId, symbol: inst.symbol, direction: analysis.direction,
                    confidence: analysis.confidence, entry_price: analysis.entry_price,
                    take_profit: analysis.take_profit, stop_loss: analysis.stop_loss,
                    risk_reward: analysis.risk_reward || "2.0:1",
                    scan_result_id: latestScan?.id ?? null,
                  });
                  signalsCreated++;
                  console.log(`Signal created: ${inst.symbol} ${analysis.direction} conf=${analysis.confidence}`);
                }
              }
            } else if (analysis.direction === "BUY" || analysis.direction === "SELL") {
              console.log(`Signal blocked for ${inst.symbol}: invalid trade levels or confidence below minimum`, {
                confidence: analysis.confidence,
                direction: analysis.direction,
                entry: analysis.entry_price,
                tp: analysis.take_profit,
                sl: analysis.stop_loss,
              });
              }
            }
          }
        }
      }
    }

    // ─── RESOLVE PENDING SIGNALS: check TP/SL/expiry ───
    // Timeframe-based expiry: candle count × timeframe minutes
    const EXPIRY_MAP: Record<string, number> = {
      "1": 60 * 60 * 1000,       // 1m × 60 candles = 1 hour
      "5": 48 * 5 * 60 * 1000,   // 5m × 48 candles = 4 hours
      "15": 48 * 15 * 60 * 1000, // 15m × 48 candles = 12 hours
      "60": 24 * 60 * 60 * 1000, // 1H × 24 candles = 24 hours
      "240": 12 * 4 * 60 * 60 * 1000, // 4H × 12 candles = 48 hours
      "1440": 5 * 24 * 60 * 60 * 1000, // 1D × 5 candles = 5 days
    };
    const DEFAULT_EXPIRY_MS = 48 * 15 * 60 * 1000; // 12 hours default

    let resolvedCount = 0;
    const { data: pendingSignals } = await supabase
      .from("signals")
      .select("id, user_id, symbol, direction, entry_price, take_profit, stop_loss, created_at, scan_result_id, confidence")
      .eq("result", "pending")
      .limit(30); // Limit per run to stay within time budget

    if (pendingSignals && pendingSignals.length > 0) {
      // Batch-fetch timeframes + indicator context from linked scan_results
      const scanIds = pendingSignals.map(s => s.scan_result_id).filter(Boolean);
      let scanContext: Record<string, { timeframe: string; adx: number | null; rsi: number | null; macd_status: string | null; stoch_rsi: number | null; session: string }> = {};
      if (scanIds.length > 0) {
        const { data: scans } = await supabase
          .from("scan_results")
          .select("id, timeframe, adx, rsi, macd_status, stoch_rsi, session")
          .in("id", scanIds);
        if (scans) {
          for (const sc of scans) scanContext[sc.id] = { timeframe: sc.timeframe, adx: sc.adx, rsi: sc.rsi, macd_status: sc.macd_status, stoch_rsi: sc.stoch_rsi, session: sc.session };
        }
      }

      // Helper: insert signal outcome
      async function insertSignalOutcome(sig: any, resultStr: string, pnl: number, pnlPips: number) {
        const ctx = sig.scan_result_id ? scanContext[sig.scan_result_id] : null;
        const now = new Date();
        const createdAt = new Date(sig.created_at);

        // Look up active pattern at signal creation time
        let patternActive: string | null = null;
        const { data: patInsights } = await supabase
          .from("insights")
          .select("data")
          .eq("user_id", sig.user_id)
          .eq("symbol", sig.symbol)
          .eq("insight_type", "pattern_detected")
          .lte("created_at", new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString())
          .gte("created_at", new Date(createdAt.getTime() - 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(1);
        if (patInsights && patInsights.length > 0) {
          const pd = patInsights[0].data as any;
          patternActive = pd?.pattern || pd?.pattern_name || null;
        }

        // Determine RON version from user prefs
        const { data: sigPref } = await supabase
          .from("user_signal_preferences")
          .select("signal_engine")
          .eq("user_id", sig.user_id)
          .maybeSingle();
        const ronVersion = sigPref?.signal_engine || "v1";

        // MTF alignment: SKIP expensive per-timeframe queries to stay within time budget
        const mtfAlignment: string | null = null;

        await supabase.from("signal_outcomes").insert({
          user_id: sig.user_id,
          signal_id: sig.id,
          symbol: sig.symbol,
          direction: sig.direction,
          timeframe: ctx?.timeframe || "15m",
          entry_price: sig.entry_price,
          tp_price: sig.take_profit,
          sl_price: sig.stop_loss,
          result: resultStr.toUpperCase(),
          pnl_pips: +pnlPips.toFixed(1),
          pnl_currency: +pnl.toFixed(2),
          confidence: sig.confidence || 5,
          ron_version: ronVersion,
          adx_at_entry: ctx?.adx,
          rsi_at_entry: ctx?.rsi,
          macd_status: ctx?.macd_status,
          stoch_rsi: ctx?.stoch_rsi,
          pattern_active: patternActive,
          session: ctx?.session || session,
          day_of_week: createdAt.getUTCDay(),
          hour_utc: createdAt.getUTCHours(),
          resolved_at: now.toISOString(),
          created_at: sig.created_at,
          mtf_alignment: mtfAlignment,
        });

        // ─── RISK METRICS: track consecutive losses & drawdown ───
        try {
          const { data: recentOutcomes } = await supabase
            .from("signal_outcomes")
            .select("result, pnl_pips")
            .eq("user_id", sig.user_id)
            .eq("symbol", sig.symbol)
            .order("resolved_at", { ascending: false })
            .limit(20);

          let consecutiveLosses = 0;
          if (recentOutcomes) {
            for (const o of recentOutcomes) {
              if (o.result === "LOSS") consecutiveLosses++;
              else break;
            }
          }

          // Calculate equity from all outcomes for this user+symbol
          const { data: allOutcomes } = await supabase
            .from("signal_outcomes")
            .select("pnl_pips")
            .eq("user_id", sig.user_id)
            .eq("symbol", sig.symbol);
          
          let equity = 0, peak = 0, maxDD = 0;
          if (allOutcomes) {
            for (const o of allOutcomes) {
              equity += (o.pnl_pips || 0);
              if (equity > peak) peak = equity;
              const dd = peak - equity;
              if (dd > maxDD) maxDD = dd;
            }
          }

          const riskMode = consecutiveLosses >= 3 ? "conservative" : "normal";

          await supabase.from("ron_risk_metrics").upsert({
            user_id: sig.user_id,
            symbol: sig.symbol,
            consecutive_losses: consecutiveLosses,
            max_drawdown_pips: +maxDD.toFixed(1),
            current_drawdown_pips: +(peak - equity).toFixed(1),
            equity_peak: +peak.toFixed(1),
            equity_current: +equity.toFixed(1),
            risk_mode: riskMode,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,symbol" });
        } catch (e) { console.warn("Risk metrics update failed:", e); }
      }

      for (const sig of pendingSignals) {
        // Determine expiry based on timeframe
        const ctx = sig.scan_result_id ? scanContext[sig.scan_result_id] : null;
        const tf = ctx?.timeframe || null;
        const expiryMs = tf ? (EXPIRY_MAP[tf] || DEFAULT_EXPIRY_MS) : DEFAULT_EXPIRY_MS;
        const ageMs = Date.now() - new Date(sig.created_at).getTime();

        // Get live price
        const liveData = symbolData.get(sig.symbol);
        const livePrice = liveData?.last_price ?? null;

        // Check expiry
        if (ageMs > expiryMs) {
          let pnl = 0;
          let pnlPips = 0;
          if (livePrice) {
            if (sig.direction === "BUY") pnl = livePrice - sig.entry_price;
            else pnl = sig.entry_price - livePrice;
            pnlPips = priceToPips(pnl, sig.symbol);
          }
          await supabase.from("signals").update({
            result: "expired", pnl: +pnl.toFixed(5), pnl_pips: +pnlPips.toFixed(1), resolved_at: new Date().toISOString(),
          }).eq("id", sig.id);
          const expiryHours = Math.round(expiryMs / 3600000);
          await supabase.from("insights").insert({
            user_id: sig.user_id, insight_type: "signal_outcome",
            title: `${sig.symbol} ${sig.direction} — Expired`,
            description: `Signal expired after ${expiryHours}h without hitting TP or SL. Entry: ${sig.entry_price}, Unrealized P&L: ${pnl.toFixed(2)} (${pnlPips.toFixed(1)} pips)`,
            symbol: sig.symbol, severity: "low",
            data: { entry_price: sig.entry_price, take_profit: sig.take_profit, stop_loss: sig.stop_loss, pnl: +pnl.toFixed(2), pnl_pips: +pnlPips.toFixed(1), expired: true },
          });
          // ─── ML: record outcome ───
          await insertSignalOutcome(sig, "EXPIRED", pnl, pnlPips);
          resolvedCount++;
          continue;
        }

        if (!livePrice) continue;

        let result: string | null = null;
        let pnl = 0;
        let pnlPips = 0;

        if (sig.direction === "BUY") {
          if (livePrice >= sig.take_profit) {
            result = "win";
            pnl = sig.take_profit - sig.entry_price;
            pnlPips = priceToPips(pnl, sig.symbol);
          } else if (livePrice <= sig.stop_loss) {
            result = "loss";
            pnl = sig.stop_loss - sig.entry_price;
            pnlPips = priceToPips(pnl, sig.symbol);
          }
        } else if (sig.direction === "SELL") {
          if (livePrice <= sig.take_profit) {
            result = "win";
            pnl = sig.entry_price - sig.take_profit;
            pnlPips = priceToPips(pnl, sig.symbol);
          } else if (livePrice >= sig.stop_loss) {
            result = "loss";
            pnl = sig.entry_price - sig.stop_loss;
            pnlPips = priceToPips(pnl, sig.symbol);
          }
        }

        if (result) {
          await supabase.from("signals").update({
            result, pnl: +pnl.toFixed(5), pnl_pips: +pnlPips.toFixed(1),
            resolved_at: new Date().toISOString(),
          }).eq("id", sig.id);
          await supabase.from("insights").insert({
            user_id: sig.user_id, insight_type: "signal_outcome",
            title: `${sig.symbol} ${sig.direction} — ${result.toUpperCase()}`,
            description: `RON signal resolved as ${result}. Entry: ${sig.entry_price}, P&L: ${pnl.toFixed(2)} (${pnlPips.toFixed(1)} pips)`,
            symbol: sig.symbol, severity: result === "win" ? "positive" : "negative",
            data: { entry_price: sig.entry_price, take_profit: sig.take_profit, stop_loss: sig.stop_loss, pnl, pnl_pips: pnlPips },
          });
          // ─── ML: record outcome ───
          await insertSignalOutcome(sig, result.toUpperCase(), pnl, pnlPips);
          resolvedCount++;
        }
      }
    }

    // ─── Retroactive session volume backfill ───
    const utcHour = new Date().getUTCHours();
    const today = new Date().toISOString().split("T")[0];
    const completedSessions = getCompletedSessions(utcHour);

    if (completedSessions.length > 0 && METAAPI_TOKEN && accountId) {
      const { data: existingSummaries } = await supabase
        .from("session_volume_summary")
        .select("session, symbol")
        .eq("date", today);

      const existingKeys = new Set(
        (existingSummaries || []).map((s: any) => `${s.session}:${s.symbol}`)
      );

      for (const sessDef of completedSessions) {
        for (const [symbol] of symbolTfSet) {
          if (existingKeys.has(`${sessDef.key}:${symbol}`)) continue;
          const startISO = `${today}T${String(sessDef.startUtc).padStart(2, "0")}:00:00.000Z`;
          const endISO = `${today}T${String(sessDef.endUtc).padStart(2, "0")}:00:00.000Z`;
          try {
            const sessionCandles = await fetchHourlyCandles(METAAPI_TOKEN!, accountId!, symbol, startISO, endISO);
            if (sessionCandles.length === 0) continue;
            const totalVol = sessionCandles.reduce((s: number, c: any) => s + (c.tickVolume || 0), 0);
            let peakHourStart: string | null = null;
            let peakVol = 0;
            for (const c of sessionCandles) {
              const v = c.tickVolume || 0;
              if (v > peakVol) { peakVol = v; peakHourStart = c.time; }
            }
            await supabase.from("session_volume_summary").upsert({
              session: sessDef.key, symbol, date: today,
              total_volume: totalVol, peak_hour_start: peakHourStart,
            }, { onConflict: "session,symbol,date" });
          } catch (e) {
            console.warn(`Backfill failed for ${sessDef.key}/${symbol}:`, e);
          }
        }
      }
    }

    // ─── LIQUIDITY ZONE DETECTION & SESSION BIAS ───
    try {
      for (const [symbol, candles] of symbolCandles) {
        if (!Array.isArray(candles) || candles.length < 10) continue;
        const timeframe = symbolTfSet.get(symbol) || "15m";

        // Detect and upsert liquidity zones
        const zones = detectLiquidityZones(candles, symbol, timeframe);
        if (zones.length > 0) {
          // Mark old zones as broken if price has passed through
          const lastPrice = candles[candles.length - 1].close;
          const { data: activeZones } = await supabase
            .from("liquidity_zones")
            .select("id, price_high, price_low, zone_type, tested_count")
            .eq("symbol", symbol)
            .eq("status", "active");

          if (activeZones) {
            for (const z of activeZones) {
              const priceInZone = lastPrice >= z.price_low && lastPrice <= z.price_high;
              const priceThrough = (z.zone_type.includes("bull") && lastPrice < z.price_low) ||
                                   (z.zone_type.includes("bear") && lastPrice > z.price_high);
              if (priceInZone) {
                await supabase.from("liquidity_zones").update({
                  tested_count: z.tested_count + 1, respected: true, updated_at: new Date().toISOString(),
                }).eq("id", z.id);
              } else if (priceThrough) {
                await supabase.from("liquidity_zones").update({
                  status: "broken", respected: false, updated_at: new Date().toISOString(),
                }).eq("id", z.id);
              }
            }
          }

          // Insert new zones (deduplicate by checking existing active zones for same symbol+type+price range)
          for (const zone of zones) {
            const { data: existing } = await supabase
              .from("liquidity_zones")
              .select("id")
              .eq("symbol", zone.symbol)
              .eq("zone_type", zone.zone_type)
              .eq("status", "active")
              .gte("price_high", zone.price_high * 0.999)
              .lte("price_low", zone.price_low * 1.001)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from("liquidity_zones").insert(zone);
            }
          }
        }

        // Session bias: determine 4H and Daily trend
        const closes = candles.map((c: any) => c.close);
        const trend = determineTrendDirection(closes);
        // Update session_bias for all users with this symbol
        await supabase.from("live_market_data").update({ session_bias: trend }).eq("symbol", symbol);

        // Volume profile daily
        const today = new Date().toISOString().split("T")[0];
        const todayCandles = candles.filter((c: any) => c.time && c.time.startsWith(today));
        if (todayCandles.length >= 3) {
          const priceLevels: Record<number, number> = {};
          const priceStep = (Math.max(...todayCandles.map((c: any) => c.high)) - Math.min(...todayCandles.map((c: any) => c.low))) / 20;
          if (priceStep > 0) {
            for (const c of todayCandles) {
              const level = Math.round(((c.high + c.low) / 2) / priceStep) * priceStep;
              priceLevels[level] = (priceLevels[level] || 0) + (c.tickVolume || 0);
            }
            const levels = Object.entries(priceLevels).map(([p, v]) => ({ price: +p, volume: v }));
            levels.sort((a, b) => b.volume - a.volume);
            const pocPrice = levels[0]?.price || 0;
            const totalVol = levels.reduce((s, l) => s + l.volume, 0);
            // Value area: 70% of volume centered on POC
            let vaVol = 0;
            const sortedByPrice = [...levels].sort((a, b) => a.price - b.price);
            const pocIdx = sortedByPrice.findIndex(l => l.price === pocPrice);
            let lo = pocIdx, hi = pocIdx;
            vaVol = sortedByPrice[pocIdx]?.volume || 0;
            while (vaVol < totalVol * 0.7 && (lo > 0 || hi < sortedByPrice.length - 1)) {
              const loVol = lo > 0 ? sortedByPrice[lo - 1].volume : 0;
              const hiVol = hi < sortedByPrice.length - 1 ? sortedByPrice[hi + 1].volume : 0;
              if (loVol >= hiVol && lo > 0) { lo--; vaVol += loVol; }
              else if (hi < sortedByPrice.length - 1) { hi++; vaVol += hiVol; }
              else break;
            }
            await supabase.from("volume_profile_daily").upsert({
              symbol, profile_date: today,
              poc_price: pocPrice,
              value_area_high: sortedByPrice[hi]?.price || pocPrice,
              value_area_low: sortedByPrice[lo]?.price || pocPrice,
              total_volume: totalVol,
              price_levels: levels.slice(0, 30),
            }, { onConflict: "symbol,profile_date" });
          }
        }
      }
    } catch (e) { console.warn("Liquidity/Volume/Bias processing error:", e); }

    // ─── NEWS IMPACT TRACKING: baseline prices for recent news ───
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentNews } = await supabase
        .from("news_items")
        .select("id, instruments_affected, published_at")
        .gte("published_at", fifteenMinAgo)
        .limit(20);

      if (recentNews) {
        for (const news of recentNews) {
          const affected = news.instruments_affected || [];
          for (const sym of affected) {
            const liveData = symbolData.get(sym);
            if (!liveData?.last_price) continue;
            // Check if we already have an impact record
            const { data: existing } = await supabase
              .from("news_impact_results")
              .select("id")
              .eq("news_id", news.id)
              .eq("symbol", sym)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from("news_impact_results").insert({
                news_id: news.id,
                symbol: sym,
                price_at_news: liveData.last_price,
              });
            }
          }
        }
      }

      // Measure impact for older news (15m, 30m, 1h marks)
      const oneHourAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString();
      const { data: pendingImpact } = await supabase
        .from("news_impact_results")
        .select("id, news_id, symbol, price_at_news, price_after_15m, price_after_30m, price_after_1h, created_at")
        .gte("created_at", oneHourAgo)
        .is("price_after_1h", null)
        .limit(50);

      if (pendingImpact) {
        for (const imp of pendingImpact) {
          const ageMin = (Date.now() - new Date(imp.created_at).getTime()) / 60000;
          const liveData = symbolData.get(imp.symbol);
          if (!liveData?.last_price) continue;
          const updates: any = {};
          if (ageMin >= 15 && !imp.price_after_15m) updates.price_after_15m = liveData.last_price;
          if (ageMin >= 30 && !imp.price_after_30m) updates.price_after_30m = liveData.last_price;
          if (ageMin >= 60) {
            updates.price_after_1h = liveData.last_price;
            const diff = liveData.last_price - imp.price_at_news;
            const pipSize = getPipSize(imp.symbol);
            updates.magnitude_pips = +(diff / pipSize).toFixed(1);
            updates.direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
            updates.measured_at = new Date().toISOString();
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from("news_impact_results").update(updates).eq("id", imp.id);
          }
        }
      }
    } catch (e) { console.warn("News impact tracking error:", e); }

    return new Response(JSON.stringify({
      success: true, symbols: symbolTfSet.size, users: userInstruments.size,
      rows: upserts.length, auto_scans: autoScans, signals_created: signalsCreated,
      signals_resolved: resolvedCount, live: usedLive,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compute-market-data error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
