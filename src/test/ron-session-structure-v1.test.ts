/**
 * Phase 2D.2b — Session & Market Structure Specialist v1 adversarial tests.
 * Deterministic, no I/O, no clock dependence.
 */
import { describe, it, expect } from "vitest";
import {
  SESSION_STRUCTURE_SPEC_V1, sessionStructureSpecHash, confirmedSwings,
  structureStateFrom, structureEventAt, asianRange, lastCompletedAsianWindow,
  buildSessionStructureEvidence, type StructureBar,
} from "../../supabase/functions/_shared/ron-session-structure-spec.ts";
import {
  validateEvidence, sealEvidence, scanDenylist,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { classifyRonSession } from "../../supabase/functions/_shared/ron-sessions.ts";

const BAR = 15 * 60_000;
const T0 = Date.UTC(2026, 6, 15, 8, 0, 0); // Wed 2026-07-15 08:00Z — London open, venue open

const never = () => false;

/** Build contiguous bars from [high, low] pairs starting at T0. */
function mk(pairs: [number, number][], start = T0): StructureBar[] {
  return pairs.map(([h, l], i) => ({
    time: start + i * BAR, open: (h + l) / 2, high: h, low: l, close: (h + l) / 2,
  }));
}

const closeOf = (b: StructureBar[]) => b.at(-1)!.time + BAR;

describe("spec freeze", () => {
  it("has a stable canonical hash and no lookahead", async () => {
    expect(SESSION_STRUCTURE_SPEC_V1.spec_version).toBe(1);
    expect(SESSION_STRUCTURE_SPEC_V1.lookahead).toBe("none");
    expect(SESSION_STRUCTURE_SPEC_V1.source_contract.synthetic_allowed).toBe(false);
    const a = await sessionStructureSpecHash();
    const b = await sessionStructureSpecHash();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("swing confirmation", () => {
  const pivot = mk([[10, 1], [11, 2], [20, 3], [12, 4], [13, 5]]);

  it("requires TWO closed right-side bars", () => {
    // only one right bar closed
    expect(confirmedSwings(pivot.slice(0, 4), pivot[3].time + BAR)).toHaveLength(0);
    // second right bar not closed yet
    expect(confirmedSwings(pivot, pivot[3].time + BAR)).toHaveLength(0);
    const s = confirmedSwings(pivot, closeOf(pivot));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "high", level: 20, time: pivot[2].time });
    expect(s[0].knowable_from).toBe(pivot[4].time + BAR);
  });

  it("equal highs/lows do not confirm a swing", () => {
    const eq = mk([[10, 5], [20, 4], [20, 3], [20, 4], [10, 5]]);
    expect(confirmedSwings(eq, closeOf(eq)).filter((s) => s.kind === "high")).toHaveLength(0);
    const eqLow = mk([[30, 9], [29, 5], [28, 5], [27, 5], [26, 9]]);
    expect(confirmedSwings(eqLow, closeOf(eqLow)).filter((s) => s.kind === "low")).toHaveLength(0);
  });

  it("never infers a swing across a missing bar", () => {
    const gapped = mk([[10, 1], [11, 2], [20, 3], [12, 4], [13, 5]]);
    gapped[4].time += BAR; // one bar missing before the last
    expect(confirmedSwings(gapped, gapped[4].time + BAR)).toHaveLength(0);
  });
});

describe("structure state", () => {
  const swing = (kind: "high" | "low", time: number, level: number) =>
    ({ kind, time, level, knowable_from: time + 3 * BAR } as const);

  it("classifies up / down / mixed / insufficient", () => {
    expect(structureStateFrom([])).toBe("insufficient_structure");
    expect(structureStateFrom([swing("high", 1, 10), swing("low", 2, 5)])).toBe("insufficient_structure");
    expect(structureStateFrom([
      swing("high", 1, 10), swing("high", 3, 12), swing("low", 2, 5), swing("low", 4, 6),
    ])).toBe("up_structure");
    expect(structureStateFrom([
      swing("high", 1, 12), swing("high", 3, 10), swing("low", 2, 6), swing("low", 4, 5),
    ])).toBe("down_structure");
    expect(structureStateFrom([
      swing("high", 1, 10), swing("high", 3, 12), swing("low", 2, 6), swing("low", 4, 5),
    ])).toBe("mixed_or_range");
  });
});

describe("break vs sweep on closed bars", () => {
  const swings = [{ kind: "high", time: T0, level: 100, knowable_from: T0 + BAR } as const,
                  { kind: "low", time: T0, level: 90, knowable_from: T0 + BAR } as const];
  const bar = (high: number, low: number, close: number): StructureBar =>
    ({ time: T0 + 5 * BAR, open: 95, high, low, close });

  it("break requires the CLOSE beyond the level", () => {
    expect(structureEventAt(bar(101, 95, 100.5), swings).kind).toBe("break_up");
    expect(structureEventAt(bar(89, 88, 89), swings).kind).toBe("break_down");
  });
  it("sweep closes back inside", () => {
    expect(structureEventAt(bar(101, 95, 99), swings).kind).toBe("sweep_high");
    expect(structureEventAt(bar(99, 89, 95), swings).kind).toBe("sweep_low");
  });
  it("none when inside the range", () => {
    expect(structureEventAt(bar(99, 91, 95), swings).kind).toBe("none");
  });
  it("a level not yet knowable cannot produce an event", () => {
    const later = [{ kind: "high", time: T0, level: 100, knowable_from: T0 + 9 * BAR } as const];
    expect(structureEventAt(bar(101, 95, 100.5), later).kind).toBe("none");
  });
});

describe("asian range", () => {
  it("uses only the fully observed 22:00-06:00 UTC window", () => {
    const asOfClose = Date.UTC(2026, 6, 15, 10, 0);
    const { start, end } = lastCompletedAsianWindow(asOfClose);
    expect(new Date(start).toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-07-15T06:00:00.000Z");

    const bars: StructureBar[] = [];
    for (let t = start; t < end; t += BAR) {
      bars.push({ time: t, open: 1, high: 10, low: 1, close: 5 });
    }
    // a later bar must never leak into the range
    bars.push({ time: end, open: 1, high: 999, low: -999, close: 5 });
    const r = asianRange(bars, asOfClose);
    expect(r.status).toBe("observed");
    expect(r.high).toBe(10);
    expect(r.low).toBe(1);

    const partial = asianRange(bars.slice(0, 4), asOfClose);
    expect(partial.status).toBe("insufficient");
    expect(partial.high).toBeNull();
  });
});

/* ------------------------------------------------------- envelope behaviour */

const upBars = (): StructureBar[] => {
  // HH + HL sequence with two confirmed highs and two confirmed lows
  const pattern: [number, number][] = [
    [10, 5], [11, 6], [9, 3], [11, 6], [12, 7],   // swing low @ idx2
    [20, 8], [13, 7], [12, 6], [13, 7], [14, 8],  // swing high @ idx5
    [15, 9], [12, 6], [16, 10], [17, 11], [18, 12], // swing low @ idx11 (higher low)
    [30, 13], [19, 12], [18, 11], [19, 12], [20, 13], // swing high @ idx15 (higher high)
    [21, 14], [22, 15],
  ];
  return mk(pattern);
};

const baseInput = (bars: StructureBar[], asOf: number) => ({
  instrument: "XAUUSD", timeframe: "15m", as_of: asOf, bars,
  isQuarantined: never, run_id: "run-1", trace_id: "trace-1",
  newest_source_bar: asOf,
});

describe("evidence envelope", () => {
  it("produces a contract-valid, denylist-clean, sealed envelope", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const e = await buildSessionStructureEvidence(baseInput(bars, asOf));
    expect(validateEvidence(e)).toEqual([]);
    expect(scanDenylist(e)).toEqual([]);
    const sealed = await sealEvidence(e);
    expect(sealed.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.agent_id).toBe("session_market_structure");
    expect(sealed.agent_version).toBe(1);
    expect(sealed.recommendation).toBe("context_only");
    expect((sealed as unknown as Record<string, unknown>).numeric_probability).toBeUndefined();
    expect((sealed as unknown as Record<string, unknown>).execution_path).toBeUndefined();
  });

  it("reports up_structure with qualitative long direction", async () => {
    const bars = upBars();
    const e = await buildSessionStructureEvidence(baseInput(bars, bars.at(-1)!.time));
    const struct = e.observations.find((o) => o.key === "structure_state")!.value_text;
    expect(struct).toBe("up_structure");
    expect(e.direction).toBe("long");
    expect(e.status).toBe("supported");
    expect(e.uncertainty.limitations.join(" ")).toContain("not a trade recommendation");
  });

  it("reports down_structure with qualitative short direction", async () => {
    // mirror each bar around 100: highs become lows, HH/HL becomes LL/LH
    const bars = upBars().map((b) => ({
      time: b.time, open: 100 - b.open, high: 100 - b.low, low: 100 - b.high, close: 100 - b.close,
    }));
    const e = await buildSessionStructureEvidence(baseInput(bars, bars.at(-1)!.time));
    expect(e.observations.find((o) => o.key === "structure_state")!.value_text)
      .toBe("down_structure");
    expect(e.direction).toBe("short");
    expect(e.status).toBe("supported");
  });

  it("insufficient history yields insufficient_data, never a fabricated structure", async () => {
    const bars = mk([[10, 5], [11, 6], [12, 7]]);
    const e = await buildSessionStructureEvidence(baseInput(bars, bars.at(-1)!.time));
    expect(e.status).toBe("insufficient_data");
    expect(e.observations.find((o) => o.key === "structure_state")!.value_text)
      .toBe("insufficient_structure");
    expect(e.direction).toBe("unknown");
  });

  it("is byte-identical on replay and immune to future-bar mutation", async () => {
    const bars = upBars();
    const asOf = bars[bars.length - 4].time;
    const a = await sealEvidence(await buildSessionStructureEvidence(baseInput(bars, asOf)));
    const mutated = bars.map((b) => (b.time > asOf ? { ...b, high: b.high + 500, low: b.low - 500 } : b));
    mutated.push({ time: bars.at(-1)!.time + BAR, open: 1, high: 9999, low: -9999, close: 1 });
    const b = await sealEvidence(await buildSessionStructureEvidence(baseInput(mutated, asOf)));
    expect(b.evidence_hash).toBe(a.evidence_hash);
    // unordered input yields the same canonical result
    const shuffled = [...bars].reverse();
    const c = await sealEvidence(await buildSessionStructureEvidence(baseInput(shuffled, asOf)));
    expect(c.evidence_hash).toBe(a.evidence_hash);
  });

  it("fails closed on a critical quality defect at as_of and never bridges it", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const e = await buildSessionStructureEvidence({
      ...baseInput(bars, asOf),
      isQuarantined: (b) => b.time === asOf,
    });
    expect(e.status).toBe("blocked");
    expect(e.data_health.status).toBe("critical");
    expect(e.data_health.issues).toContain("as_of_bar_quality_critical");
    expect(validateEvidence(e)).toEqual([]);
  });

  it("missing genuine bar at an open venue is a source failure", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time + BAR;
    const e = await buildSessionStructureEvidence(baseInput(bars, asOf));
    expect(e.status).toBe("blocked");
    expect(e.data_health.issues).toContain("as_of_bar_missing_from_genuine_source");
  });

  it("market-closed context is not mislabeled as a data failure", async () => {
    const sat = Date.UTC(2026, 6, 18, 12, 0); // Saturday
    const e = await buildSessionStructureEvidence(baseInput([], sat));
    expect(e.status).toBe("insufficient_data");
    expect(e.data_health.status).toBe("healthy");
    expect(e.data_health.issues).toContain("venue_closed_no_bar_expected");
    expect(e.observations.find((o) => o.key === "as_of_bar_status")!.value_text).toBe("market_closed");
  });

  it("excluded critical bars degrade health without bridging", async () => {
    const bars = upBars();
    const asOf = bars.at(-1)!.time;
    const drop = bars[3].time;
    const e = await buildSessionStructureEvidence({
      ...baseInput(bars, asOf), isQuarantined: (b) => b.time === drop,
    });
    expect(e.data_health.status).toBe("degraded");
    expect(e.data_health.issues.some((i) => i.startsWith("quality_critical_bars_excluded"))).toBe(true);
  });
});

describe("session classification is DST-aware", () => {
  it("London opens at 07:00Z in BST and 08:00Z in GMT", () => {
    expect(classifyRonSession(Date.UTC(2026, 6, 15, 7, 0)).active).toContain("london");  // BST
    expect(classifyRonSession(Date.UTC(2026, 0, 14, 7, 0)).active).not.toContain("london"); // GMT
    expect(classifyRonSession(Date.UTC(2026, 0, 14, 8, 0)).active).toContain("london");
  });
  it("New York overlap is DST-aware", () => {
    expect(classifyRonSession(Date.UTC(2026, 6, 15, 13, 0)).session).toBe("london_newyork_overlap");
    expect(classifyRonSession(Date.UTC(2026, 0, 14, 14, 0)).session).toBe("london_newyork_overlap");
  });
});

describe("purity guarantees", () => {
  it("never imports Falconer as an analytical source", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "supabase/functions/_shared/ron-session-structure-spec.ts", "utf8",
    );
    // no import/require of any Falconer module (the doc comment may name it)
    for (const line of src.split("\n")) {
      if (/^\s*import\s/.test(line)) expect(line).not.toMatch(/falconer/i);
    }
    expect(src).not.toMatch(/Date\.now\(\)/);
    expect(src).not.toMatch(/new Date\(\)/);
  });
  it("the endpoint is service-role only and places no orders", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "supabase/functions/ron-agent-session-structure/index.ts", "utf8",
    );
    expect(src).toMatch(/unauthorized: internal service-role endpoint/);
    expect(src).toMatch(/timingSafeEq\(token, serviceKey\)/);
    // fallback is a real privilege proof against a service-role-only table
    expect(src).toMatch(/ron_agent_registry/);
    expect(src).not.toMatch(/metaapi-trade|place_order|ron_orchestrator_decisions/i);
    expect(src).toMatch(/execution_allowed: false/);
  });
});
