import { describe, expect, it } from "vitest";
import {
  ACCEPTED_PROMOTION_MANIFEST, PROMOTION_READINESS_SPEC_V1, RON_PROMOTION_READINESS_VERSION,
  UNRESOLVED_PROMOTION_PREREQUISITES, derivePromotedStateVariables, promotionManifestHash,
  promotionManifestPayload, validatePromotionEntry, validatePromotionManifest,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
  validateAcceptanceRegistry,
  type AcceptanceRegistry, type AcceptedPromotionEntry,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import {
  PROMOTED_STATE_VARIABLES, agenticArchitectureHash, evaluateClaim,
} from "../../supabase/functions/_shared/ron-agentic-architecture";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import {
  RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID,
  RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID,
  RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  SAMPLE_SUFFICIENCY_PREREQUISITE_ID,
  REQUIRED_FROZEN_SPEC_SURFACES,
  ADMISSIBLE_ACCEPTANCE_ORIGIN,
  buildResearchContractAcceptanceArtifact,
  type ResearchContractAcceptanceClaim,
} from "../../supabase/functions/_shared/ron-research-contract-acceptance";

const HASH64 = "a".repeat(64);

/** SYNTHETIC, test-only future acceptance claim. Nothing here is accepted in production. */
const syntheticClaim: ResearchContractAcceptanceClaim = {
  procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  research_version: RESEARCH_VERSION_V4 + 1,
  contract_identity: "research_v5_synthetic",
  contract_frozen_at: "2026-09-01T00:00:00Z",
  frozen_spec_hashes: Object.fromEntries(
    REQUIRED_FROZEN_SPEC_SURFACES.map((s, i) => [s, String(i).repeat(64).slice(0, 64)]),
  ),
  confirmation_start: "2026-09-02T00:00:00Z",
  confirmation_used_for_selection: false,
  confirmation_used_for_tuning: false,
  acceptance_origin: ADMISSIBLE_ACCEPTANCE_ORIGIN,
};

const built = await buildResearchContractAcceptanceArtifact(syntheticClaim);
if (!built.built) throw new Error(`synthetic fixture must build: ${built.reasons.join(",")}`);
const syntheticAcceptanceArtifact = built.artifact;

/** Binding fields required for the acceptance-procedure prerequisite resolution only. */
const procedureBinding = (p: string) =>
  p === RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID
    ? {
      bound_procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
      bound_procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
    }
    : {};

/** A hypothetical FUTURE entry. Nothing here is accepted or persisted. */
function futureEntry(over: Partial<AcceptedPromotionEntry> = {}): AcceptedPromotionEntry {
  return {
    research_version: RESEARCH_VERSION_V4 + 1,
    research_run_id: "future-run-0001",
    research_run_identity_hash: HASH64,
    research_contract_accepted: true,
    acceptance_artifact_id: syntheticAcceptanceArtifact.artifact_id,
    acceptance_manifest_version: RON_PROMOTION_READINESS_VERSION,
    candidate_id: "cand_future_1",
    candidate_spec_hash: "b".repeat(64),
    state_spec_version: 2,
    state_spec_hash: "c".repeat(64),
    direction: "long",
    state_variables: ["adx_regime"],
    gate_version: PROMOTION_GATE_V4.gate_version,
    pre_holdout_gate_pass: true,
    holdout_gate_pass: true,
    final_promotion_pass: true,
    holdout_used_for_selection: false,
    spec_frozen_at: "2026-09-01T00:00:00Z",
    discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
    confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" },
    confirmation_source_identity: "post_freeze_native_15m_grid",
    discovery_source_cutoff: "2026-08-31T00:00:00Z",
    confirmation_source_cutoff: "2026-11-01T00:00:00Z",
    prerequisite_resolutions: Object.fromEntries(
      UNRESOLVED_PROMOTION_PREREQUISITES.map((p) => [p, `resolved_by_${p}_artifact`]),
    ),
    ...over,
  };
}

/** SYNTHETIC test-only registry. Nothing here is accepted in production. */
function syntheticRegistry(over: Partial<AcceptanceRegistry> = {}): AcceptanceRegistry {
  return {
    registry_version: RON_PROMOTION_READINESS_VERSION,
    artifacts: [
      {
        ...syntheticAcceptanceArtifact,
        research_version: syntheticAcceptanceArtifact.contract_binding.research_version,
      },
      ...UNRESOLVED_PROMOTION_PREREQUISITES.map((p) => ({
        artifact_id: `resolved_by_${p}_artifact`,
        artifact_kind: "prerequisite_resolution" as const,
        resolves_prerequisite: p,
        ...procedureBinding(p),
      })),
    ],
    ...over,
  };
}

describe("2D.2n — promotion readiness foundation", () => {
  it("accepted manifest is empty and promotes exactly zero state variables", () => {
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(derivePromotedStateVariables()).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    expect(validatePromotionManifest(ACCEPTED_PROMOTION_MANIFEST).admissible).toBe(true);
  });

  it("the production accepted-artifact registry holds only the 2D.2o procedure resolution", () => {
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts).toEqual([{
      artifact_id: RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID,
      artifact_kind: "prerequisite_resolution",
      resolves_prerequisite: RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID,
      bound_procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
      bound_procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
    }]);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.resolves_prerequisite === SAMPLE_SUFFICIENCY_PREREQUISITE_ID)).toEqual([]);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.registry_version)
      .toBe(RON_PROMOTION_READINESS_VERSION);
    expect(validateAcceptanceRegistry(CURRENT_ACCEPTED_ARTIFACT_REGISTRY))
      .toEqual({ admissible: true, reasons: [] });
    expect(validateAcceptanceRegistry(syntheticRegistry()).admissible).toBe(true);
  });

  const badRegistries: Array<[string, AcceptanceRegistry, string]> = [
    ["wrong registry version",
      syntheticRegistry({ registry_version: RON_PROMOTION_READINESS_VERSION + 1 }),
      "registry_version_mismatch"],
    ["duplicate same id + kind",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [...syntheticRegistry().artifacts, syntheticRegistry().artifacts[0]] },
      "duplicate_artifact_id"],
    ["cross-kind id collision",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [...syntheticRegistry().artifacts, {
          artifact_id: "hypothetical_acceptance_artifact",
          artifact_kind: "prerequisite_resolution",
          resolves_prerequisite: UNRESOLVED_PROMOTION_PREREQUISITES[0],
        }] },
      "duplicate_artifact_id"],
    ["unknown kind",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [{ artifact_id: "x", artifact_kind: "whatever" as never }] },
      "unknown_artifact_kind"],
    ["acceptance record without a valid research_version",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [{
          artifact_id: "hypothetical_acceptance_artifact",
          artifact_kind: "research_contract_acceptance",
          research_version: RESEARCH_VERSION_V4,
        }] },
      "research_contract_acceptance_requires_research_version"],
    ["acceptance record masquerading as a prerequisite resolution",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [{
          artifact_id: "hypothetical_acceptance_artifact",
          artifact_kind: "research_contract_acceptance",
          research_version: RESEARCH_VERSION_V4 + 1,
          resolves_prerequisite: UNRESOLVED_PROMOTION_PREREQUISITES[0],
        }] },
      "must_not_resolve_a_prerequisite"],
    ["prerequisite resolution for an unknown prerequisite",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [{
          artifact_id: "p1", artifact_kind: "prerequisite_resolution",
          resolves_prerequisite: "not_a_known_prerequisite",
        }] },
      "prerequisite_resolution_requires_known_prerequisite_id"],
    ["prerequisite resolution carrying a research_version",
      { registry_version: RON_PROMOTION_READINESS_VERSION,
        artifacts: [{
          artifact_id: "p1", artifact_kind: "prerequisite_resolution",
          resolves_prerequisite: UNRESOLVED_PROMOTION_PREREQUISITES[0],
          research_version: 5,
        }] },
      "prerequisite_resolution_must_not_carry_research_version"],
  ];

  it.each(badRegistries)("malformed registry fails closed: %s", (_l, reg, expected) => {
    const rv = validateAcceptanceRegistry(reg);
    expect(rv.admissible).toBe(false);
    expect(rv.reasons.join(" | ")).toContain(expected);
    const e = futureEntry();
    const r = validatePromotionEntry(e, reg);
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("invalid_acceptance_registry");
    expect(r.reasons.join(" | ")).toContain("acceptance_artifact_unverifiable_invalid_registry");
    expect(validatePromotionManifest([e], reg).admissible).toBe(false);
    expect(derivePromotedStateVariables([e], reg)).toEqual([]);
  });

  it("registry payload hash is independent of artifact input order", async () => {
    const forward = syntheticRegistry();
    const reversed: AcceptanceRegistry = {
      registry_version: forward.registry_version,
      artifacts: [...forward.artifacts].reverse(),
    };
    const e = futureEntry();
    expect(await promotionManifestHash([e], forward))
      .toBe(await promotionManifestHash([e], reversed));
  });

  it("a valid synthetic registry still only admits the explicitly bound fixture", () => {
    const reg = syntheticRegistry();
    expect(validatePromotionEntry(futureEntry(), reg).admissible).toBe(true);
    expect(validatePromotionEntry(
      futureEntry({ acceptance_artifact_id: "other_artifact" }), reg,
    ).admissible).toBe(false);
    expect(derivePromotedStateVariables([futureEntry()])).toEqual([]);
  });

  it("self-asserted acceptance fails closed against the default empty registry", () => {
    const productionOnlyProcedure = futureEntry({
      prerequisite_resolutions: {
        [RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID]: RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID,
      },
    });
    const pr = validatePromotionEntry(productionOnlyProcedure);
    expect(pr.admissible).toBe(false);
    expect(pr.reasons.join(" | "))
      .toContain(`unresolved_prerequisite: ${SAMPLE_SUFFICIENCY_PREREQUISITE_ID}`);
    expect(pr.reasons.join(" | ")).toContain("acceptance_artifact_not_in_accepted_registry");
    expect(derivePromotedStateVariables([productionOnlyProcedure])).toEqual([]);

    const e = futureEntry();
    const r = validatePromotionEntry(e);
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("acceptance_artifact_not_in_accepted_registry");
    expect(r.reasons.join(" | ")).toContain("resolution_artifact_not_in_accepted_registry");
    expect(derivePromotedStateVariables([e])).toEqual([]);
  });

  it("unknown or mismatched registry identities fail closed", () => {
    const [p0, p1] = UNRESOLVED_PROMOTION_PREREQUISITES;
    // Registry is itself VALID; the bindings simply do not match the entry.
    const mismatched = syntheticRegistry({
      artifacts: [
        {
          artifact_id: "hypothetical_acceptance_artifact",
          artifact_kind: "research_contract_acceptance",
          research_version: RESEARCH_VERSION_V4 + 9,
        },
        // Swapped: each artifact id claims the OTHER prerequisite.
        {
          artifact_id: `resolved_by_${p0}_artifact`,
          artifact_kind: "prerequisite_resolution" as const,
          resolves_prerequisite: p1,
          ...procedureBinding(p1),
        },
        {
          artifact_id: `resolved_by_${p1}_artifact`,
          artifact_kind: "prerequisite_resolution" as const,
          resolves_prerequisite: p0,
          ...procedureBinding(p0),
        },
      ],
    });
    expect(validateAcceptanceRegistry(mismatched).admissible).toBe(true);
    const r = validatePromotionEntry(futureEntry(), mismatched);
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("acceptance_artifact_research_version_mismatch");
    expect(r.reasons.join(" | ")).toContain("resolution_artifact_resolves_different_prerequisite");

    const unknown = validatePromotionEntry(
      futureEntry({ acceptance_artifact_id: "not_registered" }), syntheticRegistry(),
    );
    expect(unknown.reasons.join(" | ")).toContain("acceptance_artifact_not_in_accepted_registry");
  });

  it("confirmation window starting exactly at spec freeze fails (strict rule)", () => {
    const e = futureEntry({ spec_frozen_at: "2026-09-02T00:00:00Z" });
    const r = validatePromotionEntry(e, syntheticRegistry());
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("confirmation_window_starts_before_spec_freeze");
  });

  it("architecture derives its empty list without changing its hash", async () => {
    expect(await agenticArchitectureHash()).toBe(await agenticArchitectureHash());
    const decision = evaluateClaim({
      role: "researcher", claim_class: "conditional_edge",
      cites: ["research_v4"], conditions_on: ["adx_regime"],
    });
    expect(decision.admissible).toBe(false);
    expect(decision.reasons.join(" ")).toContain("state_variable_not_promoted");
  });

  it("the frozen Research V4 negative artifact can never produce a promotion", () => {
    const v4 = futureEntry({ research_version: RESEARCH_VERSION_V4, final_promotion_pass: false });
    const r = validatePromotionEntry(v4, syntheticRegistry());
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" ")).toContain("research_version_not_separately_versioned");
    expect(r.reasons.join(" ")).toContain("final_promotion_gate_not_passed");
    expect(derivePromotedStateVariables([v4], syntheticRegistry())).toEqual([]);
    expect(derivePromotedStateVariables([v4])).toEqual([]);
  });

  it("a fully qualified future entry validates ONLY with an explicit synthetic registry", () => {
    const e = futureEntry();
    expect(validatePromotionEntry(e, syntheticRegistry()))
      .toEqual({ admissible: true, reasons: [] });
    expect(derivePromotedStateVariables([e], syntheticRegistry())).toEqual(["adx_regime"]);
    // Default/current registry: fails closed, derives nothing.
    expect(validatePromotionEntry(e).admissible).toBe(false);
    expect(derivePromotedStateVariables([e])).toEqual([]);
  });

  const failures: Array<[string, Partial<AcceptedPromotionEntry>, string]> = [
    ["same-cutoff replay", { confirmation_source_cutoff: "2026-08-31T00:00:00Z" }, "same-data replay"],
    ["overlapping confirmation window",
      { confirmation_window: { start: "2026-06-01T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
      "confirmation_window_overlaps_discovery_window"],
    ["pre-freeze confirmation",
      { spec_frozen_at: "2026-10-01T00:00:00Z" }, "confirmation_window_starts_before_spec_freeze"],
    ["missing final gate", { final_promotion_pass: false }, "final_promotion_gate_not_passed"],
    ["missing holdout confirmation", { holdout_gate_pass: false }, "holdout_confirmation_gate_not_passed"],
    ["holdout used for selection", { holdout_used_for_selection: true }, "holdout_used_for_selection_or_tuning"],
    ["missing immutable identity hash", { research_run_identity_hash: "nope" }, "research_run_identity_hash"],
    ["unaccepted research contract", { research_contract_accepted: false }, "research_contract_not_accepted"],
    ["duplicate variable in entry",
      { state_variables: ["adx_regime", "adx_regime"] }, "duplicate_state_variable_in_entry"],
    ["unresolved prerequisite", { prerequisite_resolutions: {} }, "unresolved_prerequisite"],
  ];

  it.each(failures)("fails closed: %s", (_label, over, expected) => {
    const e = futureEntry(over);
    const r = validatePromotionEntry(e, syntheticRegistry());
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain(expected);
    expect(derivePromotedStateVariables([e], syntheticRegistry())).toEqual([]);
    expect(derivePromotedStateVariables([e])).toEqual([]);
  });

  it("a promising_for_2d2-style flag alone never promotes", () => {
    const flagOnly = futureEntry({
      pre_holdout_gate_pass: false, holdout_gate_pass: false, final_promotion_pass: false,
    });
    expect(validatePromotionEntry(flagOnly, syntheticRegistry()).admissible).toBe(false);
    expect(validatePromotionEntry(flagOnly).admissible).toBe(false);
    expect(derivePromotedStateVariables([flagOnly])).toEqual([]);
  });

  it("rejects contradictory or duplicated variables across entries", () => {
    const a = futureEntry();
    const b = futureEntry({ candidate_id: "cand_future_2", direction: "short" });
    const m = validatePromotionManifest([a, b], syntheticRegistry());
    expect(m.admissible).toBe(false);
    expect(m.reasons.join(" ")).toContain("contradictory_variable_direction");
    expect(derivePromotedStateVariables([a, b], syntheticRegistry())).toEqual([]);
  });

  it("manifest hash is deterministic and independent of input order", async () => {
    const a = futureEntry();
    const b = futureEntry({ candidate_id: "cand_future_2", state_variables: ["rsi_regime"] });
    expect(await promotionManifestHash([a, b], syntheticRegistry()))
      .toBe(await promotionManifestHash([b, a], syntheticRegistry()));
    expect(await promotionManifestHash()).toBe(await promotionManifestHash());
  });

  it("contract carries no probability, geometry, execution or private fields", () => {
    const e = futureEntry({ candidate_id: "x" }) as unknown as Record<string, unknown>;
    e.win_probability = 0.7;
    expect(validatePromotionEntry(e as unknown as AcceptedPromotionEntry).reasons.join(" "))
      .toContain("forbidden_field");
    // Only the accepted-entry surface is scanned: the policy block legitimately NAMES
    // these prohibitions ("probability_policy": "no_probability_in_contract").
    const payload = promotionManifestPayload([futureEntry()]);
    const entriesIdx = payload.indexOf("accepted_entries");
    const text = JSON.stringify(payload[entriesIdx + 1]).toLowerCase();
    for (const bad of ["probability", "execution", "user_id", "balance", "stop_loss", "token"]) {
      expect(text).not.toContain(bad);
    }
    expect(PROMOTION_READINESS_SPEC_V1.default_decision).toBe("deny");
  });
});