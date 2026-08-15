import { describe, expect, it } from "vitest";
import {
  evaluatePostV4ResearchHandoffReadiness,
  postV4ReadinessSubmissionHash,
  postV4ResearchReadinessHash,
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
import { MIN_TEST_OBS_PER_FOLD, PURGE_MINUTES } from "../../supabase/functions/_shared/ron-research";
import { HOLDOUT_FRACTION } from "../../supabase/functions/_shared/ron-research-v3";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";

const IDENTITY = "research_v5_readiness_hardening_fixture";
const frozenSpecHashes = Object.fromEntries(
  REQUIRED_FROZEN_SPEC_SURFACES.map((s, i) => [s, String(i + 1).repeat(64).slice(0, 64)]),
);

function acceptanceClaim(over: Partial<ResearchContractAcceptanceClaim> = {}): ResearchContractAcceptanceClaim {
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

function sufficiencyClaim(over: Partial<ConfirmatorySampleSufficiencyClaim> = {}): ConfirmatorySampleSufficiencyClaim {
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
      long: MIN_TEST_OBS_PER_FOLD,
      short: MIN_TEST_OBS_PER_FOLD,
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
  if (!built.built || !sBind.built) throw new Error("fixture claims must be structurally admissible");
  return {
    acceptance_claim: ac,
    acceptance_binding: built.artifact.contract_binding,
    acceptance_artifact_id: built.artifact.artifact_id,
    sufficiency_claim: sc,
    sufficiency_binding: sBind.binding,
  };
}

describe("post-V4 readiness hardening", () => {
  it("rejects a confirmation window that begins before the contract-declared confirmation start", async () => {
    const s = await submission(
      { confirmation_start: "2026-09-03T00:00:00Z" },
      { confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
    );
    const r = await evaluatePostV4ResearchHandoffReadiness(s);
    expect(r.ready).toBe(false);
    expect(r.reasons).toContain("confirmation_window_starts_before_declared_confirmation_start");
  });

  it("allows the confirmation window to begin exactly at the declared confirmation start", async () => {
    const s = await submission(
      { confirmation_start: "2026-09-02T00:00:00Z" },
      { confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
    );
    const r = await evaluatePostV4ResearchHandoffReadiness(s);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("binds the readiness procedure identity into the submission hash payload", async () => {
    const s = await submission();
    const procedureHash = await postV4ResearchReadinessHash();
    expect(procedureHash).toMatch(/^[0-9a-f]{64}$/);

    const submissionHash = await postV4ReadinessSubmissionHash(s);
    expect(submissionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(submissionHash).toBe(await postV4ReadinessSubmissionHash(s));
  });
});
