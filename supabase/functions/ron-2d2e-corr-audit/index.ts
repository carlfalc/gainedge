/**
 * EPHEMERAL Phase 2D.2e-CORR audit harness. Nonce-protected service-role proxy that
 * re-runs the NON-PERSISTING three-agent dry run with the orchestration context.as_of
 * DERIVED from the Session V2 envelope's as_of_bar_completed_close. Deleted after audit.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-audit-nonce",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const nonce = Deno.env.get("RON_2D2E_CORR_NONCE") ?? "";
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

  // Fixed SOURCE anchor (bar open) for the already-smoked bar.
  const SOURCE_ANCHOR = "2026-08-13T10:00:00.000Z";
  const trace_id = String(body.trace_id);
  const base = { instrument: "XAUUSD", timeframe: "15m", trace_id, as_of: SOURCE_ANCHOR, persist: false };

  const s = await call("ron-agent-session-structure", { ...base, run_id: `${trace_id}-session-v2` });
  const c = await call("ron-agent-calibration-validation", { ...base, run_id: `${trace_id}-calibration-v1` });
  const p = await call("ron-agent-pattern-context", { ...base, run_id: `${trace_id}-pattern-v1` });
  const evidence = [s.body?.evidence, c.body?.evidence, p.body?.evidence];
  if (evidence.some((e) => !e)) {
    return json({ error: "specialist_failure", statuses: [s.status, c.status, p.status] });
  }

  // DERIVED knowledge instant: the genuine Session V2 completed bar close.
  const derived_as_of = evidence[0].source_timestamps?.as_of_bar_completed_close;
  if (typeof derived_as_of !== "string") return json({ error: "missing_as_of_bar_completed_close" });

  const ctx = { trace_id, instrument: "XAUUSD", timeframe: "15m", as_of: derived_as_of };
  const runs: Record<string, unknown>[] = [];
  for (const order of [evidence, evidence, [...evidence].reverse()]) {
    const o = await call("ron-orchestrate", { context: ctx, evidence: order, persist: false });
    const d = o.body?.decision ?? {};
    runs.push({
      status: o.status, persisted: o.body?.persisted,
      decision_id: d.decision_id, decision_hash: d.decision_hash,
      explanation_hash: o.body?.explanation?.explanation_hash,
      state: d.state, direction: d.direction, recommendation: d.recommendation,
      numeric_probability: d.numeric_probability, execution_allowed: d.execution_allowed,
      execution_path: d.execution_path, promoted_state_variables: d.promoted_state_variables,
      blocking_reasons: d.blocking_reasons, coverage: d.coverage, data_health: d.data_health,
      disagreements: d.disagreements, evidence_refs: d.evidence_refs,
      explanation_grounding: o.body?.explanation?.grounding ?? o.body?.explanation?.grounding_notes ?? null,
      explanation_keys: o.body?.explanation ? Object.keys(o.body.explanation) : null,
    });
  }

  return json({
    source_anchor: SOURCE_ANCHOR,
    derived_context_as_of: derived_as_of,
    evidence: evidence.map((e: Record<string, any>) => ({
      agent_id: e.agent_id, run_id: e.run_id, as_of: e.as_of, status: e.status,
      direction: e.direction, recommendation: e.recommendation,
      health: e.data_health?.status, evidence_hash: e.evidence_hash,
      as_of_bar_completed_close: e.source_timestamps?.as_of_bar_completed_close ?? null,
    })),
    runs,
  });
});
