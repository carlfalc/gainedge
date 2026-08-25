/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_UI_V1 — pure presentation helpers for stored
 * RON opportunity-context records.
 *
 * Truthfulness rules enforced here:
 *   • Every label is a plain-English restatement of a STORED categorical token.
 *     Nothing is scored, ranked, weighted, forecast or converted to a probability.
 *   • Unknown tokens are mechanically prettified and marked `unknown: true`; a token
 *     that is not in the stored vocabulary is never assigned a meaning.
 *   • No entry, stop, target, size or execution language exists in this file.
 */
export const OPPORTUNITY_CONTEXT_QUALIFIER =
  "Descriptive context built from completed candles and already-stored evidence. "
  + "It is not a probability, a score, a recommendation or a trade instruction.";

export const OPPORTUNITY_CONTEXT_ANCHOR_NOTE =
  "Evaluated at a completed candle close; the analytical candle is the one before it. "
  + "No forming candle is ever used.";

export interface PresentedToken {
  label: string;
  unknown: boolean;
}

function prettify(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "Not recorded";
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function lookup(map: Record<string, string>, raw: string | null | undefined): PresentedToken {
  const key = (raw ?? "").trim();
  const hit = map[key];
  return hit ? { label: hit, unknown: false } : { label: prettify(key), unknown: true };
}

const LIFECYCLE: Record<string, string> = {
  none: "No opportunity context",
  watch: "Watching",
  forming: "Forming",
  strengthening: "Strengthening",
  confirmed: "Context confirmed",
  weakening: "Weakening",
  invalidated: "Invalidated",
};

const DIRECTION: Record<string, string> = {
  bullish: "Bullish context",
  bearish: "Bearish context",
  neutral: "No directional context",
  mixed: "Conflicting directional context",
  unavailable: "Direction context unavailable",
};

const AUTHORITY: Record<string, string> = {
  session_aligned: "Aligned with the stored session structure",
  session_event_relevant: "Relevant to a stored session structure event",
  ha_only_contextual: "Candle context only — no session structure confirmation",
  conflicted: "Conflicts with the stored session structure",
  none: "No structure authority recorded",
};

const SETUP_FAMILY: Record<string, string> = {
  ha_trend_continuation: "Trend continuation family",
  ha_transition_with_ema: "Transition with moving-average family",
  compression_expansion_structure: "Compression / expansion at structure family",
  momentum_reconfirmation: "Momentum reconfirmation family",
  mixed_or_none: "No single setup family",
};

const DATA_STATE: Record<string, string> = {
  healthy: "Source data healthy",
  degraded: "Source data degraded",
  unavailable: "Source data unavailable",
  blocked: "Source data blocked",
};

const MATERIAL_CHANGE: Record<string, string> = {
  none: "No material change",
  new_forming: "New context forming",
  strengthened: "Context strengthened",
  confirmed: "Context confirmed",
  weakened: "Context weakened",
  direction_reversal: "Direction context reversed",
  invalidated: "Context invalidated",
  data_blocked: "Data condition — not a market change",
};

const CONTEXT_STATE: Record<string, string> = {
  supportive: "Supportive",
  disagreeing: "Disagreeing",
  neutral: "Neutral",
  relevant: "Relevant",
  unavailable: "Unavailable",
};

export const presentLifecycle = (v: string | null | undefined) => lookup(LIFECYCLE, v);
export const presentDirection = (v: string | null | undefined) => lookup(DIRECTION, v);
export const presentAuthority = (v: string | null | undefined) => lookup(AUTHORITY, v);
export const presentSetupFamily = (v: string | null | undefined) => lookup(SETUP_FAMILY, v);
export const presentDataState = (v: string | null | undefined) => lookup(DATA_STATE, v);
export const presentMaterialChange = (v: string | null | undefined) => lookup(MATERIAL_CHANGE, v);
export const presentContextState = (v: string | null | undefined) => lookup(CONTEXT_STATE, v);

export type OpportunityTone = "supported" | "caution" | "blocked" | "neutral";

/** Tone is derived ONLY from the stored lifecycle/data tokens — never from a score. */
export function opportunityTone(
  lifecycle: string | null | undefined,
  dataState: string | null | undefined,
): OpportunityTone {
  const d = (dataState ?? "").trim();
  if (d === "blocked" || d === "unavailable") return "blocked";
  const l = (lifecycle ?? "").trim();
  if (l === "confirmed" || l === "strengthening") return "supported";
  if (l === "weakening" || l === "invalidated") return "caution";
  return "neutral";
}

/**
 * A one-sentence restatement of the stored record. Every clause maps to one stored
 * token; nothing is combined into a judgement about what the market will do.
 */
export function opportunitySummary(record: {
  lifecycle: string;
  direction_context: string;
  direction_authority: string;
  setup_family: string;
  data_state: string;
}): string {
  const life = presentLifecycle(record.lifecycle).label;
  const dir = presentDirection(record.direction_context).label.toLowerCase();
  const auth = presentAuthority(record.direction_authority).label.toLowerCase();
  const fam = presentSetupFamily(record.setup_family).label.toLowerCase();
  const data = presentDataState(record.data_state).label.toLowerCase();
  return `${life} · ${dir} · ${auth} · ${fam} · ${data}.`;
}

/** Stored material-change values that the notification layer is allowed to surface. */
export const NOTIFIABLE_MATERIAL_CHANGES = [
  "new_forming", "strengthened", "confirmed", "weakened",
  "direction_reversal", "invalidated",
] as const;

export function isNotifiableMaterialChange(value: string | null | undefined): boolean {
  return (NOTIFIABLE_MATERIAL_CHANGES as readonly string[]).includes((value ?? "").trim());
}
