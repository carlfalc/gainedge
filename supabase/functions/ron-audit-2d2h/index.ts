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
