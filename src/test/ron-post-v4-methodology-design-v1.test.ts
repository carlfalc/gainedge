import { describe, expect, it } from "vitest";
import {
  CONFIRMATORY_INFERENCE, EXECUTION_INVARIANTS, HYPOTHESIS_COUNT, LOOKBACK_BARS,
  NEW_METHODOLOGY_CHOICES, NOMINAL_STATE_VARIABLES, ORDINAL_LEVEL_ORDER,
  ORDINAL_STATE_VARIABLES, PROPOSED_CANDIDATES, PROPOSED_PROMOTION_GATE,
  PROPOSED_RESEARCH_VERSION, TRANSITION_VARIABLES, currentPostV4MethodologyDesign,
  deriveTransition, deriveTransitionVector, methodologyDesignHash, normalQuantile,
  prospectiveMde,
} from "../../supabase/functions/_shared/ron-post-v4-methodology-design.ts";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4.ts";
import { MIN_TEST_OBS_PER_FOLD, PROMOTION_GATE, PURGE_MINUTES } from "../../supabase/functions/_shared/ron-research.ts";
import { ACCEPTED_PROMOTION_MANIFEST, CURRENT_ACCEPTED_ARTIFACT_REGISTRY } from "../../supabase/functions/_shared/ron-promotion-readiness.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const src = () => Deno_readFallback();
function Deno_readFallback(): string {
  // Read module source for static prohibition checks.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  return fs.readFileSync("supabase/functions/_shared/ron-post-v4-methodology-design.ts", "utf8");
}

describe("2D.3c post-V4 methodology design", () => {
  it("is deterministic and hash-stable", async () => {
    const a = await methodologyDesignHash();
    const b = await methodologyDesignHash();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("exposes an unaccepted, non-executable state", async () => {
    const d = await currentPostV4MethodologyDesign();
    expect(d.accepted).toBe(false);
    expect(d.executable).toBe(false);
    expect(d.research_run_authorized).toBe(false);
    expect(d.proposed_research_version).toBe(RESEARCH_VERSION_V4 + 1);
    expect(PROPOSED_RESEARCH_VERSION).toBe(5);
  });

  it("has a finite, deterministically ordered, unique candidate universe", () => {
    const names = PROPOSED_CANDIDATES.map((c) => c.name);
    expect(names.length).toBe((ORDINAL_STATE_VARIABLES.length + NOMINAL_STATE_VARIABLES.length) * 2);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(names);
    expect(HYPOTHESIS_COUNT).toBe(names.length * 2);
  });

  it("derives transitions deterministically and fails closed", () => {
    expect(deriveTransition("rsi_zone", "rsi_55_65", "rsi_45_55")).toBe("up");
    expect(deriveTransition("rsi_zone", "rsi_45_55", "rsi_55_65")).toBe("down");
    expect(deriveTransition("rsi_zone", "rsi_45_55", "rsi_45_55")).toBe("flat");
    expect(deriveTransition("regime", "trend", "range")).toBe("changed");
    expect(deriveTransition("regime", "trend", "trend")).toBe("same");
    expect(deriveTransition("rsi_zone", "unknown", "rsi_45_55")).toBe("unavailable");
    expect(deriveTransition("not_a_variable", "a", "b")).toBe("unavailable");
    const v = deriveTransitionVector({ now: { rsi_zone: "rsi_45_55" }, past: null });
    expect(Object.keys(v).sort()).toEqual([...TRANSITION_VARIABLES].sort());
    expect(Object.values(v).every((x) => x === "unavailable")).toBe(true);
  });

  it("uses only accepted level orderings", () => {
    for (const v of ORDINAL_STATE_VARIABLES) {
      const order = ORDINAL_LEVEL_ORDER[v];
      expect(order.length).toBeGreaterThan(1);
      expect(new Set(order).size).toBe(order.length);
    }
  });

  it("inherits purge-derived lookback and all V4 numeric gate values", () => {
    expect(LOOKBACK_BARS).toBe(PURGE_MINUTES / 15);
    expect(PROPOSED_PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline)
      .toBe(PROMOTION_GATE_V4.min_aggregate_brier_improvement_vs_baseline);
    expect(PROPOSED_PROMOTION_GATE.min_fold_win_fraction).toBe(PROMOTION_GATE_V4.min_fold_win_fraction);
    expect(PROPOSED_PROMOTION_GATE.min_non_global_coverage).toBe(PROMOTION_GATE_V4.min_non_global_coverage);
    expect(PROPOSED_PROMOTION_GATE.holdout_required).toBe(true);
    expect(PROPOSED_PROMOTION_GATE.strictly_stronger_than_gate_version_2).toBe(true);
    expect(CONFIRMATORY_INFERENCE.inherited_block_floor).toBe(MIN_TEST_OBS_PER_FOLD);
    expect(CONFIRMATORY_INFERENCE.required_detectable_effect)
      .toBe(PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline);
  });

  it("applies bonferroni multiplicity across candidates and directions", () => {
    expect(CONFIRMATORY_INFERENCE.multiplicity).toBe("bonferroni");
    expect(CONFIRMATORY_INFERENCE.hypotheses).toBe(HYPOTHESIS_COUNT);
    expect(CONFIRMATORY_INFERENCE.per_hypothesis_alpha)
      .toBeCloseTo(0.05 / HYPOTHESIS_COUNT, 12);
  });

  it("computes a prospective MDE without any empirical effect size", () => {
    expect(normalQuantile(0.5)).toBe(0);
    expect(normalQuantile(0.975)!).toBeCloseTo(1.959964, 4);
    expect(prospectiveMde(0.1, 4000)).toBeGreaterThan(0);
    expect(prospectiveMde(0, 4000)).toBeNull();
    expect(prospectiveMde(0.1, 1)).toBeNull();
    // deterministic
    expect(prospectiveMde(0.1, 4000)).toBe(prospectiveMde(0.1, 4000));
  });

  it("declares new choices explicitly and publishes no probability or execution", () => {
    expect(NEW_METHODOLOGY_CHOICES).toContain("familywise_alpha_0_05_new_constant");
    expect(EXECUTION_INVARIANTS.execution_path).toBe("signal_only");
    expect(EXECUTION_INVARIANTS.allow_live_execution).toBe(false);
    expect(EXECUTION_INVARIANTS.publishes_numeric_probability).toBe(false);
  });

  it("performs no runtime I/O and no persistence", () => {
    const s = src();
    for (const forbidden of [
      "createClient", "supabase", "Deno.env", "fetch(", ".insert(", ".upsert(", ".update(",
      "confidence_score", "probability =",
    ]) {
      expect(s.includes(forbidden)).toBe(false);
    }
  });

  it("leaves the acceptance registry and promotion manifests untouched", () => {
    expect(ACCEPTED_PROMOTION_MANIFEST.length).toBe(0);
    expect(PROMOTED_STATE_VARIABLES.length).toBe(0);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts.length).toBe(2);
    expect(CURRENT_ACCEPTED_ARTIFACT_REGISTRY.artifacts.map((a) => a.artifact_kind))
      .toEqual(["prerequisite_resolution", "prerequisite_resolution"]);
  });
});
