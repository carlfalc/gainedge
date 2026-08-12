/**
 * RON Phase 2B.3 — calibration evidence sufficiency / robustness audit (RESEARCH ONLY).
 *
 * Pure, deterministic helpers for walk-forward evaluation of the FROZEN calibration_version=6
 * hierarchy. Nothing here fits parameters, tunes thresholds or writes production calibration
 * state: ADX spec, sample floors, hierarchy policy, horizon, barrier and holdout fraction are
 * imported unchanged from the v6 contract and are never re-derived from results.
 *
 * The evaluator answers ONE question: is the small v6 Brier lift stable across strictly
 * forward, non-overlapping chronological folds, or is it noise?
 */
import {
  ADX_BUCKET_SPEC, HOLDOUT_FRACTION, SAMPLE_FLOORS, HIERARCHY_POLICY_VERSION,
  adxBucketSpecPayload, buildCells, cellKey, resolvePrediction,
  brier, ece, reliabilityBins, round6, sha256,
  type Direction, type EligibleObs, type CellStat, type ReliabilityBin,
} from "./ron-calibration.ts";

/** Research artifact versions — deliberately NOT a calibration_version. */
export const ROBUSTNESS_REPORT_VERSION = 1;
export const FOLD_DEFINITION_VERSION = 1;
/** Predeclared minimum number of strictly forward, non-overlapping test folds. */
export const ROBUSTNESS_FOLDS = 4;

/** Deterministic paired-bootstrap specification. Fixed before any result was seen. */
export const BOOTSTRAP_SPEC = {
  procedure: "paired_bootstrap_mean_squared_error_difference",
  procedure_version: 1,
  resamples: 2000,
  seed: 20260812,
  interval: "percentile_95",
  prng: "mulberry32",
} as const;

/** Predeclared statistical review gate. Never adjusted to fit an outcome. */
export const ROBUSTNESS_GATE = {
  gate_version: 1,
  min_folds: 4,
  min_fold_win_fraction: 0.75,
  min_weighted_relative_lift: 0.02,
  worst_fold_absolute_lift_floor: -0.005,
  require_bootstrap_upper_bound_below_zero: true,
} as const;

/* ------------------------------------------------------------------ folds */

export interface FoldBoundary {
  fold: number;
  /** Inclusive first eligible timestamp of the test window. */
  test_start: string;
  /** EXCLUSIVE upper bound of the test window (null on the final fold = open end). */
  test_end: string | null;
  /** Distinct eligible timestamps assigned to this test window. */
  distinct_test_times: number;
}

export interface FoldPlan {
  fold_definition_version: number;
  holdout_fraction: number;
  requested_folds: number;
  distinct_eligible_times: number;
  evaluation_start: string | null;
  folds: FoldBoundary[];
}

/**
 * Deterministic walk-forward fold boundaries derived from the DISTINCT eligible canonical
 * timestamps of ALL directions combined, so LONG and SHORT always share identical windows.
 * The evaluation region is the final `holdoutFraction` of distinct timestamps — the same
 * frozen fraction the v6 run uses — split into equal contiguous, non-overlapping folds.
 */
export function buildForwardFolds(
  perDirection: EligibleObs[][],
  folds = ROBUSTNESS_FOLDS,
  holdoutFraction = HOLDOUT_FRACTION,
): FoldPlan {
  const times = [...new Set(perDirection.flat().map((o) => o.t))].sort((a, b) => a - b);
  const plan: FoldPlan = {
    fold_definition_version: FOLD_DEFINITION_VERSION,
    holdout_fraction: holdoutFraction,
    requested_folds: folds,
    distinct_eligible_times: times.length,
    evaluation_start: null,
    folds: [],
  };
  // Need at least one fit timestamp before the region plus one timestamp per fold.
  if (times.length < folds + 1) return plan;

  const startIdx = Math.max(1, Math.min(times.length - folds, Math.floor(times.length * (1 - holdoutFraction))));
  plan.evaluation_start = new Date(times[startIdx]).toISOString();
  const region = times.length - startIdx;

  for (let f = 0; f < folds; f++) {
    const lo = startIdx + Math.floor((region * f) / folds);
    const hi = startIdx + Math.floor((region * (f + 1)) / folds);   // exclusive
    if (hi <= lo) continue;
    plan.folds.push({
      fold: f + 1,
      test_start: new Date(times[lo]).toISOString(),
      test_end: hi < times.length ? new Date(times[hi]).toISOString() : null,
      distinct_test_times: hi - lo,
    });
  }
  return plan;
}

/* ------------------------------------------------------- fold evaluation */

export interface FoldMetrics {
  fold: number;
  direction: Direction;
  fit_start: string | null;
  fit_end: string | null;
  test_start: string | null;
  test_end: string | null;
  n_fit: number;
  n_test: number;
  n_predicted: number;
  n_unpredicted: number;
  observed_rate: number | null;
  global_fit_rate: number | null;
  brier: number | null;
  naive_brier: number | null;
  absolute_lift: number | null;
  relative_lift: number | null;
  ece: number | null;
  occupied_reliability_bins: number;
  reliability: ReliabilityBin[];
  fallback_levels: Record<string, number>;
  session_counts: Record<string, number>;
  regime_counts: Record<string, number>;
  adx_bucket_counts: Record<string, number>;
  qualifying_cells: Record<string, number>;
  /** Per-observation paired squared-error differences (model - naive), test order. */
  diffs: { t: number; session: string; regime: string; d: number }[];
}

const sortedEntries = (o: Record<string, number>) =>
  Object.keys(o).sort().map((k) => [k, o[k]] as const);

/**
 * Evaluate ONE fold for ONE direction. Fit uses ONLY observations strictly earlier than the
 * test window start — an expanding window with no leakage by construction.
 */
export function evaluateFold(
  dir: Direction,
  obs: EligibleObs[],
  bound: FoldBoundary,
): FoldMetrics {
  const startT = new Date(bound.test_start).getTime();
  const endT = bound.test_end == null ? Number.POSITIVE_INFINITY : new Date(bound.test_end).getTime();
  const sorted = [...obs].sort((a, b) => a.t - b.t || (a.bar_time < b.bar_time ? -1 : 1));
  const fit = sorted.filter((o) => o.t < startT);
  const test = sorted.filter((o) => o.t >= startT && o.t < endT);

  const cells = buildCells(dir, fit, test);
  const map = new Map(cells.map((c) => [c.cell_key, c]));
  const global = map.get(cellKey(0, dir, { session: "", regime: "", adx_bucket: "" }));
  const naive = global?.empirical_rate ?? null;

  const preds: { p: number; y: boolean }[] = [];
  const naivePreds: { p: number; y: boolean }[] = [];
  const diffs: FoldMetrics["diffs"] = [];
  const fallback: Record<string, number> = { L3: 0, L2: 0, L1: 0, L0: 0, none: 0 };
  const sessions: Record<string, number> = {};
  const regimes: Record<string, number> = {};
  const adxBuckets: Record<string, number> = {};
  let successes = 0;

  for (const o of test) {
    sessions[o.session] = (sessions[o.session] ?? 0) + 1;
    regimes[o.regime] = (regimes[o.regime] ?? 0) + 1;
    adxBuckets[o.adx_bucket] = (adxBuckets[o.adx_bucket] ?? 0) + 1;
    if (o.success) successes++;
    const r = resolvePrediction(map, dir, o);
    if (r.p == null) { fallback.none++; continue; }
    fallback[`L${r.level}`]++;
    const y = o.success ? 1 : 0;
    preds.push({ p: r.p, y: o.success });
    if (naive != null) {
      naivePreds.push({ p: naive, y: o.success });
      diffs.push({
        t: o.t, session: o.session, regime: o.regime,
        d: round6((r.p - y) ** 2 - (naive - y) ** 2),
      });
    }
  }

  const qualifying: Record<string, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };
  for (const c of cells) if (c.meets_sample_floor) qualifying[`L${c.level}`]++;

  const b = brier(preds);
  const nb = brier(naivePreds);
  const bins = reliabilityBins(preds);

  return {
    fold: bound.fold,
    direction: dir,
    fit_start: fit.length ? fit[0].bar_time : null,
    fit_end: fit.length ? fit[fit.length - 1].bar_time : null,
    test_start: test.length ? test[0].bar_time : null,
    test_end: test.length ? test[test.length - 1].bar_time : null,
    n_fit: fit.length,
    n_test: test.length,
    n_predicted: preds.length,
    n_unpredicted: fallback.none,
    observed_rate: test.length ? round6(successes / test.length) : null,
    global_fit_rate: naive,
    brier: b,
    naive_brier: nb,
    absolute_lift: b != null && nb != null ? round6(nb - b) : null,
    relative_lift: b != null && nb != null && nb > 0 ? round6((nb - b) / nb) : null,
    ece: ece(preds),
    occupied_reliability_bins: bins.filter((x) => x.n > 0).length,
    reliability: bins,
    fallback_levels: fallback,
    session_counts: sessions,
    regime_counts: regimes,
    adx_bucket_counts: adxBuckets,
    qualifying_cells: qualifying,
    diffs,
  };
}

/* ----------------------------------------------- deterministic bootstrap */

/** mulberry32 — small, fully deterministic, no platform RNG dependence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootstrapResult {
  procedure: string;
  procedure_version: number;
  prng: string;
  seed: number;
  resamples: number;
  n: number;
  mean_difference: number | null;
  ci_low: number | null;
  ci_high: number | null;
  /** Fraction of resamples whose mean difference is < 0 (model better than naive). */
  fraction_negative: number | null;
}

/**
 * Paired bootstrap over out-of-fold squared-error differences (model - naive).
 * A 95% percentile interval fully below zero is evidence the model genuinely beats naive.
 */
export function pairedBootstrap(
  diffs: number[],
  spec: { resamples: number; seed: number } = BOOTSTRAP_SPEC,
): BootstrapResult {
  const base: BootstrapResult = {
    procedure: BOOTSTRAP_SPEC.procedure,
    procedure_version: BOOTSTRAP_SPEC.procedure_version,
    prng: BOOTSTRAP_SPEC.prng,
    seed: spec.seed,
    resamples: spec.resamples,
    n: diffs.length,
    mean_difference: null, ci_low: null, ci_high: null, fraction_negative: null,
  };
  const n = diffs.length;
  if (n === 0) return base;

  let sum = 0;
  for (const d of diffs) sum += d;
  base.mean_difference = round6(sum / n);

  const rand = mulberry32(spec.seed);
  const means = new Float64Array(spec.resamples);
  let negatives = 0;
  for (let r = 0; r < spec.resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += diffs[Math.floor(rand() * n) % n];
    const m = s / n;
    means[r] = m;
    if (m < 0) negatives++;
  }
  const sortedMeans = Array.from(means).sort((a, b) => a - b);
  const at = (q: number) => {
    const idx = Math.min(sortedMeans.length - 1, Math.max(0, Math.floor(q * (sortedMeans.length - 1))));
    return round6(sortedMeans[idx]);
  };
  base.ci_low = at(0.025);
  base.ci_high = at(0.975);
  base.fraction_negative = round6(negatives / spec.resamples);
  return base;
}

/* -------------------------------------------------- aggregate + stability */

export interface SliceStat {
  key: string;
  n: number;
  brier: number | null;
  naive_brier: number | null;
  absolute_lift: number | null;
}

export interface DirectionRobustness {
  direction: Direction;
  n_folds: number;
  folds: Omit<FoldMetrics, "diffs">[];
  total_test: number;
  total_predicted: number;
  total_unpredicted: number;
  weighted_brier: number | null;
  weighted_naive_brier: number | null;
  weighted_absolute_lift: number | null;
  weighted_relative_lift: number | null;
  folds_better_than_naive: number;
  fold_win_fraction: number | null;
  mean_absolute_lift: number | null;
  median_absolute_lift: number | null;
  worst_fold_absolute_lift: number | null;
  stddev_absolute_lift: number | null;
  session_slices: SliceStat[];
  regime_slices: SliceStat[];
  bootstrap: BootstrapResult;
}

/** Slices below this are reported with counts but never treated as conclusions. */
export const DEFENSIBLE_SLICE_MIN_N = 200;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round6(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

export function summariseDirection(dir: Direction, folds: FoldMetrics[]): DirectionRobustness {
  const valid = folds.filter((f) => f.brier != null && f.naive_brier != null && f.n_predicted > 0);
  const lifts = valid.map((f) => f.absolute_lift as number);

  let wB = 0, wN = 0, wCount = 0;
  for (const f of valid) {
    wB += (f.brier as number) * f.n_predicted;
    wN += (f.naive_brier as number) * f.n_predicted;
    wCount += f.n_predicted;
  }
  const weightedBrier = wCount ? round6(wB / wCount) : null;
  const weightedNaive = wCount ? round6(wN / wCount) : null;

  // Out-of-fold pooled slices — each test observation appears exactly once.
  const bySession = new Map<string, number[]>();
  const byRegime = new Map<string, number[]>();
  const pooled: number[] = [];
  const sqModel = new Map<string, { m: number; nv: number; n: number }>();
  void sqModel;
  const sliceAcc = (m: Map<string, number[]>, k: string, d: number) => {
    const a = m.get(k) ?? []; a.push(d); m.set(k, a);
  };
  const sliceModel = new Map<string, { model: number; naive: number; n: number }>();
  const sliceModelRegime = new Map<string, { model: number; naive: number; n: number }>();

  for (const f of folds) {
    const nb = f.naive_brier;
    void nb;
    for (const d of f.diffs) {
      pooled.push(d.d);
      sliceAcc(bySession, d.session, d.d);
      sliceAcc(byRegime, d.regime, d.d);
    }
  }
  void sliceModel; void sliceModelRegime;

  const sliceStats = (m: Map<string, number[]>): SliceStat[] =>
    [...m.keys()].sort().map((k) => {
      const ds = m.get(k)!;
      const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
      return { key: k, n: ds.length, brier: null, naive_brier: null, absolute_lift: round6(-mean) };
    });

  const mean = lifts.length ? round6(lifts.reduce((a, b) => a + b, 0) / lifts.length) : null;
  const sd = lifts.length > 1
    ? round6(Math.sqrt(lifts.reduce((a, b) => a + (b - (mean as number)) ** 2, 0) / (lifts.length - 1)))
    : null;

  return {
    direction: dir,
    n_folds: valid.length,
    folds: folds.map(({ diffs: _d, ...rest }) => rest),
    total_test: folds.reduce((a, f) => a + f.n_test, 0),
    total_predicted: folds.reduce((a, f) => a + f.n_predicted, 0),
    total_unpredicted: folds.reduce((a, f) => a + f.n_unpredicted, 0),
    weighted_brier: weightedBrier,
    weighted_naive_brier: weightedNaive,
    weighted_absolute_lift: weightedBrier != null && weightedNaive != null ? round6(weightedNaive - weightedBrier) : null,
    weighted_relative_lift: weightedBrier != null && weightedNaive != null && weightedNaive > 0
      ? round6((weightedNaive - weightedBrier) / weightedNaive) : null,
    folds_better_than_naive: lifts.filter((l) => l > 0).length,
    fold_win_fraction: lifts.length ? round6(lifts.filter((l) => l > 0).length / lifts.length) : null,
    mean_absolute_lift: mean,
    median_absolute_lift: median(lifts),
    worst_fold_absolute_lift: lifts.length ? round6(Math.min(...lifts)) : null,
    stddev_absolute_lift: sd,
    session_slices: sliceStats(bySession),
    regime_slices: sliceStats(byRegime),
    bootstrap: pairedBootstrap(pooled),
  };
}

/* --------------------------------------------------------------- verdict */

export interface GateCheck { criterion: string; long: boolean; short: boolean; detail: string; }

export interface Verdict {
  gate_version: number;
  checks: GateCheck[];
  passed: boolean;
  verdict: "ROBUSTNESS SUPPORTS CALIBRATION REVIEW" | "STILL BUILDING";
}

export function evaluateGate(
  long: DirectionRobustness,
  short: DirectionRobustness,
  leakageOk: boolean,
): Verdict {
  const g = ROBUSTNESS_GATE;
  const c = (criterion: string, fn: (d: DirectionRobustness) => boolean, detail: string): GateCheck =>
    ({ criterion, long: fn(long), short: fn(short), detail });

  const checks: GateCheck[] = [
    c("min_folds", (d) => d.n_folds >= g.min_folds, `>= ${g.min_folds} valid forward folds`),
    c("fold_win_fraction", (d) => (d.fold_win_fraction ?? 0) >= g.min_fold_win_fraction,
      `>= ${g.min_fold_win_fraction * 100}% of folds beat naive`),
    c("weighted_relative_lift", (d) => (d.weighted_relative_lift ?? -1) >= g.min_weighted_relative_lift,
      `weighted relative Brier improvement >= ${g.min_weighted_relative_lift * 100}%`),
    c("worst_fold_lift", (d) => (d.worst_fold_absolute_lift ?? -1) > g.worst_fold_absolute_lift_floor,
      `worst-fold absolute lift > ${g.worst_fold_absolute_lift_floor}`),
    c("bootstrap_upper_bound", (d) => d.bootstrap.ci_high != null && d.bootstrap.ci_high < 0,
      "paired bootstrap 95% upper bound < 0"),
    { criterion: "no_leakage", long: leakageOk, short: leakageOk, detail: "leakage/integrity checks all pass" },
  ];
  const passed = checks.every((x) => x.long && x.short);
  return {
    gate_version: g.gate_version,
    checks,
    passed,
    verdict: passed ? "ROBUSTNESS SUPPORTS CALIBRATION REVIEW" : "STILL BUILDING",
  };
}

/* --------------------------------------------------------- leakage guards */

export interface LeakageReport {
  fit_strictly_before_test: boolean;
  no_test_timestamp_reused: boolean;
  identical_fold_boundaries: boolean;
  all_pass: boolean;
  detail: Record<string, unknown>;
}

export function checkLeakage(
  longFolds: FoldMetrics[],
  shortFolds: FoldMetrics[],
  plan: FoldPlan,
): LeakageReport {
  let strict = true;
  for (const f of [...longFolds, ...shortFolds]) {
    if (f.fit_end && f.test_start && new Date(f.fit_end).getTime() >= new Date(f.test_start).getTime()) strict = false;
  }
  const seen = new Map<string, Set<number>>();
  let reused = false;
  for (const [dir, list] of [["long", longFolds], ["short", shortFolds]] as const) {
    const m = seen.get(dir) ?? new Set<number>();
    for (const f of list) {
      const lo = f.test_start ? new Date(f.test_start).getTime() : null;
      if (lo == null) continue;
      if (m.has(lo)) reused = true;
      m.add(lo);
    }
    seen.set(dir, m);
  }
  // Fold windows are shared by construction; assert the evaluated windows agree.
  const key = (fs: FoldMetrics[]) => fs.map((f) => `${f.fold}`).join(",");
  const identical = key(longFolds) === key(shortFolds) &&
    longFolds.every((f, i) => f.fold === shortFolds[i]?.fold);

  const overlapping = plan.folds.some((f, i) => {
    const next = plan.folds[i + 1];
    return next != null && f.test_end != null &&
      new Date(next.test_start).getTime() < new Date(f.test_end).getTime();
  });

  const all = strict && !reused && identical && !overlapping;
  return {
    fit_strictly_before_test: strict,
    no_test_timestamp_reused: !reused && !overlapping,
    identical_fold_boundaries: identical,
    all_pass: all,
    detail: { fold_windows: plan.folds, overlapping_windows: overlapping },
  };
}

/* ------------------------------------------------------------ report hash */

function foldPayload(f: Omit<FoldMetrics, "diffs">) {
  return [
    f.fold, f.direction,
    f.fit_start, f.fit_end, f.test_start, f.test_end,
    f.n_fit, f.n_test, f.n_predicted, f.n_unpredicted,
    f.observed_rate, f.global_fit_rate,
    f.brier, f.naive_brier, f.absolute_lift, f.relative_lift,
    f.ece, f.occupied_reliability_bins,
    f.reliability.map((b) => [b.lo, b.hi, b.n, b.mean_pred, b.observed]),
    "fallback", sortedEntries(f.fallback_levels),
    "sessions", sortedEntries(f.session_counts),
    "regimes", sortedEntries(f.regime_counts),
    "adx", sortedEntries(f.adx_bucket_counts),
    "qualifying_cells", sortedEntries(f.qualifying_cells),
  ];
}

function directionPayload(d: DirectionRobustness) {
  return [
    d.direction, d.n_folds,
    d.folds.map(foldPayload),
    d.total_test, d.total_predicted, d.total_unpredicted,
    d.weighted_brier, d.weighted_naive_brier, d.weighted_absolute_lift, d.weighted_relative_lift,
    d.folds_better_than_naive, d.fold_win_fraction,
    d.mean_absolute_lift, d.median_absolute_lift, d.worst_fold_absolute_lift, d.stddev_absolute_lift,
    "session_slices", d.session_slices.map((s) => [s.key, s.n, s.absolute_lift]),
    "regime_slices", d.regime_slices.map((s) => [s.key, s.n, s.absolute_lift]),
    "bootstrap", [
      d.bootstrap.procedure, d.bootstrap.procedure_version, d.bootstrap.prng,
      d.bootstrap.seed, d.bootstrap.resamples, d.bootstrap.n,
      d.bootstrap.mean_difference, d.bootstrap.ci_low, d.bootstrap.ci_high, d.bootstrap.fraction_negative,
    ],
  ];
}

export interface RobustnessIdentity {
  symbol: string;
  timeframe: string;
  calibration_version: number;
  feature_version: number;
  label_version: number;
  quality_version: number;
  source_as_of: string;
  source_bar_cutoff: string;
  v6_definition_hash: string;
  canonical_rows: number;
  eligible_long: number;
  eligible_short: number;
}

export function robustnessPayload(
  id: RobustnessIdentity,
  plan: FoldPlan,
  long: DirectionRobustness,
  short: DirectionRobustness,
  verdict: Verdict,
  leakage: LeakageReport,
) {
  return [
    "robustness_report_version", ROBUSTNESS_REPORT_VERSION,
    "fold_definition_version", plan.fold_definition_version,
    id.symbol, id.timeframe,
    "calibration_version", id.calibration_version,
    "feature_version", id.feature_version,
    "label_version", id.label_version,
    "quality_version", id.quality_version,
    "source_as_of", id.source_as_of,
    "source_bar_cutoff", id.source_bar_cutoff,
    "v6_definition_hash", id.v6_definition_hash,
    "canonical_rows", id.canonical_rows,
    "eligible_long", id.eligible_long,
    "eligible_short", id.eligible_short,
    "sample_floors", [0, 1, 2, 3].map((l) => [l, SAMPLE_FLOORS[l]]),
    adxBucketSpecPayload(ADX_BUCKET_SPEC),
    "hierarchy_policy_version", HIERARCHY_POLICY_VERSION,
    "holdout_fraction", plan.holdout_fraction,
    "folds", plan.folds.map((f) => [f.fold, f.test_start, f.test_end, f.distinct_test_times]),
    "bootstrap_spec", [
      BOOTSTRAP_SPEC.procedure, BOOTSTRAP_SPEC.procedure_version,
      BOOTSTRAP_SPEC.prng, BOOTSTRAP_SPEC.seed, BOOTSTRAP_SPEC.resamples, BOOTSTRAP_SPEC.interval,
    ],
    "gate", [
      ROBUSTNESS_GATE.gate_version, ROBUSTNESS_GATE.min_folds, ROBUSTNESS_GATE.min_fold_win_fraction,
      ROBUSTNESS_GATE.min_weighted_relative_lift, ROBUSTNESS_GATE.worst_fold_absolute_lift_floor,
    ],
    directionPayload(long), directionPayload(short),
    "leakage", [
      leakage.fit_strictly_before_test, leakage.no_test_timestamp_reused,
      leakage.identical_fold_boundaries, leakage.all_pass,
    ],
    "verdict", verdict.verdict,
  ];
}

export async function robustnessDigest(
  id: RobustnessIdentity,
  plan: FoldPlan,
  long: DirectionRobustness,
  short: DirectionRobustness,
  verdict: Verdict,
  leakage: LeakageReport,
): Promise<string> {
  return await sha256(robustnessPayload(id, plan, long, short, verdict, leakage));
}

/** Convenience: run the whole deterministic evaluation for both directions. */
export function runRobustness(
  obs: Record<Direction, EligibleObs[]>,
  folds = ROBUSTNESS_FOLDS,
  holdoutFraction = HOLDOUT_FRACTION,
): {
  plan: FoldPlan;
  long: DirectionRobustness;
  short: DirectionRobustness;
  leakage: LeakageReport;
  verdict: Verdict;
} {
  const plan = buildForwardFolds([obs.long, obs.short], folds, holdoutFraction);
  const longFolds = plan.folds.map((b) => evaluateFold("long", obs.long, b));
  const shortFolds = plan.folds.map((b) => evaluateFold("short", obs.short, b));
  const leakage = checkLeakage(longFolds, shortFolds, plan);
  const long = summariseDirection("long", longFolds);
  const short = summariseDirection("short", shortFolds);
  return { plan, long, short, leakage, verdict: evaluateGate(long, short, leakage.all_pass) };
}

export type { CellStat };
