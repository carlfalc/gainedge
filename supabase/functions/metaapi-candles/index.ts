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
    // IMPORTANT: We hardcode the known deployed account to prevent duplicate provisioning.
    // TODO: Manually undeploy & delete the 2 duplicate "GAINEDGE-7fbe4d0e" accounts
    // via the MetaApi dashboard (https://app.metaapi.cloud) to stop paying 3x.
    // Keep only the account ID below.
    const KNOWN_ACCOUNT_ID = "03f98665-4e19-4f58-9fb1-3b567067dc68";

    if (action === "provision") {
      // Step 1: Check profiles table for a stored account ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("metaapi_account_id")
        .eq("id", userId)
        .single();

      const storedId = profile?.metaapi_account_id;

      if (storedId) {
        // Use the stored account — trust it, don't re-verify every time
        return new Response(JSON.stringify({
          success: true,
          accountId: storedId,
          state: "DEPLOYED",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: No stored ID — check MetaApi for ANY existing deployed account
      try {
        const listRes = await fetch(
          `${PROVISIONING_URL}/users/current/accounts`,
          { headers: { "auth-token": METAAPI_TOKEN } }
        );
        if (listRes.ok) {
          const accounts = await listRes.json();
          if (Array.isArray(accounts) && accounts.length > 0) {
            // Pick the first deployed account (or any account)
            const deployed = accounts.find((a: any) => a.state === "DEPLOYED") || accounts[0];
            const existingId = deployed.id || deployed._id;

            // Store it so we never provision again
            await supabase
              .from("profiles")
              .update({ metaapi_account_id: existingId })
              .eq("id", userId);

            return new Response(JSON.stringify({
              success: true,
              accountId: existingId,
              state: deployed.state || "DEPLOYED",
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch (e) {
        console.error("Failed to list MetaApi accounts:", e.message);
      }

      // Step 3: Fallback — use the hardcoded known account ID
      // Store it in the profile so subsequent calls skip provisioning
      await supabase
        .from("profiles")
        .update({ metaapi_account_id: KNOWN_ACCOUNT_ID })
        .eq("id", userId);

      return new Response(JSON.stringify({
        success: true,
        accountId: KNOWN_ACCOUNT_ID,
        state: "DEPLOYED",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      // NOTE: We NEVER create new accounts anymore. If zero accounts exist
      // on MetaApi, the hardcoded ID is used. Create accounts manually if needed.
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
