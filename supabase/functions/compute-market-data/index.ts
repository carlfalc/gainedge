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
  // Simplified ADX
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
  // Calculate RSI series
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

async function fetchCandlesFromBroker(token: string, accountId: string, symbol: string, timeframe: string, limit: number) {
  const start = new Date(Date.now() - limit * 15 * 60000).toISOString();
  const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${limit}`;
  const res = await fetch(url, { headers: { "auth-token": token } });
  if (!res.ok) throw new Error(`Candles ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function fetchPriceFromBroker(token: string, accountId: string, symbol: string) {
  const url = `${CLIENT_API_URL}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(symbol)}/current-price`;
  const res = await fetch(url, { headers: { "auth-token": token } });
  if (!res.ok) return null;
  return await res.json();
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
  };
}

/* ─── Session detection for volume summaries ─── */
const SESSION_DEFS = [
  { key: "asian", startUtc: 0, endUtc: 9 },
  { key: "london", startUtc: 7, endUtc: 16 },
  { key: "new_york", startUtc: 13, endUtc: 22 },
];

function getEndingSessions(utcHour: number): string[] {
  // A session is "ending" in its last hour
  return SESSION_DEFS.filter(s => utcHour === s.endUtc - 1).map(s => s.key);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get all users with their instruments
    const { data: instruments } = await supabase
      .from("user_instruments")
      .select("user_id, symbol");

    if (!instruments || instruments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No instruments to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user
    const userSymbols = new Map<string, string[]>();
    for (const row of instruments) {
      const syms = userSymbols.get(row.user_id) || [];
      if (!syms.includes(row.symbol)) syms.push(row.symbol);
      userSymbols.set(row.user_id, syms);
    }

    // Get unique symbols
    const allSymbols = [...new Set(instruments.map(i => i.symbol))];

    // Try to get MetaApi accountId from any user's profile
    let accountId: string | null = null;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("metaapi_account_id")
      .not("metaapi_account_id", "is", null)
      .limit(1);
    if (profiles && profiles.length > 0) {
      accountId = profiles[0].metaapi_account_id;
    }

    // Fetch data for each unique symbol
    const symbolData = new Map<string, any>();
    let usedLive = false;

    for (const symbol of allSymbols) {
      if (METAAPI_TOKEN && accountId) {
        try {
          const [candles, price] = await Promise.all([
            fetchCandlesFromBroker(METAAPI_TOKEN, accountId, symbol, "15m", 100),
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
            });
            usedLive = true;
            continue;
          }
        } catch (e) {
          console.warn(`MetaApi failed for ${symbol}: ${e.message}`);
        }
      }
      // Fallback to mock
      symbolData.set(symbol, generateMockData(symbol));
    }

    // Upsert data for each user
    const upserts: any[] = [];
    for (const [userId, syms] of userSymbols) {
      for (const symbol of syms) {
        const data = symbolData.get(symbol);
        if (!data) continue;
        upserts.push({
          user_id: userId,
          symbol,
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

    // ─── Session volume summaries ───
    // Check if any session is ending (within its last hour)
    const utcHour = new Date().getUTCHours();
    const utcMinute = new Date().getUTCMinutes();
    const endingSessions = getEndingSessions(utcHour);

    // Only write summary once near the end of the hour (minute 55-59)
    if (endingSessions.length > 0 && utcMinute >= 55) {
      const today = new Date().toISOString().split("T")[0];
      for (const sessionKey of endingSessions) {
        const sessionDef = SESSION_DEFS.find(s => s.key === sessionKey)!;
        for (const symbol of allSymbols) {
          const data = symbolData.get(symbol);
          if (!data) continue;

          // Estimate peak hour from sparkline
          let peakHourStart: string | null = null;
          const spark = data.sparkline_data as number[];
          if (spark && spark.length >= 4) {
            const bucketSize = 4;
            let maxRange = 0, peakIdx = 0;
            for (let i = 0; i <= spark.length - bucketSize; i += bucketSize) {
              const slice = spark.slice(i, i + bucketSize);
              const range = Math.max(...slice) - Math.min(...slice);
              if (range > maxRange) { maxRange = range; peakIdx = i; }
            }
            const candlesFromEnd = spark.length - peakIdx;
            const hoursAgo = Math.floor(candlesFromEnd / 4);
            const peakUtcHour = (utcHour - hoursAgo + 24) % 24;
            const d = new Date();
            d.setUTCHours(peakUtcHour, 0, 0, 0);
            peakHourStart = d.toISOString();
          }

          await supabase
            .from("session_volume_summary")
            .upsert({
              session: sessionKey,
              symbol,
              date: today,
              total_volume: data.volume_today || 0,
              peak_hour_start: peakHourStart,
            }, { onConflict: "session,symbol,date" });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      symbols: allSymbols.length,
      users: userSymbols.size,
      rows: upserts.length,
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
