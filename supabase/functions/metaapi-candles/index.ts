import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// MetaApi REST API base URLs
const CLIENT_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai";

// HARDCODED account ID — do NOT provision new accounts
const METAAPI_ACCOUNT_ID = "ea940a26-d263-4017-ad2c-0412f8399b69";
const METAAPI_TIMEOUT_MS = 30_000;

const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const MOCK_BASE_PRICES: Record<string, number> = {
  XAUUSD: 4720,
  EURUSD: 1.085,
  GBPUSD: 1.265,
  AUDUSD: 0.645,
  NZDUSD: 0.595,
  USDJPY: 155.5,
  NAS100: 21200,
  US30: 42500,
};

const DEFAULT_SYMBOLS = Object.keys(MOCK_BASE_PRICES);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), METAAPI_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`MetaApi request timed out after ${METAAPI_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTimeframeMs(timeframe: string) {
  return TIMEFRAME_MS[timeframe] ?? TIMEFRAME_MS["15m"];
}

function getMockBasePrice(symbol: string) {
  return MOCK_BASE_PRICES[symbol] ?? 100;
}

function generateMockCandles(symbol: string, timeframe: string, startTime?: string, limit = 500) {
  const candleCount = Number.isFinite(limit) ? Math.max(10, Math.min(limit, 1000)) : 500;
  const timeframeMs = getTimeframeMs(timeframe);
  const startTs = startTime
    ? new Date(startTime).getTime()
    : Date.now() - candleCount * timeframeMs;

  let price = getMockBasePrice(symbol);

  return Array.from({ length: candleCount }, (_, index) => {
    const time = new Date(startTs + index * timeframeMs).toISOString();
    const drift = (Math.random() - 0.5) * price * 0.0015;
    const open = price;
    const close = Math.max(0.00001, open + drift);
    const wick = Math.abs((Math.random() - 0.5) * price * 0.0008);
    const high = Math.max(open, close) + wick;
    const low = Math.max(0.00001, Math.min(open, close) - wick);
    price = close;

    return {
      time,
      open: +open.toFixed(5),
      high: +high.toFixed(5),
      low: +low.toFixed(5),
      close: +close.toFixed(5),
      tickVolume: Math.floor(50 + Math.random() * 250),
    };
  });
}

function generateMockPrice(symbol: string) {
  const midpoint = getMockBasePrice(symbol);
  const spread = midpoint >= 100
    ? Math.max(0.1, midpoint * 0.00003)
    : Math.max(0.0001, midpoint * 0.0002);

  return {
    symbol,
    bid: +(midpoint - spread / 2).toFixed(5),
    ask: +(midpoint + spread / 2).toFixed(5),
    time: new Date().toISOString(),
    fallback: true,
  };
}

function filterSpikeCandles<T extends { high: number }>(candles: T[]) {
  return candles.filter((candle, index, source) => {
    if (index < 50) return true;

    const recentCandles = source.slice(index - 50, index);
    const averageHigh = recentCandles.reduce((sum, item) => sum + Number(item.high ?? 0), 0) / recentCandles.length;

    if (!averageHigh) return true;

    return Number(candle.high ?? 0) <= averageHigh * 1.03;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("metaapi-candles called with accountId:", METAAPI_ACCOUNT_ID);

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action, symbol, timeframe, startTime, limit } = body;
    const accountId = METAAPI_ACCOUNT_ID;

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "provision") {
      // Store the hardcoded account ID in profile and return immediately
      await supabase
        .from("profiles")
        .update({ metaapi_account_id: METAAPI_ACCOUNT_ID })
        .eq("id", userId);

      return new Response(JSON.stringify({
        success: true,
        accountId: METAAPI_ACCOUNT_ID,
        state: "DEPLOYED",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CANDLES: Get historical OHLCV data ───
    if (action === "candles") {
      if (!symbol || !timeframe) {
        return new Response(JSON.stringify({ error: "Missing symbol or timeframe" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const requestedLimit = typeof limit === "number" ? limit : Number(limit ?? 500);
      const candleLimit = Number.isFinite(requestedLimit)
        ? Math.max(10, Math.min(requestedLimit, 1000))
        : 500;
      const start = startTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${candleLimit}`;

      let res, candles;
      try {
        res = await fetchWithTimeout(url, {
          headers: { "auth-token": METAAPI_TOKEN },
        });
        candles = await res.json();
      } catch (fetchErr) {
        console.error("Candles fetch network error:", getErrorMessage(fetchErr));
        return new Response(JSON.stringify({
          success: true,
          fallback: true,
          accountId,
          candles: generateMockCandles(symbol, timeframe, start, candleLimit),
          error: "SERVICE_UNAVAILABLE",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: candles.message || "Failed to fetch candles",
          details: candles,
        }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const filteredCandles = Array.isArray(candles) ? filterSpikeCandles(candles) : [];

      return new Response(JSON.stringify({
        success: true,
        candles: filteredCandles,
        filteredOut: Array.isArray(candles) ? candles.length - filteredCandles.length : 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PRICE: Get current tick/price ───
    if (action === "price") {
      if (!symbol) {
        return new Response(JSON.stringify({ error: "Missing symbol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try symbol variants for broker compatibility (e.g. XAUUSD -> XAUUSD.i)
      const PRICE_SYMBOL_VARIANTS: Record<string, string[]> = {
        XAUUSD: ["XAUUSD.i", "XAUUSD"],
        EURUSD: ["EURUSD.i", "EURUSD"],
        GBPUSD: ["GBPUSD.i", "GBPUSD"],
        USDJPY: ["USDJPY.i", "USDJPY"],
        AUDUSD: ["AUDUSD.i", "AUDUSD"],
        NZDUSD: ["NZDUSD.i", "NZDUSD"],
        NAS100: ["NDX100", "NAS100", "USTEC"],
        US30: ["DJ30", "US30"],
      };
      const variants = PRICE_SYMBOL_VARIANTS[symbol] || [symbol];

      let lastError: any = null;
      let shouldFallback = false;
      for (const variant of variants) {
        try {
          const url = `${CLIENT_URL}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(variant)}/current-price`;
          const res = await fetchWithTimeout(url, {
            headers: { "auth-token": METAAPI_TOKEN },
          });
          const price = await res.json();
          if (res.ok) {
            return new Response(JSON.stringify({ success: true, price }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          lastError = price;
        } catch (fetchErr) {
          console.error(`Price fetch failed for ${variant}:`, getErrorMessage(fetchErr));
          lastError = { message: getErrorMessage(fetchErr) };
          shouldFallback = true;
        }
      }

      if (shouldFallback) {
        return new Response(JSON.stringify({
          success: true,
          fallback: true,
          price: generateMockPrice(symbol),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        error: lastError?.message || "Failed to fetch price",
        details: lastError,
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SYMBOLS: List available symbols ───
    if (action === "symbols") {
      let res, symbols;
      try {
        const url = `${CLIENT_URL}/users/current/accounts/${accountId}/symbols`;
        res = await fetchWithTimeout(url, {
          headers: { "auth-token": METAAPI_TOKEN },
        });
        symbols = await res.json();
      } catch (fetchErr) {
        console.error("Symbols fetch network error:", getErrorMessage(fetchErr));
        return new Response(JSON.stringify({
          success: true,
          error: "SERVICE_UNAVAILABLE",
          fallback: true,
          symbols: DEFAULT_SYMBOLS,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!res.ok) {
        return new Response(JSON.stringify({
          error: symbols.message || "Failed to fetch symbols",
          details: symbols,
        }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, symbols }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("metaapi-candles error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
