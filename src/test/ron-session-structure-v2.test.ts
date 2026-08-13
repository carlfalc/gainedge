/**
 * Phase 2D.2b-CORR — Session & Market Structure Specialist V2 adversarial tests.
 * Deterministic, no I/O, no clock dependence.
 */
import { describe, it, expect } from "vitest";
import {
  SESSION_STRUCTURE_SPEC_V2, sessionStructureSpecHashV2, classifySlots, segmentSlots,
  confirmedSwingsInSegment, structureStateFromV2, structureEventAtV2, asianRangeV2,
  expectedOpenSlot, buildSessionStructureEvidenceV2,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import {
  SESSION_STRUCTURE_SPEC_V1, sessionStructureSpecHash, buildSessionStructureEvidence,
  type StructureBar,
} from "../../supabase/functions/_shared/ron-session-structure-spec.ts";
import { validateEvidence, sealEvidence, scanDenylist } from "../../supabase/functions/_shared/ron-agent-contracts.ts";

const BAR = 15 * 60_000;
const T0 = Date.UTC(2026, 6, 15, 8, 0, 0); // Wed, London open, venue open
const never = () => false;

function mk(pairs: [number, number][], start = T0): StructureBar[] {
  return pairs.map(([h, l], i) => ({
    time: start + i * BAR, open: (h + l) / 2, high: h, low: l, close: (h + l) / 2,
  }));
}

/** Long HH/HL sequence, contiguous, all inside an open venue. */
const upPattern: [number, number][] = [
  [10, 5], [11, 6], [9, 3], [11, 6], [12, 7],
  [20, 8], [13, 7], [12, 6], [13, 7], [14, 8],
  [15, 9], [12, 6], [16, 10], [17, 11], [18, 12],
  [30, 13], [19, 12], [18, 11], [19, 12], [20, 13],
  [21, 14], [22, 15],
];
const upBars = () => mk(upPattern);

const baseInput = (bars: StructureBar[], asOf: number) => ({
  instrument: "XAUUSD", timeframe: "15m", as_of: asOf, bars,
  isQuarantined: never as (b: { time: number }, m: number) => boolean,
  run_id: "run-v2", trace_id: "trace-v2", newest_source_bar: asOf,
});

/* ------------------------------------------------------------------ 1. spec */

describe("V2 spec freeze", () => {
  it("is a distinct, stable, lookahead-free spec that supersedes V1", async () => {
    expect(SESSION_STRUCTURE_SPEC_V2.spec_version).toBe(2);
    expect(SESSION_STRUCTURE_SPEC_V2.supersedes_spec_version).toBe(1);
    expect(SESSION_STRUCTURE_SPEC_V2.lookahead).toBe("none");
    expect(SESSION_STRUCTURE_SPEC_V2.source_contract.synthetic_allowed).toBe(false);
    expect(SESSION_STRUCTURE_SPEC_V2.source_contract.forward_fill_allowed).toBe(false);
    expect(SESSION_STRUCTURE_SPEC_V2.segmentation.cross_segment_swing_reuse).toBe(false);
    expect(SESSION_STRUCTURE_SPEC_V2.segmentation.never_boundary_on).toContain("expected_closed");
    const a = await sessionStructureSpecHashV2();
    expect(a).toBe(await sessionStructureSpecHashV2());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await sessionStructureSpecHash());
  });
});

/* ------------------------------------------------- 2. V1 immutability guard */

describe("V1 preservation", () => {
  it("V1 spec hash and V1 producer output are unchanged by the correction", async () => {
    expect(SESSION_STRUCTURE_SPEC_V1.spec_version).toBe(1);
    expect(await sessionStructureSpecHash())
      .toBe("cd7153e30bf7fbba0fee80a22d032c82c2ef4f10191ffcdfbf5e08f95e2ee18c");
    // the V1 producer still exists and still seals deterministically
    const bars = upBars();
    const a = await sealEvidence(await buildSessionStructureEvidence({
      ...baseInput(bars, bars.at(-1)!.time),
      lineage_refs: ["feature_version:6", "label_version:7"],
    }));
    const b = await sealEvidence(await buildSessionStructureEvidence({
      ...baseInput(bars, bars.at(-1)!.time),
      lineage_refs: ["feature_version:6", "label_version:7"],
    }));
    expect(a.evidence_hash).toBe(b.evidence_hash);
  });
});

/* --------------------------------------------------- 3. slot classification */

describe("slot classification", () => {
  it("separates admissible, quality-critical, unexpected-missing and expected-closed", () => {
    const bars = upBars();
    const slots = classifySlots(T0, bars.at(-1)!.time, bars, (b) => b.time === bars[4].time);
    expect(slots.filter((s) => s.cls === "quality_critical").map((s) => s.time)).toEqual([bars[4].time]);
    expect(slots.filter((s) => s.cls === "admissible")).toHaveLength(bars.length - 1);
    expect(slots.some((s) => s.cls === "unexpected_missing")).toBe(false);
  });

  it("a hole during an open venue is unexpected_missing, never expected_closed", () => {
    const bars = upBars().filter((_, i) => i !== 8);
    const slots = classifySlots(T0, T0 + 21 * BAR, bars, never);
    const hole = slots.find((s) => s.time === T0 + 8 * BAR)!;
    expect(hole.cls).toBe("unexpected_missing");
  });

  it("a weekend hole is expected_closed and costs nothing", () => {
    const sat = Date.UTC(2026, 6, 18, 12, 0);
    expect(expectedOpenSlot(sat)).toBe(false);
    expect(classifySlots(sat, sat, [], never)[0].cls).toBe("expected_closed");
  });

  it("broker presence overrides the calendar: a bar in a closure is still admissible", () => {
    const sat = Date.UTC(2026, 6, 18, 12, 0);
    const slots = classifySlots(sat, sat, [{ time: sat, open: 1, high: 2, low: 1, close: 2 }], never);
    expect(slots[0].cls).toBe("admissible");
  });
});

/* ------------------------------------------------------- 4. hard boundaries */

describe("segmentation never bridges a defect", () => {
  it("a quality-critical bar cuts the history in two", () => {
    const bars = upBars();
    const slots = classifySlots(T0, bars.at(-1)!.time, bars, (b) => b.time === bars[10].time);
    const segs = segmentSlots(slots);
    expect(segs).toHaveLength(2);
    expect(segs[0].bars.at(-1)!.time).toBe(bars[9].time);
    expect(segs[1].bars[0].time).toBe(bars[11].time);
    expect(segs[1].start_reason).toBe("quality_critical_defect");
    expect(segs[1].boundary_time).toBe(bars[10].time);
  });

  it("an unexpected missing open slot cuts the history in two", () => {
    const bars = upBars().filter((_, i) => i !== 10);
    const segs = segmentSlots(classifySlots(T0, T0 + 21 * BAR, bars, never));
    expect(segs).toHaveLength(2);
    expect(segs[1].start_reason).toBe("unexpected_missing_slot");
  });

  it("an expected closure does NOT cut the history", () => {
    // last open Friday slot -> Sunday reopen: every slot between is expected_closed
    const sun = Date.UTC(2026, 6, 19, 22, 0);
    let fri = sun;
    do { fri -= BAR; } while (!expectedOpenSlot(fri));
    const bars: StructureBar[] = [
      { time: fri, open: 1, high: 2, low: 1, close: 2 },
      { time: sun, open: 1, high: 2, low: 1, close: 2 },
    ];
    const segs = segmentSlots(classifySlots(fri, sun, bars, never));
    expect(segs).toHaveLength(1);
    expect(segs[0].bars).toHaveLength(2);
  });

  it("swings are never taken across a defect", () => {
    // pivot straddles the defect: the pivot's left bars are in the previous segment
    const bars = upBars();
    const withDefect = segmentSlots(classifySlots(T0, bars.at(-1)!.time, bars, (b) => b.time === bars[14].time));
    const current = withDefect.at(-1)!;
    const swings = confirmedSwingsInSegment(current.bars, bars.at(-1)!.time + BAR);
    // idx15 swing high (level 30) needed bars 13..17; bar 14 is gone, so it cannot confirm
    expect(swings.some((s) => s.level === 30)).toBe(false);
    // and the clean case does confirm it
    const clean = segmentSlots(classifySlots(T0, bars.at(-1)!.time, bars, never)).at(-1)!;
    expect(confirmedSwingsInSegment(clean.bars, bars.at(-1)!.time + BAR).some((s) => s.level === 30)).toBe(true);
  });
});

/* --------------------------------------------------- 5. structure and events */

describe("structure state and events", () => {
  const swing = (kind: "high" | "low", time: number, level: number) =>
    ({ kind, time, level, knowable_from: time + 3 * BAR } as const);

  it("classifies up / down / mixed / insufficient", () => {
    expect(structureStateFromV2([])).toBe("insufficient_structure");
    expect(structureStateFromV2([
      swing("high", 1, 10), swing("high", 3, 12), swing("low", 2, 5), swing("low", 4, 6),
    ])).toBe("up_structure");
    expect(structureStateFromV2([
      swing("high", 1, 12), swing("high", 3, 10), swing("low", 2, 6), swing("low", 4, 5),
    ])).toBe("down_structure");
    expect(structureStateFromV2([
      swing("high", 1, 10), swing("high", 3, 12), swing("low", 2, 6), swing("low", 4, 5),
    ])).toBe("mixed_or_range");
  });

  it("break needs a close beyond a level knowable BEFORE the bar opened", () => {
    const s = [swing("high", T0, 100), swing("low", T0, 90)];
    const bar = (high: number, low: number, close: number): StructureBar =>
      ({ time: T0 + 5 * BAR, open: 95, high, low, close });
    expect(structureEventAtV2(bar(101, 95, 100.5), s).kind).toBe("break_up");
    expect(structureEventAtV2(bar(101, 95, 99), s).kind).toBe("sweep_high");
    expect(structureEventAtV2(bar(99, 89, 95), s).kind).toBe("sweep_low");
    expect(structureEventAtV2(bar(99, 91, 95), s).kind).toBe("none");
    const later = [{ kind: "high", time: T0, level: 100, knowable_from: T0 + 9 * BAR } as const];
    expect(structureEventAtV2(bar(101, 95, 100.5), later).kind).toBe("none");
  });
});

/* ------------------------------------------------------------ 6. asian range */

describe("asian range V2", () => {
  it("requires every expected slot of the completed window to be present", () => {
    const asOfClose = Date.UTC(2026, 6, 15, 10, 0);
    const start = Date.UTC(2026, 6, 14, 22, 0);
    const end = Date.UTC(2026, 6, 15, 6, 0);
    const bars: StructureBar[] = [];
    for (let t = start; t < end; t += BAR) bars.push({ time: t, open: 1, high: 10, low: 1, close: 5 });
    bars.push({ time: end, open: 1, high: 999, low: -999, close: 5 }); // must not leak
    const r = asianRangeV2(bars, asOfClose);
    expect(r.status).toBe("observed");
    expect(r.high).toBe(10);
    expect(r.low).toBe(1);
    expect(r.bars_present).toBe(r.bars_expected);
    expect(asianRangeV2(bars.slice(0, 4), asOfClose).status).toBe("insufficient");
  });
});

/* ------------------------------------------------------------ 7. envelope */

describe("V2 evidence envelope", () => {
  it("is contract-valid, denylist-clean, sealed and non-executable", async () => {
    const bars = upBars();
    const e = await buildSessionStructureEvidenceV2(baseInput(bars, bars.at(-1)!.time));
    expect(validateEvidence(e)).toEqual([]);
    expect(scanDenylist(e)).toEqual([]);
    const sealed = await sealEvidence(e);
    expect(sealed.agent_id).toBe("session_market_structure");
    expect(sealed.recommendation).toBe("context_only");
    expect((sealed as unknown as Record<string, unknown>).numeric_probability).toBeUndefined();
    expect((sealed as unknown as Record<string, unknown>).execution_path).toBeUndefined();
  });

  it("cites only genuine lineage — no decorative feature/label refs", async () => {
    const bars = upBars();
    const e = await buildSessionStructureEvidenceV2(baseInput(bars, bars.at(-1)!.time));
    expect(e.provenance_refs.some((r) => /feature_version|label_version|calibration/.test(r))).toBe(false);
    expect(e.provenance_refs.some((r) => r.startsWith("quality_version:"))).toBe(true);
    expect(e.provenance_refs.some((r) => r.startsWith("source:candle_history_native:XAUUSD:15m"))).toBe(true);
    expect(e.provenance_refs.some((r) => r.startsWith("spec:ron_session_market_structure:v2:"))).toBe(true);
  });

  it("reports up and down structure qualitatively", async () => {
    const up = await buildSessionStructureEvidenceV2(baseInput(upBars(), upBars().at(-1)!.time));
    expect(up.observations.find((o) => o.key === "structure_state")!.value_text).toBe("up_structure");
    expect(up.direction).toBe("long");
    expect(up.status).toBe("supported");

    const mirrored = upBars().map((b) => ({
      time: b.time, open: 100 - b.open, high: 100 - b.low, low: 100 - b.high, close: 100 - b.close,
    }));
    const down = await buildSessionStructureEvidenceV2(baseInput(mirrored, mirrored.at(-1)!.time));
    expect(down.observations.find((o) => o.key === "structure_state")!.value_text).toBe("down_structure");
    expect(down.direction).toBe("short");
  });

  it("publishes the corrected slot accounting and completeness", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const e = await buildSessionStructureEvidenceV2(baseInput(bars, asOf));
    const g = (k: string) => e.observations.find((o) => o.key === k)!.value_num;
    expect(g("admissible_slots")).toBe(bars.length);
    expect(g("native_present_slots")).toBe(bars.length);
    expect(g("critical_excluded_slots")).toBe(0);
    expect(g("unexpected_missing_slots")).toBe(0);
    expect(g("expected_open_slots")).toBe(bars.length);
    expect(g("expected_closed_slots")).toBe(0); // contiguous open-venue interval
    expect(e.data_health.completeness).toBe(1);         // closures never reduce completeness
    expect(e.data_health.status).toBe("healthy");
  });

  it("a historical defect degrades health, splits segments and never bridges", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const e = await buildSessionStructureEvidenceV2({
      ...baseInput(bars, asOf), isQuarantined: (b) => b.time === bars[10].time,
    });
    expect(e.data_health.status).toBe("degraded");
    expect(e.data_health.issues).toContain("quality_critical_bars_excluded:1");
    expect(e.data_health.issues.some((i) => i.startsWith("analytical_segments_in_window:"))).toBe(true);
    expect(e.data_health.completeness).toBeLessThan(1);
    expect(e.observations.find((o) => o.key === "current_segment_start_reason")!.value_text)
      .toBe("quality_critical_defect");
    expect(e.observations.find((o) => o.key === "current_segment_bars")!.value_num)
      .toBe(bars.length - 11);
  });

  it("fails closed on a critical defect AT as_of and emits no fake source instants", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const e = await buildSessionStructureEvidenceV2({
      ...baseInput(bars, asOf), isQuarantined: (b) => b.time === asOf,
    });
    expect(e.status).toBe("blocked");
    expect(e.data_health.status).toBe("critical");
    expect(e.data_health.issues).toContain("as_of_bar_quality_critical");
    expect(e.source_timestamps.as_of_bar_open).toBeUndefined();
    expect(e.source_timestamps.as_of_bar_completed_close).toBeUndefined();
    expect(validateEvidence(e)).toEqual([]);
  });

  it("a missing bar at an OPEN venue is a source failure with no fabricated timestamp", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time + BAR;
    const e = await buildSessionStructureEvidenceV2(baseInput(bars, asOf));
    expect(e.status).toBe("blocked");
    expect(e.data_health.issues).toContain("as_of_bar_missing_from_genuine_source");
    expect(e.observations.find((o) => o.key === "as_of_bar_status")!.value_text).toBe("source_missing");
    expect(e.source_timestamps.as_of_bar_open).toBeUndefined();
  });

  it("closure context is not mislabeled as a data failure", async () => {
    const sat = Date.UTC(2026, 6, 18, 12, 0);
    const e = await buildSessionStructureEvidenceV2({ ...baseInput([], sat), newest_source_bar: sat });
    expect(e.status).toBe("insufficient_data");
    expect(e.data_health.status).toBe("healthy");
    expect(e.data_health.issues).toContain("venue_closed_no_bar_expected");
    expect(e.observations.find((o) => o.key === "as_of_bar_status")!.value_text).toBe("market_closed");
    expect(e.source_timestamps.as_of_bar_open).toBeUndefined();
  });

  it("insufficient in-segment history never fabricates a structure", async () => {
    const e = await buildSessionStructureEvidenceV2(baseInput(mk([[10, 5], [11, 6], [12, 7]]), T0 + 2 * BAR));
    expect(e.status).toBe("insufficient_data");
    expect(e.observations.find((o) => o.key === "structure_state")!.value_text).toBe("insufficient_structure");
    expect(e.direction).toBe("unknown");
  });

  it("is byte-identical on replay and immune to future-bar mutation or input order", async () => {
    const bars = upBars();
    const asOf = bars[bars.length - 4].time;
    const a = await sealEvidence(await buildSessionStructureEvidenceV2({ ...baseInput(bars, asOf), newest_source_bar: asOf }));
    const mutated = bars.map((b) => (b.time > asOf ? { ...b, high: b.high + 500, low: b.low - 500 } : b));
    mutated.push({ time: bars.at(-1)!.time + BAR, open: 1, high: 9999, low: -9999, close: 1 });
    const b = await sealEvidence(await buildSessionStructureEvidenceV2({ ...baseInput(mutated, asOf), newest_source_bar: asOf }));
    expect(b.evidence_hash).toBe(a.evidence_hash);
    const c = await sealEvidence(await buildSessionStructureEvidenceV2({ ...baseInput([...bars].reverse(), asOf), newest_source_bar: asOf }));
    expect(c.evidence_hash).toBe(a.evidence_hash);
  });
});

/* --------------------------------------------------------- 8. purity guards */

describe("V2 purity guarantees", () => {
  it("never imports Falconer, never reads a clock", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("supabase/functions/_shared/ron-session-structure-spec-v2.ts", "utf8");
    for (const line of src.split("\n")) {
      if (/^\s*import\s/.test(line)) expect(line).not.toMatch(/falconer/i);
    }
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/new Date\(\)/);
  });

  it("the endpoint stays service-role only, defaults to V2, keeps V1 replayable, places no orders", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("supabase/functions/ron-agent-session-structure/index.ts", "utf8");
    expect(src).toMatch(/unauthorized: internal service-role endpoint/);
    expect(src).toMatch(/timingSafeEq\(token, serviceKey\)/);
    expect(src).toMatch(/ron_agent_registry/);
    expect(src).toMatch(/body\.spec_version === 1 \? 1 : 2/);
    expect(src).toMatch(/buildSessionStructureEvidenceV2/);
    expect(src).not.toMatch(/metaapi-trade|place_order|ron_orchestrator_decisions/i);
    expect(src).toMatch(/execution_allowed: false/);
  });

  it("config pins verify_jwt=false while the in-code service-role boundary stays mandatory", async () => {
    const fs = await import("node:fs/promises");
    const cfg = await fs.readFile("supabase/config.toml", "utf8");
    // exactly one stanza, pinned false: the platform gate is deliberately NOT the boundary
    const stanzas = cfg.match(/^\[functions\.ron-agent-session-structure\]$/gm) ?? [];
    expect(stanzas).toHaveLength(1);
    const after = cfg.split("[functions.ron-agent-session-structure]")[1];
    expect(after.split("[")[0]).toMatch(/verify_jwt\s*=\s*false/);

    // ...therefore the endpoint MUST still fail closed on its own.
    const src = await fs.readFile("supabase/functions/ron-agent-session-structure/index.ts", "utf8");
    expect(src).toMatch(/if \(!token\) return json\(\{ error: "unauthorized: internal service-role endpoint" \}, 401\)/);
    expect(src).toMatch(/if \(!authorized\) return json\(\{ error: "unauthorized: internal service-role endpoint" \}, 401\)/);
    expect(src).toMatch(/timingSafeEq\(token, serviceKey\)/);
    expect(src).toMatch(/from\("ron_agent_registry"\)/); // capability proof
  });
});
