/**
 * RON implementation marker 2D.3b — CURRENT POST-V4 GOVERNANCE PATH DECISION.
 *
 * Pure source-of-record only. No runtime I/O, no persistence, no registry mutation,
 * no research execution, no probability, no promotion, no execution authority.
 *
 * WHAT THIS IS
 * ------------
 * The immutable, audited production decision that the post-V4 path is
 * `new_methodology_required`. It resolves ONLY the governance-path ambiguity
 * previously flagged by `ron-post-v4-contract-decision.ts`.
 *
 * WHAT THIS IS NOT
 * ----------------
 *   - NOT an accepted research contract
 *   - NOT Research V5 (or any post-V4 run) authorization
 *   - NOT promotion of any state variable
 *   - NOT probability/calibration publication
 *   - NOT opportunity-risk construction
 *   - NOT execution authority
 *   - NOT causal or statistical evidence of anything
 *
 * The next step requires SEPARATELY AUDITED METHODOLOGY DESIGN, not a research run.
 */
import {
  POST_V4_CONTRACT_DECISION_ORIGIN,
  buildPostV4ContractDecisionRecord,
  type BuildPostV4ContractDecisionResult,
  type PostV4ContractDecisionInput,
} from "./ron-post-v4-contract-decision.ts";

export const RON_POST_V4_GOVERNANCE_DECISION_VERSION = 1;

/** Immutable audited decision input. Replication-only fields are intentionally absent. */
export const CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT: PostV4ContractDecisionInput = Object.freeze({
  decision_path: "new_methodology_required",
  decided_at: "2026-08-15T12:00:00Z",
  decision_origin: POST_V4_CONTRACT_DECISION_ORIGIN,
});

/**
 * Methodology-design decisions that remain intentionally UNRESOLVED and BLOCKED.
 * Mirrors the prior audit exactly. None of these may be invented by this module.
 */
export const POST_V4_REMAINING_METHODOLOGY_BLOCKERS: readonly string[] = Object.freeze([
  "contract_identity",
  "contract_frozen_at_and_spec_frozen_at",
  "confirmation_start_boundary",
  "frozen_spec_surface_hashes",
  "discovery_window_and_source_identity",
  "candidate_universe_and_state_variables",
  "fold_design_and_sample_sufficiency_parameters",
  "power_mde_and_significance_thresholds",
  "confirmation_source_identity",
  "gate_definitions",
]);

export interface CurrentPostV4GovernanceDecision {
  governance_version: number;
  decision: BuildPostV4ContractDecisionResult;
  decision_path: "new_methodology_required";
  decided_at: string;
  accepted: false;
  research_run_authorized: false;
  executable: false;
  next_step: "separately_audited_methodology_design";
  next_step_is_research_run: false;
  remaining_blockers: readonly string[];
  non_claims: readonly string[];
}

export const POST_V4_GOVERNANCE_NON_CLAIMS: readonly string[] = Object.freeze([
  "not_an_accepted_research_contract",
  "not_research_v5_authorization",
  "not_a_promotion",
  "not_probability_or_calibration_publication",
  "not_opportunity_risk_construction",
  "not_execution_authorization",
  "not_causal_or_statistical_evidence",
]);

/** Deterministic, pure. Returns the immutable decision state and explicit blockers. */
export async function currentPostV4GovernanceDecision(): Promise<CurrentPostV4GovernanceDecision> {
  const decision = await buildPostV4ContractDecisionRecord({
    ...CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT,
  });

  return {
    governance_version: RON_POST_V4_GOVERNANCE_DECISION_VERSION,
    decision,
    decision_path: "new_methodology_required",
    decided_at: CURRENT_POST_V4_GOVERNANCE_DECISION_INPUT.decided_at,
    accepted: false,
    research_run_authorized: false,
    executable: false,
    next_step: "separately_audited_methodology_design",
    next_step_is_research_run: false,
    remaining_blockers: POST_V4_REMAINING_METHODOLOGY_BLOCKERS,
    non_claims: POST_V4_GOVERNANCE_NON_CLAIMS,
  };
}

/** Canonical hash of the current audited governance decision record. */
export async function currentPostV4GovernanceDecisionHash(): Promise<string | null> {
  const state = await currentPostV4GovernanceDecision();
  return state.decision.built ? state.decision.record_hash : null;
}
