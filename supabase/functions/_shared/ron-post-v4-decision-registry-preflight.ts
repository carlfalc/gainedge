/**
 * RON implementation marker 2D.2x — POST-V4 DECISION -> REGISTRY PREFLIGHT.
 *
 * Pure composition only. No registry mutation, persistence, database access, research run,
 * probability, promotion, order placement or live execution.
 *
 * PURPOSE
 * -------
 * Compose the explicit 2D.2w governance decision with the 2D.2v acceptance-registry preview.
 * A frozen-V4 replication decision may produce a valid dry-run registry preview. A
 * `new_methodology_required` decision can never be silently converted into replication.
 */
import {
  type PostV4ContractDecisionRecord,
} from "./ron-post-v4-contract-decision.ts";
import {
  previewPostV4AcceptanceRegistryInsertion,
  type AcceptanceRegistryPreviewResult,
} from "./ron-post-v4-acceptance-registry-preview.ts";

export const RON_POST_V4_DECISION_REGISTRY_PREFLIGHT_VERSION = 1;

export interface PostV4DecisionRegistryPreflightResult {
  preflight_version: number;
  ready_for_explicit_registry_edit: boolean;
  reasons: string[];
  registry_preview: AcceptanceRegistryPreviewResult | null;
  production_mutated: false;
  accepted_by_this_module: false;
  research_run_authorized: false;
  execution_path: "signal_only";
  allow_live_execution: false;
}

/**
 * Deny-by-default composition of an already-built 2D.2w decision record.
 * This function does not validate provenance by itself; it requires the record to preserve
 * the zero-authority invariants established by the decision-record constructor.
 */
export function preflightPostV4DecisionRegistryEdit(
  record: PostV4ContractDecisionRecord | null | undefined,
): PostV4DecisionRegistryPreflightResult {
  const deny = (reasons: string[]): PostV4DecisionRegistryPreflightResult => ({
    preflight_version: RON_POST_V4_DECISION_REGISTRY_PREFLIGHT_VERSION,
    ready_for_explicit_registry_edit: false,
    reasons,
    registry_preview: null,
    production_mutated: false,
    accepted_by_this_module: false,
    research_run_authorized: false,
    execution_path: "signal_only",
    allow_live_execution: false,
  });

  if (!record || typeof record !== "object") return deny(["missing_decision_record"]);
  if (record.accepted !== false
    || record.research_run_authorized !== false
    || record.executable !== false) {
    return deny(["decision_record_carries_forbidden_authority"]);
  }

  if (record.decision_path === "new_methodology_required") {
    if (record.replication_draft !== null) {
      return deny(["new_methodology_decision_must_not_carry_replication_draft"]);
    }
    return deny(["new_methodology_requires_separately_audited_contract"]);
  }

  if (record.decision_path !== "frozen_v4_replication") {
    return deny(["unsupported_decision_path"]);
  }
  if (!record.replication_draft) {
    return deny(["replication_decision_missing_contract_draft"]);
  }
  if (record.replication_draft.accepted !== false
    || record.replication_draft.executable !== false) {
    return deny(["replication_draft_carries_forbidden_authority"]);
  }

  const preview = previewPostV4AcceptanceRegistryInsertion(
    record.replication_draft.candidate_artifact,
  );
  if (!preview.valid) {
    return {
      ...deny(preview.reasons.map((r) => `registry_preview: ${r}`)),
      registry_preview: preview,
    };
  }

  return {
    preflight_version: RON_POST_V4_DECISION_REGISTRY_PREFLIGHT_VERSION,
    ready_for_explicit_registry_edit: true,
    reasons: [],
    registry_preview: preview,
    production_mutated: false,
    accepted_by_this_module: false,
    research_run_authorized: false,
    execution_path: "signal_only",
    allow_live_execution: false,
  };
}
