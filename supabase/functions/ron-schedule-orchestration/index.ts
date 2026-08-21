/**
 * GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1 — internal, service-role-only RON scheduler.
 *
 * Server-side only, browser-independent. On each tick it looks for ONE new safe COMPLETED
 * XAUUSD 15m evaluation anchor and, only if no stored decision already exists for that
 * exact anchor, invokes the EXISTING frozen orchestration endpoint (`ron-orchestrate-run`)
 * with the frozen seven-agent run version and its own existing immutable persistence path.
 *
 * It never mutates any frozen orchestrator artifact, never places an order, never touches
 * research/calibration state, never emits a probability, and never widens instrument or
 * timeframe scope. Fail-closed on missing, stale, incomplete or quarantined source data.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  MAX_ANCHOR_AGE_MS, RUNTIME_INSTRUMENT, RUNTIME_TIMEFRAME, selectAnchor,
} from "./anchor-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Frozen seven-agent orchestration run version. Pinned; never inferred from a request. */
const ORCHESTRATION_RUN_VERSION = 7;

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

  // Internal-only: the caller must present the service-role key itself, or an internal
  // cron token already registered in Vault (the canonical existing RON cron pattern).
  let authorized = !!token && !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await db.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) {
    return json({ error: "unauthorized: internal service-role endpoint" }, 401);
  }
  const nowMs = Date.now();
  const sourceFloorIso = new Date(nowMs - MAX_ANCHOR_AGE_MS).toISOString();

  try {
    const [snaps, candles, decisions, flags] = await Promise.all([
      db.from("ron_market_snapshots").select("bar_time")
        .eq("symbol", RUNTIME_INSTRUMENT).eq("timeframe", RUNTIME_TIMEFRAME)
        .gte("bar_time", sourceFloorIso).order("bar_time", { ascending: false }).limit(64),
      db.from("candle_history").select("timestamp")
        .eq("symbol", RUNTIME_INSTRUMENT).eq("timeframe", RUNTIME_TIMEFRAME)
        .gte("timestamp", sourceFloorIso).order("timestamp", { ascending: false }).limit(64),
      db.from("ron_orchestrator_decisions").select("as_of")
        .eq("instrument", RUNTIME_INSTRUMENT).eq("timeframe", RUNTIME_TIMEFRAME)
        .gte("as_of", sourceFloorIso).order("as_of", { ascending: false }).limit(64),
      db.from("ron_data_quality_flags").select("bar_time,severity")
        .eq("symbol", RUNTIME_INSTRUMENT).eq("timeframe", RUNTIME_TIMEFRAME)
        .gte("bar_time", sourceFloorIso).limit(256),
    ]);

    const readErr = snaps.error ?? candles.error ?? decisions.error ?? flags.error;
    if (readErr) return json({ scheduled: false, reason: "source_read_failed", detail: readErr.message }, 500);

    const gate = selectAnchor({
      now_ms: nowMs,
      snapshot_bar_times: (snaps.data ?? []).map((r) => String(r.bar_time)),
      candle_bar_times: (candles.data ?? []).map((r) => String(r.timestamp)),
      decision_anchors: (decisions.data ?? []).map((r) => String(r.as_of)),
      quarantined_bar_times: (flags.data ?? [])
        .filter((r) => String(r.severity).toLowerCase() === "critical")
        .map((r) => String(r.bar_time)),
    });

    if (!gate.run) {
      return json({
        scheduled: false, reason: gate.reason,
        instrument: RUNTIME_INSTRUMENT, timeframe: RUNTIME_TIMEFRAME,
        at: new Date(nowMs).toISOString(),
      });
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/ron-orchestrate-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        instrument: RUNTIME_INSTRUMENT,
        timeframe: RUNTIME_TIMEFRAME,
        evaluation_anchor: gate.anchor,
        orchestration_run_version: ORCHESTRATION_RUN_VERSION,
        trace_id: `ron_sched_v1_${gate.anchor}_${RUNTIME_INSTRUMENT}_${RUNTIME_TIMEFRAME}`,
        persist: true,
      }),
    });
    const out = await res.json().catch(() => ({}));

    return json({
      scheduled: true,
      instrument: RUNTIME_INSTRUMENT,
      timeframe: RUNTIME_TIMEFRAME,
      evaluation_anchor: gate.anchor,
      bar_time: gate.bar_time,
      orchestration_run_version: ORCHESTRATION_RUN_VERSION,
      orchestration_http_status: res.status,
      persisted: out?.persisted === true,
      decision_id: out?.decision?.decision_id ?? null,
      decision_hash: out?.decision?.decision_hash ?? null,
      state: out?.decision?.state ?? null,
      error: res.ok ? null : (out?.error ?? "orchestration_failed"),
      // Deterministic, non-sensitive contract reasons from the frozen runner. Operational
      // visibility only; no evidence content, no subject material, no keys.
      reasons: res.ok ? null : (Array.isArray(out?.reasons) ? out.reasons : null),
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
    }, res.ok ? 200 : 502);
  } catch (err) {
    return json({ scheduled: false, reason: "scheduler_error", detail: String((err as Error)?.message ?? err) }, 500);
  }
});
