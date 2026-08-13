/**
 * RON Phase 2D.2b / 2D.2b-CORR — internal endpoint for the session_market_structure
 * specialist.
 *
 * Service-role only. Reads genuine broker-native XAUUSD 15m closed bars, applies the
 * accepted central quality contract, and returns ONE sealed Evidence V1 envelope.
 *
 * Spec V2 is the DEFAULT. Spec V1 remains reachable with `spec_version: 1` purely so the
 * already-persisted V1 audit artifact stays replayable; it is never written to again.
 *
 * It never places a trade, never calls Falconer, never calls an LLM, never invents a bar,
 * and (by default) never persists — no orchestrator decision is produced from a single
 * specialist. `persist: true` is audit-scoped and writes only the run + evidence rows.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence } from "../_shared/ron-agent-contracts.ts";
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import {
  buildSessionStructureEvidence, sessionStructureSpecHash,
  SESSION_STRUCTURE_SPEC_V1, type StructureBar,
} from "../_shared/ron-session-structure-spec.ts";
import {
  buildSessionStructureEvidenceV2, sessionStructureSpecHashV2,
  SESSION_STRUCTURE_SPEC_V2,
} from "../_shared/ron-session-structure-spec-v2.ts";

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

  // 1) exact match against this function's own service-role secret, or
  // 2) a PRIVILEGE PROOF: the presented key must be able to read an agentic table that
  //    anon and authenticated cannot read at all. A rotated-but-genuine service key
  //    passes; anon/authenticated/garbage tokens cannot. No claim is trusted unverified.
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
  const specVersion = body.spec_version === 1 ? 1 : 2;
  const spec = specVersion === 1 ? SESSION_STRUCTURE_SPEC_V1 : SESSION_STRUCTURE_SPEC_V2;
  if (!spec.instrument_scope.includes(instrument as "XAUUSD")
    || !spec.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_spec_v1", instrument, timeframe }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  try {
    const contract = await buildEligibilityContract(db, instrument, timeframe, RON_QUALITY_VERSION);

    // Newest genuine native bar present in the source.
    const { data: newestRows, error: newestErr } = await db
      .from("candle_history")
      .select("timestamp")
      .eq("symbol", instrument).eq("timeframe", timeframe)
      .order("timestamp", { ascending: false }).limit(1);
    if (newestErr) throw newestErr;
    if (!newestRows?.length) return json({ error: "no_genuine_source_bars" }, 409);
    const newestSourceBar = new Date(newestRows[0].timestamp).getTime();

    // as_of: caller-provided CLOSED bar, else the newest admissible completed bar.
    let asOf: number;
    if (body.as_of != null) {
      const t = new Date(String(body.as_of)).getTime();
      if (!Number.isFinite(t)) return json({ error: "invalid_as_of" }, 400);
      asOf = Math.floor(t / BAR_MS) * BAR_MS;
    } else {
      asOf = newestSourceBar;
      // walk back over quarantined anchors so the anchor is admissible
      for (let i = 0; i < 96 && contract.isQuarantined({ time: asOf }, 15); i++) asOf -= BAR_MS;
    }

    // Bounded lookback only — never an unbounded history scan.
    const fromIso = new Date(asOf - (spec.lookback_bars_max + 200) * BAR_MS).toISOString();
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

    // Lineage refs cite ONLY what this specialist actually reads. It queries genuine
    // candle rows and the central quality contract; it never reads features, labels or
    // calibration, so those must not be advertised as provenance.
    const build = () => (specVersion === 1
      ? buildSessionStructureEvidence({
        instrument, timeframe, as_of: asOf, bars,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
      })
      : buildSessionStructureEvidenceV2({
        instrument, timeframe, as_of: asOf, bars,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
      }));

    const envelope = await build();

    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    // Determinism proof on every call: rebuild and compare the content hash.
    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    let persisted = false;
    if (body.persist === true) {
      await db.from("ron_agent_runs").upsert({
        run_id: sealed.run_id, trace_id: sealed.trace_id, agent_id: sealed.agent_id,
        agent_version: sealed.agent_version, schema_version: sealed.schema_version,
        instrument: sealed.instrument, timeframe: sealed.timeframe, as_of: sealed.as_of,
      }, { onConflict: "run_id", ignoreDuplicates: true });
      await db.from("ron_agent_evidence").upsert({
        evidence_hash: sealed.evidence_hash, schema_version: sealed.schema_version,
        run_id: sealed.run_id, trace_id: sealed.trace_id, agent_id: sealed.agent_id,
        agent_version: sealed.agent_version, instrument: sealed.instrument,
        timeframe: sealed.timeframe, as_of: sealed.as_of,
        source_timestamps: sealed.source_timestamps, observations: sealed.observations,
        provenance_refs: sealed.provenance_refs, data_health: sealed.data_health,
        uncertainty: sealed.uncertainty, conflicts: sealed.conflicts,
        dependencies: sealed.dependencies, status: sealed.status,
        direction: sealed.direction ?? null, recommendation: sealed.recommendation,
        envelope: sealed,
      }, { onConflict: "evidence_hash", ignoreDuplicates: true });
      persisted = true;
    }

    return json({
      spec_version: spec.spec_version,
      spec_hash: specVersion === 1 ? await sessionStructureSpecHash() : await sessionStructureSpecHashV2(),
      quality_version: RON_QUALITY_VERSION,
      evidence: sealed,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
      persisted,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
