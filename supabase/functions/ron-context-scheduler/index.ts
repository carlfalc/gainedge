/**
 * GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1 — MULTI-INSTRUMENT
 * UNATTENDED RON RUNTIME (supersedes the context-only scheduler of
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1).
 *
 * Server-side only, browser-independent, service-role gated. On each tick it walks the
 * declared pilot instruments (XAUUSD keeps its own frozen V1 scheduler and is excluded
 * here) and, for each one, drives the REAL chain on at most one new completed 15m anchor:
 *
 *   completed candle -> accepted v7 snapshot -> seven-specialist orchestration run V10
 *   -> stored evidence + stored decision -> Opportunity Context V2 -> material event
 *
 * Opportunity Context is NEVER invoked as a stand-in for the agents: it runs only after
 * the orchestration attempt for that exact anchor, and the cycle record states plainly
 * whether the agent chain settled.
 *
 * Fail-closed on every axis:
 *   • no authoritative venue truth  -> reported, instrument skipped, others continue
 *   • no completed candle           -> reported, nothing invented
 *   • completed bar, snapshot not landed yet -> DEFERRED (ordinary latency), retried
 *   • snapshot still absent past the grace period -> blocked_data, nothing inferred
 *   • anchor already evaluated      -> skipped (idempotent, no duplicate work)
 * It never places an order, never emits a probability and never writes candles.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { assessVenue } from "../_shared/ron-venue-registry-v1.ts";
import { FORWARD_CONTEXT_INSTRUMENTS } from "../_shared/ron-forward-instrument-binding-v1.ts";
import { OPPORTUNITY_CONTEXT_RUNTIME_V1 } from "../_shared/ron-opportunity-context-runtime-v1.ts";
import {
  evaluateCycleCompleteness, type CycleCompleteness, type CycleStatus,
} from "../_shared/ron-native-roster-v1.ts";
import {
  RON_ORCHESTRATION_RUN_VERSION_V10,
} from "../_shared/ron-orchestration-run-v10.ts";

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
/**
 * How long after a bar closes an accepted snapshot may still be in flight before the
 * absence stops being ordinary latency. Snapshot ingestion runs on its own cadence, so a
 * few minutes of lag is normal pipeline behaviour, not a data fault.
 */
const SNAPSHOT_GRACE_MS = 25 * 60_000;
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
  /** Close of the most recent fully completed bar. Used to key blocked cycle records. */
  const lastCompletedCloseIso = new Date(Math.floor(nowMs / BAR_MS) * BAR_MS).toISOString();
  const results: Record<string, unknown>[] = [];

  /** Reads the component ids that genuinely settled for this exact anchor. */
  async function observedComponents(instrument: string, anchorIso: string): Promise<string[]> {
    const { data, error } = await db.from("ron_agent_runs").select("agent_id")
      .eq("instrument", instrument).eq("timeframe", TIMEFRAME).eq("as_of", anchorIso);
    if (error) return [];
    return [...new Set((data ?? []).map((r) => String(r.agent_id ?? "")).filter(Boolean))];
  }

  /**
   * Append-only observability record. A cycle is logged whether it completed, was
   * incomplete, or was blocked — silence is never used to imply success. Failure to log
   * never affects the evaluation itself.
   */
  async function recordCycle(c: CycleCompleteness, venueState: string, venueReason: string | null) {
    try {
      await db.from("ron_data_health_events").insert({
        instrument: c.instrument,
        timeframe: c.timeframe,
        status: c.cycle_status === "complete" ? "ok" : "degraded",
        reason: c.reason,
        venue_state: venueState,
        venue_reason: venueReason,
        evaluation_allowed: c.cycle_status === "complete" || c.cycle_status === "incomplete",
        evaluation_anchor: c.evaluation_anchor,
        cycle_status: c.cycle_status,
        roster_version: c.roster_version,
        expected_components: c.expected_components,
        completed_components: c.completed_components,
        missing_components: c.missing_components,
        context_written: c.context_written,
        material_event_written: c.material_event_written,
      });
    } catch (_err) {
      // Observability must never break the runtime.
    }
  }

  async function blockedCycle(
    instrument: string, anchorIso: string, status: Exclude<CycleStatus, "complete" | "incomplete">,
    reason: string, venueState: string, venueReason: string | null,
  ) {
    await recordCycle(evaluateCycleCompleteness({
      instrument, timeframe: TIMEFRAME, evaluation_anchor: anchorIso,
      observed_components: [], context_written: false, material_event_written: false,
      blocked: { status, reason },
    }), venueState, venueReason);
  }

  for (const instrument of SCHEDULED_INSTRUMENTS) {
    try {
      const venue = assessVenue(instrument, nowMs);
      if (venue.state !== "open" && venue.state !== "closed") {
        await blockedCycle(instrument, lastCompletedCloseIso, "blocked_venue",
          "venue_not_authoritative", venue.state, venue.reason ?? null);
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
        await blockedCycle(instrument, lastCompletedCloseIso, "blocked_data",
          "source_read_failed", venue.state, venue.reason ?? null);
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
        // Distinguish ordinary pipeline latency, a closed market and a real data gap.
        const alreadyDone = done.has(lastCompletedCloseIso);
        // A genuine completed bar whose accepted snapshot simply has not landed yet.
        const awaitingSnapshot = (candles.data ?? [])
          .map((r) => new Date(String(r.timestamp)).getTime())
          .filter((t) => Number.isFinite(t) && t % BAR_MS === 0)
          .filter((t) => t + BAR_MS <= nowMs)
          .filter((t) => !snapSet.has(new Date(t).toISOString()))
          .filter((t) => !done.has(new Date(t + BAR_MS).toISOString()))
          .some((t) => nowMs - (t + BAR_MS) <= SNAPSHOT_GRACE_MS);
        if (!alreadyDone) {
          await blockedCycle(instrument, lastCompletedCloseIso,
            venue.state === "closed"
              ? "blocked_market"
              : awaitingSnapshot ? "deferred" : "blocked_data",
            venue.state === "closed"
              ? "venue_closed_no_new_completed_bar"
              : awaitingSnapshot
              ? "deferred_awaiting_accepted_snapshot"
              : "no_accepted_snapshot_for_completed_bar",
            venue.state, venue.reason ?? null);
        }
        results.push({
          instrument, scheduled: false,
          reason: awaitingSnapshot ? "deferred_awaiting_accepted_snapshot" : "no_new_eligible_anchor",
          deferred: awaitingSnapshot,
          venue_state: venue.state,
        });
        continue;
      }

      const anchorIso = new Date(candidates[0]).toISOString();

      /**
       * THE REAL RON CHAIN. The seven-specialist orchestration run is attempted FIRST for
       * this exact anchor, so stored specialist evidence and (where the contract accepts
       * it) a stored decision exist before any context record is written. It is idempotent
       * per anchor: a decision already stored for this anchor is never re-run.
       */
      let orchestration: Record<string, unknown> = { attempted: false };
      const { data: existingDecision } = await db.from("ron_orchestrator_decisions")
        .select("decision_id").eq("instrument", instrument).eq("timeframe", TIMEFRAME)
        .eq("as_of", anchorIso).limit(1);
      if (existingDecision?.length) {
        orchestration = { attempted: false, reason: "already_decided", persisted: true };
      } else {
        try {
          const orchRes = await fetch(`${supabaseUrl}/functions/v1/ron-orchestrate-run`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              instrument, timeframe: TIMEFRAME, evaluation_anchor: anchorIso,
              orchestration_run_version: RON_ORCHESTRATION_RUN_VERSION_V10,
              trace_id: `ron_sched_v10_${anchorIso}_${instrument}_${TIMEFRAME}`,
              persist: true,
            }),
          });
          const orchOut = await orchRes.json().catch(() => ({}));
          orchestration = {
            attempted: true,
            http_status: orchRes.status,
            persisted: orchOut?.persisted === true,
            state: orchOut?.decision?.state ?? null,
            decision_id: orchOut?.decision?.decision_id ?? null,
            // Deterministic contract reasons only: no evidence content, no keys.
            error: orchRes.ok ? null : (orchOut?.error ?? "orchestration_failed"),
            reasons: Array.isArray(orchOut?.reasons) ? orchOut.reasons : null,
          };
        } catch (orchErr) {
          orchestration = {
            attempted: true, persisted: false,
            error: `orchestration_unreachable:${String((orchErr as Error)?.message ?? orchErr)}`,
          };
        }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/ron-opportunity-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },

        body: JSON.stringify({
          instrument, timeframe: TIMEFRAME, evaluation_anchor: anchorIso,
          runtime_version: 2, persist: true,
        }),
      });
      const out = await res.json().catch(() => ({}));

      const completeness = evaluateCycleCompleteness({
        instrument, timeframe: TIMEFRAME, evaluation_anchor: anchorIso,
        observed_components: await observedComponents(instrument, anchorIso),
        context_written: out?.persisted === true,
        material_event_written: !!out?.material_event,
        blocked: res.ok
          ? (out?.data_blocked === true
            ? { status: "blocked_data" as const, reason: String(out?.data_state ?? "data_blocked") }
            : null)
          : { status: "blocked_data" as const, reason: String(out?.reason ?? "opportunity_context_failed") },
      });
      await recordCycle(completeness, String(out?.venue_state ?? venue.state), venue.reason ?? null);

      results.push({
        instrument, scheduled: true, evaluation_anchor: anchorIso,
        orchestration,
        http_status: res.status,
        persisted: out?.persisted === true,
        venue_state: out?.venue_state ?? venue.state,
        lifecycle: out?.lifecycle ?? null,
        material_change_type: out?.material_change_type ?? null,
        material_event: out?.material_event ?? null,
        cycle_status: completeness.cycle_status,
        completed_components: completeness.completed_components,
        missing_components: completeness.missing_components,
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
