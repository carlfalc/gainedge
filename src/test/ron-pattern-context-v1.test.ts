/**
 * Phase 2D.2e — adversarial tests for the RON Pattern Context Specialist V1.
 *
 * All bars are DETERMINISTIC SYNTHETIC FIXTURES. Nothing here is persisted.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  scanDenylist, sealEvidence, validateEvidence, canonicalize,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  buildPatternContextEvidenceV1, normalizePatternContexts, patternContextSpecHash,
  PATTERN_CONTEXT_SPEC_V1, PATTERN_DETECTOR_SOURCE_SHA256, PATTERN_DETECTOR_MIN_BARS,
  SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
} from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { sessionStructureSpecHash } from "../../supabase/functions/_shared/ron-session-structure-spec.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";
import type { DetectedPattern } from "../../supabase/functions/_shared/ron-patterns.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z"); // Wednesday, venue open
const TRACE = "ron-2d2e-fixture";

interface Bar { time: number; open: number; high: number; low: number; close: number; created_at?: number | null }

/** Deterministic zig-zag series that produces genuine detector geometry. */
function series(n: number, from = START): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const base = 2400 + Math.sin(i / 3) * 12 + (i % 7) * 0.4;
    out.push({
      time: from + i * BAR,
      open: base, high: base + 2.5, low: base - 2.5, close: base + 0.5,
      created_at: from + i * BAR + BAR + 1_000,
    });
  }
  return out;
}

const noQuarantine = () => false;

const build = (bars: Bar[], asOf: number, isQuarantined = noQuarantine as any) =>
  buildPatternContextEvidenceV1({
    instrument: "XAUUSD", timeframe: "15m", as_of: asOf, bars,
    isQuarantined, run_id: "fixture-run", trace_id: TRACE,
  });

const keyOf = (e: any, k: string) => e.observations.find((o: any) => o.key === k);

describe("2D.2e — detector + spec pins", () => {
  it("frozen detector source digest equals the current ron-patterns.ts source", () => {
    const src = readFileSync("supabase/functions/_shared/ron-patterns.ts");
    expect(createHash("sha256").update(src).digest("hex")).toBe(PATTERN_DETECTOR_SOURCE_SHA256);
    expect(PATTERN_CONTEXT_SPEC_V1.detector.modified_for_this_phase).toBe(false);
  });

  it("pattern context spec hash is stable across calls", async () => {
    const a = await patternContextSpecHash();
    const b = await patternContextSpecHash();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pins the FULL accepted Session V2 spec hash as its segmentation dependency", async () => {
    expect(await sessionStructureSpecHashV2()).toBe(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED);
    expect(PATTERN_CONTEXT_SPEC_V1.segmentation_dependency.spec_hash)
      .toBe(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED);
  });

  it("accepted upstream spec identities are unchanged", async () => {
    expect(await sessionStructureSpecHash())
      .toMatch(/^[0-9a-f]{64}$/);
    expect(await sessionStructureSpecHashV2())
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
  });

  it("PROMOTED_STATE_VARIABLES remains empty", () => {
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});

describe("2D.2e — safe normalization discards confidence and target", () => {
  const raw = (over: Partial<DetectedPattern> = {}): DetectedPattern => ({
    pattern_name: "Double Top", direction: "bearish", confidence: 8,
    start_index: 3, end_index: 19,
    key_prices: { neckline: 2390.5, target: 2350.25, peaks: [2401.2, 2400.9] },
    ...over,
  } as DetectedPattern);

  it("changing ONLY confidence cannot change the normalized context", () => {
    const a = normalizePatternContexts([raw({ confidence: 1 })]);
    const b = normalizePatternContexts([raw({ confidence: 9 })]);
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("changing ONLY the textbook target cannot change the normalized context", () => {
    const a = normalizePatternContexts([raw()]);
    const b = normalizePatternContexts([raw({
      key_prices: { neckline: 2390.5, target: 99999, peaks: [2401.2, 2400.9] },
    } as Partial<DetectedPattern>)]);
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("emits no confidence, target or index field", () => {
    const out = normalizePatternContexts([raw()]);
    const s = canonicalize(out);
    for (const forbidden of ["confidence", "target", "start_index", "end_index"]) {
      expect(s).not.toContain(forbidden);
    }
    expect(Object.keys(out[0]).sort()).toEqual(["name", "neckline", "orientation", "peaks"]);
  });

  it("is independent of raw detector array order", () => {
    const a = raw();
    const b = raw({ pattern_name: "Support", direction: "bullish", key_prices: { support: 2380 } } as Partial<DetectedPattern>);
    expect(canonicalize(normalizePatternContexts([a, b])))
      .toBe(canonicalize(normalizePatternContexts([b, a])));
  });

  it("drops malformed / non-finite reference levels instead of emitting them", () => {
    const out = normalizePatternContexts([raw({
      key_prices: { neckline: Number.NaN, support: Infinity, resistance: 2410, peaks: ["x" as any, 2400] },
    } as Partial<DetectedPattern>)]);
    expect(out[0].neckline).toBeUndefined();
    expect(out[0].support).toBeUndefined();
    expect(out[0].resistance).toBe(2410);
    expect(out[0].peaks).toEqual([2400]);
  });

  it("rejects entries with an unusable name or orientation", () => {
    expect(normalizePatternContexts([{ ...raw(), direction: "sideways" as any }])).toEqual([]);
    expect(normalizePatternContexts([{ ...raw(), pattern_name: "" }])).toEqual([]);
  });

  it("caps deterministically in canonical descriptive order, not by score", () => {
    const many: DetectedPattern[] = ["Alpha", "Bravo", "Charlie", "Delta"].map((n, i) =>
      raw({ pattern_name: n, confidence: 9 - i, key_prices: { support: 2300 + i } } as Partial<DetectedPattern>));
    const out = normalizePatternContexts(many, 2);
    expect(out.map((c) => c.name)).toEqual(["alpha", "bravo"]);
  });
});

describe("2D.2e — producer, source gating and segmentation", () => {
  it("produces supported neutral context_only evidence on a healthy segment", async () => {
    const bars = series(40);
    const e = await build(bars, bars.at(-1)!.time);
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    expect(validateEvidence(e)).toEqual([]);
    expect(scanDenylist(e)).toEqual([]);
    expect(keyOf(e, "detector_input_bars")!.value_num).toBe(40);
  });

  it("zero detected patterns is still a valid supported context", async () => {
    // Perfectly flat bars: no pivots, therefore no geometry.
    const flat: Bar[] = Array.from({ length: 40 }, (_, i) => ({
      time: START + i * BAR, open: 2400, high: 2400, low: 2400, close: 2400,
      created_at: START + i * BAR + BAR + 1_000,
    }));
    const e = await build(flat, flat.at(-1)!.time);
    expect(e.status).toBe("supported");
    expect(keyOf(e, "pattern_count")!.value_num).toBe(0);
  });

  it("a qv5 critical defect cuts the detector history — no bridging", async () => {
    const bars = series(60);
    const defectAt = bars[30].time;
    const e = await build(bars, bars.at(-1)!.time, (b: any) => b.time === defectAt);
    expect(keyOf(e, "current_segment_bars")!.value_num).toBe(29);
    expect(keyOf(e, "current_segment_start_reason")!.value_text).toBe("quality_critical_defect");
    expect(e.data_health.status).toBe("degraded");
  });

  it("an unexpected missing expected-open slot cuts the detector history", async () => {
    const bars = series(60).filter((_, i) => i !== 30);
    const e = await build(bars, bars.at(-1)!.time);
    expect(keyOf(e, "current_segment_start_reason")!.value_text).toBe("unexpected_missing_slot");
    expect(keyOf(e, "unexpected_missing_slots")!.value_num).toBe(1);
  });

  it("an expected venue closure does NOT cut the detector history", async () => {
    // 2026-08-12T21:00Z..21:45Z is the daily 17:00-18:00 New York closure.
    const before = series(30, Date.parse("2026-08-12T13:30:00Z")); // ...to 20:45Z
    const after = series(20, Date.parse("2026-08-12T22:00:00Z"));
    const bars = [...before, ...after];
    const e = await build(bars, bars.at(-1)!.time);
    expect(keyOf(e, "expected_closed_slots")!.value_num).toBe(4);
    expect(keyOf(e, "unexpected_missing_slots")!.value_num).toBe(0);
    expect(keyOf(e, "current_segment_bars")!.value_num).toBe(50);
    expect(keyOf(e, "current_segment_start_reason")!.value_text).toBe("window_start");
  });

  it("bars after as_of cannot change the evidence hash (mutation or reordering)", async () => {
    const bars = series(40);
    const asOf = bars[29].time;
    const base = await sealEvidence(await build(bars.slice(0, 30), asOf));
    const withFuture = await sealEvidence(await build(bars, asOf));
    const mutated = bars.map((b, i) => (i >= 30 ? { ...b, high: b.high + 500, close: b.close - 400 } : b));
    const withMutatedFuture = await sealEvidence(await build([...mutated].reverse(), asOf));
    expect(withFuture.evidence_hash).toBe(base.evidence_hash);
    expect(withMutatedFuture.evidence_hash).toBe(base.evidence_hash);
  });

  it("fewer bars than the detector minimum yields honest insufficient context", async () => {
    const bars = series(PATTERN_DETECTOR_MIN_BARS - 1);
    const e = await build(bars, bars.at(-1)!.time);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
    expect(keyOf(e, "pattern_context_state")!.value_text).toBe("insufficient_segment_history");
    expect(e.observations.some((o) => o.key.startsWith("pattern_01"))).toBe(false);
  });

  it("a defect at the current anchor fails closed", async () => {
    const bars = series(40);
    const asOf = bars.at(-1)!.time;
    const e = await build(bars, asOf, (b: any) => b.time === asOf);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.data_health.status).toBe("critical");
  });

  it("envelope direction is never long, short or mixed", async () => {
    const cases = [
      await build(series(40), START + 39 * BAR),
      await build(series(10), START + 9 * BAR),
      await build(series(40), START + 39 * BAR, (b: any) => b.time === START + 39 * BAR),
    ];
    for (const e of cases) expect(["neutral", "unknown"]).toContain(e.direction);
  });

  it("evidence never carries confidence, target, probability or secret shapes", async () => {
    const e = await sealEvidence(await build(series(60), START + 59 * BAR));
    const s = canonicalize(e);
    for (const forbidden of ["confidence", "target", "probability", "likelihood", "expected_value", "start_index"]) {
      expect(s).not.toContain(forbidden);
    }
    expect(scanDenylist(e)).toEqual([]);
    expect(validateEvidence(e)).toEqual([]);
  });

  it("provenance cites only dependencies actually used", async () => {
    const e = await build(series(40), START + 39 * BAR);
    expect(e.provenance_refs.some((r) => r.startsWith("detector_source_sha256:"))).toBe(true);
    expect(e.provenance_refs.some((r) => r.startsWith("quality_version:5"))).toBe(true);
    expect(e.provenance_refs.some((r) => r.includes(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED))).toBe(true);
    expect(e.provenance_refs.some((r) => /feature_version|label_version|calibration/.test(r))).toBe(false);
  });

  it("source_timestamps only contain genuine source instants", async () => {
    const bars = series(40);
    const e = await build(bars, bars.at(-1)!.time);
    expect(e.source_timestamps.as_of_bar_open).toBe(new Date(bars.at(-1)!.time).toISOString());
    expect(e.source_timestamps.oldest_admissible_bar).toBe(new Date(bars[0].time).toISOString());
  });
});

describe("2D.2e — module and endpoint hygiene", () => {
  const specSrc = readFileSync("supabase/functions/_shared/ron-pattern-context-spec.ts", "utf8");
  const fnSrc = readFileSync("supabase/functions/ron-agent-pattern-context/index.ts", "utf8");

  it("the pure producer performs no I/O, no wall-clock read and no Falconer import", () => {
    expect(specSrc).not.toMatch(/\bfetch\(/);
    expect(specSrc).not.toMatch(/createClient/);
    expect(specSrc).not.toMatch(/Date\.now\(\)/);
    expect(specSrc).not.toMatch(/new Date\(\)/);
    expect(specSrc).not.toMatch(/falconer/i);
    expect(specSrc).not.toMatch(/Deno\.env/);
  });

  it("the endpoint enforces its own fail-closed service-role auth", () => {
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnSrc).toContain("timingSafeEq");
    expect(fnSrc).toContain("unauthorized: internal service-role endpoint");
    expect(fnSrc).toContain("ron_agent_registry");
  });

  it("config.toml pins verify_jwt = false for the endpoint", () => {
    const cfg = readFileSync("supabase/config.toml", "utf8");
    expect(cfg).toMatch(/\[functions\.ron-agent-pattern-context\]\nverify_jwt = false/);
  });

  it("the endpoint has no persistence, trading, orchestration or research path", () => {
    expect(fnSrc).toContain("persisted: false");
    expect(fnSrc).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(fnSrc).not.toMatch(/place_order|createOrder|\btrade\b|open_position|metaapi|pineconnector/i);
    expect(fnSrc).not.toMatch(/ron-research|ron-calibrate|ron-orchestrate|synthesizeDecision/);
  });
});
