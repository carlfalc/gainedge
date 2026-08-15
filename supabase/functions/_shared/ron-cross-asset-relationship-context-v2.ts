/**
 * RON — CROSS-ASSET RELATIONSHIP CONTEXT spec V2 (pure producer).
 *
 * FORWARD-ONLY deepening of the frozen Cross-Asset Correlation Specialist V1. V2 does NOT
 * re-derive a second statistical truth: it INHERITS the V1 producer byte-for-byte (same
 * XAUUSD primary, same frozen NAS100 counterpart, same 15m timeframe, same exact-timestamp
 * intersection, same current common contiguous segment, same 32 / 24 / 33 window constants,
 * same simple-return formula and same Pearson estimator, same qv5 + Session V2 behaviour for
 * the XAU leg) and adds ONLY deterministic DESCRIPTIVE CATEGORICAL TRANSFORMS of statistics
 * V1 has already honestly computed.
 *
 * Two things are genuinely new, and nothing else is:
 *   1. COUNTERPART COMPLETED-BAR PROOF. V1 asserted `closed_bars_only` for NAS100 while
 *      carrying no field capable of proving it. V2 requires an existing genuine persistence
 *      provenance instant (`candle_history.created_at`) recorded no earlier than
 *      bar_open + one bar. Rows with missing, malformed, non-finite or premature provenance
 *      are EXCLUDED — never bridged — so an excluded row breaks the common contiguous
 *      segment exactly like an absent row.
 *   2. DESCRIPTIVE RELATIONSHIP CONTEXT from exact signs only.
 *
 * HARD CONTRACT — these categories are NOT scores, probabilities, confidence, forecasts,
 * expected values, edge, significance, causation, magnitude labels or recommendations. No
 * new numeric threshold exists anywhere in this module: every decision is an exact `> 0`,
 * `< 0` or `=== 0` comparison on numbers V1 already reported. Envelope `direction` stays
 * `neutral` / `unknown` and `recommendation` stays `context_only` / `no_action`.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import type { StructureBar } from "./ron-session-structure-spec.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import {
  buildCrossAssetEvidenceV1, crossAssetSpecHash,
  CROSS_ASSET_SPEC_V1, CROSS_ASSET_COUNTERPART_V1,
  CROSS_ASSET_MAX_COMMON_BARS, CROSS_ASSET_MIN_COMMON_BARS,
  CROSS_ASSET_MIN_PAIRED_RETURNS, CROSS_ASSET_RETURNS_WINDOW,
  SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
  type CounterpartBar,
} from "./ron-cross-asset-spec.ts";

/** FULL accepted Cross-Asset Correlation Spec V1 hash (inherited, never re-derived). */
export const CROSS_ASSET_SPEC_V1_HASH_PINNED =
  "8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44";

/** Inherited bar length. DERIVED — never redeclared. */
const BAR_MINUTES = CROSS_ASSET_SPEC_V1.bar_minutes;
const BAR_MS = BAR_MINUTES * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* ------------------------------------------------------- descriptive vocabularies */

export const OBSERVED_ASSOCIATION_SIGNS = [
  "positive_association", "negative_association", "exact_zero_association",
] as const;
export type ObservedAssociationSign = typeof OBSERVED_ASSOCIATION_SIGNS[number];

export const LATEST_RETURN_DIRECTIONS = ["up", "down", "flat"] as const;
export type LatestReturnDirection = typeof LATEST_RETURN_DIRECTIONS[number];

export const LATEST_PAIR_DIRECTION_RELATIONS = [
  "same_sign", "opposite_sign", "one_or_both_flat",
] as const;
export type LatestPairDirectionRelation = typeof LATEST_PAIR_DIRECTION_RELATIONS[number];

export const LATEST_PAIR_RELATION_TO_ASSOCIATION = [
  "consistent_with_recent_observed_association",
  "opposed_to_recent_observed_association",
  "association_exact_zero",
  "flat_pair_uninformative",
] as const;
export type LatestPairRelationToAssociation =
  typeof LATEST_PAIR_RELATION_TO_ASSOCIATION[number];

/** Counterpart row admissibility outcomes under the V2 completed-bar proof. */
export const COUNTERPART_EXCLUSION_REASONS = [
  "counterpart_completion_proof_absent",
  "counterpart_completion_proof_malformed",
  "counterpart_recorded_before_completed_close",
] as const;
export type CounterpartExclusionReason = typeof COUNTERPART_EXCLUSION_REASONS[number];

/* ------------------------------------------------------------------- the spec */

export const CROSS_ASSET_RELATIONSHIP_SPEC_V2 = {
  spec_id: "ron_cross_asset_relationship_context",
  spec_version: 2,
  agent_id: CROSS_ASSET_SPEC_V1.agent_id,
  agent_version: CROSS_ASSET_SPEC_V1.agent_version,
  authority_class: CROSS_ASSET_SPEC_V1.authority_class,
  authority_rank: CROSS_ASSET_SPEC_V1.authority_rank,
  source_health_authoritative: CROSS_ASSET_SPEC_V1.source_health_authoritative,
  ttl_multiplier: CROSS_ASSET_SPEC_V1.ttl_multiplier,

  /** Everything below is INHERITED from the frozen V1 statistic/alignment contract. */
  inherits: {
    base_spec_id: CROSS_ASSET_SPEC_V1.spec_id,
    base_spec_version: CROSS_ASSET_SPEC_V1.spec_version,
    base_spec_hash: CROSS_ASSET_SPEC_V1_HASH_PINNED,
    instrument_scope: CROSS_ASSET_SPEC_V1.instrument_scope,
    counterpart_scope: CROSS_ASSET_SPEC_V1.counterpart_scope,
    timeframe_scope: CROSS_ASSET_SPEC_V1.timeframe_scope,
    bar_minutes: BAR_MINUTES,
    paired_returns_window: CROSS_ASSET_RETURNS_WINDOW,
    minimum_paired_returns: CROSS_ASSET_MIN_PAIRED_RETURNS,
    min_common_bars: CROSS_ASSET_MIN_COMMON_BARS,
    max_common_bars: CROSS_ASSET_MAX_COMMON_BARS,
    return_formula: CROSS_ASSET_SPEC_V1.statistic_contract.return_formula,
    estimator: CROSS_ASSET_SPEC_V1.statistic_contract.estimator,
    alignment_method: CROSS_ASSET_SPEC_V1.alignment_contract.method,
    segmentation_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    quality_version: CROSS_ASSET_SPEC_V1.primary_contract.quality_version,
    statistic_recomputed_in_v2: false,
    new_numeric_thresholds_introduced: 0,
  },

  /** The ONLY new source rule in V2. */
  counterpart_completion_contract: {
    symbol: CROSS_ASSET_COUNTERPART_V1,
    proof_field: "candle_history.created_at",
    proof_rule: "recorded_at >= bar_open + bar_minutes",
    proof_required: true,
    missing_proof_admissible: false,
    malformed_proof_admissible: false,
    premature_row_admissible: false,
    excluded_row_breaks_common_segment: true,
    excluded_row_bridging_allowed: false,
    venue_calendar_inferred: false,
    quality_model_applied: false,
    conflicting_duplicate_rows_fail_closed: true,
    exclusion_reasons: COUNTERPART_EXCLUSION_REASONS,
  },

  relationship_context_contract: {
    derived_from: "already_computed_v1_observations_only",
    comparison_mode: "exact_sign_only",
    magnitude_buckets_emitted: false,
    association_signs: OBSERVED_ASSOCIATION_SIGNS,
    latest_return_directions: LATEST_RETURN_DIRECTIONS,
    latest_pair_direction_relations: LATEST_PAIR_DIRECTION_RELATIONS,
    latest_pair_relation_to_association: LATEST_PAIR_RELATION_TO_ASSOCIATION,
    /** Deterministic precedence when several branches would otherwise apply. */
    relation_precedence: [
      "association_exact_zero",
      "flat_pair_uninformative",
      "consistent_with_recent_observed_association",
      "opposed_to_recent_observed_association",
    ],
    emitted_only_when_v1_status_supported: true,
    temporal_semantics: {
      association_window: "inherited_v1_paired_return_window_ending_at_anchor",
      latest_pair_scope: "one_observed_pair_at_the_anchor",
      persistence_claimed: false,
      predictive: false,
    },
  },

  safety_contract: {
    predictive: false,
    causal: false,
    confidence_emitted: false,
    probability_emitted: false,
    expected_value_emitted: false,
    significance_emitted: false,
    beta_emitted: false,
    regression_emitted: false,
    magnitude_label_emitted: false,
    trade_geometry_emitted: false,
    trade_direction_emitted: false,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    recommendation: "context_only",
    execution_allowed: false,
    execution_path: "signal_only",
    allow_live_execution: false,
    persistence_in_this_phase: false,
    llm_used: false,
    external_fetch: false,
  },
} as const;

export function crossAssetRelationshipSpecHashV2(): Promise<string> {
  return hashCanonical(CROSS_ASSET_RELATIONSHIP_SPEC_V2);
}

/* ------------------------------------------------- counterpart admissibility */

/** Counterpart row carrying the genuine persistence provenance instant. */
export interface CounterpartBarV2 extends CounterpartBar {
  /** epoch ms of `candle_history.created_at`, or null/undefined when absent. */
  created_at?: number | null;
}

export class CrossAssetCounterpartConflictError extends Error {
  readonly at: string;
  constructor(at: string) {
    super(`conflicting_duplicate_counterpart_rows: ${at}`);
    this.name = "CrossAssetCounterpartConflictError";
    this.at = at;
  }
}

export interface CounterpartAdmissibility {
  admitted: CounterpartBar[];
  excluded: { time: number; reason: CounterpartExclusionReason }[];
}

/**
 * Fail-closed completed-bar proof. A counterpart row is admissible ONLY when its genuine
 * persistence instant demonstrates it was recorded no earlier than its completed close.
 * Nothing is repaired, bridged or assumed; conflicting duplicates fail closed.
 */
export function admitCounterpartBars(
  rows: readonly CounterpartBarV2[],
): CounterpartAdmissibility {
  const byTime = new Map<number, { row: CounterpartBarV2; id: string }>();
  for (const r of rows ?? []) {
    if (!r || !Number.isFinite(r.time)) continue;
    const id = `${r.close}|${r.created_at ?? "null"}`;
    const seen = byTime.get(r.time);
    if (!seen) { byTime.set(r.time, { row: r, id }); continue; }
    if (seen.id !== id) throw new CrossAssetCounterpartConflictError(iso(r.time));
  }

  const admitted: CounterpartBar[] = [];
  const excluded: { time: number; reason: CounterpartExclusionReason }[] = [];
  for (const { row } of [...byTime.values()].sort((a, b) => a.row.time - b.row.time)) {
    const proof = row.created_at;
    if (proof == null) {
      excluded.push({ time: row.time, reason: "counterpart_completion_proof_absent" });
    } else if (typeof proof !== "number" || !Number.isFinite(proof)) {
      excluded.push({ time: row.time, reason: "counterpart_completion_proof_malformed" });
    } else if (!Number.isFinite(row.close)) {
      excluded.push({ time: row.time, reason: "counterpart_completion_proof_malformed" });
    } else if (proof < row.time + BAR_MS) {
      excluded.push({ time: row.time, reason: "counterpart_recorded_before_completed_close" });
    } else {
      admitted.push({ time: row.time, close: row.close });
    }
  }
  return { admitted, excluded };
}

/* ------------------------------------------------- descriptive sign transforms */

export function associationSign(r: number): ObservedAssociationSign {
  if (r > 0) return "positive_association";
  if (r < 0) return "negative_association";
  return "exact_zero_association";
}

export function returnDirection(v: number): LatestReturnDirection {
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}

export function pairDirectionRelation(
  x: LatestReturnDirection, y: LatestReturnDirection,
): LatestPairDirectionRelation {
  if (x === "flat" || y === "flat") return "one_or_both_flat";
  return x === y ? "same_sign" : "opposite_sign";
}

/**
 * Deterministic relation of the ONE anchor pair to the observed association sign.
 * Precedence is pinned in the spec: exact-zero association, then a flat leg, then the
 * consistent/opposed mapping. No magnitude is ever consulted.
 */
export function pairRelationToAssociation(
  sign: ObservedAssociationSign, relation: LatestPairDirectionRelation,
): LatestPairRelationToAssociation {
  if (sign === "exact_zero_association") return "association_exact_zero";
  if (relation === "one_or_both_flat") return "flat_pair_uninformative";
  if (sign === "positive_association") {
    return relation === "same_sign"
      ? "consistent_with_recent_observed_association"
      : "opposed_to_recent_observed_association";
  }
  return relation === "opposite_sign"
    ? "consistent_with_recent_observed_association"
    : "opposed_to_recent_observed_association";
}

/* ----------------------------------------------------------------- producer */

export interface CrossAssetRelationshipInputV2 {
  instrument: string;
  counterpart: string;
  timeframe: string;
  /** bar OPEN (epoch ms) of the CLOSED bar the evidence describes. */
  as_of: number;
  bars: StructureBar[];
  counterpart_bars: CounterpartBarV2[];
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  run_id: string;
  trace_id: string;
  newest_source_bar?: number;
  newest_counterpart_bar?: number;
}

const num = (key: string, value: number, at: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), at });
const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });

/** SINGLETON accessor: duplicate or conflicting keys are never silently collapsed. */
function singleNum(e: EvidenceEnvelopeV1, key: string): number | null {
  const all = e.observations.filter((o) => o.key === key);
  if (all.length !== 1) return null;
  const v = all[0].value_num;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function buildCrossAssetRelationshipEvidenceV2(
  input: CrossAssetRelationshipInputV2,
): Promise<EvidenceEnvelopeV1> {
  const specHashV2 = await crossAssetRelationshipSpecHashV2();
  const baseHash = await crossAssetSpecHash();
  const asOf = input.as_of;
  const at = iso(asOf);

  let admitted: CounterpartBar[] = [];
  let excluded: { time: number; reason: CounterpartExclusionReason }[] = [];
  let conflict: string | null = null;
  try {
    const res = admitCounterpartBars(input.counterpart_bars);
    admitted = res.admitted;
    excluded = res.excluded;
  } catch (err) {
    if (err instanceof CrossAssetCounterpartConflictError) conflict = err.at;
    else throw err;
  }

  // The inherited V1 core computes EVERY statistic. V2 only decides which counterpart
  // rows were provably completed before handing them over.
  const base = await buildCrossAssetEvidenceV1({
    instrument: input.instrument,
    counterpart: input.counterpart,
    timeframe: input.timeframe,
    as_of: asOf,
    bars: input.bars,
    counterpart_bars: conflict ? [] : admitted,
    isQuarantined: input.isQuarantined,
    run_id: input.run_id,
    trace_id: input.trace_id,
    newest_source_bar: input.newest_source_bar,
    newest_counterpart_bar: input.newest_counterpart_bar,
  });

  const observations: Observation[] = [...base.observations];
  const issues = [...base.data_health.issues];
  const limitations = [...base.uncertainty.limitations];

  const provenance_refs = [
    `spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id}:v${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version}:${specHashV2}`,
    `base_spec:${CROSS_ASSET_SPEC_V1.spec_id}:v${CROSS_ASSET_SPEC_V1.spec_version}:${baseHash}`,
    ...base.provenance_refs.filter((p) => !p.startsWith(`spec:${CROSS_ASSET_SPEC_V1.spec_id}:`)),
    `counterpart_completion_proof:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract.proof_field}:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract.proof_rule}`,
  ];

  const dependencies = [
    ...base.dependencies,
    `cross_asset_spec_v${CROSS_ASSET_SPEC_V1.spec_version}:${baseHash}`,
  ];

  const countReason = (r: CounterpartExclusionReason) =>
    excluded.filter((e) => e.reason === r).length;

  observations.push(
    state("counterpart_completion_policy",
      CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract.proof_rule, at),
    num("counterpart_rows_admitted", admitted.length, at, "rows"),
    num("counterpart_rows_excluded_proof_absent",
      countReason("counterpart_completion_proof_absent"), at, "rows"),
    num("counterpart_rows_excluded_proof_malformed",
      countReason("counterpart_completion_proof_malformed"), at, "rows"),
    num("counterpart_rows_excluded_recorded_before_close",
      countReason("counterpart_recorded_before_completed_close"), at, "rows"),
  );

  limitations.push(
    "counterpart completion is PROVEN per row from genuine persistence provenance; unproven rows are excluded and never bridged",
    "relationship context is a descriptive categorical restatement of already-observed signs; it is not a forecast, not significance, not magnitude and not evidence that the relationship persists",
  );

  if (conflict) {
    issues.push("conflicting_duplicate_counterpart_rows");
    limitations.push("two contradictory genuine counterpart rows share one timestamp; no winner is invented");
    observations.push(state("cross_asset_relationship_state", "blocked", at));
    return {
      ...base, observations, provenance_refs, dependencies,
      data_health: { ...base.data_health, status: "critical", issues },
      uncertainty: { level: "unquantified", limitations },
      status: "blocked", direction: "unknown", recommendation: "no_action",
    };
  }

  if (excluded.length > 0) {
    issues.push(`counterpart_rows_without_completed_bar_proof:${excluded.length}`);
  }

  const r = base.status === "supported" ? singleNum(base, "paired_return_correlation") : null;
  const xLast = base.status === "supported" ? singleNum(base, "xau_last_return") : null;
  const yLast = base.status === "supported" ? singleNum(base, "nas100_last_return") : null;

  if (r == null || xLast == null || yLast == null) {
    observations.push(state("cross_asset_relationship_state", "context_unavailable", at));
    return {
      ...base, observations, provenance_refs, dependencies,
      data_health: { ...base.data_health, issues },
      uncertainty: { level: "unquantified", limitations },
    };
  }

  const sign = associationSign(r);
  const xDir = returnDirection(xLast);
  const yDir = returnDirection(yLast);
  const relation = pairDirectionRelation(xDir, yDir);
  const relationToAssociation = pairRelationToAssociation(sign, relation);

  observations.push(
    state("observed_association_sign", sign, at),
    state("latest_xau_return_direction", xDir, at),
    state("latest_nas100_return_direction", yDir, at),
    state("latest_pair_direction_relation", relation, at),
    state("latest_pair_relation_to_observed_association", relationToAssociation, at),
    state("association_window_scope",
      CROSS_ASSET_RELATIONSHIP_SPEC_V2.relationship_context_contract.temporal_semantics.association_window, at),
    state("latest_pair_scope",
      CROSS_ASSET_RELATIONSHIP_SPEC_V2.relationship_context_contract.temporal_semantics.latest_pair_scope, at),
    state("cross_asset_relationship_state", "evaluated", at),
  );

  return {
    ...base, observations, provenance_refs, dependencies,
    data_health: { ...base.data_health, issues },
    uncertainty: { level: "unquantified", limitations },
    direction: "neutral",
    recommendation: "context_only",
  };
}
