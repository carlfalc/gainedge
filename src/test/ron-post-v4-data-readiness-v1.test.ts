import { describe, expect, it } from "vitest";
import {
  POST_V4_DATA_READINESS_POLICY,
  RON_POST_V4_DATA_READINESS_VERSION,
  summarizePostV4DataReadiness,
} from "../../supabase/functions/_shared/ron-post-v4-data-readiness";
import { MIN_TEST_OBS_PER_FOLD } from "../../supabase/functions/_shared/ron-research";

const base = () => ({
  confirmation_start: "2026-09-02T00:00:00Z",
  effective_end: "2026-11-01T00:00:00Z",
  source_as_of: "2026-11-01T00:15:00Z",
  source_bar_cutoff: "2026-11-01T00:00:00Z",
  feature_grid_bars: 4000,
  continuity_splitting_defects: 0,
  continuity_defects: 0,
  eligible_long: MIN_TEST_OBS_PER_FOLD,
  eligible_short: MIN_TEST_OBS_PER_FOLD,
  exclusions: { "long:ineligible": 12, "short:ineligible": 10 },
});

describe("2D.2x — post-freeze confirmatory data readiness summary", () => {
  it("reports the inherited minimum as viability only when both directions meet it", () => {
    const r = summarizePostV4DataReadiness(base());
    expect(r.summary_version).toBe(RON_POST_V4_DATA_READINESS_VERSION);
    expect(r.inherited_minimum_per_direction).toBe(MIN_TEST_OBS_PER_FOLD);
    expect(r.minimum_viability).toEqual({ long: true, short: true, both_directions: true });
    expect(r.meaning).toBe("minimum_block_viability_observed");
    expect(r.research_run_authorized).toBe(false);
    expect(r.executable).toBe(false);
  });

  it("fails the combined viability observation if either direction is below the inherited floor", () => {
    const r = summarizePostV4DataReadiness({ ...base(), eligible_short: MIN_TEST_OBS_PER_FOLD - 1 });
    expect(r.minimum_viability.long).toBe(true);
    expect(r.minimum_viability.short).toBe(false);
    expect(r.minimum_viability.both_directions).toBe(false);
    expect(r.meaning).toBe("observation_only");
  });

  it("never upgrades minimum viability into power, significance, promotion or execution", () => {
    const r = summarizePostV4DataReadiness(base());
    expect(POST_V4_DATA_READINESS_POLICY.minimum_meaning)
      .toBe("minimum_confirmatory_block_viability_only");
    expect(POST_V4_DATA_READINESS_POLICY.proves_statistical_power).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.proves_mde).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.proves_significance).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.authorizes_research_run).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.accepts_research_contract).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.creates_probability).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.creates_promotion).toBe(false);
    expect(POST_V4_DATA_READINESS_POLICY.execution_path).toBe("signal_only");
    expect(POST_V4_DATA_READINESS_POLICY.allow_live_execution).toBe(false);
    expect(r.non_claims).toContain("not_statistical_power");
    expect(r.non_claims).toContain("not_minimum_detectable_effect");
    expect(r.non_claims).toContain("not_significance");
    expect(r.non_claims).toContain("not_permission_for_trading_or_order_execution");
  });

  it("fails closed on malformed or reversed boundaries", () => {
    expect(() => summarizePostV4DataReadiness({ ...base(), confirmation_start: "bad" }))
      .toThrow("malformed_readiness_boundary");
    expect(() => summarizePostV4DataReadiness({
      ...base(), confirmation_start: "2026-11-02T00:00:00Z",
    })).toThrow("effective_end_before_confirmation_start");
  });

  it("fails closed on impossible source-clock ordering and invalid counts", () => {
    expect(() => summarizePostV4DataReadiness({
      ...base(), source_as_of: "2026-10-31T23:00:00Z",
    })).toThrow("source_bar_cutoff_after_source_as_of");
    expect(() => summarizePostV4DataReadiness({ ...base(), eligible_long: -1 }))
      .toThrow("invalid_nonnegative_count: eligible_long");
  });
});
