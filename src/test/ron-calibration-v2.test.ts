/**
 * Phase 2B.1 corrections — calibration_version=2 input contract and hash coverage.
 * SYNTHETIC FIXTURES ONLY.
 */
import { describe, it, expect } from "vitest";
import {
  anchorSessionEligible, calibrateDirection, cellPayloadV2, definitionPayloadV2,
  eligibleFor, runPayloadV2, sha256,
  type CalibrationInputRow, type CellPersistedV2, type EligibleObs, type RunIdentityV2,
} from "../../supabase/functions/_shared/ron-calibration";

const row: CalibrationInputRow = {
  bar_time: "2026-04-16T21:45:00.000Z",
  session: "market_closed", regime: "trending_up", adx: 25,
  long_event_eligible: true, long_success: true,
  short_event_eligible: true, short_success: true,
  coverage_ok: true, coverage_class: "complete", atr_at_anchor: 15.17,
};

const obsAt = (m: number, s: boolean, o: Partial<EligibleObs> = {}): EligibleObs => ({
  bar_time: new Date(Date.UTC(2026, 2, 1) + m * 60_000).toISOString(),
  t: Date.UTC(2026, 2, 1) + m * 60_000,
  session: "london", regime: "trending_up", adx_bucket: "adx_20_30", success: s, ...o,
});

describe("market_closed anchors can never be evidence", () => {
  it("rejects market_closed even when coverage, ATR and the event are all valid", () => {
    expect(eligibleFor(row, "long")).toBeNull();
    expect(eligibleFor(row, "short")).toBeNull();
  });
  it("keeps every genuinely tradable session eligible", () => {
    for (const s of ["asia", "asia_london_overlap", "london", "london_newyork_overlap", "newyork", "off_session"]) {
      expect(anchorSessionEligible(s)).toBe(true);
      expect(eligibleFor({ ...row, session: s }, "long")).not.toBeNull();
    }
    expect(anchorSessionEligible("market_closed")).toBe(false);
  });
  it("contributes zero observations to a mixed sample", () => {
    const rows = [row, { ...row, session: "london" }, { ...row, session: "asia" }];
    const kept = rows.map((r) => eligibleFor(r, "long")).filter(Boolean);
    expect(kept).toHaveLength(2);
    expect(kept.every((k) => k!.session !== "market_closed")).toBe(true);
  });
});

const identity: RunIdentityV2 = {
  symbol: "XAUUSD", timeframe: "15m",
  source_as_of: "2026-08-11T11:30:00.000Z",
  source_bar_cutoff: "2026-08-11T10:15:00.000Z",
  holdout_fraction: 0.3, split_cutoff: "2026-04-24T08:30:00.000Z",
  canonical_rows: 11098, eligible_long: 6183, eligible_short: 6183, excluded_rows: 10030,
  exclusion_breakdown: { "long:complete": 10, "short:complete": 10 },
};

const long = calibrateDirection("long", Array.from({ length: 400 }, (_, i) => obsAt(i, i % 3 === 0)));
const short = calibrateDirection("short", Array.from({ length: 400 }, (_, i) => obsAt(i, i % 5 === 0)));

const runDigest = async (id: RunIdentityV2, l = long, s = short) =>
  sha256(runPayloadV2(id, await sha256(definitionPayloadV2(id)), l, s));

describe("run hash covers every deterministic stored value", () => {
  it("is stable for identical inputs and key-order independent", async () => {
    const a = await runDigest(identity);
    const b = await runDigest({ ...identity, exclusion_breakdown: { "short:complete": 10, "long:complete": 10 } });
    expect(a).toBe(b);
    expect(await runDigest(identity)).toBe(a);
  });

  it.each<[string, Partial<RunIdentityV2>]>([
    ["source_bar_cutoff", { source_bar_cutoff: "2026-08-11T10:00:00.000Z" }],
    ["source_as_of", { source_as_of: "2026-08-11T11:45:00.000Z" }],
    ["split_cutoff", { split_cutoff: "2026-04-25T08:30:00.000Z" }],
    ["holdout_fraction", { holdout_fraction: 0.25 }],
    ["canonical_rows", { canonical_rows: 11099 }],
    ["eligible_long", { eligible_long: 6182 }],
    ["excluded_rows", { excluded_rows: 10031 }],
    ["exclusion_breakdown", { exclusion_breakdown: { "long:complete": 11 } }],
  ])("changes when %s changes", async (_l, patch) => {
    expect(await runDigest({ ...identity, ...patch })).not.toBe(await runDigest(identity));
  });

  it.each([
    ["reliability bins", (r: typeof long) => ({ ...r, reliability: r.reliability.map((b, i) => (i ? b : { ...b, n: b.n + 1 })) })],
    ["fallback distribution", (r: typeof long) => ({ ...r, fallback_levels: { ...r.fallback_levels, L0: r.fallback_levels.L0 + 1 } })],
    ["session counts", (r: typeof long) => ({ ...r, session_counts: { ...r.session_counts, asia: 1 } })],
    ["fit range", (r: typeof long) => ({ ...r, fit_range: ["2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z"] as [string, string] })],
    ["holdout range", (r: typeof long) => ({ ...r, holdout_range: ["2020-01-03T00:00:00.000Z", "2020-01-04T00:00:00.000Z"] as [string, string] })],
    ["ECE", (r: typeof long) => ({ ...r, ece: (r.ece ?? 0) + 0.01 })],
    ["Brier", (r: typeof long) => ({ ...r, brier: (r.brier ?? 0) + 0.01 })],
    ["naive Brier", (r: typeof long) => ({ ...r, naive_brier: (r.naive_brier ?? 0) + 0.01 })],
    ["predicted counts", (r: typeof long) => ({ ...r, n_predicted: r.n_predicted + 1 })],
  ])("changes when the stored %s changes", async (_l, mutate) => {
    expect(await runDigest(identity, mutate(long))).not.toBe(await runDigest(identity));
  });
});

describe("cell hash covers every deterministic persisted column", () => {
  const cell = long.cells.find((c) => c.level === 1)!;
  const persisted: CellPersistedV2 = {
    source_as_of: identity.source_as_of, source_bar_cutoff: identity.source_bar_cutoff,
    split_cutoff: identity.split_cutoff,
    fit_start: long.fit_range![0], fit_end: long.fit_range![1],
    holdout_start: long.holdout_range![0], holdout_end: long.holdout_range![1],
    prediction_rate: cell.empirical_rate, brier: long.brier, naive_brier: long.naive_brier,
  };
  const digest = (c = cell, p = persisted) => sha256(cellPayloadV2(c, p));

  it("is stable for identical inputs", async () => {
    expect(await digest()).toBe(await digest());
  });

  it.each<[string, Partial<CellPersistedV2>]>([
    ["prediction_rate", { prediction_rate: 0.123456 }],
    ["brier", { brier: 0.5 }],
    ["naive_brier", { naive_brier: 0.5 }],
    ["fit_start", { fit_start: "2020-01-01T00:00:00.000Z" }],
    ["fit_end", { fit_end: "2020-01-01T00:00:00.000Z" }],
    ["holdout_start", { holdout_start: "2020-01-01T00:00:00.000Z" }],
    ["holdout_end", { holdout_end: "2020-01-01T00:00:00.000Z" }],
    ["source_bar_cutoff", { source_bar_cutoff: "2020-01-01T00:00:00.000Z" }],
    ["split_cutoff", { split_cutoff: "2020-01-01T00:00:00.000Z" }],
  ])("changes when persisted %s changes", async (_l, patch) => {
    expect(await digest(cell, { ...persisted, ...patch })).not.toBe(await digest());
  });

  it.each([
    ["n_fit", { n_fit: cell.n_fit + 1 }],
    ["successes_fit", { successes_fit: cell.successes_fit + 1 }],
    ["empirical_rate", { empirical_rate: 0.999 }],
    ["wilson_low", { wilson_low: 0.111 }],
    ["wilson_high", { wilson_high: 0.999 }],
    ["meets_sample_floor", { meets_sample_floor: !cell.meets_sample_floor }],
    ["n_holdout", { n_holdout: cell.n_holdout + 1 }],
    ["successes_holdout", { successes_holdout: cell.successes_holdout + 1 }],
    ["holdout_rate", { holdout_rate: 0.42 }],
    ["dim_session", { dim_session: "asia" }],
  ])("changes when stat field %s changes", async (_l, patch) => {
    expect(await digest({ ...cell, ...(patch as object) })).not.toBe(await digest());
  });
});
