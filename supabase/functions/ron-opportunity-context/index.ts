/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — internal, service-role-only evaluation and
 * append-only persistence of the FROZEN pure producer `OPPORTUNITY_CONTEXT_SPEC_V1`.
 *
 * For ONE stored orchestration decision (instrument, timeframe, evaluation anchor) it:
 *   1. reads the decision row to take the anchor + trace identity (never invents them),
 *   2. reads the SEALED specialist envelopes that decision was built from,
 *   3. reads completed `candle_history` bars and accepted `ron_market_snapshots` v7
 *      features at the analytical bar (anchor - 1 bar) and the bar before it,
 *   4. builds HA Pattern Context V1, then Opportunity Context V1,
 *   5. persists the categorical result idempotently — only when `persist: true`.
 *
 * Safety: no order, no probability, no execution intent, no user-identifiable material,
 * no mutation of any frozen artifact, and ZERO database writes when `persist` is not true.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  buildHaPatternContextV1,
} from "../_shared/ron-ha-pattern-context-spec-v1.ts";
import {
  buildOpportunityContextV1,
} from "../_shared/ron-opportunity-context-spec-v1.ts";
import {
  assertRuntimeScope, BAR_MS, buildPersistRow, deriveRunIds, envelopeByAgent,
  OPPORTUNITY_CONTEXT_RUNTIME_V1, OpportunityRuntimeError, pickSnapshotFeatures,
  priorInputsFrom, selectHaSourceBars, type RawCandleRow, type StoredEvidenceRow,
} from "../_shared/ron-opportunity-context-runtime-v1.ts";
import {
  buildHaPatternContextV2, buildOpportunityContextV2, OpportunityContextV2Error,
} from "../_shared/ron-opportunity-context-spec-v2.ts";
import {
  assertRuntimeScopeV2, buildPersistRowV2, deriveRunIdsV2, deriveStandaloneTraceId,
  OPPORTUNITY_CONTEXT_RUNTIME_V2,
} from "../_shared/ron-opportunity-context-runtime-v2.ts";
import { assessVenue } from "../_shared/ron-venue-registry-v1.ts";
import { buildMaterialEventRow } from "../_shared/ron-material-events-v1.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const SESSION_AGENT = "session_market_structure";
const PATTERN_AGENT = "pattern_context";
const CROSS_ASSET_AGENT = "cross_asset_correlation";
const MACRO_AGENT = "macro_news_geopolitics";

const FEATURE_VERSION = OPPORTUNITY_CONTEXT_RUNTIME_V1.source_contract.feature_version;

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

  const instrument = String(body.instrument ?? "").trim();
  const timeframe = String(body.timeframe ?? "").trim();
  const anchorRaw = String(body.evaluation_anchor ?? "").trim();
  const persist = body.persist === true;
  const requestedRuntime = Number(body.runtime_version ?? 1);

  if (requestedRuntime === 2) {
    return await runV2(db, instrument, timeframe, anchorRaw, persist);
  }

  try {

    const anchorMs = Date.parse(anchorRaw);
    assertRuntimeScope(instrument, timeframe, anchorMs);
    const anchorIso = new Date(anchorMs).toISOString();
    const analyticalIso = new Date(anchorMs - BAR_MS).toISOString();
    const priorBarIso = new Date(anchorMs - 2 * BAR_MS).toISOString();

    /* ---- 1. stored decision identity ---------------------------------- */
    const { data: decisionRow, error: decisionErr } = await db
      .from("ron_orchestrator_decisions")
      .select("decision_id,trace_id,as_of,instrument,timeframe")
      .eq("instrument", instrument).eq("timeframe", timeframe).eq("as_of", anchorIso)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (decisionErr) return json({ error: "decision_read_failed", detail: decisionErr.message }, 500);
    if (!decisionRow) {
      throw new OpportunityRuntimeError("stored_decision_missing", anchorIso);
    }

    const traceId = String(decisionRow.trace_id);
    const decisionId = String(decisionRow.decision_id);
    const { ha_run_id, opportunity_run_id } = deriveRunIds(instrument, timeframe, anchorIso);

    /* ---- 2. sealed specialist envelopes -------------------------------- */
    const { data: links, error: linkErr } = await db
      .from("ron_decision_evidence")
      .select("evidence_hash,agent_id")
      .eq("decision_id", decisionId);
    if (linkErr) return json({ error: "evidence_link_read_failed", detail: linkErr.message }, 500);

    const hashes = (links ?? []).map((l) => String(l.evidence_hash));
    let evidenceRows: StoredEvidenceRow[] = [];
    if (hashes.length > 0) {
      const { data: ev, error: evErr } = await db
        .from("ron_agent_evidence").select("agent_id,envelope").in("evidence_hash", hashes);
      if (evErr) return json({ error: "evidence_read_failed", detail: evErr.message }, 500);
      evidenceRows = (ev ?? []) as StoredEvidenceRow[];
    }

    /* ---- 3. bars + accepted features ----------------------------------- */
    const windowStartIso =
      new Date(anchorMs - (OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_bar_window + 2) * BAR_MS).toISOString();
    const [candles, snapshots] = await Promise.all([
      db.from("candle_history").select("timestamp,open,high,low,close")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .gte("timestamp", windowStartIso).lte("timestamp", analyticalIso)
        .order("timestamp", { ascending: false })
        .limit(OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_bar_window + 4),
      db.from("ron_market_snapshots").select("bar_time,features,feature_version")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .eq("feature_version", FEATURE_VERSION)
        .in("bar_time", [analyticalIso, priorBarIso]),
    ]);
    if (candles.error) return json({ error: "candle_read_failed", detail: candles.error.message }, 500);
    if (snapshots.error) return json({ error: "snapshot_read_failed", detail: snapshots.error.message }, 500);

    const bars = selectHaSourceBars((candles.data ?? []) as unknown as RawCandleRow[], anchorMs);
    const snapAt = (iso: string) =>
      (snapshots.data ?? []).find((s) => new Date(String(s.bar_time)).toISOString() === iso) ?? null;
    const features = pickSnapshotFeatures(snapAt(analyticalIso)?.features);
    const priorFeatures = pickSnapshotFeatures(snapAt(priorBarIso)?.features);

    /* ---- 4. prior persisted anchor -------------------------------------- */
    const { data: priorRow } = await db
      .from("ron_opportunity_context")
      .select("evaluation_anchor,lifecycle,direction_context,ha_states")
      .eq("instrument", instrument).eq("timeframe", timeframe)
      .lt("evaluation_anchor", anchorIso)
      .order("evaluation_anchor", { ascending: false }).limit(1).maybeSingle();
    const prior = priorInputsFrom(priorRow ?? null, anchorMs);

    /* ---- 5. producers ---------------------------------------------------- */
    const sessionEvidence = envelopeByAgent(evidenceRows, SESSION_AGENT);
    const ha = await buildHaPatternContextV1({
      instrument, timeframe, evaluation_anchor: anchorMs, bars,
      features, prior_features: priorFeatures,
      session_evidence: sessionEvidence,
      prior_lifecycle: prior.prior_ha_lifecycle,
      trace_id: traceId, run_id: ha_run_id,
    });

    const result = await buildOpportunityContextV1({
      instrument, timeframe, evaluation_anchor: anchorMs, ha_context: ha,
      session_evidence: sessionEvidence,
      pattern_evidence: envelopeByAgent(evidenceRows, PATTERN_AGENT),
      cross_asset_evidence: envelopeByAgent(evidenceRows, CROSS_ASSET_AGENT),
      macro_evidence: envelopeByAgent(evidenceRows, MACRO_AGENT),
      prior_state: prior.prior_state,
      prior_direction_context: prior.prior_direction_context,
      prior_ema_relationship: prior.prior_ema_relationship,
      trace_id: traceId, run_id: opportunity_run_id,
    });

    const row = buildPersistRow(result, ha, decisionId);

    /* ---- 6. append-only persistence -------------------------------------- */
    let persisted = false;
    if (persist) {
      const { error: insErr } = await db
        .from("ron_opportunity_context")
        .upsert(row, {
          onConflict: OPPORTUNITY_CONTEXT_RUNTIME_V1.persistence.conflict_key.join(","),
          ignoreDuplicates: true,
        });
      if (insErr) return json({ error: "persist_failed", detail: insErr.message }, 500);
      persisted = true;
      await emitMaterialEvent(db, {
        instrument, timeframe,
        evaluation_anchor: result.evaluation_anchor,
        analytical_bar_open: result.analytical_bar_open,
        spec_version: result.spec_version,
        runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V1.runtime_version,
        context_id: null,
        decision_id: decisionId,
        trace_id: traceId,
        material_change_type: result.material_change_type,
        lifecycle: result.lifecycle,
        direction_context: result.direction_context,
        direction_authority: result.direction_authority,
        setup_family: result.setup_family,
        data_state: result.data_state,
        data_blocked: result.data_blocked === true,
        venue_state: null,
      });
    }


    return json({
      ok: true,
      persisted,
      instrument, timeframe,
      evaluation_anchor: result.evaluation_anchor,
      analytical_bar_open: result.analytical_bar_open,
      decision_id: decisionId,
      trace_id: traceId,
      spec_id: result.spec_id,
      spec_version: result.spec_version,
      spec_hash: result.spec_hash,
      runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V1.runtime_version,
      ha_bars_considered: ha.ha_bars_considered,
      ha_states: ha.states,
      lifecycle: result.lifecycle,
      direction_context: result.direction_context,
      direction_authority: result.direction_authority,
      setup_family: result.setup_family,
      material_change_type: result.material_change_type,
      data_state: result.data_state,
      context_admissibility: result.context_admissibility,
      reason_tokens: result.reason_tokens,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
    });
  } catch (err) {
    if (err instanceof OpportunityRuntimeError) {
      return json({ ok: false, reason: err.reason, detail: err.detail ?? null }, 422);
    }
    const message = String((err as Error)?.message ?? err);
    return json({ ok: false, reason: "opportunity_context_runtime_error", detail: message }, 422);
  }
});

/* =======================================================================
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — durable material event emission.
 * Idempotent by construction: the deterministic `event_key` is unique, so
 * re-evaluating an anchor can never produce a second event. A failure here is
 * reported but never invalidates the already-persisted context record.
 * ===================================================================== */
async function emitMaterialEvent(
  db: ReturnType<typeof createClient>,
  source: Parameters<typeof buildMaterialEventRow>[0],
): Promise<{ emitted: boolean; reason: string | null }> {
  const row = buildMaterialEventRow(source);
  if (!row) return { emitted: false, reason: "not_material" };
  try {
    const { data: ctx } = await db
      .from("ron_opportunity_context").select("id")
      .eq("instrument", source.instrument).eq("timeframe", source.timeframe)
      .eq("evaluation_anchor", source.evaluation_anchor)
      .eq("spec_version", source.spec_version)
      .eq("runtime_version", source.runtime_version)
      .maybeSingle();
    const { error } = await db.from("ron_material_events")
      .upsert({ ...row, context_id: ctx?.id ?? null },
        { onConflict: "event_key", ignoreDuplicates: true });
    if (error) return { emitted: false, reason: `event_persist_failed:${error.message}` };
    return { emitted: true, reason: null };
  } catch (err) {
    return { emitted: false, reason: `event_unreachable:${String((err as Error)?.message ?? err)}` };
  }
}

/* =======================================================================
 * OPPORTUNITY CONTEXT V2 PATH — multi-instrument, venue-bound, decision-optional.
 * The V1 path above is untouched; V2 rows are a separate lineage
 * (`spec_version = 2`, `runtime_version = 2`) and never overwrite a V1 row.
 * ===================================================================== */
async function runV2(
  db: ReturnType<typeof createClient>,
  instrument: string, timeframe: string, anchorRaw: string, persist: boolean,
): Promise<Response> {
  try {
    const anchorMs = Date.parse(anchorRaw);
    assertRuntimeScopeV2(instrument, timeframe, anchorMs);
    const anchorIso = new Date(anchorMs).toISOString();
    const analyticalIso = new Date(anchorMs - BAR_MS).toISOString();
    const priorBarIso = new Date(anchorMs - 2 * BAR_MS).toISOString();

    // Venue truth for the analytical bar. Non-authoritative venues are refused by spec.
    const venue = assessVenue(instrument, anchorMs - 1);
    if (venue.state !== "open" && venue.state !== "closed") {
      return json({
        ok: false, reason: "venue_state_not_authoritative", detail: venue.state,
        instrument, timeframe, evaluation_anchor: anchorIso,
      }, 422);
    }

    /* stored decision identity — OPTIONAL in V2 */
    const { data: decisionRow, error: decisionErr } = await db
      .from("ron_orchestrator_decisions")
      .select("decision_id,trace_id")
      .eq("instrument", instrument).eq("timeframe", timeframe).eq("as_of", anchorIso)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (decisionErr) return json({ error: "decision_read_failed", detail: decisionErr.message }, 500);

    const decisionId = decisionRow ? String(decisionRow.decision_id) : null;
    const traceId = decisionRow
      ? String(decisionRow.trace_id)
      : deriveStandaloneTraceId(instrument, timeframe, anchorIso);
    const { ha_run_id, opportunity_run_id } = deriveRunIdsV2(instrument, timeframe, anchorIso);

    /* sealed specialist envelopes exist only for a decision-bound anchor */
    let evidenceRows: StoredEvidenceRow[] = [];
    if (decisionId) {
      const { data: links, error: linkErr } = await db
        .from("ron_decision_evidence").select("evidence_hash,agent_id")
        .eq("decision_id", decisionId);
      if (linkErr) return json({ error: "evidence_link_read_failed", detail: linkErr.message }, 500);
      const hashes = (links ?? []).map((l) => String(l.evidence_hash));
      if (hashes.length > 0) {
        const { data: ev, error: evErr } = await db
          .from("ron_agent_evidence").select("agent_id,envelope").in("evidence_hash", hashes);
        if (evErr) return json({ error: "evidence_read_failed", detail: evErr.message }, 500);
        evidenceRows = (ev ?? []) as StoredEvidenceRow[];
      }
    }

    /* bars + accepted features */
    const windowStartIso =
      new Date(anchorMs - (OPPORTUNITY_CONTEXT_RUNTIME_V2.ha_bar_window + 2) * BAR_MS).toISOString();
    const [candles, snapshots] = await Promise.all([
      db.from("candle_history").select("timestamp,open,high,low,close")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .gte("timestamp", windowStartIso).lte("timestamp", analyticalIso)
        .order("timestamp", { ascending: false })
        .limit(OPPORTUNITY_CONTEXT_RUNTIME_V2.ha_bar_window + 4),
      db.from("ron_market_snapshots").select("bar_time,features,feature_version")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .eq("feature_version", FEATURE_VERSION)
        .in("bar_time", [analyticalIso, priorBarIso]),
    ]);
    if (candles.error) return json({ error: "candle_read_failed", detail: candles.error.message }, 500);
    if (snapshots.error) return json({ error: "snapshot_read_failed", detail: snapshots.error.message }, 500);

    const bars = selectHaSourceBars((candles.data ?? []) as unknown as RawCandleRow[], anchorMs);
    const snapAt = (iso: string) =>
      (snapshots.data ?? []).find((s) => new Date(String(s.bar_time)).toISOString() === iso) ?? null;
    const features = pickSnapshotFeatures(snapAt(analyticalIso)?.features);
    const priorFeatures = pickSnapshotFeatures(snapAt(priorBarIso)?.features);

    /* prior persisted anchor within the V2 lineage only */
    const { data: priorRow } = await db
      .from("ron_opportunity_context")
      .select("evaluation_anchor,lifecycle,direction_context,ha_states")
      .eq("instrument", instrument).eq("timeframe", timeframe)
      .eq("spec_version", 2).eq("runtime_version", 2)
      .lt("evaluation_anchor", anchorIso)
      .order("evaluation_anchor", { ascending: false }).limit(1).maybeSingle();
    const prior = priorInputsFrom(priorRow ?? null, anchorMs);

    const sessionEvidence = envelopeByAgent(evidenceRows, SESSION_AGENT);
    const ha = await buildHaPatternContextV2({
      instrument, timeframe, evaluation_anchor: anchorMs, bars,
      features, prior_features: priorFeatures,
      session_evidence: sessionEvidence,
      prior_lifecycle: prior.prior_ha_lifecycle,
      trace_id: traceId, run_id: ha_run_id,
    });

    const result = await buildOpportunityContextV2({
      instrument, timeframe, evaluation_anchor: anchorMs, ha_context: ha,
      session_evidence: sessionEvidence,
      pattern_evidence: envelopeByAgent(evidenceRows, PATTERN_AGENT),
      cross_asset_evidence: envelopeByAgent(evidenceRows, CROSS_ASSET_AGENT),
      macro_evidence: envelopeByAgent(evidenceRows, MACRO_AGENT),
      prior_state: prior.prior_state,
      prior_direction_context: prior.prior_direction_context,
      prior_ema_relationship: prior.prior_ema_relationship,
      trace_id: traceId, run_id: opportunity_run_id,
      venue_state: venue.state,
      decision_bound: decisionId !== null,
    });

    const row = buildPersistRowV2(result, ha, decisionId);

    let persisted = false;
    let event: { emitted: boolean; reason: string | null } = { emitted: false, reason: "not_persisted" };
    if (persist) {
      const { error: insErr } = await db
        .from("ron_opportunity_context")
        .upsert(row, {
          onConflict: OPPORTUNITY_CONTEXT_RUNTIME_V2.persistence.conflict_key.join(","),
          ignoreDuplicates: true,
        });
      if (insErr) return json({ error: "persist_failed", detail: insErr.message }, 500);
      persisted = true;
      event = await emitMaterialEvent(db, {
        instrument, timeframe,
        evaluation_anchor: result.evaluation_anchor,
        analytical_bar_open: result.analytical_bar_open,
        spec_version: result.spec_version,
        runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V2.runtime_version,
        context_id: null,
        decision_id: decisionId,
        trace_id: traceId,
        material_change_type: result.material_change_type,
        lifecycle: result.lifecycle,
        direction_context: result.direction_context,
        direction_authority: result.direction_authority,
        setup_family: result.setup_family,
        data_state: result.data_state,
        data_blocked: result.data_blocked === true,
        venue_state: result.venue_state,
      });
    }

    return json({
      ok: true,
      persisted,
      instrument, timeframe,
      evaluation_anchor: result.evaluation_anchor,
      analytical_bar_open: result.analytical_bar_open,
      venue_state: result.venue_state,
      decision_id: decisionId,
      decision_bound: result.decision_bound,
      orchestration_lineage_available: result.orchestration_lineage_available,
      calibration_artifact_available: result.calibration_artifact_available,
      trace_id: traceId,
      spec_id: result.spec_id,
      spec_version: result.spec_version,
      spec_hash: result.spec_hash,
      base_spec_hash: result.base_spec_hash,
      runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V2.runtime_version,
      ha_bars_considered: ha.ha_bars_considered,
      ha_states: ha.states,
      lifecycle: result.lifecycle,
      direction_context: result.direction_context,
      direction_authority: result.direction_authority,
      setup_family: result.setup_family,
      material_change_type: result.material_change_type,
      data_state: result.data_state,
      context_admissibility: result.context_admissibility,
      reason_tokens: result.reason_tokens,
      limitations: result.limitations,
      material_event: event,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
    });
  } catch (err) {
    if (err instanceof OpportunityContextV2Error) {
      return json({ ok: false, reason: err.reason, detail: err.detail ?? null }, 422);
    }
    if (err instanceof OpportunityRuntimeError) {
      return json({ ok: false, reason: err.reason, detail: err.detail ?? null }, 422);
    }
    return json({
      ok: false, reason: "opportunity_context_v2_runtime_error",
      detail: String((err as Error)?.message ?? err),
    }, 422);
  }
}
