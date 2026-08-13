/**
 * RON Phase 2D.2a — internal orchestration endpoint (service-role only).
 *
 * Validates an Evidence V1 batch, computes the deterministic decision + Ask RON
 * explanation payload, and OPTIONALLY persists registry/run/evidence/decision/link rows
 * idempotently. It never calls a trading or order API, never schedules itself and never
 * changes any dashboard reader.
 *
 * Specialist producers do not exist yet, so this endpoint accepts already-formed internal
 * envelopes for contract testing only. It does not invent live evidence.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  EvidenceContractError, registryHash, sealEvidence, validateEvidence,
  type EvidenceEnvelopeV1,
} from "../_shared/ron-agent-contracts.ts";
import {
  reconstructDecision, registryRows, synthesizeDecision, type OrchestrationContext,
} from "../_shared/ron-orchestrator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!serviceKey || token !== serviceKey) {
    return json({ error: "unauthorized: internal service-role endpoint" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ctx = body.context as OrchestrationContext | undefined;
  const evidence = body.evidence as EvidenceEnvelopeV1[] | undefined;
  const persist = body.persist === true;

  if (!ctx || !Array.isArray(evidence)) {
    return json({ error: "missing context or evidence" }, 400);
  }
  for (const [i, e] of evidence.entries()) {
    const errs = validateEvidence(e);
    if (errs.length) return json({ error: "evidence_contract_violation", index: i, reasons: errs }, 400);
  }

  try {
    const sealed = await Promise.all(evidence.map(sealEvidence));
    const { decision, explanation } = await synthesizeDecision(sealed, ctx);

    // Pure replay proof on every call: same evidence in, same hashes out.
    const replay = await reconstructDecision(sealed, ctx);
    if (replay.decision.decision_hash !== decision.decision_hash
      || replay.explanation.explanation_hash !== explanation.explanation_hash) {
      return json({ error: "nondeterministic_synthesis" }, 500);
    }

    if (!persist) return json({ decision, explanation, persisted: false });

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } },
    );
    const rhash = await registryHash();

    await db.from("ron_agent_registry")
      .upsert(registryRows().map((r) => ({ ...r, registry_hash: rhash })),
        { onConflict: "agent_id,agent_version,registry_version", ignoreDuplicates: true });

    await db.from("ron_agent_runs").upsert(sealed.map((e) => ({
      run_id: e.run_id, trace_id: e.trace_id, agent_id: e.agent_id,
      agent_version: e.agent_version, schema_version: e.schema_version,
      instrument: e.instrument, timeframe: e.timeframe, as_of: e.as_of,
    })), { onConflict: "run_id", ignoreDuplicates: true });

    await db.from("ron_agent_evidence").upsert(sealed.map((e) => ({
      evidence_hash: e.evidence_hash, schema_version: e.schema_version, run_id: e.run_id,
      trace_id: e.trace_id, agent_id: e.agent_id, agent_version: e.agent_version,
      instrument: e.instrument, timeframe: e.timeframe, as_of: e.as_of,
      source_timestamps: e.source_timestamps, observations: e.observations,
      provenance_refs: e.provenance_refs, data_health: e.data_health,
      uncertainty: e.uncertainty, conflicts: e.conflicts, dependencies: e.dependencies,
      status: e.status, direction: e.direction ?? null, recommendation: e.recommendation,
      envelope: e,
    })), { onConflict: "evidence_hash", ignoreDuplicates: true });

    await db.from("ron_orchestrator_decisions").upsert({
      decision_id: decision.decision_id, decision_hash: decision.decision_hash,
      explanation_hash: explanation.explanation_hash, trace_id: decision.trace_id,
      orchestrator_version: decision.orchestrator_version,
      decision_schema_version: decision.decision_schema_version,
      evidence_schema_version: decision.evidence_schema_version,
      registry_hash: decision.registry_hash, ttl_policy_version: decision.ttl_policy_version,
      instrument: decision.instrument, timeframe: decision.timeframe, as_of: decision.as_of,
      state: decision.state, recommendation: decision.recommendation,
      direction: decision.direction, numeric_probability: null,
      execution_allowed: false, execution_path: "signal_only",
      decision, explanation,
    }, { onConflict: "decision_id", ignoreDuplicates: true });

    await db.from("ron_decision_evidence").upsert(
      decision.evidence_refs.map((r, i) => ({
        decision_id: decision.decision_id, evidence_hash: r.evidence_hash, ordinal: i,
        authority_rank: r.authority_rank, agent_id: r.agent_id,
      })), { onConflict: "decision_id,evidence_hash", ignoreDuplicates: true },
    );

    return json({ decision, explanation, persisted: true });
  } catch (err) {
    if (err instanceof EvidenceContractError) {
      return json({ error: err.name, reasons: err.reasons }, 400);
    }
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});