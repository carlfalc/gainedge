/**
 * RON implementation marker 2D.2x — POST-FREEZE CONFIRMATORY DATA READINESS SUMMARY.
 *
 * Pure summary only. No I/O, persistence, research execution, probability, promotion,
 * order placement or live execution.
 *
 * The inherited minimum is a BLOCK-VIABILITY floor only. It does not prove statistical
 * power, MDE, significance or that any candidate will pass the research gate.
 */
import { MIN_TEST_OBS_PER_FOLD } from "./ron-research.ts";

export const RON_POST_V4_DATA_READINESS_VERSION = 1;

export const POST_V4_DATA_READINESS_POLICY = {
  summary_version: RON_POST_V4_DATA_READINESS_VERSION,
  inherited_minimum_per_direction: MIN_TEST_OBS_PER_FOLD,
  minimum_meaning: "minimum_confirmatory_block_viability_only",
  proves_statistical_power: false,
  proves_mde: false,
  proves_significance: false,
  authorizes_research_run: false,
  accepts_research_contract: false,
  creates_probability: false,
  creates_promotion: false,
  execution_path: "signal_only",
  allow_live_execution: false,
} as const;

export interface PostV4DataReadinessInput {
  confirmation_start: string;
  effective_end: string;
  source_as_of: string;
  source_bar_cutoff: string;
  feature_grid_bars: number;
  continuity_splitting_defects: number;
  continuity_defects: number;
  eligible_long: number;
  eligible_short: number;
  exclusions: Readonly<Record<string, number>>;
}

export interface PostV4DataReadinessSummary {
  summary_version: number;
  confirmation_start: string;
  effective_end: string;
  source_as_of: string;
  source_bar_cutoff: string;
  inherited_minimum_per_direction: number;
  eligible_observations: { long: number; short: number };
  minimum_viability: {
    long: boolean;
    short: boolean;
    both_directions: boolean;
  };
  feature_grid_bars: number;
  continuity: {
    defects: number;
    splitting_defects: number;
  };
  exclusions: Readonly<Record<string, number>>;
  meaning: "observation_only" | "minimum_block_viability_observed";
  non_claims: readonly string[];
  research_run_authorized: false;
  executable: false;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const instant = (v: unknown): number | null =>
  typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;

export function summarizePostV4DataReadiness(
  input: PostV4DataReadinessInput,
): PostV4DataReadinessSummary {
  const start = instant(input.confirmation_start);
  const end = instant(input.effective_end);
  const asOf = instant(input.source_as_of);
  const cutoff = instant(input.source_bar_cutoff);
  if (start == null || end == null || asOf == null || cutoff == null) {
    throw new Error("malformed_readiness_boundary");
  }
  if (end < start) throw new Error("effective_end_before_confirmation_start");
  if (cutoff > asOf) throw new Error("source_bar_cutoff_after_source_as_of");

  for (const [name, value] of Object.entries({
    feature_grid_bars: input.feature_grid_bars,
    continuity_splitting_defects: input.continuity_splitting_defects,
    continuity_defects: input.continuity_defects,
    eligible_long: input.eligible_long,
    eligible_short: input.eligible_short,
  })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`invalid_nonnegative_count: ${name}`);
  }

  const long = input.eligible_long >= MIN_TEST_OBS_PER_FOLD;
  const short = input.eligible_short >= MIN_TEST_OBS_PER_FOLD;
  const both = long && short;

  return {
    summary_version: RON_POST_V4_DATA_READINESS_VERSION,
    confirmation_start: input.confirmation_start,
    effective_end: input.effective_end,
    source_as_of: input.source_as_of,
    source_bar_cutoff: input.source_bar_cutoff,
    inherited_minimum_per_direction: MIN_TEST_OBS_PER_FOLD,
    eligible_observations: { long: input.eligible_long, short: input.eligible_short },
    minimum_viability: { long, short, both_directions: both },
    feature_grid_bars: input.feature_grid_bars,
    continuity: {
      defects: input.continuity_defects,
      splitting_defects: input.continuity_splitting_defects,
    },
    exclusions: { ...input.exclusions },
    meaning: both ? "minimum_block_viability_observed" : "observation_only",
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
    research_run_authorized: false,
    executable: false,
  };
}
