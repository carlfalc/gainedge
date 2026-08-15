import { describe, expect, it } from "vitest";
import { buildPostV4ReplicationContractDraft, POST_V4_REPLICATION_METHODOLOGY_SOURCE } from "../../supabase/functions/_shared/ron-post-v4-replication-contract";
import { previewPostV4AcceptanceRegistryInsertion } from "../../supabase/functions/_shared/ron-post-v4-acceptance-registry-preview";
import { CURRENT_ACCEPTED_ARTIFACT_REGISTRY } from "../../supabase/functions/_shared/ron-promotion-readiness";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";

async function candidate() {
  const r = await buildPostV4ReplicationContractDraft({
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_registry_preview_fixture",
    contract_frozen_at: "2026-09-01T00:00:00Z",
    confirmation_start: "2026-09-02T00:00:00Z",
    methodology_source: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  });
  if (!r.built) throw new Error("fixture candidate must be admissible");
  return r.draft.candidate_artifact;
}

describe("2D.2v — prospective acceptance-registry preview", () => {
  it("shows a valid future insertion without mutating production", async () => {
    const before = JSON.stringify(CURRENT_ACCEPTED_ARTIFACT_REGISTRY);
    const artifact = await candidate();
    const preview = previewPostV4AcceptanceRegistryInsertion(artifact);

    expect(preview.valid).toBe(true);
    expect(preview.reasons).toEqual([]);
    expect(preview.production_mutated).toBe(false);
    expect(preview.accepted_by_this_module).toBe(false);
    expect(preview.preview_registry.artifacts).toHaveLength(
      CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts.length + 1,
    );
    expect(JSON.stringify(CURRENT_ACCEPTED_ARTIFACT_REGISTRY)).toBe(before);
  });

  it("fails closed on duplicate insertion", async () => {
    const artifact = await candidate();
    const once = previewPostV4AcceptanceRegistryInsertion(artifact);
    expect(once.valid).toBe(true);

    const twice = previewPostV4AcceptanceRegistryInsertion(artifact, once.preview_registry);
    expect(twice.valid).toBe(false);
    expect(twice.reasons.join(" | ")).toContain("duplicate_artifact_id");
  });

  it("does not grant execution or production acceptance authority", async () => {
    const preview = previewPostV4AcceptanceRegistryInsertion(await candidate());
    expect(preview.execution_path).toBe("signal_only");
    expect(preview.allow_live_execution).toBe(false);
    expect(preview.accepted_by_this_module).toBe(false);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
  });
});
