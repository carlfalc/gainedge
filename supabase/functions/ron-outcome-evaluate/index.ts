/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — OUTCOME EVALUATOR.
 *
 * Bounded, idempotent, service-role-only sweep. Each run:
 *   1. reads a bounded batch of persisted material events whose outcome work is pending
 *   2. evaluates ONLY the horizons whose bars are fully completed and present
 *   3. appends the results (unique on event + horizon + outcome_version — a re-run is a
 *      no-op, never a duplicate and never a rewrite of an existing row)
 *   4. writes the lessons row once every declared horizon has been observed, then marks
 *      the event `complete` so it is never picked up again
 *
 * It never mutates the original event or its context record, never writes candles, never
 * emits a probability and never places an order.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  buildLesson, evaluateOutcome, OUTCOME_HORIZONS_BARS, OutcomeEvaluationError,
  RON_OUTCOME_EVALUATION_VERSION, type OutcomeBar, type OutcomeResult,
} from "../_shared/ron-outcome-evaluation-v1.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BAR_MS = 15 * 60_000;
const MAX_HORIZON = Math.max(...OUTCOME_HORIZONS_BARS);
const DEFAULT_BATCH = 25;

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
  try { body = await req.json(); } catch { body = {}; }
  const batchSize = Math.min(100, Math.max(1, Number(body.batch_size ?? DEFAULT_BATCH)));
  const reviewedAt = new Date().toISOString();

  const { data: events, error: evErr } = await db
    .from("ron_material_events")
    .select("id,instrument,timeframe,evaluation_anchor,direction_context,outcome_state")
    .eq("outcome_state", "pending")
    .order("evaluation_anchor", { ascending: true })
    .limit(batchSize);
  if (evErr) return json({ ok: false, reason: "event_read_failed", detail: evErr.message }, 500);

  const processed: Record<string, unknown>[] = [];

  for (const ev of events ?? []) {
    const anchorMs = Date.parse(String(ev.evaluation_anchor));
    const instrument = String(ev.instrument);
    const timeframe = String(ev.timeframe);
    try {
      const [refRes, fwdRes, existingRes] = await Promise.all([
        db.from("candle_history").select("close")
          .eq("symbol", instrument).eq("timeframe", timeframe)
          .eq("timestamp", new Date(anchorMs - BAR_MS).toISOString()).maybeSingle(),
        db.from("candle_history").select("timestamp,open,high,low,close")
          .eq("symbol", instrument).eq("timeframe", timeframe)
          .gte("timestamp", new Date(anchorMs).toISOString())
          .lt("timestamp", new Date(anchorMs + MAX_HORIZON * BAR_MS).toISOString())
          .order("timestamp", { ascending: true }).limit(MAX_HORIZON),
        db.from("ron_event_outcomes").select("horizon_bars")
          .eq("event_id", ev.id).eq("outcome_version", RON_OUTCOME_EVALUATION_VERSION),
      ]);

      const reference = Number(refRes.data?.close);
      if (!Number.isFinite(reference) || reference <= 0) {
        processed.push({ event_id: ev.id, evaluated: 0, reason: "reference_bar_missing" });
        continue;
      }

      const bars = ((fwdRes.data ?? []) as unknown as OutcomeBar[]).map((b) => ({
        timestamp: new Date(String(b.timestamp)).toISOString(),
        open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
      }));
      const alreadyDone = new Set((existingRes.data ?? []).map((r) => Number(r.horizon_bars)));

      const newResults: OutcomeResult[] = [];
      for (const horizon of OUTCOME_HORIZONS_BARS) {
        if (alreadyDone.has(horizon)) continue;
        // Only a horizon whose LAST bar is fully closed may be evaluated.
        if (anchorMs + horizon * BAR_MS > Date.now()) continue;
        try {
          newResults.push(evaluateOutcome({
            instrument, timeframe,
            evaluation_anchor: new Date(anchorMs).toISOString(),
            direction_context: String(ev.direction_context ?? ""),
            horizon_bars: horizon, bar_ms: BAR_MS,
            reference_price: reference, bars,
          }));
        } catch (err) {
          if (!(err instanceof OutcomeEvaluationError)) throw err;
          // insufficient completed bars -> stays pending, evaluated on a later sweep
        }
      }

      if (newResults.length > 0) {
        const { error: insErr } = await db.from("ron_event_outcomes").upsert(
          newResults.map((r) => ({ ...r, event_id: ev.id, reviewed_at: reviewedAt })),
          { onConflict: "event_id,horizon_bars,outcome_version", ignoreDuplicates: true },
        );
        if (insErr) {
          processed.push({ event_id: ev.id, evaluated: 0, reason: `outcome_persist_failed:${insErr.message}` });
          continue;
        }
      }

      const covered = new Set([...alreadyDone, ...newResults.map((r) => r.horizon_bars)]);
      let lessonWritten = false;
      if (OUTCOME_HORIZONS_BARS.every((h) => covered.has(h))) {
        const { data: allOutcomes } = await db.from("ron_event_outcomes")
          .select("*").eq("event_id", ev.id)
          .eq("outcome_version", RON_OUTCOME_EVALUATION_VERSION)
          .order("horizon_bars", { ascending: true });
        const lesson = buildLesson({
          instrument, timeframe,
          evaluation_anchor: new Date(anchorMs).toISOString(),
          reviewed_at: reviewedAt,
          outcomes: (allOutcomes ?? []) as unknown as OutcomeResult[],
        });
        if (lesson) {
          const { error: lErr } = await db.from("ron_event_lessons").upsert(
            { ...lesson, event_id: ev.id },
            { onConflict: "event_id,lesson_version", ignoreDuplicates: true },
          );
          lessonWritten = !lErr;
        }
        await db.from("ron_material_events")
          .update({ outcome_state: "complete" }).eq("id", ev.id);
      }

      processed.push({
        event_id: ev.id, instrument, timeframe,
        evaluation_anchor: new Date(anchorMs).toISOString(),
        evaluated: newResults.length,
        horizons_covered: [...covered].sort((a, b) => a - b),
        lesson_written: lessonWritten,
      });
    } catch (err) {
      processed.push({
        event_id: ev.id, evaluated: 0,
        reason: `event_outcome_error:${String((err as Error)?.message ?? err)}`,
      });
    }
  }

  return json({
    ok: true,
    reviewed_at: reviewedAt,
    outcome_version: RON_OUTCOME_EVALUATION_VERSION,
    horizons: OUTCOME_HORIZONS_BARS,
    considered: (events ?? []).length,
    processed,
    numeric_probability: null,
    execution_allowed: false,
    execution_path: "signal_only",
  });
});
