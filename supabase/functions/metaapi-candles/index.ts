import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// MetaApi REST API base URLs — market data uses a DIFFERENT host
const PROVISIONING_URL = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai";

// Default demo credentials
const DEMO_LOGIN = "7940685";
const DEMO_PASSWORD = "11@Asdcxz";
const DEMO_SERVER = "Eightcap-Demo";

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

    // ─── PROVISION: Create or retrieve MetaApi account ───
    if (action === "provision") {
      // Check if user already has an account ID stored
      const { data: profile } = await supabase
        .from("profiles")
        .select("metaapi_account_id")
        .eq("id", userId)
        .single();

      if (profile?.metaapi_account_id) {
        // Verify the account is deployed/connected
        try {
          const statusRes = await fetch(
            `${PROVISIONING_URL}/users/current/accounts/${profile.metaapi_account_id}`,
            { headers: { "auth-token": METAAPI_TOKEN } }
          );
          if (statusRes.ok) {
            const acct = await statusRes.json();
            return new Response(JSON.stringify({
              success: true,
              accountId: profile.metaapi_account_id,
              state: acct.state,
              connectionStatus: acct.connectionStatus,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch {
          // Account may have been deleted, proceed to create new one
        }
      }

      // Create new account
      const provisionRes = await fetch(`${PROVISIONING_URL}/users/current/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "auth-token": METAAPI_TOKEN,
        },
        body: JSON.stringify({
          name: `GAINEDGE-${userId.substring(0, 8)}`,
          type: "cloud",
          login: DEMO_LOGIN,
          password: DEMO_PASSWORD,
          server: DEMO_SERVER,
          platform: "mt5",
          magic: 0,
        }),
      });

      const account = await provisionRes.json();
      if (!provisionRes.ok) {
        return new Response(JSON.stringify({
          error: account.message || "Failed to provision account",
          details: account,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newAccountId = account.id || account._id;

      // Store the account ID in the user's profile
      await supabase
        .from("profiles")
        .update({ metaapi_account_id: newAccountId })
        .eq("id", userId);

      // Deploy the account
      await fetch(
        `${PROVISIONING_URL}/users/current/accounts/${newAccountId}/deploy`,
        {
          method: "POST",
          headers: { "auth-token": METAAPI_TOKEN },
        }
      );

      return new Response(JSON.stringify({
        success: true,
        accountId: newAccountId,
        state: "DEPLOYING",
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

      const res = await fetch(url, {
        headers: { "auth-token": METAAPI_TOKEN },
      });

      const candles = await res.json();
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

      const url = `${CLIENT_URL}/users/current/accounts/${accountId}/symbols`;
      const res = await fetch(url, {
        headers: { "auth-token": METAAPI_TOKEN },
      });

      const symbols = await res.json();
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
