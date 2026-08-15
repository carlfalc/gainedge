import { describe, expect, it } from "vitest";
import {
  CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT,
  POST_V4_REMAINING_METHODOLOGY_BLOCKERS,
  RON_POST_V4_GOVERNANCE_DECISION_VERSION,
  currentPostV4GovernanceDecision,
  currentPostV4GovernanceDecisionHash,
} from "../../supabase/functions/_shared/ron-post-v4-governance-decision";
import { POST_V4_REPLICATION_METHODOLOGY_SOURCE } from "../../supabase/functions/_shared/ron-post-v4-replication-contract";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

const EXPECTED_HASH =
  "fce7f0d365809fa0a8cedc6c872ebe55b7614f12ebaa633f22a517eea9362226";

describe("2D.3b — current post-V4 governance path decision", () => {
  it("binds exactly the audited new-methodology decision", async () => {
    const state = await currentPostV4GovernanceDecision();
    expect(state.governance_version).toBe(RON_POST_V4_GOVERNANCE_DECISION_VERSION);
    expect(state.decision_path).toBe("new_methodology_required");
    expect(state.decided_at).toBe("2026-08-15T12:00:00Z");
    expect(CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT.decision_origin).toBe("audited_source_change");
    expect(state.decision.built).toBe(true);
    if (!state.decision.built) return;
    expect(state.decision.record.decision_path).toBe("new_methodology_required");
    expect(state.decision.record.decided_at).toBe("2026-08-15T12:00:00Z");
    expect(state.decision.record.decision_origin).toBe("audited_source_change");
  });

  it("carries no replication fields and no post-V4 contract identity or spec hashes", async () => {
    const input = CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT as unknown as Record<string, unknown>;
    for (const k of ["research_version", "contract_identity", "contract_frozen_at", "confirmation_start"]) {
      expect(input[k]).toBeUndefined();
    }
    const state = await currentPostV4GovernanceDecision();
    if (!state.decision.built) throw new Error("expected built");
    expect(state.decision.record.replication_draft).toBeNull();
    const { record_hash, ...rest } = state.decision;
    expect(typeof record_hash).toBe("string");
    expect(JSON.stringify({ ...state, decision: rest })).not.toMatch(/[0-9a-f]{64}/);
  });

  it("is deterministic and hashable", async () => {
    const a = await currentPostV4GovernanceDecisionHash();
    const b = await currentPostV4GovernanceDecisionHash();
    expect(a).toBe(b);
    expect(a).toBe(EXPECTED_HASH);
  });

  it("remains unaccepted, unauthorized and non-executable", async () => {
    const state = await currentPostV4GovernanceDecision();
    expect(state.accepted).toBe(false);
    expect(state.research_run_authorized).toBe(false);
    expect(state.executable).toBe(false);
    expect(state.next_step).toBe("separately_audited_methodology_design");
    expect(state.next_step_is_research_run).toBe(false);
    if (!state.decision.built) throw new Error("expected built");
    expect(state.decision.record.accepted).toBe(false);
    expect(state.decision.record.research_run_authorized).toBe(false);
    expect(state.decision.record.executable).toBe(false);
  });

  it("does not select frozen-V4 replication", async () => {
    const state = await currentPostV4GovernanceDecision();
    expect(state.decision_path).not.toBe(POST_V4_REPLICATION_METHODOLOGY_SOURCE);
  });

  it("lists the methodology-design decisions that remain blocked", () => {
    expect([...POST_V4_REMAINING_METHODOLOGY_BLOCKERS]).toEqual([
      "contract_identity",
      "contract_frozen_at_and_spec_frozen_at",
      "confirmation_start_boundary",
      "frozen_spec_surface_hashes",
      "discovery_window_and_source_identity",
      "candidate_universe_and_state_variables",
      "fold_design_and_sample_sufficiency_parameters",
      "power_mde_and_significance_thresholds",
      "confirmation_source_identity",
      "gate_definitions",
    ]);
  });

  it("leaves registry, promotion manifest and promoted variables untouched", () => {
    const kinds = CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts.map((a) => a.artifact_kind);
    expect(kinds.filter((k) => k === "prerequisite_resolution")).toHaveLength(2);
    expect(kinds.filter((k) => k === "research_contract_acceptance")).toHaveLength(0);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts).toHaveLength(2);
    expect([...ACCEPTED_PROMOTION_MANIFEST]).toEqual([]);
    expect([...PROMOTED_STATE_VARIABLES]).toEqual([]);
  });
});
