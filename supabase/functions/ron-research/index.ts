/**
 * RON Phase 2D.1 — state discovery under purged walk-forward (RESEARCH ONLY).
 *
 * Reads the SAME frozen clean lineage as calibration v4 (quality v3 / feature v4 / label v5)
 * and evaluates the predeclared RON_STATE_SPEC_V1 candidate set against a purged expanding
 * walk-forward protocol. Writes ONLY to public.ron_research_runs and
 * public.ron_research_candidate_results. It never touches calibration runs/cells, snapshots,
 * outcomes, quality flags, Falconer state or any user-facing setting.
 *
 * POST body: { source_as_of?: ISO, folds?: number, persist?: boolean }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION, CALIBRATION_CONTRACT_V4,
  CALIBRATION_CONTRACT_V7,
  CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION, CALIBRATION_HORIZON_MINUTES,
  INELIGIBLE_ANCHOR_SESSIONS, NoGenuineSourceClockError, anchorSessionEligible,
  deriveSourceBarCutoff, eligibleFor, resolveSourceClockV2, sha256,
  type CalibrationInputRow, type Direction,
} from "../_shared/ron-calibration.ts";
import { loadQuarantinedBarTimes } from "../_shared/ron-quality-contract.ts";
import {
  RON_STATE_SPEC_VERSION_V2, deriveStateV2, stateSpecPayloadV2,
} from "../_shared/ron-state-spec.ts";
import {
  BASELINE_CANDIDATE, COVERAGE_EPOCH_GAP_HOURS, FOLD_DEFINITION_VERSION, PROMOTION_GATE,
  PURGE_MINUTES, REQUESTED_FOLDS, RESEARCH_VERSION,
  buildCandidateSet, buildGapAwareFolds, candidateSpecPayload, evaluateCandidate,
  evaluateCandidateFold, researchDigest, topBucketsV2,
  type CandidateResult, type FoldResult, type ResearchObs,
} from "../_shared/ron-research.ts";
import {
  CONTINUITY_CONTRACT_VERSION, FOLD_DEFINITION_VERSION_V3, RESEARCH_VERSION_V3,
  analyseContinuity, buildVenueAwareFolds, candidateSpecPayloadV3, holdoutFold,
  v3ContractHashes,
} from "../_shared/ron-research-v3.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const PAGE = 1000;

/** Accepted, frozen input lineage per research version. Never mutated by research. */
const LINEAGE = {
  2: { contract: CALIBRATION_CONTRACT_V4, quality_version: 3 },
  3: { contract: CALIBRATION_CONTRACT_V7, quality_version: 4 },
} as const;

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
  const folds = Number.isInteger(body.folds) ? Number(body.folds) : REQUESTED_FOLDS;
  const persist = body.persist !== false;
  const rv = body.research_version === 3 ? RESEARCH_VERSION_V3 : RESEARCH_VERSION;
  const CONTRACT = LINEAGE[rv as 2 | 3].contract;
  const QUALITY_V = LINEAGE[rv as 2 | 3].quality_version;

  // ---- frozen immutable source clock (identical contract to calibration) --
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
    if (e instanceof NoGenuineSourceClockError) return json({ error: "NO_GENUINE_SOURCE_CLOCK" }, 503);
    throw e;
  }
  const sourceBarCutoff = deriveSourceBarCutoff(frozenAsOf);

  // ---- canonical outcomes (immutable market-time membership) --------------
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

  // ---- feature v4 snapshots (features + persisted patterns) ---------------
  const snaps = new Map<string, { features: Record<string, unknown>; patterns: any[] }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ron_market_snapshots")
      .select("bar_time, features, patterns")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .eq("feature_version", CONTRACT.feature_version)
      .order("bar_time", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    for (const r of rows as any[]) {
      snaps.set(new Date(r.bar_time).toISOString(), {
        features: r.features ?? {},
        patterns: Array.isArray(r.patterns) ? r.patterns : [],
      });
    }
    if (rows.length < PAGE) break;
  }

  const quarantined = await loadQuarantinedBarTimes(supabase, SYMBOL, TIMEFRAME, QUALITY_V, PAGE);

  const exclusion: Record<string, number> = {};
  const bump = (k: string) => { exclusion[k] = (exclusion[k] ?? 0) + 1; };
  const obs: Record<Direction, ResearchObs[]> = { long: [], short: [] };

  for (const o of outcomes) {
    const iso = new Date(o.bar_time).toISOString();
    const snap = snaps.get(iso);
    const q = quarantined.has(iso);
    const f = snap?.features ?? {};
    const row: CalibrationInputRow = {
      bar_time: iso,
      session: q ? INELIGIBLE_ANCHOR_SESSIONS[0] : (o.session ?? null),
      regime: (f as any)?.regime ?? null,
      adx: typeof (f as any)?.adx14 === "number" ? (f as any).adx14 : null,
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
    if (!snap) { bump("missing_feature_v4_snapshot"); continue; }
    const state = deriveStateV2(f, snap.patterns, row.session);
    for (const dir of ["long", "short"] as Direction[]) {
      const e = eligibleFor(row, dir);
      if (e) obs[dir].push({ bar_time: e.bar_time, t: e.t, success: e.success, state });
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

  // ---- purged walk-forward folds shared by both directions ----------------
  // V3 replaces V2's wall-clock epoch heuristic with the EXPECTED-OPEN venue-minute
  // continuity contract, and reserves an untouched final holdout.
  const continuity = rv === RESEARCH_VERSION_V3
    ? analyseContinuity(outcomes.map((o) => new Date(o.bar_time).getTime()))
    : null;
  const plan: any = rv === RESEARCH_VERSION_V3
    ? buildVenueAwareFolds([obs.long, obs.short], continuity!, folds)
    : buildGapAwareFolds([obs.long, obs.short], folds);
  if (!plan.folds.length) {
    return json({ error: "NO_DEFENSIBLE_FOLDS", fold_plan: plan, continuity }, 422);
  }

  const v3hashes = rv === RESEARCH_VERSION_V3 ? await v3ContractHashes() : null;
  const stateSpecHash = await sha256(stateSpecPayloadV2());
  const candidateSpecHash = rv === RESEARCH_VERSION_V3
    ? await sha256(candidateSpecPayloadV3())
    : await sha256(candidateSpecPayload());
  const definitionHash = rv === RESEARCH_VERSION_V3
    ? await sha256([
      "research_version", RESEARCH_VERSION_V3,
      "state_spec_version", RON_STATE_SPEC_VERSION_V2,
      SYMBOL, TIMEFRAME,
      "quality_version", QUALITY_V,
      "feature_version", CONTRACT.feature_version,
      "label_version", CONTRACT.label_version,
      "event", CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION,
      "horizon_minutes", CALIBRATION_HORIZON_MINUTES,
      "barrier", CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
      "source_as_of", frozenAsOf,
      "source_bar_cutoff", sourceBarCutoff,
      "purge_minutes", PURGE_MINUTES,
      "fold_definition_version", FOLD_DEFINITION_VERSION_V3,
      "continuity_contract_version", CONTINUITY_CONTRACT_VERSION,
      "continuity", [continuity!.venue_calendar_version, continuity!.source_bars,
        continuity!.splitting_defects, continuity!.split_boundaries,
        continuity!.defects.map((d) => [d.start, d.end, d.missing_expected_open_minutes, d.splits_epoch])],
      "fold_plan", [plan.fold_definition_version, plan.initial_train_fraction, plan.holdout_fraction,
        plan.accepted_folds, plan.min_test_obs_per_fold,
        plan.segments.map((s: any) => [s.segment, s.start, s.end, s.n_times]),
        [plan.holdout.used, plan.holdout.test_start, plan.holdout.n_times],
        plan.folds.map((f: any) => [f.fold, f.continuity_segment, f.purge_start, f.test_start,
          f.test_end, f.max_internal_missing_expected_open_minutes])],
      "venue_calendar_hash", v3hashes!.venue_calendar_hash,
      "continuity_contract_hash", v3hashes!.continuity_contract_hash,
      "fold_definition_hash", v3hashes!.fold_definition_hash,
      "promotion_gate_hash", v3hashes!.promotion_gate_hash,
      "state_spec_hash", stateSpecHash,
      "candidate_spec_hash", candidateSpecHash,
      "bucket_evidence_accounting", "latest_floor_fold_train_reference_disjoint_pooled_oos",
    ])
    : await sha256([
      "research_version", RESEARCH_VERSION,
      "state_spec_version", RON_STATE_SPEC_VERSION_V2,
      SYMBOL, TIMEFRAME,
      "quality_version", QUALITY_V,
      "feature_version", CONTRACT.feature_version,
      "label_version", CONTRACT.label_version,
      "event", CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION,
      "horizon_minutes", CALIBRATION_HORIZON_MINUTES,
      "barrier", CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
      "source_as_of", frozenAsOf,
      "source_bar_cutoff", sourceBarCutoff,
      "purge_minutes", PURGE_MINUTES,
      "fold_definition_version", FOLD_DEFINITION_VERSION,
      "coverage_epoch_gap_hours", COVERAGE_EPOCH_GAP_HOURS,
      "fold_plan", [plan.fold_definition_version, plan.initial_train_fraction, plan.accepted_folds,
        plan.min_test_obs_per_fold,
        plan.epochs.map((e: any) => [e.epoch, e.start, e.end, e.n_times, e.max_internal_gap_minutes]),
        plan.folds.map((f: any) => [f.fold, f.coverage_epoch, f.purge_start, f.test_start, f.test_end,
          f.max_internal_gap_minutes])],
      "state_spec_hash", stateSpecHash,
      "candidate_spec_hash", candidateSpecHash,
      "bucket_evidence_accounting", "latest_floor_fold_train_reference_disjoint_pooled_oos",
    ]);

  // ---- evaluate: baseline first, then every predeclared candidate ---------
  const specs = buildCandidateSet();
  const results: CandidateResult[] = [];
  const evidence: Record<string, unknown> = {};

  for (const dir of ["long", "short"] as Direction[]) {
    const base = await evaluateCandidate(BASELINE_CANDIDATE, dir, obs[dir], plan, null, definitionHash);
    const baselineFolds: FoldResult[] = base.folds;
    results.push(base.result);
    const evaluated: { result: CandidateResult; folds: FoldResult[] }[] = [];
    for (const spec of specs) {
      if (spec.kind === "baseline_hierarchy") continue;
      const r = await evaluateCandidate(spec, dir, obs[dir], plan, baselineFolds, definitionHash);
      results.push(r.result);
      evaluated.push(r);
    }
    evidence[dir] = topBucketsV2(evaluated);
  }

  // ---- untouched final holdout: evaluated ONLY after every gate decision ---
  const hf = rv === RESEARCH_VERSION_V3 ? holdoutFold(plan) : null;
  const holdoutReport: Record<string, unknown> = hf
    ? { used: true, definition: plan.holdout, note: "evaluated after candidate selection; never used for gating" }
    : { used: false, reason: rv === RESEARCH_VERSION_V3 ? plan.holdout?.reason ?? null : "not applicable" };
  if (hf) {
    for (const dir of ["long", "short"] as Direction[]) {
      const base = evaluateCandidateFold(BASELINE_CANDIDATE, obs[dir], hf);
      const rows = specs.filter((s) => s.kind !== "baseline_hierarchy").map((s) => {
        const f = evaluateCandidateFold(s, obs[dir], hf);
        return {
          candidate: s.name, n_test: f.n_test, brier: f.brier, ece: f.ece, log_loss: f.log_loss,
          non_global_coverage: f.non_global_coverage,
          brier_delta_vs_baseline: f.brier != null && base.brier != null ? Number((base.brier - f.brier).toFixed(6)) : null,
        };
      });
      holdoutReport[dir] = {
        n_test: base.n_test, n_train: base.n_train, n_purged: base.n_purged,
        observed_test_rate: base.observed_test_rate,
        baseline: { brier: base.brier, naive_brier: base.naive_brier, ece: base.ece, log_loss: base.log_loss },
        candidates: rows,
      };
    }
  }

  const resultsDigest = await researchDigest(definitionHash, results);
  const runHash = await sha256([
    definitionHash,
    outcomes.length, obs.long.length, obs.short.length,
    canonicalMin, canonicalMax,
    Object.keys(exclusion).sort().map((k) => [k, exclusion[k]]),
    plan, resultsDigest, evidence,
  ]);

  let runId: string | null = null;
  let writes = 0;
  if (persist) {
    const { data: run, error: runErr } = await supabase
      .from("ron_research_runs")
      .upsert({
        research_version: RESEARCH_VERSION,
        symbol: SYMBOL, timeframe: TIMEFRAME,
        quality_version: QUALITY_V,
        feature_version: CONTRACT.feature_version,
        label_version: CONTRACT.label_version,
        event_definition: CALIBRATION_EVENT,
        event_version: CALIBRATION_EVENT_VERSION,
        horizon_minutes: CALIBRATION_HORIZON_MINUTES,
        barrier_atr_mult: CALIBRATION_BARRIER_ATR_MULT,
        barrier_version: CALIBRATION_BARRIER_VERSION,
        source_as_of: frozenAsOf,
        source_bar_cutoff: sourceBarCutoff,
        canonical_source_min_bar_time: canonicalMin,
        canonical_source_max_bar_time: canonicalMax,
        canonical_rows: outcomes.length,
        eligible_long: obs.long.length,
        eligible_short: obs.short.length,
        exclusion_breakdown: exclusion,
        purge_minutes: PURGE_MINUTES,
        fold_plan: plan,
        state_spec_hash: stateSpecHash,
        candidate_spec_hash: candidateSpecHash,
        definition_hash: definitionHash,
        run_hash: runHash,
        results_digest: resultsDigest,
        bucket_evidence: evidence,
        status: "complete",
      }, { onConflict: "definition_hash" })
      .select("id").single();
    if (runErr) return json({ error: runErr.message }, 500);
    runId = (run as any).id;
    writes++;

    for (let i = 0; i < results.length; i += 50) {
      const chunk = results.slice(i, i + 50).map((r) => ({
        run_id: runId,
        research_version: RESEARCH_VERSION,
        direction: r.direction,
        candidate: r.candidate,
        candidate_kind: r.kind,
        variables: r.variables,
        sample_floor: r.sample_floor,
        folds: r.folds,
        aggregate: r.aggregate,
        vs_baseline: r.vs_baseline,
        bucket_stability: r.bucket_stability,
        promising_for_2d2: r.promising_for_2D2,
        gate_reasons: r.gate_reasons,
        result_hash: r.result_hash,
      }));
      const { error } = await supabase
        .from("ron_research_candidate_results")
        .upsert(chunk, { onConflict: "run_id,direction,candidate" });
      if (error) return json({ error: error.message }, 500);
      writes += chunk.length;
    }
  }

  const promising = results.filter((r) => r.promising_for_2D2)
    .map((r) => ({ direction: r.direction, candidate: r.candidate, aggregate_brier_delta: r.vs_baseline?.aggregate_brier_delta ?? null }));

  return json({
    research_version: RESEARCH_VERSION,
    research_only: true,
    probability_surfaced: false,
    persisted: persist,
    writes,
    run_id: runId,
    identity: {
      symbol: SYMBOL, timeframe: TIMEFRAME,
      quality_version: QUALITY_V,
      feature_version: CONTRACT.feature_version,
      label_version: CONTRACT.label_version,
      source_as_of: frozenAsOf, source_bar_cutoff: sourceBarCutoff,
      canonical_source_min_bar_time: canonicalMin,
      canonical_source_max_bar_time: canonicalMax,
      canonical_rows: outcomes.length,
      eligible_long: obs.long.length, eligible_short: obs.short.length,
    },
    state_spec_hash: stateSpecHash,
    candidate_spec_hash: candidateSpecHash,
    definition_hash: definitionHash,
    run_hash: runHash,
    results_digest: resultsDigest,
    exclusion_breakdown: exclusion,
    fold_plan: plan,
    promotion_gate: PROMOTION_GATE,
    baseline: results.filter((r) => r.kind === "baseline_hierarchy"),
    candidates: results.filter((r) => r.kind !== "baseline_hierarchy"),
    promising_for_2D2: promising,
    bucket_evidence: evidence,
    product_verdict: "STILL BUILDING",
  });
});