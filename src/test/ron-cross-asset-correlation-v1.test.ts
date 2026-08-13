/**
 * Phase 2D.2g — adversarial tests for the RON Cross-Asset Correlation Specialist V1.
 *
 * All bars are DETERMINISTIC SYNTHETIC FIXTURES. Nothing here is persisted.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  scanDenylist, sealEvidence, validateEvidence, canonicalize, agentSpec,
  evidenceTtlMinutes,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  buildCrossAssetEvidenceV1, crossAssetSpecHash, commonContiguousSegment,
  pearson, simpleReturns,
  CROSS_ASSET_SPEC_V1, CROSS_ASSET_COUNTERPART_V1, CROSS_ASSET_MIN_COMMON_BARS,
  CROSS_ASSET_MAX_COMMON_BARS, CROSS_ASSET_MIN_PAIRED_RETURNS,
  SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
  type CounterpartBar,
} from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import {
  patternContextSpecHash, PATTERN_DETECTOR_SOURCE_SHA256,
} from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z"); // Wednesday, venue open
const TRACE = "ron-2d2g-fixture";

interface Bar { time: number; open: number; high: number; low: number; close: number; created_at?: number | null }

function xau(n: number, from = START): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 2400 + Math.sin(i / 3) * 12 + (i % 7) * 0.4;
    return {
      time: from + i * BAR,
      open: base, high: base + 2.5, low: base - 2.5, close: base + 0.5,
      created_at: from + i * BAR + BAR + 1_000,
    };
  });
}

function nas(n: number, from = START): CounterpartBar[] {
  return Array.from({ length: n }, (_, i) => ({
    time: from + i * BAR,
    close: 18000 + Math.cos(i / 4) * 30 + (i % 5) * 1.1,
  }));
}

const noQuarantine = () => false;

const build = (
  bars: Bar[], counterpart_bars: CounterpartBar[], asOf: number,
  isQuarantined: any = noQuarantine,
) => buildCrossAssetEvidenceV1({
  instrument: "XAUUSD", counterpart: CROSS_ASSET_COUNTERPART_V1, timeframe: "15m",
  as_of: asOf, bars, counterpart_bars, isQuarantined,
  run_id: "fixture-run", trace_id: TRACE,
});

const keyOf = (e: any, k: string) => e.observations.find((o: any) => o.key === k);

describe("2D.2g — frozen spec identity and untouched upstream", () => {
  it("pins the FULL Cross-Asset Correlation Spec V1 hash", async () => {
    expect(await crossAssetSpecHash())
      .toBe("8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44");
  });

  it("spec hash is stable across calls", async () => {
    expect(await crossAssetSpecHash()).toBe(await crossAssetSpecHash());
  });

  it("freezes the V1 scope, policy and statistic contract", () => {
    expect(CROSS_ASSET_SPEC_V1.instrument_scope).toEqual(["XAUUSD"]);
    expect(CROSS_ASSET_SPEC_V1.counterpart_scope).toEqual(["NAS100"]);
    expect(CROSS_ASSET_SPEC_V1.timeframe_scope).toEqual(["15m"]);
    expect(CROSS_ASSET_SPEC_V1.primary_contract.quality_version).toBe(5);
    expect(CROSS_ASSET_SPEC_V1.counterpart_contract.policy)
      .toBe("native_presence_only_no_venue_inference");
    expect(CROSS_ASSET_SPEC_V1.counterpart_contract.venue_calendar_applied).toBe(false);
    expect(CROSS_ASSET_SPEC_V1.alignment_contract.method).toBe("exact_timestamp_intersection");
    expect(CROSS_ASSET_SPEC_V1.alignment_contract.gap_boundary_minutes).toBe(15);
    expect(CROSS_ASSET_SPEC_V1.statistic_contract.return_formula).toBe("(close_t / close_prev) - 1");
    expect(CROSS_ASSET_SPEC_V1.statistic_contract.paired_returns_window).toBe(32);
    expect(CROSS_ASSET_SPEC_V1.statistic_contract.minimum_paired_returns).toBe(24);
    expect(CROSS_ASSET_SPEC_V1.statistic_contract.estimator).toBe("pearson_r");
    expect(CROSS_ASSET_SPEC_V1.statistic_contract.zero_variance_result).toBe("insufficient_data");
    expect(CROSS_ASSET_SPEC_V1.safety_contract.predictive).toBe(false);
    expect(CROSS_ASSET_SPEC_V1.safety_contract.causal).toBe(false);
    expect(CROSS_ASSET_SPEC_V1.safety_contract.recommendation).toBe("context_only");
  });

  it("uses the exact registered agent identity, authority and TTL", () => {
    const spec = agentSpec("cross_asset_correlation")!;
    expect(spec.agent_version).toBe(1);
    expect(spec.authority_class).toBe("contextual");
    expect(spec.source_health_authoritative).toBe(false);
    expect(spec.ttl_multiplier).toBe(2);
    expect(evidenceTtlMinutes("cross_asset_correlation", "15m")).toBe(120);
  });

  it("accepted upstream spec identities are unchanged", async () => {
    expect(await sessionStructureSpecHashV2())
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(await patternContextSpecHash())
      .toBe("9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d");
    expect(PATTERN_DETECTOR_SOURCE_SHA256)
      .toBe("2086613c1cc164c9c057e26d14272332444268918d8805b663c14e3a3efaf756");
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    expect(CROSS_ASSET_SPEC_V1.primary_contract.segmentation_spec_hash)
      .toBe(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED);
  });
});

describe("2D.2g — deterministic statistics", () => {
  it("simple returns use (close_t/close_prev)-1 exactly", () => {
    expect(simpleReturns([100, 110, 99])).toEqual([110 / 100 - 1, 99 / 110 - 1]);
  });

  it("hand-checkable Pearson fixture: perfect positive and perfect negative", () => {
    const xs = Array.from({ length: 24 }, (_, i) => i + 1);
    expect(pearson(xs, xs.map((v) => 2 * v + 1))).toEqual({ r: 1, reason: "ok" });
    expect(pearson(xs, xs.map((v) => -3 * v))).toEqual({ r: -1, reason: "ok" });
  });

  it("hand-checkable Pearson fixture: known intermediate value", () => {
    // Two orthogonal-by-construction legs: symmetric ramp vs symmetric V.
    const xs = Array.from({ length: 24 }, (_, i) => i - 11.5);
    const ys = xs.map((v) => Math.abs(v));
    const { r, reason } = pearson(xs, ys);
    expect(reason).toBe("ok");
    expect(r!).toBeCloseTo(0, 12);
  });

  it("never fabricates r=0: inadequate sample and zero variance are distinct refusals", () => {
    const short = Array.from({ length: CROSS_ASSET_MIN_PAIRED_RETURNS - 1 }, (_, i) => i);
    expect(pearson(short, short)).toEqual({ r: null, reason: "insufficient_sample" });
    const xs = Array.from({ length: 24 }, (_, i) => i);
    expect(pearson(xs, xs.map(() => 0.5))).toEqual({ r: null, reason: "zero_variance" });
  });

  it("common contiguous segment resets on any gap greater than one bar", () => {
    const t = (i: number) => START + i * BAR;
    const times = [0, 1, 2, 4, 5, 6].map(t);
    expect(commonContiguousSegment(times, t(6), 33)).toEqual([t(4), t(5), t(6)]);
    expect(commonContiguousSegment(times, t(2), 33)).toEqual([]);
    expect(commonContiguousSegment([], t(6), 33)).toEqual([]);
  });

  it("common contiguous segment is capped at the maximum common bars", () => {
    const times = Array.from({ length: 80 }, (_, i) => START + i * BAR);
    expect(commonContiguousSegment(times, times.at(-1)!, CROSS_ASSET_MAX_COMMON_BARS))
      .toHaveLength(CROSS_ASSET_MAX_COMMON_BARS);
  });
});

describe("2D.2g — producer behaviour", () => {
  it("produces supported neutral context_only evidence on a healthy common segment", async () => {
    const b = xau(40), c = nas(40);
    const e = await build(b, c, b.at(-1)!.time);
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    expect(validateEvidence(e)).toEqual([]);
    expect(scanDenylist(e)).toEqual([]);
    expect(keyOf(e, "counterpart_symbol")!.value_text).toBe("NAS100");
    expect(keyOf(e, "common_bars_available")!.value_num).toBe(CROSS_ASSET_MAX_COMMON_BARS);
    expect(keyOf(e, "paired_returns_used")!.value_num).toBe(32);
    const r = keyOf(e, "paired_return_correlation")!;
    expect(r.unit).toBe("pearson_r");
    expect(Number.isFinite(r.value_num)).toBe(true);
    expect(r.value_num).toBeGreaterThanOrEqual(-1);
    expect(r.value_num).toBeLessThanOrEqual(1);
    expect(keyOf(e, "same_sign_pairs")!.value_num + keyOf(e, "opposite_sign_pairs")!.value_num)
      .toBeLessThanOrEqual(32);
  });

  it("alignment is exact intersection with no filling of missing counterpart bars", async () => {
    const b = xau(40);
    const c = nas(40).filter((_, i) => i % 2 === 1); // NAS present only on odd slots
    const e = await build(b, c, b.at(-1)!.time);
    // 39 is odd, 38 is missing -> the contiguous common run ending at the anchor is 1 bar.
    expect(keyOf(e, "common_bars_available")!.value_num).toBe(1);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
  });

  it("a gap greater than 15m in common timestamps resets the segment (no cross-gap return)", async () => {
    const b = xau(40);
    const c = nas(40).filter((_, i) => i !== 20);
    const e = await build(b, c, b.at(-1)!.time);
    expect(keyOf(e, "common_bars_available")!.value_num).toBe(19);
    expect(e.status).toBe("insufficient_data");
    expect(keyOf(e, "cross_asset_state")!.value_text).toBe("insufficient_common_history");
  });

  it("an anchor absent from the counterpart source asserts nothing", async () => {
    const b = xau(40);
    const c = nas(39);
    const e = await build(b, c, b.at(-1)!.time);
    expect(e.status).toBe("insufficient_data");
    expect(keyOf(e, "common_bars_available")!.value_num).toBe(0);
    expect(e.data_health.issues).toContain("anchor_not_present_in_counterpart_source");
  });

  it("bars after as_of are irrelevant, in either source, mutated or reordered", async () => {
    const b = xau(60), c = nas(60);
    const asOf = b[39].time;
    const base = await sealEvidence(await build(b.slice(0, 40), c.slice(0, 40), asOf));
    const withFuture = await sealEvidence(await build(b, c, asOf));
    const mutated = b.map((x, i) => (i >= 40 ? { ...x, close: x.close + 900 } : x));
    const mutatedC = c.map((x, i) => (i >= 40 ? { ...x, close: x.close - 900 } : x));
    const withMutated = await sealEvidence(await build(mutated, mutatedC, asOf));
    expect(withFuture.evidence_hash).toBe(base.evidence_hash);
    expect(withMutated.evidence_hash).toBe(base.evidence_hash);
  });

  it("input order is irrelevant", async () => {
    const b = xau(40), c = nas(40);
    const a1 = await sealEvidence(await build(b, c, b.at(-1)!.time));
    const a2 = await sealEvidence(await build([...b].reverse(), [...c].reverse(), b.at(-1)!.time));
    expect(a2.evidence_hash).toBe(a1.evidence_hash);
  });

  it("identical duplicate rows dedupe; conflicting duplicates fail closed", async () => {
    const b = xau(40), c = nas(40);
    const asOf = b.at(-1)!.time;
    const base = await sealEvidence(await build(b, c, asOf));
    const dup = await sealEvidence(await build([...b, { ...b[5] }], [...c, { ...c[5] }], asOf));
    expect(dup.evidence_hash).toBe(base.evidence_hash);

    const conflictPrimary = await build([...b, { ...b[5], close: b[5].close + 1 }], c, asOf);
    expect(conflictPrimary.status).toBe("blocked");
    expect(conflictPrimary.direction).toBe("unknown");
    expect(conflictPrimary.data_health.status).toBe("critical");
    expect(conflictPrimary.data_health.issues.some((i) => i.startsWith("conflicting_duplicate_source_rows")))
      .toBe(true);

    const conflictCounterpart = await build(b, [...c, { ...c[5], close: c[5].close + 1 }], asOf);
    expect(conflictCounterpart.status).toBe("blocked");
    expect(conflictCounterpart.data_health.issues)
      .toContain("conflicting_duplicate_source_rows:NAS100");
  });

  it("a qv5 critical defect on the primary cuts the common segment and is never bridged", async () => {
    const b = xau(60), c = nas(60);
    const defectAt = b[45].time;
    const e = await build(b, c, b.at(-1)!.time, (x: any) => x.time === defectAt);
    expect(keyOf(e, "primary_segment_start_reason")!.value_text).toBe("quality_critical_defect");
    expect(keyOf(e, "primary_segment_bars")!.value_num).toBe(14);
    expect(keyOf(e, "common_bars_available")!.value_num).toBe(14);
    expect(e.status).toBe("insufficient_data");
    expect(e.data_health.status).toBe("degraded");
  });

  it("a defect at the anchor itself fails closed", async () => {
    const b = xau(40), c = nas(40);
    const asOf = b.at(-1)!.time;
    const e = await build(b, c, asOf, (x: any) => x.time === asOf);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.data_health.status).toBe("critical");
  });

  it("zero counterpart variance is an honest refusal, never r = 0", async () => {
    const b = xau(40);
    const c: CounterpartBar[] = xau(40).map((x) => ({ time: x.time, close: 18000 }));
    const e = await build(b, c, b.at(-1)!.time);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
    expect(keyOf(e, "paired_return_correlation")).toBeUndefined();
    expect(e.data_health.issues).toContain("correlation_not_computable:zero_variance");
  });

  it("stale counterpart rows outside the current common segment are irrelevant", async () => {
    const b = xau(40), c = nas(40);
    const asOf = b.at(-1)!.time;
    const base = await sealEvidence(await build(b, c, asOf));
    const stale = [...nas(10, START - 5000 * BAR), ...c];
    const withStale = await sealEvidence(await build(b, stale, asOf));
    expect(withStale.evidence_hash).toBe(base.evidence_hash);
  });

  it("envelope direction is never long, short or mixed", async () => {
    const cases = [
      await build(xau(40), nas(40), START + 39 * BAR),
      await build(xau(10), nas(10), START + 9 * BAR),
      await build(xau(40), nas(0), START + 39 * BAR),
      await build(xau(40), nas(40), START + 39 * BAR, (x: any) => x.time === START + 39 * BAR),
    ];
    for (const e of cases) expect(["neutral", "unknown"]).toContain(e.direction);
  });

  it("fewer common bars than the minimum asserts no statistic", async () => {
    const n = CROSS_ASSET_MIN_COMMON_BARS - 1;
    const b = xau(n), c = nas(n);
    const e = await build(b, c, b.at(-1)!.time);
    expect(e.status).toBe("insufficient_data");
    expect(keyOf(e, "paired_return_correlation")).toBeUndefined();
  });

  it("carries no threshold, beta, forecast, probability or trading field", async () => {
    const e = await sealEvidence(await build(xau(40), nas(40), START + 39 * BAR));
    // Scanned over the ASSERTIVE surface (observations + provenance + source instants).
    // The `uncertainty.limitations` disclaimer is excluded: it exists precisely to say
    // that these quantities are NOT asserted.
    const s = canonicalize({
      observations: e.observations,
      provenance_refs: e.provenance_refs,
      source_timestamps: e.source_timestamps,
      direction: e.direction,
      recommendation: e.recommendation,
      conflicts: e.conflicts,
      dependencies: e.dependencies,
    }).toLowerCase();
    for (const forbidden of [
      "beta", "regression", "forecast", "predict", "confidence", "probability",
      "significance", "p_value", "pvalue", "expected_value", "score", "rating",
      "strong", "weak", "bullish", "bearish", "entry", "stop_loss", "take_profit",
      "lot_size", "order", "position_size", "buy", "sell",
    ]) {
      expect(s).not.toContain(forbidden);
    }
    expect(scanDenylist(e)).toEqual([]);
    expect(e.uncertainty.limitations.some((l) => l.includes("no beta, regression, significance"))).toBe(true);
  });

  it("provenance is honest: no feature, label or calibration lineage is cited", async () => {
    const e = await build(xau(40), nas(40), START + 39 * BAR);
    expect(e.provenance_refs.some((r) => r.startsWith("quality_version:5"))).toBe(true);
    expect(e.provenance_refs.some((r) => r.includes(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED))).toBe(true);
    expect(e.provenance_refs).toContain("counterpart_policy:native_presence_only_no_venue_inference");
    expect(e.provenance_refs.some((r) => r.includes("candle_history_native:NAS100:15m"))).toBe(true);
    expect(e.provenance_refs.some((r) => /feature_version|label_version|calibration/.test(r))).toBe(false);
    expect(e.uncertainty.limitations.some((l) => l.includes("venue completeness is NOT inferred"))).toBe(true);
  });

  it("source_timestamps only contain genuine source instants", async () => {
    const b = xau(40), c = nas(40);
    const e = await build(b, c, b.at(-1)!.time);
    expect(e.source_timestamps.as_of_bar_open).toBe(new Date(b.at(-1)!.time).toISOString());
    expect(e.source_timestamps.as_of_bar_completed_close)
      .toBe(new Date(b.at(-1)!.time + BAR).toISOString());
    expect(e.source_timestamps.common_segment_end_bar).toBe(e.source_timestamps.as_of_bar_open);
  });
});

describe("2D.2g — module and endpoint hygiene", () => {
  const specSrc = readFileSync("supabase/functions/_shared/ron-cross-asset-spec.ts", "utf8");
  const fnSrc = readFileSync("supabase/functions/ron-agent-cross-asset-correlation/index.ts", "utf8");

  it("the pure producer performs no I/O, no wall-clock read and no Falconer import", () => {
    expect(specSrc).not.toMatch(/\bfetch\(/);
    expect(specSrc).not.toMatch(/createClient/);
    expect(specSrc).not.toMatch(/Date\.now\(\)/);
    expect(specSrc).not.toMatch(/new Date\(\)/);
    expect(specSrc).not.toMatch(/falconer/i);
    expect(specSrc).not.toMatch(/Deno\.env/);
  });

  it("the producer never applies the XAU venue calendar to the counterpart", () => {
    expect(specSrc).not.toMatch(/ron-venue-calendar/);
  });

  it("the endpoint enforces its own fail-closed service-role auth", () => {
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnSrc).toContain("timingSafeEq");
    expect(fnSrc).toContain("unauthorized: internal service-role endpoint");
    expect(fnSrc).toContain("ron_agent_registry");
  });

  it("config.toml pins verify_jwt = false for the endpoint", () => {
    const cfg = readFileSync("supabase/config.toml", "utf8");
    expect(cfg).toMatch(/\[functions\.ron-agent-cross-asset-correlation\]\nverify_jwt = false/);
  });

  it("the endpoint has no persistence, trading, orchestration or research path", () => {
    expect(fnSrc).toContain("persisted: false");
    expect(fnSrc).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(fnSrc).not.toMatch(/place_order|createOrder|\btrade\b|open_position|metaapi|pineconnector/i);
    expect(fnSrc).not.toMatch(/ron-research|ron-calibrate|ron-orchestrate|synthesizeDecision/);
  });
});
