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

/* ─── MetaApi helpers ─── */
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai";
const CLIENT_API_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440,
};

const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  NAS100: ["NDX100", "NAS100", "USTEC"],
  US30: ["US30", "DJ30"],
  XAUUSD: ["XAUUSD", "GOLD"],
  NZDUSD: ["NZDUSD.i", "NZDUSD"],
  AUDUSD: ["AUDUSD.i", "AUDUSD"],
  EURUSD: ["EURUSD.i", "EURUSD"],
  GBPUSD: ["GBPUSD.i", "GBPUSD"],
  USDJPY: ["USDJPY.i", "USDJPY"],
};

function getBrokerVariants(symbol: string): string[] {
  return BROKER_SYMBOL_MAP[symbol] || [symbol];
}

async function fetchCandlesFromBroker(token: string, accountId: string, symbol: string, timeframe: string, limit: number) {
  const tfMinutes = TF_MINUTES[timeframe] || 15;
  const start = new Date(Date.now() - limit * tfMinutes * 60000).toISOString();
  const variants = getBrokerVariants(symbol);
  for (const variant of variants) {
    try {
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(variant)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${limit}`;
      const res = await fetch(url, { headers: { "auth-token": token } });
      if (!res.ok) continue;
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
      const res = await fetch(url, { headers: { "auth-token": token } });
      if (!res.ok) continue;
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

/* ─── Falconer AI V1 (Legacy): analysis with NO-TRADE filters ─── */
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

// ─── V1 Legacy Analysis (preserved as-is) ───
function runAnalysisV1(candles: any[]): AnalysisResult {
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

  // ─── V1 NO-TRADE FILTERS ───
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

  // ─── V1 CONFIDENCE SCORING ───
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
    if (rsi >= 45 && rsi <= 55) { confidence -= 2; tradeReasons.push(`RSI ${rsi} in neutral zone — reduced conviction`); }
  }

  if (macd === "Bullish" && isBullish) { confidence += 1; tradeReasons.push("MACD bullish momentum aligned"); }
  else if (macd === "Bearish" && isBearish) { confidence += 1; tradeReasons.push("MACD bearish momentum aligned"); }

  if (adx !== null && adx > 25) { confidence += 1; tradeReasons.push(`ADX at ${adx} confirms trend strength`); }

  if (stochRsi !== null) {
    if (isBullish && stochRsi > 60) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bullish`); }
    else if (isBearish && stochRsi < 40) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bearish`); }
  }

  if (lastVolume > avgVolume * 1.2 && crossoverStatus === "CONFIRMED") {
    confidence += 1; tradeReasons.push("Volume spike on crossover candle");
  }

  confidence = Math.max(1, Math.min(10, confidence));

  let direction: string;
  let verdict: string;
  if (confidence >= 5 && crossoverStatus === "CONFIRMED") {
    direction = crossoverDir === "BULLISH" ? "BUY" : "SELL";
    verdict = direction;
  } else if (confidence >= 3 && crossoverStatus !== "NONE") {
    direction = isBullish ? "BUY" : "SELL";
    verdict = "WAIT"; confidence = Math.min(confidence, 4);
  } else {
    direction = "WAIT"; verdict = "WAIT"; confidence = Math.min(confidence, 3);
  }

  // ─── V1 ENTRY / TP / SL ───
  const lastClose = closes[closes.length - 1];
  let entry: number | null = null;
  let tp: number | null = null;
  let sl: number | null = null;
  let rr: string | null = null;

  if (direction === "BUY" || direction === "SELL") {
    entry = +lastClose.toFixed(5);
    if (direction === "BUY") {
      const swingLow = findSwingLow(lows, lows.length - 1, 20);
      sl = +(swingLow - (lastClose - swingLow) * 0.05).toFixed(5);
      const risk = Math.abs(entry - sl);
      tp = +(entry + risk * 2).toFixed(5);
    } else {
      const swingHigh = findSwingHigh(highs, highs.length - 1, 20);
      sl = +(swingHigh + (swingHigh - lastClose) * 0.05).toFixed(5);
      const risk = Math.abs(sl - entry);
      tp = +(entry - risk * 2).toFixed(5);
    }
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    rr = risk > 0 ? `${(reward / risk).toFixed(1)}:1` : "2.0:1";
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

// ─── Falconer V2: Knowledge Base layer on top of V1 ───
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
      reasoning: `${v1Result.reasoning} [Falconer V2] ${v2Notes.join(" | ")} | BLOCKED by knowledge base rules.`,
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

  // ─── Apply RISK rules: recalculate SL/TP with swing structure ───
  let entry = v1Result.entry_price;
  let tp = v1Result.take_profit;
  let sl = v1Result.stop_loss;
  let rr = v1Result.risk_reward;

  if (entry && (v1Result.direction === "BUY" || v1Result.direction === "SELL")) {
    for (const rule of riskRules) {
      if (rule.rule_name === "Stop Loss Behind Structure") {
        if (v1Result.direction === "BUY") {
          const swingLow = findSwingLow(lows, lows.length - 1, 20);
          sl = +(swingLow * 0.999).toFixed(5); // 0.1% buffer
          v2Notes.push(`SL placed behind swing low at ${sl} ✓`);
        } else {
          const swingHigh = findSwingHigh(highs, highs.length - 1, 20);
          sl = +(swingHigh * 1.001).toFixed(5);
          v2Notes.push(`SL placed behind swing high at ${sl} ✓`);
        }
      }
    }

    // Recalculate TP for 2:1 minimum
    if (sl && entry) {
      const risk = Math.abs(entry - sl);
      tp = v1Result.direction === "BUY" ? +(entry + risk * 2).toFixed(5) : +(entry - risk * 2).toFixed(5);
      const reward = Math.abs(tp - entry);
      const rrVal = risk > 0 ? reward / risk : 2;
      rr = `${rrVal.toFixed(1)}:1`;
      v2Notes.push(`R:R ${rr} ✓`);

      // Asian session: tighter TP
      if (utcHour >= 0 && utcHour < 8 && sessionRules.some(r => r.rule_name === "Asian Session Caution")) {
        tp = v1Result.direction === "BUY" ? +(entry + risk * 1.4).toFixed(5) : +(entry - risk * 1.4).toFixed(5);
        rr = "1.4:1";
      }

      // Minimum R:R check
      if (rrVal < 2 && riskRules.some(r => r.rule_name === "Minimum R:R 2:1" && r.priority >= 10)) {
        v2Notes.push("R:R below 2:1 — structure doesn't support trade ✗");
        confidence -= 2;
      }
    }
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

  const fullReasoning = `${v1Result.reasoning} [Falconer V2] ${v2Notes.join(" | ")}`;

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
function runAnalysis(candles: any[], v2Rules: KnowledgeRule[] = [], session = "", recentSignalCount = 0, useV2 = true): AnalysisResult {
  const v1Result = runAnalysisV1(candles);
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    // Group by user, preserving timeframe per instrument
    interface UserInstrument { symbol: string; timeframe: string; }
    const userInstruments = new Map<string, UserInstrument[]>();
    for (const row of instruments) {
      const list = userInstruments.get(row.user_id) || [];
      if (!list.some(i => i.symbol === row.symbol)) {
        list.push({ symbol: row.symbol, timeframe: row.timeframe || "15m" });
      }
      userInstruments.set(row.user_id, list);
    }

    // Unique symbol+timeframe combos to fetch
    const symbolTfSet = new Map<string, string>();
    for (const list of userInstruments.values()) {
      for (const inst of list) {
        if (!symbolTfSet.has(inst.symbol)) symbolTfSet.set(inst.symbol, inst.timeframe);
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

    // Fetch data for each unique symbol
    const symbolData = new Map<string, any>();
    const symbolCandles = new Map<string, any[]>();
    let usedLive = false;

    for (const [symbol, timeframe] of symbolTfSet) {
      if (METAAPI_TOKEN && accountId) {
        try {
          const [candles, price] = await Promise.all([
            fetchCandlesFromBroker(METAAPI_TOKEN, accountId, symbol, timeframe, 100),
            fetchPriceFromBroker(METAAPI_TOKEN, accountId, symbol),
          ]);

          if (Array.isArray(candles) && candles.length > 20) {
            const closes = candles.map((c: any) => c.close);
            const highs = candles.map((c: any) => c.high);
            const lows = candles.map((c: any) => c.low);
            const sparkline = closes.slice(-20);
            const first = sparkline[0], last = sparkline[sparkline.length - 1];
            const direction = last > first * 1.001 ? "up" : last < first * 0.999 ? "down" : "flat";
            const todayVolume = candles.slice(-96).reduce((s: number, c: any) => s + (c.tickVolume || 0), 0);
            const lastCandleTime = candles[candles.length - 1]?.time || null;

            symbolData.set(symbol, {
              bid: price?.bid ?? last,
              ask: price?.ask ?? last,
              last_price: price ? (price.bid + price.ask) / 2 : last,
              rsi: calcRSI(closes),
              adx: calcADX(highs, lows, closes),
              macd_status: calcMACDStatus(closes),
              stoch_rsi: calcStochRSI(closes),
              volume_today: todayVolume,
              market_open: true,
              sparkline_data: sparkline,
              price_direction: direction,
              last_candle_time: lastCandleTime,
            });
            symbolCandles.set(symbol, candles);
            usedLive = true;
            continue;
          }
        } catch (e) {
          console.warn(`MetaApi failed for ${symbol}: ${e.message}`);
        }
      }
      const mock = generateMockData(symbol);
      const tfMin = TF_MINUTES[timeframe] || 15;
      const now = Date.now();
      const candleBucket = Math.floor(now / (tfMin * 60000));
      mock.last_candle_time = new Date(candleBucket * tfMin * 60000).toISOString();
      symbolData.set(symbol, mock);
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

    // ─── FALCONER AI AUTO-SCAN: detect candle closes with STRICT DEDUP ───
    let autoScans = 0;
    let signalsCreated = 0;
    const session = detectSession();

    for (const [userId, instList] of userInstruments) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_candle_type, ema_fast, ema_slow")
        .eq("id", userId)
        .single();

      for (const inst of instList) {
        const data = symbolData.get(inst.symbol);
        if (!data || !data.last_candle_time) continue;

        const prevKey = `${userId}:${inst.symbol}`;
        const prevTime = prevCandleTimes.get(prevKey);
        const newTime = data.last_candle_time;

        // Candle close detected: new candle time differs from previous
        if (prevTime && newTime && prevTime !== newTime) {
          console.log(`Candle close: ${inst.symbol} (${inst.timeframe}) user ${userId.slice(0, 8)}`);

          const candles = symbolCandles.get(inst.symbol);
          let analysis: AnalysisResult;

          if (candles && candles.length > 20) {
            analysis = runAnalysis(candles);
          } else {
            // Mock analysis — still apply Falconer AI logic
            const mockRsi = data.rsi;
            const mockAdx = data.adx;
            const mockMacd = data.macd_status;
            const mockStoch = data.stoch_rsi;
            
            // Apply NO-TRADE filter for mock too
            if (mockAdx !== null && mockAdx < 20) {
              analysis = {
                direction: "NO TRADE", confidence: 1, entry_price: null, take_profit: null,
                stop_loss: null, risk_reward: null, ema_crossover_status: "NONE",
                ema_crossover_direction: null,
                reasoning: `Falconer AI: ADX at ${mockAdx} — no clear trend. Staying flat until momentum develops.`,
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
                reasoning: `Falconer AI: Auto-scan on ${inst.timeframe}. RSI ${mockRsi}, ADX ${mockAdx}, MACD ${mockMacd}, StochRSI ${mockStoch}. ${dir === "WAIT" ? "No clear setup — monitoring." : `${dir} signal with ${conf}/10 confidence.`}`,
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

            // ─── SIGNAL CREATION: only on meaningful new signals with conf >= 5 ───
            if (analysis.confidence >= 5 && (analysis.direction === "BUY" || analysis.direction === "SELL") && analysis.entry_price && analysis.take_profit && analysis.stop_loss) {
              // Check for duplicate pending signal: same direction & entry within 0.5%
              const { data: recentPending } = await supabase
                .from("signals")
                .select("entry_price, direction")
                .eq("user_id", userId)
                .eq("symbol", inst.symbol)
                .eq("result", "pending")
                .order("created_at", { ascending: false })
                .limit(1);

              let isDuplicate = false;
              if (recentPending && recentPending.length > 0) {
                const prev = recentPending[0];
                const sameDir = prev.direction === analysis.direction;
                const priceDiff = Math.abs(prev.entry_price - analysis.entry_price!) / analysis.entry_price!;
                if (sameDir && priceDiff < 0.005) isDuplicate = true;
              }

              if (!isDuplicate) {
                await supabase.from("signals").insert({
                  user_id: userId, symbol: inst.symbol, direction: analysis.direction,
                  confidence: analysis.confidence, entry_price: analysis.entry_price,
                  take_profit: analysis.take_profit, stop_loss: analysis.stop_loss,
                  risk_reward: analysis.risk_reward || "2.0:1",
                });
                signalsCreated++;
              }
            }
          }
        }
      }
    }

    // ─── RESOLVE PENDING SIGNALS: check TP/SL/expiry ───
    let resolvedCount = 0;
    const { data: pendingSignals } = await supabase
      .from("signals")
      .select("id, user_id, symbol, direction, entry_price, take_profit, stop_loss, created_at")
      .eq("result", "pending");

    if (pendingSignals && pendingSignals.length > 0) {
      for (const sig of pendingSignals) {
        // Check expiry first (20 minutes)
        const ageMs = Date.now() - new Date(sig.created_at).getTime();
        if (ageMs > 20 * 60 * 1000) {
          await supabase.from("signals").update({
            result: "expired", pnl: 0, pnl_pips: 0, resolved_at: new Date().toISOString(),
          }).eq("id", sig.id);
          await supabase.from("insights").insert({
            user_id: sig.user_id, insight_type: "signal_outcome",
            title: `${sig.symbol} ${sig.direction} — Expired`,
            description: `Signal expired after 20 minutes without hitting TP or SL. Entry: ${sig.entry_price}`,
            symbol: sig.symbol, severity: "low",
          });
          resolvedCount++;
          continue;
        }

        // Get live price
        const liveData = symbolData.get(sig.symbol);
        if (!liveData || !liveData.last_price) continue;

        const livePrice = liveData.last_price;
        let result: string | null = null;
        let pnl = 0;
        let pnlPips = 0;

        if (sig.direction === "BUY") {
          if (livePrice >= sig.take_profit) {
            result = "win";
            pnl = sig.take_profit - sig.entry_price;
            pnlPips = pnl * (sig.entry_price >= 100 ? 1 : 10000);
          } else if (livePrice <= sig.stop_loss) {
            result = "loss";
            pnl = sig.stop_loss - sig.entry_price;
            pnlPips = pnl * (sig.entry_price >= 100 ? 1 : 10000);
          }
        } else if (sig.direction === "SELL") {
          if (livePrice <= sig.take_profit) {
            result = "win";
            pnl = sig.entry_price - sig.take_profit;
            pnlPips = pnl * (sig.entry_price >= 100 ? 1 : 10000);
          } else if (livePrice >= sig.stop_loss) {
            result = "loss";
            pnl = sig.entry_price - sig.stop_loss;
            pnlPips = pnl * (sig.entry_price >= 100 ? 1 : 10000);
          }
        }

        if (result) {
          await supabase.from("signals").update({
            result, pnl: +pnl.toFixed(2), pnl_pips: +pnlPips.toFixed(1),
            resolved_at: new Date().toISOString(),
          }).eq("id", sig.id);
          await supabase.from("insights").insert({
            user_id: sig.user_id, insight_type: "signal_outcome",
            title: `${sig.symbol} ${sig.direction} — ${result.toUpperCase()}`,
            description: `Falconer AI signal resolved as ${result}. Entry: ${sig.entry_price}, P&L: ${pnl.toFixed(2)} (${pnlPips.toFixed(1)} pips)`,
            symbol: sig.symbol, severity: result === "win" ? "positive" : "negative",
            data: { entry_price: sig.entry_price, take_profit: sig.take_profit, stop_loss: sig.stop_loss, pnl, pnl_pips: pnlPips },
          });
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
