import { describe, expect, it } from "vitest";
import {
  POST_V4_CONTRACT_DECISION_ORIGIN,
  buildPostV4ContractDecisionRecord,
  type PostV4ContractDecisionRecord,
} from "../../supabase/functions/_shared/ron-post-v4-contract-decision";
import {
  RON_POST_V4_DECISION_REGISTRY_PREFLIGHT_VERSION,
  preflightPostV4DecisionRegistryEdit,
} from "../../supabase/functions/_shared/ron-post-v4-decision-registry-preflight";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import { CURRENT_ACCEPTED_ARTIFACT_REGISTRY } from "../../supabase/functions/_shared/ron-promotion-readiness";

async function replicationDecision() {
  const built = await buildPostV4ContractDecisionRecord({
    decision_path: "frozen_v4_replication",
    decided_at: "2026-09-01T00:00:00Z",
    decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_registry_preflight_fixture",
    contract_frozen_at: "2026-09-01T00:00:01Z",
    confirmation_start: "2026-09-02T00:00:00Z",
  });
  if (!built.built) throw new Error("fixture must build");
  return built.record;
}

describe("2D.2x — post-V4 decision -> registry preflight", () => {
  it("produces a valid dry-run registry preview for an explicit frozen-V4 replication decision", async () => {
    const before = JSON.stringify(CURRENT_ACCEPTED_ARTIFACT_REGISTRY);
    const r = preflightPostV4DecisionRegistryEdit(await replicationDecision());

    expect(r.preflight_version).toBe(RON_POST_V4_DECISION_REGISTRY_PREFLIGHT_VERSION);
    expect(r.ready_for_explicit_registry_edit).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.registry_preview?.valid).toBe(true);
    expect(r.registry_preview?.production_mutated).toBe(false);
    expect(r.accepted_by_this_module).toBe(false);
    expect(r.research_run_authorized).toBe(false);
    expect(r.execution_path).toBe("signal_only");
    expect(r.allow_live_execution).toBe(false);
    expect(JSON.stringify(CURRENT_ACCEPTED_ARTIFACT_REGISTRY)).toBe(before);
  });

  it("fails closed for a new-methodology-required decision", async () => {
    const built = await buildPostV4ContractDecisionRecord({
      decision_path: "new_methodology_required",
      decided_at: "2026-09-01T00:00:00Z",
      decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
    });
    if (!built.built) throw new Error("fixture must build");

    const r = preflightPostV4DecisionRegistryEdit(built.record);
    expect(r.ready_for_explicit_registry_edit).toBe(false);
    expect(r.registry_preview).toBeNull();
    expect(r.reasons).toEqual(["new_methodology_requires_separately_audited_contract"]);
  });

  it("fails closed when a replication decision is missing its contract draft", async () => {
    const record = await replicationDecision();
    const malformed: PostV4ContractDecisionRecord = { ...record, replication_draft: null };
    const r = preflightPostV4DecisionRegistryEdit(malformed);
    expect(r.ready_for_explicit_registry_edit).toBe(false);
    expect(r.reasons).toContain("replication_decision_missing_contract_draft");
  });

  it("fails closed when the decision record carries forbidden authority", async () => {
    const record = await replicationDecision();
    const malformed = { ...record, accepted: true } as unknown as PostV4ContractDecisionRecord;
    const r = preflightPostV4DecisionRegistryEdit(malformed);
    expect(r.ready_for_explicit_registry_edit).toBe(false);
    expect(r.reasons).toContain("decision_record_carries_forbidden_authority");
  });

  it("does not create production acceptance", async () => {
    const r = preflightPostV4DecisionRegistryEdit(await replicationDecision());
    expect(r.accepted_by_this_module).toBe(false);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
  });
});
