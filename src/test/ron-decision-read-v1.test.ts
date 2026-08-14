import { describe, expect, it } from "vitest";
import {
  assertReadSafe, buildDecisionView, DECISION_READ_SPEC_V1, decisionReadSpecHash,
  DecisionReadError, decisionViewHash, RON_DECISION_READ_VERSION,
} from "../../supabase/functions/_shared/ron-decision-read";

const decisionRow = () => ({
  decision_id: "dec_1",
  decision_hash: "a".repeat(64),
  explanation_hash: "b".repeat(64),
  trace_id: "trace_1",
  instrument: "XAUUSD",
  timeframe: "15m",
  as_of: "2026-08-13T12:00:00Z",
  state: "OPPORTUNITY_INCOMPLETE",
  recommendation: "opportunity_incomplete",
  direction: "neutral",
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  orchestrator_version: 1,
  decision_schema_version: 1,
  evidence_schema_version: 1,
  registry_hash: "c".repeat(64),
  ttl_policy_version: 1,
  created_at: "2026-08-13T12:01:00Z",
  decision: {
    data_health: { worst_status: "healthy", authoritative_worst_status: "healthy", stale_agents: [], issues: [] },
    coverage: { present_agents: ["session_market_structure"], missing_expected_agents: [], unexpected_agents: [] },
    agreements: [], disagreements: [], blocking_reasons: ["calibration_unpromoted"],
    promoted_state_variables: [], evidence_refs: [],
    internal_secret_token: "eyJabcdefgh.ijklmnopqrst",
  },
  explanation: {
    why: ["readiness is NOT a trade authorization"], what_would_change: [],
    missing_or_conflicting: [], data_health: [], source_refs: ["ron_stat_cells"],
    private_note: "drop me",
  },
});

const links = [
  { decision_id: "dec_1", evidence_hash: "e1", ordinal: 1, authority_rank: 2, agent_id: "session_market_structure" },
  { decision_id: "dec_1", evidence_hash: "e0", ordinal: 0, authority_rank: 1, agent_id: "data_quality" },
];

const evidenceRows = [
  {
    evidence_hash: "e0", agent_id: "data_quality", agent_version: 1, instrument: "XAUUSD",
    timeframe: "15m", as_of: "2026-08-13T12:00:00Z", status: "ok", direction: "neutral",
    recommendation: "context_only", observations: [{ key: "bars", kind: "measurement", value_num: 25 }],
    data_health: { status: "healthy", freshness_minutes: 1, completeness: 1, issues: [] },
    uncertainty: { level: "low", limitations: [] }, conflicts: [], dependencies: [],
    provenance_refs: ["candle_history"], source_timestamps: { newest_bar: "2026-08-13T11:45:00Z" },
    envelope: { account_id: "must_not_leak" },
  },
  {
    evidence_hash: "e1", agent_id: "session_market_structure", agent_version: 1, instrument: "XAUUSD",
    timeframe: "15m", as_of: "2026-08-13T12:00:00Z", status: "ok", direction: "neutral",
    recommendation: "context_only", observations: [], 
    data_health: { status: "healthy", freshness_minutes: 1, completeness: 1, issues: [] },
    uncertainty: { level: "low", limitations: [] }, conflicts: [], dependencies: [],
    provenance_refs: [], source_timestamps: {},
  },
];

describe("RON persisted-decision read contract V1", () => {
  it("projects only allowlisted fields and drops private stored payload", () => {
    const view = buildDecisionView(decisionRow(), links, evidenceRows);
    const flat = JSON.stringify(view);
    expect(flat).not.toContain("internal_secret_token");
    expect(flat).not.toContain("private_note");
    expect(flat).not.toContain("must_not_leak");
    expect(Object.keys(view.evidence[0])).not.toContain("envelope");
  });

  it("orders evidence deterministically by link ordinal", () => {
    const view = buildDecisionView(decisionRow(), links, evidenceRows);
    expect(view.evidence.map((e) => e.evidence_hash)).toEqual(["e0", "e1"]);
    const reversed = buildDecisionView(decisionRow(), [...links].reverse(), [...evidenceRows].reverse());
    expect(reversed.evidence.map((e) => e.evidence_hash)).toEqual(["e0", "e1"]);
  });

  it("is replay-deterministic at the view hash level", async () => {
    const a = await decisionViewHash(buildDecisionView(decisionRow(), links, evidenceRows));
    const b = await decisionViewHash(buildDecisionView(decisionRow(), [...links].reverse(), evidenceRows));
    expect(a).toBe(b);
  });

  it("fails closed when a linked evidence row cannot be resolved", () => {
    expect(() => buildDecisionView(decisionRow(), links, [evidenceRows[0]]))
      .toThrow(DecisionReadError);
  });

  it("holds the execution and probability invariants", () => {
    const view = buildDecisionView(decisionRow(), links, evidenceRows);
    expect(() => assertReadSafe(view)).not.toThrow();
    expect(view.numeric_probability).toBeNull();
    expect(view.probability_status).toBe("not_calibrated");
    expect(view.execution_allowed).toBe(false);
    expect(view.execution_path).toBe("signal_only");
  });

  it("rejects a stored decision that claims execution or a probability", () => {
    const bad = buildDecisionView(decisionRow(), links, evidenceRows);
    (bad.decision as Record<string, unknown>).numeric_probability = 0.61;
    expect(() => assertReadSafe(bad)).toThrow(/numeric_probability/);

    const bad2 = buildDecisionView(decisionRow(), links, evidenceRows);
    (bad2.decision as Record<string, unknown>).execution_allowed = true;
    expect(() => assertReadSafe(bad2)).toThrow(/execution_allowed/);
  });

  it("rejects secret-shaped material that reaches the view", () => {
    const view = buildDecisionView(decisionRow(), links, evidenceRows);
    (view.evidence[0] as Record<string, unknown>).provenance_refs = ["eyJabcdefgh.ijklmnopqrst"];
    expect(() => assertReadSafe(view)).toThrow(DecisionReadError);
  });

  it("pins the read spec version and declares a no-mutation surface", async () => {
    expect(RON_DECISION_READ_VERSION).toBe(1);
    expect(DECISION_READ_SPEC_V1.mutation_surface).toBe("none");
    expect(DECISION_READ_SPEC_V1.recomputation).toBe("none");
    expect(await decisionReadSpecHash()).toMatch(/^[0-9a-f]{64}$/);
  });
});
