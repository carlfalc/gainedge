/**
 * RON Phase 2D.2h — internal endpoint for the `macro_news_geopolitics` specialist.
 *
 * Service-role / capability-proof only. Performs ONE bounded read-only query against
 * `news_items`, projecting ONLY `id, headline, source, published_at, instruments_affected,
 * impact`. It never selects `ai_reason_short` or `sentiment_direction`, never touches the
 * legacy `news_impact_results` table, never calls an LLM, never fetches the web, never
 * calls the orchestrator and has NO persistence branch of any kind in this phase.
 *
 * Non-persisting in Phase 2D.2h: the response returns a sealed envelope only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence } from "../_shared/ron-agent-contracts.ts";
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import {
  buildMacroNewsEvidenceV1, macroNewsSpecHash, MACRO_NEWS_SPEC_V1,
  MACRO_NEWS_WINDOW_MINUTES, MACRO_NEWS_MAX_ROWS, type MacroNewsRow,
} from "../_shared/ron-macro-news-geopolitics-spec.ts";
import {
  buildMacroTemporalContextEvidenceV2, macroNewsSpecHashV2, lastCompletedBarOpen,
  MACRO_NEWS_SPEC_V2,
} from "../_shared/ron-macro-temporal-context-v2.ts";
import type { StructureBar } from "../_shared/ron-session-structure-spec.ts";
import {
  instrumentAdmitted, multiMarketRequested,
} from "../_shared/ron-multi-market-scope-v1.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const BAR_MS = 15 * 60_000;

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  let authorized = !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized) {
    const probe = createClient(supabaseUrl, token, { auth: { persistSession: false } });
    const { error: probeErr } = await probe
      .from("ron_agent_registry").select("agent_id").limit(1);
    authorized = !probeErr;
  }
  if (!authorized) return json({ error: "unauthorized: internal service-role endpoint" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }

  const instrument = typeof body.instrument === "string" ? body.instrument : SYMBOL;
  const timeframe = typeof body.timeframe === "string" ? body.timeframe : TIMEFRAME;
  if (!instrumentAdmitted(MACRO_NEWS_SPEC_V1, instrument, multiMarketRequested(body))
    || !MACRO_NEWS_SPEC_V1.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_macro_news_spec_v1", instrument, timeframe }, 400);
  }

  // spec_version 2 (default) attaches observed temporal XAU price context.
  // spec_version 1 stays explicitly replayable, byte-for-byte.
  const specVersion = body.spec_version == null ? 2 : Number(body.spec_version);
  if (specVersion !== 1 && specVersion !== 2) {
    return json({ error: "unsupported_spec_version", spec_version: body.spec_version }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  try {
    // ---- evaluation anchor: explicit (replay) or the newest SAFE COMPLETED XAU 15m bar
    // close. Never a wall-clock instant.
    let anchor: number;
    let anchorBarOpen: number | null = null;
    // V1 dependency isolation: the qv5 eligibility contract is loaded ONLY when it is
    // actually required — (a) to choose a default safe anchor, or (b) for V2 price
    // context quality gating. An explicit `spec_version:1` replay must not newly
    // depend on the quality contract, exactly as before V2 existed.
    type Eligibility = Awaited<ReturnType<typeof buildEligibilityContract>>;
    let contract: Eligibility | null = null;
    const eligibility = async (): Promise<Eligibility> =>
      (contract ??= await buildEligibilityContract(db, instrument, timeframe, RON_QUALITY_VERSION));
    const explicit = body.evaluation_anchor ?? body.as_of;
    if (explicit != null) {
      const t = new Date(String(explicit)).getTime();
      if (!Number.isFinite(t)) return json({ error: "invalid_evaluation_anchor" }, 400);
      anchor = t;
    } else {
      const defaultAnchorContract = await eligibility();
      const { data: bars, error: barErr } = await db
        .from("candle_history").select("timestamp")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .order("timestamp", { ascending: false }).limit(200);
      if (barErr) throw barErr;
      const times = (bars ?? []).map((r: Record<string, unknown>) => new Date(String(r.timestamp)).getTime());
      const pick = times.find((t) => !defaultAnchorContract.isQuarantined({ time: t }, 15));
      if (pick == null) return json({ error: "no_safe_completed_anchor_bar" }, 409);
      anchorBarOpen = pick;
      anchor = pick + BAR_MS;
    }

    const fromIso = new Date(anchor - MACRO_NEWS_WINDOW_MINUTES * 60_000).toISOString();
    const toIso = new Date(anchor).toISOString();

    const { data: rows, error } = await db
      .from("news_items")
      .select("id, headline, source, published_at, instruments_affected, impact")
      .gte("published_at", fromIso).lte("published_at", toIso)
      .order("published_at", { ascending: false })
      .limit(MACRO_NEWS_MAX_ROWS);
    if (error) throw error;

    const items: MacroNewsRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      headline: String(r.headline ?? ""),
      source: String(r.source ?? ""),
      published_at: new Date(String(r.published_at)).getTime(),
      instruments_affected: Array.isArray(r.instruments_affected)
        ? (r.instruments_affected as string[]) : null,
      impact: r.impact == null ? null : String(r.impact),
    }));

    const traceId = typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID();
    const runId = typeof body.run_id === "string" ? body.run_id : crypto.randomUUID();

    // ---- V2 only: genuine broker-native completed XAU bars over the inherited window.
    let priceBars: StructureBar[] = [];
    let qualityGate: Eligibility | null = null;
    if (specVersion === 2) {
      qualityGate = await eligibility();
      const gridEnd = lastCompletedBarOpen(anchor);
      const gridStart = Math.floor((anchor - MACRO_NEWS_WINDOW_MINUTES * 60_000) / BAR_MS) * BAR_MS;
      const { data: cRows, error: cErr } = await db
        .from("candle_history")
        .select("timestamp, open, high, low, close, created_at")
        .eq("symbol", instrument).eq("timeframe", timeframe)
        .gte("timestamp", new Date(gridStart).toISOString())
        .lte("timestamp", new Date(gridEnd).toISOString())
        .order("timestamp", { ascending: true }).limit(1000);
      if (cErr) throw cErr;
      priceBars = (cRows ?? []).map((c: Record<string, unknown>) => ({
        time: new Date(String(c.timestamp)).getTime(),
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        created_at: c.created_at ? new Date(String(c.created_at)).getTime() : null,
      }));
    }

    const build = () => specVersion === 2 && qualityGate
      ? buildMacroTemporalContextEvidenceV2({
        instrument, timeframe, evaluation_anchor: anchor, items,
        run_id: runId, trace_id: traceId,
        bars: priceBars, isQuarantined: (b, m) => qualityGate!.isQuarantined(b, m),
      })
      : buildMacroNewsEvidenceV1({
        instrument, timeframe, evaluation_anchor: anchor, items,
        run_id: runId, trace_id: traceId,
      });

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    return json({
      spec_version: specVersion,
      spec_hash: specVersion === 2 ? await macroNewsSpecHashV2() : await macroNewsSpecHash(),
      quality_version: specVersion === 2 ? RON_QUALITY_VERSION : null,
      agent_id: MACRO_NEWS_SPEC_V2.agent_id,
      agent_version: MACRO_NEWS_SPEC_V2.agent_version,
      evaluation_anchor: new Date(anchor).toISOString(),
      anchor_bar_open: anchorBarOpen == null ? null : new Date(anchorBarOpen).toISOString(),
      source_window_start: fromIso,
      source_rows_loaded: items.length,
      evidence: sealed,
      numeric_probability: null,
      execution_allowed: false,
      execution_path: "signal_only",
      persisted: false,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
