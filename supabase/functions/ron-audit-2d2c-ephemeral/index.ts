// EPHEMERAL AUDIT HARNESS — Phase 2D.2c only. Deleted immediately after the smoke.
// It performs no analysis of its own; it only exercises the auth matrix and invokes the
// read-only specialist twice with persist=false.
Deno.serve(async (req) => {
  const nonce = req.headers.get("x-audit-nonce") ?? "";
  if (nonce !== Deno.env.get("RON_AUDIT_NONCE_2D2C")) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ron-agent-calibration-validation`;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const body = JSON.stringify({ run_id: "smoke-2d2c", trace_id: "smoke-2d2c", persist: false });
  const call = async (auth: string | null) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const noToken = await call(null);
  const garbage = await call("garbage-token-value");
  const anonCall = anon ? await call(anon) : { status: null, json: null };
  const first = await call(svc);
  const second = await call(svc);
  return new Response(JSON.stringify({
    auth_matrix: {
      no_token: noToken.status, garbage: garbage.status, anon: anonCall.status,
      service_role: first.status,
    },
    repeat_equality: first.json?.evidence?.evidence_hash === second.json?.evidence?.evidence_hash,
    first: first.json, second_hash: second.json?.evidence?.evidence_hash,
  }, null, 1), { headers: { "Content-Type": "application/json" } });
});
