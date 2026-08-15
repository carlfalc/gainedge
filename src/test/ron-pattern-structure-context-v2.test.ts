/**
 * RON_PATTERN_STRUCTURE_CONTEXT_V2 — pattern geometry + consumed market-structure context.
 * Deterministic synthetic fixtures only. Nothing is persisted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PATTERN_CONTEXT_SPEC_V2, patternContextSpecHashV2,
  buildPatternStructureContextEvidenceV2, acceptSessionStructureContext,
  patternStructureCompatibility, levelRelationToClose,
} from "../../supabase/functions/_shared/ron-pattern-structure-context-v2.ts";
import {
  buildPatternContextEvidenceV1, patternContextSpecHash, PATTERN_CONTEXT_SPEC_V1,
  PATTERN_DETECTOR_SOURCE_SHA256,
} from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import {
  sealEvidence, validateEvidence, scanDenylist, agentSpec,
  type EvidenceEnvelopeV1,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  sessionStructureSpecHashV2, SESSION_STRUCTURE_SPEC_V2, buildSessionStructureEvidenceV2,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";

const PATTERN_V1_HASH_PINNED =
  "9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d";
const SESSION_V2_HASH_PINNED =
  "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z"); // Wednesday, venue open
const TRACE = "ron-pattern-v2-fixture";

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

const never = () => false;
const BARS = series(120);
const AS_OF = BARS.at(-1)!.time;

/** Minimal genuine-shaped SEALED Session V2 envelope for the same scope/anchor. */
async function sessionEvidence(over: {
  structure_state?: string; structure_event?: string | null; close?: number | null;
  as_of?: number; trace_id?: string; instrument?: string; timeframe?: string;
  status?: EvidenceEnvelopeV1["status"];
  provenance_refs?: string[];
  source_timestamps?: Record<string, string>;
  extra?: EvidenceEnvelopeV1["observations"];
} = {}): Promise<EvidenceEnvelopeV1> {
  const asOf = over.as_of ?? AS_OF;
  const at = new Date(asOf).toISOString();
  const observations: EvidenceEnvelopeV1["observations"] = [
    { key: "structure_state", kind: "state", value_text: over.structure_state ?? "up_structure", at },
  ];
  const evText = over.structure_event === undefined ? "none" : over.structure_event;
  if (evText != null) observations.push({ key: "structure_event", kind: "event", value_text: evText, at });
  const close = over.close === undefined ? 2400 : over.close;
  if (close != null) observations.push({ key: "as_of_bar_close_price", kind: "measurement", value_num: close, at });
  if (over.extra) observations.push(...over.extra);
  return await sealEvidence({
    schema_version: 1,
    agent_id: "session_market_structure",
    agent_version: 1,
    run_id: "fixture-session-run",
    trace_id: over.trace_id ?? TRACE,
    instrument: over.instrument ?? "XAUUSD",
    timeframe: over.timeframe ?? "15m",
    as_of: at,
    source_timestamps: over.source_timestamps ?? {
      as_of_bar_open: at,
      as_of_bar_completed_close: new Date(asOf + BAR).toISOString(),
    },
    observations,
    provenance_refs: over.provenance_refs
      ?? [`spec:ron_session_market_structure:v2:${SESSION_V2_HASH_PINNED}`],
    data_health: { status: "healthy", freshness_minutes: 0, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: [] },
    conflicts: [],
    dependencies: [],
    status: over.status ?? "supported",
    direction: "neutral",
    recommendation: "context_only",
  });
}

const buildV2 = (session: unknown, bars: Bar[] = BARS, asOf = AS_OF) =>
  buildPatternStructureContextEvidenceV2({
    instrument: "XAUUSD", timeframe: "15m", as_of: asOf, bars,
    isQuarantined: never, run_id: "fixture-run", trace_id: TRACE,
    session_evidence: session,
  });

const obs = (e: EvidenceEnvelopeV1, k: string) => e.observations.find((o) => o.key === k);
const scope = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };

describe("V2 identity and V1 preservation", () => {
  it("leaves the frozen Pattern Context V1 spec hash untouched", async () => {
    expect(await patternContextSpecHash()).toBe(PATTERN_V1_HASH_PINNED);
  });

  it("leaves the accepted Session V2 spec hash untouched", async () => {
    expect(await sessionStructureSpecHashV2()).toBe(SESSION_V2_HASH_PINNED);
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.source_spec_hash)
      .toBe(SESSION_V2_HASH_PINNED);
  });

  it("V1 evidence remains byte-identical/replayable under spec_version 1", async () => {
    const mk = () => buildPatternContextEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF, bars: BARS,
      isQuarantined: never, run_id: "r", trace_id: "t",
    });
    const one = await mk(), two = await mk();
    expect((await sealEvidence(one)).evidence_hash).toBe((await sealEvidence(two)).evidence_hash);
    expect(one.provenance_refs.some((p) => p.includes(PATTERN_V1_HASH_PINNED))).toBe(true);
  });

  it("V2 has its own stable spec hash, distinct from V1", async () => {
    const v2 = await patternContextSpecHashV2();
    expect(v2).toMatch(/^[0-9a-f]{64}$/);
    expect(v2).not.toBe(PATTERN_V1_HASH_PINNED);
    expect(await patternContextSpecHashV2()).toBe(v2);
  });

  it("keeps agent id/version and the detector pin identical to V1", () => {
    expect(PATTERN_CONTEXT_SPEC_V2.agent_id).toBe("pattern_context");
    expect(PATTERN_CONTEXT_SPEC_V2.agent_version).toBe(1);
    expect(PATTERN_CONTEXT_SPEC_V2.agent_id).toBe(PATTERN_CONTEXT_SPEC_V1.agent_id);
    expect(PATTERN_CONTEXT_SPEC_V2.detector.detector_source_sha256).toBe(PATTERN_DETECTOR_SOURCE_SHA256);
    expect(PATTERN_CONTEXT_SPEC_V2.bar_minutes).toBe(PATTERN_CONTEXT_SPEC_V1.bar_minutes);
    expect(agentSpec("pattern_context")!.agent_version).toBe(1);
  });

  it("freezes the descriptive, non-predictive safety contract", () => {
    const c = PATTERN_CONTEXT_SPEC_V2.compatibility_contract;
    for (const k of ["is_probability", "is_a_score", "is_signal_strength", "is_forecast",
      "is_an_edge", "is_a_confirmation_measure", "is_a_recommendation", "asserts_causation",
      "asserts_pattern_efficacy", "ordered_or_rankable", "numeric_encoding_emitted"] as const) {
      expect(c[k]).toBe(false);
    }
    const r = PATTERN_CONTEXT_SPEC_V2.reference_level_relation_contract;
    expect(r.comparison).toBe("exact_ordering_only");
    expect(r.tolerance_applied).toBe(false);
    expect(r.distance_bucket_emitted).toBe(false);
    expect(r.new_price_levels_invented).toBe(false);
    expect(r.stop_or_entry_or_rr_emitted).toBe(false);
    expect(PATTERN_CONTEXT_SPEC_V2.safety_contract.execution_path).toBe("signal_only");
    expect(PATTERN_CONTEXT_SPEC_V2.safety_contract.allow_live_execution).toBe(false);
    expect(PATTERN_CONTEXT_SPEC_V2.safety_contract.binding_directional_authority).toBe(false);
    expect(PATTERN_CONTEXT_SPEC_V2.safety_contract.persistence_in_this_phase).toBe(false);
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.recomputes_structure_independently).toBe(false);
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.staleness_tolerance_invented).toBe(false);
  });
});

describe("sealed Session V2 context validation", () => {
  it("accepts a genuine sealed same-scope envelope", async () => {
    const r = await acceptSessionStructureContext(await sessionEvidence(), scope);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.structure_state).toBe("up_structure");
      expect(r.as_of).toBe(AS_OF);
    }
  });

  it("rejects an absent envelope", async () => {
    expect(await acceptSessionStructureContext(null, scope))
      .toEqual({ ok: false, reason: "session_context_absent" });
    expect(await acceptSessionStructureContext(undefined, scope))
      .toEqual({ ok: false, reason: "session_context_absent" });
  });

  it("rejects an unsealed envelope", async () => {
    const { evidence_hash: _drop, ...unsealed } = await sessionEvidence();
    expect(await acceptSessionStructureContext(unsealed, scope))
      .toEqual({ ok: false, reason: "session_context_unsealed" });
  });

  it("rejects a tampered envelope whose recomputed hash disagrees", async () => {
    const e = await sessionEvidence();
    const tampered = {
      ...e,
      observations: e.observations.map((o) =>
        o.key === "structure_state" ? { ...o, value_text: "down_structure" } : o),
    };
    expect(await acceptSessionStructureContext(tampered, scope))
      .toEqual({ ok: false, reason: "session_context_hash_mismatch" });
  });

  it("rejects trace/instrument/timeframe mismatches", async () => {
    expect(await acceptSessionStructureContext(await sessionEvidence({ trace_id: "other" }), scope))
      .toEqual({ ok: false, reason: "session_context_trace_mismatch" });
    expect(await acceptSessionStructureContext(await sessionEvidence({ instrument: "NAS100" }), scope))
      .toEqual({ ok: false, reason: "session_context_instrument_mismatch" });
    expect(await acceptSessionStructureContext(await sessionEvidence({ timeframe: "1h" }), scope))
      .toEqual({ ok: false, reason: "session_context_timeframe_mismatch" });
  });

  it("rejects evidence anchored AFTER the pattern anchor (lookahead)", async () => {
    expect(await acceptSessionStructureContext(await sessionEvidence({ as_of: AS_OF + BAR }), scope))
      .toEqual({ ok: false, reason: "session_context_after_pattern_anchor" });
  });

  it("rejects stale evidence anchored before the pattern anchor, with no tolerance", async () => {
    expect(await acceptSessionStructureContext(await sessionEvidence({ as_of: AS_OF - BAR }), scope))
      .toEqual({ ok: false, reason: "session_context_anchor_mismatch" });
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.staleness_tolerance_minutes).toBe(0);
  });

  it("rejects the wrong agent, a blocked status and a missing/unknown structure state", async () => {
    const wrongAgent = { ...(await sessionEvidence()), agent_id: "pattern_context" };
    expect((await acceptSessionStructureContext(wrongAgent, scope)))
      .toEqual({ ok: false, reason: "session_context_wrong_agent" });
    expect(await acceptSessionStructureContext(await sessionEvidence({ status: "blocked" }), scope))
      .toEqual({ ok: false, reason: "session_context_not_supported" });

    const e = await sessionEvidence();
    const noState = await sealEvidence({
      ...e, evidence_hash: undefined,
      observations: e.observations.filter((o) => o.key !== "structure_state"),
    });
    expect(await acceptSessionStructureContext(noState, scope))
      .toEqual({ ok: false, reason: "session_context_structure_state_absent" });

    const bogus = await sealEvidence({
      ...e, evidence_hash: undefined,
      observations: e.observations.map((o) =>
        o.key === "structure_state" ? { ...o, value_text: "super_bullish" } : o),
    });
    expect(await acceptSessionStructureContext(bogus, scope))
      .toEqual({ ok: false, reason: "session_context_structure_state_unrecognised" });
  });

  it("rejects malformed non-envelope payloads", async () => {
    for (const bad of [42, "x", [], { agent_id: "session_market_structure", agent_version: 1 }]) {
      const r = await acceptSessionStructureContext(bad, scope);
      expect(r.ok).toBe(false);
    }
  });
});

describe("descriptive compatibility mapping", () => {
  it("pairs orientation with structure exactly, with no ranking", () => {
    expect(patternStructureCompatibility("bullish", "up_structure")).toBe("aligned_with_current_structure");
    expect(patternStructureCompatibility("bearish", "down_structure")).toBe("aligned_with_current_structure");
    expect(patternStructureCompatibility("bullish", "down_structure")).toBe("opposed_to_current_structure");
    expect(patternStructureCompatibility("bearish", "up_structure")).toBe("opposed_to_current_structure");
    expect(patternStructureCompatibility("bullish", "mixed_or_range")).toBe("mixed_or_not_directional");
    expect(patternStructureCompatibility("bearish", "mixed_or_range")).toBe("mixed_or_not_directional");
    expect(patternStructureCompatibility("bullish", "insufficient_structure")).toBe("insufficient_structure_context");
    expect(patternStructureCompatibility("bearish", null)).toBe("insufficient_structure_context");
  });

  it("relates a level to the close by exact ordering only", () => {
    expect(levelRelationToClose(2401, 2400)).toBe("above_close");
    expect(levelRelationToClose(2399, 2400)).toBe("below_close");
    expect(levelRelationToClose(2400, 2400)).toBe("equal_to_close");
    // no tolerance: the smallest representable difference still orders strictly
    expect(levelRelationToClose(2400 + Number.EPSILON * 2400, 2400)).toBe("above_close");
  });
});

describe("V2 producer behaviour", () => {
  it("is deterministic, valid and replay-identical", async () => {
    const s = await sessionEvidence();
    const a = await buildV2(s);
    const b = await buildV2(s);
    expect(validateEvidence(a)).toEqual([]);
    expect((await sealEvidence(a)).evidence_hash).toBe((await sealEvidence(b)).evidence_hash);
  });

  it("input bar order does not change canonical output", async () => {
    const s = await sessionEvidence();
    const h1 = (await sealEvidence(await buildV2(s, BARS))).evidence_hash;
    const h2 = (await sealEvidence(await buildV2(s, [...BARS].reverse()))).evidence_hash;
    expect(h1).toBe(h2);
  });

  it("up-structure + bullish geometry reads as descriptive alignment", async () => {
    const e = await buildV2(await sessionEvidence({ structure_state: "up_structure" }));
    expect(obs(e, "current_structure_state")!.value_text).toBe("up_structure");
    const bull = e.observations.filter((o) => /^pattern_\d\d_orientation$/.test(o.key))
      .filter((o) => o.value_text === "bullish");
    for (const o of bull) {
      const i = o.key.slice(0, "pattern_00".length);
      expect(obs(e, `${i}_structure_compatibility`)!.value_text).toBe("aligned_with_current_structure");
    }
    expect(obs(e, "patterns_aligned_with_current_structure")!.value_num).toBe(bull.length);
  });

  it("down-structure + bullish geometry reads as descriptive opposition", async () => {
    const e = await buildV2(await sessionEvidence({ structure_state: "down_structure" }));
    const bull = e.observations.filter((o) => /^pattern_\d\d_orientation$/.test(o.key))
      .filter((o) => o.value_text === "bullish");
    for (const o of bull) {
      const i = o.key.slice(0, "pattern_00".length);
      expect(obs(e, `${i}_structure_compatibility`)!.value_text).toBe("opposed_to_current_structure");
    }
    expect(obs(e, "patterns_opposed_to_current_structure")!.value_num).toBe(bull.length);
  });

  it("mixed and insufficient structure are handled neutrally", async () => {
    const mixed = await buildV2(await sessionEvidence({ structure_state: "mixed_or_range" }));
    expect(obs(mixed, "current_structure_state")!.value_text).toBe("mixed_or_range");
    expect(obs(mixed, "patterns_mixed_or_not_directional")!.value_num)
      .toBe(mixed.observations.filter((o) => /^pattern_\d\d_orientation$/.test(o.key)).length);
    expect(["neutral", "unknown"]).toContain(mixed.direction);

    const insuff = await buildV2(await sessionEvidence({ structure_state: "insufficient_structure" }));
    expect(obs(insuff, "patterns_without_structure_context")!.value_num)
      .toBe(insuff.observations.filter((o) => /^pattern_\d\d_orientation$/.test(o.key)).length);
  });

  it("surfaces the structure event as observed context only", async () => {
    for (const ev of ["break_up", "break_down", "sweep_high", "sweep_low", "none"] as const) {
      const e = await buildV2(await sessionEvidence({ structure_event: ev }));
      expect(obs(e, "current_structure_event")!.value_text).toBe(ev);
      expect(obs(e, "current_structure_event")!.value_num).toBeUndefined();
    }
  });

  it("relates pattern reference levels to the close with no tolerance", async () => {
    const e = await buildV2(await sessionEvidence({ close: 2400 }));
    const rels = e.observations.filter((o) => /_relation_to_close$/.test(o.key));
    for (const r of rels) {
      expect(["above_close", "below_close", "equal_to_close"]).toContain(r.value_text);
      expect(r.value_num).toBeUndefined();
      const level = obs(e, r.key.replace(/_relation_to_close$/, ""))!.value_num!;
      expect(r.value_text).toBe(
        level > 2400 ? "above_close" : level < 2400 ? "below_close" : "equal_to_close");
    }
  });

  it("emits no level relations when the session close is absent", async () => {
    const e = await buildV2(await sessionEvidence({ close: null }));
    expect(e.observations.filter((o) => /_relation_to_close$/.test(o.key))).toHaveLength(0);
    expect(obs(e, "structure_context_analytical_close")).toBeUndefined();
  });

  it("marks structure context as current at the evaluation anchor", async () => {
    const e = await buildV2(await sessionEvidence());
    expect(obs(e, "structure_context_semantics")!.value_text).toBe("current_at_evaluation_anchor");
    expect(e.source_timestamps.structure_context_as_of).toBe(new Date(AS_OF).toISOString());
    expect(e.source_timestamps.structure_context_as_of_bar_completed_close)
      .toBe(new Date(AS_OF + BAR).toISOString());
    expect(obs(e, "structure_context_analytical_close")!.at).toBe(new Date(AS_OF).toISOString());
    for (const o of e.observations) {
      if (o.at) expect(Date.parse(o.at)).toBeLessThanOrEqual(AS_OF);
    }
  });

  it("cites the consumed sealed session evidence in provenance and dependencies", async () => {
    const s = await sessionEvidence();
    const e = await buildV2(s);
    expect(e.dependencies).toContain(`session_market_structure_evidence:${s.evidence_hash}`);
    expect(e.provenance_refs.some((p) => p.includes(s.evidence_hash!))).toBe(true);
    const specHash = await patternContextSpecHashV2();
    expect(e.provenance_refs.some((p) => p.includes(specHash))).toBe(true);
    expect(e.provenance_refs.some((p) => p.includes(PATTERN_V1_HASH_PINNED))).toBe(false);
  });
});

describe("V2 fails closed without inventing structure", () => {
  const cases: [string, () => Promise<unknown>, string][] = [
    ["absent", async () => null, "session_context_absent"],
    ["blocked", async () => await sessionEvidence({ status: "blocked" }), "session_context_not_supported"],
    ["stale", async () => await sessionEvidence({ as_of: AS_OF - 4 * BAR }), "session_context_anchor_mismatch"],
    ["future", async () => await sessionEvidence({ as_of: AS_OF + BAR }), "session_context_after_pattern_anchor"],
    ["malformed", async () => ({ agent_id: "session_market_structure", agent_version: 1 }), "session_context_malformed_envelope"],
    ["cross-trace", async () => await sessionEvidence({ trace_id: "other" }), "session_context_trace_mismatch"],
  ];

  for (const [label, make, reason] of cases) {
    it(`${label} session context yields insufficient_structure_context (${reason})`, async () => {
      const e = await buildV2(await make());
      expect(validateEvidence(e)).toEqual([]);
      expect(obs(e, "structure_context_availability")!.value_text).toBe("unavailable");
      expect(obs(e, "structure_context_rejection_reason")!.value_text).toBe(reason);
      expect(obs(e, "current_structure_state")!.value_text).toBe("insufficient_structure_context");
      expect(obs(e, "current_structure_event")).toBeUndefined();
      // no alignment is ever invented
      for (const o of e.observations) {
        if (/_structure_compatibility$/.test(o.key)) {
          expect(o.value_text).toBe("insufficient_structure_context");
        }
        expect(o.key).not.toMatch(/_relation_to_close$/);
      }
      expect(obs(e, "patterns_aligned_with_current_structure")!.value_num).toBe(0);
      expect(obs(e, "patterns_opposed_to_current_structure")!.value_num).toBe(0);
    });
  }

  it("zero detected patterns remains a truthful supported contextual result", async () => {
    // a flat series produces no detector geometry, but is still fully admissible
    const flat: Bar[] = Array.from({ length: 60 }, (_, i) => ({
      time: START + i * BAR, open: 2400, high: 2400, low: 2400, close: 2400,
      created_at: START + i * BAR + BAR + 1_000,
    }));
    const asOf = flat.at(-1)!.time;
    const s = await sessionEvidence({ as_of: asOf, close: 2400 });
    const e = await buildPatternStructureContextEvidenceV2({
      instrument: "XAUUSD", timeframe: "15m", as_of: asOf, bars: flat,
      isQuarantined: never, run_id: "r", trace_id: TRACE, session_evidence: s,
    });
    expect(e.status).toBe("supported");
    expect(obs(e, "pattern_count")!.value_num).toBe(0);
    expect(obs(e, "pattern_structure_context_state")!.value_text).toBe("no_pattern_geometry_to_relate");
    expect(obs(e, "structure_context_availability")!.value_text).toBe("available");
  });

  it("a blocked V1 anchor is not overridden by available structure context", async () => {
    const gap = BARS.filter((b) => b.time !== BARS.at(-1)!.time);
    const e = await buildV2(await sessionEvidence(), gap);
    expect(e.status).toBe("blocked");
    expect(obs(e, "pattern_context_state")!.value_text).toBe("blocked");
    expect(obs(e, "pattern_structure_context_state")).toBeUndefined();
  });
});

describe("V2 safety surface", () => {
  it("stays neutral/unknown, contextual and non-executable", async () => {
    const e = await buildV2(await sessionEvidence());
    expect(["neutral", "unknown"]).toContain(e.direction);
    expect(["context_only", "no_action"]).toContain(e.recommendation);
    expect(e.agent_id).toBe("pattern_context");
    expect(e.agent_version).toBe(1);
    expect(e.uncertainty.level).toBe("unquantified");
  });

  it("emits no probability, secret or causal keys", async () => {
    const e = await sealEvidence(await buildV2(await sessionEvidence()));
    expect(scanDenylist(e)).toEqual([]);
  });

  it("leaks no confidence, target, prediction, edge or trade geometry", async () => {
    const e = await buildV2(await sessionEvidence());
    const banned = ["confidence", "target", "probab", "predict", "forecast", "edge",
      "entry", "stop_loss", "take_profit", "risk_reward", "_rr", "score", "strength",
      "caused", "win_rate", "expected_value"];
    for (const o of e.observations) {
      for (const b of banned) expect(o.key).not.toContain(b);
    }
    // the descriptive compatibility is never numerically encoded
    for (const o of e.observations) {
      if (/_structure_compatibility$/.test(o.key)) expect(o.value_num).toBeUndefined();
    }
  });

  it("source module performs no LLM call, no external fetch and no persistence", () => {
    const src = readFileSync(
      "supabase/functions/_shared/ron-pattern-structure-context-v2.ts", "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["openai", "gateway", "fetch(", "insert(", "upsert(",
      "delete(", "deno.env", "date.now(", "new date()"]) {
      expect(code.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("endpoint contract", () => {
  const src = readFileSync("supabase/functions/ron-agent-pattern-context/index.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("remains read-only, service-only and persisted=false", () => {
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(src).toContain("persisted: false");
    expect(src).toContain('execution_path: "signal_only"');
    expect(src).toContain("execution_allowed: false");
    expect(src).toContain("allow_live_execution: false");
    expect(src).toContain("unauthorized: internal service-role endpoint");
  });

  it("keeps explicit spec_version:1 replay dependency-isolated from V2 structure context", () => {
    expect(code).toContain("v1_replay_is_dependency_isolated_session_evidence_not_accepted");
    // session_evidence only ever reaches the V2 builder
    const v1Call = code.slice(code.indexOf(": buildPatternContextEvidenceV1("));
    expect(v1Call.slice(0, 300)).not.toContain("session_evidence");
    const v2Call = code.slice(code.indexOf("buildPatternStructureContextEvidenceV2("));
    expect(v2Call.slice(0, 400)).toContain("session_evidence");
  });

  it("selects the spec hash by version and rejects unknown versions", () => {
    expect(code).toContain("unsupported_spec_version");
    expect(code).toContain("specVersion === 2 ? await patternContextSpecHashV2() : await patternContextSpecHash()");
  });
});

describe("audit correction — exact Session V2 provenance, singleton observations, temporal semantics", () => {
  const reseal = async (e: EvidenceEnvelopeV1, over: Partial<EvidenceEnvelopeV1>) =>
    await sealEvidence({ ...e, ...over, evidence_hash: undefined });

  it("rejects a hash-valid envelope carrying V1/wrong/missing/duplicate session spec provenance", async () => {
    const base = await sessionEvidence();
    const variants: string[][] = [
      [`spec:ron_session_market_structure:v1:${SESSION_V2_HASH_PINNED}`],
      ["spec:ron_session_market_structure:v2:" + "0".repeat(64)],
      [],
      ["quality_version:5"],
      [
        `spec:ron_session_market_structure:v2:${SESSION_V2_HASH_PINNED}`,
        `spec:ron_session_market_structure:v2:${SESSION_V2_HASH_PINNED}`,
      ],
      [
        `spec:ron_session_market_structure:v2:${SESSION_V2_HASH_PINNED}`,
        `spec:ron_session_market_structure:v1:${SESSION_V2_HASH_PINNED}`,
      ],
    ];
    for (const provenance_refs of variants) {
      const e = await reseal(base, { provenance_refs });
      expect(await acceptSessionStructureContext(e, scope))
        .toEqual({ ok: false, reason: "session_context_spec_provenance_mismatch" });
    }
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.accepted_spec_provenance_ref)
      .toBe(`spec:ron_session_market_structure:v2:${SESSION_V2_HASH_PINNED}`);
  });

  it("rejects source timestamps that do not match the bar-open/completed-close convention", async () => {
    const at = new Date(AS_OF).toISOString();
    const bad: Record<string, string>[] = [
      {},
      { as_of_bar_open: at },
      { as_of_bar_open: at, as_of_bar_completed_close: at },
      { as_of_bar_open: new Date(AS_OF - BAR).toISOString(), as_of_bar_completed_close: at },
      { as_of_bar_open: at, as_of_bar_completed_close: new Date(AS_OF + 2 * BAR).toISOString() },
    ];
    for (const source_timestamps of bad) {
      expect(await acceptSessionStructureContext(await sessionEvidence({ source_timestamps }), scope))
        .toEqual({ ok: false, reason: "session_context_source_timestamp_mismatch" });
    }
  });

  it("rejects duplicate or conflicting required observations instead of collapsing them", async () => {
    const at = new Date(AS_OF).toISOString();
    const dupState = await sessionEvidence({
      extra: [{ key: "structure_state", kind: "state", value_text: "up_structure", at }],
    });
    expect(await acceptSessionStructureContext(dupState, scope))
      .toEqual({ ok: false, reason: "session_context_required_observation_conflict" });

    const conflictState = await sessionEvidence({
      extra: [{ key: "structure_state", kind: "state", value_text: "down_structure", at }],
    });
    expect(await acceptSessionStructureContext(conflictState, scope))
      .toEqual({ ok: false, reason: "session_context_required_observation_conflict" });

    const dupEvent = await sessionEvidence({
      extra: [{ key: "structure_event", kind: "event", value_text: "break_up", at }],
    });
    expect(await acceptSessionStructureContext(dupEvent, scope))
      .toEqual({ ok: false, reason: "session_context_required_observation_conflict" });

    const dupClose = await sessionEvidence({
      close: 2400,
      extra: [{ key: "as_of_bar_close_price", kind: "measurement", value_num: 2401, at }],
    });
    expect(await acceptSessionStructureContext(dupClose, scope))
      .toEqual({ ok: false, reason: "session_context_required_observation_conflict" });
  });

  it("never fabricates structure_event=none for a missing or unrecognised event", async () => {
    expect(await acceptSessionStructureContext(await sessionEvidence({ structure_event: null }), scope))
      .toEqual({ ok: false, reason: "session_context_structure_event_absent" });
    expect(await acceptSessionStructureContext(await sessionEvidence({ structure_event: "mega_break" }), scope))
      .toEqual({ ok: false, reason: "session_context_structure_event_unrecognised" });
    expect(PATTERN_CONTEXT_SPEC_V2.structure_context_dependency.structure_event_inferred_when_absent)
      .toBe(false);

    const e = await buildV2(await sessionEvidence({ structure_event: null }));
    expect(obs(e, "structure_context_rejection_reason")!.value_text)
      .toBe("session_context_structure_event_absent");
    expect(obs(e, "current_structure_event")).toBeUndefined();
  });

  it("rejects a non-finite close observation", async () => {
    const at = new Date(AS_OF).toISOString();
    const e = await sessionEvidence({
      close: null,
      extra: [{ key: "as_of_bar_close_price", kind: "measurement", value_text: "2400", at }],
    });
    expect(await acceptSessionStructureContext(e, scope))
      .toEqual({ ok: false, reason: "session_context_close_observation_invalid" });
  });

  it("derives the bar width from accepted specs and never redeclares it", () => {
    expect(PATTERN_CONTEXT_SPEC_V2.bar_minutes).toBe(PATTERN_CONTEXT_SPEC_V1.bar_minutes);
    expect(PATTERN_CONTEXT_SPEC_V2.bar_minutes).toBe(SESSION_STRUCTURE_SPEC_V2.bar_minutes);
  });

  it("is anchor/source-timestamp compatible with the REAL Session V2 producer", async () => {
    const sessionBars = BARS.map((b) => ({ ...b, created_at: b.created_at ?? null }));
    const real = await sealEvidence(await buildSessionStructureEvidenceV2({
      instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF, bars: sessionBars,
      isQuarantined: never, run_id: "session-real-run", trace_id: TRACE,
    }));
    const accepted = await acceptSessionStructureContext(real, scope);
    expect(accepted.ok).toBe(true);

    const e = await buildV2(real);
    expect(validateEvidence(e)).toEqual([]);
    expect(obs(e, "structure_context_availability")!.value_text).toBe("available");
    expect(e.source_timestamps.structure_context_as_of_bar_completed_close)
      .toBe(real.source_timestamps.as_of_bar_completed_close);
    for (const o of e.observations) {
      if (o.at) expect(Date.parse(o.at)).toBeLessThanOrEqual(AS_OF);
    }
  });
});
