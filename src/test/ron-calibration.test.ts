/**
 * Phase 2B pure-function proofs for the empirical calibration foundation.
 * SYNTHETIC FIXTURES ONLY — nothing here is market data or a trading claim.
 */
import { describe, it, expect } from "vitest";
import {
  adxBucket, brier, calibrateDirection, cellKey, chronoSplit, ece, eligibleFor,
  reliabilityBins, resolvePrediction, buildCells, wilson95, SAMPLE_FLOORS,
  type CalibrationInputRow, type EligibleObs,
} from "../../supabase/functions/_shared/ron-calibration";

const base: CalibrationInputRow = {
  bar_time: "2026-03-02T12:00:00.000Z",
  session: "london", regime: "trending_up", adx: 25,
  long_event_eligible: true, long_success: true,
  short_event_eligible: true, short_success: false,
  coverage_ok: true, coverage_class: "complete", atr_at_anchor: 1.5,
};

const obsAt = (mins: number, success: boolean, o: Partial<EligibleObs> = {}): EligibleObs => ({
  bar_time: new Date(Date.UTC(2026, 2, 1) + mins * 60_000).toISOString(),
  t: Date.UTC(2026, 2, 1) + mins * 60_000,
  session: "london", regime: "trending_up", adx_bucket: "adx_20_30", success, ...o,
});

describe("eligibility gate — nothing ambiguous may ever be counted", () => {
  it("accepts a fully covered, ATR-known, eligible event", () => {
    expect(eligibleFor(base, "long")?.success).toBe(true);
    expect(eligibleFor(base, "short")?.success).toBe(false);
  });

  it.each([
    ["coverage failure", { coverage_ok: false }],
    ["session boundary", { coverage_class: "market_session_boundary", coverage_ok: false }],
    ["genuine data gap", { coverage_class: "genuine_data_gap", coverage_ok: false }],
    ["mixed gap", { coverage_class: "mixed_boundary_and_data_gap", coverage_ok: false }],
    ["off-grid / duplicate", { coverage_class: "other_incomplete", coverage_ok: false }],
    ["horizon not elapsed", { coverage_class: "horizon_not_elapsed", coverage_ok: false }],
    ["missing ATR", { atr_at_anchor: null, coverage_class: "missing_atr" }],
    ["same-bar ambiguous", { long_event_eligible: false, long_success: null }],
  ])("rejects %s", (_label, patch) => {
    expect(eligibleFor({ ...base, ...(patch as object) }, "long")).toBeNull();
  });

  it("adverse-first and neither both count as observed failures, not exclusions", () => {
    expect(eligibleFor({ ...base, long_success: false }, "long")?.success).toBe(false);
  });
});

describe("coarse dimensions", () => {
  it("buckets ADX into three coarse bands", () => {
    expect([adxBucket(0), adxBucket(19.99), adxBucket(20), adxBucket(29.99), adxBucket(30), adxBucket(null)])
      .toEqual(["adx_lt20", "adx_lt20", "adx_20_30", "adx_20_30", "adx_gte30", "unknown"]);
  });
  it("builds nested deterministic cell keys", () => {
    const o = { session: "london", regime: "trending_up", adx_bucket: "adx_20_30" };
    expect([0, 1, 2, 3].map((l) => cellKey(l, "long", o))).toEqual([
      "dir=long",
      "dir=long|session=london",
      "dir=long|session=london|regime=trending_up",
      "dir=long|session=london|regime=trending_up|adx=adx_20_30",
    ]);
  });
});

describe("statistics fixtures", () => {
  it("Wilson 95% matches the textbook value for 50/100", () => {
    const w = wilson95(50, 100)!;
    expect(w.low).toBeCloseTo(0.404, 3);
    expect(w.high).toBeCloseTo(0.596, 3);
  });
  it("Wilson is defined and wide for tiny samples, null for empty", () => {
    const w = wilson95(1, 2)!;
    expect(w.high - w.low).toBeGreaterThan(0.6);
    expect(wilson95(0, 0)).toBeNull();
  });
  it("Brier of a perfect forecaster is 0 and of an always-wrong forecaster is 1", () => {
    expect(brier([{ p: 1, y: true }, { p: 0, y: false }])).toBe(0);
    expect(brier([{ p: 0, y: true }, { p: 1, y: false }])).toBe(1);
    expect(brier([{ p: 0.5, y: true }, { p: 0.5, y: false }])).toBe(0.25);
  });
  it("ECE is 0 for a perfectly calibrated fixture and equals the gap otherwise", () => {
    const perfect = [
      ...Array.from({ length: 5 }, () => ({ p: 0.5, y: true })),
      ...Array.from({ length: 5 }, () => ({ p: 0.5, y: false })),
    ];
    expect(ece(perfect)).toBe(0);
    const skewed = Array.from({ length: 10 }, () => ({ p: 0.9, y: false }));
    expect(ece(skewed)).toBeCloseTo(0.9, 6);
  });
  it("reliability bins are fixed width and account for every prediction", () => {
    const bins = reliabilityBins([{ p: 0, y: true }, { p: 0.55, y: false }, { p: 1, y: true }]);
    expect(bins).toHaveLength(10);
    expect(bins.reduce((s, b) => s + b.n, 0)).toBe(3);
    expect(bins[9].n).toBe(1);
    expect(bins[5].observed).toBe(0);
  });
});

describe("chronological split and leakage", () => {
  const obs = Array.from({ length: 100 }, (_, i) => obsAt(i, i % 2 === 0));

  it("splits strictly by time with no randomisation and a stable cutoff", () => {
    const a = chronoSplit(obs, 0.3);
    const b = chronoSplit([...obs].reverse(), 0.3);
    expect(a.cutoff).toBe(b.cutoff);
    expect([a.fit.length, a.holdout.length]).toEqual([70, 30]);
    expect(new Date(a.fit.at(-1)!.bar_time).getTime()).toBeLessThan(new Date(a.cutoff!).getTime());
    expect(new Date(a.holdout[0].bar_time).getTime()).toBe(new Date(a.cutoff!).getTime());
  });

  it("no holdout observation can contribute to any fit count (leakage proof)", () => {
    const { fit, holdout } = chronoSplit(obs, 0.3);
    const cells = buildCells("long", fit, holdout);
    const l0 = cells.find((c) => c.level === 0)!;
    expect(l0.n_fit).toBe(fit.length);
    expect(l0.n_fit + l0.n_holdout).toBe(obs.length);
    expect(fit.every((f) => f.t < new Date(holdout[0].bar_time).getTime())).toBe(true);
  });
});

describe("hierarchy resolution and sample floors", () => {
  it("falls back deterministically to broader cells, then global, then null", () => {
    const fit = Array.from({ length: SAMPLE_FLOORS[0] + 10 }, (_, i) => obsAt(i, i % 4 === 0));
    const cells = buildCells("long", fit, []);
    const map = new Map(cells.map((c) => [c.cell_key, c]));
    const probe = obsAt(999, true);

    // L3/L2 are populated but below their higher floors => resolution steps up to L1.
    expect(map.get(cellKey(3, "long", probe))!.meets_sample_floor).toBe(false);
    expect(map.get(cellKey(2, "long", probe))!.meets_sample_floor).toBe(false);
    const r = resolvePrediction(map, "long", probe);
    expect(r.level).toBe(1);
    expect(r.cell_key).toBe("dir=long|session=london");

    // An unseen dimension combination resolves to global, never to an invented cell.
    const unseen = obsAt(1000, true, { session: "asia", regime: "range", adx_bucket: "adx_gte30" });
    expect(resolvePrediction(map, "long", unseen).level).toBe(0);

    // With no qualifying cell at all, prediction is null — never a guess.
    const tiny = new Map(buildCells("long", fit.slice(0, 5), []).map((c) => [c.cell_key, c]));
    expect(resolvePrediction(tiny, "long", probe)).toEqual({ p: null, level: null, cell_key: null });
  });

  it("holdout-only cells are never invented", () => {
    const fit = [obsAt(0, true)];
    const holdout = [obsAt(100, true, { session: "asia" })];
    const cells = buildCells("long", fit, holdout);
    expect(cells.some((c) => c.dim_session === "asia")).toBe(false);
  });
});

describe("direction reports are deterministic and separate", () => {
  it("produces identical output on repeated runs and independent long/short results", () => {
    const long = Array.from({ length: 400 }, (_, i) => obsAt(i, i % 3 === 0));
    const short = Array.from({ length: 400 }, (_, i) => obsAt(i, i % 5 === 0));
    const a = calibrateDirection("long", long);
    const b = calibrateDirection("long", [...long].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const s = calibrateDirection("short", short);
    expect(s.global_fit_rate).not.toBe(a.global_fit_rate);
    expect(a.n_predicted + a.n_unpredicted).toBe(a.n_holdout);
  });
});
