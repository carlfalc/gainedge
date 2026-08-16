/**
 * GAINEDGE_UI_RON_DECISION_CARD_V1 — presentation tests.
 * Pure formatter behaviour plus component truthfulness: no probability, no invented
 * claims, collapsed technical disclosure, and an unchanged service contract.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  EXECUTION_LINE, PROBABILITY_LINE, agentLabel, emptyListCopy, formatAge,
  orchestrationRunVersion, presentState, summariseEvidence, summaryParagraph, titleCaseToken,
} from "@/lib/ron-decision-presentation";
import RonDecisionCard from "@/components/ron/RonDecisionCard";
import RonEvidenceList from "@/components/ron/RonEvidenceList";
import RonExplanationPanels from "@/components/ron/RonExplanationPanels";
import type { RonDecisionView, RonEvidenceView } from "@/services/ron-decisions";

const NOW = new Date("2026-08-16T12:00:00Z");

function evidence(over: Partial<RonEvidenceView> = {}): RonEvidenceView {
  return {
    evidence_hash: "a".repeat(64),
    agent_id: "session_market_structure",
    agent_version: 2,
    as_of: "2026-08-16T11:45:00Z",
    status: "supported",
    direction: "neutral",
    recommendation: "context_only",
    observations: [{ key: "session_slot", kind: "state", value_text: "london" }],
    data_health: { status: "healthy", freshness_minutes: 15, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: [] },
    conflicts: [],
    dependencies: [],
    provenance_refs: ["spec:ron_session_market_structure:v2:abc"],
    source_timestamps: {},
    ordinal: 1,
    authority_rank: 2,
    ...over,
  };
}

function decisionView(over: Partial<RonDecisionView> = {}): RonDecisionView {
  return {
    read_version: 1,
    decision: {
      decision_id: "dec_1", decision_hash: "b".repeat(64), trace_id: "trace_1",
      instrument: "XAUUSD", timeframe: "15m", as_of: "2026-08-16T11:48:00Z",
      state: "OPPORTUNITY_INCOMPLETE", recommendation: "no_action", direction: "unknown",
      execution_path: "signal_only", created_at: "2026-08-16T11:49:00Z",
    },
    decision_detail: { blocking_reasons: [] },
    explanation: {},
    evidence: [evidence()],
    evidence_count: 1,
    reconstructable: true,
    numeric_probability: null,
    probability_status: "not_calibrated",
    execution_allowed: false,
    execution_path: "signal_only",
    ...over,
  };
}

describe("state token presentation", () => {
  it("maps a known token to human-readable wording", () => {
    const p = presentState("OPPORTUNITY_INCOMPLETE");
    expect(p.label).toBe("Opportunity checks incomplete");
    expect(p.unknown).toBe(false);
    expect(presentState("CONTEXT_SUPPORTED").tone).toBe("supported");
  });

  it("falls back to safe title case for an unknown token and invents no meaning", () => {
    const p = presentState("SOME_FUTURE_STATE");
    expect(p.label).toBe("Some Future State");
    expect(p.unknown).toBe(true);
    expect(p.glossary).toMatch(/no meaning is assumed/);
  });

  it("handles an absent token", () => {
    expect(presentState(undefined).label).toBe("Unknown state");
    expect(titleCaseToken("macro_news_geopolitics")).toBe("Macro News Geopolitics");
  });
});

describe("agent labels", () => {
  it("uses human labels for the seven known agents and title-cases anything else", () => {
    expect(agentLabel("falconer_signal_source")).toBe("Falconer signal source");
    expect(agentLabel("brand_new_agent")).toBe("Brand New Agent");
  });
});

describe("summary paragraph", () => {
  it("uses stored explanation text when present", () => {
    const v = decisionView({ explanation: { why: ["Readiness checks did not all pass."] } });
    const s = summaryParagraph(v);
    expect(s.source).toBe("stored_explanation");
    expect(s.text).toBe("Readiness checks did not all pass.");
  });

  it("falls back to the cautious glossary rather than inventing analysis", () => {
    const s = summaryParagraph(decisionView({ explanation: { why: ["  "] } }));
    expect(s.source).toBe("state_glossary");
    expect(s.text).toBe(presentState("OPPORTUNITY_INCOMPLETE").glossary);
  });
});

describe("age formatting", () => {
  it("is deterministic against a supplied clock", () => {
    expect(formatAge("2026-08-16T11:48:00Z", NOW)).toBe("12 min old");
    expect(formatAge("2026-08-16T11:59:40Z", NOW)).toBe("less than a minute old");
    expect(formatAge("2026-08-16T09:00:00Z", NOW)).toBe("3 hours old");
    expect(formatAge("2026-08-14T12:00:00Z", NOW)).toBe("2 days old");
    expect(formatAge(null, NOW)).toBe("unknown age");
    expect(formatAge("not-a-date", NOW)).toBe("unknown age");
  });
});

describe("evidence summaries", () => {
  it("summarises a healthy row with stored fields only", () => {
    const s = summariseEvidence(evidence());
    expect(s.health).toBe("healthy");
    expect(s.warnings).toEqual([]);
    expect(s.freshnessAtDecision).toBe("15 min at decision time");
    expect(s.label).toBe("Session & market structure");
  });

  it("surfaces degraded health, issues, conflicts and limitations", () => {
    const s = summariseEvidence(evidence({
      data_health: { status: "degraded", freshness_minutes: 90, completeness: 0.5, issues: ["gap_in_bars"] },
      conflicts: ["counterpart_missing"],
      uncertainty: { level: "unquantified", limitations: ["small sample"] },
    }));
    expect(s.health).toBe("degraded");
    expect(s.warnings).toEqual([
      "Data health recorded as degraded", "gap_in_bars", "counterpart_missing", "small sample",
    ]);
  });

  it("omits fields that are not stored", () => {
    const s = summariseEvidence(evidence({
      direction: null,
      data_health: undefined as unknown as RonEvidenceView["data_health"],
    }));
    expect(s.direction).toBeNull();
    expect(s.freshnessAtDecision).toBeNull();
    expect(s.health).toBe("unknown");
  });
});

describe("record integrity metadata", () => {
  it("never fabricates an orchestration run version", () => {
    expect(orchestrationRunVersion(decisionView())).toBeNull();
    const withVersion = decisionView();
    (withVersion.decision as Record<string, unknown>).orchestration_run_version = 7;
    expect(orchestrationRunVersion(withVersion)).toBe(7);
  });
});

describe("decision card rendering", () => {
  it("shows the not-calibrated governance lines and no percentage anywhere", () => {
    const { container } = render(<RonDecisionCard view={decisionView()} now={NOW} />);
    expect(screen.getByTestId("ron-probability-line").textContent).toBe(PROBABILITY_LINE);
    expect(screen.getByTestId("ron-execution-line").textContent).toContain(EXECUTION_LINE);
    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toMatch(/\b\d{1,3}(\.\d+)?\s*(percent|%)/i);
    expect(container.textContent).toMatch(/Live execution is off/);
  });

  it("renders plain-English state, local time and relative age", () => {
    render(<RonDecisionCard view={decisionView()} now={NOW} />);
    expect(screen.getByTestId("ron-state-label").textContent).toBe("Opportunity checks incomplete");
    expect(screen.getByTestId("ron-decision-time").textContent).toContain("12 min old");
    expect(screen.getByTestId("ron-summary").textContent)
      .toBe(presentState("OPPORTUNITY_INCOMPLETE").glossary);
  });
});

describe("explanation panels", () => {
  it("renders truthful empty copy instead of invented claims", () => {
    render(<RonExplanationPanels view={decisionView()} />);
    expect(screen.getByTestId("ron-strengthens").textContent).toContain(emptyListCopy("why"));
    expect(screen.getByTestId("ron-what-changes").textContent)
      .toContain(emptyListCopy("what_would_change"));
  });

  it("renders stored lines verbatim", () => {
    render(<RonExplanationPanels view={decisionView({
      explanation: { why: ["Stored line A"], what_would_change: ["Stored line B"] },
    })} />);
    expect(screen.getByTestId("ron-strengthens").textContent).toContain("Stored line A");
    expect(screen.getByTestId("ron-what-changes").textContent).toContain("Stored line B");
  });
});

describe("specialist evidence disclosure", () => {
  it("collapses technical details by default and reveals them on request", () => {
    render(<RonEvidenceList evidence={[evidence()]} />);
    expect(screen.queryByTestId("ron-technical-session_market_structure")).toBeNull();
    expect(screen.queryByText(/session_slot/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Session & market structure/ }));
    fireEvent.click(screen.getByRole("button", { name: /Technical details/ }));
    expect(screen.getByTestId("ron-technical-session_market_structure").textContent)
      .toContain("session_slot");
  });

  it("surfaces degraded warnings without opening the row", () => {
    render(<RonEvidenceList evidence={[evidence({
      data_health: { status: "degraded", freshness_minutes: 90, completeness: 0.5, issues: ["gap_in_bars"] },
    })]} />);
    expect(screen.getByTestId("ron-warnings-session_market_structure").textContent)
      .toContain("gap_in_bars");
  });
});

describe("service contract is unaffected", () => {
  it("presentation reads only existing fields of RonDecisionView", () => {
    const v = decisionView();
    expect(v.numeric_probability).toBeNull();
    expect(v.probability_status).toBe("not_calibrated");
    expect(v.execution_allowed).toBe(false);
    expect(v.execution_path).toBe("signal_only");
  });
});