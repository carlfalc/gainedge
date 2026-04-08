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

/* ─── MetaApi helpers ─── */
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai";
const CLIENT_API_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

// Map timeframe string to minutes for candle start time calculation
const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440,
};

// Eightcap-Demo symbol mapping: forex pairs use ".i" suffix, indices have special names
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

/* ─── Auto-scan analysis on candle close ─── */
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

function runAnalysis(candles: any[]): AnalysisResult {
  const closes = candles.map((c: any) => c.close);
  const highs = candles.map((c: any) => c.high);
  const lows = candles.map((c: any) => c.low);

  // EMA 4/17 crossover
  const ema4 = calcEMA(closes, 4);
  const ema17 = calcEMA(closes, 17);
  const currFast = ema4[ema4.length - 1];
  const currSlow = ema17[ema17.length - 1];
  const prevFast = ema4[ema4.length - 2];
  const prevSlow = ema17[ema17.length - 2];

  let crossoverStatus = "NONE";
  let crossoverDir: string | null = null;
  if (prevFast <= prevSlow && currFast > currSlow) {
    crossoverStatus = "CONFIRMED"; crossoverDir = "BULLISH";
  } else if (prevFast >= prevSlow && currFast < currSlow) {
    crossoverStatus = "CONFIRMED"; crossoverDir = "BEARISH";
  } else if (Math.abs(currFast - currSlow) / currSlow < 0.0005) {
    crossoverStatus = "FORMING";
    crossoverDir = currFast > currSlow ? "BULLISH" : "BEARISH";
  }

  // Indicators
  const rsi = calcRSI(closes);
  const adx = calcADX(highs, lows, closes);
  const macd = calcMACDStatus(closes);
  const stochRsi = calcStochRSI(closes);

  // Confidence scoring
  let bullishPoints = 0, bearishPoints = 0;
  const reasons: string[] = [];

  // EMA crossover (weight: 2)
  if (crossoverStatus === "CONFIRMED" && crossoverDir === "BULLISH") {
    bullishPoints += 2; reasons.push("EMA 4/17 bullish crossover confirmed");
  } else if (crossoverStatus === "CONFIRMED" && crossoverDir === "BEARISH") {
    bearishPoints += 2; reasons.push("EMA 4/17 bearish crossover confirmed");
  } else if (crossoverStatus === "FORMING") {
    const pts = crossoverDir === "BULLISH" ? 1 : 0;
    bullishPoints += pts; bearishPoints += (1 - pts);
    reasons.push(`EMA 4/17 crossover forming (${crossoverDir})`);
  }

  // RSI
  if (rsi !== null) {
    if (rsi < 30) { bullishPoints += 1; reasons.push(`RSI oversold at ${rsi}`); }
    else if (rsi > 70) { bearishPoints += 1; reasons.push(`RSI overbought at ${rsi}`); }
    else if (rsi > 50) { bullishPoints += 0.5; reasons.push(`RSI bullish at ${rsi}`); }
    else { bearishPoints += 0.5; reasons.push(`RSI bearish at ${rsi}`); }
  }

  // ADX (trend strength)
  if (adx !== null) {
    if (adx > 25) { reasons.push(`Strong trend (ADX ${adx})`); bullishPoints += 0.5; bearishPoints += 0.5; }
    else { reasons.push(`Weak trend (ADX ${adx})`); }
  }

  // MACD
  if (macd === "Bullish") { bullishPoints += 1.5; reasons.push("MACD bullish momentum"); }
  else if (macd === "Bearish") { bearishPoints += 1.5; reasons.push("MACD bearish momentum"); }

  // StochRSI
  if (stochRsi !== null) {
    if (stochRsi < 20) { bullishPoints += 1; reasons.push(`StochRSI oversold at ${stochRsi}`); }
    else if (stochRsi > 80) { bearishPoints += 1; reasons.push(`StochRSI overbought at ${stochRsi}`); }
  }

  // Determine direction and confidence
  const totalPoints = bullishPoints + bearishPoints;
  const maxSide = Math.max(bullishPoints, bearishPoints);
  const alignment = totalPoints > 0 ? maxSide / totalPoints : 0;
  let confidence = Math.min(10, Math.max(1, Math.round(alignment * maxSide * 2)));
  let direction: string;
  let verdict: string;

  if (bullishPoints > bearishPoints && alignment > 0.6) {
    direction = "BUY"; verdict = "BUY";
  } else if (bearishPoints > bullishPoints && alignment > 0.6) {
    direction = "SELL"; verdict = "SELL";
  } else if (totalPoints > 2) {
    direction = "WAIT"; verdict = "WAIT"; confidence = Math.min(confidence, 4);
  } else {
    direction = "NO TRADE"; verdict = "NO_TRADE"; confidence = 1;
  }

  // Entry/TP/SL from recent price structure
  const lastClose = closes[closes.length - 1];
  const recentHigh = Math.max(...highs.slice(-10));
  const recentLow = Math.min(...lows.slice(-10));
  const range = recentHigh - recentLow;

  let entry: number | null = null;
  let tp: number | null = null;
  let sl: number | null = null;
  let rr: string | null = null;

  if (direction === "BUY" || direction === "SELL") {
    entry = +lastClose.toFixed(5);
    if (direction === "BUY") {
      sl = +(recentLow - range * 0.1).toFixed(5);
      tp = +(lastClose + (lastClose - sl) * 2).toFixed(5);
    } else {
      sl = +(recentHigh + range * 0.1).toFixed(5);
      tp = +(lastClose - (sl - lastClose) * 2).toFixed(5);
    }
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    rr = risk > 0 ? `${(reward / risk).toFixed(1)}:1` : "2:1";
  }

  const reasoning = reasons.length > 0
    ? reasons.join(". ") + `. Overall ${direction} with ${confidence}/10 confidence.`
    : `No clear setup. ${direction}.`;

  return {
    direction, confidence, entry_price: entry, take_profit: tp, stop_loss: sl,
    risk_reward: rr, ema_crossover_status: crossoverStatus,
    ema_crossover_direction: crossoverDir, reasoning, verdict,
    rsi, adx, macd_status: macd, stoch_rsi: stochRsi,
  };
}

/* ─── Session detection for volume summaries ─── */
const SESSION_DEFS = [
  { key: "asian", startUtc: 0, endUtc: 8 },
  { key: "london", startUtc: 8, endUtc: 16 },
  { key: "new_york", startUtc: 16, endUtc: 21 },
];

// Reuse the global BROKER_SYMBOL_MAP for hourly candle fetching too

function getCompletedSessions(utcHour: number): typeof SESSION_DEFS {
  return SESSION_DEFS.filter(s => utcHour >= s.endUtc);
}

async function fetchHourlyCandles(token: string, accountId: string, symbol: string, startISO: string, endISO: string) {
  const variants = BROKER_SYMBOL_VARIANTS[symbol] || [symbol];
  for (const variant of variants) {
    try {
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(variant)}/timeframes/1h/candles?startTime=${encodeURIComponent(startISO)}&limit=500`;
      const res = await fetch(url, { headers: { "auth-token": token } });
      if (!res.ok) continue;
      const candles = await res.json();
      if (Array.isArray(candles) && candles.length > 0) {
        // Filter to session window
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
    const symbolTfSet = new Map<string, string>(); // symbol -> timeframe (use first user's)
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
    const symbolCandles = new Map<string, any[]>(); // for auto-scan analysis
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
            // Last candle time for close detection
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
      // Fallback to mock — also generate a mock candle time that changes per timeframe period
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

    // ─── AUTO-SCAN: detect candle closes and insert scan_results ───
    let autoScans = 0;
    const session = detectSession();

    for (const [userId, instList] of userInstruments) {
      // Get user's profile for EMA settings
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
          console.log(`Candle close detected: ${inst.symbol} (${inst.timeframe}) for user ${userId.slice(0, 8)}`);

          // Run analysis on available candles
          const candles = symbolCandles.get(inst.symbol);
          let analysis: AnalysisResult;

          if (candles && candles.length > 20) {
            analysis = runAnalysis(candles);
          } else {
            // Mock analysis from mock data
            const mockRsi = data.rsi;
            const mockAdx = data.adx;
            const mockMacd = data.macd_status;
            const mockStoch = data.stoch_rsi;
            const bullish = (mockRsi < 50 ? 0 : 1) + (mockMacd === "Bullish" ? 1.5 : 0) + (mockStoch < 30 ? 1 : 0);
            const bearish = (mockRsi > 50 ? 0 : 1) + (mockMacd === "Bearish" ? 1.5 : 0) + (mockStoch > 70 ? 1 : 0);
            const dir = bullish > bearish + 1 ? "BUY" : bearish > bullish + 1 ? "SELL" : "WAIT";
            const conf = Math.min(10, Math.max(1, Math.round(Math.max(bullish, bearish) * 2)));
            const lastPrice = data.last_price || 100;
            const range = lastPrice * 0.005;

            analysis = {
              direction: dir,
              confidence: conf,
              entry_price: dir !== "WAIT" && dir !== "NO TRADE" ? lastPrice : null,
              take_profit: dir === "BUY" ? +(lastPrice + range * 2).toFixed(5) : dir === "SELL" ? +(lastPrice - range * 2).toFixed(5) : null,
              stop_loss: dir === "BUY" ? +(lastPrice - range).toFixed(5) : dir === "SELL" ? +(lastPrice + range).toFixed(5) : null,
              risk_reward: dir !== "WAIT" && dir !== "NO TRADE" ? "2:1" : null,
              ema_crossover_status: "NONE",
              ema_crossover_direction: null,
              reasoning: `Auto-scan on ${inst.timeframe} candle close. RSI ${mockRsi}, ADX ${mockAdx}, MACD ${mockMacd}, StochRSI ${mockStoch}. ${dir} signal generated.`,
              verdict: dir === "NO TRADE" ? "NO_TRADE" : dir,
              rsi: mockRsi, adx: mockAdx, macd_status: mockMacd, stoch_rsi: mockStoch,
            };
          }

          // Insert scan_result
          const { error: scanErr } = await supabase.from("scan_results").insert({
            user_id: userId,
            symbol: inst.symbol,
            direction: analysis.direction,
            confidence: analysis.confidence,
            entry_price: analysis.entry_price,
            take_profit: analysis.take_profit,
            stop_loss: analysis.stop_loss,
            risk_reward: analysis.risk_reward,
            rsi: analysis.rsi,
            adx: analysis.adx,
            macd_status: analysis.macd_status,
            stoch_rsi: analysis.stoch_rsi,
            ema_crossover_status: analysis.ema_crossover_status,
            ema_crossover_direction: analysis.ema_crossover_direction,
            reasoning: analysis.reasoning,
            verdict: analysis.verdict,
            timeframe: inst.timeframe,
            candle_type: profile?.default_candle_type || "heiken_ashi",
            session,
            scanned_at: new Date().toISOString(),
          });
          if (scanErr) console.error(`Scan insert error for ${inst.symbol}:`, scanErr);
          else autoScans++;

          // Auto-create signal if confidence >= 5 and direction is BUY or SELL
          if (analysis.confidence >= 5 && (analysis.direction === "BUY" || analysis.direction === "SELL") && analysis.entry_price && analysis.take_profit && analysis.stop_loss) {
            await supabase.from("signals").insert({
              user_id: userId,
              symbol: inst.symbol,
              direction: analysis.direction,
              confidence: analysis.confidence,
              entry_price: analysis.entry_price,
              take_profit: analysis.take_profit,
              stop_loss: analysis.stop_loss,
              risk_reward: analysis.risk_reward || "2:1",
            });
          }
        }
      }
    }

    // ─── Retroactive session volume backfill ───
    const utcHour = new Date().getUTCHours();
    const today = new Date().toISOString().split("T")[0];
    const completedSessions = getCompletedSessions(utcHour);

    if (completedSessions.length > 0 && METAAPI_TOKEN && accountId) {
      // Check which session+symbol combos already exist
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

          // Build session time window for today
          const startISO = `${today}T${String(sessDef.startUtc).padStart(2, "0")}:00:00.000Z`;
          const endISO = `${today}T${String(sessDef.endUtc).padStart(2, "0")}:00:00.000Z`;

          try {
            const sessionCandles = await fetchHourlyCandles(METAAPI_TOKEN!, accountId!, symbol, startISO, endISO);
            if (sessionCandles.length === 0) continue;

            const totalVol = sessionCandles.reduce((s: number, c: any) => s + (c.tickVolume || 0), 0);

            // Find peak hour
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
      success: true,
      symbols: symbolTfSet.size,
      users: userInstruments.size,
      rows: upserts.length,
      auto_scans: autoScans,
      live: usedLive,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compute-market-data error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
