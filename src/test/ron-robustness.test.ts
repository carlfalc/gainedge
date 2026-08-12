/**
 * Phase 2B.3 — deterministic robustness evaluator tests (research only).
 * Proves fold construction, leakage guards, determinism and gate conservatism.
 */
import { describe, it, expect } from "vitest";
import {
  buildForwardFolds, evaluateFold, runRobustness, robustnessDigest,
  pairedBootstrap, mulberry32, evaluateGate, checkLeakage,
  ROBUSTNESS_FOLDS, ROBUSTNESS_GATE, BOOTSTRAP_SPEC, FOLD_DEFINITION_VERSION,
  type RobustnessIdentity,
} from "../../supabase/functions/_shared/ron-robustness";
import type { Direction, EligibleObs } from "../../supabase/functions/_shared/ron-calibration";

const SESSIONS = ["asian", "london", "newyork"];
const REGIMES = ["trend", "range"];
const ADX = ["adx_lt_20", "adx_20_30", "adx_gte_30"];

/** Deterministic synthetic eligible observations on a 15m grid. */
function makeObs(n: number, seedOffset = 0): EligibleObs[] {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const rand = mulberry32(1234 + seedOffset);
  return Array.from({ length: n }, (_, i) => {
    const t = start + i * 15 * 60_000;
    return {
      bar_time: new Date(t).toISOString(), t,
      session: SESSIONS[i % SESSIONS.length],
      regime: REGIMES[i % REGIMES.length],
      adx_bucket: ADX[i % ADX.length],
      success: rand() < 0.5,
    };
  });
}

const ident = (): RobustnessIdentity => ({
  symbol: "XAUUSD", timeframe: "15m",
  calibration_version: 6, feature_version: 4, label_version: 5, quality_version: 3,
  source_as_of: "2026-08-12T06:09:00.000Z", source_bar_cutoff: "2026-08-12T04:45:00.000Z",
  v6_definition_hash: "deadbeef", canonical_rows: 11060, eligible_long: 5000, eligible_short: 5000,
});

describe("fold construction", () => {
  it("builds the requested number of non-overlapping forward folds", () => {
    const plan = buildForwardFolds([makeObs(4000)], ROBUSTNESS_FOLDS);
    expect(plan.fold_definition_version).toBe(FOLD_DEFINITION_VERSION);
    expect(plan.folds).toHaveLength(4);
    for (let i = 1; i < plan.folds.length; i++) {
      expect(Date.parse(plan.folds[i].test_start))
        .toBeGreaterThanOrEqual(Date.parse(plan.folds[i - 1].test_end!));
    }
    expect(plan.folds[plan.folds.length - 1].test_end).toBeNull();
  });

  it("LONG and SHORT share identical boundaries", () => {
    const l = makeObs(3000), s = makeObs(3000, 7);
    const plan = buildForwardFolds([l, s]);
    const lf = plan.folds.map((b) => evaluateFold("long", l, b));
    const sf = plan.folds.map((b) => evaluateFold("short", s, b));
    expect(lf.map((f) => f.fold)).toEqual(sf.map((f) => f.fold));
    expect(checkLeakage(lf, sf, plan).identical_fold_boundaries).toBe(true);
  });

  it("returns no folds when data is insufficient", () => {
    expect(buildForwardFolds([makeObs(3)]).folds).toHaveLength(0);
  });

  it("is invariant to input row order", () => {
    const obs = makeObs(2000);
    const shuffled = [...obs].reverse();
    const a = buildForwardFolds([obs]);
    const b = buildForwardFolds([shuffled]);
    expect(b).toEqual(a);
    expect(evaluateFold("long", shuffled, a.folds[0])).toEqual(evaluateFold("long", obs, a.folds[0]));
  });
});

describe("leakage guards", () => {
  it("every fold's fit max timestamp is strictly before its test min timestamp", () => {
    const obs = { long: makeObs(4000), short: makeObs(4000, 3) } as Record<Direction, EligibleObs[]>;
    const r = runRobustness(obs);
    for (const d of [r.long, r.short]) {
      for (const f of d.folds) {
        if (f.fit_end && f.test_start) {
          expect(Date.parse(f.fit_end)).toBeLessThan(Date.parse(f.test_start));
        }
      }
    }
    expect(r.leakage.all_pass).toBe(true);
  });

  it("no timestamp appears in more than one test fold", () => {
    const obs = makeObs(4000);
    const plan = buildForwardFolds([obs]);
    const seen = new Set<number>();
    for (const b of plan.folds) {
      const lo = Date.parse(b.test_start);
      const hi = b.test_end == null ? Infinity : Date.parse(b.test_end);
      for (const o of obs) {
        if (o.t >= lo && o.t < hi) {
          expect(seen.has(o.t)).toBe(false);
          seen.add(o.t);
        }
      }
    }
  });

  it("fit sets grow monotonically and never include test rows", () => {
    const obs = makeObs(4000);
    const plan = buildForwardFolds([obs]);
    let prev = -1;
    for (const b of plan.folds) {
      const f = evaluateFold("long", obs, b);
      expect(f.n_fit).toBeGreaterThan(prev);
      prev = f.n_fit;
      const lo = Date.parse(b.test_start);
      expect(obs.filter((o) => o.t < lo).length).toBe(f.n_fit);
    }
  });
});

describe("bootstrap", () => {
  it("is deterministic for a fixed seed", () => {
    const d = Array.from({ length: 500 }, (_, i) => (i % 7) / 1000 - 0.003);
    expect(pairedBootstrap(d)).toEqual(pairedBootstrap(d));
  });

  it("detects a clearly negative mean difference", () => {
    const d = Array.from({ length: 1000 }, () => -0.05);
    const r = pairedBootstrap(d);
    expect(r.mean_difference).toBeCloseTo(-0.05, 6);
    expect(r.ci_high!).toBeLessThan(0);
    expect(r.resamples).toBe(BOOTSTRAP_SPEC.resamples);
  });

  it("does not claim significance for pure noise", () => {
    const rand = mulberry32(99);
    const d = Array.from({ length: 2000 }, () => rand() - 0.5);
    expect(pairedBootstrap(d).ci_high!).toBeGreaterThan(0);
  });

  it("handles an empty difference vector", () => {
    expect(pairedBootstrap([]).mean_difference).toBeNull();
  });
});

describe("determinism digest", () => {
  it("identical frozen input yields an identical digest", async () => {
    const obs = { long: makeObs(4000), short: makeObs(4000, 3) } as Record<Direction, EligibleObs[]>;
    const a = runRobustness(obs);
    const b = runRobustness({ long: [...obs.long].reverse(), short: [...obs.short].reverse() });
    const ha = await robustnessDigest(ident(), a.plan, a.long, a.short, a.verdict, a.leakage);
    const hb = await robustnessDigest(ident(), b.plan, b.long, b.short, b.verdict, b.leakage);
    expect(hb).toBe(ha);
  });

  it("digest changes when the frozen source cut changes", async () => {
    const obs = { long: makeObs(4000), short: makeObs(4000, 3) } as Record<Direction, EligibleObs[]>;
    const r = runRobustness(obs);
    const h1 = await robustnessDigest(ident(), r.plan, r.long, r.short, r.verdict, r.leakage);
    const h2 = await robustnessDigest(
      { ...ident(), source_as_of: "2026-08-12T07:09:00.000Z" }, r.plan, r.long, r.short, r.verdict, r.leakage);
    expect(h2).not.toBe(h1);
  });
});

describe("predeclared gate", () => {
  it("stays STILL BUILDING on random-noise evidence", () => {
    const obs = { long: makeObs(4000), short: makeObs(4000, 3) } as Record<Direction, EligibleObs[]>;
    const r = runRobustness(obs);
    expect(r.verdict.verdict).toBe("STILL BUILDING");
    expect(r.verdict.passed).toBe(false);
  });

  it("fails when leakage checks fail even if metrics look good", () => {
    const strong = {
      direction: "long" as Direction, n_folds: 4, folds: [],
      total_test: 100, total_predicted: 100, total_unpredicted: 0,
      weighted_brier: 0.2, weighted_naive_brier: 0.25,
      weighted_absolute_lift: 0.05, weighted_relative_lift: 0.2,
      folds_better_than_naive: 4, fold_win_fraction: 1,
      mean_absolute_lift: 0.05, median_absolute_lift: 0.05,
      worst_fold_absolute_lift: 0.02, stddev_absolute_lift: 0.01,
      session_slices: [], regime_slices: [],
      bootstrap: { ...pairedBootstrap([-0.05, -0.05]), ci_high: -0.01 },
    };
    expect(evaluateGate(strong, { ...strong, direction: "short" }, true).passed).toBe(true);
    expect(evaluateGate(strong, { ...strong, direction: "short" }, false).verdict).toBe("STILL BUILDING");
  });

  it("gate thresholds are the predeclared values", () => {
    expect(ROBUSTNESS_GATE).toMatchObject({
      min_folds: 4, min_fold_win_fraction: 0.75,
      min_weighted_relative_lift: 0.02, worst_fold_absolute_lift_floor: -0.005,
    });
  });
});
