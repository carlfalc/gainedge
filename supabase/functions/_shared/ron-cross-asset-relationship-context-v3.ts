/**
 * RON — CROSS-ASSET RELATIONSHIP CONTEXT spec V3 (pure producer).
 *
 * Implementation marker `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3`.
 *
 * FORWARD-ONLY anchor-convention adaptation of the frozen
 * CROSS_ASSET_RELATIONSHIP_SPEC_V2. V1 and V2 stay BYTE-IDENTICAL and fully replayable:
 * this module imports the frozen V2 producer and never mutates it.
 *
 * THE ONLY DELTA — the anchor convention, identical to Session V3 and Pattern V3:
 *   V2  `as_of` = bar OPEN of the completed analytical bar.
 *   V3  `evaluation_anchor` = completed 15m bar CLOSE, and the authoritative analytical
 *       bar open is EXACTLY `evaluation_anchor - 15m`.
 *
 * ONE RON DECISION = ONE EXPLICIT EVALUATION ANCHOR: cross-asset is called at exactly the
 * same instant as every other specialist in the run. Because the completed analytical bar
 * closes ON the anchor, the frozen "no evidence bar may close after the anchor" rule holds
 * without any exemption, relaxation or per-agent convention.
 *
 * Every statistic, window, estimator, alignment rule, counterpart completed-bar proof and
 * descriptive categorical transform is INHERITED VERBATIM from the frozen V2 producer.
 * Nothing is recomputed and no new threshold exists anywhere in this module.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import { CROSS_ASSET_SPEC_V1 } from "./ron-cross-asset-spec.ts";
import {
  buildCrossAssetRelationshipEvidenceV2, CROSS_ASSET_RELATIONSHIP_SPEC_V2,
  CROSS_ASSET_SPEC_V1_HASH_PINNED, type CrossAssetRelationshipInputV2,
} from "./ron-cross-asset-relationship-context-v2.ts";

export { CROSS_ASSET_SPEC_V1_HASH_PINNED };

/** FULL accepted Cross-Asset Relationship Context Spec V2 hash (never re-derived). */
export const CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED =
  "032ac31b53b187b135e1f9fedadbfd213102d4a475a83248c123c99e30639682";

/** Every way a V3 evaluation anchor can be inadmissible. All fail CLOSED. */
export type CrossAssetV3AnchorRejection =
  | "evaluation_anchor_not_finite"
  | "evaluation_anchor_not_bar_close_aligned";

export class CrossAssetV3AnchorError extends Error {
  override readonly name = "CrossAssetV3AnchorError";
  constructor(readonly reason: CrossAssetV3AnchorRejection, readonly detail?: string) {
    super(`cross_asset_v3_anchor_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export const CROSS_ASSET_RELATIONSHIP_SPEC_V3 = {
  spec_id: CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id,
  spec_version: 3,
  supersedes_spec_version: CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version,
  agent_id: CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_id,
  agent_version: CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_version,
  authority_class: CROSS_ASSET_RELATIONSHIP_SPEC_V2.authority_class,
  authority_rank: CROSS_ASSET_RELATIONSHIP_SPEC_V2.authority_rank,
  source_health_authoritative: CROSS_ASSET_RELATIONSHIP_SPEC_V2.source_health_authoritative,
  ttl_multiplier: CROSS_ASSET_RELATIONSHIP_SPEC_V2.ttl_multiplier,
  bar_minutes: CROSS_ASSET_SPEC_V1.bar_minutes,

  /** The single semantic delta from V2, declared explicitly. */
  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    authoritative_analytical_bar_open: "evaluation_anchor_minus_one_bar_exactly",
    envelope_as_of_equals_evaluation_anchor: true,
    as_of_bar_completed_close_equals_anchor: true,
    anchor_must_be_bar_grid_aligned: true,
    same_anchor_for_every_specialist_in_the_run: true,
    per_agent_anchor_convention: false,
    forming_bar_consumed: false,
    lookahead_permitted: false,
    wall_clock_read: false,
    rejections: [
      "evaluation_anchor_not_finite",
      "evaluation_anchor_not_bar_close_aligned",
    ],
  },

  inherits: {
    from_spec_version: CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version,
    from_spec_hash: CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED,
    base_spec_version: CROSS_ASSET_SPEC_V1.spec_version,
    base_spec_hash: CROSS_ASSET_SPEC_V1_HASH_PINNED,
    producer_reused_verbatim: true,
    statistic_recomputed_in_v3: false,
    counterpart_completion_contract_unchanged: true,
    relationship_context_contract_unchanged: true,
    new_numeric_thresholds_introduced: 0,
    v2_replayable_by_spec_version_2: true,
    v1_replayable_by_spec_version_1: true,
  },

  counterpart_completion_contract:
    CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract,
  relationship_context_contract:
    CROSS_ASSET_RELATIONSHIP_SPEC_V2.relationship_context_contract,
  safety_contract: CROSS_ASSET_RELATIONSHIP_SPEC_V2.safety_contract,
} as const;

export function crossAssetRelationshipSpecHashV3(): Promise<string> {
  return hashCanonical(CROSS_ASSET_RELATIONSHIP_SPEC_V3);
}

const BAR_MS = CROSS_ASSET_RELATIONSHIP_SPEC_V3.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });

const V2_SPEC_PREFIX = `spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id}:v${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version}:`;

export interface CrossAssetRelationshipInputV3
  extends Omit<CrossAssetRelationshipInputV2, "as_of"> {
  /** COMPLETED 15m bar CLOSE (epoch ms). The analytical bar open is anchor - 15m. */
  evaluation_anchor: number;
}

/**
 * V3 producer. Delegates ALL substantive analysis to the frozen V2 producer at the
 * authoritative analytical bar open (`evaluation_anchor - 15m`), then restates the
 * envelope under the shared completed-bar-close anchor convention. No statistic,
 * admissibility decision, health value or categorical token is altered.
 */
export async function buildCrossAssetRelationshipEvidenceV3(
  input: CrossAssetRelationshipInputV3,
): Promise<EvidenceEnvelopeV1> {
  const anchor = input.evaluation_anchor;
  if (!Number.isFinite(anchor)) {
    throw new CrossAssetV3AnchorError("evaluation_anchor_not_finite");
  }
  if (anchor % BAR_MS !== 0) {
    throw new CrossAssetV3AnchorError("evaluation_anchor_not_bar_close_aligned", iso(anchor));
  }
  const barOpen = anchor - BAR_MS;
  const specHashV3 = await crossAssetRelationshipSpecHashV3();

  const base = await buildCrossAssetRelationshipEvidenceV2({
    instrument: input.instrument,
    counterpart: input.counterpart,
    timeframe: input.timeframe,
    as_of: barOpen,
    bars: input.bars.filter((b) => b.time <= barOpen),
    counterpart_bars: input.counterpart_bars.filter((b) => b.time <= barOpen),
    isQuarantined: input.isQuarantined,
    run_id: input.run_id,
    trace_id: input.trace_id,
    newest_source_bar: input.newest_source_bar,
    newest_counterpart_bar: input.newest_counterpart_bar,
  });

  const provenance_refs = [
    `spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V3.spec_id}:v${CROSS_ASSET_RELATIONSHIP_SPEC_V3.spec_version}:${specHashV3}`,
    `base_spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id}:v${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version}:${CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED}`,
    ...base.provenance_refs.filter((p) => !p.startsWith(V2_SPEC_PREFIX)),
  ];

  // Every V2 source instant is at or before the analytical bar open; V3 adds only the
  // shared anchor itself, which is exactly the completed close of that same bar.
  const source_timestamps: Record<string, string> = {
    ...base.source_timestamps,
    evaluation_anchor: iso(anchor),
    analytical_bar_open: iso(barOpen),
  };

  return {
    ...base,
    as_of: iso(anchor),
    source_timestamps,
    provenance_refs,
    observations: [
      ...base.observations,
      state("evaluation_anchor_convention", "completed_bar_close", iso(barOpen)),
      state("analytical_bar_open_instant", iso(barOpen), iso(barOpen)),
      state("forming_bar_consumed", "false", iso(barOpen)),
    ],
    dependencies: [
      ...base.dependencies,
      `cross_asset_relationship_spec_v${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version}:${CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED}`,
    ],
    uncertainty: {
      level: base.uncertainty.level,
      limitations: [
        ...base.uncertainty.limitations,
        "the evaluation anchor is a COMPLETED bar close shared by every specialist in the " +
        "run; the analytical bar opens exactly one bar earlier and closes exactly on the " +
        "anchor, so no evidence bar can close after the anchor",
      ],
    },
  };
}
