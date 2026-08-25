/**
 * GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3 — single-evaluation-anchor RON stack.
 *
 * Proves: the V3 specialist specs hash to their pinned values; ONE completed-bar-close
 * anchor is admissible to Session V3, Pattern V3, Cross-Asset V3 and Opportunity/Risk V3
 * simultaneously; every V3 envelope reports `as_of` EXACTLY equal to that shared anchor
 * while its analytical bar opens exactly one bar earlier; the Orchestration V8 acceptance
 * gates accept exactly those artifacts and fail closed on V2 lineage, misaligned anchors,
 * divergent dependency binding and forming-bar consumption; and the frozen V1-V7 plans,
 * pins, run identities and plan hashes are unchanged. Deterministic synthetic fixtures
 * only. No network, no database, no probability, no execution, nothing persisted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  sealEvidence, validateEvidence, type EvidenceEnvelopeV1,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import type { OrchestrationContext } from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { OrchestrationRunError } from "../../supabase/functions/_shared/ron-orchestration-run.ts";
import {
  ORCHESTRATION_RUN_PLAN_V7, ORCHESTRATION_RUN_SPEC_V7, deriveRunIdsV7,
  orchestrationRunPlanHashV7,
} from "../../supabase/functions/_shared/ron-orchestration-run-v7.ts";
import {
  CROSS_ASSET_AGENT, ORCHESTRATION_RUN_PLAN_AGENTS_V8, ORCHESTRATION_RUN_PLAN_V8,
  ORCHESTRATION_RUN_SPEC_V8, OPPORTUNITY_RISK_AGENT, PATTERN_CONTEXT_AGENT,
  RON_ORCHESTRATION_RUN_VERSION_V8, SESSION_STRUCTURE_AGENT,
  assertAgentBindingV8, assertCrossAssetContextV3Sealed, assertOpportunityRiskV3Sealed,
  assertPatternContextV3Sealed, assertPatternDependencyBindingV8,
  assertSessionStructureV3Sealed, deriveRunIdsV8, orchestrationRunPlanHashV8,
} from "../../supabase/functions/_shared/ron-orchestration-run-v8.ts";
import {
  SESSION_STRUCTURE_SPEC_V3, SessionStructureV3AnchorError,
  buildSessionStructureEvidenceV3, sessionStructureSpecHashV3,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v3.ts";
import {
  buildSessionStructureEvidenceV2,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import {
  PATTERN_CONTEXT_SPEC_V3, buildPatternStructureContextEvidenceV3,
  patternContextSpecHashV3,
} from "../../supabase/functions/_shared/ron-pattern-structure-context-v3.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V3, buildCrossAssetRelationshipEvidenceV3,
  crossAssetRelationshipSpecHashV3,
} from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts";
import {
  OPPORTUNITY_RISK_SPEC_V3, buildOpportunityRiskEvidenceV3, opportunityRiskSpecHashV3,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z");
const TRACE = "ron-live-anchor-v3-fixture";

interface Bar { time: number; open: number; high: number; low: number; close: number; created_at?: number | null }

function series(n: number, from = START, scale = 1): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const base = (2400 + Math.sin(i / 3) * 12 + (i % 7) * 0.4) * scale;
    out.push({
      time: from + i * BAR,
      open: base, high: base + 2.5 * scale, low: base - 2.5 * scale, close: base + 0.5 * scale,
      created_at: from + i * BAR + BAR + 1_000,
    });
  }
  return out;
}

const never = () => false;
const BARS = series(160);
/** The ONE shared evaluation anchor: the COMPLETED close of the last fixture bar. */
const ANCHOR_MS = BARS.at(-1)!.time + BAR;
const ANCHOR = new Date(ANCHOR_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
const CTX: OrchestrationContext = {
  trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: ANCHOR,
};

const sessionV3 = () => buildSessionStructureEvidenceV3({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS,
  bars: BARS, isQuarantined: never, run_id: "run-session", trace_id: TRACE,
  newest_source_bar: BARS.at(-1)!.time,
});

const patternV3 = (session: unknown) => buildPatternStructureContextEvidenceV3({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS,
  bars: BARS, isQuarantined: never, run_id: "run-pattern", trace_id: TRACE,
  newest_source_bar: BARS.at(-1)!.time, session_evidence: session,
});

const crossV3 = () => buildCrossAssetRelationshipEvidenceV3({
  instrument: "XAUUSD", counterpart: "NAS100", timeframe: "15m",
  evaluation_anchor: ANCHOR_MS, bars: BARS,
  counterpart_bars: series(160).map((b) => ({
    time: b.time, close: b.close * 6, created_at: b.created_at ?? null,
  })),
  isQuarantined: never, run_id: "run-cross", trace_id: TRACE,
  newest_source_bar: BARS.at(-1)!.time, newest_counterpart_bar: BARS.at(-1)!.time,
});

const oppV3 = (evidence: EvidenceEnvelopeV1[]) => buildOpportunityRiskEvidenceV3({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
  evidence, promoted_state_variables: PROMOTED_STATE_VARIABLES,
  run_id: "run-opportunity", trace_id: TRACE,
});

const src = (p: string) => readFileSync(p, "utf8");

describe("V3 specialist specs are pinned and deterministic", () => {
  it("hashes match the accepted pinned values", async () => {
    expect(await sessionStructureSpecHashV3())
      .toBe("0ea4ecd19d22d4a013f63f4fd44b4a6e89b47fe13be4cf6deed785c99252bc80");
    expect(await patternContextSpecHashV3())
      .toBe("fb337fb1f544f656621350355d792d587405b8995064e1550b5053f9f37205c3");
    expect(await crossAssetRelationshipSpecHashV3())
      .toBe("013e0bbd6a839f064d7d9124ff24ac164419a6af156bf3c027b63f8d62069a25");
    expect(await opportunityRiskSpecHashV3())
      .toBe("15273f91d04b597f1cd03bd169ae784a1b58b3470f394a74aec8d174455fc8f9");
  });

  it("declares no probability, forecast or execution surface", () => {
    for (const s of [SESSION_STRUCTURE_SPEC_V3, PATTERN_CONTEXT_SPEC_V3,
      CROSS_ASSET_RELATIONSHIP_SPEC_V3, OPPORTUNITY_RISK_SPEC_V3]) {
      const sc = (s as { safety_contract?: Record<string, unknown> }).safety_contract ?? {};
      expect(sc.numeric_probability_emitted ?? false).toBe(false);
      expect(sc.execution_allowed ?? false).toBe(false);
    }
  });
});

describe("ONE evaluation anchor is admissible to every V3 specialist", () => {
  it("all four V3 envelopes report as_of === the shared anchor", async () => {
    const s = await sealEvidence(await sessionV3());
    const p = await sealEvidence(await patternV3(s));
    const c = await sealEvidence(await crossV3());
    const o = await sealEvidence(await oppV3([s, p, c]));
    for (const e of [s, p, c, o]) {
      expect(validateEvidence(e)).toEqual([]);
      expect(Date.parse(e.as_of)).toBe(ANCHOR_MS);
    }
  });

  it("the analytical bar opens exactly one bar before the anchor and closes on it", async () => {
    const s = await sessionV3();
    expect(s.source_timestamps.as_of_bar_open).toBe(new Date(ANCHOR_MS - BAR).toISOString());
    expect(s.source_timestamps.as_of_bar_completed_close).toBe(new Date(ANCHOR_MS).toISOString());
    expect(s.source_timestamps.evaluation_anchor).toBe(new Date(ANCHOR_MS).toISOString());
    const c = await crossV3();
    expect(c.source_timestamps.analytical_bar_open).toBe(new Date(ANCHOR_MS - BAR).toISOString());
    expect(c.source_timestamps.as_of_bar_completed_close).toBe(new Date(ANCHOR_MS).toISOString());
  });

  it("no admitted source instant may postdate the shared anchor", async () => {
    for (const e of [await sessionV3(), await crossV3()]) {
      for (const v of Object.values(e.source_timestamps)) {
        expect(Date.parse(v)).toBeLessThanOrEqual(ANCHOR_MS);
      }
    }
  });

  it("rejects a non-bar-close-aligned anchor and a source bar after the anchor", async () => {
    await expect(buildSessionStructureEvidenceV3({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS + 1,
      bars: BARS, isQuarantined: never, run_id: "r", trace_id: TRACE,
    })).rejects.toBeInstanceOf(SessionStructureV3AnchorError);
    await expect(buildSessionStructureEvidenceV3({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS,
      bars: BARS, isQuarantined: never, run_id: "r", trace_id: TRACE,
      newest_source_bar: ANCHOR_MS + BAR,
    })).rejects.toBeInstanceOf(SessionStructureV3AnchorError);
  });
});

describe("Orchestration V8 acceptance gates", () => {
  it("accept exactly the V3 artifacts and bind them once", async () => {
    const s = await sealEvidence(await sessionV3());
    const p = await sealEvidence(await patternV3(s));
    const c = await sealEvidence(await crossV3());
    const o = await sealEvidence(await oppV3([s, p, c]));

    const sh = await assertSessionStructureV3Sealed(s, CTX);
    expect(sh).toBe(s.evidence_hash);
    expect(await assertPatternContextV3Sealed(p, CTX, sh)).toBe(p.evidence_hash);
    expect(await assertCrossAssetContextV3Sealed(c, CTX)).toBe(c.evidence_hash);
    expect(await assertOpportunityRiskV3Sealed(o, CTX)).toBe(o.evidence_hash);

    assertPatternDependencyBindingV8([s, p, c, o], sh);
    assertAgentBindingV8([s, p, c, o], CROSS_ASSET_AGENT, c.evidence_hash!);
    assertAgentBindingV8([s, p, c, o], OPPORTUNITY_RISK_AGENT, o.evidence_hash!);
  });

  it("fail closed on V2 session lineage at the same anchor", async () => {
    const v2 = await sealEvidence(await buildSessionStructureEvidenceV2({
      instrument: "XAUUSD", timeframe: "15m", as_of: ANCHOR_MS - BAR,
      bars: BARS, isQuarantined: never, run_id: "run-session", trace_id: TRACE,
    }));
    await expect(assertSessionStructureV3Sealed(v2, CTX))
      .rejects.toBeInstanceOf(OrchestrationRunError);
  });

  it("fail closed when Pattern cites a different Session hash", async () => {
    const s = await sealEvidence(await sessionV3());
    const p = await sealEvidence(await patternV3(s));
    await expect(assertPatternContextV3Sealed(p, CTX, "0".repeat(64)))
      .rejects.toBeInstanceOf(OrchestrationRunError);
    expect(() => assertPatternDependencyBindingV8([s, p], "0".repeat(64)))
      .toThrow(OrchestrationRunError);
  });

  it("fail closed when the orchestration anchor is not the specialist anchor", async () => {
    const other: OrchestrationContext = {
      ...CTX, as_of: new Date(ANCHOR_MS + BAR).toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    const s = await sealEvidence(await sessionV3());
    await expect(assertSessionStructureV3Sealed(s, other))
      .rejects.toBeInstanceOf(OrchestrationRunError);
    const c = await sealEvidence(await crossV3());
    await expect(assertCrossAssetContextV3Sealed(c, other))
      .rejects.toBeInstanceOf(OrchestrationRunError);
  });

  it("fail closed on a tampered seal", async () => {
    const s = await sealEvidence(await sessionV3());
    await expect(assertSessionStructureV3Sealed(
      { ...s, evidence_hash: "f".repeat(64) }, CTX,
    )).rejects.toBeInstanceOf(OrchestrationRunError);
  });
});

describe("Orchestration Run V8 plan", () => {
  it("is version-distinct, deterministic, and keeps the frozen seven-agent order", async () => {
    expect(RON_ORCHESTRATION_RUN_VERSION_V8).toBe(8);
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V8)
      .toEqual(ORCHESTRATION_RUN_PLAN_V7.map((p) => p.agent_id));
    const h = await orchestrationRunPlanHashV8();
    expect(h).toBe(await orchestrationRunPlanHashV8());
    expect(h).not.toBe(await orchestrationRunPlanHashV7());
  });

  it("changes ONLY the four specialist spec pins relative to V7", () => {
    const v7 = new Map(ORCHESTRATION_RUN_PLAN_V7.map((p) => [p.agent_id, p]));
    const changed: string[] = [];
    for (const p of ORCHESTRATION_RUN_PLAN_V8) {
      const before = v7.get(p.agent_id)!;
      const { spec_version_pin: a, ...restA } = p;
      const { spec_version_pin: b, ...restB } = before;
      expect(restA).toEqual(restB);
      if (a !== b) changed.push(p.agent_id);
    }
    expect(changed.sort()).toEqual([
      "cross_asset_correlation", "opportunity_risk", "pattern_context",
      "session_market_structure",
    ]);
    expect(ORCHESTRATION_RUN_SPEC_V8.spec_version_pins).toEqual({
      session_market_structure: 3,
      pattern_context: 3,
      calibration_model_validation: 2,
      cross_asset_correlation: 3,
      macro_news_geopolitics: 2,
      opportunity_risk: 3,
      falconer_signal_source: 1,
    });
  });

  it("declares the uniform anchor contract and no per-agent convention", () => {
    const u = ORCHESTRATION_RUN_SPEC_V8.uniform_anchor_contract;
    expect(u.one_decision_one_evaluation_anchor).toBe(true);
    expect(u.identical_anchor_string_for_every_specialist).toBe(true);
    expect(u.per_agent_anchor_convention).toBe(false);
    expect(u.orchestration_level_anchor_translation).toBe(false);
    expect(u.forming_bar_consumed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V8.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V8.numeric_probability).toBeNull();
  });

  it("derives run identities distinct from every frozen version", async () => {
    const v8 = await deriveRunIdsV8(TRACE, ANCHOR);
    const v7 = await deriveRunIdsV7(TRACE, ANCHOR);
    for (const agent of ORCHESTRATION_RUN_PLAN_AGENTS_V8) {
      expect(v8[agent]).toMatch(/^[0-9a-f]{32}$/);
      expect(v8[agent]).not.toBe(v7[agent]);
    }
    expect(v8).toEqual(await deriveRunIdsV8(TRACE, ANCHOR));
  });

  it("leaves the frozen V7 pins untouched", () => {
    expect(ORCHESTRATION_RUN_SPEC_V7.spec_version_pins).toEqual({
      session_market_structure: 2,
      pattern_context: 2,
      calibration_model_validation: 2,
      cross_asset_correlation: 2,
      macro_news_geopolitics: 2,
      opportunity_risk: 2,
      falconer_signal_source: 1,
    });
  });
});

describe("endpoint wiring is additive", () => {
  it("specialist selectors keep their frozen defaults and add 3", () => {
    const s = src("supabase/functions/ron-agent-session-structure/index.ts");
    expect(s).toContain("body.spec_version === 3 ? 3 : body.spec_version === 1 ? 1 : 2");
    const p = src("supabase/functions/ron-agent-pattern-context/index.ts");
    expect(p).toContain("body.spec_version == null ? 2 : Number(body.spec_version)");
    expect(p).toContain("specVersion !== 1 && specVersion !== 2 && specVersion !== 3");
    const c = src("supabase/functions/ron-agent-cross-asset-correlation/index.ts");
    expect(c).toContain("body.spec_version == null ? 2 : Number(body.spec_version)");
    expect(c).toContain("specVersion !== 1 && specVersion !== 2 && specVersion !== 3");
    const o = src("supabase/functions/ron-agent-opportunity-risk/index.ts");
    expect(o).toContain("requested !== 1 && requested !== 2 && requested !== 3");
    expect(o).toContain("body.spec_version === undefined ? 1 : body.spec_version");
  });

  it("the coordinator accepts run version 8 and keeps default 2", () => {
    const r = src("supabase/functions/ron-orchestrate-run/index.ts");
    expect(r).toContain("[1, 2, 3, 4, 5, 6, 7].includes(requestedRunVersion)");
    expect(r).toContain("requestedRunVersion === 8");
    // V9 (artifact-clock TTL repair) inherits every V8 semantic, so the V8 term now
    // includes it. V8 itself stays explicitly reachable and byte-identical in behaviour.
    expect(r).toContain("const isV8 = requestedRunVersion === 8 || isV9;");
    expect(r).toContain("? RON_ORCHESTRATION_RUN_VERSION_V2\n    : Number(body.orchestration_run_version)");
  });

  it("the 24x7 scheduler is pinned to exactly one current run version", () => {
    const s = src("supabase/functions/ron-schedule-orchestration/index.ts");
    expect(s).toContain("const ORCHESTRATION_RUN_VERSION = 9");
    expect(s).not.toContain("ORCHESTRATION_RUN_VERSION = 7");
    expect(s).not.toContain("ORCHESTRATION_RUN_VERSION = 8");
  });
});
