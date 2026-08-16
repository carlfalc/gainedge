/**
 * RON Phase 2D.2c — internal endpoint for the `calibration_model_validation` specialist.
 *
 * Service-role only, READ-ONLY, thin I/O shell. It fetches the persisted accepted research
 * and calibration artifacts, hands them to the pure producer, and returns ONE sealed
 * Evidence V1 envelope.
 *
 * It never reruns research or calibration, never mutates an artifact, never writes an
 * orchestrator decision, never calls Falconer / MetaApi / an LLM, and defaults to
 * persist=false. The platform `verify_jwt` flag is NOT the security boundary — the
 * fail-closed service-role/capability check below is.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence } from "../_shared/ron-agent-contracts.ts";
import { PROMOTED_STATE_VARIABLES } from "../_shared/ron-agentic-architecture.ts";
import {
  buildCalibrationValidationEvidence, calibrationValidationSpecHash,
  CALIBRATION_VALIDATION_SPEC_V1, validateAcceptedArtifacts,
  type CalibrationRunRow, type CalibrationValidationInput, type CandidateRow,
  type DirectionReportMetrics, type ResearchRunRow,
} from "../_shared/ron-calibration-validation-spec.ts";
import {
  buildCalibrationDiagnosticContextEvidenceV2, calibrationDiagnosticContextSpecHashV2,
} from "../_shared/ron-calibration-diagnostic-context-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const S = CALIBRATION_VALIDATION_SPEC_V1;

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const numOrNaN = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Extract ONLY the contracted diagnostic fields; anything else is ignored. */
function metricsOf(report: unknown): DirectionReportMetrics {
  const r = (report ?? {}) as Record<string, unknown>;
  return {
    brier: numOrNaN(r.brier),
    naive_brier: numOrNaN(r.naive_brier),
    ece: numOrNaN(r.ece),
    n_fit: numOrNaN(r.n_fit),
    n_holdout: numOrNaN(r.n_holdout),
    n_eligible: numOrNaN(r.n_eligible),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  // Either an exact match with this function's own service-role secret, or a PRIVILEGE
  // PROOF: the presented key must read an agentic table that anon/authenticated cannot
  // read at all. A rotated-but-genuine service key passes; nothing weaker does.
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

  const instrument = typeof body.instrument === "string" ? body.instrument : "XAUUSD";
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
  // DEFAULT REMAINS 1 in this slice: frozen Orchestration Run V2 deliberately leaves
  // calibration unpinned, so V2 must only ever be reached by an EXPLICIT selector.
  const specVersion = body.spec_version == null ? 1 : Number(body.spec_version);
  if (specVersion !== 1 && specVersion !== 2) {
    return json({ error: "unsupported_spec_version", spec_version: body.spec_version }, 400);
  }
  const isV2 = specVersion === 2;
  if (!S.instrument_scope.includes(instrument as "XAUUSD")
    || !S.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_calibration_validation_spec_v1", instrument, timeframe }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  try {
    /* ---- bounded read-only artifact fetch */
    const { data: rRows, error: rErr } = await db
      .from("ron_research_runs")
      .select("id, research_version, quality_version, feature_version, label_version, source_as_of, source_bar_cutoff, definition_hash, run_hash, results_digest, status")
      .eq("research_version", S.accepted_research_v4.research_version)
      .limit(10);
    if (rErr) throw rErr;

    const research_v4_runs: ResearchRunRow[] = (rRows ?? []).map((x: Record<string, unknown>) => ({
      id: String(x.id),
      research_version: Number(x.research_version),
      quality_version: Number(x.quality_version),
      feature_version: Number(x.feature_version),
      label_version: Number(x.label_version),
      source_as_of: String(x.source_as_of),
      source_bar_cutoff: String(x.source_bar_cutoff),
      definition_hash: String(x.definition_hash),
      run_hash: String(x.run_hash),
      results_digest: String(x.results_digest),
      status: String(x.status),
    }));

    let research_v4_candidates: CandidateRow[] = [];
    if (research_v4_runs.length) {
      const { data: cand, error: cErr } = await db
        .from("ron_research_candidate_results")
        .select("direction, candidate, promising_for_2d2")
        .in("run_id", research_v4_runs.map((x) => x.id))
        .limit(500);
      if (cErr) throw cErr;
      research_v4_candidates = (cand ?? []).map((x: Record<string, unknown>) => ({
        direction: String(x.direction),
        candidate: String(x.candidate),
        promising_for_2d2: x.promising_for_2d2 === true,
      }));
    }

    const { data: calRows, error: calErr } = await db
      .from("ron_calibration_runs")
      .select("id, calibration_version, feature_version, label_version, source_as_of, source_bar_cutoff, definition_hash, run_hash, status, canonical_rows, eligible_long, eligible_short, long_report, short_report")
      .eq("calibration_version", S.accepted_calibration_v8.calibration_version)
      .limit(10);
    if (calErr) throw calErr;

    const calibration_v8_runs: CalibrationRunRow[] = (calRows ?? []).map((x: Record<string, unknown>) => ({
      id: String(x.id),
      calibration_version: Number(x.calibration_version),
      feature_version: Number(x.feature_version),
      label_version: Number(x.label_version),
      source_as_of: String(x.source_as_of),
      source_bar_cutoff: String(x.source_bar_cutoff),
      definition_hash: String(x.definition_hash),
      run_hash: String(x.run_hash),
      status: String(x.status),
      canonical_rows: Number(x.canonical_rows),
      eligible_long: Number(x.eligible_long),
      eligible_short: Number(x.eligible_short),
      long: metricsOf(x.long_report),
      short: metricsOf(x.short_report),
    }));

    const { count: cellCount, error: cellErr } = await db
      .from("ron_stat_cells")
      .select("id", { count: "exact", head: true })
      .eq("calibration_version", S.accepted_calibration_v8.calibration_version);
    if (cellErr) throw cellErr;

    const input: CalibrationValidationInput = {
      instrument, timeframe,
      run_id: typeof body.run_id === "string" ? body.run_id : crypto.randomUUID(),
      trace_id: typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID(),
      research_v4_runs,
      research_v4_candidates,
      calibration_v8_runs,
      calibration_v8_stat_cells: cellCount ?? -1,
      promoted_state_variables: PROMOTED_STATE_VARIABLES,
    };

    const build = isV2
      ? buildCalibrationDiagnosticContextEvidenceV2
      : buildCalibrationValidationEvidence;

    const envelope = await build(input);
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    // Determinism proof on every call.
    const replay = await sealEvidence(await build(input));
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    const result = validateAcceptedArtifacts(input);

    // persist is audit-scoped and OFF by default; it writes only run + evidence rows and
    // never an orchestrator decision.
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
      spec_version: specVersion,
      spec_hash: isV2
        ? await calibrationDiagnosticContextSpecHashV2()
        : await calibrationValidationSpecHash(),
      // V2-ONLY fields. Explicit spec_version 1 keeps the exact pre-V2 response shape.
      ...(isV2
        ? {
          base_spec_version: S.spec_version,
          base_spec_hash: await calibrationValidationSpecHash(),
          allow_live_execution: false,
        }
        : {}),
      validation_state: result.state,
      checks_total: result.checks.length,
      checks_failed: result.failed.map((f) => f.id),
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
