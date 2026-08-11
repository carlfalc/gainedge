/**
 * RON Phase 2B.1 — empirical calibration runner, calibration_version = 2 (RESEARCH ONLY).
 *
 * Reads canonical v3 / 60m / ±1 ATR outcomes for XAUUSD 15m, applies the strict
 * eligibility gate, splits chronologically, builds the L0..L3 stat-cell hierarchy and
 * scores the holdout. Nothing it writes is displayed as a probability anywhere.
 *
 * REPRODUCIBILITY (v2 input contract)
 *   Row membership is frozen by MARKET TIME, never by the mutable `labelled_at` column:
 *   `source_bar_cutoff = floor15m(source_as_of) - (bar 15m + horizon 60m)` is the last
 *   anchor whose whole forward horizon had elapsed at the frozen instant. Re-labelling an
 *   unchanged historical outcome therefore cannot change membership, metrics or hashes.
 *   `source_as_of` is retained as provenance only.
 *
 * POST body:
 *   { source_as_of?: ISO, source_bar_cutoff?: ISO, holdout_fraction?: number, persist?: boolean }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION, CALIBRATION_FEATURE_VERSION,
  CALIBRATION_LABEL_VERSION, CALIBRATION_HORIZON_MINUTES, CALIBRATION_BARRIER_ATR_MULT,
  CALIBRATION_BARRIER_VERSION, CALIBRATION_VERSION, HOLDOUT_FRACTION, SAMPLE_FLOORS,
  INELIGIBLE_ANCHOR_SESSIONS, anchorSessionEligible,
  calibrateDirection, cellPayloadV2, definitionPayloadV2, eligibleFor, resolvePrediction,
  runPayloadV2, sha256, type CalibrationInputRow, type Direction, type EligibleObs,
  type RunIdentityV2,
} from "../_shared/ron-calibration.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const PAGE = 1000;
const BAR_MINUTES = 15;

/** Immutable market-time boundary derived purely from the frozen instant. */
function deriveSourceBarCutoff(sourceAsOf: string): string {
  const grid = BAR_MINUTES * 60_000;
  const floored = Math.floor(new Date(sourceAsOf).getTime() / grid) * grid;
  return new Date(floored - (BAR_MINUTES + CALIBRATION_HORIZON_MINUTES) * 60_000).toISOString();
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Authorization: exact secret match only, never a decoded JWT claim.
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
  const holdoutFraction = typeof body.holdout_fraction === "number" ? body.holdout_fraction : HOLDOUT_FRACTION;
  const persist = body.persist !== false;

  // ---- frozen source cut -------------------------------------------------
  let sourceAsOf = typeof body.source_as_of === "string" ? body.source_as_of : null;
  if (!sourceAsOf) {
    const { data } = await supabase
      .from("ron_snapshot_outcomes")
      .select("labelled_at")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CALIBRATION_FEATURE_VERSION)
      .eq("label_version", CALIBRATION_LABEL_VERSION)
      .eq("horizon_minutes", CALIBRATION_HORIZON_MINUTES)
      .order("labelled_at", { ascending: false }).limit(1).maybeSingle();
    sourceAsOf = (data as any)?.labelled_at ?? new Date().toISOString();
  }
  const frozenAsOf = new Date(sourceAsOf ?? new Date().toISOString()).toISOString();
  sourceAsOf = frozenAsOf;
  const sourceBarCutoff = typeof body.source_bar_cutoff === "string"
    ? new Date(body.source_bar_cutoff).toISOString()
    : deriveSourceBarCutoff(frozenAsOf);

  // ---- canonical outcome rows -------------------------------------------
  const outcomes: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_snapshot_outcomes")
      .select("bar_time, session, atr_at_anchor, coverage_ok, coverage_class, exclusion_reason, long_event_eligible, long_success, short_event_eligible, short_success, barrier_atr_mult, barrier_version, labelled_at")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CALIBRATION_FEATURE_VERSION)
      .eq("label_version", CALIBRATION_LABEL_VERSION)
      .eq("horizon_minutes", CALIBRATION_HORIZON_MINUTES)
      .lte("bar_time", sourceBarCutoff)
      .order("bar_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    outcomes.push(...rows);
    if (rows.length < PAGE) break;
  }

  // ---- snapshot dimensions (regime, ADX) --------------------------------
  const dims = new Map<string, { regime: string | null; adx: number | null }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_market_snapshots")
      .select("bar_time, features")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CALIBRATION_FEATURE_VERSION)
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

  // ---- eligibility -------------------------------------------------------
  const exclusion: Record<string, number> = {};
  const bump = (k: string) => { exclusion[k] = (exclusion[k] ?? 0) + 1; };
  const obs: Record<Direction, EligibleObs[]> = { long: [], short: [] };

  for (const o of outcomes) {
    const iso = new Date(o.bar_time).toISOString();
    const d = dims.get(iso);
    const row: CalibrationInputRow = {
      bar_time: iso,
      session: o.session ?? null,
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
    let any = false;
    for (const dir of ["long", "short"] as Direction[]) {
      const e = eligibleFor(row, dir);
      if (e) { obs[dir].push(e); any = true; }
      else {
        const reason = !row.coverage_ok || row.coverage_class !== "complete"
          ? row.coverage_class
          : row.atr_at_anchor == null
            ? "missing_atr"
            : !anchorSessionEligible(row.session)
              ? "anchor_session_ineligible"
              : "event_ineligible";
        bump(`${dir}:${reason}`);
      }
    }
    if (!any) bump("row_fully_excluded");
  }

  const longReport = calibrateDirection("long", obs.long, holdoutFraction);
  const shortReport = calibrateDirection("short", obs.short, holdoutFraction);
  const cutoff = longReport.holdout_range?.[0] ?? shortReport.holdout_range?.[0] ?? null;

  const identity: RunIdentityV2 = {
    symbol: SYMBOL, timeframe: TIMEFRAME,
    source_as_of: sourceAsOf, source_bar_cutoff: sourceBarCutoff,
    holdout_fraction: holdoutFraction, split_cutoff: cutoff,
    canonical_rows: outcomes.length,
    eligible_long: obs.long.length, eligible_short: obs.short.length,
    excluded_rows: outcomes.length * 2 - obs.long.length - obs.short.length,
    exclusion_breakdown: exclusion,
  };
  const definitionHash = await sha256(definitionPayloadV2(identity));
  const runHash = await sha256(runPayloadV2(identity, definitionHash, longReport, shortReport));

  const summary = {
    calibration_version: CALIBRATION_VERSION,
    source_as_of: sourceAsOf,
    source_bar_cutoff: sourceBarCutoff,
    ineligible_anchor_sessions: INELIGIBLE_ANCHOR_SESSIONS,
    holdout_fraction: holdoutFraction,
    split_cutoff: cutoff,
    sample_floors: SAMPLE_FLOORS,
    canonical_rows: outcomes.length,
    eligible_long: obs.long.length,
    eligible_short: obs.short.length,
    excluded_rows: identity.excluded_rows,
    exclusion_breakdown: exclusion,
    definition_hash: definitionHash,
    run_hash: runHash,
    long: longReport,
    short: shortReport,
    persisted: false as boolean,
    run_id: null as string | null,
  };

  if (!persist) return json(summary);

  const { data: runRow, error: runErr } = await supabase
    .from("ron_calibration_runs")
    .upsert({
      symbol: SYMBOL, timeframe: TIMEFRAME,
      calibration_version: CALIBRATION_VERSION,
      event_definition: CALIBRATION_EVENT, event_version: CALIBRATION_EVENT_VERSION,
      feature_version: CALIBRATION_FEATURE_VERSION, label_version: CALIBRATION_LABEL_VERSION,
      horizon_minutes: CALIBRATION_HORIZON_MINUTES,
      barrier_atr_mult: CALIBRATION_BARRIER_ATR_MULT, barrier_version: CALIBRATION_BARRIER_VERSION,
      source_as_of: sourceAsOf, source_bar_cutoff: sourceBarCutoff,
      holdout_fraction: holdoutFraction, split_cutoff: cutoff,
      canonical_rows: outcomes.length,
      eligible_long: obs.long.length, eligible_short: obs.short.length,
      excluded_rows: summary.excluded_rows,
      exclusion_breakdown: exclusion,
      long_report: longReport as unknown as Record<string, unknown>,
      short_report: shortReport as unknown as Record<string, unknown>,
      definition_hash: definitionHash, run_hash: runHash, status: "research",
    }, { onConflict: "symbol,timeframe,event_definition,event_version,feature_version,label_version,horizon_minutes,calibration_version,source_as_of,holdout_fraction" })
    .select("id").single();
  if (runErr) return json({ error: runErr.message, summary }, 500);

  const runId = (runRow as any).id as string;
  const cellRows: Record<string, unknown>[] = [];
  for (const rep of [longReport, shortReport]) {
    const map = new Map(rep.cells.map((c) => [c.cell_key, c]));
    for (const c of rep.cells) {
      const res = resolvePrediction(map, rep.direction, {
        bar_time: "", t: 0, success: false,
        session: c.dim_session ?? "", regime: c.dim_regime ?? "", adx_bucket: c.dim_adx_bucket ?? "",
      });
      const persisted = {
        source_as_of: sourceAsOf, source_bar_cutoff: sourceBarCutoff, split_cutoff: cutoff,
        fit_start: rep.fit_range?.[0] ?? null, fit_end: rep.fit_range?.[1] ?? null,
        holdout_start: rep.holdout_range?.[0] ?? null, holdout_end: rep.holdout_range?.[1] ?? null,
        prediction_rate: c.meets_sample_floor ? c.empirical_rate : res.p,
        brier: rep.brier, naive_brier: rep.naive_brier,
      };
      cellRows.push({
        run_id: runId, symbol: SYMBOL, timeframe: TIMEFRAME,
        calibration_version: CALIBRATION_VERSION,
        event_definition: CALIBRATION_EVENT, event_version: CALIBRATION_EVENT_VERSION,
        feature_version: CALIBRATION_FEATURE_VERSION, label_version: CALIBRATION_LABEL_VERSION,
        horizon_minutes: CALIBRATION_HORIZON_MINUTES,
        barrier_atr_mult: CALIBRATION_BARRIER_ATR_MULT, barrier_version: CALIBRATION_BARRIER_VERSION,
        direction: c.direction, level: c.level, cell_key: c.cell_key,
        dim_session: c.dim_session, dim_regime: c.dim_regime, dim_adx_bucket: c.dim_adx_bucket,
        ...persisted,
        n_fit: c.n_fit, successes_fit: c.successes_fit, empirical_rate: c.empirical_rate,
        wilson_low: c.wilson_low, wilson_high: c.wilson_high,
        sample_floor: c.sample_floor, meets_sample_floor: c.meets_sample_floor,
        n_holdout: c.n_holdout, successes_holdout: c.successes_holdout, holdout_rate: c.holdout_rate,
        definition_hash: definitionHash,
        cell_hash: await sha256([definitionHash, cellPayloadV2(c, persisted)]),
      });
    }
  }

  for (let i = 0; i < cellRows.length; i += 200) {
    const { error } = await supabase.from("ron_stat_cells")
      .upsert(cellRows.slice(i, i + 200), { onConflict: "run_id,direction,cell_key" });
    if (error) return json({ error: error.message, summary }, 500);
  }

  return json({ ...summary, persisted: true, run_id: runId, cells_written: cellRows.length });
});
