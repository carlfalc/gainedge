/**
 * RON Phase 2D.2j — internal endpoint for the `falconer_signal_source` specialist.
 *
 * Service-role / capability-proof only. Performs ONE bounded read-only SELECT against
 * the verified production Falconer runtime log `falconer_engine_events`, projecting ONLY
 * `id, symbol, event_type, severity, created_at`. It never selects `user_id`, `message`
 * or the `context` JSON blob, never reads `falconer_trades`, never imports or evaluates the frozen
 * strategy module, never calls a broker / MetaAPI / PineConnector, never calls the
 * orchestrator, never fetches the web or an LLM, and has NO persistence branch.
 *
 * Non-persisting in Phase 2D.2j: the response returns a sealed envelope only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence, evidenceTtlMinutes, isIsoUtc } from "../_shared/ron-agent-contracts.ts";
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import {
  buildFalconerSignalSourceEvidenceV1, falconerSignalSourceSpecHash,
  FALCONER_SIGNAL_SOURCE_SPEC_V1, FALCONER_SOURCE_LOOKBACK_MINUTES,
  FALCONER_SOURCE_MAX_ROWS, type FalconerEventRow,
} from "../_shared/ron-falconer-signal-source-spec.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const BAR_MS = 15 * 60_000;

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
  if (!token) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  let authorized = !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized) {
    const probe = createClient(supabaseUrl, token, { auth: { persistSession: false } });
    const { error: probeErr } = await probe
      .from("ron_agent_registry").select("agent_id").limit(1);
    authorized = !probeErr;
  }
  if (!authorized) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  const instrument = typeof body.instrument === "string" ? body.instrument : SYMBOL;
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : TIMEFRAME;
  if (!FALCONER_SIGNAL_SOURCE_SPEC_V1.instrument_scope.includes(instrument as "XAUUSD")
    || !FALCONER_SIGNAL_SOURCE_SPEC_V1.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_falconer_signal_source_spec_v1", instrument, timeframe }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  try {
    // ---- evaluation anchor: explicit (replay) or the newest SAFE COMPLETED XAU 15m bar
    // close. Never a wall-clock instant.
    let anchor: number;
    let anchorBarOpen: number | null = null;
    const explicit = body.evaluation_anchor ?? body.as_of;
    if (explicit != null) {
      if (!isIsoUtc(String(explicit))) return json({ error: "invalid_evaluation_anchor" }, 400);
      anchor = Date.parse(String(explicit));
    } else {
      const contract = await buildEligibilityContract(db, instrument, timeframe, RON_QUALITY_VERSION);
      const { data: bars, error: barErr } = await db
        .from("candle_history").select("timestamp")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .order("timestamp", { ascending: false }).limit(200);
      if (barErr) throw barErr;
      const times = (bars ?? []).map((r: Record<string, unknown>) => new Date(String(r.timestamp)).getTime());
      const pick = times.find((t) => !contract.isQuarantined({ time: t }, 15));
      if (pick == null) return json({ error: "no_safe_completed_anchor_bar" }, 409);
      anchorBarOpen = pick;
      anchor = pick + BAR_MS;
    }

    const fromIso = new Date(anchor - FALCONER_SOURCE_LOOKBACK_MINUTES * 60_000).toISOString();
    const toIso = new Date(anchor).toISOString();

    const { data: rows, error } = await db
      .from("falconer_engine_events")
      .select("id, symbol, event_type, severity, created_at")
      .eq("symbol", instrument)
      .gte("created_at", fromIso).lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(FALCONER_SOURCE_MAX_ROWS);
    if (error) throw error;

    const events: FalconerEventRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      symbol: String(r.symbol ?? ""),
      event_type: String(r.event_type ?? ""),
      severity: String(r.severity ?? ""),
      created_at: new Date(String(r.created_at)).getTime(),
    }));

    const traceId = typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID();
    const runId = typeof body.run_id === "string" ? body.run_id : crypto.randomUUID();

    const build = () => buildFalconerSignalSourceEvidenceV1({
      instrument, timeframe, evaluation_anchor: anchor, events,
      run_id: runId, trace_id: traceId,
    });

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    return json({
      spec_version: FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version,
      spec_hash: await falconerSignalSourceSpecHash(),
      falconer_authority: FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority,
      evaluation_anchor: new Date(anchor).toISOString(),
      anchor_bar_open: anchorBarOpen == null ? null : new Date(anchorBarOpen).toISOString(),
      source_table: FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract.table,
      source_lookback_start: fromIso,
      source_window_end: toIso,
      source_rows_loaded: events.length,
      source_role: FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract.role,
      signal_state_contract: FALCONER_SIGNAL_SOURCE_SPEC_V1.signal_state_contract.status,
      signal_state_available: false,
      registered_ttl_minutes: evidenceTtlMinutes("falconer_signal_source", timeframe),
      evidence: sealed,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
      persisted: false,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
