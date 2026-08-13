/**
 * EPHEMERAL Phase 2D.2e audit harness. Nonce-protected service-role proxy used only to
 * smoke the internal specialist endpoints and to run a NON-PERSISTING orchestrator dry
 * run. Deleted immediately after the audit; it must not survive the phase.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-audit-nonce",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TARGETS: Record<string, string> = {
  pattern: "ron-agent-pattern-context",
  session: "ron-agent-session-structure",
  calibration: "ron-agent-calibration-validation",
  orchestrate: "ron-orchestrate",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const nonce = Deno.env.get("RON_2D2E_AUDIT_NONCE") ?? "";
  if (!nonce || req.headers.get("x-audit-nonce") !== nonce) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));

  const call = async (fn: string, payload: unknown) => {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  if (body.target === "dryrun3") {
    const as_of = String(body.as_of);
    const trace_id = String(body.trace_id);
    const base = { instrument: "XAUUSD", timeframe: "15m", trace_id, persist: false };
    const s = await call(TARGETS.session, { ...base, as_of, run_id: `${trace_id}-session` });
    const c = await call(TARGETS.calibration, { ...base, as_of, run_id: `${trace_id}-calibration` });
    const p = await call(TARGETS.pattern, { ...base, as_of, run_id: `${trace_id}-pattern` });
    const evidence = [s, c, p].map((x) => x.body?.evidence).filter(Boolean);
    if (evidence.length !== 3) {
      return json({ error: "specialist_failure", statuses: [s.status, c.status, p.status], evidence_count: evidence.length }, 200);
    }
    const order = body.reversed === true ? [...evidence].reverse() : evidence;
    const o = await call(TARGETS.orchestrate, {
      context: { trace_id, instrument: "XAUUSD", timeframe: "15m", as_of },
      evidence: order,
      persist: false,
    });
    const d = o.body?.decision ?? {};
    return json({
      evidence_hashes: evidence.map((e: Record<string, unknown>) => ({
        agent_id: e.agent_id, as_of: e.as_of, status: e.status, direction: e.direction,
        health: (e.data_health as Record<string, unknown>)?.status, evidence_hash: e.evidence_hash,
      })),
      orchestrate_status: o.status,
      decision: {
        decision_id: d.decision_id, decision_hash: d.decision_hash,
        explanation_hash: o.body?.explanation?.explanation_hash,
        state: d.state, direction: d.direction, recommendation: d.recommendation,
        numeric_probability: d.numeric_probability, execution_allowed: d.execution_allowed,
        execution_path: d.execution_path, blocking_reasons: d.blocking_reasons,
        coverage: d.coverage, data_health: d.data_health, disagreements: d.disagreements,
        promoted_state_variables: d.promoted_state_variables,
      },
      persisted: o.body?.persisted,
    });
  }

  const fn = TARGETS[String(body.target ?? "")];
  if (!fn) return json({ error: "unknown_target" }, 400);

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body.payload ?? {}),
  });
  return json({ status: res.status, body: await res.json().catch(() => null) }, 200);
});
