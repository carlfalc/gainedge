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

    const build = () => buildPatternContextEvidenceV1({
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
      spec_version: PATTERN_CONTEXT_SPEC_V1.spec_version,
      spec_hash: await patternContextSpecHash(),
      detector_source_sha256: PATTERN_DETECTOR_SOURCE_SHA256,
      quality_version: RON_QUALITY_VERSION,
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
