import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLIENT_URL = "https://mt-client-api-v1.london.agiliumtrade.ai";

/** Resolve the MetaApi accountId to use for a given user.
 *  Only the user's connected default broker is accepted. An explicit account id
 *  must still belong to that user.
 */
async function resolveAccountId(
  adminSupabase: ReturnType<typeof createClient>,
  userId: string,
  bodyAccountId?: string,
): Promise<{ accountId: string; brokerName: string | null; accountType: string }> {
  let query = adminSupabase
    .from("broker_connections")
    .select("metaapi_account_id, broker_name, account_type")
    .eq("user_id", userId)
    .eq("status", "connected");
  query = bodyAccountId
    ? query.eq("metaapi_account_id", bodyAccountId)
    : query.eq("is_default", true);
  const { data } = await query.limit(1);
  const conn = data?.[0] as {
    metaapi_account_id?: string;
    broker_name?: string;
    account_type?: string;
  } | undefined;
  if (!conn?.metaapi_account_id) {
    throw new Error("NO_CONNECTED_BROKER");
  }
  return {
    accountId: conn.metaapi_account_id,
    brokerName: conn.broker_name ?? null,
    accountType: conn.account_type ?? "demo",
  };
}

/** Resolve broker-specific symbol via broker_symbol_mappings table */
async function resolveBrokerSymbol(
  adminSupabase: ReturnType<typeof createClient>,
  brokerName: string | null,
  canonicalSymbol: string,
): Promise<string[]> {
  // Always try canonical first, then any mapped variants
  const variants: string[] = [canonicalSymbol];
  if (brokerName) {
    const brokerKey = brokerName.toLowerCase().replace(/\s+/g, "");
    const { data } = await adminSupabase
      .from("broker_symbol_mappings")
      .select("broker_symbol")
      .eq("broker", brokerKey)
      .eq("canonical_symbol", canonicalSymbol)
      .limit(1);
    const mapped = data?.[0]?.broker_symbol as string | undefined;
    if (mapped && mapped !== canonicalSymbol) variants.unshift(mapped);
  }
  // Append legacy hardcoded variants as last-resort fallbacks
  const TRADE_SYMBOL_VARIANTS: Record<string, string[]> = {
    NAS100: ["NDX100", "USTEC", "NAS100.i"],
    US30: ["DJ30", "US30.i"],
    XAUUSD: ["GOLD", "XAUUSD.i"],
    XAGUSD: ["SILVER", "XAGUSD.i"],
    SPX500: ["SP500", "SPX500.i"],
    UK100: ["FTSE100", "UK100.i"],
    GER40: ["DAX40", "DE40", "GER40.i"],
    HK50: ["HK50.i"],
    JP225: ["JPN225", "JP225.i"],
    AUS200: ["AUS200.i"],
    USOUSD: ["XTIUSD", "XTIUSD.i", "WTI"],
    UKOUSD: ["XBRUSD", "XBRUSD.i", "BRENT"],
    XNGUSD: ["NGAS", "XNGUSD.i"],
    XCUUSD: ["COPPER", "XCUUSD.i"],
    AUDUSD: ["AUDUSD.i"], NZDUSD: ["NZDUSD.i"], EURUSD: ["EURUSD.i"],
    GBPUSD: ["GBPUSD.i"], USDJPY: ["USDJPY.i"], USDCAD: ["USDCAD.i"],
    USDCHF: ["USDCHF.i"], GBPJPY: ["GBPJPY.i"], EURJPY: ["EURJPY.i"],
    AUDJPY: ["AUDJPY.i"], NZDJPY: ["NZDJPY.i"], EURGBP: ["EURGBP.i"],
    AUDNZD: ["AUDNZD.i"], CADCHF: ["CADCHF.i"],
  };
  for (const v of TRADE_SYMBOL_VARIANTS[canonicalSymbol] ?? []) {
    if (!variants.includes(v)) variants.push(v);
  }
  return variants;
}

/** Look up the broker's minimum lot / lot step for a symbol (defaults to 0.01). */
async function getLotStep(
  adminSupabase: ReturnType<typeof createClient>,
  brokerName: string | null,
  canonicalSymbol: string,
): Promise<number> {
  if (!brokerName) return 0.01;
  const brokerKey = brokerName.toLowerCase().replace(/\s+/g, "");
  const { data } = await adminSupabase
    .from("broker_symbol_mappings")
    .select("min_lot_size")
    .eq("broker", brokerKey)
    .eq("canonical_symbol", canonicalSymbol)
    .limit(1);
  const min = data?.[0]?.min_lot_size as number | undefined;
  return min && min > 0 ? min : 0.01;
}

/** Round a volume to the broker lot step (e.g. 0.01) so MetaApi won't reject it. */
function roundToStep(volume: number, step: number): number {
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  const stepDecimals = (String(step).split(".")[1] || "").length || 2;
  return Number((Math.round(volume / step) * step).toFixed(stepDecimals));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminSupabase = SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      : supabase;

    const body = await req.json();
    const { action } = body;

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    if (token === SERVICE_ROLE_KEY && body.user_id) {
      userId = body.user_id;
      console.log(`Service-role trade on behalf of user ${userId}`);
    } else {
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const { accountId, brokerName, accountType } = await resolveAccountId(adminSupabase, userId, body.accountId);
    const metaHeaders = { "auth-token": METAAPI_TOKEN, "Content-Type": "application/json" };
    const baseUrl = `${CLIENT_URL}/users/current/accounts/${accountId}`;

    // ─── TEST CONNECTION ───
    if (action === "test-connection") {
      const t0 = Date.now();
      const res = await fetch(`${baseUrl}/accountInformation`, { headers: metaHeaders });
      const data = await res.json();
      const latency = Date.now() - t0;
      const ok = res.ok && data?.balance != null;
      // Persist health snapshot if this is the user's own connection
      await adminSupabase.from("broker_connections")
        .update({
          status: ok ? "connected" : "error",
          last_health_check: new Date().toISOString(),
          last_error: ok ? null : (data?.message || `HTTP ${res.status}`),
          balance: ok ? data.balance : null,
          equity: ok ? data.equity : null,
        })
        .eq("user_id", userId)
        .eq("metaapi_account_id", accountId);
      return new Response(JSON.stringify({
        ok, latency_ms: latency, accountId, accountType,
        balance: data?.balance ?? null, equity: data?.equity ?? null,
        currency: data?.currency ?? null, error: ok ? null : (data?.message || `HTTP ${res.status}`),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACCOUNT INFO ───
    if (action === "account-info") {
      const res = await fetch(`${baseUrl}/accountInformation`, { headers: metaHeaders });
      const data = await res.json();
      return new Response(JSON.stringify({
        ok: res.ok, accountId, accountType,
        balance: data?.balance ?? null, equity: data?.equity ?? null,
        currency: data?.currency ?? null, leverage: data?.leverage ?? null,
        freeMargin: data?.freeMargin ?? null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── TRADE ───
    if (action === "trade") {
      const { symbol, actionType, volume, stopLoss, takeProfit, clientId } = body;
      if (!symbol || !actionType || !volume) {
        return new Response(JSON.stringify({ error: "symbol, actionType, volume required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const variants = await resolveBrokerSymbol(adminSupabase, brokerName, symbol);
      const step = await getLotStep(adminSupabase, brokerName, symbol);
      const roundedVolume = Math.max(step, roundToStep(parseFloat(volume), step));

      for (const variant of variants) {
        const tradeBody: Record<string, unknown> = {
          actionType,
          symbol: variant,
          volume: roundedVolume,
        };
        if (clientId) tradeBody.clientId = String(clientId).slice(0, 64);
        if (stopLoss != null && stopLoss !== "") tradeBody.stopLoss = parseFloat(stopLoss);
        if (takeProfit != null && takeProfit !== "") tradeBody.takeProfit = parseFloat(takeProfit);

        const res = await fetch(`${baseUrl}/trade`, {
          method: "POST", headers: metaHeaders, body: JSON.stringify(tradeBody),
        });
        const data = await res.json();
        if (res.ok) {
          console.log(`Trade ok ${symbol} → ${variant} on account ${accountId} (${accountType})`);
          return new Response(JSON.stringify({ success: true, result: data, accountId, accountType }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errMsg = JSON.stringify(data).toLowerCase();
        if (errMsg.includes("symbol") && (errMsg.includes("not found") || errMsg.includes("not exist"))) {
          console.log(`Variant ${variant} not found, trying next...`);
          continue;
        }
        return new Response(JSON.stringify({ error: data.message || data.error || "Trade failed", details: data }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: `No valid broker symbol found for ${symbol}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── POSITIONS ───
    if (action === "positions") {
      const res = await fetch(`${baseUrl}/positions`, { headers: metaHeaders });
      const data = await res.json();
      const mapped = Array.isArray(data) ? data.map((p: any) => ({
        id: p.id, symbol: p.symbol, type: p.type, volume: p.volume,
        openPrice: p.openPrice, currentPrice: p.currentPrice,
        stopLoss: p.stopLoss, takeProfit: p.takeProfit,
        profit: p.profit ?? p.unrealizedProfit ?? 0,
      })) : [];
      return new Response(JSON.stringify({ positions: mapped, accountId, accountType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CLOSE ───
    if (action === "close") {
      const { positionId } = body;
      if (!positionId) {
        return new Response(JSON.stringify({ error: "positionId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${baseUrl}/trade`, {
        method: "POST", headers: metaHeaders,
        body: JSON.stringify({ actionType: "POSITION_CLOSE_ID", positionId }),
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

    // ─── MODIFY SL/TP (e.g. move stop to breakeven) ───
    if (action === "modify") {
      const { positionId, stopLoss, takeProfit } = body;
      if (!positionId) {
        return new Response(JSON.stringify({ error: "positionId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const modifyBody: Record<string, unknown> = { actionType: "POSITION_MODIFY", positionId };
      if (stopLoss != null && stopLoss !== "") modifyBody.stopLoss = parseFloat(stopLoss);
      if (takeProfit != null && takeProfit !== "") modifyBody.takeProfit = parseFloat(takeProfit);
      const res = await fetch(`${baseUrl}/trade`, {
        method: "POST", headers: metaHeaders, body: JSON.stringify(modifyBody),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || "Modify failed", details: data }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PARTIAL CLOSE (scale out a portion of an open position) ───
    if (action === "partial-close") {
      const { positionId, volume, symbol } = body;
      if (!positionId || volume == null) {
        return new Response(JSON.stringify({ error: "positionId and volume required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const step = symbol ? await getLotStep(adminSupabase, brokerName, symbol) : 0.01;
      const partialVolume = roundToStep(parseFloat(volume), step);
      if (partialVolume < step) {
        // Slice too small to close at this broker's lot step — skip rather than error.
        return new Response(JSON.stringify({ success: true, skipped: "below_min_lot", step }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(`${baseUrl}/trade`, {
        method: "POST", headers: metaHeaders,
        body: JSON.stringify({ actionType: "POSITION_PARTIAL", positionId, volume: partialVolume }),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || "Partial close failed", details: data }), {
          status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, result: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── HISTORY ───
    if (action === "history") {
      const endTime = body.endTime ? new Date(body.endTime) : new Date();
      const startTime = body.startTime ? new Date(body.startTime) : new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid history date range" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (endTime.getTime() - startTime.getTime() > 31 * 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ error: "History range cannot exceed 31 days" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const res = await fetch(
        `${baseUrl}/history-deals/time/${startTime.toISOString()}/${endTime.toISOString()}`,
        { headers: metaHeaders },
      );
      const data = await res.json();
      return new Response(JSON.stringify({ deals: Array.isArray(data) ? data : [], accountId, accountType }), {
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
