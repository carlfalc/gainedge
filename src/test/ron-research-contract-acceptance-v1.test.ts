import { describe, expect, it } from "vitest";
import {
  ADMISSIBLE_ACCEPTANCE_ORIGIN, INADMISSIBLE_ACCEPTANCE_ORIGINS,
  REQUIRED_FROZEN_SPEC_SURFACES, RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID,
  RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID, RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE,
  RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH, RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  SAMPLE_SUFFICIENCY_PREREQUISITE_ID, researchContractAcceptanceHash,
  researchContractAcceptancePayload, validateResearchContractAcceptance,
  type ResearchContractAcceptanceClaim,
} from "../../supabase/functions/_shared/ron-research-contract-acceptance";
import {
  RESEARCH_VERSION_V4, v4ContractHashes,
} from "../../supabase/functions/_shared/ron-research-v4";
import {
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY, UNRESOLVED_PROMOTION_PREREQUISITES,
  validateAcceptanceRegistry,
} from "../../supabase/functions/_shared/ron-promotion-readiness";

const H = (c: string) => c.repeat(64);

/** Hypothetical FUTURE acceptance claim. Nothing here is accepted or persisted. */
function claim(over: Partial<ResearchContractAcceptanceClaim> = {}): ResearchContractAcceptanceClaim {
  return {
    procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
    procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_contract",
    contract_frozen_at: "2026-09-01T00:00:00Z",
    frozen_spec_hashes: Object.fromEntries(REQUIRED_FROZEN_SPEC_SURFACES.map((s) => [s, H("a")])),
    confirmation_start: "2026-09-02T00:00:00Z",
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: ADMISSIBLE_ACCEPTANCE_ORIGIN,
    ...over,
  };
}

describe("2D.2o — research contract acceptance procedure", () => {
  it("is deterministic, hash-pinned and order-independent", async () => {
    expect(await researchContractAcceptanceHash()).toBe(RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH);
    expect(await researchContractAcceptanceHash()).toBe(await researchContractAcceptanceHash());
    const payload = JSON.stringify(researchContractAcceptancePayload());
    expect(payload).toContain("no_sample_sufficiency_threshold_is_defined_by_this_procedure");
  });

  it("requires exactly the frozen V4 contract-hash surfaces, invented from no new source", async () => {
    expect([...REQUIRED_FROZEN_SPEC_SURFACES].sort())
      .toEqual(Object.keys(await v4ContractHashes()).sort());
  });

  it("admits a fully qualified hypothetical future claim", () => {
    expect(validateResearchContractAcceptance(claim())).toEqual({ admissible: true, reasons: [] });
  });

  const failures: Array<[string, Partial<ResearchContractAcceptanceClaim>, string]> = [
    ["research_version equal to V4", { research_version: RESEARCH_VERSION_V4 },
      "research_version_not_after_frozen_negative"],
    ["research_version below V4", { research_version: RESEARCH_VERSION_V4 - 1 },
      "research_version_not_after_frozen_negative"],
    ["missing contract identity", { contract_identity: "" }, "missing_contract_identity"],
    ["missing a required frozen surface",
      { frozen_spec_hashes: Object.fromEntries(
        REQUIRED_FROZEN_SPEC_SURFACES.slice(1).map((s) => [s, H("a")])) },
      "missing_frozen_spec_surface: candidate_spec_hash"],
    ["malformed frozen hash",
      { frozen_spec_hashes: Object.fromEntries(
        REQUIRED_FROZEN_SPEC_SURFACES.map((s, i) => [s, i === 0 ? "nope" : H("a")])) },
      "malformed_frozen_spec_hash"],
    ["unknown/unfrozen extra surface",
      { frozen_spec_hashes: {
        ...Object.fromEntries(REQUIRED_FROZEN_SPEC_SURFACES.map((s) => [s, H("a")])),
        made_up_surface_hash: H("b"),
      } },
      "unknown_frozen_spec_surface: made_up_surface_hash"],
    ["confirmation used for selection", { confirmation_used_for_selection: true },
      "confirmation_data_used_for_selection_or_ranking"],
    ["confirmation used for tuning", { confirmation_used_for_tuning: true },
      "confirmation_data_used_for_tuning"],
    ["confirmation starting exactly at freeze", { confirmation_start: "2026-09-01T00:00:00Z" },
      "confirmation_start_not_strictly_after_contract_freeze"],
    ["contract frozen after confirmation began", { contract_frozen_at: "2026-10-01T00:00:00Z" },
      "confirmation_start_not_strictly_after_contract_freeze"],
    ["malformed freeze instant", { contract_frozen_at: "yesterday" },
      "missing_or_malformed_contract_frozen_at"],
    ["wrong procedure version", { procedure_version: 99 }, "procedure_version_mismatch"],
    ["wrong procedure hash", { procedure_hash: H("f") }, "procedure_hash_mismatch"],
  ];

  it.each(failures)("fails closed: %s", (_l, over, expected) => {
    const r = validateResearchContractAcceptance(claim(over));
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain(expected);
  });

  it.each(INADMISSIBLE_ACCEPTANCE_ORIGINS)("rejects non-audited origin: %s", (origin) => {
    const r = validateResearchContractAcceptance(claim({ acceptance_origin: origin }));
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("acceptance_origin_not_audited_source_change");
  });

  it("resolves only the acceptance-procedure prerequisite, never sample sufficiency", () => {
    expect(RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE.resolves_prerequisite)
      .toBe(RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID);
    expect(RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE.does_not_resolve)
      .toContain(SAMPLE_SUFFICIENCY_PREREQUISITE_ID);
    expect(UNRESOLVED_PROMOTION_PREREQUISITES).toContain(SAMPLE_SUFFICIENCY_PREREQUISITE_ID);
  });

  it("production registry holds exactly this one hash-bound resolution artifact", () => {
    const arts = CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts;
    expect(arts).toHaveLength(1);
    expect(arts[0].artifact_id).toBe(RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID);
    expect(arts[0].artifact_kind).toBe("prerequisite_resolution");
    expect(arts[0].bound_procedure_hash).toBe(RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH);
    expect(validateAcceptanceRegistry(CURRENT_ACCEPTED_ARTIFACT_REGISTRY))
      .toEqual({ admissible: true, reasons: [] });
  });

  it("rejects an acceptance-procedure resolution that is not bound to the accepted procedure", () => {
    const bad = validateAcceptanceRegistry({
      registry_version: CURRENT_ACCEPTED_ARTIFACT_REGISTRY.registry_version,
      artifacts: [{
        artifact_id: RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID,
        artifact_kind: "prerequisite_resolution",
        resolves_prerequisite: RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID,
        bound_procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
        bound_procedure_hash: H("d"),
      }],
    });
    expect(bad.admissible).toBe(false);
    expect(bad.reasons.join(" | "))
      .toContain("acceptance_procedure_resolution_not_bound_to_accepted_procedure");

    const strayBinding = validateAcceptanceRegistry({
      registry_version: CURRENT_ACCEPTED_ARTIFACT_REGISTRY.registry_version,
      artifacts: [{
        artifact_id: "x",
        artifact_kind: "prerequisite_resolution",
        resolves_prerequisite: SAMPLE_SUFFICIENCY_PREREQUISITE_ID,
        bound_procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
      }],
    });
    expect(strayBinding.admissible).toBe(false);
    expect(strayBinding.reasons.join(" | "))
      .toContain("procedure_binding_only_allowed_for_acceptance_procedure_resolution");
  });
});
