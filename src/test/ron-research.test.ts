/**
 * Phase 2D.1 — RON_STATE_SPEC_V1 + purged walk-forward research tests (research only).
 * Proves deterministic state derivation, purge/embargo correctness, fold admissibility,
 * gate conservatism and byte-stable hashing.
 */
import { describe, it, expect } from "vitest";
import {
  deriveStateV1, stateSpecPayload, RON_STATE_VARIABLES, RON_STATE_TOLERANCES,
} from "../../supabase/functions/_shared/ron-state-spec";
import {
  deriveStateV2, stateSpecPayloadV2, RON_STATE_SPEC_VERSION_V2,
} from "../../supabase/functions/_shared/ron-state-spec";
import {
  buildPurgedFolds, evaluateCandidateFold, evaluateCandidate, buildCandidateSet,
  candidateSpecPayload, researchDigest, topBuckets, bucketKeyFor,
  PURGE_MINUTES, PROMOTION_GATE, MIN_TEST_OBS_PER_FOLD, BASELINE_CANDIDATE,
  type ResearchObs, type CandidateSpec,
} from "../../supabase/functions/_shared/ron-research";
import {
  buildCoverageEpochs, buildGapAwareFolds, topBucketsV2,
  COVERAGE_EPOCH_GAP_HOURS, RESEARCH_VERSION,
} from "../../supabase/functions/_shared/ron-research";

const FEATURES = {
  regime: "trending_up", adx14: 27.4, volatility_regime: "normal", ema_stack: "up",
  macd_state: "bullish_expanding", rsi14: 58.2, rsi14_slope3: 1.1, stoch_rsi: 72,
  di_plus: 26, di_minus: 14, ha_state: "bullish",
  structure: { higher_high: true, higher_low: true, lower_high: false, lower_low: false },
  position_in_day_range_pct: 81, volume_available: true, relative_volume: 1.4,
  dist_to_support_pct: 0.2, dist_to_resistance_pct: 0.9, atr_pct: 0.4,
};

function obsSeries(n: number, flip = 7): ResearchObs[] {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  return Array.from({ length: n }, (_, i) => {
    const t = start + i * 15 * 60_000;
    const state = deriveStateV1(
      { ...FEATURES, adx14: i % 3 === 0 ? 12 : 27.4, regime: i % 2 ? "ranging" : "trending_up" },
      i % 5 === 0 ? [{ direction: "bullish" }] : [],
      i % 4 === 0 ? "london" : "newyork",
    );
    return { bar_time: new Date(t).toISOString(), t, success: i % flip !== 0, state };
  });
}

describe("RON_STATE_SPEC_V1", () => {
  it("derives every declared variable deterministically", () => {
    const a = deriveStateV1(FEATURES, [{ direction: "bullish" }], "london");
    const b = deriveStateV1(FEATURES, [{ direction: "bullish" }], "london");
    expect(a).toEqual(b);
    for (const v of RON_STATE_VARIABLES) expect(typeof a[v]).toBe("string");
    expect(a.session).toBe("london");
    expect(a.regime).toBe("trending_up");
    expect(a.adx_bucket).toBe("adx_20_30");
    expect(a.rsi_zone).toBe("rsi_55_65");
    expect(a.stoch_zone).toBe("stoch_60_80");
    expect(a.di_dominance).toBe("plus");
    expect(a.structure_bias).toBe("bullish");
    expect(a.position_day_bucket).toBe("pos_gte75");
    expect(a.relative_volume_bucket).toBe("rvol_gt1_2");
    expect(a.pattern_bias).toBe("bullish_only");
    expect(a.pattern_count_bucket).toBe("patterns_1");
    expect(a.nearest_level_side).toBe("support_closer");
    expect(a.nearest_level_atr_bucket).toBe("lvl_0_5_1atr");   // 0.2 / 0.4 = 0.5 ATR
  });

  it("never imputes missing inputs", () => {
    const s = deriveStateV1({}, null, null);
    expect(s.regime).toBe("unknown");
    expect(s.rsi_zone).toBe("unknown");
    expect(s.nearest_level_side).toBe("unavailable");
    expect(s.nearest_level_atr_bucket).toBe("unavailable");
    expect(s.pattern_bias).toBe("none");
  });

  it("treats volume_available=false as unknown relative volume", () => {
    const s = deriveStateV1({ ...FEATURES, volume_available: false }, [], "london");
    expect(s.relative_volume_bucket).toBe("unknown");
  });

  it("applies the predeclared flat tolerance to rsi slope", () => {
    const flat = deriveStateV1({ ...FEATURES, rsi14_slope3: RON_STATE_TOLERANCES.rsi_slope_flat_abs }, [], "london");
    const rising = deriveStateV1({ ...FEATURES, rsi14_slope3: RON_STATE_TOLERANCES.rsi_slope_flat_abs + 0.01 }, [], "london");
    expect(flat.rsi_slope_sign).toBe("flat");
    expect(rising.rsi_slope_sign).toBe("rising");
  });

  it("mixed patterns and mixed structure resolve to mixed", () => {
    const s = deriveStateV1(
      { ...FEATURES, structure: { higher_high: true, lower_low: true } },
      [{ direction: "bullish" }, { direction: "bearish" }], "asian",
    );
    expect(s.structure_bias).toBe("mixed");
    expect(s.pattern_bias).toBe("mixed");
    expect(s.pattern_count_bucket).toBe("patterns_2plus");
  });
});

describe("purged walk-forward folds", () => {
  it("reduces fold count rather than accepting undersized test blocks", () => {
    const small = obsSeries(600);
    const plan = buildPurgedFolds([small, small], 4);
    expect(plan.accepted_folds).toBeLessThan(4);
    expect(plan.reduction_reason).toBeTruthy();
  });

  it("builds four folds with defensible test sizes on a large series", () => {
    const big = obsSeries(6000);
    const plan = buildPurgedFolds([big, big], 4);
    expect(plan.accepted_folds).toBe(4);
    expect(plan.purge_minutes).toBe(PURGE_MINUTES);
    for (const f of plan.folds) {
      expect(new Date(f.purge_start).getTime())
        .toBe(new Date(f.test_start).getTime() - PURGE_MINUTES * 60_000);
    }
    // folds are contiguous and strictly forward
    for (let i = 1; i < plan.folds.length; i++) {
      expect(plan.folds[i - 1].test_end).toBe(plan.folds[i].test_start);
    }
    const counts = plan.folds.map((f) => {
      const lo = new Date(f.test_start).getTime();
      const hi = f.test_end == null ? Infinity : new Date(f.test_end).getTime();
      return big.filter((o) => o.t >= lo && o.t < hi).length;
    });
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(MIN_TEST_OBS_PER_FOLD);
  });

  it("is deterministic for identical inputs", () => {
    const s = obsSeries(6000);
    expect(buildPurgedFolds([s, s], 4)).toEqual(buildPurgedFolds([s, s], 4));
  });
});

describe("fold evaluation", () => {
  const spec: CandidateSpec = { name: "regime", kind: "single", variables: ["regime"], floor: 200 };

  it("never trains on an anchor whose horizon overlaps the test window", () => {
    const s = obsSeries(6000);
    const plan = buildPurgedFolds([s, s], 4);
    for (const b of plan.folds) {
      const r = evaluateCandidateFold(spec, s, b);
      const testStart = new Date(b.test_start).getTime();
      expect(new Date(r.train_end!).getTime() + PURGE_MINUTES * 60_000).toBeLessThanOrEqual(testStart);
      expect(r.n_purged).toBeGreaterThan(0);
      expect(r.n_test).toBeGreaterThan(0);
    }
  });

  it("falls back to the train global rate when a bucket misses its floor", () => {
    const s = obsSeries(6000);
    const plan = buildPurgedFolds([s, s], 4);
    const strict: CandidateSpec = { ...spec, floor: 10_000_000 };
    const r = evaluateCandidateFold(strict, s, plan.folds[0]);
    expect(r.n_non_global).toBe(0);
    expect(r.brier).toBe(r.naive_brier);
  });

  it("bucket keys are pure functions of the state vector", () => {
    const st = deriveStateV1(FEATURES, [], "london");
    expect(bucketKeyFor({ name: "x", kind: "pair", variables: ["session", "regime"], floor: 300 }, st))
      .toBe("session=london|regime=trending_up");
  });
});

describe("candidate evaluation, gate and hashes", () => {
  it("produces byte-identical result hashes on re-run", async () => {
    const s = obsSeries(6000);
    const plan = buildPurgedFolds([s, s], 4);
    const base = await evaluateCandidate(BASELINE_CANDIDATE, "long", s, plan, null, "defhash");
    const a = await evaluateCandidate(
      { name: "regime", kind: "single", variables: ["regime"], floor: 200 },
      "long", s, plan, base.folds, "defhash",
    );
    const b = await evaluateCandidate(
      { name: "regime", kind: "single", variables: ["regime"], floor: 200 },
      "long", s, plan, base.folds, "defhash",
    );
    expect(a.result.result_hash).toBe(b.result.result_hash);
    expect(a.result.folds.length).toBe(plan.accepted_folds);
    expect(await researchDigest("defhash", [a.result])).toBe(await researchDigest("defhash", [b.result]));
  });

  it("does not gate the reference champion and keeps the gate conservative", async () => {
    const s = obsSeries(6000);
    const plan = buildPurgedFolds([s, s], 4);
    const base = await evaluateCandidate(BASELINE_CANDIDATE, "long", s, plan, null, "d");
    expect(base.result.promising_for_2D2).toBe(false);
    expect(base.result.gate_reasons).toContain("reference_champion_not_gated");
    expect(PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline).toBe(0.0015);
    expect(PROMOTION_GATE.min_non_global_coverage).toBe(0.25);
  });

  it("candidate set is exactly the predeclared 1 baseline + 18 singles + 12 pairs", () => {
    const set = buildCandidateSet();
    expect(set.filter((c) => c.kind === "baseline_hierarchy").length).toBe(1);
    expect(set.filter((c) => c.kind === "single").length).toBe(18);
    expect(set.filter((c) => c.kind === "pair").length).toBe(12);
  });

  it("spec payloads are stable and hashable", () => {
    expect(JSON.stringify(stateSpecPayload())).toBe(JSON.stringify(stateSpecPayload()));
    expect(JSON.stringify(candidateSpecPayload())).toBe(JSON.stringify(candidateSpecPayload()));
  });

  it("top-bucket evidence respects the aggregate test-n floor", async () => {
    const s = obsSeries(6000);
    const plan = buildPurgedFolds([s, s], 4);
    const base = await evaluateCandidate(BASELINE_CANDIDATE, "long", s, plan, null, "d");
    const c = await evaluateCandidate(
      { name: "regime", kind: "single", variables: ["regime"], floor: 200 },
      "long", s, plan, base.folds, "d",
    );
    for (const row of topBuckets([c])) expect(row.oos_n).toBeGreaterThanOrEqual(200);
  });
});
/* ------------------------------------------------- Phase 2D.1a corrections */

const lvl = (ratio: number) => ({
  ...FEATURES, atr_pct: 1, dist_to_support_pct: ratio, dist_to_resistance_pct: 99,
});
const rvol = (v: number) => ({ ...FEATURES, volume_available: true, relative_volume: v });

describe("RON_STATE_SPEC_V2 exact interval boundaries", () => {
  it("is a separate, explicitly versioned spec", () => {
    expect(RON_STATE_SPEC_VERSION_V2).toBe(2);
    expect(RESEARCH_VERSION).toBe(2);
    expect(JSON.stringify(stateSpecPayloadV2())).not.toBe(JSON.stringify(stateSpecPayload()));
    expect(JSON.stringify(stateSpecPayloadV2())).toContain("interval_semantics");
    expect(JSON.stringify(stateSpecPayloadV2())).toBe(JSON.stringify(stateSpecPayloadV2()));
  });

  it("relative volume uses <0.8 ; [0.8,1.2] ; >1.2", () => {
    expect(deriveStateV2(rvol(0.79), [], "london").relative_volume_bucket).toBe("rvol_lt0_8");
    expect(deriveStateV2(rvol(0.8), [], "london").relative_volume_bucket).toBe("rvol_0_8_1_2");
    expect(deriveStateV2(rvol(1.2), [], "london").relative_volume_bucket).toBe("rvol_0_8_1_2");
    expect(deriveStateV2(rvol(1.2000001), [], "london").relative_volume_bucket).toBe("rvol_gt1_2");
    // V1 stays frozen with its exclusive-upper behaviour at exactly 1.2
    expect(deriveStateV1(rvol(1.2), [], "london").relative_volume_bucket).toBe("rvol_gt1_2");
  });

  it("nearest-level ATR ratio uses <=0.5 ; (0.5,1] ; (1,2] ; >2", () => {
    expect(deriveStateV2(lvl(0.49), [], "london").nearest_level_atr_bucket).toBe("lvl_lte0_5atr");
    expect(deriveStateV2(lvl(0.5), [], "london").nearest_level_atr_bucket).toBe("lvl_lte0_5atr");
    expect(deriveStateV2(lvl(0.51), [], "london").nearest_level_atr_bucket).toBe("lvl_0_5_1atr");
    expect(deriveStateV2(lvl(1), [], "london").nearest_level_atr_bucket).toBe("lvl_0_5_1atr");
    expect(deriveStateV2(lvl(1.01), [], "london").nearest_level_atr_bucket).toBe("lvl_1_2atr");
    expect(deriveStateV2(lvl(2), [], "london").nearest_level_atr_bucket).toBe("lvl_1_2atr");
    expect(deriveStateV2(lvl(2.01), [], "london").nearest_level_atr_bucket).toBe("lvl_gt2atr");
    // V1 frozen: exact 0.5 fell into the second bucket
    expect(deriveStateV1(lvl(0.5), [], "london").nearest_level_atr_bucket).toBe("lvl_0_5_1atr");
  });

  it("rsi / stoch / position bands keep left-closed right-open semantics", () => {
    expect(deriveStateV2({ ...FEATURES, rsi14: 35 }, [], "london").rsi_zone).toBe("rsi_35_45");
    expect(deriveStateV2({ ...FEATURES, rsi14: 34.99 }, [], "london").rsi_zone).toBe("rsi_lt35");
    expect(deriveStateV2({ ...FEATURES, rsi14: 65 }, [], "london").rsi_zone).toBe("rsi_gte65");
    expect(deriveStateV2({ ...FEATURES, stoch_rsi: 20 }, [], "london").stoch_zone).toBe("stoch_20_40");
    expect(deriveStateV2({ ...FEATURES, stoch_rsi: 80 }, [], "london").stoch_zone).toBe("stoch_gte80");
    expect(deriveStateV2({ ...FEATURES, position_in_day_range_pct: 25 }, [], "london").position_day_bucket).toBe("pos_25_50");
    expect(deriveStateV2({ ...FEATURES, position_in_day_range_pct: 75 }, [], "london").position_day_bucket).toBe("pos_gte75");
  });

  it("never imputes missing inputs", () => {
    const s = deriveStateV2({}, null, null);
    expect(s.rsi_zone).toBe("unknown");
    expect(s.relative_volume_bucket).toBe("unknown");
    expect(s.nearest_level_atr_bucket).toBe("unavailable");
  });
});

function gappedSeries(pre: number, post: number, gapHours: number): ResearchObs[] {
  const a = obsSeries(pre);
  const lastT = a[a.length - 1].t;
  const start = lastT + gapHours * 3_600_000;
  const b = Array.from({ length: post }, (_, i) => {
    const t = start + i * 15 * 60_000;
    return { ...a[i % a.length], bar_time: new Date(t).toISOString(), t };
  });
  return [...a, ...b];
}

describe("gap-aware coverage epochs and folds", () => {
  it("splits the timeline only on breaks beyond the frozen threshold", () => {
    const s = gappedSeries(3000, 3000, 24 * 77);
    const times = [...new Set(s.map((o) => o.t))].sort((a, b) => a - b);
    expect(buildCoverageEpochs(times).length).toBe(2);
    const weekendish = gappedSeries(3000, 3000, 50);
    const t2 = [...new Set(weekendish.map((o) => o.t))].sort((a, b) => a - b);
    expect(buildCoverageEpochs(t2).length).toBe(1);
    expect(COVERAGE_EPOCH_GAP_HOURS).toBe(72);
  });

  it("never allocates a test block that spans a coverage-epoch gap", () => {
    const s = gappedSeries(6000, 3000, 24 * 77);
    const plan = buildGapAwareFolds([s, s], 4);
    expect(plan.accepted_folds).toBeGreaterThanOrEqual(1);
    expect(plan.epochs.length).toBe(2);
    const epochIds = new Set(plan.folds.map((f) => f.coverage_epoch));
    expect(epochIds.size).toBeGreaterThan(1);
    for (const f of plan.folds) {
      expect(f.max_internal_gap_minutes).toBeLessThanOrEqual(COVERAGE_EPOCH_GAP_HOURS * 60);
      const lo = new Date(f.test_start).getTime();
      const hi = new Date(f.test_end!).getTime();
      expect(s.filter((o) => o.t >= lo && o.t < hi).length).toBeGreaterThanOrEqual(MIN_TEST_OBS_PER_FOLD);
      const ep = plan.epochs.find((e) => e.epoch === f.coverage_epoch)!;
      expect(lo).toBeGreaterThanOrEqual(new Date(ep.start).getTime());
      expect(hi).toBeLessThanOrEqual(new Date(ep.end).getTime() + 1);
    }
    expect(buildGapAwareFolds([s, s], 4)).toEqual(plan);
  });

  it("keeps the 60m purge rule at every boundary", () => {
    const s = gappedSeries(4000, 3000, 24 * 77);
    const plan = buildGapAwareFolds([s, s], 4);
    for (const b of plan.folds) {
      const r = evaluateCandidateFold(
        { name: "regime", kind: "single", variables: ["regime"], floor: 200 }, s, b,
      );
      expect(new Date(r.train_end!).getTime() + PURGE_MINUTES * 60_000)
        .toBeLessThanOrEqual(new Date(b.test_start).getTime());
    }
  });
});

describe("corrected stable-bucket accounting", () => {
  it("uses the latest floor-meeting fold as the train reference instead of pooling", async () => {
    const s = obsSeries(6000);
    const plan = buildGapAwareFolds([s, s], 4);
    const base = await evaluateCandidate(BASELINE_CANDIDATE, "long", s, plan, null, "d");
    const c = await evaluateCandidate(
      { name: "regime", kind: "single", variables: ["regime"], floor: 200 },
      "long", s, plan, base.folds, "d",
    );
    const rows = topBucketsV2([c]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.oos_n).toBeGreaterThanOrEqual(200);
      const ref = row.per_fold_train.find((p) => p.fold === row.train_reference_fold)!;
      expect(row.train_n).toBe(ref.n_train);
      expect(row.train_reference_fold).toBe(Math.max(...row.per_fold_train.map((p) => p.fold)));
      // never an inflated pseudo-sample
      const pooled = row.per_fold_train.reduce((a, p) => a + p.n_train, 0);
      if (row.per_fold_train.length > 1) expect(row.train_n).toBeLessThan(pooled);
    }
  });
});
