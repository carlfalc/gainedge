import { describe, expect, it } from "vitest";
import { productionPostV4Readiness } from "../../supabase/functions/_shared/ron-post-v4-research-readiness";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";

describe("2D.2s — post-V4 production-readiness truthfulness", () => {
  it("does not treat an empty promotion manifest as a prerequisite for research handoff", () => {
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);

    const readiness = productionPostV4Readiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons).toEqual(["no_accepted_post_v4_research_contract_artifact"]);
    expect(readiness.accepted_research_contract_artifacts).toBe(0);
    expect(readiness.accepted_promotion_entries).toBe(0);
    expect(readiness.reasons).not.toContain("accepted_promotion_manifest_empty");
  });
});
