/**
 * Phase 2D.2c — adversarial proofs for the calibration_model_validation specialist v1.
 *
 * FIXTURES MIRROR THE ACCEPTED PRODUCTION ARTIFACTS. Nothing here is a trading claim; the
 * Brier/ECE values are diagnostic measurements of a persisted artifact only.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildCalibrationValidationEvidence, calibrationValidationSpecHash,
  CALIBRATION_VALIDATION_SPEC_V1, canonicalizeInput, validateAcceptedArtifacts,
  type CalibrationValidationInput,
} from "../../supabase/functions/_shared/ron-calibration-validation-spec";
import {
  evidenceHash, scanDenylist, validateEvidence,
} from "../../supabase/functions/_shared/ron-agent-contracts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture";
import { sessionStructureSpecHash } from "../../supabase/functions/_shared/ron-session-structure-spec";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2";

const S = CALIBRATION_VALIDATION_SPEC_V1;
const R = S.accepted_research_v4;
const C = S.accepted_calibration_v8;

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

const stateOf = (i: CalibrationValidationInput) => validateAcceptedArtifacts(i).state;
const obs = (e: { observations: { key: string; value_num?: number; value_text?: string }[] }, k: string) =>
  e.observations.find((o) => o.key === k);

describe("2D.2c — accepted artifact set", () => {
  it("classifies the exact accepted fixture as research-only", () => {
    expect(stateOf(accepted())).toBe("accepted_research_only");
  });

  it("emits supported, neutral, research_only evidence with zero promotion", async () => {
    const e = await buildCalibrationValidationEvidence(accepted());
    expect(validateEvidence(e)).toEqual([]);
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("research_only");
    expect(e.data_health.status).toBe("healthy");
    expect(e.data_health.completeness).toBe(1);
    expect(e.data_health.issues).toEqual([]);
    expect(obs(e, "validation_state")!.value_text).toBe("accepted_research_only");
    expect(obs(e, "publication_state")!.value_text).toBe("locked_not_calibrated_for_production");
    expect(obs(e, "promoted_state_variable_count")!.value_num).toBe(0);
    expect(obs(e, "research_candidate_rows")!.value_num).toBe(62);
    expect(obs(e, "research_promotable_rows")!.value_num).toBe(0);
    expect(obs(e, "calibration_cells")!.value_num).toBe(128);
    expect(obs(e, "calibration_canonical_rows")!.value_num).toBe(11631);
    expect(obs(e, "eligible_long_rows")!.value_num).toBe(10990);
    expect(obs(e, "eligible_short_rows")!.value_num).toBe(10990);
  });

  it("cites only artifacts it actually read, and only genuine artifact instants", async () => {
    const e = await buildCalibrationValidationEvidence(accepted());
    expect(e.provenance_refs).toContain(`research_run:${R.id}:v4:${R.run_hash}`);
    expect(e.provenance_refs).toContain(`calibration_run:${C.id}:v8:${C.run_hash}`);
    expect(e.provenance_refs.some((p) => p.startsWith(`spec:${S.spec_id}:v1:`))).toBe(true);
    expect(Object.keys(e.source_timestamps).sort()).toEqual([
      "calibration_run_source_as_of", "calibration_run_source_bar_cutoff",
      "research_run_source_as_of", "research_run_source_bar_cutoff",
    ]);
    expect(e.source_timestamps.research_run_source_as_of).toBe("2026-08-13T05:14:00.000Z");
    expect(e.as_of).toBe("2026-08-13T05:14:00.000Z");
    expect(e.data_health.freshness_minutes).toBe(0);
  });

  it("zero promotable candidates is NOT a failure", async () => {
    const e = await buildCalibrationValidationEvidence(accepted());
    expect(e.status).toBe("supported");
    expect(e.uncertainty.limitations.some((l) => /accepted expected result/.test(l))).toBe(true);
  });
});

describe("2D.2c — fail-closed adversarial cases", () => {
  const fail = async (mut: (i: CalibrationValidationInput) => void, expected: string) => {
    const i = accepted(); mut(i);
    expect(stateOf(i)).toBe(expected);
    const e = await buildCalibrationValidationEvidence(i);
    expect(validateEvidence(e)).toEqual([]);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.status).toBe("critical");
    expect(e.data_health.completeness).toBeLessThan(1);
    expect(e.conflicts).toEqual([`accepted_artifact_validation_failed:${expected}`]);
    return e;
  };

  it("V4 run missing", () => fail((i) => { i.research_v4_runs = []; }, "artifact_missing"));
  it("duplicate V4 canonical run", () =>
    fail((i) => { i.research_v4_runs = [i.research_v4_runs[0], { ...i.research_v4_runs[0], id: "b".repeat(36) }]; },
      "artifact_duplicate"));
  it("V4 run_hash mismatch", () => fail((i) => { i.research_v4_runs[0].run_hash = "0".repeat(64); }, "identity_mismatch"));
  it("V4 results_digest mismatch", () => fail((i) => { i.research_v4_runs[0].results_digest = "0".repeat(64); }, "identity_mismatch"));
  it("V4 definition_hash mismatch", () => fail((i) => { i.research_v4_runs[0].definition_hash = "0".repeat(64); }, "identity_mismatch"));
  it("V4 id mismatch", () => fail((i) => { i.research_v4_runs[0].id = "deadbeef"; }, "identity_mismatch"));
  it("V4 quality_version mismatch", () => fail((i) => { i.research_v4_runs[0].quality_version = 4; }, "lineage_mismatch"));
  it("V4 feature_version mismatch", () => fail((i) => { i.research_v4_runs[0].feature_version = 5; }, "lineage_mismatch"));
  it("V4 label_version mismatch", () => fail((i) => { i.research_v4_runs[0].label_version = 6; }, "lineage_mismatch"));
  it("V4 source_as_of mismatch", () => fail((i) => { i.research_v4_runs[0].source_as_of = "2026-08-12T22:14:00Z"; }, "lineage_mismatch"));
  it("V4 source_bar_cutoff mismatch", () => fail((i) => { i.research_v4_runs[0].source_bar_cutoff = "2026-08-12T20:45:00Z"; }, "lineage_mismatch"));
  it("V4 status mismatch", () => fail((i) => { i.research_v4_runs[0].status = "running"; }, "artifact_status_mismatch"));
  it("V4 candidate rows = 61", () => fail((i) => { i.research_v4_candidates.pop(); }, "count_mismatch"));
  it("V4 candidate rows = 63", () =>
    fail((i) => { i.research_v4_candidates.push({ direction: "long", candidate: "extra", promising_for_2d2: false }); },
      "count_mismatch"));
  it("V4 promotable > 0 is a promotion violation, never auto-promotion", async () => {
    const e = await fail((i) => { i.research_v4_candidates[0].promising_for_2d2 = true; }, "promotion_violation");
    expect(obs(e, "research_promotable_rows")!.value_num).toBe(1);
    expect(obs(e, "promoted_state_variable_count")!.value_num).toBe(0);
  });
  it("an unexpected promoted state variable fails closed", () =>
    fail((i) => { i.promoted_state_variables = ["adx_bucket"]; }, "promotion_violation"));

  it("calv8 missing", () => fail((i) => { i.calibration_v8_runs = []; }, "artifact_missing"));
  it("calv8 duplicated", () =>
    fail((i) => { i.calibration_v8_runs = [i.calibration_v8_runs[0], { ...i.calibration_v8_runs[0], id: "z".repeat(36) }]; },
      "artifact_duplicate"));
  it("calv8 run_hash mismatch", () => fail((i) => { i.calibration_v8_runs[0].run_hash = "1".repeat(64); }, "identity_mismatch"));
  it("calv8 definition_hash mismatch", () => fail((i) => { i.calibration_v8_runs[0].definition_hash = "1".repeat(64); }, "identity_mismatch"));
  it("calv8 status mismatch", () => fail((i) => { i.calibration_v8_runs[0].status = "production"; }, "artifact_status_mismatch"));
  it("calv8 canonical_rows mismatch", () => fail((i) => { i.calibration_v8_runs[0].canonical_rows = 11630; }, "count_mismatch"));
  it("calv8 eligible_long mismatch", () => fail((i) => { i.calibration_v8_runs[0].eligible_long = 10989; }, "count_mismatch"));
  it("calv8 eligible_short mismatch", () => fail((i) => { i.calibration_v8_runs[0].eligible_short = 1; }, "count_mismatch"));
  it("stat cell count mismatch", () => fail((i) => { i.calibration_v8_stat_cells = 127; }, "count_mismatch"));

  it("non-finite Brier fails closed", () => fail((i) => { i.calibration_v8_runs[0].long.brier = Number.NaN; }, "metric_malformed"));
  it("out-of-range ECE fails closed", () => fail((i) => { i.calibration_v8_runs[0].short.ece = 1.4; }, "metric_malformed"));
  it("sample non-conservation fails closed", () => fail((i) => { i.calibration_v8_runs[0].long.n_holdout = 3299; }, "metric_malformed"));
  it("malformed sample count fails closed", () => fail((i) => { i.calibration_v8_runs[0].short.n_fit = 1.5; }, "metric_malformed"));

  it("a malformed metric is omitted from observations rather than published", async () => {
    const i = accepted(); i.calibration_v8_runs[0].long.brier = Number.POSITIVE_INFINITY;
    const e = await buildCalibrationValidationEvidence(i);
    expect(obs(e, "long_brier")).toBeUndefined();
    expect(obs(e, "long_brier_minus_naive")).toBeUndefined();
  });
});

describe("2D.2c — diagnostic metrics are never converted into a trade claim", () => {
  it("short worse than naive is a labelled artifact measurement, not a direction", async () => {
    const e = await buildCalibrationValidationEvidence(accepted());
    expect(obs(e, "short_brier")!.value_num).toBe(0.232781);
    expect(obs(e, "short_naive_brier")!.value_num).toBe(0.232498);
    expect(obs(e, "short_vs_naive_state")!.value_text).toBe("worse_than_naive_on_artifact");
    expect(obs(e, "long_vs_naive_state")!.value_text).toBe("better_than_naive_on_artifact");
    expect(obs(e, "long_brier_minus_naive")!.value_num).toBeLessThan(0);
    // Neither direction leaks into the envelope direction, which stays neutral.
    expect(e.direction).toBe("neutral");
    expect(e.uncertainty.limitations.some((l) => /not a market forecast/.test(l))).toBe(true);
  });

  it("emits no probability/confidence/secret/causal key anywhere", async () => {
    const e = await buildCalibrationValidationEvidence(accepted());
    expect(scanDenylist(e)).toEqual([]);
    const keys = e.observations.map((o) => o.key).join("|");
    expect(keys).not.toMatch(/probability|confidence|likelihood|expected_value|win_rate/);
  });
});

describe("2D.2c — determinism", () => {
  it("identical inputs give identical spec and evidence hashes", async () => {
    const a = await buildCalibrationValidationEvidence(accepted());
    const b = await buildCalibrationValidationEvidence(accepted());
    expect(await evidenceHash(a)).toBe(await evidenceHash(b));
    expect(await calibrationValidationSpecHash()).toBe(await calibrationValidationSpecHash());
  });

  it("reordering candidate rows and runs does not change the output hash", async () => {
    const base = accepted();
    const shuffled = accepted();
    shuffled.research_v4_candidates.reverse();
    expect(await evidenceHash(await buildCalibrationValidationEvidence(base)))
      .toBe(await evidenceHash(await buildCalibrationValidationEvidence(shuffled)));
    expect(canonicalizeInput(shuffled).research_v4_candidates)
      .toEqual(canonicalizeInput(base).research_v4_candidates);
  });

  it("has no wall-clock dependence", async () => {
    const a = await buildCalibrationValidationEvidence(accepted());
    const real = Date.now;
    // deno-lint-ignore no-explicit-any
    (Date as any).now = () => 4102444800000; // 2100-01-01
    try {
      const b = await buildCalibrationValidationEvidence(accepted());
      expect(await evidenceHash(a)).toBe(await evidenceHash(b));
      expect(b.as_of).toBe("2026-08-13T05:14:00.000Z");
    } finally { Date.now = real; }
  });

  it("check evaluation order does not change the reported state (frozen precedence)", () => {
    const i = accepted();
    i.research_v4_runs = [];                       // artifact_missing
    i.calibration_v8_stat_cells = 5;               // count_mismatch
    expect(stateOf(i)).toBe("artifact_missing");
  });
});

describe("2D.2c — source hygiene and non-regression", () => {
  const specSrc = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/_shared/ron-calibration-validation-spec.ts"), "utf8");
  const fnSrc = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/ron-agent-calibration-validation/index.ts"), "utf8");

  it("the pure producer performs no I/O and never imports Falconer", () => {
    expect(specSrc).not.toMatch(/falconer/i);
    expect(specSrc).not.toMatch(/createClient|fetch\(|Deno\.env/);
    expect(specSrc).not.toMatch(/Date\.now\(\)/);
  });

  it("the endpoint has no trade, rerun, or orchestrator-decision path", () => {
    expect(fnSrc).not.toMatch(/falconer/i);
    expect(fnSrc).not.toMatch(/metaapi/i);
    expect(fnSrc).not.toMatch(/ron_orchestrator_decisions|ron_decision_evidence/);
    expect(fnSrc).not.toMatch(/ron-research|ron-calibrate|ron-rebuild|ron-label/);
    expect(fnSrc).not.toMatch(/\.delete\(|\.update\(/);
    expect(fnSrc).not.toMatch(/ai\.gateway|openai|anthropic/i);
  });

  it("in-code service-role auth remains mandatory and returns 401", () => {
    expect(fnSrc).toContain('unauthorized: internal service-role endpoint');
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnSrc).toContain("ron_agent_registry");
    expect(fnSrc).toMatch(/if \(!authorized\) return json\(\{ error: "unauthorized/);
  });

  it("config pins verify_jwt = false for the endpoint", () => {
    const cfg = fs.readFileSync(path.resolve(__dirname, "../../supabase/config.toml"), "utf8");
    expect(cfg).toMatch(/\[functions\.ron-agent-calibration-validation\]\s*\nverify_jwt = false/);
  });

  it("persist defaults to false", () => {
    expect(fnSrc).toContain("body.persist === true");
    expect(fnSrc).toMatch(/let persisted = false;/);
  });

  it("does not change the frozen Session V1/V2 spec hashes", async () => {
    expect(await sessionStructureSpecHash())
      .toBe("cd7153e30bf7fbba0fee80a22d032c82c2ef4f10191ffcdfbf5e08f95e2ee18c");
    expect((await sessionStructureSpecHashV2()).startsWith("9d104c60")).toBe(true);
  });

  it("keeps PROMOTED_STATE_VARIABLES empty", () => {
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });
});
