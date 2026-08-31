/**
 * GAINEDGE_RON_CHART_ANNOTATION_V1
 *
 * Normalised, chart-ready evidence objects for RON. These objects are intentionally
 * independent of the current TradingView iframe so the same evidence can be rendered in
 * the RON side rail today and on a future GainEdge-native / TradingView Advanced Charts
 * canvas without recomputing history.
 *
 * Truthfulness / provenance rules:
 *  - completed bars only: every object has an `as_of_bar_time` cutoff;
 *  - stored geometry is immutable evidence (prices + anchors), never screen coordinates;
 *  - distance from current price is NEVER persisted because it becomes stale immediately;
 *  - no confidence / probability / score fields are allowed;
 *  - Fib geometry must carry explicit confirmed swing endpoints;
 *  - zones must carry both boundaries and an origin anchor;
 *  - EMA events must carry the event anchor, periods and observed EMA values;
 *  - lifecycle describes the evidence object, not an uncalibrated trade signal.
 */

export const RON_CHART_ANNOTATION_VERSION = 1;

export const RON_CHART_ANNOTATION_KINDS = [
  "zone",
  "level",
  "fib",
  "pivot",
  "ema_event",
  "pattern_marker",
  "scenario",
] as const;

export type RonChartAnnotationKind = typeof RON_CHART_ANNOTATION_KINDS[number];
export type RonChartAnnotationDirection = "bullish" | "bearish" | "contextual" | "neutral";
export type RonChartAnnotationLifecycle =
  | "detected"
  | "current"
  | "retested"
  | "broken"
  | "invalidated"
  | "historical";

export interface RonChartAnchorV1 {
  /** ISO-8601 completed-bar timestamp. */
  bar_time: string;
  /** Optional zero-based detector/window index when it was genuinely persisted. */
  bar_index?: number | null;
  /** Optional source price at the anchor. */
  price?: number | null;
}

export interface RonZoneGeometryV1 {
  type: "zone";
  low: number;
  high: number;
}

export interface RonLevelGeometryV1 {
  type: "level";
  price: number;
}

export interface RonFibGeometryV1 {
  type: "fib";
  ratio: 0.382 | 0.5 | 0.618 | 0.786 | 1.272 | 1.618;
  price: number;
  swing_start: RonChartAnchorV1 & { price: number };
  swing_end: RonChartAnchorV1 & { price: number };
}

export interface RonPivotGeometryV1 {
  type: "pivot";
  level: "P" | "R1" | "R2" | "R3" | "S1" | "S2" | "S3";
  price: number;
  /** The completed trading session whose H/L/C generated the pivot. */
  source_session: {
    start_time: string;
    end_time: string;
    high: number;
    low: number;
    close: number;
  };
}

export interface RonEmaEventGeometryV1 {
  type: "ema_event";
  event: "cross" | "reclaim" | "rejection" | "stack";
  fast_period: 9 | 21 | 50 | 200;
  slow_period?: 9 | 21 | 50 | 200 | null;
  event_anchor: RonChartAnchorV1 & { price: number };
  fast_value: number;
  slow_value?: number | null;
}

export interface RonPatternMarkerGeometryV1 {
  type: "pattern_marker";
  start_anchor: RonChartAnchorV1;
  end_anchor: RonChartAnchorV1;
  key_prices?: Record<string, number>;
}

export interface RonScenarioGeometryV1 {
  type: "scenario";
  /** Scenario objects only describe declared reference levels, never broker orders. */
  reference_levels: Array<{ label: string; price: number }>;
}

export type RonChartGeometryV1 =
  | RonZoneGeometryV1
  | RonLevelGeometryV1
  | RonFibGeometryV1
  | RonPivotGeometryV1
  | RonEmaEventGeometryV1
  | RonPatternMarkerGeometryV1
  | RonScenarioGeometryV1;

export interface RonChartAnnotationV1 {
  annotation_version: 1;
  id: string;
  symbol: string;
  timeframe: string;
  kind: RonChartAnnotationKind;
  /** Stable semantic subtype, normally a technical-setup id or named pattern id. */
  subtype: string;
  direction: RonChartAnnotationDirection;
  lifecycle: RonChartAnnotationLifecycle;
  source_agent: string;
  source_setup_id?: string | null;
  /** Point-in-time cutoff: RON knew only data through this completed bar. */
  as_of_bar_time: string;
  /** The bar / source event from which this evidence object originated. */
  origin_anchor: RonChartAnchorV1;
  last_test_anchor?: RonChartAnchorV1 | null;
  retest_count?: number | null;
  geometry: RonChartGeometryV1;
  /** IDs/keys of persisted evidence used to create the object. */
  evidence_refs?: string[];
  provenance?: Record<string, string | number | boolean | null>;
}

const FORBIDDEN_KEYS = new Set([
  "confidence",
  "probability",
  "score",
  "distance",
  "distance_points",
  "distance_to_price",
  "distance_to_current_price",
  "current_distance",
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validAnchor(a: unknown): a is RonChartAnchorV1 {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  if (typeof x.bar_time !== "string" || !ISO_RE.test(x.bar_time)) return false;
  if (x.bar_index != null && (!Number.isInteger(x.bar_index) || Number(x.bar_index) < 0)) return false;
  if (x.price != null && !finite(x.price)) return false;
  return true;
}

function hasForbiddenKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return key;
    if (Array.isArray(child)) {
      for (const item of child) {
        const nested = hasForbiddenKey(item);
        if (nested) return nested;
      }
    } else if (child && typeof child === "object") {
      const nested = hasForbiddenKey(child);
      if (nested) return nested;
    }
  }
  return null;
}

function validateGeometry(kind: RonChartAnnotationKind, geometry: unknown): string | null {
  if (!geometry || typeof geometry !== "object") return "geometry_required";
  const g = geometry as Record<string, unknown>;
  if (g.type !== kind && !(kind === "level" && g.type === "level")) return "kind_geometry_mismatch";

  if (kind === "zone") {
    if (!finite(g.low) || !finite(g.high) || Number(g.low) >= Number(g.high)) return "invalid_zone_geometry";
  } else if (kind === "level") {
    if (!finite(g.price)) return "invalid_level_geometry";
  } else if (kind === "fib") {
    const allowed = new Set([0.382, 0.5, 0.618, 0.786, 1.272, 1.618]);
    if (!finite(g.ratio) || !allowed.has(Number(g.ratio)) || !finite(g.price)) return "invalid_fib_geometry";
    if (!validAnchor(g.swing_start) || !finite(g.swing_start.price)) return "fib_swing_start_required";
    if (!validAnchor(g.swing_end) || !finite(g.swing_end.price)) return "fib_swing_end_required";
  } else if (kind === "pivot") {
    const levels = new Set(["P", "R1", "R2", "R3", "S1", "S2", "S3"]);
    if (!levels.has(String(g.level)) || !finite(g.price)) return "invalid_pivot_geometry";
    const s = g.source_session as Record<string, unknown> | undefined;
    if (!s || typeof s.start_time !== "string" || typeof s.end_time !== "string" || !finite(s.high) || !finite(s.low) || !finite(s.close)) {
      return "pivot_source_session_required";
    }
  } else if (kind === "ema_event") {
    const periods = new Set([9, 21, 50, 200]);
    if (!["cross", "reclaim", "rejection", "stack"].includes(String(g.event))) return "invalid_ema_event";
    if (!periods.has(Number(g.fast_period)) || !finite(g.fast_value)) return "invalid_ema_fast_evidence";
    if (g.slow_period != null && !periods.has(Number(g.slow_period))) return "invalid_ema_slow_period";
    if (g.slow_value != null && !finite(g.slow_value)) return "invalid_ema_slow_value";
    if (!validAnchor(g.event_anchor) || !finite(g.event_anchor.price)) return "ema_event_anchor_required";
  } else if (kind === "pattern_marker") {
    if (!validAnchor(g.start_anchor) || !validAnchor(g.end_anchor)) return "pattern_span_required";
  } else if (kind === "scenario") {
    if (!Array.isArray(g.reference_levels) || g.reference_levels.length === 0) return "scenario_reference_levels_required";
    for (const row of g.reference_levels) {
      if (!row || typeof row !== "object") return "invalid_scenario_reference_level";
      const r = row as Record<string, unknown>;
      if (typeof r.label !== "string" || !finite(r.price)) return "invalid_scenario_reference_level";
    }
  }
  return null;
}

/**
 * Runtime validator for persisted / agent-produced annotation payloads.
 * Returns a stable machine-readable reason instead of throwing inside a RON cycle.
 */
export function validateRonChartAnnotationV1(value: unknown): { ok: true } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") return { ok: false, reason: "annotation_required" };
  const a = value as Record<string, unknown>;
  const forbidden = hasForbiddenKey(a);
  if (forbidden) return { ok: false, reason: `forbidden_field:${forbidden}` };
  if (a.annotation_version !== 1) return { ok: false, reason: "annotation_version_mismatch" };
  if (typeof a.id !== "string" || !a.id.trim()) return { ok: false, reason: "id_required" };
  if (typeof a.symbol !== "string" || !a.symbol.trim()) return { ok: false, reason: "symbol_required" };
  if (typeof a.timeframe !== "string" || !a.timeframe.trim()) return { ok: false, reason: "timeframe_required" };
  if (!RON_CHART_ANNOTATION_KINDS.includes(a.kind as RonChartAnnotationKind)) return { ok: false, reason: "invalid_kind" };
  if (!["bullish", "bearish", "contextual", "neutral"].includes(String(a.direction))) return { ok: false, reason: "invalid_direction" };
  if (!["detected", "current", "retested", "broken", "invalidated", "historical"].includes(String(a.lifecycle))) return { ok: false, reason: "invalid_lifecycle" };
  if (typeof a.source_agent !== "string" || !a.source_agent.trim()) return { ok: false, reason: "source_agent_required" };
  if (typeof a.as_of_bar_time !== "string" || !ISO_RE.test(a.as_of_bar_time)) return { ok: false, reason: "completed_bar_cutoff_required" };
  if (!validAnchor(a.origin_anchor)) return { ok: false, reason: "origin_anchor_required" };
  if (a.last_test_anchor != null && !validAnchor(a.last_test_anchor)) return { ok: false, reason: "invalid_last_test_anchor" };
  if (a.retest_count != null && (!Number.isInteger(a.retest_count) || Number(a.retest_count) < 0)) return { ok: false, reason: "invalid_retest_count" };
  const geometryReason = validateGeometry(a.kind as RonChartAnnotationKind, a.geometry);
  if (geometryReason) return { ok: false, reason: geometryReason };
  return { ok: true };
}

/** Human-readable payload metadata for audits / capability reporting. */
export function ronChartAnnotationContractPayloadV1() {
  return [
    "annotation_version", RON_CHART_ANNOTATION_VERSION,
    "kinds", [...RON_CHART_ANNOTATION_KINDS],
    "completed_bar_cutoff_required", true,
    "immutable_price_geometry", true,
    "current_price_distance_persisted", false,
    "numeric_confidence_probability_score_allowed", false,
    "future_chart_renderer_compatible", true,
  ];
}
