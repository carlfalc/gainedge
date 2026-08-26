/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — OPPORTUNITY CONTEXT RUNTIME V2.
 *
 * Pure helpers binding the forward `OPPORTUNITY_CONTEXT_SPEC_V2` producer to the existing
 * append-only `ron_opportunity_context` table. Runtime V1 stays byte-identical and every
 * V1 row it wrote remains valid and replayable: V2 rows are distinguished by
 * `spec_version = 2` / `runtime_version = 2`, which are part of the conflict key.
 *
 * No DB client, no network, no wall clock, no randomness here.
 */
import type { HaPatternContextResultV1 } from "./ron-ha-pattern-context-spec-v1.ts";
import type { OpportunityContextResultV2 } from "./ron-opportunity-context-spec-v2.ts";
import {
  BAR_MS, buildPersistRow, OPPORTUNITY_CONTEXT_RUNTIME_V1, OpportunityRuntimeError,
  type OpportunityPersistRow,
} from "./ron-opportunity-context-runtime-v1.ts";
import { FORWARD_CONTEXT_INSTRUMENTS } from "./ron-forward-instrument-binding-v1.ts";

export const OPPORTUNITY_CONTEXT_RUNTIME_V2 = {
  runtime_id: OPPORTUNITY_CONTEXT_RUNTIME_V1.runtime_id,
  runtime_version: 2,
  supersedes_runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V1.runtime_version,
  bound_spec_version: 2,
  instrument_scope: FORWARD_CONTEXT_INSTRUMENTS,
  timeframe_scope: OPPORTUNITY_CONTEXT_RUNTIME_V1.timeframe_scope,
  bar_minutes: OPPORTUNITY_CONTEXT_RUNTIME_V1.bar_minutes,
  ha_bar_window: OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_bar_window,
  ha_min_contiguous_bars: OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_min_contiguous_bars,
  source_contract: OPPORTUNITY_CONTEXT_RUNTIME_V1.source_contract,
  notifiable_material_changes: OPPORTUNITY_CONTEXT_RUNTIME_V1.notifiable_material_changes,
  decision_binding: "optional_and_reported",
  venue_binding: "required_open_or_closed",
  persistence: OPPORTUNITY_CONTEXT_RUNTIME_V1.persistence,
} as const;

export function assertRuntimeScopeV2(
  instrument: string, timeframe: string, anchorMs: number,
): void {
  if (!Number.isFinite(anchorMs) || anchorMs % BAR_MS !== 0) {
    throw new OpportunityRuntimeError("evaluation_anchor_not_bar_close_aligned", String(anchorMs));
  }
  if (!FORWARD_CONTEXT_INSTRUMENTS.includes(instrument)) {
    throw new OpportunityRuntimeError("instrument_out_of_scope", instrument);
  }
  if (!(OPPORTUNITY_CONTEXT_RUNTIME_V2.timeframe_scope as readonly string[])
    .includes(timeframe)) {
    throw new OpportunityRuntimeError("timeframe_out_of_scope", timeframe);
  }
}

export interface OpportunityPersistRowV2 extends OpportunityPersistRow {
  venue_state: string;
  decision_bound: boolean;
  orchestration_lineage_available: boolean;
  calibration_artifact_available: boolean;
}

export function buildPersistRowV2(
  result: OpportunityContextResultV2,
  ha: HaPatternContextResultV1,
  decisionId: string | null,
): OpportunityPersistRowV2 {
  return {
    ...buildPersistRow(result, ha, decisionId),
    runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V2.runtime_version,
    venue_state: result.venue_state,
    decision_bound: result.decision_bound,
    orchestration_lineage_available: result.orchestration_lineage_available,
    calibration_artifact_available: result.calibration_artifact_available,
  };
}

/** Deterministic run identity for V2. Identical inputs always give identical ids. */
export function deriveRunIdsV2(instrument: string, timeframe: string, anchorIso: string): {
  ha_run_id: string; opportunity_run_id: string;
} {
  const suffix = `${instrument}_${timeframe}_${anchorIso}`;
  return {
    ha_run_id: `ha_ctx_v1r2_${suffix}`,
    opportunity_run_id: `opp_ctx_v2r2_${suffix}`,
  };
}

/** Trace identity used when no stored orchestration decision backs the anchor. */
export function deriveStandaloneTraceId(
  instrument: string, timeframe: string, anchorIso: string,
): string {
  return `ron_opp_ctx_v2_${instrument}_${timeframe}_${anchorIso}`;
}
