/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — MATERIAL EVENT V1 (pure).
 *
 * Turns an already-persisted opportunity-context record into the durable, append-only
 * material-event row that survives a user being offline.
 *
 * Rules encoded here:
 *   • DETERMINISTIC DEDUPE. `event_key` is a pure function of the record identity, so the
 *     same anchor can be re-evaluated any number of times and produce exactly one event.
 *   • NO UNCHANGED-STATE SPAM. `material_change_type = none` never becomes an event, and
 *     a pure data condition (`data_blocked`) never becomes a market event.
 *   • CONFIRMED IS POPUP-CAPABLE. Every notifiable material change is popup-capable; the
 *     confirmation of an opportunity is explicitly included.
 *   • NOTHING PREDICTIVE. An event carries categorical state only: no probability, no
 *     score, no recommendation, no order geometry.
 */
export const RON_MATERIAL_EVENT_VERSION = 1;

/** Material changes that are genuine market-state events. `none` is deliberately absent. */
export const MATERIAL_EVENT_TYPES = [
  "new_forming", "strengthened", "confirmed", "weakened",
  "direction_reversal", "invalidated",
] as const;
export type MaterialEventType = typeof MATERIAL_EVENT_TYPES[number];

/** Material changes that may raise an in-app popup while the user is online. */
export const POPUP_CAPABLE_EVENT_TYPES: readonly MaterialEventType[] = [
  "new_forming", "strengthened", "confirmed", "weakened",
  "direction_reversal", "invalidated",
];

export function isMaterialEventType(v: unknown): v is MaterialEventType {
  return (MATERIAL_EVENT_TYPES as readonly string[]).includes(String(v ?? ""));
}

export function isPopupCapable(v: unknown): boolean {
  return (POPUP_CAPABLE_EVENT_TYPES as readonly string[]).includes(String(v ?? ""));
}

export interface MaterialEventSource {
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  analytical_bar_open: string;
  spec_version: number;
  runtime_version: number;
  context_id: string | null;
  decision_id: string | null;
  trace_id: string | null;
  material_change_type: string;
  lifecycle: string;
  direction_context: string;
  direction_authority: string;
  setup_family: string;
  data_state: string;
  data_blocked: boolean;
  venue_state: string | null;
}

export interface MaterialEventRow extends Omit<MaterialEventSource, "material_change_type"> {
  event_key: string;
  source: "ron_opportunity_context";
  material_change_type: MaterialEventType;
  popup_capable: boolean;
  outcome_state: "pending";
}

/** Stable across re-evaluation of the same anchor by the same spec/runtime lineage. */
export function materialEventKey(s: MaterialEventSource): string {
  return [
    "ron_opp_ctx", s.instrument, s.timeframe, s.evaluation_anchor,
    `spec${s.spec_version}`, `rt${s.runtime_version}`, s.material_change_type,
  ].join("|");
}

/**
 * Returns the event row, or null when this record must NOT raise an event.
 * Deny-by-default: anything that is not an explicitly listed material change is silence.
 */
export function buildMaterialEventRow(s: MaterialEventSource): MaterialEventRow | null {
  if (!isMaterialEventType(s.material_change_type)) return null;
  if (s.data_blocked === true) return null;
  return {
    ...s,
    material_change_type: s.material_change_type as MaterialEventType,
    event_key: materialEventKey(s),
    source: "ron_opportunity_context",
    popup_capable: isPopupCapable(s.material_change_type),
    outcome_state: "pending",
  };
}
