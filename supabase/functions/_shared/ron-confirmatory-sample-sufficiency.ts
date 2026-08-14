/**
 * RON implementation marker 2D.2q — CONFIRMATORY SAMPLE SUFFICIENCY SOURCE-INHERITANCE
 * FOUNDATION. Pure contract: no runtime behaviour, no I/O, no database, no probability,
 * no execution, and — critically — NO NEW NUMERIC CONSTANT.
 *
 * WHAT THE ACCEPTED SOURCE ALREADY SAYS
 * -------------------------------------
 * The frozen, accepted research contracts already define, verbatim, the minimum size an
 * out-of-sample scored block must have before it may be evaluated at all:
 *   - `MIN_TEST_OBS_PER_FOLD` (ron-research.ts): "A fold is only admissible if BOTH
 *     directions have at least this many test observations."
 *   - `buildVenueAwareFolds` (ron-research-v3.ts, inherited unchanged by V4's
 *     `buildVenueAwareFoldsV4`) applies EXACTLY that rule to the untouched final holdout:
 *     `holdoutViable = tail_times >= MIN_TEST_OBS_PER_FOLD && every direction has
 *     >= MIN_TEST_OBS_PER_FOLD observations in the tail`; otherwise `holdout.used=false`
 *     with the recorded reason.
 *   - `PURGE_MINUTES` (60) is the embargo width at the train -> confirmatory boundary, and
 *     the V3 `HOLDOUT_FRACTION` (0.15, imported from `ron-research-v3.ts` — NOT the
 *     unrelated calibration-module constant) is the reserved tail fraction.
 *   - `PROMOTION_GATE_V4` declares the confirmatory block `holdout_required`, its role
 *     `final_confirmation_only_never_selection_or_tuning`, and infeasibility as
 *     `fail_closed`.
 *
 * WHAT THIS MODULE THEREFORE INHERITS — AND ONLY THIS
 * --------------------------------------------------
 * The accepted MINIMUM VIABILITY criterion for a confirmatory block, imported (never
 * retyped) from those frozen contracts. Every numeric value below is a reference to an
 * accepted constant.
 *
 * WHAT IT EXPLICITLY DOES NOT PROVE
 * ---------------------------------
 * `MIN_TEST_OBS_PER_FOLD` is a block-admissibility floor in the accepted source. The
 * accepted source contains NO power analysis, NO minimum detectable effect, and NO
 * significance test. This criterion therefore does NOT establish statistical power to
 * detect `PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline`, does not bound
 * false-positive/negative rates, and does not make a passing confirmation "significant".
 * It is a NECESSARY, source-supported precondition only. Inventing a power-derived number
 * here would be an unsourced methodological choice and is deliberately refused.
 *
 * Nothing here can promote anything: `ACCEPTED_PROMOTION_MANIFEST` stays empty and V4 is a
 * frozen negative artifact.
 */
import { sha256 } from "./ron-calibration.ts";
import { MIN_TEST_OBS_PER_FOLD, PROMOTION_GATE, PURGE_MINUTES } from "./ron-research.ts";
import { HOLDOUT_FRACTION } from "./ron-research-v3.ts";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";
import { SAMPLE_SUFFICIENCY_PREREQUISITE_ID } from "./ron-research-contract-acceptance.ts";

export const RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION = 1;

/** Directions the accepted fold rule requires to INDEPENDENTLY meet the floor. */
export const CONFIRMATORY_DIRECTIONS: readonly string[] = ["long", "short"] as const;

/** The one prerequisite this module resolves. Imported, never re-declared. */
export const CONFIRMATORY_SAMPLE_SUFFICIENCY_PREREQUISITE_ID = SAMPLE_SUFFICIENCY_PREREQUISITE_ID;

export const CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE = {
  procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  resolves_prerequisite: CONFIRMATORY_SAMPLE_SUFFICIENCY_PREREQUISITE_ID,
  default_decision: "deny",
  new_numeric_constants_introduced: 0,
  inheritance_rule: "every_threshold_imported_verbatim_from_frozen_accepted_research_contracts",
  inherited_from: [
    "ron-research.ts:MIN_TEST_OBS_PER_FOLD",
    "ron-research.ts:PURGE_MINUTES",
    "ron-research-v3.ts:HOLDOUT_FRACTION",
    "ron-research-v3.ts:buildVenueAwareFolds.holdoutViable",
    "ron-research-v4.ts:PROMOTION_GATE_V4",
  ],
  /** Both directions must independently reach the accepted per-block floor. */
  min_confirmatory_observations_per_direction: MIN_TEST_OBS_PER_FOLD,
  required_directions: CONFIRMATORY_DIRECTIONS,
  inherited_purge_minutes: PURGE_MINUTES,
  inherited_holdout_fraction: HOLDOUT_FRACTION,
  inherited_holdout_required: PROMOTION_GATE_V4.holdout_required,
  inherited_holdout_role: PROMOTION_GATE_V4.holdout_role,
  inherited_infeasible_behaviour: PROMOTION_GATE_V4.holdout_infeasible_behaviour,
  min_research_version: RESEARCH_VERSION_V4 + 1,
  frozen_negative_research_version: RESEARCH_VERSION_V4,
  acceptance_origin: "audited_source_change",
  resolution_scope: "minimum_confirmatory_block_viability_only",
  does_not_prove: [
    "statistical_power_to_detect_min_aggregate_brier_improvement_vs_baseline",
    "minimum_detectable_effect_size",
    "significance_of_a_passing_confirmation",
    "false_positive_or_false_negative_rate_bounds",
    "sufficiency_of_the_confirmatory_sample_for_any_specific_effect",
  ],
  effect_size_referenced_but_not_powered:
    PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline,
  power_analysis_present_in_accepted_source: false,
} as const;

/* --------------------------------------------------------------- validation */

export interface ConfirmatoryWindow { start: string; end: string }

export interface ConfirmatorySampleSufficiencyClaim {
  procedure_version: number;
  procedure_hash: string;
  research_version: number;
  contract_identity: string;
  spec_frozen_at: string;
  discovery_window: ConfirmatoryWindow;
  confirmation_window: ConfirmatoryWindow;
  confirmation_source_identity: string;
  /** Must equal the inherited accepted values exactly. */
  purge_minutes: number;
  holdout_fraction: number;
  /** direction -> observed count in the confirmatory block. Must cover both directions. */
  confirmatory_observations_per_direction: Readonly<Record<string, number>>;
  confirmation_used_for_selection: boolean;
  confirmation_used_for_tuning: boolean;
  acceptance_origin: string;
}

export interface SufficiencyValidation { admissible: boolean; reasons: string[] }

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const instant = (v: unknown): number | null =>
  typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const hex64 = (v: unknown): boolean => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/**
 * Deny-by-default validation of a hypothetical FUTURE confirmatory-sufficiency claim.
 * Production supplies no such claim today: no post-V4 research contract exists.
 */
export function validateConfirmatorySampleSufficiency(
  claim: ConfirmatorySampleSufficiencyClaim,
  procedureHash: string = CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
): SufficiencyValidation {
  const reasons: string[] = [];
  if (!claim || typeof claim !== "object") return { admissible: false, reasons: ["missing_claim"] };

  if (claim.procedure_version !== RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION) {
    reasons.push(`procedure_version_mismatch: ${claim.procedure_version}`);
  }
  if (claim.procedure_hash !== procedureHash) reasons.push("procedure_hash_mismatch");

  if (!Number.isInteger(claim.research_version)
    || claim.research_version < CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE.min_research_version) {
    reasons.push(
      `research_version_not_after_frozen_negative: ${claim.research_version} < `
      + `${CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE.min_research_version}`,
    );
  }
  if (!nonEmpty(claim.contract_identity)) reasons.push("missing_contract_identity");
  if (!nonEmpty(claim.confirmation_source_identity)) {
    reasons.push("missing_confirmation_source_identity");
  }

  // Inherited structural semantics must be preserved verbatim.
  if (claim.purge_minutes !== PURGE_MINUTES) {
    reasons.push(`purge_minutes_not_inherited: ${claim.purge_minutes} != ${PURGE_MINUTES}`);
  }
  if (claim.holdout_fraction !== HOLDOUT_FRACTION) {
    reasons.push(`holdout_fraction_not_inherited: ${claim.holdout_fraction} != ${HOLDOUT_FRACTION}`);
  }

  // Inherited per-direction minimum. BOTH directions, independently.
  const counts = claim.confirmatory_observations_per_direction ?? {};
  for (const d of CONFIRMATORY_DIRECTIONS) {
    const n = (counts as Record<string, unknown>)[d];
    if (!Number.isInteger(n) || (n as number) < 0) {
      reasons.push(`missing_or_malformed_confirmatory_observations: ${d}`);
    } else if ((n as number) < MIN_TEST_OBS_PER_FOLD) {
      reasons.push(
        `confirmatory_observations_below_inherited_minimum: ${d} ${n} < ${MIN_TEST_OBS_PER_FOLD}`,
      );
    }
  }
  for (const k of Object.keys(counts)) {
    if (!CONFIRMATORY_DIRECTIONS.includes(k)) reasons.push(`unknown_direction: ${k}`);
  }

  // Post-freeze, disjoint confirmatory evidence.
  const frozen = instant(claim.spec_frozen_at);
  const dStart = instant(claim.discovery_window?.start);
  const dEnd = instant(claim.discovery_window?.end);
  const cStart = instant(claim.confirmation_window?.start);
  const cEnd = instant(claim.confirmation_window?.end);
  if (frozen == null) reasons.push("missing_or_malformed_spec_frozen_at");
  if (dStart == null || dEnd == null) reasons.push("missing_or_malformed_discovery_window");
  if (cStart == null || cEnd == null) reasons.push("missing_or_malformed_confirmation_window");
  if (dStart != null && dEnd != null && dEnd <= dStart) reasons.push("empty_discovery_window");
  if (cStart != null && cEnd != null && cEnd <= cStart) reasons.push("empty_confirmation_window");
  if (dEnd != null && cStart != null && cStart < dEnd) {
    reasons.push("confirmation_window_overlaps_discovery_window");
  }
  if (frozen != null && cStart != null && cStart <= frozen) {
    reasons.push("confirmation_window_starts_before_spec_freeze");
  }
  // The inherited embargo must actually separate discovery from confirmation.
  if (dEnd != null && cStart != null && cStart - dEnd < PURGE_MINUTES * 60_000) {
    reasons.push(`inherited_purge_gap_not_respected: < ${PURGE_MINUTES}m`);
  }

  if (claim.confirmation_used_for_selection !== false) {
    reasons.push("confirmation_data_used_for_selection_or_ranking");
  }
  if (claim.confirmation_used_for_tuning !== false) {
    reasons.push("confirmation_data_used_for_tuning");
  }
  if (claim.acceptance_origin !== CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE.acceptance_origin) {
    reasons.push(`acceptance_origin_not_audited_source_change: ${String(claim.acceptance_origin)}`);
  }

  return { admissible: reasons.length === 0, reasons };
}

/* ----------------------------------------------------------------- payloads */

export function confirmatorySampleSufficiencyPayload() {
  const p = CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE as Record<string, unknown>;
  return [
    "ron_confirmatory_sample_sufficiency_version", RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
    "procedure", Object.keys(p).sort().map((k) => [
      k, Array.isArray(p[k]) ? [...(p[k] as unknown[])].map(String).sort() : p[k],
    ]),
  ];
}

export async function confirmatorySampleSufficiencyHash() {
  return await sha256(confirmatorySampleSufficiencyPayload());
}

/**
 * PINNED canonical hash of the procedure above. Synchronous so registry validation stays
 * pure/sync; a test asserts equality with `await confirmatorySampleSufficiencyHash()`.
 */
export const CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH =
  "9b832d1c4ea958bb9ea37edbdafc865b727c37218adde8bde942b54735bfe618";

/** Stable identity of the accepted prerequisite-resolution artifact for this procedure. */
export const CONFIRMATORY_SAMPLE_SUFFICIENCY_ARTIFACT_ID =
  `prerequisite_resolution.${CONFIRMATORY_SAMPLE_SUFFICIENCY_PREREQUISITE_ID}.v${RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION}`;

/* ------------------------------------------------- prospective claim binding */

export const CONFIRMATORY_SAMPLE_SUFFICIENCY_CLAIM_PAYLOAD_VERSION = 1;

export function confirmatorySampleSufficiencyClaimPayload(
  claim: ConfirmatorySampleSufficiencyClaim,
) {
  const counts = claim?.confirmatory_observations_per_direction ?? {};
  return [
    "ron_confirmatory_sample_sufficiency_claim", CONFIRMATORY_SAMPLE_SUFFICIENCY_CLAIM_PAYLOAD_VERSION,
    "procedure_version", claim?.procedure_version ?? null,
    "procedure_hash", claim?.procedure_hash ?? null,
    "research_version", claim?.research_version ?? null,
    "contract_identity", claim?.contract_identity ?? null,
    "spec_frozen_at", claim?.spec_frozen_at ?? null,
    "discovery_window", [claim?.discovery_window?.start ?? null, claim?.discovery_window?.end ?? null],
    "confirmation_window", [claim?.confirmation_window?.start ?? null, claim?.confirmation_window?.end ?? null],
    "confirmation_source_identity", claim?.confirmation_source_identity ?? null,
    "purge_minutes", claim?.purge_minutes ?? null,
    "holdout_fraction", claim?.holdout_fraction ?? null,
    "confirmatory_observations_per_direction",
    Object.keys(counts).sort().map((k) => [k, (counts as Record<string, unknown>)[k]]),
    "confirmation_used_for_selection", claim?.confirmation_used_for_selection ?? null,
    "confirmation_used_for_tuning", claim?.confirmation_used_for_tuning ?? null,
    "acceptance_origin", claim?.acceptance_origin ?? null,
  ];
}

export async function confirmatorySampleSufficiencyClaimHash(
  claim: ConfirmatorySampleSufficiencyClaim,
) {
  return await sha256(confirmatorySampleSufficiencyClaimPayload(claim));
}

/** Immutable binding a future sufficiency-evidence artifact would carry. */
export interface ConfirmatorySampleSufficiencyBinding {
  research_version: number;
  contract_identity: string;
  claim_hash: string;
  procedure_version: number;
  procedure_hash: string;
}

export type BuildSufficiencyBindingResult =
  | { built: true; binding: ConfirmatorySampleSufficiencyBinding; reasons: [] }
  | { built: false; binding: null; reasons: string[] };

/** The ONLY admissible way to mint a sufficiency binding. Pure and fail-closed. */
export async function buildConfirmatorySampleSufficiencyBinding(
  claim: ConfirmatorySampleSufficiencyClaim,
  procedureHash: string = CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
): Promise<BuildSufficiencyBindingResult> {
  const v = validateConfirmatorySampleSufficiency(claim, procedureHash);
  if (!v.admissible) return { built: false, binding: null, reasons: v.reasons };
  return {
    built: true,
    reasons: [],
    binding: {
      research_version: claim.research_version,
      contract_identity: claim.contract_identity,
      claim_hash: await confirmatorySampleSufficiencyClaimHash(claim),
      procedure_version: claim.procedure_version,
      procedure_hash: claim.procedure_hash,
    },
  };
}

/** Pure, structural, deny-by-default validation of a sufficiency binding. */
export function validateConfirmatorySampleSufficiencyBinding(
  binding: ConfirmatorySampleSufficiencyBinding | undefined | null,
): SufficiencyValidation {
  const reasons: string[] = [];
  if (!binding || typeof binding !== "object") {
    return { admissible: false, reasons: ["missing_sufficiency_binding"] };
  }
  if (!Number.isInteger(binding.research_version)
    || binding.research_version < CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE.min_research_version) {
    reasons.push("binding_research_version_not_after_frozen_negative");
  }
  if (!nonEmpty(binding.contract_identity)) reasons.push("binding_missing_contract_identity");
  if (!hex64(binding.claim_hash)) reasons.push("binding_malformed_claim_hash");
  if (binding.procedure_version !== RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION) {
    reasons.push("binding_procedure_version_mismatch");
  }
  if (binding.procedure_hash !== CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH) {
    reasons.push("binding_procedure_hash_mismatch");
  }
  return { admissible: reasons.length === 0, reasons };
}
