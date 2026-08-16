/**
 * RON_CALIBRATION_DIAGNOSTIC_CONTEXT_V2 — adversarial proofs.
 *
 * Fixtures mirror the accepted production artifacts. Every Brier/ECE/sample value here is a
 * DIAGNOSTIC MEASUREMENT OF A PERSISTED ARTIFACT — never a market probability, never a
 * trade-direction claim.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildCalibrationValidationEvidence, calibrationValidationSpecHash,
  CALIBRATION_VALIDATION_SPEC_V1, type CalibrationValidationInput,
} from "../../supabase/functions/_shared/ron-calibration-validation-spec";
import {
  baselineRelation, buildCalibrationDiagnosticContextEvidenceV2,
  calibrationDiagnosticContextSpecHashV2, CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2,
  CALIBRATION_VALIDATION_SPEC_V1_HASH_PINNED, combinedBaselinePair,
  eceOrdering, sampleRelation,
} from "../../supabase/functions/_shared/ron-calibration-diagnostic-context-v2";
import {
  evidenceHash, scanDenylist, validateEvidence,
} from "../../supabase/functions/_shared/ron-agent-contracts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";

const V1 = CALIBRATION_VALIDATION_SPEC_V1;
const V2 = CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2;
const R = V1.accepted_research_v4;
const C = V1.accepted_calibration_v8;

const candidates = Array.from({ length: R.candidate_rows }, (_, i) => ({
  direction: i % 2 === 0 ? "long" : "short",
  candidate: `cand_${String(i).padStart(3, "0")}`,
  promising_for_2d2: false,
}));

const accepted = (): CalibrationValidationInput => ({
  instrument: "XAUUSD", timeframe: "15m",
  run_id: "test-run", trace_id: "test-trace",
  research_v4_runs: [{
    id: R.id, research_version: R.research_version, quality_version: R.quality_version,
    feature_version: R.feature_version, label_version: R.label_version,
    source_as_of: R.source_as_of, source_bar_cutoff: R.source_bar_cutoff,
    definition_hash: R.definition_hash, run_hash: R.run_hash,
    results_digest: R.results_digest, status: R.status,
  }],
  research_v4_candidates: candidates.map((c) => ({ ...c })),
  calibration_v8_runs: [{
    id: C.id, calibration_version: C.calibration_version,
    feature_version: C.feature_version, label_version: C.label_version,
    source_as_of: C.source_as_of, source_bar_cutoff: C.source_bar_cutoff,
    definition_hash: C.definition_hash, run_hash: C.run_hash, status: C.status,
    canonical_rows: C.canonical_rows, eligible_long: C.eligible_long,
    eligible_short: C.eligible_short,
    long: { brier: 0.225057, naive_brier: 0.229358, ece: 0.021597, n_fit: 7692, n_holdout: 3298, n_eligible: 10990 },
    short: { brier: 0.232781, naive_brier: 0.232498, ece: 0.036618, n_fit: 7692, n_holdout: 3298, n_eligible: 10990 },
  }],
  calibration_v8_stat_cells: C.stat_cells,
  promoted_state_variables: PROMOTED_STATE_VARIABLES,
});

const txt = (e: { observations: { key: string; value_text?: string }[] }, k: string) =>
  e.observations.find((o) => o.key === k)?.value_text;

describe("calibration V2 — lineage and frozen V1 preservation", () => {
  it("keeps the V1 spec hash byte-frozen and pins it exactly", async () => {
    const v1 = await calibrationValidationSpecHash();
    expect(v1).toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(CALIBRATION_VALIDATION_SPEC_V1_HASH_PINNED).toBe(v1);
    expect(V2.inherits.base_spec_hash).toBe(v1);
  });

  it("shares the spec/agent lineage but is version- and hash-distinct", async () => {
    expect(V2.spec_id).toBe(V1.spec_id);
    expect(V2.agent_id).toBe("calibration_model_validation");
    expect(V2.agent_version).toBe(1);
    expect(V2.spec_version).toBe(2);
    expect(V2.supersedes_spec_version).toBe(1);
    const h2 = await calibrationDiagnosticContextSpecHashV2();
    expect(h2).toHaveLength(64);
    expect(h2).not.toBe(await calibrationValidationSpecHash());
    expect(h2).toBe(await calibrationDiagnosticContextSpecHashV2());
  });

  it("V1 evidence output is unchanged by the existence of V2", async () => {
    const a = await buildCalibrationValidationEvidence(accepted());
    expect(await evidenceHash(a))
      .toBe(await evidenceHash(await buildCalibrationValidationEvidence(accepted())));
    expect(a.observations.some((o) => o.key === "combined_baseline_relation_pair")).toBe(false);
    expect(a.observations.some((o) => o.key === "validation_interpretation_state")).toBe(false);
  });

  it("V2 re-runs no research or calibration and declares zero new thresholds", () => {
    expect(V2.inherits.validation_recomputed_in_v2).toBe(false);
    expect(V2.inherits.research_rerun_in_v2).toBe(false);
    expect(V2.inherits.calibration_rerun_in_v2).toBe(false);
    expect(V2.inherits.new_numeric_thresholds_introduced).toBe(0);
    expect(V2.diagnostic_context_contract.tolerance_applied).toBe(false);
    expect(V2.diagnostic_context_contract.magnitude_buckets_emitted).toBe(false);
  });
});

describe("calibration V2 — accepted artifact descriptive context", () => {
  it("emits long better / short worse WITHOUT changing direction or recommendation", async () => {
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    expect(validateEvidence(e)).toEqual([]);
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("research_only");
    expect(txt(e, "long_baseline_relation_on_artifact")).toBe("better_than_naive_on_artifact");
    expect(txt(e, "short_baseline_relation_on_artifact")).toBe("worse_than_naive_on_artifact");
    expect(txt(e, "combined_baseline_relation_pair"))
      .toBe("long:better_than_naive_on_artifact|short:worse_than_naive_on_artifact");
    expect(txt(e, "baseline_relation_scope")).toBe("artifact_diagnostic_not_directional_authority");
    expect(txt(e, "ece_ordering_on_artifact")).toBe("long_ece_lower_on_artifact");
    expect(txt(e, "eligible_sample_relation")).toBe("direction_samples_equal");
    expect(txt(e, "fit_sample_relation")).toBe("direction_samples_equal");
    expect(txt(e, "holdout_sample_relation")).toBe("direction_samples_equal");
    expect(txt(e, "validation_interpretation_state"))
      .toBe("validated_artifacts_research_only_no_promotions");
    expect(txt(e, "calibration_diagnostic_context_state")).toBe("evaluated");
  });

  it("cites both the V2 spec and the pinned V1 base spec", async () => {
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    const h2 = await calibrationDiagnosticContextSpecHashV2();
    const h1 = await calibrationValidationSpecHash();
    expect(e.provenance_refs).toContain(`spec:${V2.spec_id}:v2:${h2}`);
    expect(e.provenance_refs).toContain(`base_spec:${V1.spec_id}:v1:${h1}`);
    expect(e.provenance_refs.filter((p) => p.startsWith(`spec:${V1.spec_id}:v1:`))).toEqual([]);
    expect(e.dependencies).toContain(`calibration_validation_spec_v1:${h1}`);
  });

  it("preserves the frozen V1 observations and artifact instants verbatim", async () => {
    const base = await buildCalibrationValidationEvidence(accepted());
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    expect(e.as_of).toBe(base.as_of);
    expect(e.source_timestamps).toEqual(base.source_timestamps);
    expect(e.data_health).toEqual(base.data_health);
    for (const o of base.observations) expect(e.observations).toContainEqual(o);
  });
});

describe("calibration V2 — exact transforms, all branches", () => {
  it("covers all three baseline relations with no threshold", () => {
    expect(baselineRelation(0.1, 0.2)).toBe("better_than_naive_on_artifact");
    expect(baselineRelation(0.2, 0.1)).toBe("worse_than_naive_on_artifact");
    expect(baselineRelation(0.2, 0.2)).toBe("equal_to_naive_on_artifact");
    // An arbitrarily small difference is still an exact ordering, never "equal".
    expect(baselineRelation(0.2, 0.2 + 1e-12)).toBe("better_than_naive_on_artifact");
  });

  it("covers all three ECE orderings", () => {
    expect(eceOrdering(0.01, 0.02)).toBe("long_ece_lower_on_artifact");
    expect(eceOrdering(0.02, 0.01)).toBe("short_ece_lower_on_artifact");
    expect(eceOrdering(0.02, 0.02)).toBe("ece_equal_on_artifact");
  });

  it("covers all three sample relations", () => {
    expect(sampleRelation(5, 4)).toBe("long_more");
    expect(sampleRelation(4, 5)).toBe("short_more");
    expect(sampleRelation(4, 4)).toBe("direction_samples_equal");
  });

  it("the combined pair vocabulary is lossless over all nine ordered pairs", () => {
    expect(V2.diagnostic_context_contract.combined_baseline_pairs).toHaveLength(9);
    expect(new Set(V2.diagnostic_context_contract.combined_baseline_pairs).size).toBe(9);
    expect(V2.diagnostic_context_contract.combined_baseline_pairs)
      .toContain(combinedBaselinePair("equal_to_naive_on_artifact", "equal_to_naive_on_artifact"));
  });

  it("equal-on-artifact and inverted branches surface end-to-end without direction change", async () => {
    const i = accepted();
    i.calibration_v8_runs[0].long.brier = i.calibration_v8_runs[0].long.naive_brier;
    i.calibration_v8_runs[0].short.brier = 0.2;
    i.calibration_v8_runs[0].short.naive_brier = 0.3;
    i.calibration_v8_runs[0].short.ece = 0.001;
    const e = await buildCalibrationDiagnosticContextEvidenceV2(i);
    expect(e.status).toBe("supported");
    expect(txt(e, "long_baseline_relation_on_artifact")).toBe("equal_to_naive_on_artifact");
    expect(txt(e, "short_baseline_relation_on_artifact")).toBe("better_than_naive_on_artifact");
    expect(txt(e, "ece_ordering_on_artifact")).toBe("short_ece_lower_on_artifact");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("research_only");
  });

  it("equal ECE surfaces end-to-end", async () => {
    const i = accepted();
    i.calibration_v8_runs[0].short.ece = i.calibration_v8_runs[0].long.ece;
    const e = await buildCalibrationDiagnosticContextEvidenceV2(i);
    expect(txt(e, "ece_ordering_on_artifact")).toBe("ece_equal_on_artifact");
  });
});

describe("calibration V2 — fail-closed inheritance", () => {
  const blocked = async (mut: (i: CalibrationValidationInput) => void) => {
    const i = accepted(); mut(i);
    const base = await buildCalibrationValidationEvidence(i);
    const e = await buildCalibrationDiagnosticContextEvidenceV2(i);
    expect(validateEvidence(e)).toEqual([]);
    expect(e.status).toBe(base.status);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.conflicts).toEqual(base.conflicts);
    expect(txt(e, "calibration_diagnostic_context_state")).toBe("context_withheld");
    expect(txt(e, "validation_interpretation_state")).toBe("interpretation_withheld_v1_not_accepted");
    // No accepted interpretation or favourable context may exist on a blocked run.
    expect(e.observations.some((o) => o.key === "combined_baseline_relation_pair")).toBe(false);
    expect(e.observations.some((o) => o.key === "ece_ordering_on_artifact")).toBe(false);
    expect(e.observations.some((o) => o.key === "eligible_sample_relation")).toBe(false);
    return e;
  };

  it("missing research artifact stays blocked in V2", () => blocked((i) => { i.research_v4_runs = []; }));
  it("duplicate calibration artifact stays blocked in V2", () =>
    blocked((i) => { i.calibration_v8_runs = [i.calibration_v8_runs[0], { ...i.calibration_v8_runs[0], id: "z".repeat(36) }]; }));
  it("identity mismatch stays blocked in V2", () =>
    blocked((i) => { i.calibration_v8_runs[0].run_hash = "1".repeat(64); }));
  it("malformed metric stays blocked in V2", () =>
    blocked((i) => { i.calibration_v8_runs[0].long.brier = Number.NaN; }));
  it("stat cell count mismatch stays blocked in V2", () =>
    blocked((i) => { i.calibration_v8_stat_cells = 127; }));
  it("any promoted state variable fails closed via V1", () =>
    blocked((i) => { i.promoted_state_variables = ["adx_bucket"]; }));
  it("a promotable research candidate fails closed via V1", () =>
    blocked((i) => { i.research_v4_candidates[0].promising_for_2d2 = true; }));

  it("zero promotions remain required and observed", async () => {
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    expect(V2.safety_contract.required_promoted_state_variable_count).toBe(0);
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    expect(e.observations.find((o) => o.key === "promoted_state_variable_count")!.value_num).toBe(0);
  });
});

describe("calibration V2 — safety semantics", () => {
  it("emits no probability / confidence / significance / edge / trade-geometry key", async () => {
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    expect(scanDenylist(e)).toEqual([]);
    const keys = e.observations.map((o) => o.key).join("|");
    expect(keys).not.toMatch(
      /probability|confidence|likelihood|significan|p_value|effect_size|expected_value|win_rate|edge|alpha|profit|entry|stop_loss|take_profit|lot|position_size/i);
  });

  it("emits no significance / edge / recommendation language in observation values", async () => {
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    const values = e.observations.map((o) => o.value_text ?? "").join("|");
    expect(values).not.toMatch(
      /significan|probabilit|confidence|edge|forecast|predict|expected_value|profit|buy|sell|strong|weak/i);
  });

  it("declares the explicit safety limitations", async () => {
    const e = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    const l = e.uncertainty.limitations.join(" ");
    expect(l).toMatch(/NOT a market directional recommendation/);
    expect(l).toMatch(/does not authorize favouring either trade direction/);
    expect(l).toMatch(/no production approval is conferred/);
    expect(l).toMatch(/no threshold, tolerance, magnitude or significance/);
    expect(V2.safety_contract.execution_path).toBe("signal_only");
    expect(V2.safety_contract.allow_live_execution).toBe(false);
    expect(V2.safety_contract.current_market_probability_emitted_or_inferable).toBe(false);
    expect(V2.safety_contract.statistical_significance_claimed).toBe(false);
    expect(V2.safety_contract.predictive_edge_claimed).toBe(false);
    expect(V2.safety_contract.production_approval_conferred).toBe(false);
    expect(V2.safety_contract.persistence_default).toBe(false);
  });
});

describe("calibration V2 — determinism", () => {
  it("identical inputs give identical evidence hashes", async () => {
    const a = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    const b = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    expect(await evidenceHash(a)).toBe(await evidenceHash(b));
  });

  it("input row order does not change the output hash", async () => {
    const base = accepted();
    const shuffled = accepted();
    shuffled.research_v4_candidates.reverse();
    expect(await evidenceHash(await buildCalibrationDiagnosticContextEvidenceV2(base)))
      .toBe(await evidenceHash(await buildCalibrationDiagnosticContextEvidenceV2(shuffled)));
  });

  it("has no wall-clock dependence", async () => {
    const a = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
    const real = Date.now;
    (Date as unknown as { now: () => number }).now = () => 4102444800000;
    try {
      const b = await buildCalibrationDiagnosticContextEvidenceV2(accepted());
      expect(await evidenceHash(a)).toBe(await evidenceHash(b));
      expect(b.as_of).toBe("2026-08-13T05:14:00.000Z");
    } finally { Date.now = real; }
  });
});

describe("calibration V2 — module and endpoint hygiene", () => {
  const v2Src = fs.readFileSync(path.resolve(__dirname,
    "../../supabase/functions/_shared/ron-calibration-diagnostic-context-v2.ts"), "utf8");
  const fnSrc = fs.readFileSync(path.resolve(__dirname,
    "../../supabase/functions/ron-agent-calibration-validation/index.ts"), "utf8");
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("the V2 producer is pure: no I/O, no clock, no LLM, no Falconer", () => {
    const c = code(v2Src);
    expect(c).not.toMatch(/falconer/i);
    expect(c).not.toMatch(/createClient|fetch\(|Deno\.env/);
    expect(c).not.toMatch(/Date\.now\(\)/);
    expect(c).not.toMatch(/ai\.gateway|openai|anthropic/i);
  });

  it("the endpoint default stays spec_version 1 and V2 is explicit-only", () => {
    expect(fnSrc).toContain("body.spec_version == null ? 1 : Number(body.spec_version)");
    expect(fnSrc).toContain("unsupported_spec_version");
    expect(fnSrc).toContain("const isV2 = specVersion === 2;");
  });

  it("V2-only response fields never appear on the V1 branch", () => {
    expect(fnSrc).toMatch(/\.\.\.\(isV2\s*\n?\s*\?\s*\{/);
    expect(fnSrc).toContain("base_spec_hash");
    expect(fnSrc).toContain("allow_live_execution: false");
  });

  it("the endpoint remains read-only, service-role and persist-opt-in", () => {
    const c = code(fnSrc);
    expect(c).not.toMatch(/falconer|metaapi/i);
    expect(c).not.toMatch(/ron_orchestrator_decisions|ron_decision_evidence/);
    expect(c).not.toMatch(/\.delete\(|\.update\(/);
    expect(fnSrc).toContain("body.persist === true");
    expect(fnSrc).toMatch(/let persisted = false;/);
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    // Persistence remains audit-scoped to run + evidence rows only.
    expect(fnSrc.match(/db\.from\("ron_agent_(runs|evidence)"\)/g)).toHaveLength(2);
  });

  it("keeps execution locked and probability null in the endpoint response", () => {
    expect(fnSrc).toContain("numeric_probability: null");
    expect(fnSrc).toContain('execution_path: "signal_only"');
    expect(fnSrc).toContain("execution_allowed: false");
  });
});
