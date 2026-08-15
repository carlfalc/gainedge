/**
 * RON implementation marker 2D.2t — POST-V4 PREREGISTRATION HANDOFF PACKET.
 * Pure packaging contract only: no runtime behaviour, no I/O, no database, no deploy,
 * no accepted-artifact registry mutation, no research execution, no probability, no orders.
 *
 * PURPOSE
 * -------
 * Package a submission that already passes the 2D.2r structural readiness gate into one
 * deterministic, immutable handoff packet suitable for an EXPLICIT audited acceptance step.
 *
 * A packet is NOT an accepted research contract and cannot make one accepted. It is not a
 * Research V5 run, not permission to execute research, not a promotion, not a probability,
 * not statistical power, and not a trading instruction. Production remains unchanged until
 * a separate audited source change explicitly accepts a post-V4 research-contract artifact.
 */
import { sha256 } from "./ron-calibration.ts";
import {
  POST_V4_READINESS_MEANING,
  evaluatePostV4ResearchHandoffReadiness,
  postV4ReadinessSubmissionHash,
  type PostV4ResearchHandoffSubmission,
} from "./ron-post-v4-research-readiness.ts";
import { RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";

export const RON_POST_V4_PREREGISTRATION_PACKET_VERSION = 1;

export const POST_V4_PREREGISTRATION_PACKET_POLICY = {
  packet_version: RON_POST_V4_PREREGISTRATION_PACKET_VERSION,
  default_decision: "deny",
  source_gate: "ron-post-v4-research-readiness.ts:evaluatePostV4ResearchHandoffReadiness",
  required_readiness_meaning: POST_V4_READINESS_MEANING,
  min_research_version: RESEARCH_VERSION_V4 + 1,
  accepted_by_this_module: false,
  persisted_by_this_module: false,
  research_run_started_by_this_module: false,
  promotion_created_by_this_module: false,
  probability_created_by_this_module: false,
  execution_path: "signal_only",
  allow_live_execution: false,
  non_claims: [
    "not_an_accepted_post_v4_research_contract",
    "not_permission_to_execute_research",
    "not_a_research_result",
    "not_a_promotion",
    "not_a_calibrated_probability",
    "not_statistical_power_or_significance",
    "not_permission_for_trading_or_order_execution",
  ],
} as const;

export interface PostV4PreregistrationPacket {
  packet_version: number;
  packet_identity: string;
  research_version: number;
  contract_identity: string;
  source_readiness_meaning: string;
  source_submission_hash: string;
  acceptance_claim_hash: string;
  sufficiency_claim_hash: string;
  acceptance_artifact_id: string;
  acceptance_procedure_version: number;
  acceptance_procedure_hash: string;
  sufficiency_procedure_version: number;
  sufficiency_procedure_hash: string;
  contract_frozen_at: string;
  confirmation_start: string;
  confirmation_window_start: string;
  confirmation_window_end: string;
  confirmation_source_identity: string;
  accepted: false;
  executable: false;
}

export type BuildPostV4PreregistrationPacketResult =
  | { built: true; packet: PostV4PreregistrationPacket; packet_hash: string; reasons: [] }
  | { built: false; packet: null; packet_hash: null; reasons: string[] };

const hex64 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

export function postV4PreregistrationPacketPayload(packet: PostV4PreregistrationPacket) {
  return [
    "ron_post_v4_preregistration_packet", RON_POST_V4_PREREGISTRATION_PACKET_VERSION,
    "packet_version", packet.packet_version,
    "packet_identity", packet.packet_identity,
    "research_version", packet.research_version,
    "contract_identity", packet.contract_identity,
    "source_readiness_meaning", packet.source_readiness_meaning,
    "source_submission_hash", packet.source_submission_hash,
    "acceptance_claim_hash", packet.acceptance_claim_hash,
    "sufficiency_claim_hash", packet.sufficiency_claim_hash,
    "acceptance_artifact_id", packet.acceptance_artifact_id,
    "acceptance_procedure_version", packet.acceptance_procedure_version,
    "acceptance_procedure_hash", packet.acceptance_procedure_hash,
    "sufficiency_procedure_version", packet.sufficiency_procedure_version,
    "sufficiency_procedure_hash", packet.sufficiency_procedure_hash,
    "contract_frozen_at", packet.contract_frozen_at,
    "confirmation_start", packet.confirmation_start,
    "confirmation_window_start", packet.confirmation_window_start,
    "confirmation_window_end", packet.confirmation_window_end,
    "confirmation_source_identity", packet.confirmation_source_identity,
    "accepted", packet.accepted,
    "executable", packet.executable,
  ];
}

export async function postV4PreregistrationPacketHash(packet: PostV4PreregistrationPacket) {
  return await sha256(postV4PreregistrationPacketPayload(packet));
}

/**
 * Build a deterministic handoff packet ONLY from a submission already accepted by 2D.2r.
 * No side effects. No registry mutation. No persistence. No run execution.
 */
export async function buildPostV4PreregistrationPacket(
  submission: PostV4ResearchHandoffSubmission,
): Promise<BuildPostV4PreregistrationPacketResult> {
  const readiness = await evaluatePostV4ResearchHandoffReadiness(submission);
  if (!readiness.ready || readiness.meaning !== POST_V4_READINESS_MEANING) {
    return {
      built: false,
      packet: null,
      packet_hash: null,
      reasons: readiness.reasons.length > 0 ? readiness.reasons : ["submission_not_structurally_ready"],
    };
  }

  const sourceHash = await postV4ReadinessSubmissionHash(submission);
  const acceptanceClaimHash = submission.acceptance_binding.claim_hash;
  const sufficiencyClaimHash = submission.sufficiency_binding.claim_hash;
  if (!hex64(sourceHash) || !hex64(acceptanceClaimHash) || !hex64(sufficiencyClaimHash)) {
    return { built: false, packet: null, packet_hash: null, reasons: ["malformed_source_hash"] };
  }

  const packetIdentity = `post_v4_preregistration.v${submission.acceptance_claim.research_version}.`
    + `${submission.acceptance_claim.contract_identity}.${sourceHash.slice(0, 16)}`;

  const packet: PostV4PreregistrationPacket = {
    packet_version: RON_POST_V4_PREREGISTRATION_PACKET_VERSION,
    packet_identity: packetIdentity,
    research_version: submission.acceptance_claim.research_version,
    contract_identity: submission.acceptance_claim.contract_identity,
    source_readiness_meaning: readiness.meaning,
    source_submission_hash: sourceHash,
    acceptance_claim_hash: acceptanceClaimHash,
    sufficiency_claim_hash: sufficiencyClaimHash,
    acceptance_artifact_id: submission.acceptance_artifact_id,
    acceptance_procedure_version: submission.acceptance_claim.procedure_version,
    acceptance_procedure_hash: submission.acceptance_claim.procedure_hash,
    sufficiency_procedure_version: submission.sufficiency_claim.procedure_version,
    sufficiency_procedure_hash: submission.sufficiency_claim.procedure_hash,
    contract_frozen_at: submission.acceptance_claim.contract_frozen_at,
    confirmation_start: submission.acceptance_claim.confirmation_start,
    confirmation_window_start: submission.sufficiency_claim.confirmation_window.start,
    confirmation_window_end: submission.sufficiency_claim.confirmation_window.end,
    confirmation_source_identity: submission.sufficiency_claim.confirmation_source_identity,
    accepted: false,
    executable: false,
  };

  return {
    built: true,
    packet,
    packet_hash: await postV4PreregistrationPacketHash(packet),
    reasons: [],
  };
}
