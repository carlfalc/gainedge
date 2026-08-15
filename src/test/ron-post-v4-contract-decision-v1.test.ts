import { describe, expect, it } from "vitest";
import {
  POST_V4_CONTRACT_DECISION_ORIGIN,
  POST_V4_CONTRACT_DECISION_POLICY,
  RON_POST_V4_CONTRACT_DECISION_VERSION,
  buildPostV4ContractDecisionRecord,
  postV4ContractDecisionHash,
} from "../../supabase/functions/_shared/ron-post-v4-contract-decision";
import { POST_V4_REPLICATION_METHODOLOGY_SOURCE } from "../../supabase/functions/_shared/ron-post-v4-replication-contract";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

const replicationInput = () => ({
  decision_path: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  decided_at: "2026-09-01T00:00:00Z",
  decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
  research_version: RESEARCH_VERSION_V4 + 1,
  contract_identity: "research_v5_replication_fixture",
  contract_frozen_at: "2026-09-01T00:00:01Z",
  confirmation_start: "2026-09-02T00:00:00Z",
} as const);

describe("2D.2w — post-V4 contract decision record", () => {
  it("builds a deterministic unaccepted frozen-V4 replication decision", async () => {
    const first = await buildPostV4ContractDecisionRecord(replicationInput());
    const second = await buildPostV4ContractDecisionRecord(replicationInput());
    expect(first).toEqual(second);
    expect(first.built).toBe(true);
    if (!first.built) return;

    expect(first.record.decision_version).toBe(RON_POST_V4_CONTRACT_DECISION_VERSION);
    expect(first.record.decision_path).toBe(POST_V4_REPLICATION_METHODOLOGY_SOURCE);
    expect(first.record.replication_draft).not.toBeNull();
    expect(first.record.accepted).toBe(false);
    expect(first.record.research_run_authorized).toBe(false);
    expect(first.record.executable).toBe(false);
    expect(first.record_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.record_hash).toBe(await postV4ContractDecisionHash(first.record));
  });

  it("rejects a replication contract freeze that predates the audited decision", async () => {
    const r = await buildPostV4ContractDecisionRecord({
      ...replicationInput(),
      decided_at: "2026-09-02T00:00:00Z",
      contract_frozen_at: "2026-09-01T00:00:00Z",
      confirmation_start: "2026-09-03T00:00:00Z",
    });
    expect(r.built).toBe(false);
    expect(r.reasons).toContain("contract_freeze_predates_audited_decision");
  });

  it("represents a new-methodology requirement without inventing a contract", async () => {
    const r = await buildPostV4ContractDecisionRecord({
      decision_path: "new_methodology_required",
      decided_at: "2026-09-01T00:00:00Z",
      decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
    });
    expect(r.built).toBe(true);
    if (!r.built) return;
    expect(r.record.replication_draft).toBeNull();
    expect(r.record.accepted).toBe(false);
    expect(r.record.research_run_authorized).toBe(false);
    expect(r.record.executable).toBe(false);
  });

  it("forbids replication fields on a new-methodology decision", async () => {
    const r = await buildPostV4ContractDecisionRecord({
      decision_path: "new_methodology_required",
      decided_at: "2026-09-01T00:00:00Z",
      decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
      research_version: RESEARCH_VERSION_V4 + 1,
    });
    expect(r.built).toBe(false);
    expect(r.reasons).toContain("replication_fields_forbidden_for_new_methodology_decision");
  });

  it("introduces no production acceptance, promotion, probability or execution authority", () => {
    expect(POST_V4_CONTRACT_DECISION_POLICY.accepted_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.registry_mutated_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.persisted_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.research_run_authorized_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.probability_created_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.promotion_created_by_this_module).toBe(false);
    expect(POST_V4_CONTRACT_DECISION_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_CONTRACT_DECISION_POLICY.allow_live_execution).toBe(false);

    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});
