/**
 * RON Phase 2D.2e — internal endpoint for the `pattern_context` specialist.
 *
 * Service-role / capability-proof only. Reads genuine broker-native XAUUSD 15m closed
 * bars, applies the accepted central quality contract (qv5) plus the accepted Session V2
 * segmentation, and returns ONE sealed Evidence V1 envelope of deterministic chart
 * geometry context.
 *
 * NON-PERSISTING BY CONTRACT in this phase: there is no persist branch at all. It writes
 * no row, produces no decision, reaches no strategy engine, broker bridge, LLM, research
 * or calibration surface, and has no execution capability whatsoever.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence } from "../_shared/ron-agent-contracts.ts";
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import type { StructureBar } from "../_shared/ron-session-structure-spec.ts";
import {
  buildPatternContextEvidenceV1, patternContextSpecHash,
  PATTERN_CONTEXT_SPEC_V1, PATTERN_DETECTOR_SOURCE_SHA256,
} from "../_shared/ron-pattern-context-spec.ts";
import {
  buildPatternStructureContextEvidenceV2, patternContextSpecHashV2,
  PATTERN_CONTEXT_SPEC_V2,
} from "../_shared/ron-pattern-structure-context-v2.ts";
import {
  buildPatternStructureContextEvidenceV3, patternContextSpecHashV3,
  PATTERN_CONTEXT_SPEC_V3, PatternStructureV3AnchorError,
} from "../_shared/ron-pattern-structure-context-v3.ts";

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

  // Own fail-closed auth: exact service-role match, or a CAPABILITY PROOF against a table
  // that anon and authenticated cannot read at all.
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
  if (!PATTERN_CONTEXT_SPEC_V1.instrument_scope.includes(instrument as "XAUUSD")
    || !PATTERN_CONTEXT_SPEC_V1.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_pattern_context_spec_v1", instrument, timeframe }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  // spec_version 2 (default) attaches consumed Session V2 structure context.
  // spec_version 1 stays explicitly replayable and DEPENDENCY-ISOLATED: it never reads,
  // requires or is influenced by the V2 structure-context input.
  const specVersion = body.spec_version == null ? 2 : Number(body.spec_version);
  // Additive: the DEFAULT stays 2. `3` is the forward-only single-anchor spec.
  if (specVersion !== 1 && specVersion !== 2 && specVersion !== 3) {
    return json({ error: "unsupported_spec_version", spec_version: body.spec_version }, 400);
  }
  if (specVersion === 1 && body.session_evidence != null) {
    return json({ error: "v1_replay_is_dependency_isolated_session_evidence_not_accepted" }, 400);
  }

  try {
    const contract = await buildEligibilityContract(db, instrument, timeframe, RON_QUALITY_VERSION);

    const { data: newestRows, error: newestErr } = await db
      .from("candle_history")
      .select("timestamp")
      .eq("symbol", instrument).eq("timeframe", timeframe)
      .order("timestamp", { ascending: false }).limit(1);
    if (newestErr) throw newestErr;
    if (!newestRows?.length) return json({ error: "no_genuine_source_bars" }, 409);
    const newestSourceBar = new Date(newestRows[0].timestamp).getTime();

    // as_of: caller-provided CLOSED bar (replay), else the newest admissible completed bar.
    let asOf: number;
    if (body.as_of != null) {
      const t = new Date(String(body.as_of)).getTime();
      if (!Number.isFinite(t)) return json({ error: "invalid_as_of" }, 400);
      asOf = Math.floor(t / BAR_MS) * BAR_MS;
    } else {
      asOf = newestSourceBar;
      for (let i = 0; i < 96 && contract.isQuarantined({ time: asOf }, 15); i++) asOf -= BAR_MS;
      // V3 anchors are COMPLETED BAR CLOSES, so the default anchor is that bar's close.
      if (specVersion === 3) asOf += BAR_MS;
    }

    const fromIso = new Date(asOf - (PATTERN_CONTEXT_SPEC_V1.lookback_bars_max + 50) * BAR_MS).toISOString();
    const { data: rows, error } = await db
      .from("candle_history")
      .select("timestamp, open, high, low, close, created_at")
      .eq("symbol", instrument).eq("timeframe", timeframe)
      .gte("timestamp", fromIso)
      .lte("timestamp", new Date(asOf).toISOString())
      .order("timestamp", { ascending: true })
      .limit(1000);
    if (error) throw error;

    const bars: StructureBar[] = (rows ?? []).map((c: Record<string, unknown>) => ({
      time: new Date(String(c.timestamp)).getTime(),
      open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
      created_at: c.created_at ? new Date(String(c.created_at)).getTime() : null,
    }));

    const traceId = typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID();
    const runId = typeof body.run_id === "string" ? body.run_id : crypto.randomUUID();

    const build = () => specVersion === 3
      ? buildPatternStructureContextEvidenceV3({
        instrument, timeframe, evaluation_anchor: asOf, bars,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
        session_evidence: body.session_evidence ?? null,
      })
      : specVersion === 2
      ? buildPatternStructureContextEvidenceV2({
        instrument, timeframe, as_of: asOf, bars,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
        session_evidence: body.session_evidence ?? null,
      })
      : buildPatternContextEvidenceV1({
        instrument, timeframe, as_of: asOf, bars,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
      });

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    // Determinism proof on every call.
    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    return json({
      spec_version: specVersion,
      spec_hash: specVersion === 3
        ? await patternContextSpecHashV3()
        : specVersion === 2 ? await patternContextSpecHashV2() : await patternContextSpecHash(),
      agent_id: specVersion === 3 ? PATTERN_CONTEXT_SPEC_V3.agent_id : PATTERN_CONTEXT_SPEC_V2.agent_id,
      agent_version: specVersion === 3
        ? PATTERN_CONTEXT_SPEC_V3.agent_version
        : PATTERN_CONTEXT_SPEC_V2.agent_version,
      detector_source_sha256: PATTERN_DETECTOR_SOURCE_SHA256,
      quality_version: RON_QUALITY_VERSION,
      evidence: sealed,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
      allow_live_execution: false,
      persisted: false,
    });
  } catch (err) {
    if (err instanceof PatternStructureV3AnchorError) {
      return json({ error: err.name, reason: err.reason }, 400);
    }
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
