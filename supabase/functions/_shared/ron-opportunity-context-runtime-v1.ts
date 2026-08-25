/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — pure runtime helpers that bind the
 * FROZEN pure producer `OPPORTUNITY_CONTEXT_SPEC_V1` to a server-side, append-only
 * persistence path.
 *
 * WHAT THIS MODULE IS
 *   • Pure source-selection + row-shaping helpers. No DB, no network, no wall clock,
 *     no randomness. Every output is a deterministic function of explicit inputs.
 *
 * WHAT THIS MODULE IS NOT
 *   • Not a modification of any frozen artifact. `ron-opportunity-context-spec-v1.ts`,
 *     `ron-ha-pattern-context-spec-v1.ts` and every orchestration run version stay
 *     byte-identical.
 *   • Not a probability, score, confidence, recommendation or order geometry.
 *   • Not a new registered RON agent: nothing here seals an Evidence V1 envelope and
 *     nothing here is admitted into an orchestration decision.
 *
 * HONESTY NOTE ON `registry_status`
 * `OPPORTUNITY_CONTEXT_SPEC_V1.registry_status` declares `persisted:false`,
 * `ui_bound:false`, `notification_channel_bound:false`. Those statements remain TRUE of
 * the spec module itself — it is still a pure producer that writes nothing. This runtime
 * changes the surrounding deployment, so the binding below explicitly supersedes exactly
 * those three deployment-scope fields and nothing else. The supersession is declared in
 * code rather than by silently editing a frozen artifact.
 */
import type {
  HaPatternContextResultV1, HaSnapshotFeatures, HaSourceBar,
} from "./ron-ha-pattern-context-spec-v1.ts";
import {
  OPPORTUNITY_CONTEXT_SPEC_V1, type OpportunityContextResultV1,
  type OpportunityMaterialChange,
} from "./ron-opportunity-context-spec-v1.ts";

export const OPPORTUNITY_CONTEXT_RUNTIME_V1 = {
  runtime_id: "ron_opportunity_context_runtime",
  runtime_version: 1,
  bound_spec_id: OPPORTUNITY_CONTEXT_SPEC_V1.spec_id,
  bound_spec_version: OPPORTUNITY_CONTEXT_SPEC_V1.spec_version,
  instrument_scope: OPPORTUNITY_CONTEXT_SPEC_V1.instrument_scope,
  timeframe_scope: OPPORTUNITY_CONTEXT_SPEC_V1.timeframe_scope,
  bar_minutes: OPPORTUNITY_CONTEXT_SPEC_V1.bar_minutes,

  /** Deployment-scope supersession, declared explicitly. Nothing else is overridden. */
  binding: {
    supersedes_spec_fields: [
      "registry_status.persisted",
      "registry_status.ui_bound",
      "registry_status.notification_channel_bound",
    ],
    persisted: true,
    ui_bound: true,
    notification_channel_bound: true,
    registered_ron_agent: false,
    emits_evidence_envelope: false,
    admitted_into_orchestration_decision: false,
    mutates_frozen_artifacts: false,
  },

  source_contract: {
    /** Raw completed bars only, keyed by bar OPEN, read from `candle_history`. */
    bar_source: "candle_history",
    /** Accepted snapshot features, feature_version 7 only. */
    feature_source: "ron_market_snapshots",
    feature_version: 7,
    /** Sealed specialist envelopes are read from the stored decision's evidence links. */
    evidence_source: "ron_agent_evidence_via_ron_decision_evidence",
    /** The anchor and trace identity are taken from the stored decision — never invented. */
    identity_source: "ron_orchestrator_decisions",
  },

  /** Bars requested for the HA window, and the minimum contiguous tail required. */
  ha_bar_window: 40,
  ha_min_contiguous_bars: 10,

  /**
   * Material-change values that may raise an in-app notification. `none` never notifies,
   * and `data_blocked` never notifies because a data condition is not a market event.
   */
  notifiable_material_changes: [
    "new_forming", "strengthened", "confirmed", "weakened",
    "direction_reversal", "invalidated",
  ],

  persistence: {
    table: "ron_opportunity_context",
    mode: "append_only_idempotent",
    conflict_key: ["instrument", "timeframe", "evaluation_anchor", "spec_version", "runtime_version"],
    stores_numeric_probability: false,
    stores_execution_intent: false,
    stores_user_identifiable_material: false,
  },
} as const;

export const BAR_MS = OPPORTUNITY_CONTEXT_RUNTIME_V1.bar_minutes * 60_000;

export type OpportunityRuntimeRejection =
  | "evaluation_anchor_not_bar_close_aligned"
  | "instrument_out_of_scope"
  | "timeframe_out_of_scope"
  | "analytical_bar_missing"
  | "insufficient_contiguous_bars"
  | "stored_decision_missing"
  | "stored_decision_anchor_mismatch";

export class OpportunityRuntimeError extends Error {
  override readonly name = "OpportunityRuntimeError";
  constructor(readonly reason: OpportunityRuntimeRejection, readonly detail?: string) {
    super(`opportunity_context_runtime_v1_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export function assertRuntimeScope(instrument: string, timeframe: string, anchorMs: number): void {
  if (!Number.isFinite(anchorMs) || anchorMs % BAR_MS !== 0) {
    throw new OpportunityRuntimeError("evaluation_anchor_not_bar_close_aligned", String(anchorMs));
  }
  if (!(OPPORTUNITY_CONTEXT_RUNTIME_V1.instrument_scope as readonly string[]).includes(instrument)) {
    throw new OpportunityRuntimeError("instrument_out_of_scope", instrument);
  }
  if (!(OPPORTUNITY_CONTEXT_RUNTIME_V1.timeframe_scope as readonly string[]).includes(timeframe)) {
    throw new OpportunityRuntimeError("timeframe_out_of_scope", timeframe);
  }
}

export interface RawCandleRow {
  timestamp: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
}

const num = (v: unknown): number => typeof v === "number" ? v : Number(v);

/**
 * Returns the ascending, strictly contiguous completed-bar tail whose NEWEST bar opens at
 * exactly `anchor - one bar`. A gap truncates the window at the gap: the producer is never
 * handed a synthetic or discontinuous Heikin Ashi seed.
 */
export function selectHaSourceBars(
  rows: RawCandleRow[],
  anchorMs: number,
  window = OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_bar_window,
): HaSourceBar[] {
  const analytical = anchorMs - BAR_MS;
  const byTime = new Map<number, HaSourceBar>();
  for (const r of rows) {
    const t = Date.parse(String(r.timestamp));
    if (!Number.isFinite(t) || t > analytical) continue;
    const bar: HaSourceBar = {
      time: t, open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close),
    };
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) continue;
    byTime.set(t, bar);
  }
  if (!byTime.has(analytical)) {
    throw new OpportunityRuntimeError("analytical_bar_missing", new Date(analytical).toISOString());
  }
  const out: HaSourceBar[] = [];
  for (let i = 0; i < window; i++) {
    const bar = byTime.get(analytical - i * BAR_MS);
    if (!bar) break;
    out.push(bar);
  }
  if (out.length < OPPORTUNITY_CONTEXT_RUNTIME_V1.ha_min_contiguous_bars) {
    throw new OpportunityRuntimeError("insufficient_contiguous_bars", String(out.length));
  }
  return out.reverse();
}

const FEATURE_KEYS: (keyof HaSnapshotFeatures)[] = [
  "ema9", "ema21", "ema_stack", "ema21_slope", "adx14", "di_plus", "di_minus",
  "macd_state", "rsi14", "rsi14_slope3", "volatility_regime", "regime",
];

/** Projects a stored snapshot `features` object onto the accepted HA feature subset. */
export function pickSnapshotFeatures(features: unknown): HaSnapshotFeatures | null {
  if (!features || typeof features !== "object") return null;
  const src = features as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let present = false;
  for (const key of FEATURE_KEYS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) { out[key] = v; present = true; continue; }
    if (typeof v === "string" && v.trim()) { out[key] = v; present = true; }
  }
  return present ? out as HaSnapshotFeatures : null;
}

export interface StoredEvidenceRow {
  agent_id: string;
  envelope: unknown;
}

/** Returns the sealed envelope stored for one agent id, or null. Never substitutes. */
export function envelopeByAgent(rows: StoredEvidenceRow[], agentId: string): unknown | null {
  for (const r of rows) if (r?.agent_id === agentId) return r.envelope ?? null;
  return null;
}

export function isNotifiableMaterialChange(value: string | null | undefined): boolean {
  return (OPPORTUNITY_CONTEXT_RUNTIME_V1.notifiable_material_changes as readonly string[])
    .includes(String(value ?? ""));
}

export interface OpportunityPersistRow {
  spec_id: string;
  spec_version: number;
  spec_hash: string;
  runtime_version: number;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  analytical_bar_open: string;
  trace_id: string;
  run_id: string;
  decision_id: string | null;
  direction_context: string;
  direction_authority: string;
  setup_family: string;
  lifecycle: string;
  material_change_type: string;
  data_state: string;
  data_blocked: boolean;
  pattern_context_state: string;
  cross_asset_context_state: string;
  macro_context_state: string;
  ha_states: Record<string, unknown>;
  context_admissibility: Record<string, unknown>;
  reason_tokens: string[];
  limitations: string[];
  observations: unknown[];
  execution_allowed: false;
  execution_path: "signal_only";
}

/**
 * Shapes the append-only persistence row. Only producer output is copied: no probability,
 * no execution intent, no user identifier and no request-supplied narrative can enter here.
 */
export function buildPersistRow(
  result: OpportunityContextResultV1,
  ha: HaPatternContextResultV1,
  decisionId: string | null,
): OpportunityPersistRow {
  return {
    spec_id: result.spec_id,
    spec_version: result.spec_version,
    spec_hash: result.spec_hash,
    runtime_version: OPPORTUNITY_CONTEXT_RUNTIME_V1.runtime_version,
    instrument: result.instrument,
    timeframe: result.timeframe,
    evaluation_anchor: result.evaluation_anchor,
    analytical_bar_open: result.analytical_bar_open,
    trace_id: result.trace_id,
    run_id: result.run_id,
    decision_id: decisionId,
    direction_context: result.direction_context,
    direction_authority: result.direction_authority,
    setup_family: result.setup_family,
    lifecycle: result.lifecycle,
    material_change_type: result.material_change_type,
    data_state: result.data_state,
    data_blocked: result.data_blocked,
    pattern_context_state: result.pattern_context_state,
    cross_asset_context_state: result.cross_asset_context_state,
    macro_context_state: result.macro_context_state,
    ha_states: { ...ha.states },
    context_admissibility: { ...result.context_admissibility },
    reason_tokens: [...result.reason_tokens],
    limitations: [...result.limitations],
    observations: [...result.observations],
    execution_allowed: false,
    execution_path: "signal_only",
  };
}

/** Prior-anchor inputs, taken ONLY from a previously persisted row. Never inferred. */
export interface PriorOpportunityRow {
  evaluation_anchor: string;
  lifecycle: string;
  direction_context: string;
  ha_states?: Record<string, unknown> | null;
}

export interface PriorOpportunityInputs {
  prior_state: OpportunityContextResultV1["lifecycle"] | null;
  prior_direction_context: OpportunityContextResultV1["direction_context"] | null;
  prior_ema_relationship: string | null;
  prior_ha_lifecycle: HaPatternContextResultV1["states"]["lifecycle"] | null;
}

const EMPTY_PRIOR: PriorOpportunityInputs = {
  prior_state: null, prior_direction_context: null,
  prior_ema_relationship: null, prior_ha_lifecycle: null,
};

/**
 * Accepts a prior row ONLY when it is the immediately preceding anchor. A gap means the
 * lifecycle history is genuinely unknown, and unknown is reported as unknown.
 */
export function priorInputsFrom(
  row: PriorOpportunityRow | null | undefined,
  anchorMs: number,
): PriorOpportunityInputs {
  if (!row) return EMPTY_PRIOR;
  const priorAnchor = Date.parse(String(row.evaluation_anchor));
  if (!Number.isFinite(priorAnchor) || priorAnchor !== anchorMs - BAR_MS) return EMPTY_PRIOR;
  const ha = row.ha_states ?? {};
  const ema = typeof ha.ema_relationship === "string" ? ha.ema_relationship : null;
  const haLifecycle = typeof ha.lifecycle === "string" ? ha.lifecycle : null;
  return {
    prior_state: row.lifecycle as PriorOpportunityInputs["prior_state"],
    prior_direction_context: row.direction_context as PriorOpportunityInputs["prior_direction_context"],
    prior_ema_relationship: ema,
    prior_ha_lifecycle: haLifecycle as PriorOpportunityInputs["prior_ha_lifecycle"],
  };
}

/** Deterministic run identity: identical inputs always produce an identical run id. */
export function deriveRunIds(instrument: string, timeframe: string, anchorIso: string): {
  ha_run_id: string; opportunity_run_id: string;
} {
  const suffix = `${instrument}_${timeframe}_${anchorIso}`;
  return {
    ha_run_id: `ha_ctx_v1_${suffix}`,
    opportunity_run_id: `opp_ctx_v1r1_${suffix}`,
  };
}

export type { OpportunityMaterialChange };
