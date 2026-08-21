/**
 * RON — SESSION & MARKET STRUCTURE SPECIALIST spec V3 (pure producer).
 *
 * Implementation marker `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V2`.
 *
 * FORWARD-ONLY anchor-convention adaptation of the frozen SESSION_STRUCTURE_SPEC_V2.
 * V1 (`ron-session-structure-spec.ts`) and V2 (`ron-session-structure-spec-v2.ts`) stay
 * BYTE-IDENTICAL and fully replayable: this module imports the frozen V2 producer and
 * never mutates it.
 *
 * THE ONLY DELTA — the anchor convention:
 *   V2  `as_of` = bar OPEN of the completed analytical bar.
 *   V3  `evaluation_anchor` = completed 15m bar CLOSE, and the authoritative analytical
 *       bar open is EXACTLY `evaluation_anchor - 15m`.
 *
 * Everything substantive is inherited verbatim from V2 by CONSTRUCTION (the V2 producer
 * computes the evidence): slot taxonomy, qv5 quality/native health, segmentation, swing
 * confirmation, structure state, structure events, Asian range, completeness definition,
 * source-timestamp policy, authority and the deterministic evidence contract.
 *
 * SAFETY INVARIANTS retained: no clock read, no I/O, no probability, no confidence, no
 * forecast, no fabricated bar, no forming bar, no lookahead, no execution path. Direction
 * remains qualitative structure context only.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation,
} from "./ron-agent-contracts.ts";
import {
  buildSessionStructureEvidenceV2, SESSION_STRUCTURE_SPEC_V2,
  type SessionStructureInputV2,
} from "./ron-session-structure-spec-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED } from "./ron-pattern-context-spec.ts";
import type { StructureBar } from "./ron-session-structure-spec.ts";

export { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED };
export type { StructureBar };

/** Every way a V3 evaluation anchor can be inadmissible. All fail CLOSED. */
export type SessionV3AnchorRejection =
  | "evaluation_anchor_not_finite"
  | "evaluation_anchor_not_bar_close_aligned"
  | "source_bar_after_evaluation_anchor"
  | "source_timestamp_after_evaluation_anchor";

export class SessionStructureV3AnchorError extends Error {
  override readonly name = "SessionStructureV3AnchorError";
  constructor(readonly reason: SessionV3AnchorRejection, readonly detail?: string) {
    super(`session_structure_v3_anchor_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export const SESSION_STRUCTURE_SPEC_V3 = {
  spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
  spec_version: 3,
  supersedes_spec_version: 2,
  agent_id: SESSION_STRUCTURE_SPEC_V2.agent_id,
  agent_version: SESSION_STRUCTURE_SPEC_V2.agent_version,
  instrument_scope: SESSION_STRUCTURE_SPEC_V2.instrument_scope,
  timeframe_scope: SESSION_STRUCTURE_SPEC_V2.timeframe_scope,
  bar_minutes: SESSION_STRUCTURE_SPEC_V2.bar_minutes,

  /** The single semantic delta from V2, declared explicitly. */
  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    authoritative_analytical_bar_open: "evaluation_anchor_minus_one_bar_exactly",
    envelope_as_of_equals_evaluation_anchor: true,
    as_of_bar_open_equals_anchor_minus_one_bar: true,
    as_of_bar_completed_close_equals_anchor: true,
    anchor_must_be_bar_grid_aligned: true,
    forming_bar_consumed: false,
    bars_after_anchor_consumed: false,
    source_timestamp_after_anchor_allowed: false,
    requires_genuine_native_completed_bar_at_analytical_open: true,
    requires_validated_quality_state_for_that_bar: true,
    missing_or_quarantined_anchor_bar_yields: "blocked_or_insufficient_never_bridged",
    wall_clock_read: false,
    rejections: [
      "evaluation_anchor_not_finite",
      "evaluation_anchor_not_bar_close_aligned",
      "source_bar_after_evaluation_anchor",
      "source_timestamp_after_evaluation_anchor",
    ],
  },

  /** Everything else is the frozen V2 contract, inherited by construction. */
  inherits: {
    from_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    from_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    producer_reused_verbatim: true,
    slot_classification_unchanged: true,
    segmentation_unchanged: true,
    swing_contract_unchanged: true,
    structure_state_unchanged: true,
    events_unchanged: true,
    asian_range_unchanged: true,
    data_health_unchanged: true,
    quality_contract_unchanged: true,
    source_contract_unchanged: true,
    lookback_bars_max: SESSION_STRUCTURE_SPEC_V2.lookback_bars_max,
    v2_replayable_by_spec_version_2: true,
    v1_replayable_by_spec_version_1: true,
  },

  quality_contract: SESSION_STRUCTURE_SPEC_V2.quality_contract,
  source_contract: SESSION_STRUCTURE_SPEC_V2.source_contract,
  slot_classification: SESSION_STRUCTURE_SPEC_V2.slot_classification,
  segmentation: SESSION_STRUCTURE_SPEC_V2.segmentation,
  swing: SESSION_STRUCTURE_SPEC_V2.swing,
  structure_state: SESSION_STRUCTURE_SPEC_V2.structure_state,
  events: SESSION_STRUCTURE_SPEC_V2.events,
  asian_range: SESSION_STRUCTURE_SPEC_V2.asian_range,
  data_health: SESSION_STRUCTURE_SPEC_V2.data_health,
  source_timestamps_policy: SESSION_STRUCTURE_SPEC_V2.source_timestamps_policy,
  evidence_interval: SESSION_STRUCTURE_SPEC_V2.evidence_interval,
  lookback_bars_max: SESSION_STRUCTURE_SPEC_V2.lookback_bars_max,
  lookahead: "none",

  safety_contract: {
    numeric_probability_emitted: false,
    confidence_emitted: false,
    forecast_emitted: false,
    trade_geometry_emitted: false,
    execution_allowed: false,
    execution_path: "signal_only",
    llm_used: false,
    external_fetch_used: false,
  },
} as const;

export function sessionStructureSpecHashV3(): Promise<string> {
  return hashCanonical(SESSION_STRUCTURE_SPEC_V3);
}

const BAR_MS = SESSION_STRUCTURE_SPEC_V3.bar_minutes * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });

const V2_SPEC_REF =
  `spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:`;

export interface SessionStructureInputV3
  extends Omit<SessionStructureInputV2, "as_of" | "lineage_refs"> {
  /** COMPLETED 15m bar CLOSE (epoch ms). The analytical bar open is anchor - 15m. */
  evaluation_anchor: number;
}

/**
 * V3 producer. Delegates ALL substantive analysis to the frozen V2 producer at the
 * authoritative analytical bar open (`evaluation_anchor - 15m`), then restates the
 * envelope under the completed-bar-close anchor convention. No observation, health value,
 * structural fact or taxonomy token is altered.
 */
export async function buildSessionStructureEvidenceV3(
  input: SessionStructureInputV3,
): Promise<EvidenceEnvelopeV1> {
  const anchor = input.evaluation_anchor;
  if (!Number.isFinite(anchor)) {
    throw new SessionStructureV3AnchorError("evaluation_anchor_not_finite");
  }
  if (anchor % BAR_MS !== 0) {
    throw new SessionStructureV3AnchorError(
      "evaluation_anchor_not_bar_close_aligned", iso(anchor));
  }
  if (input.newest_source_bar != null && input.newest_source_bar > anchor) {
    throw new SessionStructureV3AnchorError(
      "source_bar_after_evaluation_anchor", iso(input.newest_source_bar));
  }

  const barOpen = anchor - BAR_MS;

  // The forming bar and anything later can never enter the analysis: V2 additionally
  // filters to `time <= as_of`, so this is defence in depth, not the only guard.
  const bars: StructureBar[] = input.bars.filter((b) => b.time <= barOpen);

  const spec_hash = await sessionStructureSpecHashV3();
  const base = await buildSessionStructureEvidenceV2({
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: barOpen,
    bars,
    isQuarantined: input.isQuarantined,
    run_id: input.run_id,
    trace_id: input.trace_id,
    newest_source_bar: input.newest_source_bar,
  });

  // V2 already emits `as_of_bar_open = barOpen` and `as_of_bar_completed_close = anchor`
  // on the admissible path. V3 additionally carries the anchor itself, explicitly.
  const source_timestamps: Record<string, string> = {
    ...base.source_timestamps,
    evaluation_anchor: iso(anchor),
  };
  for (const [k, v] of Object.entries(source_timestamps)) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && ms > anchor) {
      throw new SessionStructureV3AnchorError("source_timestamp_after_evaluation_anchor", k);
    }
  }

  const provenance_refs = [
    `spec:${SESSION_STRUCTURE_SPEC_V3.spec_id}:v${SESSION_STRUCTURE_SPEC_V3.spec_version}:${spec_hash}`,
    `base_spec:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    ...base.provenance_refs.filter((p) => !p.startsWith(V2_SPEC_REF)),
  ];

  const observations: Observation[] = [
    ...base.observations,
    state("evaluation_anchor_convention", "completed_bar_close", iso(barOpen)),
    state("analytical_bar_open_instant", iso(barOpen), iso(barOpen)),
    state("forming_bar_consumed", "false", iso(barOpen)),
  ];

  return {
    ...base,
    as_of: iso(anchor),
    source_timestamps,
    provenance_refs,
    observations,
    dependencies: [
      ...base.dependencies,
      `session_structure_spec_v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    ],
    uncertainty: {
      level: base.uncertainty.level,
      limitations: [
        ...base.uncertainty.limitations,
        "the evaluation anchor is a COMPLETED bar close; the authoritative analytical bar " +
        "is the one opening exactly one bar earlier and no forming bar is ever consumed",
      ],
    },
  };
}
