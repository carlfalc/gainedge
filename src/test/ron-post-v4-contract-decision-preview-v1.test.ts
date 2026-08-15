import { describe, expect, it } from "vitest";
import {
  POST_V4_CONTRACT_DECISION_ORIGIN,
} from "../../supabase/functions/_shared/ron-post-v4-contract-decision";
import {
  POST_V4_CONTRACT_DECISION_PREVIEW_POLICY,
  RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION,
  buildPostV4ContractDecisionApplicationPreview,
} from "../../supabase/functions/_shared/ron-post-v4-contract-decision-preview";
import { POST_V4_REPLICATION_METHODOLOGY_SOURCE } from "../../supabase/functions/_shared/ron-post-v4-replication-contract";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

function replicationInput() {
  return {
    decision_path: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
    decided_at: "2026-09-01T00:00:00Z",
    decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_preview_fixture",
    contract_frozen_at: "2026-09-01T00:00:01Z",
    confirmation_start: "2026-09-02T00:00:00Z",
  } as const;
}

describe("2D.2x — post-V4 contract decision application preview", () => {
  it("previews a valid registry insertion for an explicit frozen-V4 replication decision", async () => {
    const r = await buildPostV4ContractDecisionApplicationPreview(replicationInput());
    expect(r.built).toBe(true);
    if (!r.built) return;

    expect(r.preview.preview_version).toBe(RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION);
    expect(r.preview.acceptance_artifact_proposed).toBe(true);
    expect(r.preview.acceptance_registry_preview?.valid).toBe(true);
    expect(r.preview.acceptance_registry_preview?.accepted_by_this_module).toBe(false);
    expect(r.preview.production_mutated).toBe(false);
    expect(r.preview.accepted_by_this_module).toBe(false);
    expect(r.preview.research_run_authorized).toBe(false);
    expect(r.preview.executable).toBe(false);
  });

  it("proposes no acceptance artifact when a new methodology is required", async () => {
    const r = await buildPostV4ContractDecisionApplicationPreview({
      decision_path: "new_methodology_required",
      decided_at: "2026-09-01T00:00:00Z",
      decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
    });
    expect(r.built).toBe(true);
    if (!r.built) return;

    expect(r.preview.acceptance_artifact_proposed).toBe(false);
    expect(r.preview.acceptance_registry_preview).toBeNull();
    expect(r.preview.decision_record.replication_draft).toBeNull();
  });

  it("fails closed when the underlying decision is invalid", async () => {
    const r = await buildPostV4ContractDecisionApplicationPreview({
      ...replicationInput(),
      contract_frozen_at: "2026-08-31T23:59:59Z",
    });
    expect(r.built).toBe(false);
    expect(r.reasons.join(" | ")).toContain("contract_freeze_predates_audited_decision");
  });

  it("never mutates production or unlocks authority", () => {
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.accepted_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.registry_mutated_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.persisted_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.research_run_authorized_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.probability_created_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.promotion_created_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_CONTRACT_DECISION_PREVIEW_POLICY.allow_live_execution).toBe(false);

    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});
