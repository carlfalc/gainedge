/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — server-side DATA FRESHNESS / HEALTH WATCHDOG.
 *
 * Internal, service-role-only. Runs unattended on a schedule, independent of any browser
 * or signed-in user. For every registered data instrument it reports, and persists ONLY
 * on material transition:
 *   latest stored bar, age, venue state (open / closed / calendar-unavailable),
 *   whether a lag is a legitimate closure or an actual provider failure, critical
 *   data-quality flag count, and whether RON evaluation is currently allowed.
 *
 * It never writes a candle, never fabricates a bar, never emits a probability and never
 * touches broker execution.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  RON_DATA_INSTRUMENTS, RON_PILOT_INSTRUMENTS, RON_VENUE_REGISTRY_VERSION,
} from "../_shared/ron-venue-registry-v1.ts";
import {
  RON_DATA_HEALTH_VERSION, assessDataHealth, isMaterialHealthChange,
} from "../_shared/ron-data-health-v1.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEFRAME = "15m";
const BAR_MINUTES = 15;
const FLAG_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let authorized = !!token && !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await db.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body == scheduled tick */ }
  const persist = body.persist !== false;

  const nowMs = Date.now();
  const flagFloor = new Date(nowMs - FLAG_LOOKBACK_MS).toISOString();
  const report: Record<string, unknown>[] = [];

  for (const instrument of RON_DATA_INSTRUMENTS) {
    // Failure isolation: one instrument's read error never aborts the sweep.
    try {
      const [latest, flags, prev] = await Promise.all([
        db.from("candle_history").select("timestamp")
          .eq("symbol", instrument).eq("timeframe", TIMEFRAME)
          .order("timestamp", { ascending: false }).limit(1).maybeSingle(),
        db.from("ron_data_quality_flags").select("bar_time", { count: "exact", head: true })
          .eq("symbol", instrument).eq("timeframe", TIMEFRAME)
          .eq("severity", "critical").gte("bar_time", flagFloor),
        db.from("ron_data_health_events").select("status,reason,latest_bar_time")
          .eq("instrument", instrument).eq("timeframe", TIMEFRAME)
          .order("observed_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      const health = assessDataHealth({
        instrument, timeframe: TIMEFRAME, now_ms: nowMs,
        latest_bar_time: latest.data?.timestamp ? String(latest.data.timestamp) : null,
        bar_minutes: BAR_MINUTES,
        critical_flag_count: flags.count ?? 0,
      });

      const material = isMaterialHealthChange(prev.data ?? null, health);
      let persisted = false;
      if (persist && material) {
        const { error } = await db.from("ron_data_health_events").insert({
          instrument, timeframe: TIMEFRAME,
          status: health.status, reason: health.reason,
          venue_state: health.venue.state, venue_class: health.venue.venue_class,
          venue_reason: health.venue.reason,
          latest_bar_time: health.latest_bar_time,
          age_minutes: health.age_minutes,
          critical_flag_count: health.critical_flag_count,
          evaluation_allowed: health.evaluation_allowed,
          next_expected_open: health.venue.next_expected_open,
          registry_version: RON_VENUE_REGISTRY_VERSION,
          health_version: RON_DATA_HEALTH_VERSION,
          observed_at: health.observed_at,
        });
        if (error) console.error("ron-data-health insert failed", instrument, error.message);
        else persisted = true;
      }

      report.push({
        instrument,
        ron_pilot: (RON_PILOT_INSTRUMENTS as readonly string[]).includes(instrument),
        status: health.status, reason: health.reason,
        venue_state: health.venue.state, venue_reason: health.venue.reason,
        latest_bar_time: health.latest_bar_time, age_minutes: health.age_minutes,
        critical_flag_count: health.critical_flag_count,
        evaluation_allowed: health.evaluation_allowed,
        next_expected_open: health.venue.next_expected_open,
        material_change: material, persisted,
      });
    } catch (err) {
      report.push({
        instrument, status: "watchdog_error", reason: String((err as Error)?.message ?? err),
        evaluation_allowed: false, material_change: false, persisted: false,
      });
    }
  }

  return json({
    ok: true,
    observed_at: new Date(nowMs).toISOString(),
    timeframe: TIMEFRAME,
    registry_version: RON_VENUE_REGISTRY_VERSION,
    health_version: RON_DATA_HEALTH_VERSION,
    instruments: report,
    numeric_probability: null,
    execution_allowed: false,
    execution_path: "signal_only",
  });
});
