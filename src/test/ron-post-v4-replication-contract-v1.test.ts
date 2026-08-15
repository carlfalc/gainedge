import { describe, expect, it } from "vitest";
import {
  POST_V4_REPLICATION_CONTRACT_POLICY,
  POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  buildPostV4ReplicationContractDraft,
} from "../../supabase/functions/_shared/ron-post-v4-replication-contract";
import { REQUIRED_FROZEN_SPEC_SURFACES } from "../../supabase/functions/_shared/ron-research-contract-acceptance";
import { RESEARCH_VERSION_V4, v4ContractHashes } from "../../supabase/functions/_shared/ron-research-v4";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";

const VALID = {
  research_version: RESEARCH_VERSION_V4 + 1,
  contract_identity: "research_v5_v4_methodology_replication_fixture",
  contract_frozen_at: "2026-09-01T00:00:00Z",
  confirmation_start: "2026-09-02T00:00:00Z",
  methodology_source: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
} as const;

describe("2D.2u — prospective post-V4 replication contract constructor", () => {
  it("derives all seven frozen surfaces directly from accepted V4 source", async () => {
    const r = await buildPostV4ReplicationContractDraft(VALID);
    expect(r.built).toBe(true);
    if (!r.built) return;

    const expected = await v4ContractHashes();
    expect(r.draft.claim.frozen_spec_hashes).toEqual(expected);
    expect(Object.keys(r.draft.claim.frozen_spec_hashes).sort())
      .toEqual([...REQUIRED_FROZEN_SPEC_SURFACES].sort());
  });

  it("produces only an unaccepted, non-executable candidate artifact", async () => {
    const r = await buildPostV4ReplicationContractDraft(VALID);
    expect(r.built).toBe(true);
    if (!r.built) return;

    expect(r.draft.accepted).toBe(false);
    expect(r.draft.executable).toBe(false);
    expect(r.draft.candidate_artifact.artifact_kind).toBe("research_contract_acceptance");
    expect(r.draft.claim.confirmation_used_for_selection).toBe(false);
    expect(r.draft.claim.confirmation_used_for_tuning).toBe(false);
  });

  it("fails closed without explicit valid freeze and confirmation boundaries", async () => {
    let r = await buildPostV4ReplicationContractDraft({ ...VALID, contract_frozen_at: "" });
    expect(r.built).toBe(false);
    expect(r.reasons).toContain("missing_contract_frozen_at");

    r = await buildPostV4ReplicationContractDraft({ ...VALID, confirmation_start: "" });
    expect(r.built).toBe(false);
    expect(r.reasons).toContain("missing_confirmation_start");

    r = await buildPostV4ReplicationContractDraft({
      ...VALID,
      confirmation_start: "2026-08-31T23:59:59Z",
    });
    expect(r.built).toBe(false);
    expect(r.reasons).toContain("confirmation_start_not_strictly_after_contract_freeze");
  });

  it("does not alter production acceptance, promotion, probability or execution authority", async () => {
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.accepted_by_this_module).toBe(false);
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.persisted_by_this_module).toBe(false);
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.research_run_started_by_this_module).toBe(false);
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.promotion_created_by_this_module).toBe(false);
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.probability_created_by_this_module).toBe(false);
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_REPLICATION_CONTRACT_POLICY.allow_live_execution).toBe(false);

    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
  });
});
