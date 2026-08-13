// TEMPORARY Phase 2D.2j audit harness. Non-persisting. Removed before stop.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== key) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  const call = async (fn: string, payload: unknown, auth = key) => {
    const r = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  if (body.mode === "auth_probe") {
    const anon = String(body.anon_key ?? "");
    const noauth = await fetch(`${url}/functions/v1/ron-agent-falconer-signal-source`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const a = await call("ron-agent-falconer-signal-source", {}, anon);
    const s = await call("ron-agent-falconer-signal-source", {});
    return json({ no_auth: noauth.status, anon: a.status, service: s.status });
  }

  const trace = String(body.trace_id ?? crypto.randomUUID());
  const out: Record<string, unknown> = { trace_id: trace };

  const cross = await call("ron-agent-cross-asset-correlation", { trace_id: trace, run_id: `${trace}_cross` });
  out.cross = cross;
  const barOpen = (cross.body as any)?.anchor_bar_open;
  if (!barOpen) return json({ error: "no_common_anchor", cross });

  const session = await call("ron-agent-session-structure", { as_of: barOpen, trace_id: trace, run_id: `${trace}_session` });
  const pattern = await call("ron-agent-pattern-context", { as_of: barOpen, trace_id: trace, run_id: `${trace}_pattern` });
  const calib = await call("ron-agent-calibration-validation", { trace_id: trace, run_id: `${trace}_calib` });
  const sEnv = (session.body as any)?.evidence;
  const close = (sEnv?.source_timestamps?.as_of_bar_completed_close)
    ?? (sEnv?.observations ?? []).find((o: any) => o.key === "as_of_bar_completed_close")?.value_text
    ?? sEnv?.as_of;
  out.anchor_bar_open = barOpen;
  out.completed_close = close;

  const macro = await call("ron-agent-macro-news-geopolitics", { evaluation_anchor: close, trace_id: trace, run_id: `${trace}_macro` });
  const falc1 = await call("ron-agent-falconer-signal-source", { evaluation_anchor: close, trace_id: trace, run_id: `${trace}_falconer` });
  const falc2 = await call("ron-agent-falconer-signal-source", { evaluation_anchor: close, trace_id: trace, run_id: `${trace}_falconer` });

  const six = [session, calib, pattern, cross, macro, falc1].map((r) => (r.body as any)?.evidence).filter(Boolean);
  const oppInput = [session, calib, pattern, cross, macro].map((r) => (r.body as any)?.evidence).filter(Boolean);
  const opp1 = await call("ron-agent-opportunity-risk", {
    evaluation_anchor: close, evidence: oppInput, trace_id: trace, run_id: `${trace}_opp`,
  });
  const opp2 = await call("ron-agent-opportunity-risk", {
    evaluation_anchor: close, evidence: oppInput, trace_id: trace, run_id: `${trace}_opp`,
  });

  const envelopes = [...six.slice(0, 5), (opp1.body as any)?.evidence, (falc1.body as any)?.evidence].filter(Boolean);
  const ctx = { trace_id: trace, instrument: "XAUUSD", timeframe: "15m", as_of: close };
  const o1 = await call("ron-orchestrate", { context: ctx, evidence: envelopes, persist: false });
  const o2 = await call("ron-orchestrate", { context: ctx, evidence: envelopes, persist: false });
  const o3 = await call("ron-orchestrate", { context: ctx, evidence: [...envelopes].reverse(), persist: false });

  return json({
    ...out,
    session, pattern, calib, macro,
    falconer_first: falc1, falconer_second: falc2,
    opportunity_first: opp1, opportunity_second: opp2,
    orchestrate_forward_1: o1, orchestrate_forward_2: o2, orchestrate_reversed: o3,
  });
});
