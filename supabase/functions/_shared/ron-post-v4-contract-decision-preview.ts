/**
 * RON implementation marker 2D.2x — POST-V4 CONTRACT DECISION APPLICATION PREVIEW.
 *
 * Pure dry-run composition only. No registry mutation, persistence, database access,
 * research execution, probability, promotion, order placement or live execution.
 *
 * Given a valid 2D.2w decision record:
 *   - frozen-V4 replication previews the exact accepted-registry insertion that WOULD be
 *     proposed by a later explicit audited source change;
 *   - new-methodology-required produces no acceptance artifact or registry insertion.
 */
import {
  buildPostV4ContractDecisionRecord,
  type PostV4ContractDecisionInput,
  type PostV4ContractDecisionRecord,
} from "./ron-post-v4-contract-decision.ts";
import {
  previewPostV4AcceptanceRegistryInsertion,
  type AcceptanceRegistryPreviewResult,
} from "./ron-post-v4-acceptance-registry-preview.ts";
import { POST_V4_REPLICATION_METHODOLOGY_SOURCE } from "./ron-post-v4-replication-contract.ts";

export const RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION = 1;

export const POST_V4_CONTRACT_DECISION_PREVIEW_POLICY = {
  preview_version: RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION,
  accepted_by_this_module: false,
  registry_mutated_by_this_module: false,
  persisted_by_this_module: false,
  research_run_authorized_by_this_module: false,
  probability_created_by_this_module: false,
  promotion_created_by_this_module: false,
  execution_path: "signal_only",
  allow_live_execution: false,
} as const;

export interface PostV4ContractDecisionApplicationPreview {
  preview_version: number;
  decision_record: PostV4ContractDecisionRecord;
  acceptance_registry_preview: AcceptanceRegistryPreviewResult | null;
  acceptance_artifact_proposed: boolean;
  production_mutated: false;
  accepted_by_this_module: false;
  research_run_authorized: false;
  executable: false;
}

export type BuildPostV4ContractDecisionApplicationPreviewResult =
  | {
      built: true;
      preview: PostV4ContractDecisionApplicationPreview;
      reasons: [];
    }
  | {
      built: false;
      preview: null;
      reasons: string[];
    };

/**
 * Build the exact dry-run consequence of an explicit 2D.2w decision.
 * No production state is changed.
 */
export async function buildPostV4ContractDecisionApplicationPreview(
  input: PostV4ContractDecisionInput,
): Promise<BuildPostV4ContractDecisionApplicationPreviewResult> {
  const decision = await buildPostV4ContractDecisionRecord(input);
  if (!decision.built) {
    return {
      built: false,
      preview: null,
      reasons: decision.reasons.map((r) => `decision: ${r}`),
    };
  }

  if (decision.record.decision_path === POST_V4_REPLICATION_METHODOLOGY_SOURCE) {
    const draft = decision.record.replication_draft;
    if (!draft) {
      return {
        built: false,
        preview: null,
        reasons: ["decision_missing_replication_draft"],
      };
    }

    const registryPreview = previewPostV4AcceptanceRegistryInsertion(draft.candidate_artifact);
    if (!registryPreview.valid) {
      return {
        built: false,
        preview: null,
        reasons: registryPreview.reasons.map((r) => `registry_preview: ${r}`),
      };
    }

    return {
      built: true,
      reasons: [],
      preview: {
        preview_version: RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION,
        decision_record: decision.record,
        acceptance_registry_preview: registryPreview,
        acceptance_artifact_proposed: true,
        production_mutated: false,
        accepted_by_this_module: false,
        research_run_authorized: false,
        executable: false,
      },
    };
  }

  return {
    built: true,
    reasons: [],
    preview: {
      preview_version: RON_POST_V4_CONTRACT_DECISION_PREVIEW_VERSION,
      decision_record: decision.record,
      acceptance_registry_preview: null,
      acceptance_artifact_proposed: false,
      production_mutated: false,
      accepted_by_this_module: false,
      research_run_authorized: false,
      executable: false,
    },
  };
}
