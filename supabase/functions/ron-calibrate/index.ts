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
  CALIBRATION_BARRIER_VERSION, HOLDOUT_FRACTION, SAMPLE_FLOORS,
  INELIGIBLE_ANCHOR_SESSIONS, anchorSessionEligible,
  calibrateDirection, cellPayloadV2, definitionPayloadV2, definitionPayloadV5,
  commonSplitCutoff, eligibleFor, resolvePrediction,
  runPayloadV2, sha256, resolveSourceClockV2, NoGenuineSourceClockError,
  CALIBRATION_CONTRACTS, CALIBRATION_CONTRACT_V3,
  CALIBRATION_CONTRACT_V4, CALIBRATION_CONTRACT_V5,
  ADX_BUCKET_BOUNDS, HIERARCHY_POLICY_VERSION,
  ADX_BUCKET_SPEC, CALIBRATION_CONTRACT_V6, CALIBRATION_CONTRACT_CURRENT,
  definitionPayloadV6, runPayloadV6, orderedCellDigest, deriveSourceBarCutoff,
  type CalibrationInputRow, type Direction, type EligibleObs,
  type RunIdentityV2, type RunIdentityV6,
} from "../_shared/ron-calibration.ts";
import { loadQuarantinedBarTimes, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const PAGE = 1000;
const BAR_MINUTES = 15;

void BAR_MINUTES;   // grid lives in the shared availability contract

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
  /**
   * Phase 2C.1: calibration_version=3 is canonical (feature v3 + label v4). v2 remains
   * runnable for frozen audit replay and produces byte-identical hashes.
   */
  /**
   * Phase 2B.2 (Defect E): omission defaults to the current contract (v6). An explicitly
   * supplied version is NEVER silently substituted — unknown/non-integer fails 400.
   */
  const DEFAULT_CAL_VERSION = CALIBRATION_CONTRACT_CURRENT.calibration_version;
  let CONTRACT = CALIBRATION_CONTRACTS[DEFAULT_CAL_VERSION];
  if (body.calibration_version !== undefined && body.calibration_version !== null) {
    const requested = Number(body.calibration_version);
    const known = Number.isInteger(requested) ? CALIBRATION_CONTRACTS[requested] : undefined;
    if (!known) {
      return json({
        error: "UNSUPPORTED_CALIBRATION_VERSION",
        requested: body.calibration_version,
        supported: Object.keys(CALIBRATION_CONTRACTS).map(Number).sort((a, b) => a - b),
      }, 400);
    }
    CONTRACT = known;
  }
  const CAL_VERSION = CONTRACT.calibration_version;
  const FEATURE_V = CONTRACT.feature_version;
  const LABEL_V = CONTRACT.label_version;
  /** Quality lineage pinned per calibration contract; older runs replay their own qv. */
  const QUALITY_V = CAL_VERSION >= 8 ? 5 : CAL_VERSION >= 7 ? 4 : CAL_VERSION >= 4 ? 3 : CAL_VERSION === 3 ? 2 : 1;
  /** v5+: one common cutoff for both directions; v2..v4 replay their per-direction split. */
  const COMMON_SPLIT = CAL_VERSION >= 5;
  /** v6+: canonical source range, coverage hashing and ordered-cell-digest run identity. */
  const V6 = CAL_VERSION >= 6;

  // ---- frozen source cut -------------------------------------------------
  // v2 contract: the default source clock is GENUINE MARKET TIME — the latest stored
  // 1m XAUUSD candle. `labelled_at` (a mutable write timestamp) must never participate
  // in source_as_of, source_bar_cutoff or row membership.
  let sourceAsOf = typeof body.source_as_of === "string" ? body.source_as_of : null;
  let sourceClock: "explicit" | "market_1m_candle" = "explicit";
  let latest1m: string | null = null;
  if (!sourceAsOf) {
    const { data } = await supabase
      .from("candle_history")
      .select("timestamp")
      .eq("symbol", SYMBOL).eq("timeframe", "1m")
      .order("timestamp", { ascending: false }).limit(1).maybeSingle();
    latest1m = (data as any)?.timestamp ?? null;
  }
  // Phase 2C: FAIL CLOSED. calibration_version=2 has no wall-clock fallback — a frozen
  // source instant may only come from genuine market data or an explicit replay value.
  let frozenAsOf: string;
  try {
    const resolved = resolveSourceClockV2(sourceAsOf, latest1m);
    frozenAsOf = resolved.source_as_of;
    sourceClock = resolved.source_clock;
  } catch (e) {
    if (e instanceof NoGenuineSourceClockError) {
      return json({
        error: "NO_GENUINE_SOURCE_CLOCK",
        detail: "No genuine XAUUSD 1m candle is available to freeze source_as_of. " +
          "RON calibration refuses wall-clock, labelled_at, created_at and updated_at fallbacks. " +
          "Pass an explicit source_as_of for frozen research replay.",
        calibration_version: CAL_VERSION,
      }, 503);
    }
    throw e;
  }
  sourceAsOf = frozenAsOf;
  /**
   * Phase 2B.2 (Defect D): for v6 the cutoff is DERIVED from the frozen source instant.
   * A caller-supplied cutoff is accepted only when it exactly equals the derived value;
   * anything else is rejected so the market-data availability contract cannot be bypassed.
   * v2..v5 keep their historical verbatim behaviour so old runs stay reproducible.
   */
  const derivedCutoff = deriveSourceBarCutoff(frozenAsOf);
  const suppliedCutoff = typeof body.source_bar_cutoff === "string"
    ? new Date(body.source_bar_cutoff).toISOString()
    : null;
  if (V6 && suppliedCutoff && suppliedCutoff !== derivedCutoff) {
    return json({
      error: "SOURCE_BAR_CUTOFF_MISMATCH",
      detail: "source_bar_cutoff must equal floor15m(source_as_of) - (15m bar + 60m horizon).",
      source_as_of: frozenAsOf,
      supplied_source_bar_cutoff: suppliedCutoff,
      derived_source_bar_cutoff: derivedCutoff,
      calibration_version: CAL_VERSION,
    }, 400);
  }
  const sourceBarCutoff = V6 ? derivedCutoff : (suppliedCutoff ?? derivedCutoff);

  // ---- canonical outcome rows -------------------------------------------
  const outcomes: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_snapshot_outcomes")
      .select("bar_time, session, atr_at_anchor, coverage_ok, coverage_class, exclusion_reason, long_event_eligible, long_success, short_event_eligible, short_success, barrier_atr_mult, barrier_version")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", FEATURE_V)
      .eq("label_version", LABEL_V)
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
      .eq("feature_version", FEATURE_V)
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
  // Phase 2C quarantine: a source bar with a CRITICAL data-quality flag can never be
  // calibration evidence. Critical bars are, by construction of quality_version=1, exactly
  // the bars whose OPEN falls outside the tradable venue schedule — i.e. the same anchors
  // the v2 contract already excludes as `market_closed`. Mapping them onto the existing
  // session-ineligibility path therefore leaves the v2 exclusion breakdown, run_hash and
  // cell hashes byte-identical while making the quarantine explicit and auditable.
  const qualityCritical = new Set<string>();
  {
    // Central eligibility contract — one shared definition for every RON consumer.
    const set = await loadQuarantinedBarTimes(supabase, SYMBOL, TIMEFRAME, QUALITY_V, PAGE);
    for (const iso of set) qualityCritical.add(iso);
  }
  let qualityQuarantinedRows = 0;
  let qualityQuarantinedBeyondSession = 0;

  const exclusion: Record<string, number> = {};
  const bump = (k: string) => { exclusion[k] = (exclusion[k] ?? 0) + 1; };
  const obs: Record<Direction, EligibleObs[]> = { long: [], short: [] };

  for (const o of outcomes) {
    const iso = new Date(o.bar_time).toISOString();
    const d = dims.get(iso);
    const quarantined = qualityCritical.has(iso);
    if (quarantined) {
      qualityQuarantinedRows++;
      if (anchorSessionEligible(o.session ?? null)) qualityQuarantinedBeyondSession++;
    }
    const row: CalibrationInputRow = {
      bar_time: iso,
      // Quarantined source bars are routed through the existing ineligible-anchor gate.
      session: quarantined ? INELIGIBLE_ANCHOR_SESSIONS[0] : (o.session ?? null),
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

  // ONE common chronological cutoff from the distinct canonical eligible snapshot times of
  // BOTH directions, computed before any direction-specific calibration.
  const commonCutoff = COMMON_SPLIT ? commonSplitCutoff([obs.long, obs.short], holdoutFraction) : null;
  const longReport = COMMON_SPLIT
    ? calibrateDirection("long", obs.long, holdoutFraction, commonCutoff)
    : calibrateDirection("long", obs.long, holdoutFraction);
  const shortReport = COMMON_SPLIT
    ? calibrateDirection("short", obs.short, holdoutFraction, commonCutoff)
    : calibrateDirection("short", obs.short, holdoutFraction);
  const cutoff = COMMON_SPLIT
    ? commonCutoff
    : (longReport.holdout_range?.[0] ?? shortReport.holdout_range?.[0] ?? null);

  const canonicalMin = outcomes.length ? new Date(outcomes[0].bar_time).toISOString() : null;
  const canonicalMax = outcomes.length ? new Date(outcomes[outcomes.length - 1].bar_time).toISOString() : null;

  const identity: RunIdentityV6 = {
    symbol: SYMBOL, timeframe: TIMEFRAME,
    source_as_of: sourceAsOf, source_bar_cutoff: sourceBarCutoff,
    holdout_fraction: holdoutFraction, split_cutoff: cutoff,
    canonical_rows: outcomes.length,
    canonical_source_min_bar_time: canonicalMin,
    canonical_source_max_bar_time: canonicalMax,
    eligible_long: obs.long.length, eligible_short: obs.short.length,
    excluded_rows: outcomes.length * 2 - obs.long.length - obs.short.length,
    exclusion_breakdown: exclusion,
  };
  const definitionHash = await sha256(
    V6
      ? definitionPayloadV6(identity, CONTRACT, QUALITY_V, ADX_BUCKET_SPEC)
      : CAL_VERSION >= 5
        ? definitionPayloadV5(identity, CONTRACT, QUALITY_V)
        : definitionPayloadV2(identity as RunIdentityV2, CONTRACT),
  );

  // ---- deterministic cell payloads + hashes (no run_id dependence) -------
  const cellDrafts: { direction: Direction; cell_key: string; cell_hash: string; row: Record<string, unknown> }[] = [];
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
      const cellHash = await sha256([definitionHash, cellPayloadV2(c, persisted, CONTRACT)]);
      cellDrafts.push({
        direction: c.direction, cell_key: c.cell_key, cell_hash: cellHash,
        row: {
          symbol: SYMBOL, timeframe: TIMEFRAME,
          calibration_version: CAL_VERSION,
          event_definition: CALIBRATION_EVENT, event_version: CALIBRATION_EVENT_VERSION,
          feature_version: FEATURE_V, label_version: LABEL_V,
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
          cell_hash: cellHash,
        },
      });
    }
  }
  const { digest: cellDigest } = await orderedCellDigest(cellDrafts);

  const runHash = V6
    ? await sha256(runPayloadV6(identity, definitionHash, longReport, shortReport, cellDigest))
    : await sha256(runPayloadV2(identity as RunIdentityV2, definitionHash, longReport, shortReport));

  const summary = {
    calibration_version: CAL_VERSION,
    feature_version: FEATURE_V,
    label_version: LABEL_V,
    source_as_of: sourceAsOf,
    source_bar_cutoff: sourceBarCutoff,
    source_clock: sourceClock,
    ineligible_anchor_sessions: INELIGIBLE_ANCHOR_SESSIONS,
    quality_version: QUALITY_V,
    quality_critical_anchors: qualityCritical.size,
    quality_quarantined_rows: qualityQuarantinedRows,
    // > 0 would mean the quality rule changed calibration membership, which requires a NEW
    // calibration contract version rather than a rewrite of v2 semantics.
    quality_quarantine_beyond_session_exclusion: qualityQuarantinedBeyondSession,
    holdout_fraction: holdoutFraction,
    split_cutoff: cutoff,
    common_split_cutoff: COMMON_SPLIT ? commonCutoff : null,
    sample_floors: SAMPLE_FLOORS,
    adx_bucket_bounds: ADX_BUCKET_BOUNDS,
    hierarchy_policy_version: HIERARCHY_POLICY_VERSION,
    canonical_rows: outcomes.length,
    canonical_source_min_bar_time: canonicalMin,
    canonical_source_max_bar_time: canonicalMax,
    eligible_long: obs.long.length,
    eligible_short: obs.short.length,
    excluded_rows: identity.excluded_rows,
    exclusion_breakdown: exclusion,
    definition_hash: definitionHash,
    run_hash: runHash,
    ordered_cell_digest: V6 ? cellDigest : null,
    adx_bucket_spec: ADX_BUCKET_SPEC,
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
      calibration_version: CAL_VERSION,
      event_definition: CALIBRATION_EVENT, event_version: CALIBRATION_EVENT_VERSION,
      feature_version: FEATURE_V, label_version: LABEL_V,
      horizon_minutes: CALIBRATION_HORIZON_MINUTES,
      barrier_atr_mult: CALIBRATION_BARRIER_ATR_MULT, barrier_version: CALIBRATION_BARRIER_VERSION,
      source_as_of: sourceAsOf, source_bar_cutoff: sourceBarCutoff,
      holdout_fraction: holdoutFraction, split_cutoff: cutoff,
      canonical_rows: outcomes.length,
      ...(V6 ? { canonical_source_min_bar_time: canonicalMin, canonical_source_max_bar_time: canonicalMax } : {}),
      eligible_long: obs.long.length, eligible_short: obs.short.length,
      excluded_rows: summary.excluded_rows,
      exclusion_breakdown: exclusion,
      long_report: longReport as unknown as Record<string, unknown>,
      short_report: shortReport as unknown as Record<string, unknown>,
      definition_hash: definitionHash, run_hash: runHash, status: "research",
    }, { onConflict: "symbol,timeframe,event_definition,event_version,feature_version,label_version,horizon_minutes,calibration_version,source_as_of,source_bar_cutoff_key,holdout_fraction" })
    .select("id").single();
  if (runErr) return json({ error: runErr.message, summary }, 500);

  const runId = (runRow as any).id as string;
  const cellRows: Record<string, unknown>[] = cellDrafts.map((d) => ({ run_id: runId, ...d.row }));

  for (let i = 0; i < cellRows.length; i += 200) {
    const { error } = await supabase.from("ron_stat_cells")
      .upsert(cellRows.slice(i, i + 200), { onConflict: "run_id,direction,cell_key" });
    if (error) return json({ error: error.message, summary }, 500);
  }

  return json({ ...summary, persisted: true, run_id: runId, cells_written: cellRows.length });
});
