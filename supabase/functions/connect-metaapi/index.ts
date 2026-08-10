import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const CLIENT_URL = "https://mt-client-api-v1.london.agiliumtrade.ai";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.slice(7));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const accountId = String(body.accountId ?? "").trim();
    const brokerName = String(body.brokerName ?? "").trim();
    const accountType = body.accountType === "live" ? "live" : "demo";
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(accountId) || brokerName.length < 2) {
      return new Response(JSON.stringify({ error: "A valid MetaApi account ID and broker name are required." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `${CLIENT_URL}/users/current/accounts/${encodeURIComponent(accountId)}/accountInformation`,
      { headers: { "auth-token": METAAPI_TOKEN } },
    );
    const account = await response.json().catch(() => null);
    if (!response.ok || account?.balance == null) {
      return new Response(JSON.stringify({
        error: account?.message ?? "MetaApi could not verify this deployed account.",
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await admin.from("broker_connections")
      .update({ is_default: false })
      .eq("user_id", userId);
    const { data: existing } = await admin.from("broker_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("metaapi_account_id", accountId)
      .limit(1);
    const values = {
      user_id: userId,
      broker_name: brokerName,
      login_id: String(account.login ?? accountId),
      encrypted_password: "",
      server: String(account.server ?? "MetaApi"),
      account_type: accountType,
      metaapi_account_id: accountId,
      status: "connected",
      is_default: true,
      balance: Number(account.balance),
      equity: Number(account.equity ?? account.balance),
      last_health_check: new Date().toISOString(),
      last_error: null,
    };
    const query = existing?.[0]?.id
      ? admin.from("broker_connections").update(values).eq("id", existing[0].id)
      : admin.from("broker_connections").insert(values);
    const { error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      account: {
        accountId,
        brokerName,
        accountType,
        currency: account.currency ?? null,
        balance: account.balance,
        equity: account.equity ?? null,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

