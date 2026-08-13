/**
 * Phase 2D.2d-QA — bounded paired-orchestrator integration test for the ACCEPTED pair
 * (Session & Market Structure V2 + Calibration & Model Validation V1).
 *
 * These envelopes are DETERMINISTIC SYNTHETIC FIXTURES shaped like the accepted
 * contracts. They are NOT production market facts and are never persisted; the test
 * exercises only the pure `synthesizeDecision` / `reconstructDecision` path.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, scanDenylist, sealEvidence, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  assertGrounded, reconstructDecision, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";

const TRACE = "ron-2d2d-paired-fixture-v1";
const AS_OF = "2026-08-13T09:45:00Z";

const CTX: OrchestrationContext = {
  trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF,
};

const minus = (mins: number) => new Date(Date.parse(AS_OF) - mins * 60_000).toISOString()
  .replace(/\.\d{3}Z$/, "Z");

function envelope(
  agent_id: RonAgentId, ageMinutes: number, over: Partial<EvidenceEnvelopeV1> = {},
): EvidenceEnvelopeV1 {
  const at = minus(ageMinutes);
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
    data_health: { status: "healthy", freshness_minutes: ageMinutes, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["synthetic deterministic fixture"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    recommendation: "context_only",
    ...over,
  };
}

/** Session V2 shape: source-health-authoritative, qualitative structural direction. */
const session = (ageMinutes = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("session_market_structure", ageMinutes, {
    direction: "short",
    provenance_refs: ["fixture:session_structure_spec_v2", "fixture:candle_history_native"],
    ...over,
  });

/** Calibration V1 shape: authoritative, deliberately neutral. */
const calibration = (ageMinutes = 271, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("calibration_model_validation", ageMinutes, {
    direction: "neutral",
    recommendation: "research_only",
    provenance_refs: ["fixture:calibration_validation_spec_v1"],
    ...over,
  });

const pair = () => [session(), calibration()];

describe("2D.2d-QA — paired orchestrator integration (pure fixtures)", () => {
  it("1. valid fresh pair yields RESEARCH_ONLY / research_only", async () => {
    const { decision } = await synthesizeDecision(pair(), CTX);
    expect(decision.state).toBe("RESEARCH_ONLY");
    expect(decision.recommendation).toBe("research_only");
    expect(decision.blocking_reasons).toEqual([]);
    expect(decision.coverage.missing_expected_agents).toEqual([]);
  });

  it("2. neutral calibration does not erase the supported session direction", async () => {
    const { decision, explanation } = await synthesizeDecision(pair(), CTX);
    expect(decision.direction).toBe("short");
    expect(decision.numeric_probability).toBeNull();
    expect(decision.execution_allowed).toBe(false);
    const text = JSON.stringify(explanation).toLowerCase();
    for (const t of ["trade", "entry", "order", "buy ", "sell ", "execute"]) {
      expect(text).not.toContain(t);
    }
  });

  it("3. calibration age 480 accepted; 481 blocks as stale authoritative evidence", async () => {
    const ok = await synthesizeDecision([session(), calibration(480)], CTX);
    expect(ok.decision.state).toBe("RESEARCH_ONLY");
    const bad = await synthesizeDecision([session(), calibration(481)], CTX);
    expect(bad.decision.state).toBe("DATA_BLOCKED");
    expect(bad.decision.blocking_reasons)
      .toContain("stale_authoritative_evidence: calibration_model_validation");
  });

  it("4. session age 60 accepted; 61 blocks (session is source-health-authoritative)", async () => {
    const ok = await synthesizeDecision([session(60), calibration()], CTX);
    expect(ok.decision.state).toBe("RESEARCH_ONLY");
    const bad = await synthesizeDecision([session(61), calibration()], CTX);
    expect(bad.decision.state).toBe("DATA_BLOCKED");
    expect(bad.decision.blocking_reasons)
      .toContain("stale_authoritative_evidence: session_market_structure");
    expect(agentSpec("session_market_structure")!.source_health_authoritative).toBe(true);
  });

  it("5. reversed input order gives identical decision and explanation hashes", async () => {
    const a = await synthesizeDecision(pair(), CTX);
    const b = await synthesizeDecision([...pair()].reverse(), CTX);
    expect(b.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(b.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
  });

  it("6. reconstruction from sealed evidence reproduces exact hashes in any order", async () => {
    const sealed = await Promise.all(pair().map(sealEvidence));
    const first = await synthesizeDecision(sealed, CTX);
    const replay = await reconstructDecision(sealed, CTX);
    const reversed = await reconstructDecision([...sealed].reverse(), CTX);
    for (const r of [replay, reversed]) {
      expect(r.decision.decision_hash).toBe(first.decision.decision_hash);
      expect(r.decision.decision_id).toBe(first.decision.decision_id);
      expect(r.explanation.explanation_hash).toBe(first.explanation.explanation_hash);
    }
  });

  it("7. missing calibration is INSUFFICIENT_EVIDENCE", async () => {
    const { decision } = await synthesizeDecision([session()], CTX);
    expect(decision.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.coverage.missing_expected_agents).toEqual(["calibration_model_validation"]);
  });

  it("8. missing session is INSUFFICIENT_EVIDENCE", async () => {
    const { decision } = await synthesizeDecision([calibration()], CTX);
    expect(decision.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.coverage.missing_expected_agents).toEqual(["session_market_structure"]);
  });

  it("9. blocked or critical calibration evidence fails closed", async () => {
    const blocked = await synthesizeDecision(
      [session(), calibration(271, { status: "blocked" })], CTX);
    expect(blocked.decision.state).toBe("DATA_BLOCKED");
    const critical = await synthesizeDecision([session(), calibration(271, {
      data_health: { status: "critical", freshness_minutes: 271, completeness: 0.4, issues: ["fixture critical"] },
    })], CTX);
    expect(critical.decision.state).toBe("DATA_BLOCKED");
    expect(critical.decision.blocking_reasons)
      .toContain("critical_data_health: calibration_model_validation");
  });

  it("10. blocked or critical session evidence fails closed", async () => {
    const blocked = await synthesizeDecision(
      [session(15, { status: "blocked" }), calibration()], CTX);
    expect(blocked.decision.state).toBe("DATA_BLOCKED");
    const critical = await synthesizeDecision([session(15, {
      data_health: { status: "critical", freshness_minutes: 15, completeness: 0.2, issues: ["fixture critical"] },
    }), calibration()], CTX);
    expect(critical.decision.state).toBe("DATA_BLOCKED");
    expect(critical.decision.blocking_reasons)
      .toContain("critical_data_health: session_market_structure");
  });

  it("11. safety invariants hold on every fixture combination", async () => {
    const batches = [
      pair(), [session(), calibration(481)], [session(61), calibration()],
      [session()], [calibration()], [session(15, { status: "blocked" }), calibration()],
    ];
    for (const b of batches) {
      const { decision } = await synthesizeDecision(b, CTX);
      expect(decision.numeric_probability).toBeNull();
      expect(decision.execution_allowed).toBe(false);
      expect(decision.execution_path).toBe("signal_only");
      expect(decision.promoted_state_variables).toEqual([]);
    }
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("12. exactly two evidence refs, calibration rank 2 before session rank 3", async () => {
    const { decision } = await synthesizeDecision(pair(), CTX);
    expect(decision.evidence_refs).toHaveLength(2);
    expect(decision.evidence_refs.map((r) => [r.agent_id, r.authority_rank])).toEqual([
      ["calibration_model_validation", 2], ["session_market_structure", 3],
    ]);
    expect(decision.evidence_refs.map((r) => r.ttl_minutes)).toEqual([480, 60]);
    expect(decision.evidence_refs.every((r) => r.stale === false)).toBe(true);
  });

  it("13. Ask RON explanation stays grounded with no invented facts", async () => {
    const sealed = await Promise.all(pair().map(sealEvidence));
    const { decision, explanation } = await synthesizeDecision(sealed, CTX);
    const { explanation_hash: _h, ...core } = explanation;
    expect(assertGrounded(core, sealed, decision)).toEqual([]);
    expect(assertGrounded(
      { ...core, why: [...core.why, "gold at 2999.99 on 2020-01-01T00:00:00Z"] },
      sealed, decision,
    ).length).toBeGreaterThan(0);
    expect(assertGrounded({ ...core, why: [...core.why, "short because of the london session"] },
      sealed, decision).length).toBeGreaterThan(0);
  });

  it("14. pins the FULL accepted Session V2 spec hash", async () => {
    expect(await sessionStructureSpecHashV2())
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
  });

  it("15. pins the FULL accepted Calibration Validation V1 spec hash", async () => {
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
  });

  it("16. fixtures are contract-valid and denylist-clean", async () => {
    for (const e of pair()) {
      expect(validateEvidence(e)).toEqual([]);
      expect(scanDenylist(await sealEvidence(e))).toEqual([]);
    }
  });
});
