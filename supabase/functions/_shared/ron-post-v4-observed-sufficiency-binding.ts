/**
 * RON implementation marker 2D.3a — OBSERVED-DATA BINDING FOR POST-V4 CONFIRMATORY
 * SUFFICIENCY CLAIMS.
 *
 * Pure contract only. No I/O, no database, no persistence, no registry mutation, no
 * research execution, no probability, no promotion, no order placement, no live execution.
 * NO NEW NUMERIC CONSTANT AND NO NEW METHODOLOGICAL SEMANTIC IS INTRODUCED HERE.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * The accepted 2D.2q sufficiency contract validates a claim's INTERNAL admissibility, and
 * the accepted 2D.2r readiness gate validates cross-consistency between the acceptance and
 * sufficiency claims. Neither binds the claim to anything actually OBSERVED: today a claim
 * may assert confirmatory observation counts and a confirmation window that no read-only
 * 2D.2y observation supports. This module makes an observed post-freeze data-readiness
 * summary the ONLY admissible origin of those asserted values.
 *
 * WHAT IS DERIVED (never invented)
 * --------------------------------
 *   - confirmatory_observations_per_direction  <- observation.eligible_observations
 *   - confirmation_window                      <- observation.confirmation_start/effective_end
 *   - purge_minutes                            <- ron-research.ts:PURGE_MINUTES
 *   - holdout_fraction                         <- ron-research-v3.ts:HOLDOUT_FRACTION
 *   - procedure_version / procedure_hash       <- accepted 2D.2q procedure identity
 * Everything else (contract identity, freeze boundary, discovery window, source identity,
 * contamination facts, acceptance origin) must be supplied EXPLICITLY by the audited caller
 * and is never fabricated — in particular this module never asserts on the caller's behalf
 * that confirmation data was uncontaminated by selection or tuning.
 *
 * WHAT A BUILT ARTIFACT IS NOT
 * ----------------------------
 * Not an accepted research contract, not statistical power/MDE/significance, not a research
 * result, not permission to execute research, not a probability, not a promotion, and not
 * permission for trading or order execution.
 */
import { sha256 } from "./ron-calibration.ts";
import { MIN_TEST_OBS_PER_FOLD, PURGE_MINUTES } from "./ron-research.ts";
import { HOLDOUT_FRACTION } from "./ron-research-v3.ts";
import { RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";
import {
  CONFIRMATORY_DIRECTIONS,
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  buildConfirmatorySampleSufficiencyBinding,
  confirmatorySampleSufficiencyClaimHash,
  validateConfirmatorySampleSufficiency,
  type ConfirmatorySampleSufficiencyBinding,
  type ConfirmatorySampleSufficiencyClaim,
  type ConfirmatoryWindow,
} from "./ron-confirmatory-sample-sufficiency.ts";
import {
  RON_POST_V4_DATA_READINESS_VERSION,
  type PostV4DataReadinessSummary,
} from "./ron-post-v4-data-readiness.ts";

export const RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION = 1;

export const POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY = {
  binding_version: RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION,
  default_decision: "deny",
  new_numeric_constants_introduced: 0,
  new_methodological_semantics_introduced: 0,
  observation_source: "ron-post-v4-data-readiness.ts:summarizePostV4DataReadiness",
  accepted_observation_version: RON_POST_V4_DATA_READINESS_VERSION,
  accepted_sufficiency_procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  accepted_sufficiency_procedure_hash: CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  inherited_minimum_per_direction: MIN_TEST_OBS_PER_FOLD,
  inherited_purge_minutes: PURGE_MINUTES,
  inherited_holdout_fraction: HOLDOUT_FRACTION,
  min_research_version: RESEARCH_VERSION_V4 + 1,
  requires_zero_continuity_splitting_defects: true,
  contamination_facts_derived_by_this_module: false,
  accepted_by_this_module: false,
  registry_mutated_by_this_module: false,
  persisted_by_this_module: false,
  research_run_authorized_by_this_module: false,
  probability_created_by_this_module: false,
  promotion_created_by_this_module: false,
  execution_path: "signal_only",
  allow_live_execution: false,
  non_claims: [
    "not_statistical_power",
    "not_minimum_detectable_effect",
    "not_significance",
    "not_a_research_result",
    "not_an_accepted_research_contract",
    "not_permission_to_execute_research",
    "not_a_probability",
    "not_a_promotion",
    "not_permission_for_trading_or_order_execution",
  ],
} as const;

/* ------------------------------------------------------------- observations */

export function postV4ObservationPayload(observation: PostV4DataReadinessSummary) {
  const counts = observation?.eligible_observations ?? { long: null, short: null };
  const exclusions = observation?.exclusions ?? {};
  return [
    "ron_post_v4_data_readiness_observation", RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION,
    "summary_version", observation?.summary_version ?? null,
    "confirmation_start", observation?.confirmation_start ?? null,
    "effective_end", observation?.effective_end ?? null,
    "source_as_of", observation?.source_as_of ?? null,
    "source_bar_cutoff", observation?.source_bar_cutoff ?? null,
    "inherited_minimum_per_direction", observation?.inherited_minimum_per_direction ?? null,
    "eligible_observations", [["long", counts.long ?? null], ["short", counts.short ?? null]],
    "feature_grid_bars", observation?.feature_grid_bars ?? null,
    "continuity", [
      observation?.continuity?.defects ?? null,
      observation?.continuity?.splitting_defects ?? null,
    ],
    "exclusions", Object.keys(exclusions).sort()
      .map((k) => [k, (exclusions as Record<string, unknown>)[k]]),
    "meaning", observation?.meaning ?? null,
  ];
}

export async function postV4ObservationHash(observation: PostV4DataReadinessSummary) {
  return await sha256(postV4ObservationPayload(observation));
}

export interface ObservationValidation { admissible: boolean; reasons: string[] }

/** Deny-by-default structural validation of a read-only 2D.2y observation. */
export function validatePostV4Observation(
  observation: PostV4DataReadinessSummary | undefined | null,
): ObservationValidation {
  if (!observation || typeof observation !== "object") {
    return { admissible: false, reasons: ["missing_observation"] };
  }
  const reasons: string[] = [];
  if (observation.summary_version !== RON_POST_V4_DATA_READINESS_VERSION) {
    reasons.push("observation_summary_version_mismatch");
  }
  if (observation.inherited_minimum_per_direction !== MIN_TEST_OBS_PER_FOLD) {
    reasons.push("observation_minimum_not_inherited");
  }
  for (const d of CONFIRMATORY_DIRECTIONS) {
    const n = (observation.eligible_observations as Record<string, unknown> | undefined)?.[d];
    if (!Number.isInteger(n) || (n as number) < 0) {
      reasons.push(`observation_missing_or_malformed_eligible_observations: ${d}`);
    } else if ((n as number) < MIN_TEST_OBS_PER_FOLD) {
      reasons.push(`observation_below_inherited_minimum: ${d}`);
    }
  }
  if (observation.minimum_viability?.both_directions !== true) {
    reasons.push("observation_minimum_viability_not_met_in_both_directions");
  }
  if (!Number.isInteger(observation.continuity?.splitting_defects)
    || observation.continuity.splitting_defects !== 0) {
    reasons.push("observation_continuity_splitting_defects_present");
  }
  if (observation.research_run_authorized !== false || observation.executable !== false) {
    reasons.push("observation_carries_authority_it_must_not_carry");
  }
  return { admissible: reasons.length === 0, reasons };
}

/* ---------------------------------------------------------------- derivation */

export interface ObservedSufficiencyDerivationInput {
  observation: PostV4DataReadinessSummary;
  research_version: number;
  contract_identity: string;
  spec_frozen_at: string;
  discovery_window: ConfirmatoryWindow;
  confirmation_source_identity: string;
  /** Supplied by the audited caller. Never derived, never assumed false. */
  confirmation_used_for_selection: boolean;
  confirmation_used_for_tuning: boolean;
  acceptance_origin: string;
}

/**
 * Compose a sufficiency claim whose observed fields come ONLY from the observation.
 * The claim is returned unvalidated; admissibility is decided by the accepted 2D.2q
 * procedure in `buildObservedSufficiencyBinding`.
 */
export function deriveConfirmatorySampleSufficiencyClaimFromObservation(
  input: ObservedSufficiencyDerivationInput,
): ConfirmatorySampleSufficiencyClaim {
  return {
    procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
    procedure_hash: CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
    research_version: input.research_version,
    contract_identity: input.contract_identity,
    spec_frozen_at: input.spec_frozen_at,
    discovery_window: {
      start: input.discovery_window?.start,
      end: input.discovery_window?.end,
    },
    confirmation_window: {
      start: input.observation?.confirmation_start,
      end: input.observation?.effective_end,
    },
    confirmation_source_identity: input.confirmation_source_identity,
    purge_minutes: PURGE_MINUTES,
    holdout_fraction: HOLDOUT_FRACTION,
    confirmatory_observations_per_direction: {
      long: input.observation?.eligible_observations?.long,
      short: input.observation?.eligible_observations?.short,
    },
    confirmation_used_for_selection: input.confirmation_used_for_selection,
    confirmation_used_for_tuning: input.confirmation_used_for_tuning,
    acceptance_origin: input.acceptance_origin,
  };
}

/**
 * Deny-by-default check that an already-authored claim agrees EXACTLY with what was
 * observed. Any disagreement fails closed — the observation always wins.
 */
export function validateSufficiencyClaimAgainstObservation(
  claim: ConfirmatorySampleSufficiencyClaim | undefined | null,
  observation: PostV4DataReadinessSummary | undefined | null,
): ObservationValidation {
  const obs = validatePostV4Observation(observation);
  if (!obs.admissible) return obs;
  if (!claim || typeof claim !== "object") {
    return { admissible: false, reasons: ["missing_claim"] };
  }
  const o = observation as PostV4DataReadinessSummary;
  const reasons: string[] = [];
  if (claim.confirmation_window?.start !== o.confirmation_start) {
    reasons.push("confirmation_window_start_does_not_match_observation");
  }
  if (claim.confirmation_window?.end !== o.effective_end) {
    reasons.push("confirmation_window_end_does_not_match_observation");
  }
  for (const d of CONFIRMATORY_DIRECTIONS) {
    const claimed = (claim.confirmatory_observations_per_direction as
      Record<string, unknown> | undefined)?.[d];
    const seen = (o.eligible_observations as unknown as Record<string, number>)[d];
    if (claimed !== seen) {
      reasons.push(`confirmatory_observations_do_not_match_observation: ${d}`);
    }
  }
  return { admissible: reasons.length === 0, reasons };
}

/* ------------------------------------------------------------------ artifact */

export interface ObservedSufficiencyBindingArtifact {
  binding_version: number;
  observation_hash: string;
  claim: ConfirmatorySampleSufficiencyClaim;
  claim_hash: string;
  sufficiency_binding: ConfirmatorySampleSufficiencyBinding;
  observation_bound: true;
  accepted: false;
  research_run_authorized: false;
  executable: false;
  non_claims: readonly string[];
}

export type BuildObservedSufficiencyBindingResult =
  | { built: true; artifact: ObservedSufficiencyBindingArtifact; reasons: [] }
  | { built: false; artifact: null; reasons: string[] };

/**
 * The ONLY admissible way to mint an observation-bound sufficiency binding.
 * Fails closed on an inadmissible observation, a claim that disagrees with it, or a claim
 * the accepted 2D.2q procedure rejects.
 */
export async function buildObservedSufficiencyBinding(
  input: ObservedSufficiencyDerivationInput,
): Promise<BuildObservedSufficiencyBindingResult> {
  if (!input || typeof input !== "object") {
    return { built: false, artifact: null, reasons: ["missing_input"] };
  }
  const obs = validatePostV4Observation(input.observation);
  if (!obs.admissible) {
    return { built: false, artifact: null, reasons: obs.reasons.map((r) => `observation: ${r}`) };
  }

  const claim = deriveConfirmatorySampleSufficiencyClaimFromObservation(input);

  const agreement = validateSufficiencyClaimAgainstObservation(claim, input.observation);
  if (!agreement.admissible) {
    return {
      built: false,
      artifact: null,
      reasons: agreement.reasons.map((r) => `observation_binding: ${r}`),
    };
  }

  const admissibility = validateConfirmatorySampleSufficiency(claim);
  if (!admissibility.admissible) {
    return {
      built: false,
      artifact: null,
      reasons: admissibility.reasons.map((r) => `sufficiency_claim: ${r}`),
    };
  }

  const built = await buildConfirmatorySampleSufficiencyBinding(claim);
  if (!built.built) {
    return {
      built: false,
      artifact: null,
      reasons: built.reasons.map((r) => `sufficiency_binding: ${r}`),
    };
  }

  return {
    built: true,
    reasons: [],
    artifact: {
      binding_version: RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION,
      observation_hash: await postV4ObservationHash(input.observation),
      claim,
      claim_hash: await confirmatorySampleSufficiencyClaimHash(claim),
      sufficiency_binding: built.binding,
      observation_bound: true,
      accepted: false,
      research_run_authorized: false,
      executable: false,
      non_claims: POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY.non_claims,
    },
  };
}

export function observedSufficiencyBindingPolicyPayload() {
  const p = POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY as Record<string, unknown>;
  return [
    "ron_post_v4_observed_sufficiency_binding",
    RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION,
    "policy", Object.keys(p).sort().map((k) => [
      k, Array.isArray(p[k]) ? [...(p[k] as unknown[])].map(String).sort() : p[k],
    ]),
  ];
}

export async function observedSufficiencyBindingPolicyHash() {
  return await sha256(observedSufficiencyBindingPolicyPayload());
}
