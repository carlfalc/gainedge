/**
 * Phase 2D.2j — seven-agent orchestration integration tests with the OPTIONAL rank-6
 * `falconer_signal_source` STRATEGY CONTEXT specialist added to the accepted sextet.
 *
 * The orchestrator is NOT modified by this phase: EXPECTED_AGENTS_V1, ordering and
 * synthesis semantics are asserted to be unchanged. Deterministic synthetic fixtures only.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, evidenceTtlMinutes, FALCONER_AUTHORITY,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  EXPECTED_AGENTS_V1, reconstructDecision, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const TRACE = "ron-2d2j-seven-agent-fixture";
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

const falconer = (age = 5, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("falconer_signal_source", age, {
    direction: "neutral",
    observations: [
      { key: "falconer_authority", kind: "state", value_text: "strategy_context_only", at: minus(age) },
      { key: "falconer_runtime_state", kind: "state", value_text: "runtime_events_present", at: minus(age) },
    ],
    ...over,
  });

const sextet = () => [session(), calibration(), pattern(), crossAsset(), macro(), opportunity()];
const septet = () => [...sextet(), falconer()];

describe("2D.2j — optional rank-6 Falconer strategy context in Orchestrator V1", () => {
  it("EXPECTED_AGENTS_V1 and the Falconer registry row are unchanged", () => {
    expect([...EXPECTED_AGENTS_V1]).toEqual(["session_market_structure", "calibration_model_validation"]);
    const s = agentSpec("falconer_signal_source")!;
    expect(s.authority_class).toBe("strategy_context");
    expect(s.non_authoritative).toBe(true);
    expect(s.source_health_authoritative).toBe(false);
    expect(evidenceTtlMinutes("falconer_signal_source", "15m")).toBe(60);
    expect(FALCONER_AUTHORITY).toBe("strategy_context_only");
  });

  it("adding Falconer does not change the state the sextet already produces", async () => {
    const six = await synthesizeDecision(sextet(), CTX);
    const seven = await synthesizeDecision(septet(), CTX);
    expect(six.decision.state).toBe("OPPORTUNITY_INCOMPLETE");
    expect(seven.decision.state).toBe(six.decision.state);
    expect(seven.decision.recommendation).toBe(six.decision.recommendation);
    expect(seven.decision.direction).toBe("short");
  });

  it("Falconer cannot override the Session structural direction", async () => {
    const { decision } = await synthesizeDecision(
      [...sextet(), falconer(5, { direction: "long" })], CTX);
    expect(decision.direction).toBe("short");
  });

  it("blocked/critical Falconer evidence cannot force DATA_BLOCKED", async () => {
    const { decision } = await synthesizeDecision([
      ...sextet(),
      falconer(5, {
        status: "blocked", direction: "unknown", recommendation: "no_action",
        data_health: { status: "critical", freshness_minutes: 5, completeness: 0, issues: ["source_blocked"] },
      }),
    ], CTX);
    expect(decision.blocking_reasons).toEqual([]);
    expect(decision.state).not.toBe("DATA_BLOCKED");
    expect(decision.state).toBe("OPPORTUNITY_INCOMPLETE");
    expect(decision.data_health.authoritative_worst_status).toBe("healthy");
  });

  it("a missing Falconer specialist is not a missing expected specialist", async () => {
    const { decision } = await synthesizeDecision([session(), calibration()], CTX);
    expect(decision.coverage.missing_expected_agents).toEqual([]);
    expect(decision.coverage.present_agents).not.toContain("falconer_signal_source");
  });

  it("canonical refs keep rank 2, 3, the rank-4 trio, rank 5 then rank-6 Falconer last", async () => {
    const { decision } = await synthesizeDecision(septet(), CTX);
    expect(decision.evidence_refs.map((r) => [r.agent_id, r.authority_rank])).toEqual([
      ["calibration_model_validation", 2],
      ["session_market_structure", 3],
      ["cross_asset_correlation", 4],
      ["macro_news_geopolitics", 4],
      ["pattern_context", 4],
      ["opportunity_risk", 5],
      ["falconer_signal_source", 6],
    ]);
  });

  it("opportunity readiness semantics are untouched by Falconer", async () => {
    const { decision } = await synthesizeDecision(septet(), CTX);
    const opp = decision.evidence_refs.find((r) => r.agent_id === "opportunity_risk");
    expect(opp).toBeTruthy();
    expect(decision.recommendation).toBe("opportunity_incomplete");
  });

  it("decision and explanation hashes are order-independent and replay-identical", async () => {
    const a = await synthesizeDecision(septet(), CTX);
    const b = await synthesizeDecision([...septet()].reverse(), CTX);
    const c = await reconstructDecision(septet(), CTX);
    expect(b.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(b.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
    expect(c.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(c.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
  });

  it("safety invariants hold with seven agents", async () => {
    const { decision, explanation } = await synthesizeDecision(septet(), CTX);
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
