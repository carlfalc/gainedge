/**
 * RON Phase 2D.1f — Research V3 (RESEARCH ONLY).
 *
 * V3 changes EXACTLY ONE methodological thing versus the accepted V2: coverage continuity
 * is now VENUE-AWARE. V2 split coverage epochs whenever adjacent bars were more than 72
 * wall-clock hours apart, which wrongly split the genuine Easter 2026 closure (~73h02m).
 * V3 declares a `coverage_continuity_contract` in EXPECTED-OPEN venue minutes: genuine
 * closures (weekend, daily break, holidays, early closes) can never create a defect, and
 * only genuinely absent expected-open minutes can.
 *
 * Everything else is deliberately reused byte-for-byte from V2 for comparability:
 * State Spec V2 comparator semantics, the frozen candidate families, the fair
 * `baseline_v4_hierarchy` challenger, the 60m purge and the promotion gate. No new
 * candidates were added because the recovered sample is larger — that would be fishing.
 */
import { round6, sha256 } from "./ron-calibration.ts";
import { RON_STATE_SPEC_VERSION_V2, stateSpecPayloadV2 } from "./ron-state-spec.ts";
import {
  BUCKET_EVIDENCE, INITIAL_TRAIN_FRACTION, LOGLOSS_CLIP, MIN_TEST_OBS_PER_FOLD,
  PAIR_CANDIDATES, PROMOTION_GATE, PURGE_MINUTES, REQUESTED_FOLDS, SINGLE_CANDIDATES,
  FLOOR_PAIR, FLOOR_SINGLE, BASELINE_CANDIDATE,
  type PurgedFold, type ResearchObs,
} from "./ron-research.ts";
import {
  RON_VENUE_CALENDAR_VERSION, closedReasonHistogram, expectedOpenMinutes, venueCalendarPayload,
} from "./ron-venue-calendar.ts";

export const RESEARCH_VERSION_V3 = 3;
export const FOLD_DEFINITION_VERSION_V3 = 3;
export const CONTINUITY_CONTRACT_VERSION = 1;

/**
 * PRE-SPECIFIED continuity rule. A run of consecutive EXPECTED-OPEN minutes with no
 * accepted source bar is a coverage defect at or above this size, and a defect at or
 * above `SPLIT_MIN_EXPECTED_OPEN_MINUTES` ends the coverage epoch. Both are declared
 * before results and hashed into run identity.
 */
export const DEFECT_MIN_EXPECTED_OPEN_MINUTES = 60;
export const SPLIT_MIN_EXPECTED_OPEN_MINUTES = 240;
/** Canonical research grid width; a bar at t covers [t, t+SOURCE_BAR_MINUTES). */
export const SOURCE_BAR_MINUTES = 15;
/** Tail fraction of distinct eligible anchors reserved as an untouched final holdout. */
export const HOLDOUT_FRACTION = 0.15;

export function continuityContractPayload() {
  return [
    "continuity_contract_version", CONTINUITY_CONTRACT_VERSION,
    "measure", "expected_open_venue_minutes_absent_from_accepted_source",
    "defect_min_expected_open_minutes", DEFECT_MIN_EXPECTED_OPEN_MINUTES,
    "split_min_expected_open_minutes", SPLIT_MIN_EXPECTED_OPEN_MINUTES,
    "source_bar_minutes", SOURCE_BAR_MINUTES,
    "wall_clock_threshold_used", false,
    "expected_closed_never_counts_as_defect", true,
    venueCalendarPayload(),
  ];
}

/* ------------------------------------------------------- continuity defects */

const MS_MIN = 60_000;

export interface ContinuityDefect {
  start: string;
  end: string;
  wall_minutes: number;
  missing_expected_open_minutes: number;
  splits_epoch: boolean;
  expected_closed_reasons: Record<string, number>;
}

export interface ContinuityEpoch {
  epoch: number;
  start: string;
  end: string;
  n_bars: number;
  max_internal_missing_expected_open_minutes: number;
}

export interface ContinuityReport {
  continuity_contract_version: number;
  venue_calendar_version: number;
  source_bars: number;
  defects: ContinuityDefect[];
  splitting_defects: number;
  epochs: ContinuityEpoch[];
  /** Boundary instants (ISO) at which the eligible-anchor timeline is split. */
  split_boundaries: string[];
}

/**
 * Scan the ordered accepted SOURCE bar times (not the eligibility-filtered anchors, so
 * anchor ineligibility can never masquerade as a data defect) and report every genuine
 * coverage defect in expected-open venue minutes.
 */
export function analyseContinuity(sourceTimes: number[]): ContinuityReport {
  const defects: ContinuityDefect[] = [];
  for (let i = 1; i < sourceTimes.length; i++) {
    const from = sourceTimes[i - 1] + SOURCE_BAR_MINUTES * MS_MIN;
    const to = sourceTimes[i];
    if (to <= from) continue;
    const missing = expectedOpenMinutes(from, to);
    if (missing < DEFECT_MIN_EXPECTED_OPEN_MINUTES) continue;
    defects.push({
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
      wall_minutes: round6((to - from) / MS_MIN),
      missing_expected_open_minutes: missing,
      splits_epoch: missing >= SPLIT_MIN_EXPECTED_OPEN_MINUTES,
      expected_closed_reasons: closedReasonHistogram(from, to),
    });
  }

  const splitAt = defects.filter((d) => d.splits_epoch).map((d) => new Date(d.end).getTime());
  const epochs: ContinuityEpoch[] = [];
  let lo = 0;
  const push = (a: number, b: number) => {
    let worst = 0;
    for (let i = a + 1; i < b; i++) {
      const from = sourceTimes[i - 1] + SOURCE_BAR_MINUTES * MS_MIN;
      if (sourceTimes[i] > from) worst = Math.max(worst, expectedOpenMinutes(from, sourceTimes[i]));
    }
    epochs.push({
      epoch: epochs.length + 1,
      start: new Date(sourceTimes[a]).toISOString(),
      end: new Date(sourceTimes[b - 1]).toISOString(),
      n_bars: b - a,
      max_internal_missing_expected_open_minutes: worst,
    });
  };
  for (let i = 1; i < sourceTimes.length; i++) {
    if (splitAt.includes(sourceTimes[i])) { push(lo, i); lo = i; }
  }
  if (sourceTimes.length) push(lo, sourceTimes.length);

  return {
    continuity_contract_version: CONTINUITY_CONTRACT_VERSION,
    venue_calendar_version: RON_VENUE_CALENDAR_VERSION,
    source_bars: sourceTimes.length,
    defects,
    splitting_defects: splitAt.length,
    epochs,
    split_boundaries: splitAt.sort((a, b) => a - b).map((t) => new Date(t).toISOString()),
  };
}

/* ------------------------------------------------------------- V3 fold plan */

export interface VenueAwareFold extends PurgedFold {
  continuity_segment: number;
  /** Largest genuine expected-open coverage defect INSIDE the test block. */
  max_internal_missing_expected_open_minutes: number;
}

export interface HoldoutSpec {
  used: boolean;
  start: string | null;
  test_start: string | null;
  purge_start: string | null;
  n_times: number;
  reason: string | null;
}

export interface VenueAwareFoldPlan {
  fold_definition_version: number;
  continuity_contract_version: number;
  venue_calendar_version: number;
  purge_minutes: number;
  initial_train_fraction: number;
  holdout_fraction: number;
  requested_folds: number;
  accepted_folds: number;
  min_test_obs_per_fold: number;
  distinct_eligible_times: number;
  eligible_times_excluding_holdout: number;
  segments: { segment: number; start: string; end: string; n_times: number }[];
  reduction_reason: string | null;
  fallback_used: boolean;
  holdout: HoldoutSpec;
  folds: VenueAwareFold[];
}

/** D'Hondt allocation of `total` folds across segments, capped by segment capacity. */
function allocate(sizes: number[], caps: number[], total: number): number[] {
  const assigned = sizes.map(() => 0);
  for (let k = 0; k < total; k++) {
    let best = -1, bestQ = -1;
    for (let i = 0; i < sizes.length; i++) {
      if (assigned[i] >= caps[i]) continue;
      const q = sizes[i] / (assigned[i] + 1);
      if (q > bestQ) { bestQ = q; best = i; }
    }
    if (best < 0) break;
    assigned[best]++;
  }
  return assigned;
}

function maxInternalDefect(times: number[], lo: number, hi: number): number {
  const inside = times.filter((t) => t >= lo && t < hi);
  let worst = 0;
  for (let i = 1; i < inside.length; i++) {
    const from = inside[i - 1] + SOURCE_BAR_MINUTES * MS_MIN;
    if (inside[i] > from) worst = Math.max(worst, expectedOpenMinutes(from, inside[i]));
  }
  return worst;
}

/**
 * Deterministic purged expanding-window folds that are contiguous in EXPECTED-OPEN venue
 * time. Test blocks never bridge a splitting coverage defect, never enter the reserved
 * final holdout, and the fold COUNT (never the observation floor) is what gets reduced if
 * the continuity structure cannot support the requested number of folds.
 */
export function buildVenueAwareFolds(
  perDirection: ResearchObs[][],
  continuity: ContinuityReport,
  requested = REQUESTED_FOLDS,
): VenueAwareFoldPlan {
  const times = [...new Set(perDirection.flat().map((o) => o.t))].sort((a, b) => a - b);
  const boundaries = continuity.split_boundaries.map((b) => new Date(b).getTime());

  const holdoutIdx = times.length
    ? Math.min(times.length - 1, Math.max(1, times.length - Math.floor(times.length * HOLDOUT_FRACTION)))
    : 0;
  const holdoutViable = times.length - holdoutIdx >= MIN_TEST_OBS_PER_FOLD &&
    perDirection.every((obs) => obs.filter((o) => o.t >= times[holdoutIdx]).length >= MIN_TEST_OBS_PER_FOLD);
  const cutIdx = holdoutViable ? holdoutIdx : times.length;

  const holdout: HoldoutSpec = holdoutViable
    ? {
      used: true,
      start: new Date(times[holdoutIdx]).toISOString(),
      test_start: new Date(times[holdoutIdx]).toISOString(),
      purge_start: new Date(times[holdoutIdx] - PURGE_MINUTES * MS_MIN).toISOString(),
      n_times: times.length - holdoutIdx,
      reason: null,
    }
    : {
      used: false, start: null, test_start: null, purge_start: null, n_times: 0,
      reason: `tail holdout of ${HOLDOUT_FRACTION} would hold fewer than ${MIN_TEST_OBS_PER_FOLD} observations per direction`,
    };

  // Continuity segments over the NON-holdout eligible timeline.
  const segIdx: number[] = [0];
  for (let i = 1; i < cutIdx; i++) if (boundaries.includes(times[i])) segIdx.push(i);
  segIdx.push(cutIdx);

  const startIdx = Math.max(1, Math.floor(cutIdx * INITIAL_TRAIN_FRACTION));
  const segments = segIdx.slice(0, -1).map((lo, i) => ({
    segment: i + 1, lo, hi: segIdx[i + 1],
  })).filter((s) => s.hi > s.lo);

  const plan: VenueAwareFoldPlan = {
    fold_definition_version: FOLD_DEFINITION_VERSION_V3,
    continuity_contract_version: CONTINUITY_CONTRACT_VERSION,
    venue_calendar_version: RON_VENUE_CALENDAR_VERSION,
    purge_minutes: PURGE_MINUTES,
    initial_train_fraction: INITIAL_TRAIN_FRACTION,
    holdout_fraction: HOLDOUT_FRACTION,
    requested_folds: requested,
    accepted_folds: 0,
    min_test_obs_per_fold: MIN_TEST_OBS_PER_FOLD,
    distinct_eligible_times: times.length,
    eligible_times_excluding_holdout: cutIdx,
    segments: segments.map((s) => ({
      segment: s.segment,
      start: new Date(times[s.lo]).toISOString(),
      end: new Date(times[s.hi - 1]).toISOString(),
      n_times: s.hi - s.lo,
    })),
    reduction_reason: null,
    fallback_used: false,
    holdout,
    folds: [],
  };
  if (times.length < 2) { plan.reduction_reason = "insufficient eligible anchors"; return plan; }

  const testSegs = segments
    .map((s) => ({ segment: s.segment, lo: Math.max(s.lo, startIdx), hi: s.hi }))
    .filter((s) => s.hi > s.lo);

  const countIn = (lo: number, hi: number) =>
    perDirection.map((obs) => obs.filter((o) => o.t >= lo && o.t < hi).length);

  for (let total = requested; total >= 1; total--) {
    const sizes = testSegs.map((s) => s.hi - s.lo);
    const caps = sizes.map((n) => Math.floor(n / MIN_TEST_OBS_PER_FOLD));
    const alloc = allocate(sizes, caps, total);
    if (alloc.reduce((a, b) => a + b, 0) !== total) continue;

    const folds: VenueAwareFold[] = [];
    let ok = true;
    for (let si = 0; si < testSegs.length && ok; si++) {
      const k = alloc[si];
      if (!k) continue;
      const { lo, hi, segment } = testSegs[si];
      const span = hi - lo;
      for (let c = 0; c < k; c++) {
        const a = lo + Math.floor((span * c) / k);
        const b = lo + Math.floor((span * (c + 1)) / k);
        if (b <= a) { ok = false; break; }
        const testStart = times[a];
        const testEnd = b < hi ? times[b] : times[b - 1] + 1;
        if (countIn(testStart, testEnd).some((n) => n < MIN_TEST_OBS_PER_FOLD)) { ok = false; break; }
        folds.push({
          fold: folds.length + 1,
          continuity_segment: segment,
          train_start: new Date(times[0]).toISOString(),
          train_end: null,
          purge_start: new Date(testStart - PURGE_MINUTES * MS_MIN).toISOString(),
          test_start: new Date(testStart).toISOString(),
          test_end: new Date(testEnd).toISOString(),
          max_internal_missing_expected_open_minutes: maxInternalDefect(times, testStart, testEnd),
        });
      }
    }
    if (!ok || folds.length !== total) continue;
    // No test block may internally bridge a splitting coverage defect.
    if (folds.some((f) => f.max_internal_missing_expected_open_minutes >= SPLIT_MIN_EXPECTED_OPEN_MINUTES)) continue;

    plan.accepted_folds = total;
    plan.folds = folds;
    if (total < requested) {
      plan.fallback_used = true;
      plan.reduction_reason =
        `venue-aware continuity structure reduced ${requested} -> ${total} folds so every within-segment test block holds >= ${MIN_TEST_OBS_PER_FOLD} observations in both directions`;
    }
    return plan;
  }

  plan.fallback_used = true;
  plan.reduction_reason =
    `no venue-aware fold configuration reaches ${MIN_TEST_OBS_PER_FOLD} test observations per within-segment block`;
  return plan;
}

/** The untouched final holdout expressed as an evaluable purged fold. */
export function holdoutFold(plan: VenueAwareFoldPlan): PurgedFold | null {
  if (!plan.holdout.used || !plan.holdout.test_start) return null;
  return {
    fold: 0,
    train_start: plan.folds[0]?.train_start ?? null,
    train_end: null,
    purge_start: plan.holdout.purge_start as string,
    test_start: plan.holdout.test_start,
    test_end: null,
  };
}

/* -------------------------------------------------------------- V3 payloads */

/** Candidate families are REUSED from V2 unchanged, so V3 stays directly comparable. */
export function candidateSpecPayloadV3() {
  return [
    "research_version", RESEARCH_VERSION_V3,
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
    "fold_definition_version", FOLD_DEFINITION_VERSION_V3,
    "logloss_clip", [LOGLOSS_CLIP.lo, LOGLOSS_CLIP.hi],
    "bucket_evidence", Object.keys(BUCKET_EVIDENCE).sort()
      .map((k) => [k, (BUCKET_EVIDENCE as Record<string, unknown>)[k]]),
    stateSpecPayloadV2(),
  ];
}

/** The promotion gate is FROZEN and identical to the accepted V2 gate. */
export function promotionGatePayload() {
  return [
    "promotion_gate_version", PROMOTION_GATE.gate_version,
    "frozen_before_run", true,
    "identical_to_research_version", 2,
    ...Object.keys(PROMOTION_GATE).sort()
      .map((k) => [k, (PROMOTION_GATE as Record<string, unknown>)[k]]).flat(),
  ];
}

export async function v3ContractHashes() {
  const [continuity_contract_hash, fold_definition_hash, promotion_gate_hash, state_spec_hash, candidate_spec_hash, venue_calendar_hash] =
    await Promise.all([
      sha256(continuityContractPayload()),
      sha256(["fold_definition_version", FOLD_DEFINITION_VERSION_V3, "purge_minutes", PURGE_MINUTES,
        "initial_train_fraction", INITIAL_TRAIN_FRACTION, "holdout_fraction", HOLDOUT_FRACTION,
        "min_test_obs_per_fold", MIN_TEST_OBS_PER_FOLD, "requested_folds", REQUESTED_FOLDS,
        "contiguity", "expected_open_venue_time", "split_rule", SPLIT_MIN_EXPECTED_OPEN_MINUTES]),
      sha256(promotionGatePayload()),
      sha256(stateSpecPayloadV2()),
      sha256(candidateSpecPayloadV3()),
      sha256(venueCalendarPayload()),
    ]);
  return {
    continuity_contract_hash, fold_definition_hash, promotion_gate_hash,
    state_spec_hash, candidate_spec_hash, venue_calendar_hash,
  };
}
