/**
 * RON Phase 2D.2g — internal endpoint for the `cross_asset_correlation` specialist.
 *
 * Service-role / capability-proof only. Reads genuine broker-native XAUUSD 15m closed
 * bars (accepted qv5 quality contract + accepted Session V2 segmentation) and genuine
 * broker-native NAS100 15m closed bars under a strict
 * `native_presence_only_no_venue_inference` policy, aligns them by EXACT timestamp
 * intersection, and returns ONE sealed Evidence V1 envelope of observed co-movement.
 *
 * NON-PERSISTING BY CONTRACT in this phase: there is no persist branch at all. It writes
 * no row, produces no decision, reaches no strategy engine, broker bridge, LLM, research
 * or calibration surface, and has no execution capability whatsoever.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sealEvidence, validateEvidence } from "../_shared/ron-agent-contracts.ts";
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import type { StructureBar } from "../_shared/ron-session-structure-spec.ts";
import {
  buildCrossAssetEvidenceV1, crossAssetSpecHash,
  CROSS_ASSET_SPEC_V1, CROSS_ASSET_COUNTERPART_V1, type CounterpartBar,
} from "../_shared/ron-cross-asset-spec.ts";
import {
  buildCrossAssetRelationshipEvidenceV2, crossAssetRelationshipSpecHashV2,
  CROSS_ASSET_RELATIONSHIP_SPEC_V2, type CounterpartBarV2,
} from "../_shared/ron-cross-asset-relationship-context-v2.ts";

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

  // Own fail-closed auth: exact service-role match, or a CAPABILITY PROOF against a table
  // that anon and authenticated cannot read at all.
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
  const counterpart = CROSS_ASSET_COUNTERPART_V1;
  if (!CROSS_ASSET_SPEC_V1.instrument_scope.includes(instrument as "XAUUSD")
    || !CROSS_ASSET_SPEC_V1.timeframe_scope.includes(timeframe as "15m")) {
    return json({ error: "out_of_scope_for_cross_asset_spec_v1", instrument, timeframe }, 400);
  }

  // spec_version 2 (default) adds the counterpart completed-bar proof and the descriptive
  // relationship context. spec_version 1 stays explicitly replayable and DEPENDENCY-
  // ISOLATED: it never consults the V2 completion proof and never reaches the V2 producer.
  const specVersion = body.spec_version == null ? 2 : Number(body.spec_version);
  if (specVersion !== 1 && specVersion !== 2) {
    return json({ error: "unsupported_spec_version", spec_version: body.spec_version }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey || token, { auth: { persistSession: false } });

  try {
    const contract = await buildEligibilityContract(db, instrument, timeframe, RON_QUALITY_VERSION);

    const newestOf = async (symbol: string): Promise<number | null> => {
      const { data, error } = await db
        .from("candle_history")
        .select("timestamp")
        .eq("symbol", symbol).eq("timeframe", timeframe)
        .order("timestamp", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.length ? new Date(data[0].timestamp).getTime() : null;
    };

    const newestSourceBar = await newestOf(instrument);
    const newestCounterpartBar = await newestOf(counterpart);
    if (newestSourceBar == null) return json({ error: "no_genuine_source_bars" }, 409);
    if (newestCounterpartBar == null) return json({ error: "no_genuine_counterpart_bars" }, 409);

    // as_of: caller-provided CLOSED bar (replay), else the newest SAFE EXACT COMMON
    // completed bar. Never a wall-clock instant.
    let asOf: number;
    if (body.as_of != null) {
      const t = new Date(String(body.as_of)).getTime();
      if (!Number.isFinite(t)) return json({ error: "invalid_as_of" }, 400);
      asOf = Math.floor(t / BAR_MS) * BAR_MS;
    } else {
      const scanFrom = new Date(Math.min(newestSourceBar, newestCounterpartBar) - 400 * BAR_MS).toISOString();
      // V1 anchor search is BYTE-UNCHANGED: timestamps only, no created_at dependency.
      const times = async (symbol: string): Promise<Set<number>> => {
        const { data, error } = await db
          .from("candle_history").select("timestamp")
          .eq("symbol", symbol).eq("timeframe", timeframe)
          .gte("timestamp", scanFrom)
          .order("timestamp", { ascending: true }).limit(1000);
        if (error) throw error;
        return new Set((data ?? []).map((r: Record<string, unknown>) => new Date(String(r.timestamp)).getTime()));
      };
      // V2 counterpart anchor search additionally requires the SAME completed-bar proof
      // the V2 producer enforces, so the default anchor can never name a row V2 excludes.
      const provenTimes = async (symbol: string): Promise<Set<number>> => {
        const { data, error } = await db
          .from("candle_history").select("timestamp, created_at")
          .eq("symbol", symbol).eq("timeframe", timeframe)
          .gte("timestamp", scanFrom)
          .order("timestamp", { ascending: true }).limit(1000);
        if (error) throw error;
        const out = new Set<number>();
        for (const r of (data ?? []) as Record<string, unknown>[]) {
          const t = new Date(String(r.timestamp)).getTime();
          const c = r.created_at ? new Date(String(r.created_at)).getTime() : NaN;
          if (Number.isFinite(t) && Number.isFinite(c) && c >= t + BAR_MS) out.add(t);
        }
        return out;
      };
      const xs = await times(instrument);
      const ns = specVersion === 2 ? await provenTimes(counterpart) : await times(counterpart);
      const common = [...xs].filter((t) => ns.has(t)).sort((a, b) => b - a);
      const pick = common.find((t) => !contract.isQuarantined({ time: t }, 15));
      if (pick == null) return json({ error: "no_exact_common_completed_anchor" }, 409);
      asOf = pick;
    }

    const fromIso = new Date(asOf - (CROSS_ASSET_SPEC_V1.lookback_bars_max + 50) * BAR_MS).toISOString();
    const toIso = new Date(asOf).toISOString();

    const { data: rows, error } = await db
      .from("candle_history")
      .select("timestamp, open, high, low, close, created_at")
      .eq("symbol", instrument).eq("timeframe", timeframe)
      .gte("timestamp", fromIso).lte("timestamp", toIso)
      .order("timestamp", { ascending: true }).limit(1000);
    if (error) throw error;

    // DEPENDENCY ISOLATION: the V1 branch uses the ORIGINAL counterpart projection and
    // never reads the V2-only `created_at` completion-proof column.
    const counterpartSelect = specVersion === 2 ? "timestamp, close, created_at" : "timestamp, close";
    const { data: cRows, error: cErr } = await db
      .from("candle_history")
      .select(counterpartSelect)
      .eq("symbol", counterpart).eq("timeframe", timeframe)
      .gte("timestamp", fromIso).lte("timestamp", toIso)
      .order("timestamp", { ascending: true }).limit(1000);
    if (cErr) throw cErr;

    const bars: StructureBar[] = (rows ?? []).map((c: Record<string, unknown>) => ({
      time: new Date(String(c.timestamp)).getTime(),
      open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
      created_at: c.created_at ? new Date(String(c.created_at)).getTime() : null,
    }));
    // ORIGINAL V1-shaped mapping: {time, close} only, no completion-proof field.
    const counterpart_bars_v1: CounterpartBar[] = specVersion === 1
      ? (cRows ?? []).map((c: Record<string, unknown>) => ({
        time: new Date(String(c.timestamp)).getTime(),
        close: Number(c.close),
      }))
      : [];
    const counterpart_bars_v2: CounterpartBarV2[] = specVersion === 2
      ? (cRows ?? []).map((c: Record<string, unknown>) => ({
        time: new Date(String(c.timestamp)).getTime(),
        close: Number(c.close),
        created_at: c.created_at ? new Date(String(c.created_at)).getTime() : null,
      }))
      : [];

    const traceId = typeof body.trace_id === "string" ? body.trace_id : crypto.randomUUID();
    const runId = typeof body.run_id === "string" ? body.run_id : crypto.randomUUID();

    const build = () => (specVersion === 2
      ? buildCrossAssetRelationshipEvidenceV2({
        instrument, counterpart, timeframe, as_of: asOf, bars,
        counterpart_bars: counterpart_bars_v2,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
        newest_counterpart_bar: newestCounterpartBar,
      })
      : buildCrossAssetEvidenceV1({
        instrument, counterpart, timeframe, as_of: asOf, bars,
        counterpart_bars: counterpart_bars_v1,
        isQuarantined: (b, m) => contract.isQuarantined(b, m),
        run_id: runId, trace_id: traceId,
        newest_source_bar: newestSourceBar,
        newest_counterpart_bar: newestCounterpartBar,
      }));

    const envelope = await build();
    const errs = validateEvidence(envelope);
    if (errs.length) return json({ error: "evidence_contract_violation", reasons: errs }, 500);
    const sealed = await sealEvidence(envelope);

    // Determinism proof on every call.
    const replay = await sealEvidence(await build());
    if (replay.evidence_hash !== sealed.evidence_hash) {
      return json({ error: "nondeterministic_specialist" }, 500);
    }

    // V1 keeps its ORIGINAL top-level replay shape; V2-only fields are added for V2 only.
    const v2Fields = specVersion === 2
      ? {
        agent_id: CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_id,
        agent_version: CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_version,
        allow_live_execution: false,
      }
      : {};

    return json({
      spec_version: specVersion,
      spec_hash: specVersion === 2
        ? await crossAssetRelationshipSpecHashV2()
        : await crossAssetSpecHash(),
      ...v2Fields,
      quality_version: RON_QUALITY_VERSION,
      counterpart,
      anchor_bar_open: new Date(asOf).toISOString(),
      anchor_bar_completed_close: new Date(asOf + BAR_MS).toISOString(),
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
