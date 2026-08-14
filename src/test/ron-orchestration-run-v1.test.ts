/**
 * Post-K1 orchestration run — Coordination Plan V1 (implementation marker 2D.2l).
 *
 * Pure-module tests only: deterministic plan/ordering, deterministic run identities,
 * fail-closed collection checks, and a persistence mapping that can never carry a JWT,
 * secret, broker/account id, money or trade geometry. No network, no database.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, authorityRankOf, sealEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  EXPECTED_AGENTS_V1, canonicalOrder, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import {
  ORCHESTRATION_RUN_PLAN_AGENTS, ORCHESTRATION_RUN_PLAN_V1, ORCHESTRATION_RUN_SPEC_V1,
  OrchestrationRunError, RON_ORCHESTRATION_RUN_VERSION, assertCollectionComplete,
  assertPersistSafe, buildPersistencePlan, deriveRunId, deriveRunIds,
  orchestrationRunPlanHash,
} from "../../supabase/functions/_shared/ron-orchestration-run.ts";

const TRACE = "ron_run_v1_fixture_trace";
const AS_OF = "2026-08-13T12:00:00Z";
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };
const minus = (m: number) => new Date(Date.parse(AS_OF) - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

function envelope(agent_id: RonAgentId, age = 15, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  const at = minus(age);
  return {
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id,
    agent_version: agentSpec(agent_id)!.agent_version,
    run_id: `fixture_${agent_id}`,
    trace_id: TRACE,
    instrument: "XAUUSD",
    timeframe: "15m",
    as_of: at,
    source_timestamps: { reference_instant: at },
    observations: [{ key: "fixture_marker", kind: "state", value_text: agent_id, at }],
    provenance_refs: [`fixture:${agent_id}`],
    data_health: { status: "healthy", freshness_minutes: age, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["synthetic deterministic fixture"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    direction: "neutral",
    recommendation: "context_only",
    ...over,
  };
}

const sevenRaw = () => ORCHESTRATION_RUN_PLAN_AGENTS.map((a) =>
  envelope(a, a === "calibration_model_validation" ? 271 : 15,
    a === "calibration_model_validation" ? { recommendation: "research_only" } : {}));

const sevenSealed = async () => canonicalOrder(await Promise.all(sevenRaw().map(sealEvidence)));

describe("orchestration run plan V1", () => {
  it("covers exactly the seven registered specialists once each", () => {
    expect(ORCHESTRATION_RUN_PLAN_V1).toHaveLength(7);
    expect(new Set(ORCHESTRATION_RUN_PLAN_AGENTS).size).toBe(7);
  });

  it("orders calls by phase, then authority rank, then agent_id", () => {
    const key = ORCHESTRATION_RUN_PLAN_V1.map((p) => [p.phase, authorityRankOf(p.agent_id), p.agent_id] as const);
    const sorted = [...key].sort((a, b) =>
      a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));
    expect(key).toEqual(sorted);
  });

  it("routes the derived opportunity agent to phase 2 with the phase-1 evidence batch", () => {
    const opp = ORCHESTRATION_RUN_PLAN_V1.find((p) => p.agent_id === "opportunity_risk")!;
    expect(opp.phase).toBe(2);
    expect(opp.requires_evidence_batch).toBe(true);
    for (const p of ORCHESTRATION_RUN_PLAN_V1.filter((x) => x.agent_id !== "opportunity_risk")) {
      expect(p.phase).toBe(1);
      expect(p.requires_evidence_batch).toBe(false);
    }
  });

  it("marks ONLY falconer_signal_source as caller-subject bound", () => {
    const bound = ORCHESTRATION_RUN_PLAN_V1.filter((p) => p.subject_scope === "caller_subject_bound");
    expect(bound.map((p) => p.agent_id)).toEqual(["falconer_signal_source"]);
  });

  it("declares a non-executing, non-probabilistic, opt-in-persistence, no-cron contract", () => {
    expect(ORCHESTRATION_RUN_SPEC_V1.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V1.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V1.dashboard_wiring).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V1.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V1.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V1.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V1.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity)
      .toBe("ordered_idempotent_upserts_not_transactional");
    expect(RON_ORCHESTRATION_RUN_VERSION).toBe(1);
  });

  it("does not broaden EXPECTED_AGENTS_V1", () => {
    expect([...EXPECTED_AGENTS_V1]).toEqual(["session_market_structure", "calibration_model_validation"]);
  });

  it("has a stable plan hash", async () => {
    const h = await orchestrationRunPlanHash();
    expect(h).toBe(await orchestrationRunPlanHash());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deterministic run identities", () => {
  it("is stable for identical trace + anchor + agent", async () => {
    const a = await deriveRunId(TRACE, AS_OF, "session_market_structure");
    const b = await deriveRunId(TRACE, AS_OF, "session_market_structure");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("differs per agent, per anchor and per trace", async () => {
    const base = await deriveRunId(TRACE, AS_OF, "session_market_structure");
    expect(await deriveRunId(TRACE, AS_OF, "pattern_context")).not.toBe(base);
    expect(await deriveRunId(TRACE, "2026-08-13T12:15:00Z", "session_market_structure")).not.toBe(base);
    expect(await deriveRunId("other_trace", AS_OF, "session_market_structure")).not.toBe(base);
  });

  it("produces one unique identity per planned agent", async () => {
    const ids = await deriveRunIds(TRACE, AS_OF);
    expect(Object.keys(ids).sort()).toEqual([...ORCHESTRATION_RUN_PLAN_AGENTS].sort());
    expect(new Set(Object.values(ids)).size).toBe(7);
  });
});

describe("collection completeness fails closed", () => {
  it("accepts an exact sealed seven-agent collection", async () => {
    const batch = await sevenSealed();
    expect(() => assertCollectionComplete(batch, CTX)).not.toThrow();
  });

  it("rejects a missing planned agent", async () => {
    const batch = (await sevenSealed()).filter((e) => e.agent_id !== "macro_news_geopolitics");
    expect(() => assertCollectionComplete(batch, CTX)).toThrow(OrchestrationRunError);
  });

  it("rejects duplicated agent evidence", async () => {
    const batch = await sevenSealed();
    expect(() => assertCollectionComplete([...batch, batch[0]], CTX)).toThrow(/duplicate_agent_evidence/);
  });

  it("rejects unsealed evidence", async () => {
    const batch = await sevenSealed();
    const unsealed = batch.map((e, i) => (i === 0 ? { ...e, evidence_hash: undefined } : e));
    expect(() => assertCollectionComplete(unsealed as never, CTX)).toThrow(/unsealed_evidence/);
  });

  it("rejects a trace, instrument, timeframe or anchor mismatch", async () => {
    const batch = await sevenSealed();
    expect(() => assertCollectionComplete(batch, { ...CTX, trace_id: "x" })).toThrow(/trace_id_mismatch/);
    expect(() => assertCollectionComplete(batch, { ...CTX, instrument: "NAS100" })).toThrow(/instrument_mismatch/);
    expect(() => assertCollectionComplete(batch, { ...CTX, timeframe: "1h" })).toThrow(/timeframe_mismatch/);
    expect(() => assertCollectionComplete(batch, { ...CTX, as_of: minus(600) }))
      .toThrow(/evidence_after_anchor/);
  });
});

describe("persistence plan safety and idempotency surface", () => {
  it("maps only the existing audit model with no probability or execution allowance", async () => {
    const sealed = await sevenSealed();
    const { decision, explanation } = await synthesizeDecision(sealed, CTX);
    const plan = buildPersistencePlan(sealed, decision, explanation);

    expect(plan.runs).toHaveLength(7);
    expect(plan.evidence).toHaveLength(7);
    expect(plan.links).toHaveLength(7);
    expect(plan.decision.numeric_probability).toBeNull();
    expect(plan.decision.execution_allowed).toBe(false);
    expect(plan.decision.execution_path).toBe("signal_only");
  });

  it("is content-addressed so an identical replay yields identical audit keys", async () => {
    const a = await sevenSealed();
    const b = await sevenSealed();
    const da = await synthesizeDecision(a, CTX);
    const db = await synthesizeDecision(b, CTX);
    const pa = buildPersistencePlan(a, da.decision, da.explanation);
    const pb = buildPersistencePlan(b, db.decision, db.explanation);
    expect(JSON.stringify(pa)).toBe(JSON.stringify(pb));
    expect(pa.decision.decision_id).toBe(pb.decision.decision_id);
  });

  it("rejects a JWT, secret, broker id, money or trade-geometry leak before any write", () => {
    expect(() => assertPersistSafe({ a: "Bearer eyJhbGciOi" }, "t")).toThrow(OrchestrationRunError);
    expect(() => assertPersistSafe({ user_id: "u" }, "t")).toThrow(/forbidden_key:user_id/);
    expect(() => assertPersistSafe({ nested: [{ entry_price: 1 }] }, "t")).toThrow(/forbidden_key:entry_price/);
    expect(() => assertPersistSafe({ nested: { pnl_usd: 0 } }, "t")).toThrow(/forbidden_key:pnl_usd/);
    expect(() => assertPersistSafe({ metaapi_account_id: "x" }, "t")).toThrow(/forbidden_key/);
    expect(() => assertPersistSafe({ observations: [{ key: "readiness_state" }] }, "t")).not.toThrow();
  });
});
