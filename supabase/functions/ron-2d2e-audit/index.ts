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
