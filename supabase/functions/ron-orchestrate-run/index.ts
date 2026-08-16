/**
 * RON post-K1 orchestration run endpoint (implementation marker 2D.2l).
 *
 * EXPLICITLY INVOKED ONLY. No cron, no auto-run, no scheduler, no dashboard wiring.
 * It collects the seven EXISTING specialist Evidence V1 envelopes at ONE explicit
 * evaluation anchor under ONE trace identity with deterministic per-agent run identities,
 * runs the EXISTING deterministic orchestrator, proves replay determinism, and only then
 * — if and only if `persist: true` was explicitly requested — writes the existing
 * registry/run/evidence/decision/link audit rows idempotently.
 *
 * Safety: never executes a trade, never returns a numeric probability, never sets
 * execution_allowed, never service-role scans another user's `falconer_trades` (the
 * caller's own JWT is forwarded to the Falconer specialist ONLY and is never stored), and
 * never promotes a state variable. `persist:false` performs ZERO database mutations.
 *
 * Persistence is ordered + idempotent, NOT transactional: the audit schema exposes no
 * multi-table transaction boundary here. That limitation is declared, not hidden.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  EvidenceContractError, registryHash, sealEvidence, validateEvidence,
  type EvidenceEnvelopeV1,
} from "../_shared/ron-agent-contracts.ts";
import {
  canonicalOrder, reconstructDecision, registryRows, synthesizeDecision,
  type OrchestrationContext,
} from "../_shared/ron-orchestrator.ts";
import {
  assertCollectionComplete, assertPersistSafe, buildPersistencePlan, deriveRunIds,
  ORCHESTRATION_RUN_PLAN_V1, ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError,
  orchestrationRunPlanHash, RON_ORCHESTRATION_RUN_VERSION,
} from "../_shared/ron-orchestration-run.ts";
import {
  assertPatternDependencyBinding, assertSessionDependencyBinding,
  assertSessionDependencySealed, deriveRunIdsV2,
  ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_SPEC_V2,
  orchestrationRunPlanHashV2, RON_ORCHESTRATION_RUN_VERSION_V2,
  type AgentCallPlanEntryV2,
} from "../_shared/ron-orchestration-run-v2.ts";
import {
  assertCalibrationContextBinding, assertCalibrationContextV2Sealed,
  CALIBRATION_CONTEXT_AGENT, deriveRunIdsV3, ORCHESTRATION_RUN_PLAN_V3,
  orchestrationRunPlanHashV3, RON_ORCHESTRATION_RUN_VERSION_V3,
} from "../_shared/ron-orchestration-run-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized: service-role or authenticated subject required" }, 401);

  const isServiceRole = !!serviceKey && timingSafeEq(token, serviceKey);

  // A verified end-user JWT (role=authenticated + sub) is the ONLY subject binding. It is
  // forwarded to the Falconer specialist alone and is never logged or persisted.
  let subjectBound = false;
  if (!isServiceRole && anonKey) {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    const role = (claims?.claims as Record<string, unknown> | undefined)?.role;
    if (!claimsErr && claims?.claims?.sub && role === "authenticated") subjectBound = true;
  }
  if (!isServiceRole && !subjectBound) {
    return json({ error: "unauthorized: service-role or authenticated subject required" }, 401);
  }
  if (!serviceKey) return json({ error: "internal_key_unavailable" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  const instrument = typeof body.instrument === "string" ? body.instrument : "XAUUSD";
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
  const anchor = body.evaluation_anchor ?? body.as_of;
  if (typeof anchor !== "string" || !ISO_UTC.test(anchor) || !Number.isFinite(Date.parse(anchor))) {
    return json({ error: "missing_or_invalid_evaluation_anchor" }, 400);
  }
  const traceId = typeof body.trace_id === "string" && body.trace_id.length >= 8
    ? body.trace_id
    : `ron_run_v1_${anchor}_${instrument}_${timeframe}`;
  const persist = body.persist === true;

  // SAFEST DEFAULT: newly invoked runs still default to orchestration run version 2 — the
  // frozen, audited default. Following the same precedent as the calibration endpoint's
  // `spec_version` selector, the newer V3 semantics are reachable ONLY by an explicit
  // selector, so no existing caller is silently moved onto new calibration context.
  // Versions 1 and 2 stay explicitly reachable for byte-identical replay.
  const requestedRunVersion = body.orchestration_run_version == null
    ? RON_ORCHESTRATION_RUN_VERSION_V2
    : Number(body.orchestration_run_version);
  if (![1, 2, 3].includes(requestedRunVersion)) {
    return json({ error: "unsupported_orchestration_run_version", orchestration_run_version: body.orchestration_run_version }, 400);
  }
  const isV3 = requestedRunVersion === 3;
  // V3 inherits every V2 semantic (Session -> sealed evidence -> Pattern, version pins).
  const isV2 = requestedRunVersion === 2 || isV3;

  const ctx: OrchestrationContext = {
    trace_id: traceId, instrument, timeframe, as_of: anchor,
  };

  try {
    const runIds = isV3
      ? await deriveRunIdsV3(traceId, anchor)
      : isV2
        ? await deriveRunIdsV2(traceId, anchor)
        : await deriveRunIds(traceId, anchor);
    const collected: EvidenceEnvelopeV1[] = [];
    const calls: Record<string, unknown>[] = [];
    let sessionDependencyHash: string | null = null;
    let calibrationContextHash: string | null = null;

    const plan: readonly (AgentCallPlanEntryV2 | typeof ORCHESTRATION_RUN_PLAN_V1[number])[] =
      isV3 ? ORCHESTRATION_RUN_PLAN_V3 : isV2 ? ORCHESTRATION_RUN_PLAN_V2 : ORCHESTRATION_RUN_PLAN_V1;

    for (const entry of plan) {
      const v2entry = isV2 ? entry as AgentCallPlanEntryV2 : null;
      const forwardSubject = entry.subject_scope === "caller_subject_bound" && subjectBound;
      const payload: Record<string, unknown> = {
        instrument, timeframe, trace_id: traceId, run_id: runIds[entry.agent_id],
        persist: false,
      };
      payload[entry.anchor_param] = anchor;
      if (entry.requires_evidence_batch) payload.evidence = canonicalOrder(collected);

      // V2 ONLY: explicit specialist version pin + the ONE declared sealed dependency.
      if (v2entry) {
        if (v2entry.spec_version_pin != null) payload.spec_version = v2entry.spec_version_pin;
        if (v2entry.dependency_param === "session_evidence") {
          // Fail closed BEFORE Pattern is called if the sealed Session envelope is
          // missing, invalid, unsealed, hash-mismatched or out of scope/anchor.
          const dep = collected.find((e) => e.agent_id === "session_market_structure");
          sessionDependencyHash = await assertSessionDependencySealed(dep, ctx);
          // Pattern receives ONLY that single sealed envelope — never the batch.
          payload.session_evidence = dep;
        }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/${entry.function_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Subject-bound reads use the CALLER's token so Postgres RLS is the boundary.
          Authorization: `Bearer ${forwardSubject ? token : serviceKey}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      calls.push({
        agent_id: entry.agent_id, function_name: entry.function_name, phase: entry.phase,
        http_status: res.status, subject_scope: entry.subject_scope,
        subject_forwarded: forwardSubject,
      });
      if (!res.ok || !out?.evidence) {
        return json({
          error: "specialist_call_failed", agent_id: entry.agent_id,
          http_status: res.status, detail: out?.error ?? null, calls, persisted: false,
        }, 502);
      }
      const envelope = out.evidence as EvidenceEnvelopeV1;
      if (v2entry && entry.agent_id === "session_market_structure") {
        // Validate + seal immediately, and retain THAT immutable envelope as the single
        // dependency source. Session is called exactly once per run.
        const errs = validateEvidence(envelope);
        if (errs.length) {
          return json({ error: "session_dependency_invalid_envelope", reasons: errs }, 400);
        }
        collected.push(await sealEvidence(envelope));
      } else if (isV3 && entry.agent_id === CALIBRATION_CONTEXT_AGENT) {
        // V3 ONLY: the returned calibration evidence must PROVE it is the accepted
        // Calibration Diagnostic Context V2 artifact — sealed, in scope, correctly
        // anchored and carrying exactly one accepted V2 spec provenance ref. Anything
        // missing, V1, wrong-hash, duplicated or ambiguous fails closed here.
        const sealedCal = await sealEvidence(envelope);
        calibrationContextHash = await assertCalibrationContextV2Sealed(sealedCal, ctx);
        collected.push(sealedCal);
      } else {
        collected.push(envelope);
      }
    }

    for (const [i, e] of collected.entries()) {
      const errs = validateEvidence(e);
      if (errs.length) {
        return json({ error: "evidence_contract_violation", index: i, reasons: errs }, 400);
      }
    }

    const sealed = canonicalOrder(await Promise.all(collected.map(sealEvidence)));
    assertCollectionComplete(sealed, ctx);
    // The exact envelope handed to Pattern must be the one in the final collected batch.
    if (isV2 && sessionDependencyHash) {
      assertSessionDependencyBinding(sealed, sessionDependencyHash);
      // ...and Pattern's OWN sealed evidence must cite exactly that Session hash.
      assertPatternDependencyBinding(sealed, sessionDependencyHash);
    }
    // V3 ONLY: the accepted calibration context envelope must be the single calibration
    // envelope in the final batch. It adds NO authority — it stays neutral/research_only.
    if (isV3 && calibrationContextHash) {
      assertCalibrationContextBinding(sealed, calibrationContextHash);
    }

    const { decision, explanation } = await synthesizeDecision(sealed, ctx);
    const replay = await reconstructDecision(sealed, ctx);
    if (replay.decision.decision_hash !== decision.decision_hash
      || replay.explanation.explanation_hash !== explanation.explanation_hash) {
      return json({ error: "nondeterministic_synthesis" }, 500);
    }

    const summary = {
      orchestration_run_version: isV3
        ? RON_ORCHESTRATION_RUN_VERSION_V3
        : isV2 ? RON_ORCHESTRATION_RUN_VERSION_V2 : RON_ORCHESTRATION_RUN_VERSION,
      orchestration_run_plan_hash: isV3
        ? await orchestrationRunPlanHashV3()
        : isV2 ? await orchestrationRunPlanHashV2() : await orchestrationRunPlanHash(),
      persistence_atomicity: isV2
        ? ORCHESTRATION_RUN_SPEC_V2.persistence_atomicity
        : ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
      // V2-ONLY field: explicit V1 replay keeps the exact pre-V2 summary shape.
      ...(isV2 ? { session_to_pattern_dependency_hash: sessionDependencyHash } : {}),
      // V3-ONLY fields: explicit V1/V2 replay keeps the exact pre-V3 summary shape.
      ...(isV3
        ? {
          calibration_context_spec_version: 2,
          calibration_context_evidence_hash: calibrationContextHash,
          default_orchestration_run_version: RON_ORCHESTRATION_RUN_VERSION_V2,
        }
        : {}),
      evaluation_anchor: anchor,
      trace_id: traceId,
      subject_binding: subjectBound ? "caller_jwt_verified_rls_scoped" : "no_verified_subject_fail_closed",
      agents_collected: sealed.length,
      calls,
      evidence: sealed,
      decision,
      explanation,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
    };

    if (!persist) return json({ ...summary, persisted: false, persistence_writes: 0 });

    const plan = buildPersistencePlan(sealed, decision, explanation);
    assertPersistSafe(plan, "pre_write");

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const rhash = await registryHash();
    const writes: string[] = [];
    const step = async (table: string, fn: () => Promise<{ error: unknown }>) => {
      const { error } = await fn();
      if (error) throw new OrchestrationRunError([`persist_failed:${table}:${String((error as { message?: string })?.message ?? error)}`]);
      writes.push(table);
    };

    await step("ron_agent_registry", () => db.from("ron_agent_registry").upsert(
      registryRows().map((r) => ({ ...r, registry_hash: rhash })),
      { onConflict: "agent_id,agent_version,registry_version", ignoreDuplicates: true }));
    await step("ron_agent_runs", () => db.from("ron_agent_runs")
      .upsert(plan.runs, { onConflict: "run_id", ignoreDuplicates: true }));
    await step("ron_agent_evidence", () => db.from("ron_agent_evidence")
      .upsert(plan.evidence, { onConflict: "evidence_hash", ignoreDuplicates: true }));
    await step("ron_orchestrator_decisions", () => db.from("ron_orchestrator_decisions")
      .upsert(plan.decision, { onConflict: "decision_id", ignoreDuplicates: true }));
    await step("ron_decision_evidence", () => db.from("ron_decision_evidence")
      .upsert(plan.links, { onConflict: "decision_id,evidence_hash", ignoreDuplicates: true }));

    return json({ ...summary, persisted: true, persistence_writes: writes.length, writes });
  } catch (err) {
    if (err instanceof OrchestrationRunError) {
      return json({ error: err.name, reasons: err.reasons }, 400);
    }
    if (err instanceof EvidenceContractError) {
      return json({ error: err.name, reasons: err.reasons }, 400);
    }
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
