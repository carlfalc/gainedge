import { describe, expect, it } from "vitest";
import {
  auditStrategyLabV2Candles,
  finaliseStrategyLabV2,
  searchStrategyLabV2Agent,
} from "../../supabase/functions/_shared/strategy-lab-v2-engine";
import {
  DEFAULT_STRATEGY_LAB_V2_COSTS,
  STRATEGY_LAB_V2_EXECUTION_ALLOWED,
  STRATEGY_LAB_V2_SEARCH_AGENTS,
  STRATEGY_LAB_V2_SEARCH_BUDGETS,
} from "../../supabase/functions/_shared/strategy-lab-v2-contracts";

function candles(count = 4_000) {
  return Array.from({ length: count }, (_, index) => {
    const trend = 1_800 + index * 0.04;
    const close = trend + Math.sin(index / 18) * 8 + Math.sin(index / 73) * 16;
    const previous = index === 0
      ? close
      : 1_800 + (index - 1) * 0.04 + Math.sin((index - 1) / 18) * 8 + Math.sin((index - 1) / 73) * 16;
    return {
      time: Date.UTC(2025, 0, 1) + index * 900_000,
      open: previous,
      high: Math.max(previous, close) + 2,
      low: Math.min(previous, close) - 2,
      close,
      volume: 100 + (index % 31) * 4,
    };
  });
}

describe("Strategy Lab V2 discovery contracts", () => {
  it("keeps execution impossible and exposes a genuinely broad bounded search", () => {
    expect(STRATEGY_LAB_V2_EXECUTION_ALLOWED).toBe(false);
    expect(STRATEGY_LAB_V2_SEARCH_AGENTS).toHaveLength(7);
    expect(new Set(STRATEGY_LAB_V2_SEARCH_AGENTS.flatMap(agent => agent.families)).size).toBe(12);
    expect(STRATEGY_LAB_V2_SEARCH_BUDGETS.maximum.total).toBe(3_584);
  });

  it("is deterministic for a fixed seed and tests the requested independent genomes", () => {
    const source = candles();
    const audit = auditStrategyLabV2Candles(source);
    expect(audit.sufficient_for_search).toBe(true);
    expect(audit.holdout_start_index).toBe(3_400);
    const development = source.slice(0, audit.holdout_start_index);
    const first = searchStrategyLabV2Agent(development, "trend_structure", 24, 3, 42);
    const second = searchStrategyLabV2Agent(development, "trend_structure", 24, 3, 42);
    expect(first.tested).toBe(24);
    expect(first.candidates.map(candidate => candidate.candidate_hash))
      .toEqual(second.candidates.map(candidate => candidate.candidate_hash));
    expect(new Set(first.candidates.map(candidate => candidate.candidate_hash)).size).toBe(first.candidates.length);
  });

  it("returns an explicit evidence verdict after stress and sealed holdout evaluation", () => {
    const source = candles();
    const audit = auditStrategyLabV2Candles(source);
    const development = source.slice(0, audit.holdout_start_index);
    const output = searchStrategyLabV2Agent(development, "trend_structure", 24, 3, 91);
    const final = finaliseStrategyLabV2(source, audit, output.candidates, DEFAULT_STRATEGY_LAB_V2_COSTS, 60, 91);
    expect(["VIABLE_PAPER_CANDIDATE", "NO_VIABLE_STRATEGY_FOUND", "INCONCLUSIVE"])
      .toContain(final.verdict);
    expect(final.selected).not.toBeNull();
    expect(final.selected?.holdout_metrics).toBeTruthy();
    expect(final.selected?.stress_results.length).toBeGreaterThanOrEqual(6);
  });
});
