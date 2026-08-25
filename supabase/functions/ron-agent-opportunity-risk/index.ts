/**
 * RON Phase 2D.2i — internal endpoint for the `opportunity_risk` FOUNDATION specialist.
 *
 * Service-role / capability-proof only. It consumes EXPLICIT sealed Evidence V1 envelopes
 * supplied in the request body plus an explicit source-grounded evaluation anchor. It
 * performs NO market/artifact DB read (the only query is the auth capability probe), has
 * NO write or persistence branch, never calls the orchestrator, Falconer, MetaApi, an LLM
 * or any external service, and adds no migration or cron.
 *
 * It cannot construct a trade opportunity: it reports readiness only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  isIsoUtc, sealEvidence, validateEvidence, type EvidenceEnvelopeV1,
} from "../_shared/ron-agent-contracts.ts";
import { PROMOTED_STATE_VARIABLES } from "../_shared/ron-agentic-architecture.ts";
import {
  buildOpportunityRiskEvidenceV1, opportunityRiskSpecHash, OPPORTUNITY_RISK_SPEC_V1,
  OpportunityRiskContractError,
} from "../_shared/ron-opportunity-risk-spec.ts";
import {
  buildOpportunityRiskEvidenceV2, opportunityRiskSpecHashV2, OPPORTUNITY_RISK_SPEC_V2,
} from "../_shared/ron-opportunity-risk-spec-v2.ts";
import {
  buildOpportunityRiskEvidenceV3, opportunityRiskSpecHashV3, OPPORTUNITY_RISK_SPEC_V3,
} from "../_shared/ron-opportunity-risk-spec-v3.ts";
import {
  buildOpportunityRiskEvidenceV4, opportunityRiskSpecHashV4, OPPORTUNITY_RISK_SPEC_V4,
} from "../_shared/ron-opportunity-risk-spec-v4.ts";

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

  // Explicit selector only. The DEFAULT REMAINS 1 so frozen Orchestration V1-V5
  // behaviour cannot silently change in this slice.
  const requested = body.spec_version === undefined ? 1 : body.spec_version;
  if (requested !== 1 && requested !== 2 && requested !== 3 && requested !== 4) {
    return json({ error: "unsupported_spec_version", supported: [1, 2, 3, 4] }, 400);
  }
  const useV2 = requested === 2;
  const useV3 = requested === 3;
  const useV4 = requested === 4;

  const S = OPPORTUNITY_RISK_SPEC_V1;
  const instrument = typeof body.instrument === "string" ? body.instrument : "XAUUSD";
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : "15m";
  if (!S.instrument_scope.includes(instrument as "XAUUSD")
    || !S.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_opportunity_risk_spec_v1", instrument, timeframe }, 400);
  }

  // Fail closed on the canonical UTC-ISO validator (same rule the pure producer applies);
  // local/non-Z, impossible, empty and non-string anchors are all rejected here.
  const anchor = body.evaluation_anchor;
  if (!isIsoUtc(anchor)) {
    return json({ error: "missing_or_invalid_evaluation_anchor" }, 400);
  }
  const evidence = body.evidence;
  if (!Array.isArray(evidence)) return json({ error: "missing_evidence_array" }, 400);

  try {
    const trace_id = typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID();
    const run_id = typeof body.run_id === "string" ? body.run_id : crypto.randomUUID();

    const producer = useV4
      ? buildOpportunityRiskEvidenceV4
      : useV3
      ? buildOpportunityRiskEvidenceV3
      : useV2
      ? buildOpportunityRiskEvidenceV2
      : buildOpportunityRiskEvidenceV1;
    const build = () => producer({
      instrument, timeframe,
      evaluation_anchor: anchor as string,
      evidence: evidence as EvidenceEnvelopeV1[],
      promoted_state_variables: PROMOTED_STATE_VARIABLES,
      run_id, trace_id,
    });

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    const readiness = sealed.observations.find((o) => o.key === "readiness_state")?.value_text ?? null;
    const construction = sealed.observations.find((o) => o.key === "construction_allowed")?.value_text ?? null;

    return json({
      spec_version: useV4
        ? OPPORTUNITY_RISK_SPEC_V4.spec_version
        : useV3
        ? OPPORTUNITY_RISK_SPEC_V3.spec_version
        : useV2 ? OPPORTUNITY_RISK_SPEC_V2.spec_version : S.spec_version,
      spec_hash: useV4
        ? await opportunityRiskSpecHashV4()
        : useV3
        ? await opportunityRiskSpecHashV3()
        : useV2 ? await opportunityRiskSpecHashV2() : await opportunityRiskSpecHash(),
      evaluation_anchor: sealed.as_of,
      readiness_state: readiness,
      construction_allowed: construction,
      blocking_reasons: sealed.observations.filter((o) => o.key === "blocking_reason").map((o) => o.value_text),
      consumed_evidence_hashes: (evidence as EvidenceEnvelopeV1[])
        .map((e) => e?.evidence_hash ?? null),
      promoted_state_variables: [...PROMOTED_STATE_VARIABLES],
      evidence: sealed,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
      persisted: false,
    });
  } catch (err) {
    if (err instanceof OpportunityRiskContractError) {
      return json({ error: err.name, reason: err.reason }, 400);
    }
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
