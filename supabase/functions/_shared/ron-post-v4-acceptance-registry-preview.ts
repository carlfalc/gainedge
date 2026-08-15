/**
 * RON implementation marker 2D.2v — PROSPECTIVE ACCEPTANCE-REGISTRY PREVIEW.
 * Pure dry-run only. No mutation, persistence, database access, research execution,
 * probability, promotion, orders or live execution.
 */
import {
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
  validateAcceptanceRegistry,
  type AcceptanceRegistry,
  type AcceptedArtifactRecord,
} from "./ron-promotion-readiness.ts";
import type { BuiltResearchContractAcceptanceArtifact } from "./ron-research-contract-acceptance.ts";

export const RON_POST_V4_ACCEPTANCE_REGISTRY_PREVIEW_VERSION = 1;

export interface AcceptanceRegistryPreviewResult {
  preview_version: number;
  valid: boolean;
  reasons: string[];
  preview_registry: AcceptanceRegistry;
  production_mutated: false;
  accepted_by_this_module: false;
  execution_path: "signal_only";
  allow_live_execution: false;
}

/**
 * Dry-run the exact registry record shape a future audited source edit would add.
 * The current production registry is copied, never mutated.
 */
export function previewPostV4AcceptanceRegistryInsertion(
  artifact: BuiltResearchContractAcceptanceArtifact,
  base: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
): AcceptanceRegistryPreviewResult {
  const record: AcceptedArtifactRecord = {
    artifact_id: artifact.artifact_id,
    artifact_kind: artifact.artifact_kind,
    research_version: artifact.contract_binding.research_version,
    contract_binding: artifact.contract_binding,
  };

  const preview: AcceptanceRegistry = {
    registry_version: base.registry_version,
    artifacts: [...base.artifacts, record],
  };
  const validation = validateAcceptanceRegistry(preview);

  return {
    preview_version: RON_POST_V4_ACCEPTANCE_REGISTRY_PREVIEW_VERSION,
    valid: validation.admissible,
    reasons: validation.reasons,
    preview_registry: preview,
    production_mutated: false,
    accepted_by_this_module: false,
    execution_path: "signal_only",
    allow_live_execution: false,
  };
}
