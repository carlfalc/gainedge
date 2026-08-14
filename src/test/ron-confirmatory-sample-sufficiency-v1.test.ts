import { describe, expect, it } from "vitest";
import {
  CONFIRMATORY_DIRECTIONS,
  CONFIRMATORY_SAMPLE_SUFFICIENCY_ARTIFACT_ID,
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PREREQUISITE_ID,
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE,
  CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
  RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
  buildConfirmatorySampleSufficiencyBinding,
  confirmatorySampleSufficiencyClaimHash,
  confirmatorySampleSufficiencyHash,
  validateConfirmatorySampleSufficiency,
  validateConfirmatorySampleSufficiencyBinding,
  type ConfirmatorySampleSufficiencyClaim,
} from "../../supabase/functions/_shared/ron-confirmatory-sample-sufficiency";
import {
  MIN_TEST_OBS_PER_FOLD, PROMOTION_GATE, PURGE_MINUTES,
} from "../../supabase/functions/_shared/ron-research";
import { HOLDOUT_FRACTION } from "../../supabase/functions/_shared/ron-research-v3";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";
import { SAMPLE_SUFFICIENCY_PREREQUISITE_ID } from "../../supabase/functions/_shared/ron-research-contract-acceptance";
import { ACCEPTED_PROMOTION_MANIFEST } from "../../supabase/functions/_shared/ron-promotion-readiness";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

/** SYNTHETIC, test-only future claim. Nothing here is accepted in production. */
function claim(
  over: Partial<ConfirmatorySampleSufficiencyClaim> = {},
): ConfirmatorySampleSufficiencyClaim {
  return {
    procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION,
    procedure_hash: CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH,
    research_version: RESEARCH_VERSION_V4 + 1,
    contract_identity: "research_v5_synthetic",
    spec_frozen_at: "2026-09-01T00:00:00Z",
    discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
    confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" },
    confirmation_source_identity: "post_freeze_native_15m_grid",
    purge_minutes: PURGE_MINUTES,
    holdout_fraction: HOLDOUT_FRACTION,
    confirmatory_observations_per_direction: {
      long: MIN_TEST_OBS_PER_FOLD, short: MIN_TEST_OBS_PER_FOLD,
    },
    confirmation_used_for_selection: false,
    confirmation_used_for_tuning: false,
    acceptance_origin: "audited_source_change",
    ...over,
  };
}

describe("2D.2q — confirmatory sample sufficiency source inheritance", () => {
  it("pinned procedure hash matches the computed canonical hash, deterministically", async () => {
    const h = await confirmatorySampleSufficiencyHash();
    expect(h).toBe(CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH);
    expect(await confirmatorySampleSufficiencyHash()).toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("claim hash is deterministic and independent of key order", async () => {
    const a = claim();
    const reordered = JSON.parse(JSON.stringify({
      acceptance_origin: a.acceptance_origin,
      confirmation_used_for_tuning: a.confirmation_used_for_tuning,
      confirmatory_observations_per_direction: {
        short: a.confirmatory_observations_per_direction.short,
        long: a.confirmatory_observations_per_direction.long,
      },
      confirmation_used_for_selection: a.confirmation_used_for_selection,
      holdout_fraction: a.holdout_fraction,
      purge_minutes: a.purge_minutes,
      confirmation_source_identity: a.confirmation_source_identity,
      confirmation_window: a.confirmation_window,
      discovery_window: a.discovery_window,
      spec_frozen_at: a.spec_frozen_at,
      contract_identity: a.contract_identity,
      research_version: a.research_version,
      procedure_hash: a.procedure_hash,
      procedure_version: a.procedure_version,
    })) as ConfirmatorySampleSufficiencyClaim;
    expect(await confirmatorySampleSufficiencyClaimHash(reordered))
      .toBe(await confirmatorySampleSufficiencyClaimHash(a));
    expect(await confirmatorySampleSufficiencyClaimHash(claim({ contract_identity: "other" })))
      .not.toBe(await confirmatorySampleSufficiencyClaimHash(a));
  });

  it("every threshold is inherited verbatim; no new numeric constant is introduced", () => {
    const p = CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE;
    expect(p.new_numeric_constants_introduced).toBe(0);
    expect(p.min_confirmatory_observations_per_direction).toBe(MIN_TEST_OBS_PER_FOLD);
    expect(p.inherited_purge_minutes).toBe(PURGE_MINUTES);
    expect(p.inherited_holdout_fraction).toBe(HOLDOUT_FRACTION);
    expect(HOLDOUT_FRACTION).toBe(0.15);
    expect(p.inherited_holdout_required).toBe(PROMOTION_GATE_V4.holdout_required);
    expect(p.inherited_holdout_role).toBe(PROMOTION_GATE_V4.holdout_role);
    expect(p.inherited_infeasible_behaviour).toBe(PROMOTION_GATE_V4.holdout_infeasible_behaviour);
    expect(p.min_research_version).toBe(RESEARCH_VERSION_V4 + 1);
    expect(p.default_decision).toBe("deny");
    expect(CONFIRMATORY_SAMPLE_SUFFICIENCY_PREREQUISITE_ID)
      .toBe(SAMPLE_SUFFICIENCY_PREREQUISITE_ID);
    expect(CONFIRMATORY_SAMPLE_SUFFICIENCY_ARTIFACT_ID)
      .toContain(SAMPLE_SUFFICIENCY_PREREQUISITE_ID);
  });

  it("is explicitly scoped to minimum viability, not power/MDE/significance", () => {
    const p = CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE;
    expect(p.resolution_scope).toBe("minimum_confirmatory_block_viability_only");
    expect(p.power_analysis_present_in_accepted_source).toBe(false);
    expect(p.effect_size_referenced_but_not_powered)
      .toBe(PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline);
    expect(p.does_not_prove.join(" ")).toContain("statistical_power");
    expect(p.does_not_prove.join(" ")).toContain("minimum_detectable_effect_size");
    expect(p.does_not_prove.join(" ")).toContain("significance_of_a_passing_confirmation");
  });

  it("a fully qualified synthetic claim is admissible", () => {
    expect(validateConfirmatorySampleSufficiency(claim()))
      .toEqual({ admissible: true, reasons: [] });
    expect(CONFIRMATORY_DIRECTIONS).toEqual(["long", "short"]);
  });

  it("BOTH directions must independently meet MIN_TEST_OBS_PER_FOLD", () => {
    for (const d of CONFIRMATORY_DIRECTIONS) {
      const counts = { long: MIN_TEST_OBS_PER_FOLD, short: MIN_TEST_OBS_PER_FOLD } as Record<string, number>;
      counts[d] = MIN_TEST_OBS_PER_FOLD - 1;
      const r = validateConfirmatorySampleSufficiency(
        claim({ confirmatory_observations_per_direction: counts }),
      );
      expect(r.admissible).toBe(false);
      expect(r.reasons.join(" | "))
        .toContain(`confirmatory_observations_below_inherited_minimum: ${d}`);
    }
    const missing = validateConfirmatorySampleSufficiency(
      claim({ confirmatory_observations_per_direction: { long: MIN_TEST_OBS_PER_FOLD } }),
    );
    expect(missing.reasons.join(" | "))
      .toContain("missing_or_malformed_confirmatory_observations: short");
    const extra = validateConfirmatorySampleSufficiency(claim({
      confirmatory_observations_per_direction: {
        long: MIN_TEST_OBS_PER_FOLD, short: MIN_TEST_OBS_PER_FOLD, sideways: MIN_TEST_OBS_PER_FOLD,
      },
    }));
    expect(extra.reasons.join(" | ")).toContain("unknown_direction: sideways");
  });

  const failures: Array<[string, Partial<ConfirmatorySampleSufficiencyClaim>, string]> = [
    ["wrong procedure version", { procedure_version: 99 }, "procedure_version_mismatch"],
    ["wrong procedure hash", { procedure_hash: "f".repeat(64) }, "procedure_hash_mismatch"],
    ["frozen negative research version", { research_version: RESEARCH_VERSION_V4 },
      "research_version_not_after_frozen_negative"],
    ["missing contract identity", { contract_identity: "  " }, "missing_contract_identity"],
    ["missing confirmation source", { confirmation_source_identity: "" },
      "missing_confirmation_source_identity"],
    ["purge not inherited", { purge_minutes: PURGE_MINUTES - 1 }, "purge_minutes_not_inherited"],
    ["holdout fraction not inherited", { holdout_fraction: 0.3 },
      "holdout_fraction_not_inherited"],
    ["malformed freeze instant", { spec_frozen_at: "2026-09-01" },
      "missing_or_malformed_spec_frozen_at"],
    ["malformed discovery window", { discovery_window: { start: "x", end: "y" } },
      "missing_or_malformed_discovery_window"],
    ["malformed confirmation window", { confirmation_window: { start: "x", end: "y" } },
      "missing_or_malformed_confirmation_window"],
    ["empty confirmation window",
      { confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-09-02T00:00:00Z" } },
      "empty_confirmation_window"],
    ["overlapping windows",
      { confirmation_window: { start: "2026-06-01T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
      "confirmation_window_overlaps_discovery_window"],
    ["confirmation exactly at freeze", { spec_frozen_at: "2026-09-02T00:00:00Z" },
      "confirmation_window_starts_before_spec_freeze"],
    ["pre-freeze confirmation", { spec_frozen_at: "2026-10-01T00:00:00Z" },
      "confirmation_window_starts_before_spec_freeze"],
    ["contaminated by selection", { confirmation_used_for_selection: true },
      "confirmation_data_used_for_selection_or_ranking"],
    ["contaminated by tuning", { confirmation_used_for_tuning: true },
      "confirmation_data_used_for_tuning"],
    ["unaudited acceptance origin", { acceptance_origin: "self_asserted" },
      "acceptance_origin_not_audited_source_change"],
  ];

  it.each(failures)("fails closed: %s", (_l, over, expected) => {
    const r = validateConfirmatorySampleSufficiency(claim(over));
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain(expected);
  });

  it("the inherited purge embargo must separate discovery from confirmation", () => {
    const r = validateConfirmatorySampleSufficiency(claim({
      spec_frozen_at: "2026-08-30T00:00:00Z",
      discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
      confirmation_window: { start: "2026-08-31T00:30:00Z", end: "2026-11-01T00:00:00Z" },
    }));
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain("inherited_purge_gap_not_respected");
  });

  it("rejects a missing or non-object claim", () => {
    const r = validateConfirmatorySampleSufficiency(
      undefined as unknown as ConfirmatorySampleSufficiencyClaim,
    );
    expect(r).toEqual({ admissible: false, reasons: ["missing_claim"] });
  });

  it("the binding builder is fail-closed and mints only validated bindings", async () => {
    const ok = await buildConfirmatorySampleSufficiencyBinding(claim());
    expect(ok.built).toBe(true);
    if (!ok.built) throw new Error("unreachable");
    expect(ok.binding.claim_hash).toBe(await confirmatorySampleSufficiencyClaimHash(claim()));
    expect(ok.binding.procedure_hash).toBe(CONFIRMATORY_SAMPLE_SUFFICIENCY_PROCEDURE_HASH);
    expect(validateConfirmatorySampleSufficiencyBinding(ok.binding))
      .toEqual({ admissible: true, reasons: [] });

    const bad = await buildConfirmatorySampleSufficiencyBinding(
      claim({ confirmation_used_for_selection: true }),
    );
    expect(bad.built).toBe(false);
    expect(bad.binding).toBeNull();
    expect(bad.reasons.join(" | ")).toContain("confirmation_data_used_for_selection_or_ranking");

    expect(validateConfirmatorySampleSufficiencyBinding(null))
      .toEqual({ admissible: false, reasons: ["missing_sufficiency_binding"] });
    expect(validateConfirmatorySampleSufficiencyBinding({
      ...ok.binding, claim_hash: "nope",
    }).reasons).toContain("binding_malformed_claim_hash");
    expect(validateConfirmatorySampleSufficiencyBinding({
      ...ok.binding, research_version: RESEARCH_VERSION_V4,
    }).reasons).toContain("binding_research_version_not_after_frozen_negative");
    expect(validateConfirmatorySampleSufficiencyBinding({
      ...ok.binding, contract_identity: " ",
    }).reasons).toContain("binding_missing_contract_identity");
    expect(validateConfirmatorySampleSufficiencyBinding({
      ...ok.binding, procedure_version: RON_CONFIRMATORY_SAMPLE_SUFFICIENCY_VERSION + 1,
    }).reasons).toContain("binding_procedure_version_mismatch");
    expect(validateConfirmatorySampleSufficiencyBinding({
      ...ok.binding, procedure_hash: "f".repeat(64),
    }).reasons).toContain("binding_procedure_hash_mismatch");
  });

  it("nothing here promotes anything", () => {
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});
