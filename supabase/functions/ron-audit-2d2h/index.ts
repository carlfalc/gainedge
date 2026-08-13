/**
 * TEMPORARY Phase 2D.2h audit harness. Service-role proxy used ONLY to drive the
 * non-persisting smoke and dry-run. Deleted at the end of the phase. It performs no
 * writes of its own.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const body = await req.json();
  const calls: { fn: string; payload: unknown }[] = body.calls ?? [];
  const out: unknown[] = [];
  const invoke = async (fn: string, payload: unknown) => {
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", apikey: key },
      body: JSON.stringify(payload ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) as Record<string, unknown> | null };
  };

  if (body.action === "dryrun") {
    const barOpen = String(body.bar_open);
    const trace = String(body.trace_id);
    const spec = async (fn: string, payload: Record<string, unknown>) =>
      (await invoke(fn, { trace_id: trace, ...payload })).body;

    const session = await spec("ron-agent-session-structure", { run_id: `${trace}_session`, as_of: barOpen });
    const close = String(
      (session?.evidence as Record<string, Record<string, string>>)?.source_timestamps?.as_of_bar_completed_close,
    );
    const pattern = await spec("ron-agent-pattern-context", { run_id: `${trace}_pattern`, as_of: barOpen });
    const cross = await spec("ron-agent-cross-asset-correlation", { run_id: `${trace}_cross`, as_of: barOpen });
    const cal = await spec("ron-agent-calibration-validation", { run_id: `${trace}_cal` });
    const macro = await spec("ron-agent-macro-news-geopolitics", {
      run_id: `${trace}_macro`, evaluation_anchor: close,
    });

    const envelopes = [session, cal, pattern, cross, macro]
      .map((r) => (r?.evidence ?? null) as Record<string, unknown> | null);
    if (envelopes.some((e) => !e)) {
      return new Response(JSON.stringify({ error: "specialist_failed", session, cal, pattern, cross, macro }), {
        headers: { "Content-Type": "application/json" }, status: 500,
      });
    }
    const ctx = { trace_id: trace, instrument: "XAUUSD", timeframe: "15m", as_of: close };
    const fwd1 = await invoke("ron-orchestrate", { context: ctx, evidence: envelopes, persist: false });
    const fwd2 = await invoke("ron-orchestrate", { context: ctx, evidence: envelopes, persist: false });
    const rev = await invoke("ron-orchestrate", {
      context: ctx, evidence: [...envelopes].reverse(), persist: false,
    });

    return new Response(JSON.stringify({
      orchestrator_as_of: close,
      specialists: envelopes.map((e) => ({
        agent_id: e!.agent_id, as_of: e!.as_of, status: e!.status,
        direction: e!.direction, recommendation: e!.recommendation,
        data_health: e!.data_health, evidence_hash: e!.evidence_hash,
      })),
      forward_1: fwd1.body, forward_2_hash: (fwd2.body?.decision as Record<string, unknown>)?.decision_hash,
      reversed_hash: (rev.body?.decision as Record<string, unknown>)?.decision_hash,
      reversed_explanation_hash: (rev.body?.explanation as Record<string, unknown>)?.explanation_hash,
      forward_2_explanation_hash: (fwd2.body?.explanation as Record<string, unknown>)?.explanation_hash,
    }), { headers: { "Content-Type": "application/json" } });
  }

  for (const c of calls) {
    const res = await fetch(`${url}/functions/v1/${c.fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", apikey: key },
      body: JSON.stringify(c.payload ?? {}),
    });
    let parsed: unknown;
    const text = await res.text();
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 2000); }
    out.push({ fn: c.fn, status: res.status, body: parsed });
  }
  return new Response(JSON.stringify({ results: out }), {
    headers: { "Content-Type": "application/json" },
  });
});
