/**
 * RON persisted-decision READ endpoint (implementation marker 2D.2m — NEW marker).
 *
 * READ-ONLY. Performs zero database mutations, zero recomputation and zero synthesis.
 * Requires a verified end-user JWT (role=authenticated); service-role callers are also
 * accepted for internal verification. The audit tables carry no user-scoped data, so no
 * caller token is ever forwarded, logged or persisted.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  assertReadSafe, buildDecisionView, DECISION_READ_SPEC_V1, decisionReadSpecHash,
  DecisionReadError, decisionViewHash, RON_DECISION_READ_VERSION,
} from "../_shared/ron-decision-read.ts";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized: authenticated subject required" }, 401);

  const isServiceRole = !!serviceKey && timingSafeEq(token, serviceKey);
  let authenticated = isServiceRole;
  if (!authenticated && anonKey) {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims, error } = await authClient.auth.getClaims(token);
    const role = (claims?.claims as Record<string, unknown> | undefined)?.role;
    if (!error && claims?.claims?.sub && role === "authenticated") authenticated = true;
  }
  if (!authenticated) return json({ error: "unauthorized: authenticated subject required" }, 401);
  if (!serviceKey) return json({ error: "internal_key_unavailable" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  const decisionId = typeof body.decision_id === "string" ? body.decision_id : null;
  const instrument = typeof body.instrument === "string" ? body.instrument : null;
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : null;

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    let q = db.from("ron_orchestrator_decisions").select("*");
    if (decisionId) q = q.eq("decision_id", decisionId);
    if (instrument) q = q.eq("instrument", instrument);
    if (timeframe) q = q.eq("timeframe", timeframe);
    const { data: decisions, error: dErr } = await q
      .order("as_of", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (dErr) return json({ error: `read_failed:${dErr.message}` }, 500);

    const spec_hash = await decisionReadSpecHash();
    if (!decisions?.length) {
      return json({
        read_version: RON_DECISION_READ_VERSION, spec_hash,
        decision_available: false, view: null,
        numeric_probability: null, probability_status: "not_calibrated",
        execution_allowed: false, execution_path: "signal_only",
      });
    }

    const row = decisions[0] as Record<string, unknown>;
    const { data: links, error: lErr } = await db.from("ron_decision_evidence")
      .select("decision_id,evidence_hash,ordinal,authority_rank,agent_id")
      .eq("decision_id", row.decision_id as string);
    if (lErr) return json({ error: `read_failed:${lErr.message}` }, 500);

    const hashes = (links ?? []).map((l) => l.evidence_hash as string);
    const { data: evidence, error: eErr } = await db.from("ron_agent_evidence")
      .select("*").in("evidence_hash", hashes.length ? hashes : ["__none__"]);
    if (eErr) return json({ error: `read_failed:${eErr.message}` }, 500);

    const view = buildDecisionView(row, (links ?? []) as Record<string, unknown>[],
      (evidence ?? []) as Record<string, unknown>[]);
    assertReadSafe(view);

    return json({
      read_version: RON_DECISION_READ_VERSION,
      spec_hash,
      projection_policy: DECISION_READ_SPEC_V1.probability_policy,
      decision_available: true,
      view,
      view_hash: await decisionViewHash(view),
      numeric_probability: null,
      probability_status: "not_calibrated",
      execution_allowed: false,
      execution_path: "signal_only",
      writes: 0,
    });
  } catch (err) {
    if (err instanceof DecisionReadError) {
      return json({ error: err.name, reasons: err.reasons, decision_available: false }, 409);
    }
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
