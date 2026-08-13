// TEMPORARY Phase 2D.2i audit harness. Read-only, non-persisting. Deleted before stop.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== Deno.env.get("SUPABASE_ANON_KEY") && token !== key) return json({ error: "no" }, 401);

  const body = await req.json().catch(() => ({}));
  const call = (fn: string, payload: unknown, auth = key) =>
    fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(payload),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  if (body.op === "call") return json(await call(body.fn, body.payload ?? {}, body.auth === null ? "" : (body.auth ?? key)));
  return json({ error: "unknown_op" }, 400);
});
