/**
 * RON Phase 2B.3 — research-only robustness runner (XAUUSD 15m, calibration_version=6).
 *
 * READ-ONLY BY CONSTRUCTION. This function performs NO writes: it never touches
 * `ron_calibration_runs`, `ron_stat_cells`, or any other table, and cannot affect
 * production calibration identity, the dashboard, Falconer semantics or safety settings.
 *
 * It re-reads the SAME frozen canonical v6 evidence the accepted v6 run used, then evaluates
 * the frozen v6 hierarchy with strictly forward, non-overlapping walk-forward folds.
 *
 * POST body: { source_as_of?: ISO, folds?: number }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  ADX_BUCKET_SPEC, CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
  CALIBRATION_CONTRACT_V6, CALIBRATION_HORIZON_MINUTES, HOLDOUT_FRACTION,
  INELIGIBLE_ANCHOR_SESSIONS, anchorSessionEligible, definitionPayloadV6,
  deriveSourceBarCutoff, eligibleFor, resolveSourceClockV2, sha256,
  NoGenuineSourceClockError,
  type CalibrationInputRow, type Direction, type EligibleObs, type RunIdentityV6,
} from "../_shared/ron-calibration.ts";
import { loadQuarantinedBarTimes } from "../_shared/ron-quality-contract.ts";
import {
  ROBUSTNESS_FOLDS, ROBUSTNESS_REPORT_VERSION, BOOTSTRAP_SPEC, ROBUSTNESS_GATE,
  DEFENSIBLE_SLICE_MIN_N, runRobustness, robustnessDigest,
  type RobustnessIdentity,
} from "../_shared/ron-robustness.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const PAGE = 1000;
const CONTRACT = CALIBRATION_CONTRACT_V6;
const QUALITY_V = 3;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const eq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  let authorized = !!token && !!serviceKey && eq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }
  const folds = Number.isInteger(body.folds) ? Number(body.folds) : ROBUSTNESS_FOLDS;
  if (folds < ROBUSTNESS_GATE.min_folds) {
    return json({ error: "INSUFFICIENT_FOLDS", detail: `folds must be >= ${ROBUSTNESS_GATE.min_folds}` }, 400);
  }

  // ---- frozen source cut (identical contract to v6) ----------------------
  let sourceAsOf = typeof body.source_as_of === "string" ? body.source_as_of : null;
  let latest1m: string | null = null;
  if (!sourceAsOf) {
    const { data } = await supabase
      .from("candle_history").select("timestamp")
      .eq("symbol", SYMBOL).eq("timeframe", "1m")
      .order("timestamp", { ascending: false }).limit(1).maybeSingle();
    latest1m = (data as any)?.timestamp ?? null;
  }
  let frozenAsOf: string;
  try {
    frozenAsOf = resolveSourceClockV2(sourceAsOf, latest1m).source_as_of;
  } catch (e) {
    if (e instanceof NoGenuineSourceClockError) {
      return json({ error: "NO_GENUINE_SOURCE_CLOCK", robustness_report_version: ROBUSTNESS_REPORT_VERSION }, 503);
    }
    throw e;
  }
  const sourceBarCutoff = deriveSourceBarCutoff(frozenAsOf);

  // ---- canonical outcome rows -------------------------------------------
  const outcomes: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_snapshot_outcomes")
      .select("bar_time, session, atr_at_anchor, coverage_ok, coverage_class, long_event_eligible, long_success, short_event_eligible, short_success, barrier_atr_mult, barrier_version")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CONTRACT.feature_version)
      .eq("label_version", CONTRACT.label_version)
      .eq("horizon_minutes", CALIBRATION_HORIZON_MINUTES)
      .lte("bar_time", sourceBarCutoff)
      .order("bar_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    outcomes.push(...rows);
    if (rows.length < PAGE) break;
  }

  const dims = new Map<string, { regime: string | null; adx: number | null }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_market_snapshots")
      .select("bar_time, features")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CONTRACT.feature_version)
      .order("bar_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    for (const r of rows as any[]) {
      dims.set(new Date(r.bar_time).toISOString(), {
        regime: r.features?.regime ?? null,
        adx: typeof r.features?.adx14 === "number" ? r.features.adx14 : null,
      });
    }
    if (rows.length < PAGE) break;
  }

  const quarantined = await loadQuarantinedBarTimes(supabase, SYMBOL, TIMEFRAME, QUALITY_V, PAGE);

  const exclusion: Record<string, number> = {};
  const bump = (k: string) => { exclusion[k] = (exclusion[k] ?? 0) + 1; };
  const obs: Record<Direction, EligibleObs[]> = { long: [], short: [] };

  for (const o of outcomes) {
    const iso = new Date(o.bar_time).toISOString();
    const d = dims.get(iso);
    const q = quarantined.has(iso);
    const row: CalibrationInputRow = {
      bar_time: iso,
      session: q ? INELIGIBLE_ANCHOR_SESSIONS[0] : (o.session ?? null),
      regime: d?.regime ?? null,
      adx: d?.adx ?? null,
      long_event_eligible: o.long_event_eligible === true,
      long_success: o.long_success,
      short_event_eligible: o.short_event_eligible === true,
      short_success: o.short_success,
      coverage_ok: o.coverage_ok === true,
      coverage_class: o.coverage_class ?? "other_incomplete",
      atr_at_anchor: o.atr_at_anchor == null ? null : Number(o.atr_at_anchor),
    };
    if (Number(o.barrier_atr_mult) !== CALIBRATION_BARRIER_ATR_MULT || Number(o.barrier_version) !== CALIBRATION_BARRIER_VERSION) {
      bump("barrier_definition_mismatch");
      continue;
    }
    for (const dir of ["long", "short"] as Direction[]) {
      const e = eligibleFor(row, dir);
      if (e) obs[dir].push(e);
      else {
        const reason = !row.coverage_ok || row.coverage_class !== "complete"
          ? row.coverage_class
          : row.atr_at_anchor == null ? "missing_atr"
            : !anchorSessionEligible(row.session) ? "anchor_session_ineligible"
              : "event_ineligible";
        bump(`${dir}:${reason}`);
      }
    }
  }

  const canonicalMin = outcomes.length ? new Date(outcomes[0].bar_time).toISOString() : null;
  const canonicalMax = outcomes.length ? new Date(outcomes[outcomes.length - 1].bar_time).toISOString() : null;

  const result = runRobustness(obs, folds, HOLDOUT_FRACTION);

  // v6 definition hash of the SAME frozen source cut, for cross-reference only.
  const v6Identity: RunIdentityV6 = {
    symbol: SYMBOL, timeframe: TIMEFRAME,
    source_as_of: frozenAsOf, source_bar_cutoff: sourceBarCutoff,
    holdout_fraction: HOLDOUT_FRACTION,
    split_cutoff: result.plan.evaluation_start,
    canonical_rows: outcomes.length,
    canonical_source_min_bar_time: canonicalMin,
    canonical_source_max_bar_time: canonicalMax,
    eligible_long: obs.long.length, eligible_short: obs.short.length,
    excluded_rows: outcomes.length * 2 - obs.long.length - obs.short.length,
    exclusion_breakdown: exclusion,
  };
  const v6DefinitionHash = await sha256(definitionPayloadV6(v6Identity, CONTRACT, QUALITY_V, ADX_BUCKET_SPEC));

  const identity: RobustnessIdentity = {
    symbol: SYMBOL, timeframe: TIMEFRAME,
    calibration_version: CONTRACT.calibration_version,
    feature_version: CONTRACT.feature_version,
    label_version: CONTRACT.label_version,
    quality_version: QUALITY_V,
    source_as_of: frozenAsOf, source_bar_cutoff: sourceBarCutoff,
    v6_definition_hash: v6DefinitionHash,
    canonical_rows: outcomes.length,
    eligible_long: obs.long.length, eligible_short: obs.short.length,
  };

  const digest = await robustnessDigest(
    identity, result.plan, result.long, result.short, result.verdict, result.leakage,
  );

  return json({
    robustness_report_version: ROBUSTNESS_REPORT_VERSION,
    research_only: true,
    persisted: false,
    writes_performed: 0,
    identity,
    canonical_source_min_bar_time: canonicalMin,
    canonical_source_max_bar_time: canonicalMax,
    exclusion_breakdown: exclusion,
    fold_plan: result.plan,
    bootstrap_spec: BOOTSTRAP_SPEC,
    gate: ROBUSTNESS_GATE,
    defensible_slice_min_n: DEFENSIBLE_SLICE_MIN_N,
    leakage: result.leakage,
    long: result.long,
    short: result.short,
    verdict: result.verdict,
    robustness_digest: digest,
  });
});
