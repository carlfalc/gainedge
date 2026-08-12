/**
 * RON Phase 2D.1 — state discovery under PURGED chronological walk-forward (RESEARCH ONLY).
 *
 * Pure deterministic evaluation helpers. Nothing here writes state, fits thresholds, or
 * produces anything that may be shown as a probability. Every threshold, floor, fold rule
 * and candidate is PREDECLARED in this file before any result is observed.
 *
 * KEY METHODOLOGY: adjacent 15m anchors carry 60m outcome horizons, so an ordinary
 * chronological split can leak overlapping labels across the boundary. Training therefore
 * requires `train_bar_time + 60m <= test_start` (purge/embargo).
 */
import {
  SAMPLE_FLOORS, brier, ece, round6, sha256, wilson95,
  type Direction,
} from "./ron-calibration.ts";
import {
  RON_STATE_SPEC_VERSION_V2, stateSpecPayloadV2, type RonStateVector,
} from "./ron-state-spec.ts";

export const RESEARCH_VERSION = 2;
/**
 * Phase 2D.1a fold contract. Predeclared, data-availability-only continuity rule:
 * adjacent eligible anchors more than this many clock hours apart start a NEW coverage
 * epoch. Normal weekend/venue closures for XAUUSD are ~50h; the known genuine 1m
 * provider outage is ~77 days, so 72h separates the two without touching outcomes.
 */
export const COVERAGE_EPOCH_GAP_HOURS = 72;
export const FOLD_DEFINITION_VERSION = 2;
/** Outcome horizon in clock minutes — the purge/embargo width at every train→test boundary. */
export const PURGE_MINUTES = 60;
export const REQUESTED_FOLDS = 4;
/** A fold is only admissible if BOTH directions have at least this many test observations. */
export const MIN_TEST_OBS_PER_FOLD = 500;
/** Fraction of the ordered distinct eligible timestamps reserved as initial training history. */
export const INITIAL_TRAIN_FRACTION = 0.5;
/** Predeclared training-bucket sample floors. */
export const FLOOR_SINGLE = 200;
export const FLOOR_PAIR = 300;
/** Deterministic log-loss clipping. */
export const LOGLOSS_CLIP = { lo: 0.01, hi: 0.99 } as const;

/** Research promotion gate. NOT a product probability gate. Never relaxed after results. */
export const PROMOTION_GATE = {
  gate_version: 1,
  min_aggregate_brier_improvement_vs_baseline: 0.0015,
  min_fold_win_fraction: 0.75,
  max_fold_degradation_vs_baseline: 0.0030,
  min_non_global_coverage: 0.25,
} as const;

/** Evidence listing constraints for the stable-bucket table. */
export const BUCKET_EVIDENCE = {
  max_rows_per_direction: 10,
  min_aggregate_test_n: 200,
  prefer_min_folds: 2,
  ranking: "absolute_deviation_of_oos_rate_from_pooled_fold_global_rate",
} as const;

/** FROZEN candidate set. Single variables, then ONLY the predeclared pairs. */
export const SINGLE_CANDIDATES: readonly string[] = [
  "session", "regime", "adx_bucket", "volatility_regime", "ema_stack", "macd_state",
  "rsi_zone", "rsi_slope_sign", "stoch_zone", "di_dominance", "ha_state", "structure_bias",
  "position_day_bucket", "relative_volume_bucket", "pattern_bias", "pattern_count_bucket",
  "nearest_level_side", "nearest_level_atr_bucket",
];

export const PAIR_CANDIDATES: readonly (readonly [string, string])[] = [
  ["session", "volatility_regime"],
  ["session", "regime"],
  ["regime", "ema_stack"],
  ["regime", "macd_state"],
  ["ema_stack", "macd_state"],
  ["regime", "di_dominance"],
  ["regime", "structure_bias"],
  ["session", "position_day_bucket"],
  ["volatility_regime", "nearest_level_atr_bucket"],
  ["pattern_bias", "regime"],
  ["pattern_bias", "session"],
  ["nearest_level_side", "regime"],
];

export interface CandidateSpec {
  name: string;
  kind: "single" | "pair" | "baseline_hierarchy";
  variables: string[];
  floor: number;
}

export const BASELINE_CANDIDATE: CandidateSpec = {
  name: "baseline_v4_hierarchy",
  kind: "baseline_hierarchy",
  variables: ["session", "regime", "adx_bucket"],
  floor: SAMPLE_FLOORS[3],
};

export function buildCandidateSet(): CandidateSpec[] {
  return [
    BASELINE_CANDIDATE,
    ...SINGLE_CANDIDATES.map((v) => ({
      name: v, kind: "single" as const, variables: [v], floor: FLOOR_SINGLE,
    })),
    ...PAIR_CANDIDATES.map(([a, b]) => ({
      name: `${a}__x__${b}`, kind: "pair" as const, variables: [a, b], floor: FLOOR_PAIR,
    })),
  ];
}

export function candidateSpecPayload() {
  return [
    "research_version", RESEARCH_VERSION,
    "state_spec_version", RON_STATE_SPEC_VERSION_V2,
    "singles", [...SINGLE_CANDIDATES],
    "pairs", PAIR_CANDIDATES.map((p) => [...p]),
    "baseline", [BASELINE_CANDIDATE.name, BASELINE_CANDIDATE.variables,
      [0, 1, 2, 3].map((l) => [l, SAMPLE_FLOORS[l]])],
    "floor_single", FLOOR_SINGLE,
    "floor_pair", FLOOR_PAIR,
    "purge_minutes", PURGE_MINUTES,
    "initial_train_fraction", INITIAL_TRAIN_FRACTION,
    "min_test_obs_per_fold", MIN_TEST_OBS_PER_FOLD,
    "fold_definition_version", FOLD_DEFINITION_VERSION,
    "coverage_epoch_gap_hours", COVERAGE_EPOCH_GAP_HOURS,
    "logloss_clip", [LOGLOSS_CLIP.lo, LOGLOSS_CLIP.hi],
    "promotion_gate", Object.keys(PROMOTION_GATE).sort()
      .map((k) => [k, (PROMOTION_GATE as Record<string, unknown>)[k]]),
    "bucket_evidence", Object.keys(BUCKET_EVIDENCE).sort()
      .map((k) => [k, (BUCKET_EVIDENCE as Record<string, unknown>)[k]]),
    stateSpecPayloadV2(),
  ];
}

/* ----------------------------------------------------------- observations */

export interface ResearchObs {
  bar_time: string;
  t: number;
  success: boolean;
  state: RonStateVector;
}

export const bucketKeyFor = (spec: CandidateSpec, s: RonStateVector): string =>
  spec.variables.map((v) => `${v}=${s[v] ?? "unknown"}`).join("|");

/* ------------------------------------------------------------------ folds */

export interface PurgedFold {
  fold: number;
  train_start: string | null;
  train_end: string | null;
  purge_start: string;
  test_start: string;
  /** EXCLUSIVE upper bound; null on the final fold (open end). */
  test_end: string | null;
}

export interface FoldPlan {
  fold_definition_version: number;
  purge_minutes: number;
  initial_train_fraction: number;
  requested_folds: number;
  accepted_folds: number;
  min_test_obs_per_fold: number;
  distinct_eligible_times: number;
  reduction_reason: string | null;
  folds: PurgedFold[];
}

function foldBoundaries(times: number[], folds: number): PurgedFold[] {
  const startIdx = Math.max(1, Math.min(times.length - folds, Math.floor(times.length * INITIAL_TRAIN_FRACTION)));
  const region = times.length - startIdx;
  const out: PurgedFold[] = [];
  for (let f = 0; f < folds; f++) {
    const lo = startIdx + Math.floor((region * f) / folds);
    const hi = startIdx + Math.floor((region * (f + 1)) / folds);
    if (hi <= lo) continue;
    const testStart = times[lo];
    out.push({
      fold: f + 1,
      train_start: new Date(times[0]).toISOString(),
      train_end: null,
      purge_start: new Date(testStart - PURGE_MINUTES * 60_000).toISOString(),
      test_start: new Date(testStart).toISOString(),
      test_end: hi < times.length ? new Date(times[hi]).toISOString() : null,
    });
  }
  return out;
}

/**
 * Deterministic purged expanding-window folds over the DISTINCT eligible anchor times of all
 * directions combined, so LONG and SHORT share identical windows. If any fold would hold
 * fewer than `MIN_TEST_OBS_PER_FOLD` observations in either direction the fold COUNT is
 * reduced (never the floor) until every fold is defensible.
 */
export function buildPurgedFolds(
  perDirection: ResearchObs[][],
  requested = REQUESTED_FOLDS,
): FoldPlan {
  const times = [...new Set(perDirection.flat().map((o) => o.t))].sort((a, b) => a - b);
  const plan: FoldPlan = {
    fold_definition_version: 1,
    purge_minutes: PURGE_MINUTES,
    initial_train_fraction: INITIAL_TRAIN_FRACTION,
    requested_folds: requested,
    accepted_folds: 0,
    min_test_obs_per_fold: MIN_TEST_OBS_PER_FOLD,
    distinct_eligible_times: times.length,
    reduction_reason: null,
    folds: [],
  };
  for (let folds = requested; folds >= 1; folds--) {
    if (times.length < folds + 1) continue;
    const bounds = foldBoundaries(times, folds);
    if (bounds.length !== folds) continue;
    const ok = bounds.every((b) => {
      const lo = new Date(b.test_start).getTime();
      const hi = b.test_end == null ? Number.POSITIVE_INFINITY : new Date(b.test_end).getTime();
      return perDirection.every((obs) => obs.filter((o) => o.t >= lo && o.t < hi).length >= MIN_TEST_OBS_PER_FOLD);
    });
    if (!ok) continue;
    plan.accepted_folds = folds;
    plan.folds = bounds;
    if (folds < requested) {
      plan.reduction_reason =
        `reduced from ${requested} to ${folds} folds so every test block holds >= ${MIN_TEST_OBS_PER_FOLD} observations in both directions`;
    }
    return plan;
  }
  plan.reduction_reason = `no fold configuration reaches ${MIN_TEST_OBS_PER_FOLD} test observations per fold`;
  return plan;
}

/* ------------------------------------------------------------- evaluation */

export interface BucketStat {
  bucket: string;
  n_train: number;
  successes_train: number;
  train_rate: number | null;
  wilson_low: number | null;
  wilson_high: number | null;
  meets_floor: boolean;
  n_test: number;
  successes_test: number;
  test_rate: number | null;
}

export interface FoldResult {
  fold: number;
  train_start: string | null;
  train_end: string | null;
  purge_start: string;
  test_start: string;
  test_end: string | null;
  n_train: number;
  n_purged: number;
  n_test: number;
  global_train_rate: number | null;
  observed_test_rate: number | null;
  brier: number | null;
  naive_brier: number | null;
  brier_delta_vs_naive: number | null;
  ece: number | null;
  log_loss: number | null;
  n_non_global: number;
  non_global_coverage: number | null;
  buckets_meeting_floor: number;
  buckets_total: number;
  buckets: BucketStat[];
  /** Per-test-row squared errors in chronological order (used for aggregate pooling). */
  preds: { t: number; p: number; y: boolean }[];
}

function logLoss(preds: { p: number; y: boolean }[]): number | null {
  if (!preds.length) return null;
  let s = 0;
  for (const q of preds) {
    const p = Math.min(LOGLOSS_CLIP.hi, Math.max(LOGLOSS_CLIP.lo, q.p));
    s += q.y ? -Math.log(p) : -Math.log(1 - p);
  }
  return round6(s / preds.length);
}

/** Deepest-first hierarchy key list for the research baseline reproduction. */
const hierarchyKeys = (s: RonStateVector): string[] => [
  `L3|session=${s.session}|regime=${s.regime}|adx=${s.adx_bucket}`,
  `L2|session=${s.session}|regime=${s.regime}`,
  `L1|session=${s.session}`,
  `L0`,
];

/** Evaluate ONE candidate for ONE direction on ONE purged fold. */
export function evaluateCandidateFold(
  spec: CandidateSpec,
  obs: ResearchObs[],
  bound: PurgedFold,
): FoldResult {
  const testStart = new Date(bound.test_start).getTime();
  const testEnd = bound.test_end == null ? Number.POSITIVE_INFINITY : new Date(bound.test_end).getTime();
  const purgeStart = testStart - PURGE_MINUTES * 60_000;
  const sorted = [...obs].sort((a, b) => a.t - b.t || (a.bar_time < b.bar_time ? -1 : 1));

  const train = sorted.filter((o) => o.t + PURGE_MINUTES * 60_000 <= testStart);
  const purged = sorted.filter((o) => o.t > purgeStart && o.t < testStart);
  const test = sorted.filter((o) => o.t >= testStart && o.t < testEnd);

  // ---- fit bucket rates on TRAIN ONLY -----------------------------------
  const counts = new Map<string, { n: number; s: number }>();
  const touch = (k: string) => {
    let c = counts.get(k);
    if (!c) { c = { n: 0, s: 0 }; counts.set(k, c); }
    return c;
  };
  const keysFor = (o: ResearchObs) =>
    spec.kind === "baseline_hierarchy" ? hierarchyKeys(o.state) : [bucketKeyFor(spec, o.state)];
  const floorFor = (key: string) =>
    spec.kind === "baseline_hierarchy"
      ? SAMPLE_FLOORS[Number(key.charAt(1)) || 0]
      : spec.floor;

  for (const o of train) for (const k of keysFor(o)) { const c = touch(k); c.n++; if (o.success) c.s++; }
  const globalTrain = train.length ? round6(train.filter((o) => o.success).length / train.length) : null;

  // ---- score TEST -------------------------------------------------------
  const testCounts = new Map<string, { n: number; s: number }>();
  const preds: { t: number; p: number; y: boolean }[] = [];
  let nonGlobal = 0;
  let successes = 0;

  for (const o of test) {
    if (o.success) successes++;
    let p: number | null = null;
    let used: string | null = null;
    for (const k of keysFor(o)) {
      const c = counts.get(k);
      if (c && c.n >= floorFor(k) && !(spec.kind === "baseline_hierarchy" && k === "L0")) {
        p = round6(c.s / c.n); used = k; break;
      }
      if (spec.kind === "baseline_hierarchy" && k === "L0" && c && c.n >= SAMPLE_FLOORS[0]) {
        p = round6(c.s / c.n); used = null; break;      // L0 is the global fallback
      }
    }
    if (p == null) { p = globalTrain; used = null; }
    if (p == null) continue;                             // no train evidence at all
    if (used != null) nonGlobal++;
    const tk = spec.kind === "baseline_hierarchy" ? (used ?? "L0") : bucketKeyFor(spec, o.state);
    let tc = testCounts.get(tk);
    if (!tc) { tc = { n: 0, s: 0 }; testCounts.set(tk, tc); }
    tc.n++; if (o.success) tc.s++;
    preds.push({ t: o.t, p, y: o.success });
  }

  const naivePreds = globalTrain == null ? [] : preds.map((q) => ({ p: globalTrain, y: q.y }));
  const b = brier(preds.map((q) => ({ p: q.p, y: q.y })));
  const nb = brier(naivePreds);

  const buckets: BucketStat[] = [...counts.keys()].sort().map((k) => {
    const c = counts.get(k)!;
    const w = wilson95(c.s, c.n);
    const tc = testCounts.get(k);
    return {
      bucket: k,
      n_train: c.n, successes_train: c.s,
      train_rate: c.n ? round6(c.s / c.n) : null,
      wilson_low: w?.low ?? null, wilson_high: w?.high ?? null,
      meets_floor: c.n >= floorFor(k),
      n_test: tc?.n ?? 0, successes_test: tc?.s ?? 0,
      test_rate: tc && tc.n ? round6(tc.s / tc.n) : null,
    };
  });

  return {
    fold: bound.fold,
    train_start: train.length ? train[0].bar_time : null,
    train_end: train.length ? train[train.length - 1].bar_time : null,
    purge_start: bound.purge_start,
    test_start: bound.test_start,
    test_end: bound.test_end,
    n_train: train.length,
    n_purged: purged.length,
    n_test: test.length,
    global_train_rate: globalTrain,
    observed_test_rate: test.length ? round6(successes / test.length) : null,
    brier: b,
    naive_brier: nb,
    brier_delta_vs_naive: b != null && nb != null ? round6(nb - b) : null,
    ece: ece(preds.map((q) => ({ p: q.p, y: q.y }))),
    log_loss: logLoss(preds.map((q) => ({ p: q.p, y: q.y }))),
    n_non_global: nonGlobal,
    non_global_coverage: preds.length ? round6(nonGlobal / preds.length) : null,
    buckets_meeting_floor: buckets.filter((x) => x.meets_floor).length,
    buckets_total: buckets.length,
    buckets,
    preds,
  };
}

export interface CandidateResult {
  candidate: string;
  kind: CandidateSpec["kind"];
  variables: string[];
  direction: Direction;
  sample_floor: number;
  folds: Omit<FoldResult, "preds" | "buckets">[];
  aggregate: {
    n_test: number;
    n_scored: number;
    brier: number | null;
    naive_brier: number | null;
    brier_delta_vs_naive: number | null;
    ece: number | null;
    log_loss: number | null;
    non_global_coverage: number | null;
    observed_test_rate: number | null;
  };
  vs_baseline: {
    aggregate_brier_delta: number | null;
    fold_deltas: (number | null)[];
    folds_better: number;
    folds_worse: number;
    folds_tied: number;
    worst_fold_degradation: number | null;
  } | null;
  promising_for_2D2: boolean;
  gate_reasons: string[];
  /** Buckets that met their training floor in >= 2 folds, with train/test rates per fold. */
  bucket_stability: {
    bucket: string;
    folds: { fold: number; n_train: number; train_rate: number | null; wilson_low: number | null; wilson_high: number | null; n_test: number; test_rate: number | null }[];
    aggregate_test_n: number;
    aggregate_test_rate: number | null;
  }[];
  result_hash: string;
}

function aggregateOf(folds: FoldResult[]) {
  const all = folds.flatMap((f) => f.preds);
  const naive = folds.flatMap((f) =>
    f.global_train_rate == null ? [] : f.preds.map((q) => ({ p: f.global_train_rate as number, y: q.y })));
  const nonGlobal = folds.reduce((a, f) => a + f.n_non_global, 0);
  const b = brier(all.map((q) => ({ p: q.p, y: q.y })));
  const nb = brier(naive);
  return {
    n_test: folds.reduce((a, f) => a + f.n_test, 0),
    n_scored: all.length,
    brier: b,
    naive_brier: nb,
    brier_delta_vs_naive: b != null && nb != null ? round6(nb - b) : null,
    ece: ece(all.map((q) => ({ p: q.p, y: q.y }))),
    log_loss: logLoss(all.map((q) => ({ p: q.p, y: q.y }))),
    non_global_coverage: all.length ? round6(nonGlobal / all.length) : null,
    observed_test_rate: all.length ? round6(all.filter((q) => q.y).length / all.length) : null,
  };
}

function stabilityOf(folds: FoldResult[]) {
  const byBucket = new Map<string, FoldResult["buckets"][number][]>();
  const foldOf = new Map<string, number[]>();
  for (const f of folds) {
    for (const b of f.buckets) {
      if (!b.meets_floor) continue;
      const arr = byBucket.get(b.bucket) ?? [];
      arr.push(b); byBucket.set(b.bucket, arr);
      const fs = foldOf.get(b.bucket) ?? [];
      fs.push(f.fold); foldOf.set(b.bucket, fs);
    }
  }
  return [...byBucket.keys()].sort()
    .filter((k) => (byBucket.get(k) as unknown[]).length >= 2)
    .map((k) => {
      const rows = byBucket.get(k)!;
      const fs = foldOf.get(k)!;
      const nTest = rows.reduce((a, r) => a + r.n_test, 0);
      const sTest = rows.reduce((a, r) => a + r.successes_test, 0);
      return {
        bucket: k,
        folds: rows.map((r, i) => ({
          fold: fs[i], n_train: r.n_train, train_rate: r.train_rate,
          wilson_low: r.wilson_low, wilson_high: r.wilson_high,
          n_test: r.n_test, test_rate: r.test_rate,
        })),
        aggregate_test_n: nTest,
        aggregate_test_rate: nTest ? round6(sTest / nTest) : null,
      };
    });
}

/** Evaluate one candidate across every fold, then apply the predeclared promotion gate. */
export async function evaluateCandidate(
  spec: CandidateSpec,
  dir: Direction,
  obs: ResearchObs[],
  plan: FoldPlan,
  baseline: FoldResult[] | null,
  definitionHash: string,
): Promise<{ result: CandidateResult; folds: FoldResult[] }> {
  const folds = plan.folds.map((b) => evaluateCandidateFold(spec, obs, b));
  const aggregate = aggregateOf(folds);

  let vs: CandidateResult["vs_baseline"] = null;
  if (baseline) {
    const baseAgg = aggregateOf(baseline);
    const foldDeltas = folds.map((f, i) => {
      const bb = baseline[i]?.brier;
      return f.brier != null && bb != null ? round6(bb - f.brier) : null;   // >0 = candidate better
    });
    vs = {
      aggregate_brier_delta:
        aggregate.brier != null && baseAgg.brier != null ? round6(baseAgg.brier - aggregate.brier) : null,
      fold_deltas: foldDeltas,
      folds_better: foldDeltas.filter((d) => d != null && d > 0).length,
      folds_worse: foldDeltas.filter((d) => d != null && d < 0).length,
      folds_tied: foldDeltas.filter((d) => d === 0).length,
      worst_fold_degradation: foldDeltas.length
        ? round6(Math.min(...foldDeltas.map((d) => (d == null ? 0 : d))))
        : null,
    };
  }

  const reasons: string[] = [];
  let promising = false;
  if (spec.kind !== "baseline_hierarchy" && vs) {
    const nFolds = folds.length;
    const okImprove = (vs.aggregate_brier_delta ?? -1) >= PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline;
    const okWins = nFolds > 0 && vs.folds_better / nFolds >= PROMOTION_GATE.min_fold_win_fraction;
    const okWorst = (vs.worst_fold_degradation ?? -1) >= -PROMOTION_GATE.max_fold_degradation_vs_baseline;
    const okCoverage = (aggregate.non_global_coverage ?? 0) >= PROMOTION_GATE.min_non_global_coverage;
    if (!okImprove) reasons.push(`aggregate_brier_delta ${vs.aggregate_brier_delta} < ${PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline}`);
    if (!okWins) reasons.push(`fold_win_fraction ${nFolds ? round6(vs.folds_better / nFolds) : null} < ${PROMOTION_GATE.min_fold_win_fraction}`);
    if (!okWorst) reasons.push(`worst_fold_degradation ${vs.worst_fold_degradation} beyond -${PROMOTION_GATE.max_fold_degradation_vs_baseline}`);
    if (!okCoverage) reasons.push(`non_global_coverage ${aggregate.non_global_coverage} < ${PROMOTION_GATE.min_non_global_coverage}`);
    promising = okImprove && okWins && okWorst && okCoverage;
  } else {
    reasons.push("reference_champion_not_gated");
  }

  const slim = folds.map(({ preds: _p, buckets: _b, ...rest }) => rest);
  const bucket_stability = stabilityOf(folds);
  const result_hash = await sha256([
    definitionHash, spec.name, spec.kind, spec.variables, spec.floor, dir,
    slim, aggregate, vs, promising, reasons, bucket_stability,
  ]);

  return {
    result: {
      candidate: spec.name, kind: spec.kind, variables: spec.variables, direction: dir,
      sample_floor: spec.floor,
      folds: slim, aggregate, vs_baseline: vs,
      promising_for_2D2: promising, gate_reasons: reasons,
      bucket_stability, result_hash,
    },
    folds,
  };
}

/** Top informative stable buckets for one direction, ranked by the predeclared rule. */
export function topBuckets(
  results: { result: CandidateResult; folds: FoldResult[] }[],
  limit = BUCKET_EVIDENCE.max_rows_per_direction,
) {
  const rows: {
    candidate: string; bucket: string; folds_present: number;
    train_n: number; train_rate: number | null; wilson_low: number | null; wilson_high: number | null;
    oos_n: number; oos_rate: number | null; pooled_global_rate: number | null; abs_deviation: number;
  }[] = [];

  for (const { result, folds } of results) {
    if (result.kind === "baseline_hierarchy") continue;
    const globalWeighted = (() => {
      let n = 0, s = 0;
      for (const f of folds) { if (f.global_train_rate == null) continue; n += f.n_test; s += f.global_train_rate * f.n_test; }
      return n ? s / n : null;
    })();
    const agg = new Map<string, { trainN: number; trainS: number; testN: number; testS: number; folds: number }>();
    for (const f of folds) for (const b of f.buckets) {
      if (!b.meets_floor) continue;
      const a = agg.get(b.bucket) ?? { trainN: 0, trainS: 0, testN: 0, testS: 0, folds: 0 };
      a.trainN += b.n_train; a.trainS += b.successes_train;
      a.testN += b.n_test; a.testS += b.successes_test; a.folds++;
      agg.set(b.bucket, a);
    }
    for (const [bucket, a] of [...agg.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (a.testN < BUCKET_EVIDENCE.min_aggregate_test_n) continue;
      const oos = a.testN ? a.testS / a.testN : null;
      const w = wilson95(a.trainS, a.trainN);
      rows.push({
        candidate: result.candidate, bucket, folds_present: a.folds,
        train_n: a.trainN, train_rate: round6(a.trainS / a.trainN),
        wilson_low: w?.low ?? null, wilson_high: w?.high ?? null,
        oos_n: a.testN, oos_rate: oos == null ? null : round6(oos),
        pooled_global_rate: globalWeighted == null ? null : round6(globalWeighted),
        abs_deviation: round6(oos == null || globalWeighted == null ? 0 : Math.abs(oos - globalWeighted)),
      });
    }
  }

  return rows
    .sort((a, b) =>
      (b.folds_present >= BUCKET_EVIDENCE.prefer_min_folds ? 1 : 0) - (a.folds_present >= BUCKET_EVIDENCE.prefer_min_folds ? 1 : 0) ||
      b.abs_deviation - a.abs_deviation ||
      (a.candidate + a.bucket < b.candidate + b.bucket ? -1 : 1))
    .slice(0, limit);
}

/** Deterministic ordered digest over every candidate result hash. */
export async function researchDigest(
  definitionHash: string,
  results: CandidateResult[],
): Promise<string> {
  const ordered = [...results]
    .sort((a, b) => (a.direction < b.direction ? -1 : a.direction > b.direction ? 1 : a.candidate < b.candidate ? -1 : 1))
    .map((r) => [r.direction, r.candidate, r.result_hash]);
  return await sha256([definitionHash, ordered]);
}

/* ==========================================================================
 * Phase 2D.1a — gap-aware contiguous coverage epochs (fold_definition_version=2)
 * ========================================================================== */

const MS_PER_MIN = 60_000;
const EPOCH_GAP_MS = COVERAGE_EPOCH_GAP_HOURS * 60 * MS_PER_MIN;

export interface CoverageEpoch {
  epoch: number;
  start: string;
  end: string;
  n_times: number;
  /** index range into the ordered distinct eligible times, end EXCLUSIVE */
  start_index: number;
  end_index: number;
  max_internal_gap_minutes: number;
}

/** Split ordered distinct eligible anchor times into contiguous coverage epochs. */
export function buildCoverageEpochs(times: number[]): CoverageEpoch[] {
  const out: CoverageEpoch[] = [];
  if (!times.length) return out;
  let lo = 0;
  const push = (a: number, b: number) => {
    let maxGap = 0;
    for (let i = a + 1; i < b; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1]);
    out.push({
      epoch: out.length + 1,
      start: new Date(times[a]).toISOString(),
      end: new Date(times[b - 1]).toISOString(),
      n_times: b - a,
      start_index: a,
      end_index: b,
      max_internal_gap_minutes: round6(maxGap / MS_PER_MIN),
    });
  };
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > EPOCH_GAP_MS) { push(lo, i); lo = i; }
  }
  push(lo, times.length);
  return out;
}

export interface GapAwareFold extends PurgedFold {
  coverage_epoch: number;
  max_internal_gap_minutes: number;
}

export interface GapAwareFoldPlan {
  fold_definition_version: number;
  purge_minutes: number;
  coverage_epoch_gap_hours: number;
  initial_train_fraction: number;
  requested_folds: number;
  accepted_folds: number;
  min_test_obs_per_fold: number;
  distinct_eligible_times: number;
  epochs: CoverageEpoch[];
  reduction_reason: string | null;
  folds: GapAwareFold[];
}

/** D'Hondt allocation of `total` folds across segments, capped by segment capacity. */
function allocateFolds(sizes: number[], caps: number[], total: number): number[] {
  const assigned = sizes.map(() => 0);
  for (let k = 0; k < total; k++) {
    let best = -1;
    let bestQ = -1;
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

function maxGapInRange(times: number[], lo: number, hi: number): number {
  const inside = times.filter((t) => t >= lo && t < hi);
  let g = 0;
  for (let i = 1; i < inside.length; i++) g = Math.max(g, inside[i] - inside[i - 1]);
  return round6(g / MS_PER_MIN);
}

/**
 * Deterministic purged expanding-window folds that NEVER cross a coverage-epoch gap.
 * Test blocks are contiguous within a single epoch; `test_end` is an exclusive bound set
 * to the last eligible time of the block plus 1ms when the block ends an epoch, so a fold
 * can never implicitly splice a provider outage into its calendar range.
 */
export function buildGapAwareFolds(
  perDirection: ResearchObs[][],
  requested = REQUESTED_FOLDS,
): GapAwareFoldPlan {
  const times = [...new Set(perDirection.flat().map((o) => o.t))].sort((a, b) => a - b);
  const epochs = buildCoverageEpochs(times);
  const plan: GapAwareFoldPlan = {
    fold_definition_version: FOLD_DEFINITION_VERSION,
    purge_minutes: PURGE_MINUTES,
    coverage_epoch_gap_hours: COVERAGE_EPOCH_GAP_HOURS,
    initial_train_fraction: INITIAL_TRAIN_FRACTION,
    requested_folds: requested,
    accepted_folds: 0,
    min_test_obs_per_fold: MIN_TEST_OBS_PER_FOLD,
    distinct_eligible_times: times.length,
    epochs,
    reduction_reason: null,
    folds: [],
  };
  if (times.length < 2) {
    plan.reduction_reason = "insufficient eligible anchors";
    return plan;
  }

  const startIdx = Math.max(1, Math.floor(times.length * INITIAL_TRAIN_FRACTION));
  // Test region restricted to each epoch, chronological.
  const segs = epochs
    .map((e) => ({ epoch: e.epoch, lo: Math.max(e.start_index, startIdx), hi: e.end_index }))
    .filter((s) => s.hi > s.lo);

  const countIn = (lo: number, hi: number) =>
    perDirection.map((obs) => obs.filter((o) => o.t >= lo && o.t < hi).length);

  for (let total = requested; total >= 1; total--) {
    const sizes = segs.map((s) => s.hi - s.lo);
    const caps = sizes.map((n) => Math.floor(n / MIN_TEST_OBS_PER_FOLD));
    const alloc = allocateFolds(sizes, caps, total);
    if (alloc.reduce((a, b) => a + b, 0) !== total) continue;

    const folds: GapAwareFold[] = [];
    let ok = true;
    for (let si = 0; si < segs.length && ok; si++) {
      const k = alloc[si];
      if (!k) continue;
      const { lo, hi, epoch } = segs[si];
      const span = hi - lo;
      for (let c = 0; c < k; c++) {
        const a = lo + Math.floor((span * c) / k);
        const b = lo + Math.floor((span * (c + 1)) / k);
        if (b <= a) { ok = false; break; }
        const testStart = times[a];
        const testEndExclusive = b < hi ? times[b] : times[b - 1] + 1;
        const counts = countIn(testStart, testEndExclusive);
        if (counts.some((n) => n < MIN_TEST_OBS_PER_FOLD)) { ok = false; break; }
        folds.push({
          fold: folds.length + 1,
          coverage_epoch: epoch,
          train_start: new Date(times[0]).toISOString(),
          train_end: null,
          purge_start: new Date(testStart - PURGE_MINUTES * MS_PER_MIN).toISOString(),
          test_start: new Date(testStart).toISOString(),
          test_end: new Date(testEndExclusive).toISOString(),
          max_internal_gap_minutes: maxGapInRange(times, testStart, testEndExclusive),
        });
      }
    }
    if (!ok || folds.length !== total) continue;
    // No test block may contain an internal continuity break at/over the epoch threshold.
    if (folds.some((f) => f.max_internal_gap_minutes > COVERAGE_EPOCH_GAP_HOURS * 60)) continue;

    plan.accepted_folds = total;
    plan.folds = folds;
    if (total < requested) {
      plan.reduction_reason =
        `reduced from ${requested} to ${total} folds so every contiguous within-epoch test block holds >= ${MIN_TEST_OBS_PER_FOLD} observations in both directions`;
    }
    return plan;
  }

  plan.reduction_reason =
    `no gap-aware fold configuration reaches ${MIN_TEST_OBS_PER_FOLD} test observations per contiguous within-epoch block`;
  return plan;
}

/* ------------------------------- corrected stable-bucket evidence (Defect 3) */

export interface StableBucketRow {
  candidate: string;
  bucket: string;
  folds_present: number;
  /** Latest fold in which the bucket met its training floor — NOT a pooled pseudo-sample. */
  train_reference_fold: number;
  train_n: number;
  train_rate: number | null;
  train_wilson_low: number | null;
  train_wilson_high: number | null;
  per_fold_train: { fold: number; n_train: number; train_rate: number | null; wilson_low: number | null; wilson_high: number | null }[];
  /** Pooled across DISJOINT test folds only. */
  oos_n: number;
  oos_rate: number | null;
  pooled_global_rate: number | null;
  abs_deviation: number;
}

/**
 * Top informative stable buckets for one direction.
 * Expanding walk-forward train sets overlap heavily, so training counts are NEVER pooled;
 * the headline training reference is the LATEST fold where the bucket met its floor, and
 * the Wilson interval is computed from that single fold. Only the disjoint OOS test folds
 * are pooled.
 */
export function topBucketsV2(
  results: { result: CandidateResult; folds: FoldResult[] }[],
  limit = BUCKET_EVIDENCE.max_rows_per_direction,
): StableBucketRow[] {
  const rows: StableBucketRow[] = [];

  for (const { result, folds } of results) {
    if (result.kind === "baseline_hierarchy") continue;
    const globalWeighted = (() => {
      let n = 0, s = 0;
      for (const f of folds) { if (f.global_train_rate == null) continue; n += f.n_test; s += f.global_train_rate * f.n_test; }
      return n ? s / n : null;
    })();

    const agg = new Map<string, {
      testN: number; testS: number; folds: number;
      perFold: { fold: number; n_train: number; successes_train: number; train_rate: number | null; wilson_low: number | null; wilson_high: number | null }[];
    }>();
    for (const f of folds) for (const b of f.buckets) {
      if (!b.meets_floor) continue;
      const a = agg.get(b.bucket) ?? { testN: 0, testS: 0, folds: 0, perFold: [] };
      a.testN += b.n_test; a.testS += b.successes_test; a.folds++;
      a.perFold.push({
        fold: f.fold, n_train: b.n_train, successes_train: b.successes_train,
        train_rate: b.train_rate, wilson_low: b.wilson_low, wilson_high: b.wilson_high,
      });
      agg.set(b.bucket, a);
    }

    for (const [bucket, a] of [...agg.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (a.testN < BUCKET_EVIDENCE.min_aggregate_test_n) continue;
      const oos = a.testN ? a.testS / a.testN : null;
      const ref = a.perFold.reduce((m, p) => (p.fold > m.fold ? p : m), a.perFold[0]);
      rows.push({
        candidate: result.candidate, bucket, folds_present: a.folds,
        train_reference_fold: ref.fold,
        train_n: ref.n_train,
        train_rate: ref.train_rate,
        train_wilson_low: ref.wilson_low,
        train_wilson_high: ref.wilson_high,
        per_fold_train: a.perFold.map((p) => ({
          fold: p.fold, n_train: p.n_train, train_rate: p.train_rate,
          wilson_low: p.wilson_low, wilson_high: p.wilson_high,
        })),
        oos_n: a.testN, oos_rate: oos == null ? null : round6(oos),
        pooled_global_rate: globalWeighted == null ? null : round6(globalWeighted),
        abs_deviation: round6(oos == null || globalWeighted == null ? 0 : Math.abs(oos - globalWeighted)),
      });
    }
  }

  return rows
    .sort((a, b) =>
      (b.folds_present >= BUCKET_EVIDENCE.prefer_min_folds ? 1 : 0) - (a.folds_present >= BUCKET_EVIDENCE.prefer_min_folds ? 1 : 0) ||
      b.abs_deviation - a.abs_deviation ||
      (a.candidate + a.bucket < b.candidate + b.bucket ? -1 : 1))
    .slice(0, limit);
}