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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action, accountId, symbol, timeframe, startTime, limit } = body;

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
      if (!accountId || !symbol || !timeframe) {
        return new Response(JSON.stringify({ error: "Missing accountId, symbol, or timeframe" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const candleLimit = limit || 500;
      const start = startTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(start)}&limit=${candleLimit}`;

      let res, candles;
      try {
        res = await fetch(url, {
          headers: { "auth-token": METAAPI_TOKEN },
        });
        candles = await res.json();
      } catch (fetchErr) {
        console.error("Candles fetch network error:", fetchErr.message);
        return new Response(JSON.stringify({
          error: "SERVICE_UNAVAILABLE",
          fallback: true,
          candles: [],
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

      return new Response(JSON.stringify({ success: true, candles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PRICE: Get current tick/price ───
    if (action === "price") {
      if (!accountId || !symbol) {
        return new Response(JSON.stringify({ error: "Missing accountId or symbol" }), {
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
      for (const variant of variants) {
        try {
          const url = `${CLIENT_URL}/users/current/accounts/${accountId}/symbols/${encodeURIComponent(variant)}/current-price`;
          const res = await fetch(url, {
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
          console.error(`Price fetch failed for ${variant}:`, fetchErr.message);
          lastError = { message: fetchErr.message };
        }
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
      if (!accountId) {
        return new Response(JSON.stringify({ error: "Missing accountId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let res, symbols;
      try {
        const url = `${CLIENT_URL}/users/current/accounts/${accountId}/symbols`;
        res = await fetch(url, {
          headers: { "auth-token": METAAPI_TOKEN },
        });
        symbols = await res.json();
      } catch (fetchErr) {
        console.error("Symbols fetch network error:", fetchErr.message);
        return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true, symbols: [] }), {
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
