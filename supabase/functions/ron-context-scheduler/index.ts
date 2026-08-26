/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — MULTI-INSTRUMENT UNATTENDED SCHEDULER.
 *
 * Server-side only, browser-independent, service-role gated. On each tick it walks the
 * declared pilot instruments (XAUUSD keeps its own frozen V1 scheduler and is excluded
 * here) and, for each one, evaluates AT MOST ONE new completed 15m anchor through the
 * forward Opportunity Context V2 path.
 *
 * Fail-closed on every axis:
 *   • no authoritative venue truth  -> reported, instrument skipped, others continue
 *   • no completed candle           -> reported, nothing invented
 *   • no accepted v7 snapshot       -> reported, nothing inferred
 *   • anchor already has a V2 row   -> skipped (idempotent, no duplicate work)
 * It never places an order, never emits a probability and never writes candles.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { assessVenue } from "../_shared/ron-venue-registry-v1.ts";
import { FORWARD_CONTEXT_INSTRUMENTS } from "../_shared/ron-forward-instrument-binding-v1.ts";
import { OPPORTUNITY_CONTEXT_RUNTIME_V1 } from "../_shared/ron-opportunity-context-runtime-v1.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BAR_MS = 15 * 60_000;
const TIMEFRAME = "15m";
const MAX_ANCHOR_AGE_MS = 6 * 60 * 60_000;
const FEATURE_VERSION = OPPORTUNITY_CONTEXT_RUNTIME_V1.source_contract.feature_version;

/** XAUUSD stays on its own frozen decision-bound scheduler. */
const SCHEDULED_INSTRUMENTS = FORWARD_CONTEXT_INSTRUMENTS.filter((i) => i !== "XAUUSD");

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

  const nowMs = Date.now();
  const floorIso = new Date(nowMs - MAX_ANCHOR_AGE_MS).toISOString();
  const results: Record<string, unknown>[] = [];

  for (const instrument of SCHEDULED_INSTRUMENTS) {
    try {
      const venue = assessVenue(instrument, nowMs);
      if (venue.state !== "open" && venue.state !== "closed") {
        results.push({ instrument, scheduled: false, reason: "venue_not_authoritative", venue_state: venue.state });
        continue;
      }

      const [candles, snaps, contexts] = await Promise.all([
        db.from("candle_history").select("timestamp")
          .eq("symbol", instrument).eq("timeframe", TIMEFRAME).gte("timestamp", floorIso)
          .order("timestamp", { ascending: false }).limit(8),
        db.from("ron_market_snapshots").select("bar_time")
          .eq("symbol", instrument).eq("timeframe", TIMEFRAME)
          .eq("feature_version", FEATURE_VERSION).gte("bar_time", floorIso)
          .order("bar_time", { ascending: false }).limit(8),
        db.from("ron_opportunity_context").select("evaluation_anchor")
          .eq("instrument", instrument).eq("timeframe", TIMEFRAME)
          .eq("spec_version", 2).eq("runtime_version", 2)
          .gte("evaluation_anchor", floorIso)
          .order("evaluation_anchor", { ascending: false }).limit(32),
      ]);
      const readErr = candles.error ?? snaps.error ?? contexts.error;
      if (readErr) {
        results.push({ instrument, scheduled: false, reason: "source_read_failed", detail: readErr.message });
        continue;
      }

      const snapSet = new Set((snaps.data ?? [])
        .map((r) => new Date(String(r.bar_time)).toISOString()));
      const done = new Set((contexts.data ?? [])
        .map((r) => new Date(String(r.evaluation_anchor)).toISOString()));

      // Candidate anchors = close time of a completed bar that has an accepted snapshot.
      const candidates = (candles.data ?? [])
        .map((r) => new Date(String(r.timestamp)).getTime())
        .filter((t) => Number.isFinite(t) && t % BAR_MS === 0)
        .filter((t) => t + BAR_MS <= nowMs)
        .filter((t) => snapSet.has(new Date(t).toISOString()))
        .map((t) => t + BAR_MS)
        .filter((a) => !done.has(new Date(a).toISOString()))
        .sort((a, b) => b - a);

      if (candidates.length === 0) {
        results.push({ instrument, scheduled: false, reason: "no_new_eligible_anchor", venue_state: venue.state });
        continue;
      }

      const anchorIso = new Date(candidates[0]).toISOString();
      const res = await fetch(`${supabaseUrl}/functions/v1/ron-opportunity-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          instrument, timeframe: TIMEFRAME, evaluation_anchor: anchorIso,
          runtime_version: 2, persist: true,
        }),
      });
      const out = await res.json().catch(() => ({}));
      results.push({
        instrument, scheduled: true, evaluation_anchor: anchorIso,
        http_status: res.status,
        persisted: out?.persisted === true,
        venue_state: out?.venue_state ?? venue.state,
        lifecycle: out?.lifecycle ?? null,
        material_change_type: out?.material_change_type ?? null,
        material_event: out?.material_event ?? null,
        reason: res.ok ? null : (out?.reason ?? "opportunity_context_failed"),
      });
    } catch (err) {
      results.push({
        instrument, scheduled: false, reason: "instrument_tick_error",
        detail: String((err as Error)?.message ?? err),
      });
    }
  }

  return json({
    ok: true,
    at: new Date(nowMs).toISOString(),
    timeframe: TIMEFRAME,
    instruments: SCHEDULED_INSTRUMENTS,
    results,
    numeric_probability: null,
    execution_allowed: false,
    execution_path: "signal_only",
  });
});
