import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CLIENT_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const { action } = body;

    // Hardcoded account ID — no provisioning
    const METAAPI_ACCOUNT_ID = "ea940a26-d263-4017-ad2c-0412f8399b69";
    const accountId = METAAPI_ACCOUNT_ID;

    const metaHeaders = {
      "auth-token": METAAPI_TOKEN,
      "Content-Type": "application/json",
    };

    const baseUrl = `${CLIENT_URL}/users/current/accounts/${accountId}`;

    // ─── TRADE: place order ───
    if (action === "trade") {
      const { symbol, actionType, volume, stopLoss, takeProfit } = body;
      if (!symbol || !actionType || !volume) {
        return new Response(JSON.stringify({ error: "symbol, actionType, volume required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tradeBody: Record<string, unknown> = {
        actionType,
        symbol,
        volume: parseFloat(volume),
      };
      if (stopLoss !== undefined && stopLoss !== null && stopLoss !== "") {
        tradeBody.stopLoss = parseFloat(stopLoss);
      }
      if (takeProfit !== undefined && takeProfit !== null && takeProfit !== "") {
        tradeBody.takeProfit = parseFloat(takeProfit);
      }

      const res = await fetch(`${baseUrl}/trade`, {
        method: "POST",
        headers: metaHeaders,
        body: JSON.stringify(tradeBody),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || data.error || "Trade failed", details: data }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── POSITIONS: fetch open positions ───
    if (action === "positions") {
      const res = await fetch(`${baseUrl}/positions`, {
        headers: metaHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify({ positions: Array.isArray(data) ? data : [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CLOSE: close a position ───
    if (action === "close") {
      const { positionId } = body;
      if (!positionId) {
        return new Response(JSON.stringify({ error: "positionId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${baseUrl}/trade`, {
        method: "POST",
        headers: metaHeaders,
        body: JSON.stringify({
          actionType: "POSITION_CLOSE_ID",
          positionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || "Close failed", details: data }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── HISTORY: fetch deal history ───
    if (action === "history") {
      const startTime = new Date();
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date();

      const res = await fetch(
        `${baseUrl}/history-deals/time/${startTime.toISOString()}/${endTime.toISOString()}`,
        { headers: metaHeaders }
      );
      const data = await res.json();
      return new Response(JSON.stringify({ deals: Array.isArray(data) ? data : [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
