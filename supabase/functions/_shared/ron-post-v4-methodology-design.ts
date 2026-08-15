/**
 * RON implementation marker 2D.3c — POST-V4 METHODOLOGY DESIGN SPEC (DESIGN ONLY).
 *
 * Authorized by the frozen governance decision `new_methodology_required`
 * (`ron-post-v4-governance-decision.ts`). This module is a PURE, CANONICAL, HASHABLE
 * description of a PROPOSED post-V4 methodology. It performs no I/O, touches no registry,
 * promotes nothing, authorizes no run and publishes no probability.
 *
 * WHY A NEW HYPOTHESIS CLASS (audit-grounded)
 * -------------------------------------------
 * V2/V3/V4 all draw candidates from the SAME finite space: single or paired STATIC
 * `RON_STATE_SPEC_V2` buckets read from ONE anchor snapshot (`SINGLE_CANDIDATES`,
 * `PAIR_CANDIDATES`). Research V3 returned a valid NEGATIVE result over that space, and
 * V4 changed only the FRAMEWORK (continuity source, boundary mapping, two-stage gate) —
 * not the hypothesis space. Re-running the identical static-bucket space under a stricter
 * gate cannot plausibly change the conclusion; renaming those buckets would be worse.
 *
 * The smallest materially different hypothesis class that is still fully derivable from
 * ALREADY-ACCEPTED data is the FIRST DIFFERENCE of the accepted state vector: how the
 * state ARRIVED at the anchor, not only what it is. Every V5 variable is a deterministic
 * function of two accepted state vectors (anchor t and anchor t-k) on the accepted
 * feature grid. No new indicator, no external data, no news/macro, no fitted threshold.
 */
import { ADX_BUCKET_SPEC, round6, sha256 } from "./ron-calibration.ts";
import {
  NEAREST_LEVEL_ATR_BANDS_V2, POSITION_DAY_BANDS_V2, RELATIVE_VOLUME_BANDS_V2,
  RON_STATE_SPEC_VERSION_V2, RON_STATE_VARIABLES, RSI_ZONE_BANDS_V2, STOCH_ZONE_BANDS_V2,
  UNAVAILABLE, UNKNOWN, stateSpecPayloadV2, type IntervalBand, type RonStateVector,
} from "./ron-state-spec.ts";
import {
  BUCKET_EVIDENCE, FLOOR_PAIR, FLOOR_SINGLE, INITIAL_TRAIN_FRACTION, LOGLOSS_CLIP,
  MIN_TEST_OBS_PER_FOLD, PROMOTION_GATE, PURGE_MINUTES, REQUESTED_FOLDS,
} from "./ron-research.ts";
import { HOLDOUT_FRACTION, SOURCE_BAR_MINUTES } from "./ron-research-v3.ts";
import {
  CONTINUITY_BOUNDARY_MAPPING, CONTINUITY_SOURCE_SPEC, PROMOTION_GATE_V4,
  RESEARCH_VERSION_V4, continuityContractPayloadV4, promotionGatePayloadV4,
} from "./ron-research-v4.ts";
import { RON_VENUE_CALENDAR_VERSION_V2, venueCalendarPayloadV2 } from "./ron-venue-calendar-v2.ts";
import { CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE } from "./ron-confirmatory-sample-sufficiency.ts";

export const RON_POST_V4_METHODOLOGY_DESIGN_VERSION = 1;
/** The research version this design WOULD target if (and only if) it were ever accepted. */
export const PROPOSED_RESEARCH_VERSION = RESEARCH_VERSION_V4 + 1;

/* ===================================================== transition alphabet */

/**
 * Lookback in BARS. NOT a new constant: PURGE_MINUTES (60, the accepted outcome-horizon
 * and embargo width) divided by SOURCE_BAR_MINUTES (15, the accepted grid width). The
 * state difference therefore spans exactly one accepted outcome horizon.
 */
export const LOOKBACK_BARS = PURGE_MINUTES / SOURCE_BAR_MINUTES;
export const LOOKBACK_MINUTES = PURGE_MINUTES;

/** Ordered (ordinal) accepted state variables — first difference has a SIGN. */
export const ORDINAL_STATE_VARIABLES: readonly string[] = Object.freeze([
  "adx_bucket",
  "nearest_level_atr_bucket",
  "position_day_bucket",
  "relative_volume_bucket",
  "rsi_zone",
  "stoch_zone",
]);

/** Unordered (nominal) accepted state variables — first difference is same/changed only. */
export const NOMINAL_STATE_VARIABLES: readonly string[] = Object.freeze([
  "di_dominance",
  "ema_stack",
  "ha_state",
  "macd_state",
  "regime",
  "structure_bias",
]);

/**
 * Ordinal level orders. These are NOT new thresholds: they are the declaration order of
 * the already-frozen `RON_STATE_SPEC_V2` bands, reused verbatim.
 */
const labelsOf = (bands: readonly IntervalBand[]) => Object.freeze(bands.map((b) => b.label));

export const ORDINAL_LEVEL_ORDER: Readonly<Record<string, readonly string[]>> = Object.freeze({
  adx_bucket: Object.freeze(ADX_BUCKET_SPEC.bands.map((b) => b.label)),
  nearest_level_atr_bucket: labelsOf(NEAREST_LEVEL_ATR_BANDS_V2),
  position_day_bucket: labelsOf(POSITION_DAY_BANDS_V2),
  relative_volume_bucket: labelsOf(RELATIVE_VOLUME_BANDS_V2),
  rsi_zone: labelsOf(RSI_ZONE_BANDS_V2),
  stoch_zone: labelsOf(STOCH_ZONE_BANDS_V2),
});

export const ORDINAL_TRANSITION_LABELS: readonly string[] =
  Object.freeze(["down", "flat", "up", UNAVAILABLE]);
export const NOMINAL_TRANSITION_LABELS: readonly string[] =
  Object.freeze(["same", "changed", UNAVAILABLE]);

/** Non-informative level labels that can never participate in a transition. */
const OPAQUE = new Set<string>([UNKNOWN, UNAVAILABLE]);

/**
 * Deterministic first difference of ONE accepted state variable. Data-independent: sign
 * of an ordinal index change with zero tolerance, or plain label equality. Any opaque or
 * unmapped level, or a missing/ineligible lookback anchor, yields `unavailable` — never
 * an imputed value.
 */
export function deriveTransition(
  variable: string,
  now: string | null | undefined,
  past: string | null | undefined,
): string {
  if (typeof now !== "string" || typeof past !== "string") return UNAVAILABLE;
  if (OPAQUE.has(now) || OPAQUE.has(past)) return UNAVAILABLE;
  if (NOMINAL_STATE_VARIABLES.includes(variable)) return now === past ? "same" : "changed";
  const order = ORDINAL_LEVEL_ORDER[variable];
  if (!order) return UNAVAILABLE;
  const a = order.indexOf(past), b = order.indexOf(now);
  if (a < 0 || b < 0) return UNAVAILABLE;
  return b > a ? "up" : b < a ? "down" : "flat";
}

export const TRANSITION_PREFIX = "d_";
export const transitionVariableName = (v: string) => `${TRANSITION_PREFIX}${v}`;

/** Every transition variable, in deterministic (ordinal-then-nominal, alphabetical) order. */
export const TRANSITION_VARIABLES: readonly string[] = Object.freeze(
  [...ORDINAL_STATE_VARIABLES, ...NOMINAL_STATE_VARIABLES].map(transitionVariableName),
);

export interface TransitionDerivationInput {
  /** Accepted V2 state vector at the anchor. */
  now: RonStateVector;
  /**
   * Accepted V2 state vector at anchor `t - LOOKBACK_BARS` bars. MUST be null when that
   * anchor is absent from the accepted eligible grid or is separated from the anchor by a
   * continuity defect. Callers may not substitute a nearer bar.
   */
  past: RonStateVector | null;
}

/** Pure. Produces exactly `TRANSITION_VARIABLES`, fail-closed to `unavailable`. */
export function deriveTransitionVector(input: TransitionDerivationInput): RonStateVector {
  const out: RonStateVector = {};
  for (const base of [...ORDINAL_STATE_VARIABLES, ...NOMINAL_STATE_VARIABLES]) {
    out[transitionVariableName(base)] = input.past
      ? deriveTransition(base, input.now?.[base], input.past?.[base])
      : UNAVAILABLE;
  }
  return out;
}

/* ======================================================= candidate universe */

export type ProposedCandidateKind = "transition_single" | "level_transition_pair";

export interface ProposedCandidate {
  name: string;
  kind: ProposedCandidateKind;
  variables: readonly string[];
  /** Inherited accepted training-bucket support floor. */
  floor: number;
}

/**
 * FINITE and preregisterable: one single per transition variable, plus one interaction of
 * each transition variable with its OWN accepted static level (the minimal way to ask
 * "does the change matter given where we are"). No cross-variable pair explosion.
 */
export const PROPOSED_CANDIDATES: readonly ProposedCandidate[] = Object.freeze(
  [...ORDINAL_STATE_VARIABLES, ...NOMINAL_STATE_VARIABLES].flatMap((base): ProposedCandidate[] => [
    {
      name: transitionVariableName(base),
      kind: "transition_single",
      variables: Object.freeze([transitionVariableName(base)]),
      floor: FLOOR_SINGLE,
    },
    {
      name: `${base}__${transitionVariableName(base)}`,
      kind: "level_transition_pair",
      variables: Object.freeze([base, transitionVariableName(base)]),
      floor: FLOOR_PAIR,
    },
  ]).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

/** Baseline is INHERITED unchanged so V5 stays directly comparable to V2/V3/V4. */
export const PROPOSED_BASELINE = Object.freeze({
  name: "baseline_hierarchy",
  inherited_from: "ron-research.ts:BASELINE_CANDIDATE",
});

export const PROPOSED_DIRECTIONS: readonly string[] = Object.freeze(["long", "short"]);

/** Total preregistered hypotheses = candidates x directions. Used by multiplicity control. */
export const HYPOTHESIS_COUNT = PROPOSED_CANDIDATES.length * PROPOSED_DIRECTIONS.length;

/* ================================================== leakage / data boundary */

export const LEAKAGE_BOUNDARIES = Object.freeze({
  anchor_information_cutoff: "anchor_bar_close_only",
  lookback_uses_future_bars: false,
  lookback_source: "accepted_eligible_feature_grid_only",
  lookback_gap_policy: "fail_closed_unavailable_never_nearest_bar",
  outcome_source: "label_version_7_barrier_outcome",
  outcome_never_used_in_any_feature: true,
  discovery_and_confirmation_disjoint: true,
  confirmation_role: PROMOTION_GATE_V4.holdout_role,
  purge_minutes: PURGE_MINUTES,
  bucket_rates_fit_on_training_block_only: true,
  mde_estimated_from_discovery_only: true,
});

/* ================================== folds / continuity / calendar inheritance */

export const STRUCTURE_INHERITANCE = Object.freeze({
  continuity_contract: "inherited_v4_unchanged",
  continuity_source: CONTINUITY_SOURCE_SPEC.identity,
  continuity_boundary_mapping: CONTINUITY_BOUNDARY_MAPPING,
  venue_calendar_version: RON_VENUE_CALENDAR_VERSION_V2,
  fold_construction: "inherited_buildVenueAwareFoldsV4_unchanged",
  requested_folds: REQUESTED_FOLDS,
  initial_train_fraction: INITIAL_TRAIN_FRACTION,
  holdout_fraction: HOLDOUT_FRACTION,
  min_test_obs_per_fold: MIN_TEST_OBS_PER_FOLD,
  purge_minutes: PURGE_MINUTES,
  logloss_clip: Object.freeze([LOGLOSS_CLIP.lo, LOGLOSS_CLIP.hi]),
  /** The ONLY structural change: eligibility now also requires a usable lookback anchor. */
  changed_rule: "anchor_eligibility_additionally_requires_a_defect_free_lookback_anchor",
  changed_rule_reason:
    "a first-difference variable is undefined without its lookback anchor; excluding those anchors is fail-closed and applied identically to both directions",
});

/* ================================================= outcome metric (inherited) */

export const OUTCOME_METRIC = Object.freeze({
  label_version: CONTINUITY_SOURCE_SPEC.label_version,
  primary: "barrier_success_indicator_per_direction",
  scoring_rule: "brier_score_vs_hierarchical_baseline",
  secondary_diagnostics: Object.freeze(["ece", "log_loss"]),
  directions_symmetric: true,
  asymmetry_permitted: false,
  asymmetry_reason: "no accepted source evidence supports direction-asymmetric treatment",
});

/* ============================== confirmatory statistical inference (NEW) ===== */

/**
 * Family-wise error control. Bonferroni over ALL preregistered candidate x direction
 * hypotheses, at the conventional two-sided 5% family-wise level. NEW methodological
 * choice (the accepted source contains no significance test at all). Bonferroni is chosen
 * over any adaptive procedure because it is deterministic, needs no data-dependent
 * ordering, and is the most conservative standard option.
 */
export const FAMILYWISE_ALPHA = 0.05;
export const TARGET_POWER = 0.80;

export const CONFIRMATORY_INFERENCE = Object.freeze({
  estimand: "mean_paired_per_observation_brier_difference_baseline_minus_candidate",
  paired: true,
  sign_convention: "positive_means_candidate_better",
  variance_estimator: "moving_block_bootstrap",
  /** Overlapping 60m labels on a 15m grid => dependence spans exactly LOOKBACK_BARS bars. */
  bootstrap_block_bars: LOOKBACK_BARS,
  bootstrap_block_justification: "inherited_purge_minutes_over_source_bar_minutes",
  /**
   * NEW methodological/computational constant. It is NOT derivable from any accepted
   * source rule, so it is ledgered in NEW_METHODOLOGY_CHOICES and requires explicit human
   * acceptance (see UNRESOLVED_ITEMS). It is not inherited.
   */
  bootstrap_resamples: 10000,
  bootstrap_resamples_provenance: "new_unaccepted_methodology_choice",
  bootstrap_seed_rule: "deterministic_seed_derived_from_the_frozen_contract_hash",
  test: "two_sided_studentized_paired_block_bootstrap",
  familywise_alpha: FAMILYWISE_ALPHA,
  multiplicity: "bonferroni",
  hypotheses: HYPOTHESIS_COUNT,
  /**
   * EXACT unrounded Bonferroni quotient. Rounding to fixed decimals could round UP and
   * break the family-wise guarantee (48 * 0.001042 = 0.050016 > 0.05), so no rounding is
   * applied here and any fixed-decimal serialisation MUST round DOWN.
   */
  per_hypothesis_alpha: FAMILYWISE_ALPHA / HYPOTHESIS_COUNT,
  per_hypothesis_alpha_rounding_rule: "exact_quotient_no_rounding_serialise_round_down_only",
  target_power: TARGET_POWER,
  /**
   * Prospective MDE, computed BEFORE the confirmation block is scored and using ONLY the
   * discovery-block dispersion of paired differences:
   *   n_eff = floor(n_confirm / bootstrap_block_bars)
   *   mde   = (z_{1-alpha_per_hypothesis/2} + z_{power}) * sd_discovery / sqrt(n_eff)
   * No empirical effect size is assumed or fabricated.
   */
  mde_formula: "(z_{1-alpha_h/2} + z_{power}) * sd_discovery_paired_diff / sqrt(n_eff)",
  effective_n_rule: "floor(n_confirmatory_observations / bootstrap_block_bars)",
  /** Required detectable effect is the INHERITED accepted gate improvement, not a new one. */
  required_detectable_effect:
    PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline,
  sample_size_rule:
    "confirmation may only be scored when prospective mde <= required_detectable_effect AND the inherited per-direction block floor is met; otherwise fail closed",
  inherited_block_floor:
    CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE.min_confirmatory_observations_per_direction,
  peeking_prohibited: true,
  confirmation_outcomes_never_used_to_select_or_tune: true,
});

/** Pure, data-free feasibility arithmetic for the prospective MDE rule. */
export function prospectiveMde(sdDiscoveryPairedDiff: number, nConfirmatory: number): number | null {
  if (!Number.isFinite(sdDiscoveryPairedDiff) || sdDiscoveryPairedDiff <= 0) return null;
  if (!Number.isFinite(nConfirmatory) || nConfirmatory <= 0) return null;
  const nEff = Math.floor(nConfirmatory / CONFIRMATORY_INFERENCE.bootstrap_block_bars);
  if (nEff < 1) return null;
  // z_{1-alpha_h/2} and z_{power}: standard normal quantiles, computed deterministically.
  const zAlpha = normalQuantile(1 - CONFIRMATORY_INFERENCE.per_hypothesis_alpha / 2);
  const zPower = normalQuantile(TARGET_POWER);
  if (zAlpha == null || zPower == null) return null;
  return round6(((zAlpha + zPower) * sdDiscoveryPairedDiff) / Math.sqrt(nEff));
}

/** Acklam-style rational approximation of the standard normal inverse CDF. Deterministic. */
export function normalQuantile(p: number): number | null {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, r: number, x: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= ph) {
    q = p - 0.5; r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return round6(x);
}

/* ================================================ promotion gates (stricter) */

/**
 * Every V4 numeric gate value is inherited BYTE-IDENTICALLY. V5 only ADDS the confirmatory
 * significance requirement and the prospective-feasibility precondition. It is therefore
 * strictly stronger than V4 and can never be weaker than in-sample lift.
 */
export const PROPOSED_PROMOTION_GATE = Object.freeze({
  gate_version: PROMOTION_GATE_V4.gate_version + 1,
  inherits_gate_version: PROMOTION_GATE_V4.gate_version,
  numeric_thresholds_identical_to_gate_version: PROMOTION_GATE_V4.gate_version,
  min_aggregate_brier_improvement_vs_baseline:
    PROMOTION_GATE_V4.min_aggregate_brier_improvement_vs_baseline,
  min_fold_win_fraction: PROMOTION_GATE_V4.min_fold_win_fraction,
  max_fold_degradation_vs_baseline: PROMOTION_GATE_V4.max_fold_degradation_vs_baseline,
  min_non_global_coverage: PROMOTION_GATE_V4.min_non_global_coverage,
  non_global_requires_support_floor: PROMOTION_GATE_V4.non_global_requires_support_floor,
  max_aggregate_ece_excess_vs_baseline: PROMOTION_GATE_V4.max_aggregate_ece_excess_vs_baseline,
  ece_rule: PROMOTION_GATE_V4.ece_rule,
  holdout_required: PROMOTION_GATE_V4.holdout_required,
  holdout_role: PROMOTION_GATE_V4.holdout_role,
  holdout_min_brier_delta_vs_baseline: PROMOTION_GATE_V4.holdout_min_brier_delta_vs_baseline,
  holdout_ece_rule: PROMOTION_GATE_V4.holdout_ece_rule,
  holdout_infeasible_behaviour: PROMOTION_GATE_V4.holdout_infeasible_behaviour,
  holdout_fraction: PROMOTION_GATE_V4.holdout_fraction,
  min_training_support_single: FLOOR_SINGLE,
  min_training_support_pair: FLOOR_PAIR,
  bucket_evidence_min_aggregate_test_n: BUCKET_EVIDENCE.min_aggregate_test_n,
  /* --- additions --- */
  added_prospective_feasibility_gate: true,
  added_confirmatory_significance_gate: true,
  confirmatory_significance_rule:
    "bonferroni-adjusted two-sided studentized block-bootstrap p < familywise_alpha / hypotheses",
  strictly_stronger_than_gate_version_2: true,
});

/* ==================================== choice ledger / non-claims / hashing */

export const INHERITED_CHOICES: readonly string[] = Object.freeze([
  "state_spec_v2_levels_bands_and_comparator_semantics",
  "hierarchical_baseline_candidate",
  "label_version_7_barrier_outcome_and_brier_scoring",
  "continuity_contract_v4_source_and_boundary_mapping",
  "venue_calendar_v2",
  "fold_construction_buildVenueAwareFoldsV4",
  "purge_minutes_60",
  "initial_train_fraction_and_holdout_fraction",
  "min_test_obs_per_fold_500",
  "training_support_floors_single_200_pair_300",
  "all_v4_numeric_promotion_thresholds_and_ece_rule",
  "untouched_holdout_confirmation_and_fail_closed_infeasibility",
  "long_short_symmetry",
]);

export const NEW_METHODOLOGY_CHOICES: readonly string[] = Object.freeze([
  "hypothesis_class_first_difference_of_accepted_state_vector",
  "lookback_bars_equal_purge_minutes_over_source_bar_minutes",
  "ordinal_vs_nominal_transition_alphabet_sign_only_zero_tolerance",
  "candidate_universe_transition_singles_plus_own_level_interaction",
  "anchor_eligibility_requires_defect_free_lookback_anchor",
  "confirmatory_paired_block_bootstrap_significance_test",
  "bootstrap_block_length_equal_to_lookback_bars",
  "bonferroni_multiplicity_across_candidates_and_directions",
  "familywise_alpha_0_05_new_constant",
  "target_power_0_80_new_constant",
  "bootstrap_resamples_10000_new_constant",
  "prospective_mde_rule_from_discovery_dispersion_only",
]);

export const UNRESOLVED_ITEMS: readonly string[] = Object.freeze([
  "contract_identity_and_freeze_timestamps",
  "discovery_window_and_confirmation_start_boundary",
  "confirmation_source_identity",
  "frozen_spec_surface_hashes_of_the_eventual_contract",
  "explicit_human_acceptance_of_familywise_alpha_target_power_and_bootstrap_resample_count",
]);

export const METHODOLOGY_DESIGN_NON_CLAIMS: readonly string[] = Object.freeze([
  "not_accepted",
  "not_executable",
  "not_research_v5_authorization",
  "not_a_research_contract_acceptance_artifact",
  "not_probability_or_calibration_publication",
  "not_a_promotion",
  "not_execution_authorization",
  "not_evidence_of_any_effect",
  "not_an_accepted_bootstrap_resample_count",
]);

export const EXECUTION_INVARIANTS = Object.freeze({
  execution_path: "signal_only",
  allow_live_execution: false,
  publishes_numeric_probability: false,
  performs_runtime_io: false,
  mutates_acceptance_registry: false,
  mutates_promotion_manifest: false,
});

/** Ordered, hashable serialisation of the ENTIRE design. Order is part of the hash. */
export function methodologyDesignPayload() {
  const kv = (o: Record<string, unknown>) =>
    Object.keys(o).sort().map((k) => [k, o[k] as unknown]);
  return [
    "ron_post_v4_methodology_design_version", RON_POST_V4_METHODOLOGY_DESIGN_VERSION,
    "proposed_research_version", PROPOSED_RESEARCH_VERSION,
    "governance_path", "new_methodology_required",
    "accepted_state_variables", [...RON_STATE_VARIABLES],
    "state_spec_version", RON_STATE_SPEC_VERSION_V2,
    "lookback_bars", LOOKBACK_BARS,
    "lookback_minutes", LOOKBACK_MINUTES,
    "ordinal_variables", [...ORDINAL_STATE_VARIABLES],
    "nominal_variables", [...NOMINAL_STATE_VARIABLES],
    "ordinal_level_order", Object.keys(ORDINAL_LEVEL_ORDER).sort()
      .map((k) => [k, [...ORDINAL_LEVEL_ORDER[k]]]),
    "ordinal_transition_labels", [...ORDINAL_TRANSITION_LABELS],
    "nominal_transition_labels", [...NOMINAL_TRANSITION_LABELS],
    "candidates", PROPOSED_CANDIDATES.map((c) => [c.name, c.kind, [...c.variables], c.floor]),
    "baseline", [PROPOSED_BASELINE.name, PROPOSED_BASELINE.inherited_from],
    "directions", [...PROPOSED_DIRECTIONS],
    "hypotheses", HYPOTHESIS_COUNT,
    "leakage_boundaries", kv(LEAKAGE_BOUNDARIES),
    "structure_inheritance", kv(STRUCTURE_INHERITANCE),
    "outcome_metric", kv(OUTCOME_METRIC),
    "confirmatory_inference", kv(CONFIRMATORY_INFERENCE),
    "promotion_gate", kv(PROPOSED_PROMOTION_GATE),
    "inherited_choices", [...INHERITED_CHOICES],
    "new_methodology_choices", [...NEW_METHODOLOGY_CHOICES],
    "unresolved_items", [...UNRESOLVED_ITEMS],
    "non_claims", [...METHODOLOGY_DESIGN_NON_CLAIMS],
    "execution_invariants", kv(EXECUTION_INVARIANTS),
    continuityContractPayloadV4(),
    promotionGatePayloadV4(),
    venueCalendarPayloadV2(),
    stateSpecPayloadV2(),
  ];
}

/** Canonical hash of the complete proposed methodology design. */
export async function methodologyDesignHash(): Promise<string> {
  return await sha256(methodologyDesignPayload());
}

export interface PostV4MethodologyDesign {
  design_version: number;
  design_hash: string;
  proposed_research_version: number;
  accepted: false;
  executable: false;
  research_run_authorized: false;
  candidate_count: number;
  hypothesis_count: number;
  inherited_choices: readonly string[];
  new_methodology_choices: readonly string[];
  unresolved_items: readonly string[];
  non_claims: readonly string[];
  execution_invariants: typeof EXECUTION_INVARIANTS;
}

/** Deterministic, pure. Returns the complete unaccepted design state. */
export async function currentPostV4MethodologyDesign(): Promise<PostV4MethodologyDesign> {
  return {
    design_version: RON_POST_V4_METHODOLOGY_DESIGN_VERSION,
    design_hash: await methodologyDesignHash(),
    proposed_research_version: PROPOSED_RESEARCH_VERSION,
    accepted: false,
    executable: false,
    research_run_authorized: false,
    candidate_count: PROPOSED_CANDIDATES.length,
    hypothesis_count: HYPOTHESIS_COUNT,
    inherited_choices: INHERITED_CHOICES,
    new_methodology_choices: NEW_METHODOLOGY_CHOICES,
    unresolved_items: UNRESOLVED_ITEMS,
    non_claims: METHODOLOGY_DESIGN_NON_CLAIMS,
    execution_invariants: EXECUTION_INVARIANTS,
  };
}
