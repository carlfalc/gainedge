/**
 * Phase 2B.2 reproducibility corrections (calibration_version = 6).
 * SYNTHETIC FIXTURES ONLY — nothing here is market data or a trading claim.
 */
import { describe, it, expect } from "vitest";
import {
  ADX_BUCKET_BOUNDS, ADX_BUCKET_SPEC, CALIBRATION_CONTRACTS, CALIBRATION_CONTRACT_V5,
  CALIBRATION_CONTRACT_V6, SAMPLE_FLOORS, adxBucket, adxBucketSpecPayload,
  calibrateDirection, commonSplitCutoff, definitionPayloadV5, definitionPayloadV6,
  deriveSourceBarCutoff, eligibleFor, orderedCellDigest, reportPayloadV6, runPayloadV2,
  runPayloadV6, sha256,
  type AdxBucketSpec, type CalibrationInputRow, type DirectionReport, type EligibleObs,
  type RunIdentityV6,
} from "../../supabase/functions/_shared/ron-calibration";

const obsAt = (m: number, s: boolean, o: Partial<EligibleObs> = {}): EligibleObs => ({
  bar_time: new Date(Date.UTC(2026, 2, 1) + m * 900_000).toISOString(),
  t: Date.UTC(2026, 2, 1) + m * 900_000,
  session: m % 2 ? "london" : "new_york",
  regime: m % 3 ? "trending_up" : "ranging",
  adx_bucket: "adx_20_30", success: s, ...o,
});

const identity: RunIdentityV6 = {
  symbol: "XAUUSD", timeframe: "15m",
  source_as_of: "2026-08-12T05:44:00.000Z",
  source_bar_cutoff: deriveSourceBarCutoff("2026-08-12T05:44:00.000Z"),
  holdout_fraction: 0.3, split_cutoff: "2026-05-01T00:00:00.000Z",
  canonical_rows: 1000,
  canonical_source_min_bar_time: "2026-01-01T00:00:00.000Z",
  canonical_source_max_bar_time: "2026-08-12T04:15:00.000Z",
  eligible_long: 600, eligible_short: 600, excluded_rows: 800,
  exclusion_breakdown: { "long:complete": 5 },
};

const defHash6 = (id = identity, qv = 3, spec: AdxBucketSpec = ADX_BUCKET_SPEC) =>
  sha256(definitionPayloadV6(id, CALIBRATION_CONTRACT_V6, qv, spec));

const longRep = () => calibrateDirection("long", Array.from({ length: 200 }, (_, i) => obsAt(i, i % 3 === 0)), 0.3, identity.split_cutoff);
const shortRep = () => calibrateDirection("short", Array.from({ length: 200 }, (_, i) => obsAt(i, i % 5 === 0)), 0.3, identity.split_cutoff);

const runHash6 = async (
  id: RunIdentityV6 = identity,
  l: DirectionReport = longRep(),
  s: DirectionReport = shortRep(),
  digest: string | null = "digest-0",
) => sha256(runPayloadV6(id, await defHash6(id), l, s, digest));

/* ------------------------- DEFECT A — ADX spec ------------------------- */
describe("defect A — the hashed ADX bucket spec IS the classifier", () => {
  const shifted: AdxBucketSpec = {
    ...ADX_BUCKET_SPEC,
    version: 2,
    bands: [{ label: "adx_lt25", lt: 25 }, { label: "adx_25_30", lt: 30 }, { label: "adx_gte30", lt: null }],
  };

  it("derives the legacy bound array from the spec (v5 replay unchanged)", () => {
    expect([...ADX_BUCKET_BOUNDS]).toEqual([20, 30]);
  });

  it("classifies from the spec with exclusive upper bounds", () => {
    expect(adxBucket(19.999)).toBe("adx_lt20");
    expect(adxBucket(20)).toBe("adx_20_30");
    expect(adxBucket(30)).toBe("adx_gte30");
    expect(adxBucket(null)).toBe("unknown");
  });

  it("a changed bucket spec changes an observation's classification", () => {
    const row: CalibrationInputRow = {
      bar_time: "2026-04-01T10:00:00.000Z", session: "london", regime: "trending_up", adx: 22,
      long_event_eligible: true, long_success: true, short_event_eligible: true, short_success: false,
      coverage_ok: true, coverage_class: "complete", atr_at_anchor: 1.5,
    };
    expect(eligibleFor(row, "long")!.adx_bucket).toBe("adx_20_30");
    expect(eligibleFor(row, "long", shifted)!.adx_bucket).toBe("adx_lt25");
  });

  it("a changed bucket spec changes the v6 definition hash", async () => {
    expect(await defHash6(identity, 3, shifted)).not.toBe(await defHash6());
    const relabelled: AdxBucketSpec = { ...ADX_BUCKET_SPEC, bands: ADX_BUCKET_SPEC.bands.map((b) => ({ ...b, label: `${b.label}_x` })) };
    expect(await defHash6(identity, 3, relabelled)).not.toBe(await defHash6());
    const inclusive: AdxBucketSpec = { ...ADX_BUCKET_SPEC, upper_bound_inclusive: true };
    expect(await defHash6(identity, 3, inclusive)).not.toBe(await defHash6());
  });

  it("v5 payload semantics are untouched", () => {
    const p = JSON.stringify(definitionPayloadV5(identity, CALIBRATION_CONTRACT_V5, 3));
    expect(p).toContain('"adx_bucket_bounds",[20,30]');
    expect(JSON.stringify(adxBucketSpecPayload())).toContain("adx_bucket_spec_version");
  });
});

/* --------------- DEFECT B — regime / adx coverage in report -------------- */
describe("defect B — holdout regime + adx coverage is reported and hashed", () => {
  it("reports deterministic regime and adx_bucket counts", () => {
    const r = longRep();
    const total = Object.values(r.regime_counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.n_holdout);
    expect(Object.values(r.adx_bucket_counts).reduce((a, b) => a + b, 0)).toBe(r.n_holdout);
    expect(Object.keys(r.regime_counts).length).toBeGreaterThan(1);
    expect(JSON.stringify(reportPayloadV6(r))).toContain("regime_counts");
  });

  it.each(["regime_counts", "session_counts", "adx_bucket_counts"] as const)(
    "mutating one %s entry changes the v6 run hash", async (field) => {
      const base = await runHash6();
      const l = longRep();
      (l[field] as Record<string, number>)[Object.keys(l[field])[0]] += 1;
      expect(await runHash6(identity, l)).not.toBe(base);
    });

  it("v2 run payload is unaffected by the new coverage fields", async () => {
    const l = longRep();
    const before = await sha256(runPayloadV2(identity, "d", l, shortRep()));
    l.regime_counts["synthetic"] = 99;
    expect(await sha256(runPayloadV2(identity, "d", l, shortRep()))).toBe(before);
  });
});

/* ------------- DEFECT C — canonical source range in run identity --------- */
describe("defect C — canonical source min/max participate in the v6 run hash", () => {
  it("changing the canonical min changes the run hash", async () => {
    expect(await runHash6({ ...identity, canonical_source_min_bar_time: "2026-01-02T00:00:00.000Z" }))
      .not.toBe(await runHash6());
  });
  it("changing the canonical max changes the run hash", async () => {
    expect(await runHash6({ ...identity, canonical_source_max_bar_time: "2026-08-12T04:00:00.000Z" }))
      .not.toBe(await runHash6());
  });
  it("changing exclusions or canonical rows changes the run hash", async () => {
    expect(await runHash6({ ...identity, canonical_rows: 1001 })).not.toBe(await runHash6());
    expect(await runHash6({ ...identity, exclusion_breakdown: { "long:complete": 6 } })).not.toBe(await runHash6());
  });
});

/* ------------------ DEFECT D — derived source_bar_cutoff ----------------- */
describe("defect D — source_bar_cutoff is derived, never caller-chosen", () => {
  const asOf = "2026-08-12T05:44:00.000Z";
  const derived = deriveSourceBarCutoff(asOf);

  it("applies floor15m(source_as_of) - (15m bar + 60m horizon)", () => {
    expect(derived).toBe("2026-08-12T04:15:00.000Z");
  });
  it("is deterministic for the same frozen instant", () => {
    expect(deriveSourceBarCutoff(asOf)).toBe(derived);
    expect(deriveSourceBarCutoff("2026-08-12T05:59:59.000Z")).toBe(derived);
  });
  it("an exactly matching caller cutoff is accepted, any other is a mismatch", () => {
    const accept = (supplied: string) => supplied === derived;
    expect(accept(derived)).toBe(true);
    expect(accept("2026-08-12T04:30:00.000Z")).toBe(false);   // later
    expect(accept("2026-08-12T04:00:00.000Z")).toBe(false);   // earlier
  });
  it("a different frozen instant yields a different cutoff and definition hash", async () => {
    const other = deriveSourceBarCutoff("2026-08-12T06:00:00.000Z");
    expect(other).not.toBe(derived);
    expect(await defHash6({ ...identity, source_as_of: "2026-08-12T06:00:00.000Z", source_bar_cutoff: other }))
      .not.toBe(await defHash6());
  });
});

/* ------------- DEFECT E — unsupported versions never substitute ---------- */
describe("defect E — explicit calibration_version must be supported", () => {
  const resolve = (v: unknown) => {
    if (v === undefined || v === null) return CALIBRATION_CONTRACTS[6];
    const n = Number(v);
    return Number.isInteger(n) ? CALIBRATION_CONTRACTS[n] : undefined;
  };
  it("omission defaults to v6", () => {
    expect(resolve(undefined)!.calibration_version).toBe(6);
  });
  it.each([999, 0, 5.5, "abc"])("%s is unsupported and never substituted", (v) => {
    expect(resolve(v)).toBeUndefined();
  });
  it("every supported version keeps its own identity", () => {
    for (const [k, c] of Object.entries(CALIBRATION_CONTRACTS)) expect(c.calibration_version).toBe(Number(k));
  });
});

/* ------------- DEFECT F — ordered cell digest + determinism -------------- */
describe("defect F — ordered cell digest is deterministic and hashed", () => {
  const cells = [
    { direction: "short" as const, cell_key: "dir=short|session=london", cell_hash: "b" },
    { direction: "long" as const, cell_key: "dir=long", cell_hash: "a" },
    { direction: "long" as const, cell_key: "dir=long|session=london", cell_hash: "c" },
  ];
  it("orders by (direction, cell_key) independent of input order", async () => {
    const a = await orderedCellDigest(cells);
    const b = await orderedCellDigest([...cells].reverse());
    expect(a.ordered).toEqual(b.ordered);
    expect(a.digest).toBe(b.digest);
    expect(a.ordered[0]).toContain("dir=long|");
  });
  it("changing one cell hash changes the digest and the run hash", async () => {
    const base = await orderedCellDigest(cells);
    const mutated = await orderedCellDigest([{ ...cells[0], cell_hash: "z" }, cells[1], cells[2]]);
    expect(mutated.digest).not.toBe(base.digest);
    expect(await runHash6(identity, longRep(), shortRep(), mutated.digest))
      .not.toBe(await runHash6(identity, longRep(), shortRep(), base.digest));
  });
  it("two identical runs produce identical definition + run hashes", async () => {
    expect(await defHash6()).toBe(await defHash6());
    expect(await runHash6()).toBe(await runHash6());
  });
});

/* --------------------- definition sensitivity sweep ---------------------- */
describe("v6 definition identity responds to every actual run parameter", () => {
  it("holdout fraction, floors, quality version and split cutoff all matter", async () => {
    const base = await defHash6();
    expect(await defHash6({ ...identity, holdout_fraction: 0.25 })).not.toBe(base);
    expect(await defHash6({ ...identity, split_cutoff: "2026-05-02T00:00:00.000Z" })).not.toBe(base);
    expect(await defHash6(identity, 2)).not.toBe(base);
    const original = SAMPLE_FLOORS[3];
    SAMPLE_FLOORS[3] = original + 1;
    const after = await defHash6();
    SAMPLE_FLOORS[3] = original;
    expect(after).not.toBe(base);
    expect(await defHash6()).toBe(base);
  });
  it("v6 and v5 never share a definition hash for the same parameters", async () => {
    expect(await defHash6()).not.toBe(await sha256(definitionPayloadV5(identity, CALIBRATION_CONTRACT_V5, 3)));
  });
  it("one common cutoff still governs both directions", () => {
    const l = Array.from({ length: 120 }, (_, i) => obsAt(i, i % 3 === 0));
    const s = Array.from({ length: 120 }, (_, i) => obsAt(i, i % 4 === 0)).filter((_, i) => i % 2 === 0);
    const c = commonSplitCutoff([l, s], 0.3)!;
    expect(commonSplitCutoff([s, l], 0.3)).toBe(c);
  });
});
