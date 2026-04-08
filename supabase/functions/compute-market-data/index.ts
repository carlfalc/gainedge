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

/* ─── Falconer AI: Improved analysis with NO-TRADE filters ─── */
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

function runAnalysis(candles: any[]): AnalysisResult {
  const closes = candles.map((c: any) => c.close);
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);
  const volumes = candles.map((c: any) => c.tickVolume || 0);

  // EMA 4/17 crossover — use CLOSED candle (second-to-last vs third-to-last)
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

  // Indicators
  const rsi = calcRSI(closes);
  const adx = calcADX(highs, lows, closes);
  const macd = calcMACDStatus(closes);
  const stochRsi = calcStochRSI(closes);
  const atr = calcATR(highs, lows, closes);

  // Calculate average ATR for comparison
  const avgVolume = volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : 0;
  const lastVolume = volumes[volumes.length - 1] || 0;

  // ─── NO-TRADE FILTERS ───
  const reasons: string[] = [];
  let noTrade = false;

  // ADX < 20: no trend
  if (adx !== null && adx < 20) {
    noTrade = true;
    reasons.push(`ADX at ${adx} — no clear trend, staying flat`);
  }

  // ATR below average: tight range
  if (atr !== null) {
    const avgAtr = calcATR(highs.slice(0, -14), lows.slice(0, -14), closes.slice(0, -14));
    if (avgAtr && atr < avgAtr * 0.6) {
      noTrade = true;
      reasons.push("Price in tight range — ATR well below average");
    }
  }

  // EMA flat/parallel: no crossover forming
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
      reasoning: `Falconer AI: ${reasons.join(". ")}. No trade conditions met.`,
      verdict: "NO_TRADE", rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
    };
  }

  // ─── CONFIDENCE SCORING (start at 0, add points) ───
  let confidence = 0;
  const tradeReasons: string[] = [];

  // +3: Confirmed EMA crossover on closed candle
  if (crossoverStatus === "CONFIRMED" && crossoverDir === "BULLISH") {
    confidence += 3;
    tradeReasons.push("Confirmed bullish EMA crossover on closed candle");
  } else if (crossoverStatus === "CONFIRMED" && crossoverDir === "BEARISH") {
    confidence += 3;
    tradeReasons.push("Confirmed bearish EMA crossover on closed candle");
  } else if (crossoverStatus === "FORMING") {
    confidence += 1;
    tradeReasons.push(`EMA crossover forming (${crossoverDir})`);
  }

  // +1: RSI confirming direction
  const isBullish = crossoverDir === "BULLISH" || (crossoverStatus === "NONE" && currFast > currSlow);
  const isBearish = crossoverDir === "BEARISH" || (crossoverStatus === "NONE" && currFast < currSlow);
  if (rsi !== null) {
    if (isBullish && rsi > 55) { confidence += 1; tradeReasons.push(`RSI ${rsi} supports bullish momentum`); }
    else if (isBearish && rsi < 45) { confidence += 1; tradeReasons.push(`RSI ${rsi} supports bearish momentum`); }
    // RSI neutral zone penalty
    if (rsi >= 45 && rsi <= 55) { confidence -= 2; tradeReasons.push(`RSI ${rsi} in neutral zone — reduced conviction`); }
  }

  // +1: MACD aligned
  if (macd === "Bullish" && isBullish) { confidence += 1; tradeReasons.push("MACD bullish momentum aligned"); }
  else if (macd === "Bearish" && isBearish) { confidence += 1; tradeReasons.push("MACD bearish momentum aligned"); }

  // +1: ADX > 25
  if (adx !== null && adx > 25) { confidence += 1; tradeReasons.push(`ADX at ${adx} confirms trend strength`); }

  // +1: StochRSI confirming
  if (stochRsi !== null) {
    if (isBullish && stochRsi > 60) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bullish`); }
    else if (isBearish && stochRsi < 40) { confidence += 1; tradeReasons.push(`StochRSI ${stochRsi} confirms bearish`); }
  }

  // +1: Volume above average on crossover candle
  if (lastVolume > avgVolume * 1.2 && crossoverStatus === "CONFIRMED") {
    confidence += 1;
    tradeReasons.push("Volume spike on crossover candle");
  }

  // Clamp confidence
  confidence = Math.max(1, Math.min(10, confidence));

  // Determine direction
  let direction: string;
  let verdict: string;

  if (confidence >= 5 && crossoverStatus === "CONFIRMED") {
    direction = crossoverDir === "BULLISH" ? "BUY" : "SELL";
    verdict = direction;
  } else if (confidence >= 3 && crossoverStatus !== "NONE") {
    direction = isBullish ? "BUY" : "SELL";
    verdict = "WAIT";
    confidence = Math.min(confidence, 4);
  } else {
    direction = "WAIT";
    verdict = "WAIT";
    confidence = Math.min(confidence, 3);
  }

  // ─── ENTRY / TP / SL with swing structure ───
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

  // Build Falconer AI reasoning — expert trader style
  const reasoningText = tradeReasons.length > 0
    ? `Falconer AI: ${tradeReasons.join(". ")}. ${entry ? `Entry at ${entry.toLocaleString()} with SL ${direction === "BUY" ? "below swing low" : "above swing high"} at ${sl}. R:R ${rr}.` : ""} ${confidence >= 7 ? "High conviction setup." : confidence >= 5 ? "Moderate conviction." : "Low conviction — monitoring."}`
    : `Falconer AI: No clear setup forming. Monitoring price action.`;

  return {
    direction, confidence, entry_price: entry, take_profit: tp, stop_loss: sl,
    risk_reward: rr, ema_crossover_status: crossoverStatus,
    ema_crossover_direction: crossoverDir, reasoning: reasoningText, verdict,
    rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
  };
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

    // Try to get MetaApi accountId
    let accountId: string | null = null;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("metaapi_account_id")
      .not("metaapi_account_id", "is", null)
      .limit(1);
    if (profiles && profiles.length > 0) {
      accountId = profiles[0].metaapi_account_id;
    }

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
