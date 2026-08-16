/**
 * RON_ORCHESTRATION_SESSION_TO_PATTERN_V2 — pure-module tests.
 *
 * Proves: V1 plan/hash/run-id behaviour unchanged, V2 plan deterministic and
 * version-distinct, domain-separated run identities, the single sealed Session -> Pattern
 * dependency gate fails closed, and the handed envelope binds to the final batch.
 * No network, no database, no probability, no execution.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, sealEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { canonicalOrder, type OrchestrationContext } from "../../supabase/functions/_shared/ron-orchestrator.ts";
import {
  ORCHESTRATION_RUN_PLAN_AGENTS, ORCHESTRATION_RUN_PLAN_V1, OrchestrationRunError,
  assertCollectionComplete, deriveRunId, deriveRunIds, orchestrationRunPlanHash,
} from "../../supabase/functions/_shared/ron-orchestration-run.ts";
import {
  ORCHESTRATION_RUN_PLAN_AGENTS_V2, ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_SPEC_V2,
  PATTERN_SESSION_DEPENDENCY_AGENT, RON_ORCHESTRATION_RUN_VERSION_V2,
  assertPatternDependencyBinding, assertSessionDependencyBinding,
  assertSessionDependencySealed, deriveRunIdV2, deriveRunIdsV2, orchestrationRunPlanHashV2,
  patternSessionDependencyEntry,
} from "../../supabase/functions/_shared/ron-orchestration-run-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED } from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { readFileSync } from "node:fs";

const TRACE = "ron_run_v2_fixture_trace";
const AS_OF = "2026-08-15T12:00:00Z";
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };

function envelope(agent_id: RonAgentId, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  return {
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id,
    agent_version: agentSpec(agent_id)!.agent_version,
    run_id: `fixture_${agent_id}`,
    trace_id: TRACE,
    instrument: "XAUUSD",
    timeframe: "15m",
    as_of: AS_OF,
    source_timestamps: { reference_instant: AS_OF },
    observations: [{ key: "fixture_marker", kind: "state", value_text: agent_id, at: AS_OF }],
    provenance_refs: [`fixture:${agent_id}`],
    data_health: { status: "healthy", freshness_minutes: 15, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["synthetic deterministic fixture"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    direction: "neutral",
    recommendation: "context_only",
    ...over,
  };
}

const sealedSession = () => sealEvidence(envelope("session_market_structure"));

const SESSION_SPEC_REF =
  `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`;
const CLOSE_ISO = new Date(Date.parse(AS_OF) + 15 * 60_000).toISOString();

/** An ACCEPTED Session V2 envelope per the frozen Pattern V2 acceptance contract. */
const acceptedSessionEnvelope = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("session_market_structure", {
    provenance_refs: [SESSION_SPEC_REF],
    source_timestamps: {
      reference_instant: AS_OF,
      as_of_bar_open: AS_OF,
      as_of_bar_completed_close: CLOSE_ISO,
    },
    observations: [
      { key: "structure_state", kind: "state", value_text: "up_structure", at: AS_OF },
      { key: "structure_event", kind: "state", value_text: "none", at: AS_OF },
    ],
    status: "supported",
    ...over,
  });
const acceptedSession = () => sealEvidence(acceptedSessionEnvelope());

/** A sealed Session V1-shaped envelope: same agent, but NOT accepted Session V2. */
const sealedSessionV1 = () => sealEvidence(acceptedSessionEnvelope({
  provenance_refs: [`spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v1:${"a".repeat(64)}`],
}));

const patternEnvelope = (session_hash: string, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("pattern_context", {
    dependencies: [patternSessionDependencyEntry(session_hash)],
    provenance_refs: [
      `structure_context:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${session_hash}`,
    ],
    ...over,
  });

describe("orchestration run V1 is untouched by V2", () => {
  it("keeps the V1 plan, agents and hash stable", async () => {
    expect(ORCHESTRATION_RUN_PLAN_V1).toHaveLength(7);
    expect([...ORCHESTRATION_RUN_PLAN_AGENTS]).toEqual([...ORCHESTRATION_RUN_PLAN_AGENTS_V2]);
    expect(await orchestrationRunPlanHash()).toBe(await orchestrationRunPlanHash());
    for (const p of ORCHESTRATION_RUN_PLAN_V1) {
      expect((p as unknown as Record<string, unknown>).session_evidence).toBeUndefined();
      expect((p as unknown as Record<string, unknown>).depends_on_sealed_evidence).toBeUndefined();
    }
  });

  it("keeps V1 run-id derivation unchanged and domain-separated from V2", async () => {
    const v1 = await deriveRunId(TRACE, AS_OF, "pattern_context");
    expect(v1).toMatch(/^[0-9a-f]{32}$/);
    expect(v1).toBe(await deriveRunId(TRACE, AS_OF, "pattern_context"));
    for (const a of ORCHESTRATION_RUN_PLAN_AGENTS) {
      expect(await deriveRunIdV2(TRACE, AS_OF, a)).not.toBe(await deriveRunId(TRACE, AS_OF, a));
    }
    const [ids1, ids2] = [await deriveRunIds(TRACE, AS_OF), await deriveRunIdsV2(TRACE, AS_OF)];
    expect(Object.keys(ids2).sort()).toEqual(Object.keys(ids1).sort());
    expect(new Set(Object.values(ids2)).size).toBe(7);
    expect(Object.values(ids2).some((v) => Object.values(ids1).includes(v))).toBe(false);
  });
});

describe("orchestration run plan V2", () => {
  it("is deterministic, version-distinct and non-executing", async () => {
    const h = await orchestrationRunPlanHashV2();
    expect(h).toBe(await orchestrationRunPlanHashV2());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(await orchestrationRunPlanHash());
    expect(RON_ORCHESTRATION_RUN_VERSION_V2).toBe(2);
    expect(ORCHESTRATION_RUN_SPEC_V2.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V2.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V2.dashboard_wiring).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V2.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V2.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V2.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V2.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V2.run_id_domain).toBe("ron_orch_run_v2");
  });

  it("declares exactly one sealed dependency: pattern_context <- session_market_structure", () => {
    const withDep = ORCHESTRATION_RUN_PLAN_V2.filter((p) => p.depends_on_sealed_evidence.length > 0);
    expect(withDep.map((p) => p.agent_id)).toEqual(["pattern_context"]);
    expect(withDep[0].depends_on_sealed_evidence).toEqual([PATTERN_SESSION_DEPENDENCY_AGENT]);
    expect(withDep[0].dependency_param).toBe("session_evidence");
    expect(withDep[0].spec_version_pin).toBe(2);
    expect(ORCHESTRATION_RUN_PLAN_V2.find((p) => p.agent_id === "session_market_structure")!
      .spec_version_pin).toBe(2);
  });

  it("calls Session exactly once and before Pattern, preserving order/scoping/phases", () => {
    const ids = ORCHESTRATION_RUN_PLAN_V2.map((p) => p.agent_id);
    expect(ids.filter((a) => a === "session_market_structure")).toHaveLength(1);
    expect(ids.indexOf("session_market_structure")).toBeLessThan(ids.indexOf("pattern_context"));
    expect(ids).toEqual([...ORCHESTRATION_RUN_PLAN_AGENTS]);
    for (const [i, p] of ORCHESTRATION_RUN_PLAN_V2.entries()) {
      expect(p.phase).toBe(ORCHESTRATION_RUN_PLAN_V1[i].phase);
      expect(p.subject_scope).toBe(ORCHESTRATION_RUN_PLAN_V1[i].subject_scope);
      expect(p.anchor_param).toBe(ORCHESTRATION_RUN_PLAN_V1[i].anchor_param);
      expect(p.requires_evidence_batch).toBe(ORCHESTRATION_RUN_PLAN_V1[i].requires_evidence_batch);
    }
    const opp = ORCHESTRATION_RUN_PLAN_V2.find((p) => p.agent_id === "opportunity_risk")!;
    expect(opp.requires_evidence_batch).toBe(true);
    expect(opp.depends_on_sealed_evidence).toEqual([]);
    expect(ORCHESTRATION_RUN_PLAN_V2.filter((p) => p.subject_scope === "caller_subject_bound")
      .map((p) => p.agent_id)).toEqual(["falconer_signal_source"]);
  });

  it("documents which specialists still rely on endpoint defaults", () => {
    expect([...ORCHESTRATION_RUN_SPEC_V2.unpinned_agents_use_endpoint_defaults].sort())
      .toEqual(["calibration_model_validation", "cross_asset_correlation",
        "falconer_signal_source", "macro_news_geopolitics", "opportunity_risk"]);
  });
});

describe("sealed session -> pattern dependency gate fails closed", () => {
  it("accepts exactly the sealed session envelope for this run", async () => {
    const s = await acceptedSession();
    expect(await assertSessionDependencySealed(s, CTX)).toBe(s.evidence_hash);
  });

  it("rejects a sealed session-agent envelope that is not accepted Session V2", async () => {
    await expect(assertSessionDependencySealed(await sealedSession(), CTX))
      .rejects.toThrow(OrchestrationRunError);
    await expect(assertSessionDependencySealed(await sealedSessionV1(), CTX))
      .rejects.toThrow(/session_dependency_spec_provenance_mismatch/);
    await expect(assertSessionDependencySealed(
      await sealEvidence(acceptedSessionEnvelope({ status: "insufficient_data" })), CTX))
      .rejects.toThrow(/session_dependency_not_supported/);
  });

  it("rejects absence, wrong agent, unsealed, tampered, wrong scope and wrong anchor", async () => {
    const s = await acceptedSession();
    await expect(assertSessionDependencySealed(null, CTX)).rejects.toThrow(OrchestrationRunError);
    await expect(assertSessionDependencySealed(await sealEvidence(envelope("pattern_context")), CTX))
      .rejects.toThrow(/session_dependency_wrong_agent/);
    await expect(assertSessionDependencySealed({ ...s, evidence_hash: undefined }, CTX))
      .rejects.toThrow(/session_dependency_unsealed/);
    await expect(assertSessionDependencySealed({ ...s, evidence_hash: "f".repeat(64) }, CTX))
      .rejects.toThrow(/session_dependency_hash_mismatch/);
    await expect(assertSessionDependencySealed(s, { ...CTX, trace_id: "other_trace" }))
      .rejects.toThrow(/session_dependency_trace_mismatch/);
    await expect(assertSessionDependencySealed(s, { ...CTX, instrument: "NAS100" }))
      .rejects.toThrow(/session_dependency_instrument_mismatch/);
    await expect(assertSessionDependencySealed(s, { ...CTX, timeframe: "1h" }))
      .rejects.toThrow(/session_dependency_timeframe_mismatch/);
    await expect(assertSessionDependencySealed(s, { ...CTX, as_of: "2026-08-15T11:45:00Z" }))
      .rejects.toThrow(/session_dependency_anchor_mismatch/);
  });

  it("binds the handed hash to the final collected batch", async () => {
    const s = await acceptedSession();
    const batch = canonicalOrder(await Promise.all(
      ORCHESTRATION_RUN_PLAN_AGENTS_V2.map((a) =>
        a === "session_market_structure"
          ? Promise.resolve(s)
          : sealEvidence(a === "pattern_context"
            ? patternEnvelope(s.evidence_hash!) : envelope(a)))));
    expect(() => assertCollectionComplete(batch, CTX)).not.toThrow();
    expect(() => assertSessionDependencyBinding(batch, s.evidence_hash!)).not.toThrow();
    expect(() => assertPatternDependencyBinding(batch, s.evidence_hash!)).not.toThrow();
    expect(() => assertSessionDependencyBinding(batch, "a".repeat(64)))
      .toThrow(/session_dependency_binding_hash_divergence/);
    expect(() => assertSessionDependencyBinding(
      batch.filter((e) => e.agent_id !== "session_market_structure"), s.evidence_hash!))
      .toThrow(/session_dependency_binding_count:0/);
    expect(() => assertSessionDependencyBinding([...batch, s], s.evidence_hash!))
      .toThrow(/session_dependency_binding_count:2/);
  });

  it("fails closed when Pattern omits, duplicates or diverges from the handed hash", async () => {
    const s = await acceptedSession();
    const other = "b".repeat(64);
    const build = async (pattern: EvidenceEnvelopeV1) => canonicalOrder(await Promise.all(
      ORCHESTRATION_RUN_PLAN_AGENTS_V2.map((a) =>
        a === "session_market_structure"
          ? Promise.resolve(s)
          : sealEvidence(a === "pattern_context" ? pattern : envelope(a)))));

    const missing = await build(patternEnvelope(s.evidence_hash!, {
      dependencies: [], provenance_refs: ["fixture:pattern_context"],
    }));
    expect(() => assertPatternDependencyBinding(missing, s.evidence_hash!))
      .toThrow(/pattern_dependency_binding_count:0/);

    const duplicated = await build(patternEnvelope(s.evidence_hash!, {
      dependencies: [
        patternSessionDependencyEntry(s.evidence_hash!),
        patternSessionDependencyEntry(other),
      ],
    }));
    expect(() => assertPatternDependencyBinding(duplicated, s.evidence_hash!))
      .toThrow(/pattern_dependency_binding_count:2/);

    const divergent = await build(patternEnvelope(other));
    expect(() => assertPatternDependencyBinding(divergent, s.evidence_hash!))
      .toThrow(/pattern_dependency_binding_hash_divergence/);

    // Correct dependency, but structure-context provenance cites a different session.
    const badRef = await build(patternEnvelope(s.evidence_hash!, {
      provenance_refs: [
        `structure_context:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${other}`,
      ],
    }));
    expect(() => assertPatternDependencyBinding(badRef, s.evidence_hash!))
      .toThrow(/pattern_dependency_provenance_hash_divergence/);

    // Batch Session hash matches the handed hash, yet Pattern proves nothing.
    const blind = await build(patternEnvelope(other));
    expect(() => assertSessionDependencyBinding(blind, s.evidence_hash!)).not.toThrow();
    expect(() => assertPatternDependencyBinding(blind, s.evidence_hash!)).toThrow();
  });

  it("replays deterministically for identical inputs", async () => {
    const a = await acceptedSession();
    const b = await acceptedSession();
    expect(a.evidence_hash).toBe(b.evidence_hash);
    expect(await assertSessionDependencySealed(a, CTX))
      .toBe(await assertSessionDependencySealed(b, CTX));
  });

  it("carries no probability, execution, trade geometry or persistence surface", () => {
    const s = JSON.stringify(ORCHESTRATION_RUN_SPEC_V2).toLowerCase();
    for (const t of ["probability", "entry_price", "sl_price", "tp1", "lot", "allow_live_execution: true"]) {
      if (t === "probability") expect(s).toContain('"numeric_probability":null');
      else expect(s).not.toContain(t);
    }
  });
});

describe("frozen source invariants", () => {
  it("keeps V1 replay shape free of V2-only fields", () => {
    const src = readFileSync(
      "supabase/functions/ron-orchestrate-run/index.ts", "utf8");
    expect(src).toContain("...(isV2 ? { session_to_pattern_dependency_hash: sessionDependencyHash } : {})");
    expect(src).not.toMatch(/^\s*session_to_pattern_dependency_hash: sessionDependencyHash,$/m);
    // `session_evidence` is only ever attached on the V2 dependency branch.
    expect(src).toMatch(/if \(v2entry\)[\s\S]*payload\.session_evidence = dep;/);
  });

  it("has no orchestration-induced type marker in frozen Pattern V2 source", () => {
    const src = readFileSync(
      "supabase/functions/_shared/ron-pattern-structure-context-v2.ts", "utf8");
    expect(src).not.toContain("reason?: undefined");
  });
});
