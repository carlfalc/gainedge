// Background job: checks every default broker_connection's MetaApi status.
// Triggered every 5 min by pg_cron. If account has been offline > 15 min,
// disable that user's auto-trade settings and write an audit row.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";
const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 min

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: conns } = await admin
    .from("broker_connections")
    .select("id,user_id,broker_name,metaapi_account_id,status,last_health_check")
    .eq("is_default", true)
    .not("metaapi_account_id", "is", null);

  const checked: any[] = [];
  for (const c of (conns ?? []) as any[]) {
    const t0 = Date.now();
    let ok = false;
    let balance: number | null = null;
    let equity: number | null = null;
    let errMsg: string | null = null;
    try {
      const res = await fetch(
        `${CLIENT_URL}/users/current/accounts/${c.metaapi_account_id}/accountInformation`,
        { headers: { "auth-token": METAAPI_TOKEN, "Content-Type": "application/json" } },
      );
      const data = await res.json();
      ok = res.ok && data?.balance != null;
      balance = ok ? data.balance : null;
      equity = ok ? data.equity : null;
      if (!ok) errMsg = data?.message || `HTTP ${res.status}`;
    } catch (e: any) {
      errMsg = e.message || "fetch failed";
    }

    await admin.from("broker_connections").update({
      status: ok ? "connected" : "error",
      last_health_check: new Date().toISOString(),
      last_error: ok ? null : errMsg,
      balance, equity,
    }).eq("id", c.id);

    // If account has been offline > 15 min, disable auto-trade for this user
    let disabled = 0;
    if (!ok) {
      const offlineSince = c.status === "error" && c.last_health_check
        ? Date.now() - new Date(c.last_health_check).getTime()
        : 0;
      if (offlineSince > OFFLINE_THRESHOLD_MS || c.status === "error") {
        const { data: rows } = await admin
          .from("user_auto_trade_settings")
          .select("id")
          .eq("user_id", c.user_id)
          .eq("enabled", true);
        if (rows && rows.length > 0) {
          await admin
            .from("user_auto_trade_settings")
            .update({ enabled: false })
            .eq("user_id", c.user_id)
            .eq("enabled", true);
          disabled = rows.length;
          // Write audit rows so user sees why
          await admin.from("auto_trade_executions").insert(
            rows.map(() => ({
              user_id: c.user_id,
              symbol: "—",
              direction: "n/a",
              volume: 0,
              status: "failed",
              error_message: "Broker offline > 15 min — auto-trade disabled",
            })),
          );
        }
      }
    }

    checked.push({
      account: c.metaapi_account_id, ok, latency_ms: Date.now() - t0,
      balance, error: errMsg, auto_disabled: disabled,
    });
  }

  return new Response(JSON.stringify({ checked: checked.length, results: checked }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
