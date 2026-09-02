import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStrategyLabV2Checkpoint,
  runStrategyLabV2Generation,
} from "../../supabase/functions/_shared/strategy-lab-v2-engine";
import {
  STRATEGY_LAB_V2_EXECUTION_ALLOWED,
  STRATEGY_LAB_V2_MAX_CHUNK_EVALUATIONS,
  STRATEGY_LAB_V2_SEARCH_BUDGETS,
  strategyLabV2CheckpointComplete,
} from "../../supabase/functions/_shared/strategy-lab-v2-contracts";

function candles(count = 1_200) {
  return Array.from({ length: count }, (_, index) => {
    const baseline = 1_900 + index * 0.02;
    const close = baseline + Math.sin(index / 13) * 5 + Math.sin(index / 47) * 9;
    const previous = index === 0
      ? close
      : 1_900 + (index - 1) * 0.02 + Math.sin((index - 1) / 13) * 5 + Math.sin((index - 1) / 47) * 9;
    return {
      time: Date.UTC(2026, 0, 1) + index * 900_000,
      open: previous,
      high: Math.max(previous, close) + 1.5,
      low: Math.min(previous, close) - 1.5,
      close,
      volume: 100 + (index % 29) * 3,
    };
  });
}

describe("Strategy Lab V2 hosted-worker remediation", () => {
  it("replays an interrupted generation deterministically without exceeding the CPU chunk", () => {
    const source = candles(10_000);
    const checkpoint = createStrategyLabV2Checkpoint({
      agentId: "trend_structure",
      seed: 1_630_548_707,
      budget: STRATEGY_LAB_V2_SEARCH_BUDGETS.maximum.per_agent,
      generations: STRATEGY_LAB_V2_SEARCH_BUDGETS.maximum.generations,
    });
    const first = runStrategyLabV2Generation(source, checkpoint);
    const replay = runStrategyLabV2Generation(source, checkpoint);

    expect(first.evaluated).toHaveLength(STRATEGY_LAB_V2_MAX_CHUNK_EVALUATIONS);
    expect(first.evaluated.map((candidate) => candidate.candidate_hash))
      .toEqual(replay.evaluated.map((candidate) => candidate.candidate_hash));
    expect(first.checkpoint).toEqual(replay.checkpoint);
  });

  it("tests the exact maximum per-agent budget across eight bounded generations", () => {
    const source = candles();
    let checkpoint = createStrategyLabV2Checkpoint({
      agentId: "trend_structure",
      seed: 20260902,
      budget: STRATEGY_LAB_V2_SEARCH_BUDGETS.maximum.per_agent,
      generations: STRATEGY_LAB_V2_SEARCH_BUDGETS.maximum.generations,
    });
    const hashes: string[] = [];
    while (!strategyLabV2CheckpointComplete(checkpoint)) {
      const output = runStrategyLabV2Generation(source, checkpoint);
      expect(output.evaluated.length).toBeLessThanOrEqual(STRATEGY_LAB_V2_MAX_CHUNK_EVALUATIONS);
      hashes.push(...output.evaluated.map((candidate) => candidate.candidate_hash));
      checkpoint = output.checkpoint;
    }

    expect(checkpoint.tested).toBe(512);
    expect(checkpoint.completed_generations).toBe(8);
    expect(hashes).toHaveLength(512);
    expect(new Set(hashes).size).toBe(512);
    expect(STRATEGY_LAB_V2_EXECUTION_ALLOWED).toBe(false);
  });

  it("never treats an exhausted generation plan as a completed short budget", () => {
    const checkpoint = createStrategyLabV2Checkpoint({
      agentId: "momentum",
      seed: 7,
      budget: 64,
      generations: 1,
      tested: 63,
      completedGenerations: 1,
    });
    expect(strategyLabV2CheckpointComplete(checkpoint)).toBe(false);
    expect(() => runStrategyLabV2Generation(candles(), checkpoint))
      .toThrow("candidate_budget_not_reached:momentum:63/64");
  });

  it("keeps persisted candidates authoritative and exposes truthful partial progress", () => {
    const endpoint = readFileSync("supabase/functions/strategy-lab-v2-discover/index.ts", "utf8");
    const page = readFileSync("src/pages/dashboard/StrategyLabV2Page.tsx", "utf8");

    expect(endpoint.indexOf(".select(\"candidate_hash,score,genome,disqualified,generation,development_metrics\")"))
      .toBeLessThan(endpoint.indexOf("rows.length === stored.tested"));
    expect(endpoint).toContain("checkpoint_ahead_of_candidates");
    expect(endpoint).toContain("candidate_count_mismatch");
    expect(page).toContain("${tested}/${budget || \"—\"} tested");
    expect(page).toContain("width: `${agentPercent}%`");
    expect(page).toContain("Last retry:");
  });
});
