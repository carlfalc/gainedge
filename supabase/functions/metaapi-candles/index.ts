import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MARKET_DATA_ACCOUNT_ID = Deno.env.get("METAAPI_MARKET_DATA_ACCOUNT_ID") ?? "";

// MetaApi REST API base URLs
const CLIENT_URL = "https://mt-client-api-v1.london.agiliumtrade.ai";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const METAAPI_TIMEOUT_MS = 30_000;

// Hard price ranges for validation — catches decimal errors from MetaApi
const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  XAUUSD: { min: 1000, max: 10000 }, XAGUSD: { min: 10, max: 100 },
  US30: { min: 20000, max: 60000 }, NAS100: { min: 10000, max: 30000 },
  NDX100: { min: 10000, max: 30000 }, SPX500: { min: 2000, max: 8000 },
  UK100: { min: 4000, max: 12000 }, GER40: { min: 8000, max: 25000 },
  JPN225: { min: 15000, max: 50000 }, JP225: { min: 15000, max: 50000 },
  AUS200: { min: 4000, max: 12000 }, HK50: { min: 10000, max: 40000 },
  USOUSD: { min: 20, max: 200 }, XTIUSD: { min: 20, max: 200 },
  UKOUSD: { min: 20, max: 200 }, XBRUSD: { min: 20, max: 200 },
  XNGUSD: { min: 0.5, max: 15 }, XCUUSD: { min: 1, max: 10 },
  AUDUSD: { min: 0.40, max: 0.90 }, NZDUSD: { min: 0.40, max: 0.80 },
  EURUSD: { min: 0.80, max: 1.60 }, GBPUSD: { min: 1.00, max: 1.80 },
  USDCAD: { min: 1.00, max: 1.60 }, USDCHF: { min: 0.70, max: 1.20 },
  USDJPY: { min: 80, max: 200 }, EURGBP: { min: 0.70, max: 1.10 },
  EURJPY: { min: 100, max: 200 }, GBPJPY: { min: 120, max: 250 },
  AUDJPY: { min: 60, max: 120 }, NZDJPY: { min: 50, max: 110 },
  EURAUD: { min: 1.30, max: 2.00 }, GBPAUD: { min: 1.60, max: 2.20 },
  EURNZD: { min: 1.50, max: 2.10 }, GBPNZD: { min: 1.80, max: 2.40 },
  AUDNZD: { min: 0.90, max: 1.30 }, AUDCAD: { min: 0.80, max: 1.00 },
  EURCAD: { min: 1.30, max: 1.60 }, GBPCAD: { min: 1.50, max: 1.90 },
  EURCHF: { min: 0.90, max: 1.20 }, GBPCHF: { min: 1.05, max: 1.40 },
  CADJPY: { min: 80, max: 130 }, CHFJPY: { min: 120, max: 190 },
  CADCHF: { min: 0.50, max: 1.00 }, NZDCAD: { min: 0.75, max: 0.95 },
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
    // Server-to-server calls (e.g. falconer-engine refreshing candles) pass the
    // service-role key. Those are trusted and skip the per-user claims check —
    // the data actions below (candles/price/symbols) don't need a user identity.
    const isServiceCall = SERVICE_ROLE_KEY.length > 0 && token === SERVICE_ROLE_KEY;

    let userId: string | undefined;
    if (isServiceCall) {
      userId = undefined;
    } else {
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub;
    }

    const body = await req.json();
    const { action, symbol, timeframe, startTime, limit } = body;

    // Market-data requests must resolve to either the authenticated user's default
    // broker connection or the explicitly configured service data account. There is
    // deliberately no shared account baked into source and no synthetic fallback.
    const admin = SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      : supabase;
    const requestedUserId = isServiceCall && typeof body.user_id === "string"
      ? body.user_id
      : userId;
    let accountId = "";
    if (requestedUserId) {
      const { data: connections } = await admin
        .from("broker_connections")
        .select("metaapi_account_id")
        .eq("user_id", requestedUserId)
        .eq("is_default", true)
        .eq("status", "connected")
        .limit(1);
      accountId = connections?.[0]?.metaapi_account_id ?? "";
    }
    if (!accountId && isServiceCall) accountId = MARKET_DATA_ACCOUNT_ID;
    if (!accountId) {
      return new Response(JSON.stringify({
        error: "NO_MARKET_DATA_ACCOUNT",
        message: "Connect a default MetaApi broker account before requesting live data.",
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "provision") {
      return new Response(JSON.stringify({
        error: "PROVISIONING_MOVED",
        message: "Create and test the broker connection in Settings.",
      }), {
        status: 410,
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
        GER40: ["GER40", "DAX40", "DE40", "GER40.i"],
        HK50: ["HK50", "HK50.i"],
        JP225: ["JP225", "JPN225", "JP225.i"],
        AUS200: ["AUS200", "AUS200.i"],
        USOUSD: ["XTIUSD", "USOUSD", "XTIUSD.i", "WTI"],
        UKOUSD: ["XBRUSD", "UKOUSD", "XBRUSD.i", "BRENT"],
        XNGUSD: ["XNGUSD", "NGAS", "XNGUSD.i"],
        XCUUSD: ["XCUUSD", "COPPER", "XCUUSD.i"],
        AUDUSD: ["AUDUSD.i", "AUDUSD"],
        NZDUSD: ["NZDUSD.i", "NZDUSD"],
        EURUSD: ["EURUSD.i", "EURUSD"],
        GBPUSD: ["GBPUSD.i", "GBPUSD"],
        USDJPY: ["USDJPY.i", "USDJPY"],
        USDCAD: ["USDCAD.i", "USDCAD"],
        USDCHF: ["USDCHF.i", "USDCHF"],
        GBPJPY: ["GBPJPY.i", "GBPJPY"],
        EURJPY: ["EURJPY.i", "EURJPY"],
        AUDJPY: ["AUDJPY.i", "AUDJPY"],
        NZDJPY: ["NZDJPY.i", "NZDJPY"],
        EURGBP: ["EURGBP.i", "EURGBP"],
        AUDNZD: ["AUDNZD.i", "AUDNZD"],
        CADCHF: ["CADCHF.i", "CADCHF"],
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
        console.error(`All candle variants failed for ${symbol}`);
        return new Response(JSON.stringify({
          error: "MARKET_DATA_UNAVAILABLE",
          accountId,
          symbol,
          timeframe,
          details: lastError,
        }), {
          status: 502,
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
        GER40: ["GER40", "DAX40", "DE40", "GER40.i"],
        HK50: ["HK50", "HK50.i"],
        JP225: ["JP225", "JPN225", "JP225.i"],
        AUS200: ["AUS200", "AUS200.i"],
        USOUSD: ["XTIUSD", "USOUSD", "XTIUSD.i", "WTI"],
        UKOUSD: ["XBRUSD", "UKOUSD", "XBRUSD.i", "BRENT"],
        XNGUSD: ["XNGUSD", "NGAS", "XNGUSD.i"],
        XCUUSD: ["XCUUSD", "COPPER", "XCUUSD.i"],
        AUDUSD: ["AUDUSD.i", "AUDUSD"],
        NZDUSD: ["NZDUSD.i", "NZDUSD"],
        EURUSD: ["EURUSD.i", "EURUSD"],
        GBPUSD: ["GBPUSD.i", "GBPUSD"],
        USDJPY: ["USDJPY.i", "USDJPY"],
        USDCAD: ["USDCAD.i", "USDCAD"],
        USDCHF: ["USDCHF.i", "USDCHF"],
        GBPJPY: ["GBPJPY.i", "GBPJPY"],
        EURJPY: ["EURJPY.i", "EURJPY"],
        AUDJPY: ["AUDJPY.i", "AUDJPY"],
        NZDJPY: ["NZDJPY.i", "NZDJPY"],
        EURGBP: ["EURGBP.i", "EURGBP"],
        AUDNZD: ["AUDNZD.i", "AUDNZD"],
        CADCHF: ["CADCHF.i", "CADCHF"],
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

      console.error(`All price variants failed for ${symbol}`);
      return new Response(JSON.stringify({
        error: "PRICE_UNAVAILABLE",
        symbol,
        details: lastError,
      }), {
        status: 502,
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
          error: "SYMBOLS_UNAVAILABLE",
          message: getErrorMessage(fetchErr),
        }), {
          status: 502,
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
