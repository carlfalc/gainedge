/**
 * RON implementation marker 2D.2r — POST-V4 RESEARCH HANDOFF / PREREGISTRATION READINESS
 * GATE. Pure composition contract: no runtime behaviour, no I/O, no database, no deploy,
 * no probability, no execution, and NO NEW NUMERIC OR METHODOLOGICAL SEMANTIC.
 *
 * WHAT THIS IS
 * ------------
 * A deterministic, fail-closed preflight that answers exactly ONE structural question:
 *   "Do a hypothetical post-V4 research-contract acceptance claim (2D.2o/2D.2p) and its
 *    paired confirmatory sample-sufficiency claim (2D.2q) form a mutually consistent,
 *    fully bound pair that could be handed to an EXPLICIT, AUDITED acceptance/run step?"
 *
 * Every substantive check is DELEGATED to the already-accepted procedures:
 *   - `validateResearchContractAcceptance` / `validateResearchContractAcceptanceBinding`
 *     (frozen spec surfaces, freeze-before-confirmation, audited origin, contamination),
 *   - `validateConfirmatorySampleSufficiency` / `validateConfirmatorySampleSufficiencyBinding`
 *     (inherited PURGE_MINUTES, V3 HOLDOUT_FRACTION, MIN_TEST_OBS_PER_FOLD per direction,
 *      post-freeze/disjoint confirmation, final-confirmation-only role, fail-closed
 *      infeasibility, no selection/tuning contamination).
 * This module only adds CROSS-CONSISTENCY: same research_version, same contract_identity,
 * strictly newer than the frozen V4 negative, exact accepted procedure versions/hashes on
 * both sides, the confirmatory window cannot predate the contract's declared confirmation
 * start, and every binding must match its own claim. Nothing is duplicated or weakened.
 *
 * WHAT A PASS MEANS
 * -----------------
 * EXACTLY `structurally_ready_for_explicit_audited_handoff` — nothing else.
 *
 * WHAT A PASS IS NOT
 * ------------------
 * Not a promotion. Not research success. Not an accepted V5 contract. Not permission to
 * execute V5 or any research run. Not a calibrated probability. Not statistical power, MDE
 * or significance. Not permission for trading or order execution. Not a causal claim.
 *
 * Production is deliberately NOT ready because no post-V4 research-contract acceptance
 * artifact exists in `CURRENT_ACCEPTED_ARTIFACT_REGISTRY`. An empty promotion manifest is
 * expected before research succeeds and is NOT a prerequisite for beginning research.
 */
import { sha256 } from "./ron-calibration.ts";
import { RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";
import {
  RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  researchContractAcceptanceArtifactId,
  researchContractAcceptanceClaimHash,
  validateResearchContractAcceptance,
  validateResearchContractAcceptanceBinding,
  type ResearchContractAcceptanceBinding,
  type ResearchContractAcceptanceClaim,
} from "./ron-research-contract-acceptance.ts";
import {
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  confirmatorySampleSufficiencyClaimHash,
  validateConfirmatorySampleSufficiency,
  validateConfirmatorySampleSufficiencyBinding,
  type ConfirmatorySampleSufficiencyBinding,
  type ConfirmatorySampleSufficiencyClaim,
} from "./ron-confirmatory-sample-sufficiency.ts";
import {
  ACCEPTED_PROMOTION_MANIFEST,
  CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
  validateAcceptanceRegistry,
  type AcceptanceRegistry,
} from "./ron-promotion-readiness.ts";

export const RON_POST_V4_RESEARCH_READINESS_VERSION = 1;

/** The ONLY meaning a passing preflight carries. */
export const POST_V4_READINESS_MEANING = "structurally_ready_for_explicit_audited_handoff";

export const POST_V4_READINESS_NON_CLAIMS: readonly string[] = [
  "not_a_promotion",
  "not_research_success",
  "not_an_accepted_post_v4_research_contract",
  "not_permission_to_execute_a_post_v4_research_run",
  "not_a_calibrated_probability",
  "not_statistical_power",
  "not_minimum_detectable_effect_or_significance",
  "not_permission_for_trading_or_order_execution",
  "not_a_causal_claim",
] as const;

export const POST_V4_RESEARCH_READINESS_PROCEDURE = {
  procedure_version: RON_POST_V4_RESEARCH_READINESS_VERSION,
  default_decision: "deny",
  new_numeric_constants_introduced: 0,
  new_methodological_semantics_introduced: 0,
  composes: [
    "ron-research-contract-acceptance.ts:validateResearchContractAcceptance",
    "ron-research-contract-acceptance.ts:validateResearchContractAcceptanceBinding",
    "ron-confirmatory-sample-sufficiency.ts:validateConfirmatorySampleSufficiency",
    "ron-confirmatory-sample-sufficiency.ts:validateConfirmatorySampleSufficiencyBinding",
  ],
  cross_consistency_rules: [
    "same_research_version_on_both_sides",
    "same_contract_identity_on_both_sides",
    "research_version_strictly_after_frozen_negative",
    "exact_accepted_procedure_versions_and_hashes_on_both_sides",
    "confirmation_window_not_before_declared_confirmation_start",
    "each_binding_matches_its_own_validated_claim_hash",
  ],
  frozen_negative_research_version: RESEARCH_VERSION_V4,
  min_research_version: RESEARCH_VERSION_V4 + 1,
  accepted_acceptance_procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  accepted_acceptance_procedure_hash: RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
  accepted_sufficiency_procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  accepted_sufficiency_procedure_hash: CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  pass_meaning: POST_V4_READINESS_MEANING,
  does_not_mean: POST_V4_READINESS_NON_CLAIMS,
  execution_path: "signal_only",
  allow_live_execution: false,
} as const;

/* --------------------------------------------------------------- submission */

export interface PostV4ResearchHandoffSubmission {
  acceptance_claim: ResearchContractAcceptanceClaim;
  acceptance_binding: ResearchContractAcceptanceBinding;
  acceptance_artifact_id: string;
  sufficiency_claim: ConfirmatorySampleSufficiencyClaim;
  sufficiency_binding: ConfirmatorySampleSufficiencyBinding;
}

export interface PostV4ReadinessResult {
  ready: boolean;
  meaning: string;
  reasons: string[];
}

const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

/**
 * Deny-by-default structural preflight. Pure and async only because the accepted claim
 * hashes are SHA-256 derived. Never touches the network, the database or any runtime state.
 */
export async function evaluatePostV4ResearchHandoffReadiness(
  submission: PostV4ResearchHandoffSubmission,
): Promise<PostV4ReadinessResult> {
  const deny = (reasons: string[]): PostV4ReadinessResult =>
    ({ ready: false, meaning: POST_V4_READINESS_MEANING, reasons });

  if (!submission || typeof submission !== "object") return deny(["missing_submission"]);

  const reasons: string[] = [];
  const {
    acceptance_claim: ac, acceptance_binding: ab, acceptance_artifact_id: aid,
    sufficiency_claim: sc, sufficiency_binding: sb,
  } = submission;

  if (!ac || typeof ac !== "object") reasons.push("missing_acceptance_claim");
  if (!sc || typeof sc !== "object") reasons.push("missing_sufficiency_claim");
  if (!ab || typeof ab !== "object") reasons.push("missing_acceptance_binding");
  if (!sb || typeof sb !== "object") reasons.push("missing_sufficiency_binding");
  if (reasons.length > 0) return deny(reasons);

  // 1/2. Delegated, unmodified acceptance + sufficiency semantics.
  for (const r of validateResearchContractAcceptance(ac).reasons) {
    reasons.push(`acceptance_claim: ${r}`);
  }
  for (const r of validateConfirmatorySampleSufficiency(sc).reasons) {
    reasons.push(`sufficiency_claim: ${r}`);
  }
  if (!nonEmpty(aid)) reasons.push("missing_acceptance_artifact_id");
  for (const r of validateResearchContractAcceptanceBinding(ab, aid).reasons) {
    reasons.push(`acceptance_binding: ${r}`);
  }
  for (const r of validateConfirmatorySampleSufficiencyBinding(sb).reasons) {
    reasons.push(`sufficiency_binding: ${r}`);
  }

  // 5. Exact accepted procedure identity on both sides (explicit, not inferred).
  if (ac?.procedure_version !== RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION
    || ac?.procedure_hash !== RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH) {
    reasons.push("acceptance_procedure_identity_not_exactly_accepted");
  }
  if (sc?.procedure_version !== RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION
    || sc?.procedure_hash !== CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH) {
    reasons.push("sufficiency_procedure_identity_not_exactly_accepted");
  }

  // 3. Both sides must describe the SAME research contract.
  if (ac?.research_version !== sc?.research_version) {
    reasons.push("research_version_mismatch_between_acceptance_and_sufficiency");
  }
  if (ac?.contract_identity !== sc?.contract_identity) {
    reasons.push("contract_identity_mismatch_between_acceptance_and_sufficiency");
  }

  // The actual confirmatory window may begin at or after the contract's declared
  // confirmation start, never before it. Both underlying validators already require valid
  // ISO UTC timestamps, so this only adds cross-consistency between the two accepted claims.
  const declaredConfirmationStart = Date.parse(ac?.confirmation_start ?? "");
  const actualConfirmationStart = Date.parse(sc?.confirmation_window?.start ?? "");
  if (Number.isFinite(declaredConfirmationStart) && Number.isFinite(actualConfirmationStart)
    && actualConfirmationStart < declaredConfirmationStart) {
    reasons.push("confirmation_window_starts_before_declared_confirmation_start");
  }

  // 4. Strictly newer than the frozen V4 negative.
  if (!Number.isInteger(ac?.research_version)
    || (ac.research_version as number) <= RESEARCH_VERSION_V4) {
    reasons.push("research_version_not_after_frozen_negative_v4");
  }

  // Bindings must belong to the claims presented, not to some other claim.
  if (ab && ac && ab.claim_hash !== await researchContractAcceptanceClaimHash(ac)) {
    reasons.push("acceptance_binding_claim_hash_does_not_match_claim");
  }
  if (sb && sc && sb.claim_hash !== await confirmatorySampleSufficiencyClaimHash(sc)) {
    reasons.push("sufficiency_binding_claim_hash_does_not_match_claim");
  }
  if (ab && ac && (ab.research_version !== ac.research_version
    || ab.contract_identity !== ac.contract_identity
    || ab.contract_frozen_at !== ac.contract_frozen_at)) {
    reasons.push("acceptance_binding_identity_does_not_match_claim");
  }
  if (sb && sc && (sb.research_version !== sc.research_version
    || sb.contract_identity !== sc.contract_identity)) {
    reasons.push("sufficiency_binding_identity_does_not_match_claim");
  }
  if (ab && aid && reasons.length === 0 && aid !== researchContractAcceptanceArtifactId(ab)) {
    reasons.push("acceptance_artifact_id_not_derived_from_binding");
  }

  return { ready: reasons.length === 0, meaning: POST_V4_READINESS_MEANING, reasons };
}

/* ----------------------------------------------------------------- payloads */

/** Canonical, key-order-independent payload of the procedure itself. */
export function postV4ResearchReadinessPayload() {
  const p = POST_V4_RESEARCH_READINESS_PROCEDURE as Record<string, unknown>;
  return [
    "ron_post_v4_research_readiness_version", RON_POST_V4_RESEARCH_READINESS_VERSION,
    "procedure", Object.keys(p).sort().map((k) => [
      k, Array.isArray(p[k]) ? [...(p[k] as unknown[])].map(String).sort() : p[k],
    ]),
  ];
}

export async function postV4ResearchReadinessHash() {
  return await sha256(postV4ResearchReadinessPayload());
}

/**
 * Canonical, deterministic, input-order-independent readiness payload for a SUBMISSION.
 * Binds readiness-relevant identity: the readiness procedure itself, both validated claim
 * hashes, the two accepted procedure identities, the shared contract identity/version and
 * the outcome. No probability, execution, user or private field is included.
 */
export async function postV4ReadinessSubmissionPayload(
  submission: PostV4ResearchHandoffSubmission,
) {
  const result = await evaluatePostV4ResearchHandoffReadiness(submission);
  return [
    "ron_post_v4_readiness_submission", RON_POST_V4_RESEARCH_READINESS_VERSION,
    "readiness_procedure_version", RON_POST_V4_RESEARCH_READINESS_VERSION,
    "readiness_procedure_hash", await postV4ResearchReadinessHash(),
    "acceptance_claim_hash",
    submission?.acceptance_claim
      ? await researchContractAcceptanceClaimHash(submission.acceptance_claim) : null,
    "acceptance_procedure_version", submission?.acceptance_claim?.procedure_version ?? null,
    "acceptance_procedure_hash", submission?.acceptance_claim?.procedure_hash ?? null,
    "sufficiency_claim_hash",
    submission?.sufficiency_claim
      ? await confirmatorySampleSufficiencyClaimHash(submission.sufficiency_claim) : null,
    "sufficiency_procedure_version", submission?.sufficiency_claim?.procedure_version ?? null,
    "sufficiency_procedure_hash", submission?.sufficiency_claim?.procedure_hash ?? null,
    "research_version", submission?.acceptance_claim?.research_version ?? null,
    "contract_identity", submission?.acceptance_claim?.contract_identity ?? null,
    "acceptance_artifact_id", submission?.acceptance_artifact_id ?? null,
    "ready", result.ready,
    "meaning", result.meaning,
    "reasons", [...result.reasons].sort(),
  ];
}

export async function postV4ReadinessSubmissionHash(
  submission: PostV4ResearchHandoffSubmission,
) {
  return await sha256(await postV4ReadinessSubmissionPayload(submission));
}

/* ------------------------------------------------------ production statement */

export interface ProductionPostV4Readiness {
  ready: boolean;
  reasons: string[];
  accepted_research_contract_artifacts: number;
  accepted_promotion_entries: number;
}

/**
 * The production answer, derived (never asserted) from the accepted registry.
 * Production is NOT ready for a post-V4 research handoff until the registry itself is valid
 * and at least one accepted post-V4 research-contract artifact exists. Promotion state is
 * reported for observability only and is deliberately NOT a readiness prerequisite.
 */
export function productionPostV4Readiness(
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
): ProductionPostV4Readiness {
  const registryCheck = validateAcceptanceRegistry(registry);
  const reasons: string[] = [];
  if (!registryCheck.admissible) {
    for (const r of registryCheck.reasons) reasons.push(`invalid_acceptance_registry: ${r}`);
  }
  const accepted = registryCheck.admissible
    ? registry.artifacts.filter((a) => a.artifact_kind === "research_contract_acceptance").length
    : 0;
  if (registryCheck.admissible && accepted === 0) {
    reasons.push("no_accepted_post_v4_research_contract_artifact");
  }
  return {
    ready: registryCheck.admissible && accepted > 0,
    reasons,
    accepted_research_contract_artifacts: accepted,
    accepted_promotion_entries: ACCEPTED_PROMOTION_MANIFEST.length,
  };
}
