/**
 * RON Phase 2D.1f-a — Research V4 methodology contract (CODE ONLY, NOT EXECUTED).
 *
 * Research V3 produced a valid NEGATIVE result (0 promotable candidates), but its
 * promotion FRAMEWORK was not accepted as promotion-capable: the preregistered task
 * required an ECE non-deterioration rule, an explicit support-floor requirement for
 * "non-global" coverage, and untouched-holdout confirmation, none of which V3 enforced.
 * V4 fixes the framework for FUTURE runs. It never mutates or reinterprets V3.
 *
 * V4 changes exactly three methodological things versus V3:
 *   1. CONTINUITY SOURCE is explicit: the ordered `ron_market_snapshots` feature_version=6
 *      grid (quality-v5 eligible by construction), bounded by source_bar_cutoff — never
 *      inferred from label completeness. Outcomes come from label_version=7.
 *   2. CONTINUITY BOUNDARY MAPPING is non-exact: a splitting defect partitions the
 *      eligible timeline at the FIRST eligible timestamp at-or-after the defect end.
 *   3. PROMOTION is a two-stage, fully predeclared and hashed gate: every pre-holdout
 *      threshold (Brier / fold wins / worst fold / supported non-global coverage / ECE)
 *      must pass BEFORE the untouched holdout is consulted, and the holdout is a final
 *      confirmation gate only — never a selection, ranking or tuning input.
 *
 * Candidate families, State Spec V2 comparator semantics, the purge width and every V2
 * numeric threshold are preserved EXACTLY. No new features or pairs.
 */
import { round6, sha256 } from "./ron-calibration.ts";
import { RON_STATE_SPEC_VERSION_V2, stateSpecPayloadV2 } from "./ron-state-spec.ts";
import {
  BASELINE_CANDIDATE, BUCKET_EVIDENCE, FLOOR_PAIR, FLOOR_SINGLE, INITIAL_TRAIN_FRACTION,
  LOGLOSS_CLIP, MIN_TEST_OBS_PER_FOLD, PAIR_CANDIDATES, PROMOTION_GATE, PURGE_MINUTES,
  REQUESTED_FOLDS, SINGLE_CANDIDATES,
  type ResearchObs,
} from "./ron-research.ts";
import {
  DEFECT_MIN_EXPECTED_OPEN_MINUTES, HOLDOUT_FRACTION, SOURCE_BAR_MINUTES,
  SPLIT_MIN_EXPECTED_OPEN_MINUTES, buildVenueAwareFolds,
  type ContinuityDefect, type ContinuityEpoch, type ContinuityReport, type VenueAwareFoldPlan,
} from "./ron-research-v3.ts";
import {
  RON_VENUE_CALENDAR_VERSION_V2, closedReasonHistogramV2, expectedOpenMinutesV2,
  venueCalendarPayloadV2,
} from "./ron-venue-calendar-v2.ts";

export const RESEARCH_VERSION_V4 = 4;
export const FOLD_DEFINITION_VERSION_V4 = 4;
export const CONTINUITY_CONTRACT_VERSION_V4 = 2;

/**
 * The ONLY admissible continuity source for V4. Hashed into run identity.
 *
 * Phase 2D.1g INFRASTRUCTURE-ONLY binding revision: V4 has never been executed (zero
 * persisted runs / results), so its prospective lineage binding is retargeted from the
 * frozen qv4/fv5/lv6 lineage to the accepted qv5/fv6/lv7 lineage that incorporates the
 * recovered genuine broker-native 15m history. No candidate family, State Spec V2
 * semantic, promotion threshold, ECE rule, support floor, holdout stage, boundary
 * mapping or venue-calendar semantic is changed by this revision.
 */
export const CONTINUITY_SOURCE_IDENTITY = "quality_v5_eligible_feature_v6_grid";
export const CONTINUITY_SOURCE_SPEC = {
  identity: CONTINUITY_SOURCE_IDENTITY,
  table: "ron_market_snapshots",
  feature_version: 6,
  quality_version: 5,
  label_version: 7,
  quality_eligibility: "quarantined_bar_times_excluded_by_construction",
  ordering: "bar_time_ascending_distinct",
  bounded_by: "source_bar_cutoff_inclusive",
  derived_from_labels: false,
} as const;

/** How splitting defects partition the eligible anchor timeline (V3 defect fix). */
export const CONTINUITY_BOUNDARY_MAPPING = "first_eligible_timestamp_at_or_after_defect_end";

const MS_MIN = 60_000;

export function continuityContractPayloadV4() {
  return [
    "continuity_contract_version", CONTINUITY_CONTRACT_VERSION_V4,
    "measure", "expected_open_venue_minutes_absent_from_accepted_source",
    "defect_min_expected_open_minutes", DEFECT_MIN_EXPECTED_OPEN_MINUTES,
    "split_min_expected_open_minutes", SPLIT_MIN_EXPECTED_OPEN_MINUTES,
    "source_bar_minutes", SOURCE_BAR_MINUTES,
    "wall_clock_threshold_used", false,
    "expected_closed_never_counts_as_defect", true,
    "continuity_source", Object.keys(CONTINUITY_SOURCE_SPEC).sort()
      .map((k) => [k, (CONTINUITY_SOURCE_SPEC as Record<string, unknown>)[k]]),
    "boundary_mapping", CONTINUITY_BOUNDARY_MAPPING,
    venueCalendarPayloadV2(),
  ];
}

/* ----------------------------------------------------------- V4 continuity */

/**
 * Scan the ordered ACCEPTED FEATURE-GRID timestamps (feature_version=6, quality-v5
 * eligible, <= source_bar_cutoff) and report every genuine expected-open coverage defect.
 * Passing label-derived timestamps here is a contract violation, so callers must supply
 * the snapshot grid explicitly.
 */
export function analyseContinuityV4(featureGridTimes: number[]): ContinuityReport {
  const times = [...new Set(featureGridTimes)].sort((a, b) => a - b);
  const defects: ContinuityDefect[] = [];
  for (let i = 1; i < times.length; i++) {
    const from = times[i - 1] + SOURCE_BAR_MINUTES * MS_MIN;
    const to = times[i];
    if (to <= from) continue;
    const missing = expectedOpenMinutesV2(from, to);
    if (missing < DEFECT_MIN_EXPECTED_OPEN_MINUTES) continue;
    defects.push({
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
      wall_minutes: round6((to - from) / MS_MIN),
      missing_expected_open_minutes: missing,
      splits_epoch: missing >= SPLIT_MIN_EXPECTED_OPEN_MINUTES,
      expected_closed_reasons: closedReasonHistogramV2(from, to),
    });
  }

  const splitAt = defects.filter((d) => d.splits_epoch).map((d) => new Date(d.end).getTime());
  const epochs: ContinuityEpoch[] = [];
  let lo = 0;
  const push = (a: number, b: number) => {
    let worst = 0;
    for (let i = a + 1; i < b; i++) {
      const from = times[i - 1] + SOURCE_BAR_MINUTES * MS_MIN;
      if (times[i] > from) worst = Math.max(worst, expectedOpenMinutesV2(from, times[i]));
    }
    epochs.push({
      epoch: epochs.length + 1,
      start: new Date(times[a]).toISOString(),
      end: new Date(times[b - 1]).toISOString(),
      n_bars: b - a,
      max_internal_missing_expected_open_minutes: worst,
    });
  };
  for (let i = 1; i < times.length; i++) if (splitAt.includes(times[i])) { push(lo, i); lo = i; }
  if (times.length) push(lo, times.length);

  return {
    continuity_contract_version: CONTINUITY_CONTRACT_VERSION_V4,
    venue_calendar_version: RON_VENUE_CALENDAR_VERSION_V2,
    source_bars: times.length,
    defects,
    splitting_defects: splitAt.length,
    epochs,
    split_boundaries: splitAt.sort((a, b) => a - b).map((t) => new Date(t).toISOString()),
  };
}

/**
 * Map each splitting-defect end onto the FIRST eligible anchor at-or-after it.
 * V3 required exact timestamp equality, so a defect ending on a timestamp that is not
 * itself an eligible anchor silently failed to split the timeline.
 */
export function mapSplitBoundaries(times: number[], boundaries: string[]): string[] {
  const sorted = [...times].sort((a, b) => a - b);
  const out: number[] = [];
  for (const b of boundaries) {
    const end = new Date(b).getTime();
    const hit = sorted.find((t) => t >= end);
    if (hit != null && !out.includes(hit)) out.push(hit);
  }
  return out.sort((a, b) => a - b).map((t) => new Date(t).toISOString());
}

export interface VenueAwareFoldPlanV4 extends VenueAwareFoldPlan {
  continuity_boundary_mapping: string;
  mapped_split_boundaries: string[];
}

/** V3 fold construction with the corrected, non-exact continuity boundary mapping. */
export function buildVenueAwareFoldsV4(
  perDirection: ResearchObs[][],
  continuity: ContinuityReport,
  requested = REQUESTED_FOLDS,
): VenueAwareFoldPlanV4 {
  const times = [...new Set(perDirection.flat().map((o) => o.t))].sort((a, b) => a - b);
  const mapped_split_boundaries = mapSplitBoundaries(times, continuity.split_boundaries);
  const plan = buildVenueAwareFolds(perDirection, { ...continuity, split_boundaries: mapped_split_boundaries }, requested);
  return {
    ...plan,
    fold_definition_version: FOLD_DEFINITION_VERSION_V4,
    continuity_contract_version: CONTINUITY_CONTRACT_VERSION_V4,
    venue_calendar_version: RON_VENUE_CALENDAR_VERSION_V2,
    continuity_boundary_mapping: CONTINUITY_BOUNDARY_MAPPING,
    mapped_split_boundaries,
  };
}

/* ------------------------------------------------------- V4 promotion gate */

/**
 * PREDECLARED and hashed BEFORE any V4 run. Every numeric Brier/fold/coverage threshold is
 * byte-identical to the accepted V2/V3 gate. The additions are fail-closed rules, never
 * data-tuned tolerances:
 *  - ECE may not deteriorate at all versus the fair baseline (tolerance 0, chosen
 *    conservatively BEFORE any V4 result and WITHOUT reference to V3 magnitudes);
 *  - "non-global" predictions only count when the bucket met its predeclared support floor;
 *  - untouched holdout confirmation is REQUIRED; infeasible holdout fails promotion closed.
 */
export const PROMOTION_GATE_V4 = {
  gate_version: 2,
  frozen_before_run: true,
  numeric_thresholds_identical_to_gate_version: 1,
  min_aggregate_brier_improvement_vs_baseline: PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline,
  min_fold_win_fraction: PROMOTION_GATE.min_fold_win_fraction,
  max_fold_degradation_vs_baseline: PROMOTION_GATE.max_fold_degradation_vs_baseline,
  min_non_global_coverage: PROMOTION_GATE.min_non_global_coverage,
  non_global_requires_support_floor: true,
  max_aggregate_ece_excess_vs_baseline: 0,
  ece_rule: "candidate_aggregate_oos_ece <= baseline_aggregate_oos_ece",
  holdout_required: true,
  holdout_role: "final_confirmation_only_never_selection_or_tuning",
  holdout_min_brier_delta_vs_baseline: 0,
  holdout_ece_rule: "candidate_holdout_ece <= baseline_holdout_ece",
  holdout_infeasible_behaviour: "fail_closed",
  holdout_fraction: HOLDOUT_FRACTION,
} as const;

export function promotionGatePayloadV4() {
  return [
    "promotion_gate_version", PROMOTION_GATE_V4.gate_version,
    "frozen_before_run", true,
    "research_version", RESEARCH_VERSION_V4,
    "two_stage", ["pre_holdout_gate_pass", "holdout_evaluation", "final_promotion_pass"],
    ...Object.keys(PROMOTION_GATE_V4).sort()
      .map((k) => [k, (PROMOTION_GATE_V4 as Record<string, unknown>)[k]]).flat(),
  ];
}

export interface GateAggregate {
  brier: number | null;
  ece: number | null;
  /** Coverage counting ONLY predictions whose bucket met its predeclared support floor. */
  supported_non_global_coverage: number | null;
}

export interface GateVsBaseline {
  aggregate_brier_delta: number | null;
  fold_deltas: (number | null)[];
  folds_better: number;
  worst_fold_degradation: number | null;
}

export interface GateStage {
  pass: boolean;
  reasons: string[];
  checks: Record<string, boolean>;
}

/** STAGE 1 — everything decidable without ever touching the untouched holdout. */
export function evaluatePreHoldoutGateV4(
  agg: GateAggregate,
  baselineAgg: GateAggregate,
  vs: GateVsBaseline,
  nFolds: number,
): GateStage {
  const reasons: string[] = [];
  const checks: Record<string, boolean> = {};

  checks.aggregate_brier_improvement =
    (vs.aggregate_brier_delta ?? -1) >= PROMOTION_GATE_V4.min_aggregate_brier_improvement_vs_baseline;
  checks.fold_win_fraction = nFolds > 0 && vs.folds_better / nFolds >= PROMOTION_GATE_V4.min_fold_win_fraction;
  checks.worst_fold_degradation =
    (vs.worst_fold_degradation ?? -1) >= -PROMOTION_GATE_V4.max_fold_degradation_vs_baseline;
  checks.supported_non_global_coverage =
    (agg.supported_non_global_coverage ?? 0) >= PROMOTION_GATE_V4.min_non_global_coverage;
  checks.ece_non_deterioration =
    agg.ece != null && baselineAgg.ece != null && agg.ece <= baselineAgg.ece;

  if (!checks.aggregate_brier_improvement) {
    reasons.push(`aggregate_brier_delta ${vs.aggregate_brier_delta} < ${PROMOTION_GATE_V4.min_aggregate_brier_improvement_vs_baseline}`);
  }
  if (!checks.fold_win_fraction) {
    reasons.push(`fold_win_fraction ${nFolds ? round6(vs.folds_better / nFolds) : null} < ${PROMOTION_GATE_V4.min_fold_win_fraction}`);
  }
  if (!checks.worst_fold_degradation) {
    reasons.push(`worst_fold_degradation ${vs.worst_fold_degradation} beyond -${PROMOTION_GATE_V4.max_fold_degradation_vs_baseline}`);
  }
  if (!checks.supported_non_global_coverage) {
    reasons.push(`supported_non_global_coverage ${agg.supported_non_global_coverage} < ${PROMOTION_GATE_V4.min_non_global_coverage} (support floor required)`);
  }
  if (!checks.ece_non_deterioration) {
    reasons.push(`aggregate_ece ${agg.ece} > baseline_aggregate_ece ${baselineAgg.ece} (fail-closed, tolerance 0)`);
  }

  return { pass: Object.values(checks).every(Boolean), reasons, checks };
}

export interface HoldoutObservation {
  feasible: boolean;
  reason?: string | null;
  candidate?: { brier: number | null; ece: number | null };
  baseline?: { brier: number | null; ece: number | null };
}

/** STAGE 2 — untouched-holdout CONFIRMATION. Never used to select, rank or tune. */
export function evaluateHoldoutGateV4(h: HoldoutObservation): GateStage {
  const reasons: string[] = [];
  const checks: Record<string, boolean> = {};
  if (!h.feasible) {
    return {
      pass: false,
      reasons: [`holdout_infeasible: ${h.reason ?? "unspecified"} (fail-closed, promotion denied)`],
      checks: { holdout_feasible: false },
    };
  }
  checks.holdout_feasible = true;
  const cb = h.candidate?.brier ?? null, bb = h.baseline?.brier ?? null;
  const ce = h.candidate?.ece ?? null, be = h.baseline?.ece ?? null;
  const delta = cb != null && bb != null ? round6(bb - cb) : null;

  checks.holdout_brier_sign_confirmed = delta != null && delta >= PROMOTION_GATE_V4.holdout_min_brier_delta_vs_baseline;
  checks.holdout_ece_non_deterioration = ce != null && be != null && ce <= be;

  if (!checks.holdout_brier_sign_confirmed) {
    reasons.push(`holdout_brier_delta ${delta} < ${PROMOTION_GATE_V4.holdout_min_brier_delta_vs_baseline}`);
  }
  if (!checks.holdout_ece_non_deterioration) reasons.push(`holdout_ece ${ce} > baseline_holdout_ece ${be}`);

  return { pass: Object.values(checks).every(Boolean), reasons, checks };
}

export interface TwoStageGateResult {
  gate_version: number;
  pre_holdout_gate_pass: boolean;
  pre_holdout_reasons: string[];
  pre_holdout_checks: Record<string, boolean>;
  holdout_evaluated: boolean;
  holdout_gate_pass: boolean | null;
  holdout_reasons: string[];
  holdout_checks: Record<string, boolean> | null;
  final_promotion_pass: boolean;
  final_reasons: string[];
}

/**
 * Two-stage auditable promotion decision. The holdout is evaluated ONLY when stage 1 has
 * already passed, so it can never influence candidate selection or ranking.
 */
export function finalPromotionV4(
  pre: GateStage,
  holdout: () => HoldoutObservation,
): TwoStageGateResult {
  if (!pre.pass) {
    return {
      gate_version: PROMOTION_GATE_V4.gate_version,
      pre_holdout_gate_pass: false,
      pre_holdout_reasons: pre.reasons,
      pre_holdout_checks: pre.checks,
      holdout_evaluated: false,
      holdout_gate_pass: null,
      holdout_reasons: [],
      holdout_checks: null,
      final_promotion_pass: false,
      final_reasons: ["pre_holdout_gate_failed", ...pre.reasons],
    };
  }
  const h = evaluateHoldoutGateV4(holdout());
  return {
    gate_version: PROMOTION_GATE_V4.gate_version,
    pre_holdout_gate_pass: true,
    pre_holdout_reasons: pre.reasons,
    pre_holdout_checks: pre.checks,
    holdout_evaluated: true,
    holdout_gate_pass: h.pass,
    holdout_reasons: h.reasons,
    holdout_checks: h.checks,
    final_promotion_pass: h.pass,
    final_reasons: h.pass ? [] : ["holdout_confirmation_failed", ...h.reasons],
  };
}

/* -------------------------------------------------------------- V4 payloads */

/** Candidate families REUSED from V2/V3 unchanged, so V4 stays directly comparable. */
export function candidateSpecPayloadV4() {
  return [
    "research_version", RESEARCH_VERSION_V4,
    "state_spec_version", RON_STATE_SPEC_VERSION_V2,
    "reused_from_research_version", 2,
    "singles", [...SINGLE_CANDIDATES],
    "pairs", PAIR_CANDIDATES.map((p) => [...p]),
    "baseline", [BASELINE_CANDIDATE.name, BASELINE_CANDIDATE.variables],
    "floor_single", FLOOR_SINGLE,
    "floor_pair", FLOOR_PAIR,
    "purge_minutes", PURGE_MINUTES,
    "initial_train_fraction", INITIAL_TRAIN_FRACTION,
    "holdout_fraction", HOLDOUT_FRACTION,
    "min_test_obs_per_fold", MIN_TEST_OBS_PER_FOLD,
    "fold_definition_version", FOLD_DEFINITION_VERSION_V4,
    "logloss_clip", [LOGLOSS_CLIP.lo, LOGLOSS_CLIP.hi],
    "bucket_evidence", Object.keys(BUCKET_EVIDENCE).sort()
      .map((k) => [k, (BUCKET_EVIDENCE as Record<string, unknown>)[k]]),
    stateSpecPayloadV2(),
  ];
}

export async function v4ContractHashes() {
  const [
    continuity_contract_hash, continuity_source_hash, fold_definition_hash,
    promotion_gate_hash, state_spec_hash, candidate_spec_hash, venue_calendar_hash,
  ] = await Promise.all([
    sha256(continuityContractPayloadV4()),
    sha256(["continuity_source_identity", CONTINUITY_SOURCE_IDENTITY,
      ...Object.keys(CONTINUITY_SOURCE_SPEC).sort()
        .map((k) => [k, (CONTINUITY_SOURCE_SPEC as Record<string, unknown>)[k]]).flat()]),
    sha256(["fold_definition_version", FOLD_DEFINITION_VERSION_V4, "purge_minutes", PURGE_MINUTES,
      "initial_train_fraction", INITIAL_TRAIN_FRACTION, "holdout_fraction", HOLDOUT_FRACTION,
      "min_test_obs_per_fold", MIN_TEST_OBS_PER_FOLD, "requested_folds", REQUESTED_FOLDS,
      "contiguity", "expected_open_venue_time", "split_rule", SPLIT_MIN_EXPECTED_OPEN_MINUTES,
      "boundary_mapping", CONTINUITY_BOUNDARY_MAPPING]),
    sha256(promotionGatePayloadV4()),
    sha256(stateSpecPayloadV2()),
    sha256(candidateSpecPayloadV4()),
    sha256(venueCalendarPayloadV2()),
  ]);
  return {
    continuity_contract_hash, continuity_source_hash, fold_definition_hash,
    promotion_gate_hash, state_spec_hash, candidate_spec_hash, venue_calendar_hash,
  };
}
