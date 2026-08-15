/**
 * RON implementation marker 2D.2u — PROSPECTIVE POST-V4 REPLICATION CONTRACT CONSTRUCTOR.
 *
 * Pure construction only. No registry mutation, persistence, database access, research run,
 * probability, promotion, order placement or live execution.
 *
 * This module supports one narrowly defined prospective path: an unchanged replication of
 * the accepted frozen V4 methodology on genuinely new post-freeze data. It does NOT make
 * that path accepted in production. A separate audited source change is still required to
 * place any resulting research-contract acceptance artifact into the accepted registry.
 */
import {
  ADMISSIBLE_ACCEPTANCE_ORIGIN,
  RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  buildResearchContractAcceptanceArtifact,
  type BuiltResearchContractAcceptanceArtifact,
  type ResearchContractAcceptanceClaim,
} from "./ron-research-contract-acceptance.ts";
import { RESEARCH_VERSION_V4, v4ContractHashes } from "./ron-research-v4.ts";

export const RON_POST_V4_REPLICATION_CONTRACT_VERSION = 1;
export const POST_V4_REPLICATION_METHODOLOGY_SOURCE = "frozen_v4_replication" as const;

export const POST_V4_REPLICATION_CONTRACT_POLICY = {
  constructor_version: RON_POST_V4_REPLICATION_CONTRACT_VERSION,
  methodology_source: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  methodology_semantics_changed: false,
  accepted_by_this_module: false,
  persisted_by_this_module: false,
  research_run_started_by_this_module: false,
  promotion_created_by_this_module: false,
  probability_created_by_this_module: false,
  execution_path: "signal_only",
  allow_live_execution: false,
  requires_explicit_freeze_boundary: true,
  requires_explicit_confirmation_boundary: true,
} as const;

export interface PostV4ReplicationContractInput {
  research_version: number;
  contract_identity: string;
  contract_frozen_at: string;
  confirmation_start: string;
  methodology_source: typeof POST_V4_REPLICATION_METHODOLOGY_SOURCE;
}

export interface PostV4ReplicationContractDraft {
  constructor_version: number;
  methodology_source: typeof POST_V4_REPLICATION_METHODOLOGY_SOURCE;
  claim: ResearchContractAcceptanceClaim;
  candidate_artifact: BuiltResearchContractAcceptanceArtifact;
  accepted: false;
  executable: false;
}

export type BuildPostV4ReplicationContractResult =
  | { built: true; draft: PostV4ReplicationContractDraft; reasons: [] }
  | { built: false; draft: null; reasons: string[] };

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Build an UNACCEPTED draft for an unchanged V4-methodology replication contract.
 * The seven frozen surfaces are always derived directly from `v4ContractHashes()`.
 */
export async function buildPostV4ReplicationContractDraft(
  input: PostV4ReplicationContractInput,
): Promise<BuildPostV4ReplicationContractResult> {
  const reasons: string[] = [];
  if (!input || typeof input !== "object") {
    return { built: false, draft: null, reasons: ["missing_input"] };
  }
  if (input.methodology_source !== POST_V4_REPLICATION_METHODOLOGY_SOURCE) {
    reasons.push("methodology_source_not_frozen_v4_replication");
  }
  if (!Number.isInteger(input.research_version) || input.research_version <= RESEARCH_VERSION_V4) {
    reasons.push("research_version_not_after_v4");
  }
  if (!nonEmpty(input.contract_identity)) reasons.push("missing_contract_identity");
  if (!nonEmpty(input.contract_frozen_at)) reasons.push("missing_contract_frozen_at");
  if (!nonEmpty(input.confirmation_start)) reasons.push("missing_confirmation_start");
  if (reasons.length > 0) return { built: false, draft: null, reasons };

  const frozenSpecHashes = await v4ContractHashes();
  const claim: ResearchContractAcceptanceClaim = {
    procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
    procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
    research_version: input.research_version,
    contract_identity: input.contract_identity,
    contract_frozen_at: input.contract_frozen_at,
    frozen_spec_hashes: frozenSpecHashes,
    confirmation_start: input.confirmation_start,
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: ADMISSIBLE_ACCEPTANCE_ORIGIN,
  };

  const artifact = await buildResearchContractAcceptanceArtifact(claim);
  if (!artifact.built) {
    return { built: false, draft: null, reasons: artifact.reasons };
  }

  return {
    built: true,
    reasons: [],
    draft: {
      constructor_version: RON_POST_V4_REPLICATION_CONTRACT_VERSION,
      methodology_source: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
      claim,
      candidate_artifact: artifact.artifact,
      accepted: false,
      executable: false,
    },
  };
}
