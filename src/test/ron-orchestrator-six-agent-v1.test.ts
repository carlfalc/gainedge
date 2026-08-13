/**
 * Phase 2D.2i — six-agent orchestration integration tests with the OPTIONAL rank-5
 * `opportunity_risk` FOUNDATION specialist added to the accepted quintet.
 *
 * The orchestrator is NOT modified by this phase: EXPECTED_AGENTS_V1, ordering and
 * synthesis semantics are asserted to be unchanged. Deterministic synthetic fixtures only.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, evidenceTtlMinutes,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  EXPECTED_AGENTS_V1, reconstructDecision, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const TRACE = "ron-2d2i-six-agent-fixture";
const AS_OF = "2026-08-13T09:45:00Z";
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };

const minus = (m: number) => new Date(Date.parse(AS_OF) - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

function envelope(agent_id: RonAgentId, ageMinutes: number, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
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

const session = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("session_market_structure", age, { direction: "short", ...over });
const calibration = (age = 271, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("calibration_model_validation", age, { direction: "neutral", recommendation: "research_only", ...over });
const pattern = (age = 15) => envelope("pattern_context", age, { direction: "neutral" });
const crossAsset = (age = 15) => envelope("cross_asset_correlation", age, { direction: "neutral" });
const macro = (age = 41) => envelope("macro_news_geopolitics", age, { direction: "neutral" });
const opportunity = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("opportunity_risk", age, {
    direction: "neutral",
    observations: [
      { key: "readiness_state", kind: "state", value_text: "blocked_not_calibrated", at: minus(age) },
      { key: "construction_allowed", kind: "state", value_text: "false", at: minus(age) },
    ],
    ...over,
  });

const sextet = () => [session(), calibration(), pattern(), crossAsset(), macro(), opportunity()];

describe("2D.2i — optional rank-5 opportunity foundation in Orchestrator V1", () => {
  it("EXPECTED_AGENTS_V1 and the opportunity registry row are unchanged", () => {
    expect([...EXPECTED_AGENTS_V1]).toEqual(["session_market_structure", "calibration_model_validation"]);
    const s = agentSpec("opportunity_risk")!;
    expect(s.authority_class).toBe("opportunity_construction");
    expect(s.source_health_authoritative).toBe(false);
    expect(evidenceTtlMinutes("opportunity_risk", "15m")).toBe(60);
  });

  it("existing orchestrator semantics are preserved verbatim: presence of the rank-5 agent " +
     "yields OPPORTUNITY_INCOMPLETE, which is the pre-existing rule and is NOT altered here", async () => {
    const { decision } = await synthesizeDecision(sextet(), CTX);
    expect(decision.state).toBe("OPPORTUNITY_INCOMPLETE");
    expect(decision.recommendation).toBe("opportunity_incomplete");
    expect(decision.direction).toBe("short");
    // Without the rank-5 agent the accepted quintet still resolves exactly as in 2D.2h.
    const { decision: quintet } = await synthesizeDecision(
      [session(), calibration(), pattern(), crossAsset(), macro()], CTX);
    expect(quintet.state).toBe("CONTEXT_SUPPORTED");
    expect(quintet.recommendation).toBe("context_only");
  });

  it("blocked/critical opportunity evidence cannot force DATA_BLOCKED", async () => {
    const { decision } = await synthesizeDecision([
      session(), calibration(), pattern(), crossAsset(), macro(),
      opportunity(15, {
        status: "blocked", direction: "unknown", recommendation: "no_action",
        data_health: { status: "critical", freshness_minutes: 15, completeness: 0, issues: ["blocked_required_health"] },
      }),
    ], CTX);
    expect(decision.blocking_reasons).toEqual([]);
    expect(decision.state).toBe("OPPORTUNITY_INCOMPLETE");
    expect(decision.state).not.toBe("DATA_BLOCKED");
    expect(decision.data_health.authoritative_worst_status).toBe("healthy");
  });

  it("a missing opportunity specialist is not a missing expected specialist", async () => {
    const { decision } = await synthesizeDecision([session(), calibration()], CTX);
    expect(decision.coverage.missing_expected_agents).toEqual([]);
    expect(decision.coverage.present_agents).not.toContain("opportunity_risk");
  });

  it("canonical refs keep rank 2, 3, 4s then rank 5 last", async () => {
    const { decision } = await synthesizeDecision(sextet(), CTX);
    expect(decision.evidence_refs.map((r) => [r.agent_id, r.authority_rank])).toEqual([
      ["calibration_model_validation", 2],
      ["session_market_structure", 3],
      ["cross_asset_correlation", 4],
      ["macro_news_geopolitics", 4],
      ["pattern_context", 4],
      ["opportunity_risk", 5],
    ]);
  });

  it("decision and explanation hashes are order-independent and replay-identical", async () => {
    const a = await synthesizeDecision(sextet(), CTX);
    const b = await synthesizeDecision([...sextet()].reverse(), CTX);
    const c = await reconstructDecision(sextet(), CTX);
    expect(b.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(b.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
    expect(c.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(c.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
  });

  it("safety invariants hold with six agents", async () => {
    const { decision, explanation } = await synthesizeDecision(sextet(), CTX);
    expect(decision.numeric_probability).toBeNull();
    expect(decision.execution_allowed).toBe(false);
    expect(decision.execution_path).toBe("signal_only");
    expect(decision.promoted_state_variables).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    const text = JSON.stringify(explanation).toLowerCase();
    for (const t of ["probability of", "entry", "buy ", "sell ", "execute"]) {
      expect(text).not.toContain(t);
    }
  });
});
