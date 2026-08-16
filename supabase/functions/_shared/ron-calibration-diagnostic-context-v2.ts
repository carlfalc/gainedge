/**
 * RON — CALIBRATION DIAGNOSTIC CONTEXT spec V2 (pure producer).
 *
 * FORWARD-ONLY deepening of the frozen `calibration_model_validation` V1 specialist.
 *
 * V2 does NOT create a second artifact-integrity truth. It calls the frozen V1 producer
 * byte-for-byte, treats the resulting envelope as the ONLY validation authority, and adds
 * deterministic DESCRIPTIVE CATEGORICAL TRANSFORMS of diagnostics V1 has already validated
 * and published (Brier vs naive ordering, ECE ordering, sample-count ordering).
 *
 * HARD CONTRACT — nothing here is a probability, confidence, significance test, effect
 * size, edge, expected value, profitability claim, production approval, market forecast or
 * trade-direction claim. Every decision is an exact `<`, `>` or `===` comparison on numbers
 * V1 already reported: ZERO new numeric thresholds and ZERO magnitude buckets exist in this
 * module. An artifact diagnostic asymmetry (e.g. long better than naive while short is
 * worse) is a property of a PERSISTED ARTIFACT and never authorizes favouring that trade
 * direction. Envelope `direction` stays `neutral` / `unknown`; the accepted
 * `recommendation` stays `research_only`.
 *
 * If V1 does not accept the artifacts, V2 preserves the fail-closed V1
 * status/direction/recommendation verbatim and manufactures no favourable context.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import {
  buildCalibrationValidationEvidence, calibrationValidationSpecHash,
  CALIBRATION_VALIDATION_SPEC_V1, validateAcceptedArtifacts,
  type CalibrationValidationInput,
} from "./ron-calibration-validation-spec.ts";

/** FULL accepted Calibration & Model Validation Spec V1 hash (inherited, never re-derived). */
export const CALIBRATION_VALIDATION_SPEC_V1_HASH_PINNED =
  "e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c";

const V1 = CALIBRATION_VALIDATION_SPEC_V1;

/* ------------------------------------------------------ descriptive vocabularies */

/** Exact Brier-vs-naive ordering ON THE PERSISTED ARTIFACT. Not a market claim. */
export const BASELINE_RELATIONS = [
  "better_than_naive_on_artifact",
  "worse_than_naive_on_artifact",
  "equal_to_naive_on_artifact",
] as const;
export type BaselineRelation = typeof BASELINE_RELATIONS[number];

/** Exact cross-direction ECE ordering on the artifact. No tolerance, no materiality. */
export const ECE_ORDERINGS = [
  "long_ece_lower_on_artifact",
  "short_ece_lower_on_artifact",
  "ece_equal_on_artifact",
] as const;
export type EceOrdering = typeof ECE_ORDERINGS[number];

/** Exact sample-count ordering. Sample size implies NOTHING about better or worse. */
export const SAMPLE_RELATIONS = [
  "direction_samples_equal", "long_more", "short_more",
] as const;
export type SampleRelation = typeof SAMPLE_RELATIONS[number];

/** Governance/readiness interpretation. Emitted ONLY when V1 accepted the artifacts. */
export const VALIDATION_INTERPRETATION_STATES = [
  "validated_artifacts_research_only_no_promotions",
  "interpretation_withheld_v1_not_accepted",
  "interpretation_withheld_v1_diagnostics_unavailable",
] as const;
export type ValidationInterpretationState = typeof VALIDATION_INTERPRETATION_STATES[number];

/** Lossless combined baseline pair vocabulary: the exact ordered pair, nothing collapsed. */
export function combinedBaselinePair(long: BaselineRelation, short: BaselineRelation): string {
  return `long:${long}|short:${short}`;
}

export const COMBINED_BASELINE_PAIRS: readonly string[] = BASELINE_RELATIONS
  .flatMap((l) => BASELINE_RELATIONS.map((s) => combinedBaselinePair(l, s)));

/* ------------------------------------------------------------------- the spec */

export const CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2 = {
  /** SAME spec lineage as the frozen V1 specialist; distinguished by spec_version/hash. */
  spec_id: V1.spec_id,
  spec_version: 2,
  supersedes_spec_version: V1.spec_version,
  agent_id: V1.agent_id,
  agent_version: V1.agent_version,
  instrument_scope: V1.instrument_scope,
  timeframe_scope: V1.timeframe_scope,

  /** Everything factual is INHERITED from the frozen V1 validation contract. */
  inherits: {
    base_spec_id: V1.spec_id,
    base_spec_version: V1.spec_version,
    base_spec_hash: CALIBRATION_VALIDATION_SPEC_V1_HASH_PINNED,
    accepted_research_v4_id: V1.accepted_research_v4.id,
    accepted_research_v4_run_hash: V1.accepted_research_v4.run_hash,
    accepted_calibration_v8_id: V1.accepted_calibration_v8.id,
    accepted_calibration_v8_run_hash: V1.accepted_calibration_v8.run_hash,
    source_contract: V1.source_contract,
    metric_contract: V1.metric_contract,
    publication_contract: V1.publication_contract,
    validation_states: V1.validation_states,
    state_precedence: V1.state_precedence,
    validation_recomputed_in_v2: false,
    research_rerun_in_v2: false,
    calibration_rerun_in_v2: false,
    new_numeric_thresholds_introduced: 0,
  },

  /** The ONLY new layer in V2: exact categorical restatements of V1 diagnostics. */
  diagnostic_context_contract: {
    derived_from: "already_validated_v1_observations_only",
    comparison_mode: "exact_ordering_only",
    tolerance_applied: false,
    magnitude_buckets_emitted: false,
    baseline_relations: BASELINE_RELATIONS,
    combined_baseline_pairs: COMBINED_BASELINE_PAIRS,
    combined_pair_is_lossless: true,
    ece_orderings: ECE_ORDERINGS,
    sample_relations: SAMPLE_RELATIONS,
    sample_dimensions: ["eligible", "fit", "holdout"],
    interpretation_states: VALIDATION_INTERPRETATION_STATES,
    emitted_only_when_v1_accepted: true,
    v1_accepted_states: ["accepted_research_only"],
    v1_accepted_status: "supported",
    semantics: {
      subject: "persisted_calibration_artifact_only",
      current_market_probability_emitted: false,
      current_cell_lookup_performed: false,
      regime_conditioned_rate_emitted: false,
      directional_authority_conferred: false,
    },
  },

  safety_contract: {
    artifact_diagnostic_asymmetry_is_not_a_market_directional_recommendation: true,
    lower_brier_or_ece_does_not_authorize_favouring_that_trade_direction: true,
    current_market_probability_emitted_or_inferable: false,
    statistical_significance_claimed: false,
    predictive_edge_claimed: false,
    production_approval_conferred: false,
    trade_geometry_emitted: false,
    predictive: false,
    causal: false,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    accepted_recommendation: "research_only",
    required_promoted_state_variable_count: 0,
    execution_allowed: false,
    execution_path: "signal_only",
    allow_live_execution: false,
    persistence_default: false,
    llm_used: false,
    external_fetch: false,
  },
} as const;

export function calibrationDiagnosticContextSpecHashV2(): Promise<string> {
  return hashCanonical(CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2);
}

/* -------------------------------------------------------- exact transforms */

export function baselineRelation(brier: number, naive: number): BaselineRelation {
  if (brier < naive) return "better_than_naive_on_artifact";
  if (brier > naive) return "worse_than_naive_on_artifact";
  return "equal_to_naive_on_artifact";
}

export function eceOrdering(longEce: number, shortEce: number): EceOrdering {
  if (longEce < shortEce) return "long_ece_lower_on_artifact";
  if (longEce > shortEce) return "short_ece_lower_on_artifact";
  return "ece_equal_on_artifact";
}

export function sampleRelation(longN: number, shortN: number): SampleRelation {
  if (longN > shortN) return "long_more";
  if (longN < shortN) return "short_more";
  return "direction_samples_equal";
}

/* ----------------------------------------------------------------- producer */

const state = (key: string, value_text: string, at: string): Observation =>
  ({ key, kind: "state", value_text, at });

/** SINGLETON accessor: duplicate or conflicting keys are never silently collapsed. */
function singleNum(e: EvidenceEnvelopeV1, key: string): number | null {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length !== 1) return null;
  const v = all[0].value_num;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function singleText(e: EvidenceEnvelopeV1, key: string): string | null {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length !== 1) return null;
  return typeof all[0].value_text === "string" ? all[0].value_text : null;
}

const isBaselineRelation = (v: string | null): v is BaselineRelation =>
  !!v && (BASELINE_RELATIONS as readonly string[]).includes(v);

export async function buildCalibrationDiagnosticContextEvidenceV2(
  input: CalibrationValidationInput,
): Promise<EvidenceEnvelopeV1> {
  const specHashV2 = await calibrationDiagnosticContextSpecHashV2();
  const baseHash = await calibrationValidationSpecHash();

  // The frozen V1 producer is the SOLE artifact-integrity truth. V2 never re-validates.
  const base = await buildCalibrationValidationEvidence(input);
  const v1State = validateAcceptedArtifacts(input).state;
  const at = base.as_of;

  const observations: Observation[] = [...base.observations];
  const limitations = [...base.uncertainty.limitations];

  const provenance_refs = [
    `spec:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id}:v${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_version}:${specHashV2}`,
    `base_spec:${V1.spec_id}:v${V1.spec_version}:${baseHash}`,
    ...base.provenance_refs.filter((p) => !p.startsWith(`spec:${V1.spec_id}:`)),
  ];
  const dependencies = [
    ...base.dependencies,
    `calibration_validation_spec_v${V1.spec_version}:${baseHash}`,
  ];

  limitations.push(
    "V2 adds no new validation: artifact integrity is entirely the frozen V1 result",
    "baseline / ECE / sample categories are exact orderings of persisted artifact diagnostics; no threshold, tolerance, magnitude or significance is applied",
    "an artifact diagnostic asymmetry between long and short is NOT a market directional recommendation and does not authorize favouring either trade direction",
    "no current-market expectation is emitted or inferable from this specialist, and no production approval is conferred",
  );

  const withheld = (s: ValidationInterpretationState): EvidenceEnvelopeV1 => ({
    ...base,
    observations: [
      ...observations,
      state("calibration_diagnostic_context_state", "context_withheld", at),
      state("validation_interpretation_state", s, at),
    ],
    provenance_refs, dependencies,
    uncertainty: { level: "unquantified", limitations },
  });

  // Fail-closed inheritance: no accepted interpretation state may exist unless V1 accepted.
  if (base.status !== "supported" || v1State !== "accepted_research_only") {
    return withheld("interpretation_withheld_v1_not_accepted");
  }

  const longBrier = singleNum(base, "long_brier");
  const shortBrier = singleNum(base, "short_brier");
  const longNaive = singleNum(base, "long_naive_brier");
  const shortNaive = singleNum(base, "short_naive_brier");
  const longEce = singleNum(base, "long_ece");
  const shortEce = singleNum(base, "short_ece");
  const longFit = singleNum(base, "long_fit_rows");
  const shortFit = singleNum(base, "short_fit_rows");
  const longHoldout = singleNum(base, "long_holdout_rows");
  const shortHoldout = singleNum(base, "short_holdout_rows");
  const longEligible = singleNum(base, "eligible_long_rows");
  const shortEligible = singleNum(base, "eligible_short_rows");

  if ([longBrier, shortBrier, longNaive, shortNaive, longEce, shortEce, longFit, shortFit,
    longHoldout, shortHoldout, longEligible, shortEligible].some((v) => v == null)) {
    return withheld("interpretation_withheld_v1_diagnostics_unavailable");
  }

  // Prefer V1's OWN published ordering when present; recomputation is an exact fallback
  // over the same two numbers V1 validated, never a second statistic.
  const longRel = isBaselineRelation(singleText(base, "long_vs_naive_state"))
    ? singleText(base, "long_vs_naive_state") as BaselineRelation
    : baselineRelation(longBrier!, longNaive!);
  const shortRel = isBaselineRelation(singleText(base, "short_vs_naive_state"))
    ? singleText(base, "short_vs_naive_state") as BaselineRelation
    : baselineRelation(shortBrier!, shortNaive!);

  observations.push(
    state("long_baseline_relation_on_artifact", longRel, at),
    state("short_baseline_relation_on_artifact", shortRel, at),
    state("combined_baseline_relation_pair", combinedBaselinePair(longRel, shortRel), at),
    state("baseline_relation_scope", "artifact_diagnostic_not_directional_authority", at),
    state("ece_ordering_on_artifact", eceOrdering(longEce!, shortEce!), at),
    state("eligible_sample_relation", sampleRelation(longEligible!, shortEligible!), at),
    state("fit_sample_relation", sampleRelation(longFit!, shortFit!), at),
    state("holdout_sample_relation", sampleRelation(longHoldout!, shortHoldout!), at),
    state("sample_relation_scope", "counts_only_no_quality_implied", at),
    state("validation_interpretation_state",
      "validated_artifacts_research_only_no_promotions" satisfies ValidationInterpretationState, at),
    state("calibration_diagnostic_context_state", "evaluated", at),
  );

  return {
    ...base,
    observations, provenance_refs, dependencies,
    uncertainty: { level: "unquantified", limitations },
    direction: "neutral",
    recommendation: "research_only",
  };
}
