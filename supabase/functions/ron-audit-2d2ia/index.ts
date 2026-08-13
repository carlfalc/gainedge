// TEMPORARY Phase 2D.2i-a audit harness. Read-only, non-persisting. Deleted before stop.
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "no" }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.op !== "call") return json({ error: "unknown_op" }, 400);
  const r = await fetch(`${url}/functions/v1/${body.fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body.payload ?? {}),
  });
  return json({ status: r.status, body: await r.json().catch(() => null) });
});
