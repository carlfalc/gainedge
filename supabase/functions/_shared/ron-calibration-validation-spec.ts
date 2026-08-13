/**
 * RON Phase 2D.2c — CALIBRATION & MODEL VALIDATION SPECIALIST spec V1 (pure producer).
 *
 * This module is PURE: no I/O, no wall-clock read, no LLM, no Falconer import, no trading
 * path. It takes already-fetched artifact rows as explicit input and returns exactly one
 * UNSEALED EvidenceEnvelopeV1 for agent_id='calibration_model_validation'@1.
 *
 * WHAT THIS AGENT IS
 *   Authoritative VALIDATION evidence (authority class `calibration_validation`) proving,
 *   from persisted accepted artifacts, that RON's calibration lineage is intact AND that
 *   the system is still RESEARCH-ONLY with ZERO promoted predictive state variables.
 *
 * WHAT THIS AGENT IS NOT
 *   Not a direction model, not a confidence generator, not a strategy. Brier / ECE /
 *   sample counts published here are DIAGNOSTIC MEASUREMENTS OF A PERSISTED ARTIFACT.
 *   They are never a current-market probability and never license execution. Direction is
 *   restricted to `neutral` | `unknown` by construction.
 *
 * FAIL-CLOSED: any deviation from the frozen accepted identities below yields `blocked`
 * evidence with `critical` data health, so the orchestrator cannot proceed.
 *
 * NOTE ON A NON-FAILURE: Research V4 having ZERO promotable candidates is the ACCEPTED
 * expected result. It is evidence that the pipeline is honest, not that it is broken.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
  type EvidenceStatus, type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";

/* --------------------------------------------------------------- frozen spec */

/** Deterministic validation outcomes. Frozen — new members require a new spec version. */
export type ValidationState =
  | "accepted_research_only"
  | "artifact_missing"
  | "artifact_duplicate"
  | "identity_mismatch"
  | "lineage_mismatch"
  | "count_mismatch"
  | "artifact_status_mismatch"
  | "metric_malformed"
  | "promotion_violation";

export const VALIDATION_STATES: readonly ValidationState[] = [
  "accepted_research_only", "artifact_missing", "artifact_duplicate", "identity_mismatch",
  "lineage_mismatch", "count_mismatch", "artifact_status_mismatch", "metric_malformed",
  "promotion_violation",
] as const;

/**
 * Precedence when several checks fail at once. Lower index wins so the reported state is
 * deterministic and independent of check evaluation order.
 */
const STATE_PRECEDENCE: readonly ValidationState[] = [
  "artifact_missing", "artifact_duplicate", "promotion_violation", "lineage_mismatch",
  "identity_mismatch", "artifact_status_mismatch", "count_mismatch", "metric_malformed",
] as const;

export const CALIBRATION_VALIDATION_SPEC_V1 = {
  spec_id: "ron_calibration_model_validation",
  spec_version: 1,
  agent_id: "calibration_model_validation",
  agent_version: 1,
  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],

  /** Read-only artifact contract. This specialist never reruns or mutates anything. */
  source_contract: {
    mode: "read_only_persisted_artifacts",
    tables: [
      "ron_research_runs", "ron_research_candidate_results",
      "ron_calibration_runs", "ron_stat_cells",
    ],
    rerun_allowed: false,
    mutation_allowed: false,
    wall_clock_reads: false,
  },

  /** THE ACCEPTED CURRENT RESEARCH ARTIFACT (Phase 2D.1g / first Research V4 execution). */
  accepted_research_v4: {
    id: "af88ad45-f9d5-484c-8db9-e7d9ccf35e26",
    research_version: 4,
    quality_version: 5,
    feature_version: 6,
    label_version: 7,
    source_as_of: "2026-08-13T05:14:00.000Z",
    source_bar_cutoff: "2026-08-13T03:45:00.000Z",
    definition_hash: "b9ef77f4ceab74160bf068b76c4ddecb044fb676d15267afc9eda015a91c8454",
    run_hash: "e8636bfdeab3b9be08c9d90eff4ccf6e7ac54c1a2a73639b1a8029730dd9f903",
    results_digest: "69e36d58e69c7a9f1139e35b627df5b6a40b7e0828cb77f0b6951ca5ef8673f0",
    status: "complete",
    candidate_rows: 62,
    promotable_rows: 0,
  },

  /** THE ACCEPTED CURRENT CALIBRATION ARTIFACT (calibration v8). */
  accepted_calibration_v8: {
    id: "025075cc-2d73-4c58-9f26-9978f38b35fb",
    calibration_version: 8,
    feature_version: 6,
    label_version: 7,
    source_as_of: "2026-08-13T05:14:00.000Z",
    source_bar_cutoff: "2026-08-13T03:45:00.000Z",
    definition_hash: "2888c9f47b2c06456f4ffa669ecf90b050391565e228aaf749979f2f5c0bfcf8",
    run_hash: "f2511605fe5db78a074caa7c391e77d20c9b24e53b779bc62f983df99eb0b863",
    status: "research",
    canonical_rows: 11631,
    eligible_long: 10990,
    eligible_short: 10990,
    /** Bound deliberately: stat cells are an independently persisted accepted output. */
    stat_cells: 128,
  },

  /**
   * Immutable historical canaries. NOT current evidence inputs — they exist so a silent
   * rewrite of superseded lineage is still detectable. Checked only when supplied.
   */
  historical_canaries: {
    research_v3: {
      id: "e42af3db-0058-4cda-a91a-c2aad8e141c2",
      research_version: 3, quality_version: 4, feature_version: 5, label_version: 6,
      definition_hash: "e02d7dd68115b348b8b38cfd73233274ce91e4134f85d6e7e23f740fdd4fc05d",
      run_hash: "6e93ad29fde304288efe443f8fc65a52fec8ad1dc586103842bf472822aa7e95",
      results_digest: "ff1d5d606c272e9166eb6c8a82412ba8d2bad377e63602ac1d88d94257c7870a",
    },
    calibration_v7: {
      id: "3fcdb0cf-1935-4923-9932-68eb9ab0721b",
      calibration_version: 7, feature_version: 5, label_version: 6,
      definition_hash: "61f15c6c75e5554973b1838dbe7f6609b2bc45617852a9dc664b1cee9152420b",
      run_hash: "322002246fd53bec0f146006b6f391d688a917fa02540e51009ae88831a87063",
      canonical_rows: 11130, eligible_long: 10513, eligible_short: 10513,
    },
  },

  /** Diagnostic metric admissibility. Values outside these bounds fail closed. */
  metric_contract: {
    required_report_fields: ["brier", "naive_brier", "ece", "n_fit", "n_holdout", "n_eligible"],
    finite_required: true,
    brier_range: [0, 1],
    ece_range: [0, 1],
    /** n_fit + n_holdout must equal n_eligible, which must equal the run's eligible count. */
    sample_conservation_required: true,
    interpretation: "diagnostic_measurement_of_persisted_artifact_only",
  },

  /** Publication lock. Only a future accepted promotion phase may change this. */
  publication_contract: {
    publication_state: "locked_not_calibrated_for_production",
    numeric_probability_emitted: false,
    execution_allowed: false,
    execution_path: "signal_only",
    required_promoted_state_variable_count: 0,
  },

  validation_states: VALIDATION_STATES,
  state_precedence: STATE_PRECEDENCE,
} as const;

export async function calibrationValidationSpecHash(): Promise<string> {
  return await hashCanonical(CALIBRATION_VALIDATION_SPEC_V1);
}

/* -------------------------------------------------------------- input types */

export interface ResearchRunRow {
  id: string;
  research_version: number;
  quality_version: number;
  feature_version: number;
  label_version: number;
  source_as_of: string;
  source_bar_cutoff: string;
  definition_hash: string;
  run_hash: string;
  results_digest: string;
  status: string;
}

export interface CandidateRow {
  direction: string;
  candidate: string;
  promising_for_2d2: boolean;
}

export interface DirectionReportMetrics {
  brier: number;
  naive_brier: number;
  ece: number;
  n_fit: number;
  n_holdout: number;
  n_eligible: number;
}

export interface CalibrationRunRow {
  id: string;
  calibration_version: number;
  feature_version: number;
  label_version: number;
  source_as_of: string;
  source_bar_cutoff: string;
  definition_hash: string;
  run_hash: string;
  status: string;
  canonical_rows: number;
  eligible_long: number;
  eligible_short: number;
  long: DirectionReportMetrics;
  short: DirectionReportMetrics;
}

export interface CalibrationValidationInput {
  instrument: string;
  timeframe: string;
  run_id: string;
  trace_id: string;
  /** ALL rows currently matching research_version=4 (duplicate detection is a check). */
  research_v4_runs: ResearchRunRow[];
  /** ALL candidate rows for the canonical V4 run. */
  research_v4_candidates: CandidateRow[];
  /** ALL rows currently matching calibration_version=8. */
  calibration_v8_runs: CalibrationRunRow[];
  /** Independently counted stat cells for calibration_version=8. */
  calibration_v8_stat_cells: number;
  /** Canonical in-code promotion source. Must be `PROMOTED_STATE_VARIABLES`. */
  promoted_state_variables: readonly string[];
}

/* ------------------------------------------------------------------ helpers */

const num = (key: string, value_num: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num, ...(at ? { at } : {}), ...(unit ? { unit } : {}) });

const state = (key: string, value_text: string, at?: string): Observation =>
  ({ key, kind: "state", value_text, ...(at ? { at } : {}) });

const ref = (key: string, value_text: string): Observation =>
  ({ key, kind: "reference", value_text });

/** Normalize a persisted timestamp to a canonical UTC ISO instant, or null if unusable. */
export function isoInstant(v: string | null | undefined): string | null {
  if (typeof v !== "string" || !v.length) return null;
  const t = Date.parse(v.includes("T") ? v : v.replace(" ", "T"));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

const sameInstant = (a: string | null | undefined, b: string): boolean =>
  isoInstant(a) === isoInstant(b);

const finiteIn = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

const nonNegInt = (v: unknown): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/** DB result order must never change output. */
export function canonicalizeInput(input: CalibrationValidationInput): CalibrationValidationInput {
  return {
    ...input,
    research_v4_runs: [...input.research_v4_runs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    calibration_v8_runs: [...input.calibration_v8_runs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    research_v4_candidates: [...input.research_v4_candidates].sort((a, b) =>
      a.direction !== b.direction
        ? (a.direction < b.direction ? -1 : 1)
        : (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0)),
    promoted_state_variables: [...input.promoted_state_variables].sort(),
  };
}

/* ------------------------------------------------------- validation machine */

export interface ValidationCheck {
  id: string;
  ok: boolean;
  /** Which state this check maps to when it fails. */
  state: ValidationState;
  detail?: string;
}

export interface ValidationResult {
  state: ValidationState;
  checks: ValidationCheck[];
  failed: ValidationCheck[];
  /** Fraction of checks that passed — used as evidence completeness. */
  completeness: number;
}

const S = CALIBRATION_VALIDATION_SPEC_V1;

function metricChecks(
  dir: "long" | "short", m: DirectionReportMetrics | undefined, eligible: number,
): ValidationCheck[] {
  const c: ValidationCheck[] = [];
  const push = (id: string, ok: boolean, st: ValidationState, detail?: string) =>
    c.push({ id, ok, state: st, ...(detail ? { detail } : {}) });

  if (!m || typeof m !== "object") {
    push(`${dir}_report_present`, false, "metric_malformed", "direction report missing");
    return c;
  }
  push(`${dir}_report_present`, true, "metric_malformed");
  push(`${dir}_brier_finite_in_range`, finiteIn(m.brier, 0, 1), "metric_malformed");
  push(`${dir}_naive_brier_finite_in_range`, finiteIn(m.naive_brier, 0, 1), "metric_malformed");
  push(`${dir}_ece_finite_in_range`, finiteIn(m.ece, 0, 1), "metric_malformed");
  push(`${dir}_n_fit_non_negative_integer`, nonNegInt(m.n_fit), "metric_malformed");
  push(`${dir}_n_holdout_non_negative_integer`, nonNegInt(m.n_holdout), "metric_malformed");
  push(`${dir}_n_eligible_non_negative_integer`, nonNegInt(m.n_eligible), "metric_malformed");
  push(
    `${dir}_sample_conservation`,
    nonNegInt(m.n_fit) && nonNegInt(m.n_holdout) && nonNegInt(m.n_eligible)
      && m.n_fit + m.n_holdout === m.n_eligible,
    "metric_malformed",
  );
  push(`${dir}_eligible_matches_run_count`, m.n_eligible === eligible, "count_mismatch");
  return c;
}

/**
 * Deterministic classification. Order of evaluation does not affect the outcome: the
 * reported state is chosen by frozen precedence over the set of failed checks.
 */
export function validateAcceptedArtifacts(raw: CalibrationValidationInput): ValidationResult {
  const input = canonicalizeInput(raw);
  const checks: ValidationCheck[] = [];
  const push = (id: string, ok: boolean, st: ValidationState, detail?: string) =>
    checks.push({ id, ok, state: st, ...(detail ? { detail } : {}) });

  const R = S.accepted_research_v4;
  const C = S.accepted_calibration_v8;

  /* ---- promotion lock. Canonical source is the in-code list, never a near-miss cell. */
  push(
    "promoted_state_variable_count_zero",
    input.promoted_state_variables.length === S.publication_contract.required_promoted_state_variable_count,
    "promotion_violation",
    `promoted=${input.promoted_state_variables.length}`,
  );

  /* ---- research V4 presence / uniqueness */
  const rRuns = input.research_v4_runs;
  push("research_v4_present", rRuns.length >= 1, "artifact_missing");
  push("research_v4_unique", rRuns.length <= 1, "artifact_duplicate", `count=${rRuns.length}`);
  const r = rRuns.length === 1 ? rRuns[0] : undefined;

  if (r) {
    push("research_v4_id", r.id === R.id, "identity_mismatch");
    push("research_v4_research_version", r.research_version === R.research_version, "identity_mismatch");
    push("research_v4_quality_version", r.quality_version === R.quality_version, "lineage_mismatch");
    push("research_v4_feature_version", r.feature_version === R.feature_version, "lineage_mismatch");
    push("research_v4_label_version", r.label_version === R.label_version, "lineage_mismatch");
    push("research_v4_source_as_of", sameInstant(r.source_as_of, R.source_as_of), "lineage_mismatch");
    push("research_v4_source_bar_cutoff", sameInstant(r.source_bar_cutoff, R.source_bar_cutoff), "lineage_mismatch");
    push("research_v4_definition_hash", r.definition_hash === R.definition_hash, "identity_mismatch");
    push("research_v4_run_hash", r.run_hash === R.run_hash, "identity_mismatch");
    push("research_v4_results_digest", r.results_digest === R.results_digest, "identity_mismatch");
    push("research_v4_status", r.status === R.status, "artifact_status_mismatch");
  }

  const candidates = input.research_v4_candidates;
  const promotable = candidates.filter((c) => c.promising_for_2d2 === true).length;
  push("research_v4_candidate_row_count", candidates.length === R.candidate_rows, "count_mismatch",
    `rows=${candidates.length}`);
  // A promotable candidate is NOT auto-promotion; it is an unreviewed deviation from the
  // accepted negative result and must fail closed.
  push("research_v4_promotable_row_count", promotable === R.promotable_rows, "promotion_violation",
    `promotable=${promotable}`);

  /* ---- calibration v8 presence / uniqueness */
  const cRuns = input.calibration_v8_runs;
  push("calibration_v8_present", cRuns.length >= 1, "artifact_missing");
  push("calibration_v8_unique", cRuns.length <= 1, "artifact_duplicate", `count=${cRuns.length}`);
  const cal = cRuns.length === 1 ? cRuns[0] : undefined;

  if (cal) {
    push("calibration_v8_id", cal.id === C.id, "identity_mismatch");
    push("calibration_v8_calibration_version", cal.calibration_version === C.calibration_version, "identity_mismatch");
    push("calibration_v8_feature_version", cal.feature_version === C.feature_version, "lineage_mismatch");
    push("calibration_v8_label_version", cal.label_version === C.label_version, "lineage_mismatch");
    push("calibration_v8_source_as_of", sameInstant(cal.source_as_of, C.source_as_of), "lineage_mismatch");
    push("calibration_v8_source_bar_cutoff", sameInstant(cal.source_bar_cutoff, C.source_bar_cutoff), "lineage_mismatch");
    push("calibration_v8_definition_hash", cal.definition_hash === C.definition_hash, "identity_mismatch");
    push("calibration_v8_run_hash", cal.run_hash === C.run_hash, "identity_mismatch");
    push("calibration_v8_status", cal.status === C.status, "artifact_status_mismatch");
    push("calibration_v8_canonical_rows", cal.canonical_rows === C.canonical_rows, "count_mismatch");
    push("calibration_v8_eligible_long", cal.eligible_long === C.eligible_long, "count_mismatch");
    push("calibration_v8_eligible_short", cal.eligible_short === C.eligible_short, "count_mismatch");
    checks.push(...metricChecks("long", cal.long, C.eligible_long));
    checks.push(...metricChecks("short", cal.short, C.eligible_short));
  }

  push("calibration_v8_stat_cell_count", input.calibration_v8_stat_cells === C.stat_cells,
    "count_mismatch", `cells=${input.calibration_v8_stat_cells}`);

  const failed = checks.filter((c) => !c.ok);
  const state: ValidationState = failed.length === 0
    ? "accepted_research_only"
    : STATE_PRECEDENCE.find((s) => failed.some((f) => f.state === s))!;

  return {
    state, checks, failed,
    completeness: checks.length ? (checks.length - failed.length) / checks.length : 0,
  };
}

/* -------------------------------------------------------------- the producer */

export async function buildCalibrationValidationEvidence(
  raw: CalibrationValidationInput,
): Promise<EvidenceEnvelopeV1> {
  const input = canonicalizeInput(raw);
  const spec_hash = await calibrationValidationSpecHash();
  const result = validateAcceptedArtifacts(input);

  const r = input.research_v4_runs.length === 1 ? input.research_v4_runs[0] : undefined;
  const cal = input.calibration_v8_runs.length === 1 ? input.calibration_v8_runs[0] : undefined;

  /* ---- source timestamps: ONLY instants that genuinely exist on a persisted artifact. */
  const source_timestamps: Record<string, string> = {};
  const rAsOf = isoInstant(r?.source_as_of);
  const rCut = isoInstant(r?.source_bar_cutoff);
  const cAsOf = isoInstant(cal?.source_as_of);
  const cCut = isoInstant(cal?.source_bar_cutoff);
  if (rAsOf) source_timestamps.research_run_source_as_of = rAsOf;
  if (rCut) source_timestamps.research_run_source_bar_cutoff = rCut;
  if (cAsOf) source_timestamps.calibration_run_source_as_of = cAsOf;
  if (cCut) source_timestamps.calibration_run_source_bar_cutoff = cCut;

  /**
   * as_of is ARTIFACT-DERIVED, never a wall clock: the newest genuine artifact clock we
   * actually read. With no readable artifact clock we fall back to the frozen accepted
   * clock, which the same run is simultaneously reporting as unverifiable.
   */
  const clocks = [rAsOf, cAsOf].filter((x): x is string => !!x);
  const as_of = clocks.length
    ? new Date(Math.max(...clocks.map((c) => Date.parse(c)))).toISOString()
    : isoInstant(S.accepted_research_v4.source_as_of)!;

  // Staleness BETWEEN the two artifact clocks. Deterministic and clock-free; a lineage
  // rebuild that moved only one artifact shows up here as non-zero.
  const freshness_minutes = clocks.length
    ? Math.round((Date.parse(as_of) - Math.min(...clocks.map((c) => Date.parse(c)))) / 60_000)
    : 0;

  const provenance_refs = [
    `spec:${S.spec_id}:v${S.spec_version}:${spec_hash}`,
    ...(r ? [`research_run:${r.id}:v${r.research_version}:${r.run_hash}`] : []),
    ...(r ? [`research_results_digest:${r.results_digest}`] : []),
    ...(cal ? [`calibration_run:${cal.id}:v${cal.calibration_version}:${cal.run_hash}`] : []),
    ...(r ? [`quality_version:${r.quality_version}`, `feature_version:${r.feature_version}`,
      `label_version:${r.label_version}`] : []),
  ];

  const observations: Observation[] = [
    state("validation_state", result.state, as_of),
    state("publication_state", S.publication_contract.publication_state, as_of),
    state("artifact_read_mode", S.source_contract.mode, as_of),
    num("promoted_state_variable_count", input.promoted_state_variables.length, as_of, "variables"),
    num("validation_checks_total", result.checks.length, as_of, "checks"),
    num("validation_checks_failed", result.failed.length, as_of, "checks"),
  ];

  if (r) {
    observations.push(
      num("research_version", r.research_version, rAsOf ?? as_of),
      ref("research_run_reference", r.id),
      state("research_run_status", r.status, rAsOf ?? as_of),
      num("research_candidate_rows", input.research_v4_candidates.length, rAsOf ?? as_of, "rows"),
      num("research_promotable_rows",
        input.research_v4_candidates.filter((c) => c.promising_for_2d2).length, rAsOf ?? as_of, "rows"),
    );
  }

  if (cal) {
    observations.push(
      num("calibration_version", cal.calibration_version, cAsOf ?? as_of),
      ref("calibration_run_reference", cal.id),
      state("calibration_run_status", cal.status, cAsOf ?? as_of),
      num("calibration_canonical_rows", cal.canonical_rows, cAsOf ?? as_of, "rows"),
      num("eligible_long_rows", cal.eligible_long, cAsOf ?? as_of, "rows"),
      num("eligible_short_rows", cal.eligible_short, cAsOf ?? as_of, "rows"),
      num("calibration_cells", input.calibration_v8_stat_cells, cAsOf ?? as_of, "cells"),
    );
    // Diagnostic artifact measurements. Emitted ONLY when finite, and always labelled as
    // measurements of the persisted artifact — never as a current-market expectation.
    for (const dir of ["long", "short"] as const) {
      const m = cal[dir];
      if (!m) continue;
      if (finiteIn(m.brier, 0, 1)) observations.push(num(`${dir}_brier`, m.brier, cAsOf ?? as_of, "brier_score"));
      if (finiteIn(m.naive_brier, 0, 1)) {
        observations.push(num(`${dir}_naive_brier`, m.naive_brier, cAsOf ?? as_of, "brier_score"));
      }
      if (finiteIn(m.brier, 0, 1) && finiteIn(m.naive_brier, 0, 1)) {
        observations.push(num(`${dir}_brier_minus_naive`,
          Number((m.brier - m.naive_brier).toFixed(9)), cAsOf ?? as_of, "brier_score_delta"));
        observations.push(state(`${dir}_vs_naive_state`,
          m.brier < m.naive_brier ? "better_than_naive_on_artifact"
            : m.brier > m.naive_brier ? "worse_than_naive_on_artifact"
              : "equal_to_naive_on_artifact", cAsOf ?? as_of));
      }
      if (finiteIn(m.ece, 0, 1)) observations.push(num(`${dir}_ece`, m.ece, cAsOf ?? as_of, "expected_calibration_error"));
      if (nonNegInt(m.n_fit)) observations.push(num(`${dir}_fit_rows`, m.n_fit, cAsOf ?? as_of, "rows"));
      if (nonNegInt(m.n_holdout)) observations.push(num(`${dir}_holdout_rows`, m.n_holdout, cAsOf ?? as_of, "rows"));
    }
  }

  for (const f of result.failed) {
    observations.push(state("failed_validation_check", `${f.id}:${f.state}`, as_of));
  }

  const limitations: string[] = [
    "diagnostic validation of persisted artifacts only; not a market forecast",
    "Brier / ECE / sample counts describe the accepted calibration artifact, not any current-market expectation",
    "calibration remains research-only; it is not approved for production publication",
    "no predictive state variable is promoted, so no conditional expectation may be asserted",
    "direction is structurally restricted to neutral or unknown for this agent",
  ];
  const issues: string[] = result.failed.map((f) => `${f.id}${f.detail ? `:${f.detail}` : ""}`);

  const accepted = result.state === "accepted_research_only";
  if (accepted) {
    limitations.push(
      "Research V4 promoted zero state variables; that is the accepted expected result and is not a plumbing failure",
    );
  } else {
    limitations.push("accepted artifact validation failed; downstream construction must fail closed");
  }

  const status: EvidenceStatus = accepted ? "supported" : "blocked";
  const direction: QualitativeDirection = accepted ? "neutral" : "unknown";
  const recommendation: RecommendationV1 = accepted ? "research_only" : "no_action";

  return {
    schema_version: 1,
    agent_id: "calibration_model_validation",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of,
    source_timestamps,
    observations,
    provenance_refs,
    data_health: {
      status: accepted ? "healthy" : "critical",
      freshness_minutes,
      completeness: result.completeness,
      issues,
    },
    uncertainty: { level: "unquantified", limitations },
    conflicts: accepted ? [] : [`accepted_artifact_validation_failed:${result.state}`],
    dependencies: [
      `research_version:${S.accepted_research_v4.research_version}`,
      `calibration_version:${S.accepted_calibration_v8.calibration_version}`,
    ],
    status,
    direction,
    recommendation,
  };
}
