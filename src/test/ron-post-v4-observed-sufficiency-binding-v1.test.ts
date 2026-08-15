import { describe, expect, it } from "vitest";
import {
  POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY,
  RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION,
  buildObservedSufficiencyBinding,
  deriveConfirmatorySampleSufficiencyClaimFromObservation,
  observedSufficiencyBindingPolicyHash,
  postV4ObservationHash,
  validatePostV4Observation,
  validateSufficiencyClaimAgainstObservation,
  type ObservedSufficiencyDerivationInput,
} from "../../supabase/functions/_shared/ron-post-v4-observed-sufficiency-binding";
import {
  summarizePostV4DataReadiness,
  type PostV4DataReadinessSummary,
} from "../../supabase/functions/_shared/ron-post-v4-data-readiness";
import {
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  validateConfirmatorySampleSufficiency,
} from "../../supabase/functions/_shared/ron-confirmatory-sample-sufficiency";
import { MIN_TEST_OBS_PER_FOLD, PURGE_MINUTES } from "../../supabase/functions/_shared/ron-research";
import { HOLDOUT_FRACTION } from "../../supabase/functions/_shared/ron-research-v3";
import { RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import { ACCEPTED_PROMOTION_MANIFEST } from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

/** SYNTHETIC test-only observation. Nothing here is accepted in production. */
function observation(over: Partial<Parameters<typeof summarizePostV4DataReadiness>[0]> = {}) {
  return summarizePostV4DataReadiness({
    confirmation_start: "2026-09-02T00:00:00Z",
    effective_end: "2026-11-01T00:00:00Z",
    source_as_of: "2026-11-01T00:15:00Z",
    source_bar_cutoff: "2026-11-01T00:00:00Z",
    feature_grid_bars: 5760,
    continuity_splitting_defects: 0,
    continuity_defects: 0,
    eligible_long: MIN_TEST_OBS_PER_FOLD,
    eligible_short: MIN_TEST_OBS_PER_FOLD + 12,
    exclusions: { quarantined: 3 },
    ...over,
  });
}

function input(over: Partial<ObservedSufficiencyDerivationInput> = {}):
  ObservedSufficiencyDerivationInput {
  return {
    observation: observation(),
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_synthetic",
    spec_frozen_at: "2026-09-01T00:00:00Z",
    discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
    confirmation_source_identity: "post_freeze_native_15m_grid",
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: "audited_source_change",
    ...over,
  };
}

describe("2D.3a — observed-data binding for post-V4 confirmatory sufficiency claims", () => {
  it("derives every observed field from the observation and inherits the rest verbatim", () => {
    const o = observation();
    const claim = deriveConfirmatorySampleSufficiencyClaimFromObservation(input({ observation: o }));
    expect(claim.confirmation_window).toEqual({ start: o.confirmation_start, end: o.effective_end });
    expect(claim.confirmatory_observations_per_direction).toEqual({
      long: o.eligible_observations.long, short: o.eligible_observations.short,
    });
    expect(claim.purge_minutes).toBe(PURGE_MINUTES);
    expect(claim.holdout_fraction).toBe(HOLDOUT_FRACTION);
    expect(claim.procedure_hash).toBe(CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH);
    expect(validateConfirmatorySampleSufficiency(claim).admissible).toBe(true);
  });

  it("never fabricates contamination facts — caller values pass through and fail closed", async () => {
    const c = deriveConfirmatorySampleSufficiencyClaimFromObservation(
      input({ confirmation_used_for_tuning: true }),
    );
    expect(c.confirmation_used_for_tuning).toBe(true);
    const r = await buildObservedSufficiencyBinding(input({ confirmation_used_for_tuning: true }));
    expect(r.built).toBe(false);
    expect(r.reasons.join(" | ")).toContain("sufficiency_claim: confirmation_data_used_for_tuning");
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY
      .contamination_facts_derived_by_this_module).toBe(false);
  });

  it("builds a deterministic observation-bound artifact carrying zero authority", async () => {
    const r = await buildObservedSufficiencyBinding(input());
    expect(r.built).toBe(true);
    if (!r.built) return;
    expect(r.artifact.observation_bound).toBe(true);
    expect(r.artifact.accepted).toBe(false);
    expect(r.artifact.research_run_authorized).toBe(false);
    expect(r.artifact.executable).toBe(false);
    expect(r.artifact.observation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.artifact.claim_hash).toBe(r.artifact.sufficiency_binding.claim_hash);
    const again = await buildObservedSufficiencyBinding(input());
    expect(again.built && again.artifact.claim_hash).toBe(r.artifact.claim_hash);
    expect(r.artifact.non_claims).toContain("not_a_promotion");
    expect(r.artifact.non_claims).toContain("not_permission_to_execute_research");
  });

  it("observation hash is deterministic and field sensitive", async () => {
    const h = await postV4ObservationHash(observation());
    expect(h).toBe(await postV4ObservationHash(observation()));
    expect(await postV4ObservationHash(observation({ eligible_long: MIN_TEST_OBS_PER_FOLD + 1 })))
      .not.toBe(h);
    expect(await postV4ObservationHash(observation({ exclusions: { quarantined: 4 } })))
      .not.toBe(h);
  });

  it("rejects observations that do not meet the inherited floor or continuity requirement",
    async () => {
      const low = observation({ eligible_short: MIN_TEST_OBS_PER_FOLD - 1 });
      expect(validatePostV4Observation(low).reasons)
        .toContain("observation_below_inherited_minimum: short");
      const split = observation({ continuity_splitting_defects: 2 });
      expect(validatePostV4Observation(split).reasons)
        .toContain("observation_continuity_splitting_defects_present");
      const r = await buildObservedSufficiencyBinding(input({ observation: split }));
      expect(r.built).toBe(false);
      expect(r.reasons.join(" | "))
        .toContain("observation: observation_continuity_splitting_defects_present");
      expect(validatePostV4Observation(undefined).reasons).toEqual(["missing_observation"]);
    });

  it("rejects a hand-authored claim that disagrees with the observation", () => {
    const o = observation();
    const good = deriveConfirmatorySampleSufficiencyClaimFromObservation(input({ observation: o }));
    expect(validateSufficiencyClaimAgainstObservation(good, o).admissible).toBe(true);

    const inflated = {
      ...good,
      confirmatory_observations_per_direction: { long: 999_999, short: 999_999 },
    };
    expect(validateSufficiencyClaimAgainstObservation(inflated, o).reasons)
      .toContain("confirmatory_observations_do_not_match_observation: long");

    const shifted = {
      ...good,
      confirmation_window: { start: "2026-08-01T00:00:00Z", end: o.effective_end },
    };
    expect(validateSufficiencyClaimAgainstObservation(shifted, o).reasons)
      .toContain("confirmation_window_start_does_not_match_observation");
    expect(validateSufficiencyClaimAgainstObservation(undefined, o).reasons)
      .toEqual(["missing_claim"]);
  });

  it("fails closed on pre-freeze confirmation and on frozen-V4 research versions", async () => {
    const pre = await buildObservedSufficiencyBinding(
      input({ spec_frozen_at: "2026-10-01T00:00:00Z" }));
    expect(pre.built).toBe(false);
    expect(pre.reasons.join(" | ")).toContain("confirmation_window_starts_before_spec_freeze");

    const v4 = await buildObservedSufficiencyBinding(
      input({ research_version: RESEARCH_VERSION_V4 }));
    expect(v4.built).toBe(false);
    expect(v4.reasons.join(" | ")).toContain("research_version_not_after_frozen_negative");
  });

  it("introduces no new constants or methodology and promotes nothing", async () => {
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY.new_numeric_constants_introduced).toBe(0);
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY
      .new_methodological_semantics_introduced).toBe(0);
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY.allow_live_execution).toBe(false);
    expect(POST_V4_OBSERVED_SUFFICIENCY_BINDING_POLICY.accepted_by_this_module).toBe(false);
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);

    const h = await observedSufficiencyBindingPolicyHash();
    expect(h).toBe(await observedSufficiencyBindingPolicyHash());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(RON_POST_V4_OBSERVED_SUFFICIENCY_BINDING_VERSION).toBe(1);
  });

  it("exposes no probability or execution surface", async () => {
    const r = await buildObservedSufficiencyBinding(input());
    const { non_claims: _nc, ...artifact } = (r as { artifact: Record<string, unknown> }).artifact;
    expect(JSON.stringify(artifact)).not.toMatch(/probability|confidence|order_id|lot_size/);
  });
});
