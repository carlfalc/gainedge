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
  FALCONER_SOURCE_MAX_ROWS, readFalconerAvailabilityFacts, FalconerAvailabilityParityError,
  type FalconerEventRow, type FalconerTradeStateRow,
} from "../_shared/ron-falconer-signal-source-spec.ts";
import { resolveFalconerSpecVersion } from "../_shared/ron-falconer-endpoint-version-selector.ts";
import {
  instrumentAdmitted, multiMarketRequested,
} from "../_shared/ron-multi-market-scope-v1.ts";

/** Safe, explicit signal-state projection. Never `*`, never a private/geometry field. */
const TRADE_STATE_COLUMNS =
  "id, symbol, timeframe, mode, direction, trigger_type, status, opened_at, closed_at, updated_at";

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

  const isServiceRole = !!serviceKey && timingSafeEq(token, serviceKey);
  let authorized = isServiceRole;
  if (!authorized) {
    const probe = createClient(supabaseUrl, token, { auth: { persistSession: false } });
    const { error: probeErr } = await probe
      .from("ron_agent_registry").select("agent_id").limit(1);
    authorized = !probeErr;
  }

  // ---- SUBJECT BINDING (K1). A verified end-user JWT — never a body-supplied id, never a
  // default/global user — is the ONLY way user-scoped Falconer signal state is reachable,
  // and the read runs through that caller's JWT so Postgres RLS is the isolation boundary.
  let subjectBound = false;
  let subjectClient: ReturnType<typeof createClient> | null = null;
  if (!isServiceRole) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (anonKey) {
      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
      // AUTH HARDENING (2D.2k-a): a verified `sub` is NOT sufficient. The JWT must also
      // carry the canonical Supabase `authenticated` role. anon / no-auth tokens are
      // rejected and never reach `falconer_trades`.
      const role = (claims?.claims as Record<string, unknown> | undefined)?.role;
      if (!claimsErr && claims?.claims?.sub && role === "authenticated") {
        subjectBound = true;
        subjectClient = authClient;
        authorized = true;
      }
    }
  }
  if (!authorized) return json({ error: "unauthorized: service-role or authenticated subject required" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  // ---- EXPLICIT REQUEST SPEC-VERSION SELECTOR (V1-only).
  // Evaluated BEFORE any candle_history / falconer_engine_events / falconer_trades read.
  // Omitted => V1 (exact historical default). Explicit numeric 1 => V1.
  // Anything else (0, 2, negative, fractional, "1", null, object, array) => 400.
  const versionSelection = resolveFalconerSpecVersion(body);
  if (!versionSelection.ok) {
    return json({
      error: versionSelection.error,
      requested_spec_version: versionSelection.requested_spec_version,
      supported_spec_versions: versionSelection.supported_spec_versions,
    }, 400);
  }

  const instrument = typeof body.instrument === "string" ? body.instrument : SYMBOL;
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : TIMEFRAME;
  if (!instrumentAdmitted(FALCONER_SIGNAL_SOURCE_SPEC_V1, instrument, multiMarketRequested(body))
    || !FALCONER_SIGNAL_SOURCE_SPEC_V1.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_falconer_signal_source_spec_v1", instrument, timeframe }, 400);
  }

  // Non-subject reads use the internal client; subject callers read everything under RLS.
  const db = isServiceRole || !subjectClient
    ? createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } })
    : subjectClient;

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

    // Subject-bound signal-state read. RLS ("auth.uid() = user_id") is the boundary: this
    // query carries the caller's JWT, so it can only ever return that caller's own rows.
    let signalStateRows: FalconerTradeStateRow[] | null = null;
    if (subjectBound && subjectClient) {
      const anchorIso = new Date(anchor).toISOString();
      const { data: trades, error: tradeErr } = await subjectClient
        .from("falconer_trades")
        .select(TRADE_STATE_COLUMNS)
        .eq("symbol", instrument).eq("timeframe", timeframe).eq("mode", "live")
        .lte("opened_at", anchorIso)
        .lte("updated_at", anchorIso)
        .or(`closed_at.is.null,closed_at.lte.${anchorIso}`)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (tradeErr) throw tradeErr;
      signalStateRows = (trades ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        symbol: String(r.symbol ?? ""),
        timeframe: String(r.timeframe ?? ""),
        mode: String(r.mode ?? ""),
        direction: String(r.direction ?? ""),
        trigger_type: String(r.trigger_type ?? ""),
        status: String(r.status ?? ""),
        opened_at: new Date(String(r.opened_at)).getTime(),
        closed_at: r.closed_at == null ? null : new Date(String(r.closed_at)).getTime(),
        updated_at: new Date(String(r.updated_at)).getTime(),
      }));
    }

    const build = () => buildFalconerSignalSourceEvidenceV1({
      instrument, timeframe, evaluation_anchor: anchor, events,
      run_id: runId, trace_id: traceId, signal_state_rows: signalStateRows,
    });

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    // 2D.2k-b — availability is read BACK OUT of the sealed evidence, never recomputed
    // from the raw safe projection, so the response can never disagree with Evidence V1.
    let facts;
    try {
      facts = readFalconerAvailabilityFacts(sealed);
    } catch (e) {
      if (e instanceof FalconerAvailabilityParityError) {
        return json({ error: "availability_parity_violation", reason: e.reason }, 500);
      }
      throw e;
    }
    if (facts.subject_binding_verified !== subjectBound) {
      return json({ error: "availability_parity_violation", reason: "subject_binding_mismatch" }, 500);
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
      subject_binding_verified: facts.subject_binding_verified,
      // Availability is a DATA fact derived from ELIGIBLE evidence, not from the number of
      // rows loaded: it is read from the sealed Evidence V1 observations.
      signal_state_available: facts.signal_state_available,
      signal_state_row_exists: facts.signal_state_row_exists,
      availability_parity_source: "sealed_evidence_observations",
      signal_state_binding: subjectBound
        ? "caller_jwt_verified_rls_scoped"
        : "no_verified_subject_fail_closed",
      // Raw safe-projection count. Deliberately NOT an availability signal.
      signal_state_rows_loaded: signalStateRows?.length ?? 0,
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
