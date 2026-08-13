/**
 * Phase 2D.2h — five-agent orchestration integration tests with the OPTIONAL contextual
 * `macro_news_geopolitics` specialist added to the accepted Session V2 + Calibration V1 +
 * Pattern Context V1 + Cross-Asset Correlation V1 quartet.
 *
 * Deterministic synthetic fixtures only; nothing is persisted, EXPECTED_AGENTS_V1 is NOT
 * changed and no orchestrator ordering/synthesis semantics are altered by this phase.
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

const TRACE = "ron-2d2h-five-agent-fixture";
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
const pattern = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("pattern_context", age, { direction: "neutral", recommendation: "context_only", ...over });
const crossAsset = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("cross_asset_correlation", age, { direction: "neutral", recommendation: "context_only", ...over });
const macro = (age = 41, over: Partial<EvidenceEnvelopeV1> = {}) =>
  envelope("macro_news_geopolitics", age, { direction: "neutral", recommendation: "context_only", ...over });

const quintet = () => [session(), calibration(), pattern(), crossAsset(), macro()];

describe("2D.2h — fifth optional contextual specialist in Orchestrator V1", () => {
  it("EXPECTED_AGENTS_V1 and macro registry authority are unchanged by this phase", () => {
    expect([...EXPECTED_AGENTS_V1]).toEqual(["session_market_structure", "calibration_model_validation"]);
    expect(agentSpec("macro_news_geopolitics")!.authority_class).toBe("contextual");
    expect(agentSpec("macro_news_geopolitics")!.source_health_authoritative).toBe(false);
    expect(evidenceTtlMinutes("macro_news_geopolitics", "15m")).toBe(240);
  });

  it("adding supported neutral macro context retains CONTEXT_SUPPORTED/context_only", async () => {
    const { decision } = await synthesizeDecision(quintet(), CTX);
    expect(decision.state).toBe("CONTEXT_SUPPORTED");
    expect(decision.recommendation).toBe("context_only");
  });

  it("neutral macro context does not erase the Session structural direction", async () => {
    const { decision } = await synthesizeDecision(quintet(), CTX);
    expect(decision.direction).toBe("short");
    expect(decision.disagreements.some((d) => d.kind === "directional")).toBe(false);
  });

  it("a blocked/critical macro evidence is NON-BINDING and cannot force DATA_BLOCKED", async () => {
    const { decision } = await synthesizeDecision([
      session(), calibration(), pattern(), crossAsset(),
      macro(41, {
        status: "blocked", direction: "unknown", recommendation: "no_action",
        data_health: { status: "critical", freshness_minutes: 41, completeness: 0, issues: ["conflicting_duplicate_source_row_id"] },
      }),
    ], CTX);
    expect(decision.blocking_reasons).toEqual([]);
    expect(decision.state).toBe("CONTEXT_SUPPORTED");
    expect(decision.data_health.authoritative_worst_status).toBe("healthy");
    expect(decision.data_health.worst_status).toBe("critical");
  });

  it("a missing macro specialist is not a missing expected specialist", async () => {
    const { decision } = await synthesizeDecision([session(), calibration(), pattern(), crossAsset()], CTX);
    expect(decision.coverage.missing_expected_agents).toEqual([]);
    expect(decision.coverage.present_agents).not.toContain("macro_news_geopolitics");
  });

  it("canonical evidence refs keep the existing deterministic rank ordering", async () => {
    const { decision } = await synthesizeDecision(quintet(), CTX);
    expect(decision.evidence_refs.map((r) => [r.agent_id, r.authority_rank])).toEqual([
      ["calibration_model_validation", 2],
      ["session_market_structure", 3],
      ["cross_asset_correlation", 4],
      ["macro_news_geopolitics", 4],
      ["pattern_context", 4],
    ]);
  });

  it("decision and explanation hashes are order-independent and replay-identical", async () => {
    const a = await synthesizeDecision(quintet(), CTX);
    const b = await synthesizeDecision([...quintet()].reverse(), CTX);
    const c = await reconstructDecision(quintet(), CTX);
    expect(b.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(b.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
    expect(c.decision.decision_hash).toBe(a.decision.decision_hash);
    expect(c.explanation.explanation_hash).toBe(a.explanation.explanation_hash);
  });

  it("safety invariants hold with five agents", async () => {
    const { decision, explanation } = await synthesizeDecision(quintet(), CTX);
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
