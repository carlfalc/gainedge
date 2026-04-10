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

// Hard price ranges for validation — catches decimal errors from MetaApi
const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  XAUUSD: { min: 1000, max: 10000 }, XAGUSD: { min: 10, max: 100 },
  US30: { min: 20000, max: 60000 }, NAS100: { min: 10000, max: 30000 },
  NDX100: { min: 10000, max: 30000 }, SPX500: { min: 3000, max: 8000 },
  UK100: { min: 5000, max: 12000 }, GER40: { min: 10000, max: 25000 },
  JPN225: { min: 20000, max: 50000 }, AUS200: { min: 5000, max: 10000 },
  AUDUSD: { min: 0.40, max: 0.90 }, NZDUSD: { min: 0.40, max: 0.80 },
  EURUSD: { min: 0.80, max: 1.30 }, GBPUSD: { min: 1.00, max: 1.60 },
  USDCAD: { min: 1.10, max: 1.50 }, USDCHF: { min: 0.70, max: 1.10 },
  USDJPY: { min: 100, max: 200 }, EURGBP: { min: 0.70, max: 1.00 },
  EURJPY: { min: 100, max: 200 }, GBPJPY: { min: 130, max: 220 },
  AUDJPY: { min: 70, max: 120 }, NZDJPY: { min: 60, max: 110 },
  EURAUD: { min: 1.30, max: 2.00 }, GBPAUD: { min: 1.60, max: 2.20 },
  EURNZD: { min: 1.50, max: 2.10 }, GBPNZD: { min: 1.80, max: 2.40 },
  AUDNZD: { min: 1.00, max: 1.20 }, AUDCAD: { min: 0.80, max: 1.00 },
  EURCAD: { min: 1.30, max: 1.60 }, GBPCAD: { min: 1.50, max: 1.90 },
  EURCHF: { min: 0.90, max: 1.20 }, GBPCHF: { min: 1.05, max: 1.40 },
  CADJPY: { min: 80, max: 130 }, CHFJPY: { min: 120, max: 190 },
  CADCHF: { min: 0.60, max: 0.80 }, NZDCAD: { min: 0.75, max: 0.95 },
  NZDCHF: { min: 0.50, max: 0.70 },
};

function filterByPriceRange<T extends { open: number; high: number; low: number; close: number }>(
  candles: T[], symbol: string
): T[] {
  const range = PRICE_RANGES[symbol];
  if (range) {
    return candles.filter(c =>
      c.open >= range.min && c.open <= range.max &&
      c.high >= range.min && c.high <= range.max &&
      c.low >= range.min && c.low <= range.max &&
      c.close >= range.min && c.close <= range.max
    );
  }
  // Unknown symbol: median-based filter
  if (candles.length < 5) return candles;
  const closes = candles.map(c => c.close).sort((a, b) => a - b);
  const median = closes[Math.floor(closes.length / 2)];
  if (!median || median === 0) return candles;
  return candles.filter(c =>
    c.open < median * 2 && c.open > median * 0.5 &&
    c.high < median * 2 && c.high > median * 0.5 &&
    c.low < median * 2 && c.low > median * 0.5 &&
    c.close < median * 2 && c.close > median * 0.5
  );
}

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

      // Symbol variant fallback for broker compatibility
      const CANDLE_SYMBOL_VARIANTS: Record<string, string[]> = {
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
      const variants = CANDLE_SYMBOL_VARIANTS[symbol] || [symbol];

      let res: Response | undefined, candles: any;
      let lastError: any = null;
      for (const variant of variants) {
        try {
          const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(variant)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${candleLimit}`;
          res = await fetchWithTimeout(url, {
            headers: { "auth-token": METAAPI_TOKEN },
          });
          candles = await res.json();
          if (res.ok && Array.isArray(candles) && candles.length > 0) {
            console.log(`Candles: resolved ${symbol} → ${variant}`);
            break;
          }
          lastError = candles;
          res = undefined; // mark as failed to try next
        } catch (fetchErr) {
          console.error(`Candles fetch failed for variant ${variant}:`, getErrorMessage(fetchErr));
          lastError = { message: getErrorMessage(fetchErr) };
        }
      }

      if (!res || !Array.isArray(candles) || candles.length === 0) {
        // All variants failed — return mock data
        console.error(`All candle variants failed for ${symbol}, returning mock data`);
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

      // Apply hard price range validation first, then spike filter
      const priceValidCandles = Array.isArray(candles) ? filterByPriceRange(candles, symbol) : [];
      const filteredCandles = filterSpikeCandles(priceValidCandles);
      console.log(`Candles: ${(candles as any[])?.length ?? 0} raw → ${priceValidCandles.length} price-valid → ${filteredCandles.length} after spike filter`);

      return new Response(JSON.stringify({
        success: true,
        candles: filteredCandles,
        filteredOut: Array.isArray(candles) ? (candles as any[]).length - filteredCandles.length : 0,
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
      const variants = PRICE_SYMBOL_VARIANTS[symbol] || [symbol];

      let lastError: any = null;
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
        }
      }

      // All variants failed — always fall back to mock price instead of 404
      console.error(`All price variants failed for ${symbol}, returning mock price`);
      return new Response(JSON.stringify({
        success: true,
        fallback: true,
        price: generateMockPrice(symbol),
      }), {
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
