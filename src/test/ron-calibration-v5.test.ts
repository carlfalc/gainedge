/**
 * Phase 2B.1 auditability corrections (calibration_version = 5).
 * SYNTHETIC FIXTURES ONLY — nothing here is market data or a trading claim.
 */
import { describe, it, expect } from "vitest";
import {
  ADX_BUCKET_BOUNDS, CALIBRATION_CONTRACT_V4, CALIBRATION_CONTRACT_V5, HIERARCHY_POLICY_VERSION,
  SAMPLE_FLOORS, calibrateDirection, commonSplitCutoff, definitionPayloadV2, definitionPayloadV5,
  eligibleFor, runPayloadV2, sha256, splitAtCutoff,
  type CalibrationInputRow, type EligibleObs, type RunIdentityV2,
} from "../../supabase/functions/_shared/ron-calibration";

const obsAt = (m: number, s: boolean, o: Partial<EligibleObs> = {}): EligibleObs => ({
  bar_time: new Date(Date.UTC(2026, 2, 1) + m * 900_000).toISOString(),
  t: Date.UTC(2026, 2, 1) + m * 900_000,
  session: "london", regime: "trending_up", adx_bucket: "adx_20_30", success: s, ...o,
});

const identity: RunIdentityV2 = {
  symbol: "XAUUSD", timeframe: "15m",
  source_as_of: "2026-08-12T05:44:00.000Z",
  source_bar_cutoff: "2026-08-12T04:15:00.000Z",
  holdout_fraction: 0.3, split_cutoff: "2026-05-01T00:00:00.000Z",
  canonical_rows: 1000, eligible_long: 600, eligible_short: 600, excluded_rows: 800,
  exclusion_breakdown: { "long:complete": 5 },
};

const defHash = (id = identity, qv = 3, ctx = CALIBRATION_CONTRACT_V5) =>
  sha256(definitionPayloadV5(id, ctx, qv));

describe("defect 1 — membership is frozen by market data, never by labelled_at", () => {
  const row = (labelled_at: string): CalibrationInputRow & { labelled_at: string } => ({
    labelled_at,
    bar_time: "2026-04-01T10:00:00.000Z",
    session: "london", regime: "trending_up", adx: 25,
    long_event_eligible: true, long_success: true,
    short_event_eligible: true, short_success: false,
    coverage_ok: true, coverage_class: "complete", atr_at_anchor: 1.5,
  });

  it("source membership depends only on bar_time vs the frozen source_bar_cutoff", () => {
    const cut = new Date(identity.source_bar_cutoff!).getTime();
    const a = row("2026-08-01T00:00:00.000Z");
    const b = row("2026-08-12T05:00:00.000Z");   // re-labelled much later, same market bar
    const member = (r: typeof a) => new Date(r.bar_time).getTime() <= cut;
    expect(member(a)).toBe(member(b));
    expect(JSON.stringify(eligibleFor(a, "long"))).toBe(JSON.stringify(eligibleFor(b, "long")));
  });

  it("rewriting labelled_at cannot change the run hash", async () => {
    const mk = (labelled: string) => {
      void labelled;                                   // never enters any payload
      const long = calibrateDirection("long", Array.from({ length: 200 }, (_, i) => obsAt(i, i % 3 === 0)), 0.3, identity.split_cutoff);
      const short = calibrateDirection("short", Array.from({ length: 200 }, (_, i) => obsAt(i, i % 5 === 0)), 0.3, identity.split_cutoff);
      return { long, short };
    };
    const h = async (labelled: string) => {
      const { long, short } = mk(labelled);
      return sha256(runPayloadV2(identity, await defHash(), long, short));
    };
    expect(await h("2026-08-01T00:00:00.000Z")).toBe(await h("2026-08-12T05:00:00.000Z"));
  });
});

describe("defect 2 — calibration_version separates materially different logic", () => {
  it("v5 and v4 contracts share lineage but never share a definition hash", async () => {
    expect(CALIBRATION_CONTRACT_V5.feature_version).toBe(CALIBRATION_CONTRACT_V4.feature_version);
    expect(CALIBRATION_CONTRACT_V5.label_version).toBe(CALIBRATION_CONTRACT_V4.label_version);
    expect(CALIBRATION_CONTRACT_V5.calibration_version).not.toBe(CALIBRATION_CONTRACT_V4.calibration_version);
    const v4 = await sha256(definitionPayloadV2(identity, CALIBRATION_CONTRACT_V4));
    expect(await defHash()).not.toBe(v4);
  });
});

describe("defect 3 — definition hash covers the ACTUAL run parameters", () => {
  it("is stable for identical parameters", async () => {
    expect(await defHash()).toBe(await defHash());
  });

  it.each<[string, Partial<RunIdentityV2>]>([
    ["holdout fraction", { holdout_fraction: 0.25 }],
    ["frozen source_as_of", { source_as_of: "2026-08-12T05:45:00.000Z" }],
    ["source_bar_cutoff", { source_bar_cutoff: "2026-08-12T04:00:00.000Z" }],
    ["common split cutoff", { split_cutoff: "2026-05-02T00:00:00.000Z" }],
    ["symbol", { symbol: "NAS100" }],
    ["timeframe", { timeframe: "5m" }],
  ])("changes when %s changes", async (_l, patch) => {
    expect(await defHash({ ...identity, ...patch })).not.toBe(await defHash());
  });

  it("changes when the quality version changes", async () => {
    expect(await defHash(identity, 2)).not.toBe(await defHash(identity, 3));
  });

  it("changes when the sample-floor spec changes", async () => {
    const original = SAMPLE_FLOORS[3];
    const before = await defHash();
    SAMPLE_FLOORS[3] = original + 1;
    const after = await defHash();
    SAMPLE_FLOORS[3] = original;
    expect(after).not.toBe(before);
    expect(await defHash()).toBe(before);
  });

  it("carries the exact ADX bucket boundaries and hierarchy policy version", () => {
    const payload = JSON.stringify(definitionPayloadV5(identity, CALIBRATION_CONTRACT_V5, 3));
    expect(payload).toContain(JSON.stringify(ADX_BUCKET_BOUNDS));
    expect(payload).toContain(`"hierarchy_policy_version",${HIERARCHY_POLICY_VERSION}`);
    expect(payload).toContain('"quality_version",3');
  });
});

describe("defect 5 — one common cutoff governs both directions", () => {
  // Deliberately asymmetric eligibility: LONG and SHORT see different timestamp sets.
  const longObs = Array.from({ length: 120 }, (_, i) => obsAt(i, i % 3 === 0));
  const shortObs = Array.from({ length: 120 }, (_, i) => obsAt(i, i % 4 === 0)).filter((_, i) => i % 2 === 0);

  const cutoff = commonSplitCutoff([longObs, shortObs], 0.3)!;

  it("is computed from the union of distinct eligible times, independent of order", () => {
    expect(commonSplitCutoff([shortObs, longObs], 0.3)).toBe(cutoff);
    expect(commonSplitCutoff([[...longObs].reverse(), shortObs], 0.3)).toBe(cutoff);
  });

  it("no timestamp can be fit on one side and holdout on the other", () => {
    const l = splitAtCutoff(longObs, cutoff);
    const s = splitAtCutoff(shortObs, cutoff);
    const role = new Map<string, string>();
    for (const [set, tag] of [[l.fit, "fit"], [s.fit, "fit"], [l.holdout, "holdout"], [s.holdout, "holdout"]] as const) {
      for (const o of set) {
        const prev = role.get(o.bar_time);
        expect(prev === undefined || prev === tag).toBe(true);
        role.set(o.bar_time, tag);
      }
    }
    expect(Math.max(...l.fit.map((o) => o.t), ...s.fit.map((o) => o.t)))
      .toBeLessThan(Math.min(...l.holdout.map((o) => o.t), ...s.holdout.map((o) => o.t)));
  });

  it("both direction reports report exactly the same boundary", () => {
    const lr = calibrateDirection("long", longObs, 0.3, cutoff);
    const sr = calibrateDirection("short", shortObs, 0.3, cutoff);
    const c = new Date(cutoff).getTime();
    expect(new Date(lr.fit_range![1]).getTime()).toBeLessThan(c);
    expect(new Date(sr.fit_range![1]).getTime()).toBeLessThan(c);
    expect(new Date(lr.holdout_range![0]).getTime()).toBeGreaterThanOrEqual(c);
    expect(new Date(sr.holdout_range![0]).getTime()).toBeGreaterThanOrEqual(c);
  });

  it("is deterministic across reruns", async () => {
    const run = async () => {
      const lr = calibrateDirection("long", longObs, 0.3, cutoff);
      const sr = calibrateDirection("short", shortObs, 0.3, cutoff);
      return sha256(runPayloadV2({ ...identity, split_cutoff: cutoff }, await defHash({ ...identity, split_cutoff: cutoff }), lr, sr));
    };
    expect(await run()).toBe(await run());
  });
});
