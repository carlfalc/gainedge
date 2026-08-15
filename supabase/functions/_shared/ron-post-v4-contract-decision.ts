/**
 * RON implementation marker 2D.2w — POST-V4 CONTRACT DECISION RECORD.
 *
 * Pure governance record only. No registry mutation, persistence, database access,
 * research execution, probability, promotion, order placement or live execution.
 *
 * PURPOSE
 * -------
 * Make the next methodological path an EXPLICIT audited decision instead of allowing
 * downstream code to infer one. Exactly two decisions are representable:
 *   1. unchanged replication of the frozen V4 methodology; or
 *   2. a declaration that a separately audited new methodology is required.
 *
 * Neither decision accepts a research contract or authorizes a research run.
 */
import { sha256 } from "./ron-calibration.ts";
import {
  POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  buildPostV4ReplicationContractDraft,
  type PostV4ReplicationContractDraft,
} from "./ron-post-v4-replication-contract.ts";

export const RON_POST_V4_CONTRACT_DECISION_VERSION = 1;
export const POST_V4_CONTRACT_DECISION_ORIGIN = "audited_source_change" as const;

export const POST_V4_CONTRACT_DECISION_PATHS = [
  POST_V4_REPLICATION_METHODOLOGY_SOURCE,
  "new_methodology_required",
] as const;

export type PostV4ContractDecisionPath = typeof POST_V4_CONTRACT_DECISION_PATHS[number];

export const POST_V4_CONTRACT_DECISION_POLICY = {
  decision_version: RON_POST_V4_CONTRACT_DECISION_VERSION,
  decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
  allowed_paths: POST_V4_CONTRACT_DECISION_PATHS,
  path_must_be_explicit: true,
  contract_freeze_must_not_predate_decision: true,
  accepted_by_this_module: false,
  registry_mutated_by_this_module: false,
  persisted_by_this_module: false,
  research_run_authorized_by_this_module: false,
  probability_created_by_this_module: false,
  promotion_created_by_this_module: false,
  execution_path: "signal_only",
  allow_live_execution: false,
} as const;

export interface PostV4ContractDecisionInput {
  decision_path: PostV4ContractDecisionPath;
  decided_at: string;
  decision_origin: typeof POST_V4_CONTRACT_DECISION_ORIGIN;
  /** Required only for frozen-V4 replication; forbidden on new-methodology decisions. */
  research_version?: number;
  contract_identity?: string;
  contract_frozen_at?: string;
  confirmation_start?: string;
}

export interface PostV4ContractDecisionRecord {
  decision_version: number;
  decision_path: PostV4ContractDecisionPath;
  decided_at: string;
  decision_origin: typeof POST_V4_CONTRACT_DECISION_ORIGIN;
  replication_draft: PostV4ReplicationContractDraft | null;
  accepted: false;
  research_run_authorized: false;
  executable: false;
}

export type BuildPostV4ContractDecisionResult =
  | { built: true; record: PostV4ContractDecisionRecord; record_hash: string; reasons: [] }
  | { built: false; record: null; record_hash: null; reasons: string[] };

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const instant = (v: unknown): number | null =>
  typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;

export function postV4ContractDecisionPayload(record: PostV4ContractDecisionRecord) {
  return [
    "ron_post_v4_contract_decision", RON_POST_V4_CONTRACT_DECISION_VERSION,
    "decision_version", record.decision_version,
    "decision_path", record.decision_path,
    "decided_at", record.decided_at,
    "decision_origin", record.decision_origin,
    "replication_artifact_id", record.replication_draft?.candidate_artifact.artifact_id ?? null,
    "replication_claim", record.replication_draft?.claim ?? null,
    "accepted", record.accepted,
    "research_run_authorized", record.research_run_authorized,
    "executable", record.executable,
  ];
}

export async function postV4ContractDecisionHash(record: PostV4ContractDecisionRecord) {
  return await sha256(postV4ContractDecisionPayload(record));
}

/**
 * Build a deterministic, UNACCEPTED decision record.
 *
 * For frozen-V4 replication, the contract freeze cannot predate the audited decision and
 * the existing 2D.2u constructor performs the remaining fail-closed contract validation.
 * For a new-methodology decision, replication-only fields are forbidden so no shadow
 * contract can be smuggled through this governance record.
 */
export async function buildPostV4ContractDecisionRecord(
  input: PostV4ContractDecisionInput,
): Promise<BuildPostV4ContractDecisionResult> {
  if (!input || typeof input !== "object") {
    return { built: false, record: null, record_hash: null, reasons: ["missing_input"] };
  }

  const reasons: string[] = [];
  if (!POST_V4_CONTRACT_DECISION_PATHS.includes(input.decision_path)) {
    reasons.push("unsupported_decision_path");
  }
  if (input.decision_origin !== POST_V4_CONTRACT_DECISION_ORIGIN) {
    reasons.push("decision_origin_not_audited_source_change");
  }
  const decidedAt = instant(input.decided_at);
  if (decidedAt == null) reasons.push("missing_or_malformed_decided_at");

  let replicationDraft: PostV4ReplicationContractDraft | null = null;

  if (input.decision_path === POST_V4_REPLICATION_METHODOLOGY_SOURCE) {
    const frozenAt = instant(input.contract_frozen_at);
    if (frozenAt == null) reasons.push("missing_or_malformed_contract_frozen_at");
    if (decidedAt != null && frozenAt != null && frozenAt < decidedAt) {
      reasons.push("contract_freeze_predates_audited_decision");
    }
    if (reasons.length === 0) {
      const draft = await buildPostV4ReplicationContractDraft({
        research_version: input.research_version as number,
        contract_identity: input.contract_identity as string,
        contract_frozen_at: input.contract_frozen_at as string,
        confirmation_start: input.confirmation_start as string,
        methodology_source: POST_V4_REPLICATION_METHODOLOGY_SOURCE,
      });
      if (!draft.built) {
        reasons.push(...draft.reasons.map((r) => `replication_contract: ${r}`));
      } else {
        replicationDraft = draft.draft;
      }
    }
  } else if (input.decision_path === "new_methodology_required") {
    if (input.research_version !== undefined
      || input.contract_identity !== undefined
      || input.contract_frozen_at !== undefined
      || input.confirmation_start !== undefined) {
      reasons.push("replication_fields_forbidden_for_new_methodology_decision");
    }
  }

  if (reasons.length > 0) {
    return { built: false, record: null, record_hash: null, reasons };
  }

  const record: PostV4ContractDecisionRecord = {
    decision_version: RON_POST_V4_CONTRACT_DECISION_VERSION,
    decision_path: input.decision_path,
    decided_at: input.decided_at,
    decision_origin: input.decision_origin,
    replication_draft: replicationDraft,
    accepted: false,
    research_run_authorized: false,
    executable: false,
  };

  return {
    built: true,
    record,
    record_hash: await postV4ContractDecisionHash(record),
    reasons: [],
  };
}
