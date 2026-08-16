/**
 * GAINEDGE_PRODUCT_RON_EVIDENCE_FOCUS_V1 — evidence focus filter presentation tests.
 * Stored evidence only: no scoring, ranking, probability, or execution enablement.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RonEvidenceList from "@/components/ron/RonEvidenceList";
import { summariseEvidence } from "@/lib/ron-decision-presentation";
import type { RonEvidenceView } from "@/services/ron-decisions";

const SRC = readFileSync("src/components/ron/RonEvidenceList.tsx", "utf8");

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
  } as RonEvidenceView;
}

const healthy1 = evidence({ evidence_hash: "1".repeat(64), agent_id: "session_market_structure" });
const degraded = evidence({
  evidence_hash: "2".repeat(64),
  agent_id: "pattern_context",
  data_health: { status: "degraded", freshness_minutes: 20, completeness: 0.5, issues: ["stale source"] },
});
const healthy2 = evidence({ evidence_hash: "3".repeat(64), agent_id: "opportunity_risk" });
const caveated = evidence({
  evidence_hash: "4".repeat(64),
  agent_id: "macro_news_geopolitics",
  uncertainty: { level: "unquantified", limitations: ["limited sample"] },
});
const ALL = [healthy1, degraded, healthy2, caveated];

function labels() {
  return screen.getAllByRole("button", { expanded: false })
    .filter((b) => b.getAttribute("aria-pressed") === null)
    .map((b) => b.textContent ?? "");
}

describe("evidence focus filter", () => {
  it("defaults to All and shows every stored row in source order", () => {
    render(<RonEvidenceList evidence={ALL} />);
    expect(screen.getByTestId("ron-evidence-filter-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ron-evidence-filter-attention")).toHaveAttribute("aria-pressed", "false");
    const l = labels();
    expect(l).toHaveLength(4);
    expect(l[0]).toContain("Session & market structure");
    expect(l[1]).toContain("Chart pattern context");
    expect(l[2]).toContain("Opportunity readiness");
    expect(l[3]).toContain("Macro, news & geopolitics");
  });

  it("attention count follows exactly health !== healthy || hasWarnings", () => {
    const expected = ALL.filter((e) => {
      const s = summariseEvidence(e);
      return s.health !== "healthy" || s.hasWarnings;
    }).length;
    expect(expected).toBe(2);
    render(<RonEvidenceList evidence={ALL} />);
    expect(screen.getByTestId("ron-evidence-filter-attention").textContent).toContain(`(${expected})`);
  });

  it("filters to matching rows only, preserving source order", () => {
    render(<RonEvidenceList evidence={ALL} />);
    fireEvent.click(screen.getByTestId("ron-evidence-filter-attention"));
    const l = labels();
    expect(l).toHaveLength(2);
    expect(l[0]).toContain("Chart pattern context");
    expect(l[1]).toContain("Macro, news & geopolitics");
    expect(screen.getByTestId("ron-evidence-showing").textContent).toContain("Showing 2");
  });

  it("keeps the total stored count visible while filtered", () => {
    render(<RonEvidenceList evidence={ALL} />);
    fireEvent.click(screen.getByTestId("ron-evidence-filter-attention"));
    expect(screen.getByText("Specialist evidence (4 stored)")).toBeTruthy();
  });

  it("shows a truthful empty message for a zero-attention record", () => {
    render(<RonEvidenceList evidence={[healthy1, healthy2]} />);
    fireEvent.click(screen.getByTestId("ron-evidence-filter-attention"));
    const msg = screen.getByTestId("ron-evidence-attention-empty").textContent ?? "";
    expect(msg).toBe("No specialist evidence in this stored record needs attention.");
    expect(msg.toLowerCase()).not.toMatch(/safe|favourable|favorable|risk-free/);
    expect(labels()).toHaveLength(0);
  });

  it("exposes accessible pressed state on both controls", () => {
    render(<RonEvidenceList evidence={ALL} />);
    fireEvent.click(screen.getByTestId("ron-evidence-filter-attention"));
    expect(screen.getByTestId("ron-evidence-filter-attention")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ron-evidence-filter-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("resets to All when the evidence record changes", () => {
    const { rerender } = render(<RonEvidenceList evidence={ALL} />);
    fireEvent.click(screen.getByTestId("ron-evidence-filter-attention"));
    expect(screen.getByTestId("ron-evidence-filter-attention")).toHaveAttribute("aria-pressed", "true");
    rerender(<RonEvidenceList evidence={[healthy1, healthy2]} />);
    expect(screen.getByTestId("ron-evidence-filter-all")).toHaveAttribute("aria-pressed", "true");
    expect(labels()).toHaveLength(2);
  });

  it("keeps row warnings and technical disclosure behaviour intact", () => {
    render(<RonEvidenceList evidence={[degraded]} />);
    expect(screen.queryByTestId("ron-caveats-pattern_context")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { expanded: false })
      .filter((b) => b.getAttribute("aria-pressed") === null)[0]);
    const caveats = screen.getByTestId("ron-caveats-pattern_context");
    expect(within(caveats).getByText(/stale source/)).toBeTruthy();
    expect(screen.queryByTestId("ron-technical-pattern_context")).toBeNull();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByTestId("ron-technical-pattern_context").textContent).toContain("session_slot");
  });
});

describe("governance guards", () => {
  it("introduces no probability, ranking, opportunity-score or execution wording", () => {
    expect(SRC).not.toMatch(/probabilit|confidence|percentile|\brank\b|ranking|score|execution_allowed|auto_execute/i);
  });

  it("introduces no backend reads or writes", () => {
    expect(SRC).not.toMatch(/supabase|functions\.invoke|fetch\(|axios/i);
  });
});
