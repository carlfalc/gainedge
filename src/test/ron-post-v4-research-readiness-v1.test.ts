import { describe, expect, it } from "vitest";
import {
  POST_V4_READINESS_MEANING,
  POST_V4_RESEARCH_READINESS_PROCEDURE,
  RON_POST_V4_RESEARCH_READINESS_VERSION,
  evaluatePostV4ResearchHandoffReadiness,
  postV4ReadinessSubmissionHash,
  postV4ResearchReadinessHash,
  productionPostV4Readiness,
  type PostV4ResearchHandoffSubmission,
} from "../../supabase/functions/_shared/ron-post-v4-research-readiness";
import {
  REQUIRED_FROZEN_SPEC_SURFACES,
  RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  buildResearchContractAcceptanceArtifact,
  type ResearchContractAcceptanceClaim,
} from "../../supabase/functions/_shared/ron-research-contract-acceptance";
import {
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  buildConfirmatorySampleSufficiencyBinding,
  type ConfirmatorySampleSufficiencyClaim,
} from "../../supabase/functions/_shared/ron-confirmatory-sample-sufficiency";
import {
  MIN_TEST_OBS_PER_FOLD, PURGE_MINUTES,
} from "../../supabase/functions/_shared/ron-research";
import { HOLDOUT_FRACTION } from "../../supabase/functions/_shared/ron-research-v3";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import {
  ACCEPTED_PROMOTION_MANIFEST, CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

/** SYNTHETIC, test-only future claims. Nothing here is accepted in production. */
const IDENTITY = "research_v5_synthetic";
const frozenSpecHashes = Object.fromEntries(
  REQUIRED_FROZEN_SPEC_SURFACES.map((s, i) => [s, String(i + 1).repeat(64).slice(0, 64)]),
);

function acceptanceClaim(
  over: Partial<ResearchContractAcceptanceClaim> = {},
): ResearchContractAcceptanceClaim {
  return {
    procedure_version: 1,
    procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: IDENTITY,
    contract_frozen_at: "2026-09-01T00:00:00Z",
    frozen_spec_hashes: frozenSpecHashes,
    confirmation_start: "2026-09-02T00:00:00Z",
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: "audited_source_change",
    ...over,
  };
}

function sufficiencyClaim(
  over: Partial<ConfirmatorySampleSufficiencyClaim> = {},
): ConfirmatorySampleSufficiencyClaim {
  return {
    procedure_version: 1,
    procedure_hash: CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: IDENTITY,
    spec_frozen_at: "2026-09-01T00:00:00Z",
    discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
    confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" },
    confirmation_source_identity: "post_freeze_native_15m_grid",
    purge_minutes: PURGE_MINUTES,
    holdout_fraction: HOLDOUT_FRACTION,
    confirmatory_observations_per_direction: {
      long: MIN_TEST_OBS_PER_FOLD, short: MIN_TEST_OBS_PER_FOLD,
    },
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: "audited_source_change",
    ...over,
  };
}

async function submission(
  a: Partial<ResearchContractAcceptanceClaim> = {},
  s: Partial<ConfirmatorySampleSufficiencyClaim> = {},
): Promise<PostV4ResearchHandoffSubmission> {
  const ac = acceptanceClaim(a);
  const sc = sufficiencyClaim(s);
  const built = await buildResearchContractAcceptanceArtifact(ac);
  const sBind = await buildConfirmatorySampleSufficiencyBinding(sc);
  if (!built.built || !sBind.built) throw new Error("fixture claims must be admissible");
  return {
    acceptance_claim: ac,
    acceptance_binding: built.artifact.contract_binding,
    acceptance_artifact_id: built.artifact.artifact_id,
    sufficiency_claim: sc,
    sufficiency_binding: sBind.binding,
  };
}

describe("2D.2r — post-V4 research handoff / preregistration readiness gate", () => {
  it("a fully paired synthetic submission is structurally ready — and only that", async () => {
    const r = await evaluatePostV4ResearchHandoffReadiness(await submission());
    expect(r).toEqual({
      ready: true, meaning: "structurally_ready_for_explicit_audited_handoff", reasons: [],
    });
    expect(POST_V4_READINESS_MEANING).toBe(r.meaning);
    expect(POST_V4_RESEARCH_READINESS_PROCEDURE.new_numeric_constants_introduced).toBe(0);
    expect(POST_V4_RESEARCH_READINESS_PROCEDURE.new_methodological_semantics_introduced).toBe(0);
    expect(POST_V4_RESEARCH_READINESS_PROCEDURE.execution_path).toBe("signal_only");
    expect(POST_V4_RESEARCH_READINESS_PROCEDURE.allow_live_execution).toBe(false);
    expect(POST_V4_RESEARCH_READINESS_PROCEDURE.does_not_mean.join(" "))
      .toContain("not_a_promotion");
  });

  it("procedure hash is deterministic", async () => {
    const h = await postV4ResearchReadinessHash();
    expect(h).toBe(await postV4ResearchReadinessHash());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(RON_POST_V4_RESEARCH_READINESS_VERSION).toBe(1);
  });

  it("fails closed when either side is missing or malformed", async () => {
    expect((await evaluatePostV4ResearchHandoffReadiness(
      undefined as unknown as PostV4ResearchHandoffSubmission)).reasons)
      .toEqual(["missing_submission"]);
    const s = await submission();
    for (const [k, reason] of [
      ["acceptance_claim", "missing_acceptance_claim"],
      ["sufficiency_claim", "missing_sufficiency_claim"],
      ["acceptance_binding", "missing_acceptance_binding"],
      ["sufficiency_binding", "missing_sufficiency_binding"],
    ] as const) {
      const r = await evaluatePostV4ResearchHandoffReadiness(
        { ...s, [k]: undefined } as unknown as PostV4ResearchHandoffSubmission,
      );
      expect(r.ready).toBe(false);
      expect(r.reasons).toContain(reason);
    }
    const bad = await evaluatePostV4ResearchHandoffReadiness({
      ...s, sufficiency_binding: { ...s.sufficiency_binding, claim_hash: "nope" },
    });
    expect(bad.ready).toBe(false);
    expect(bad.reasons.join(" | ")).toContain("sufficiency_binding: binding_malformed_claim_hash");
  });

  it("requires both sides to describe the same contract, newer than frozen V4", async () => {
    const mismatchVersion = await submission({}, {});
    mismatchVersion.sufficiency_claim = sufficiencyClaim({
      research_version: RESEARCH_VERSION_V4 + 2,
    });
    let r = await evaluatePostV4ResearchHandoffReadiness(mismatchVersion);
    expect(r.reasons.join(" | "))
      .toContain("research_version_mismatch_between_acceptance_and_sufficiency");

    const mismatchIdentity = await submission();
    mismatchIdentity.sufficiency_claim = sufficiencyClaim({ contract_identity: "other_v5" });
    r = await evaluatePostV4ResearchHandoffReadiness(mismatchIdentity);
    expect(r.reasons.join(" | "))
      .toContain("contract_identity_mismatch_between_acceptance_and_sufficiency");

    const v4 = await submission();
    v4.acceptance_claim = acceptanceClaim({ research_version: RESEARCH_VERSION_V4 });
    v4.sufficiency_claim = sufficiencyClaim({ research_version: RESEARCH_VERSION_V4 });
    r = await evaluatePostV4ResearchHandoffReadiness(v4);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" | ")).toContain("research_version_not_after_frozen_negative_v4");
  });

  it("requires the exact accepted procedure version and hash on both sides", async () => {
    const wrongHash = await submission();
    wrongHash.acceptance_claim = acceptanceClaim({ procedure_hash: "f".repeat(64) });
    let r = await evaluatePostV4ResearchHandoffReadiness(wrongHash);
    expect(r.reasons.join(" | ")).toContain("acceptance_procedure_identity_not_exactly_accepted");

    const wrongVersion = await submission();
    wrongVersion.sufficiency_claim = sufficiencyClaim({ procedure_version: 2 });
    r = await evaluatePostV4ResearchHandoffReadiness(wrongVersion);
    expect(r.reasons.join(" | ")).toContain("sufficiency_procedure_identity_not_exactly_accepted");
  });

  const delegated: Array<[string, Partial<ConfirmatorySampleSufficiencyClaim>, string]> = [
    ["selection contamination", { confirmation_used_for_selection: true },
      "confirmation_data_used_for_selection_or_ranking"],
    ["tuning contamination", { confirmation_used_for_tuning: true },
      "confirmation_data_used_for_tuning"],
    ["pre-freeze confirmation", { spec_frozen_at: "2026-10-01T00:00:00Z" },
      "confirmation_window_starts_before_spec_freeze"],
    ["overlapping windows",
      { confirmation_window: { start: "2026-06-01T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
      "confirmation_window_overlaps_discovery_window"],
    ["purge gap violated",
      { discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-09-02T00:00:00Z" },
        confirmation_window: { start: "2026-09-02T00:30:00Z", end: "2026-11-01T00:00:00Z" } },
      "inherited_purge_gap_not_respected"],
    ["one direction below the inherited minimum",
      { confirmatory_observations_per_direction: {
        long: MIN_TEST_OBS_PER_FOLD, short: MIN_TEST_OBS_PER_FOLD - 1 } },
      "confirmatory_observations_below_inherited_minimum: short"],
    ["wrong holdout fraction", { holdout_fraction: 0.3 }, "holdout_fraction_not_inherited"],
    ["wrong purge minutes", { purge_minutes: PURGE_MINUTES - 1 }, "purge_minutes_not_inherited"],
    ["unaudited origin", { acceptance_origin: "self_asserted" },
      "acceptance_origin_not_audited_source_change"],
  ];

  it.each(delegated)("delegates and fails closed: %s", async (_l, over, expected) => {
    const s = await submission();
    s.sufficiency_claim = sufficiencyClaim(over);
    const r = await evaluatePostV4ResearchHandoffReadiness(s);
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" | ")).toContain(`sufficiency_claim: ${expected}`);
  });

  it("delegates acceptance-side spec-surface and freeze rules unchanged", async () => {
    const s = await submission();
    const { candidate_spec_hash: _drop, ...missing } = frozenSpecHashes as Record<string, string>;
    s.acceptance_claim = acceptanceClaim({ frozen_spec_hashes: missing });
    let r = await evaluatePostV4ResearchHandoffReadiness(s);
    expect(r.reasons.join(" | "))
      .toContain("acceptance_claim: missing_frozen_spec_surface: candidate_spec_hash");

    const s2 = await submission();
    s2.acceptance_claim = acceptanceClaim({ confirmation_start: "2026-08-01T00:00:00Z" });
    r = await evaluatePostV4ResearchHandoffReadiness(s2);
    expect(r.reasons.join(" | "))
      .toContain("confirmation_start_not_strictly_after_contract_freeze");
  });

  it("rejects a binding that belongs to a different claim", async () => {
    const s = await submission();
    const other = await submission({ contract_frozen_at: "2026-09-01T00:00:01Z" },
      { spec_frozen_at: "2026-09-01T00:00:01Z" });
    const r = await evaluatePostV4ResearchHandoffReadiness({
      ...s, acceptance_binding: other.acceptance_binding,
      acceptance_artifact_id: other.acceptance_artifact_id,
    });
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" | ")).toContain("acceptance_binding_claim_hash_does_not_match_claim");
  });

  it("readiness hash is deterministic, key-order independent, and field sensitive", async () => {
    const s = await submission();
    const h = await postV4ReadinessSubmissionHash(s);
    expect(h).toBe(await postV4ReadinessSubmissionHash(s));
    const reordered = {
      sufficiency_binding: s.sufficiency_binding,
      sufficiency_claim: JSON.parse(JSON.stringify({
        acceptance_origin: s.sufficiency_claim.acceptance_origin,
        confirmatory_observations_per_direction: {
          short: s.sufficiency_claim.confirmatory_observations_per_direction.short,
          long: s.sufficiency_claim.confirmatory_observations_per_direction.long,
        },
        ...s.sufficiency_claim,
      })) as ConfirmatorySampleSufficiencyClaim,
      acceptance_artifact_id: s.acceptance_artifact_id,
      acceptance_binding: s.acceptance_binding,
      acceptance_claim: s.acceptance_claim,
    };
    expect(await postV4ReadinessSubmissionHash(reordered)).toBe(h);

    const changed = await submission({}, { confirmation_source_identity: "another_grid" });
    expect(await postV4ReadinessSubmissionHash(changed)).not.toBe(h);
  });

  it("production is NOT ready and nothing is promoted", async () => {
    const p = productionPostV4Readiness();
    expect(p.ready).toBe(false);
    expect(p.accepted_research_contract_artifacts).toBe(0);
    expect(p.accepted_promotion_entries).toBe(0);
    expect(p.reasons).toContain("no_accepted_post_v4_research_contract_artifact");

    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts).toHaveLength(2);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .every((a) => a.artifact_kind === "prerequisite_resolution")).toBe(true);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("exposes no probability, execution or runtime I/O surface", async () => {
    const src = POST_V4_RESEARCH_READINESS_PROCEDURE as Record<string, unknown>;
    for (const k of Object.keys(src)) {
      expect(/probability|confidence|order|position|lot|live_trade/.test(k)).toBe(false);
    }
    expect(JSON.stringify(await evaluatePostV4ResearchHandoffReadiness(await submission())))
      .not.toMatch(/probability|confidence/);
  });
});
