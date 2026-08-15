import { describe, expect, it } from "vitest";
import {
  buildPostV4PreregistrationPacket,
  POST_V4_PREREGISTRATION_PACKET_POLICY,
  RON_POST_V4_PREREGISTRATION_PACKET_VERSION,
  postV4PreregistrationPacketHash,
  type PostV4PreregistrationPacket,
} from "../../supabase/functions/_shared/ron-post-v4-preregistration-packet";
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
import { type PostV4ResearchHandoffSubmission } from "../../supabase/functions/_shared/ron-post-v4-research-readiness";
import { ACCEPTED_PROMOTION_MANIFEST, CURRENT_ACCEPTED_ARTIFACT_REGISTRY } from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

const IDENTITY = "research_v5_synthetic_packet_fixture";
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

describe("2D.2t — post-V4 preregistration handoff packet", () => {
  it("builds deterministically from a structurally ready paired submission", async () => {
    const s = await submission();
    const first = await buildPostV4PreregistrationPacket(s);
    const second = await buildPostV4PreregistrationPacket(s);
    expect(first).toEqual(second);
    expect(first.built).toBe(true);
    if (!first.built) return;
    expect(first.packet.packet_version).toBe(RON_POST_V4_PREREGISTRATION_PACKET_VERSION);
    expect(first.packet.research_version).toBe(RESEARCH_VERSION_V4 + 1);
    expect(first.packet.contract_identity).toBe(IDENTITY);
    expect(first.packet.accepted).toBe(false);
    expect(first.packet.executable).toBe(false);
    expect(first.packet_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.packet_hash).toBe(await postV4PreregistrationPacketHash(first.packet));
  });

  it("binds the exact accepted claim/procedure identities without creating acceptance", async () => {
    const s = await submission();
    const r = await buildPostV4PreregistrationPacket(s);
    expect(r.built).toBe(true);
    if (!r.built) return;
    expect(r.packet.acceptance_claim_hash).toBe(s.acceptance_binding.claim_hash);
    expect(r.packet.sufficiency_claim_hash).toBe(s.sufficiency_binding.claim_hash);
    expect(r.packet.acceptance_artifact_id).toBe(s.acceptance_artifact_id);
    expect(r.packet.acceptance_procedure_hash).toBe(RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH);
    expect(r.packet.sufficiency_procedure_hash).toBe(CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH);
    expect(r.packet.packet_identity).toContain(`post_v4_preregistration.v${RESEARCH_VERSION_V4 + 1}.`);
  });

  it("fails closed when the underlying 2D.2r submission is not structurally ready", async () => {
    const s = await submission();
    s.sufficiency_claim = sufficiencyClaim({ confirmation_used_for_tuning: true });
    const r = await buildPostV4PreregistrationPacket(s);
    expect(r.built).toBe(false);
    expect(r.packet).toBeNull();
    expect(r.packet_hash).toBeNull();
    expect(r.reasons.join(" | ")).toContain("confirmation_data_used_for_tuning");
  });

  it("packet hash is field-sensitive", async () => {
    const r = await buildPostV4PreregistrationPacket(await submission());
    expect(r.built).toBe(true);
    if (!r.built) return;
    const changed: PostV4PreregistrationPacket = {
      ...r.packet,
      confirmation_source_identity: "another_native_grid",
    };
    expect(await postV4PreregistrationPacketHash(changed)).not.toBe(r.packet_hash);
  });

  it("introduces no acceptance, promotion, probability, persistence, or execution authority", async () => {
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.accepted_by_this_module).toBe(false);
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.persisted_by_this_module).toBe(false);
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.research_run_started_by_this_module).toBe(false);
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.promotion_created_by_this_module).toBe(false);
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.probability_created_by_this_module).toBe(false);
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_PREREGISTRATION_PACKET_POLICY.allow_live_execution).toBe(false);

    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts
      .filter((a) => a.artifact_kind === "research_contract_acceptance")).toEqual([]);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});
