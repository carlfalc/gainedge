import {
  validateRonChartAnnotationV1,
  type RonChartAnnotationV1,
} from "../../supabase/functions/_shared/ron-chart-annotation-v1.ts";

export interface RonChartAnnotationDisplayV1 {
  id: string;
  kind: RonChartAnnotationV1["kind"];
  direction: RonChartAnnotationV1["direction"];
  lifecycle: RonChartAnnotationV1["lifecycle"];
  title: string;
  primary: string;
  originLabel: string;
  lastTestLabel: string | null;
  retestLabel: string | null;
  sourceLabel: string;
  /** Derived at render time from the active quote; never persisted in the annotation. */
  liveDistanceLabel: string | null;
}

function decimalsFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (["XAUUSD", "NAS100", "US30", "SPX500", "HK50", "GER40"].some((x) => s.includes(x))) return 2;
  return 5;
}

function price(symbol: string, v: number): string {
  return v.toFixed(decimalsFor(symbol));
}

function shortTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d).replace(",", " ·");
}

function titleise(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function targetPrice(a: RonChartAnnotationV1, currentPrice: number): number | null {
  const g = a.geometry;
  if (g.type === "zone") {
    if (currentPrice < g.low) return g.low;
    if (currentPrice > g.high) return g.high;
    return currentPrice;
  }
  if (g.type === "level" || g.type === "fib" || g.type === "pivot") return g.price;
  if (g.type === "ema_event") return g.event_anchor.price;
  return null;
}

/**
 * Distance is deliberately derived from the active quote and immutable stored geometry.
 * It is expressed in raw instrument price units because broker point-size semantics may
 * differ by instrument/account and must not be guessed in the Charts UI.
 */
export function liveAnnotationDistancePriceUnits(
  a: RonChartAnnotationV1,
  currentPrice: number | null | undefined,
): number | null {
  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) return null;
  const target = targetPrice(a, currentPrice);
  return target == null ? null : Math.abs(currentPrice - target);
}

function primaryText(a: RonChartAnnotationV1): string {
  const g = a.geometry;
  if (g.type === "zone") return `${price(a.symbol, g.low)}–${price(a.symbol, g.high)}`;
  if (g.type === "level") return price(a.symbol, g.price);
  if (g.type === "fib") return `${(g.ratio * 100).toFixed(1)}% · ${price(a.symbol, g.price)}`;
  if (g.type === "pivot") return `${g.level} · ${price(a.symbol, g.price)}`;
  if (g.type === "ema_event") {
    const pair = g.slow_period ? `EMA${g.fast_period}/${g.slow_period}` : `EMA${g.fast_period}`;
    return `${pair} · ${price(a.symbol, g.event_anchor.price)}`;
  }
  if (g.type === "pattern_marker") return `${shortTimestamp(g.start_anchor.bar_time)} → ${shortTimestamp(g.end_anchor.bar_time)}`;
  return g.reference_levels.map((x) => `${x.label} ${price(a.symbol, x.price)}`).join(" · ");
}

function displayTitle(a: RonChartAnnotationV1): string {
  const g = a.geometry;
  if (g.type === "zone") {
    if (a.subtype.startsWith("demand_")) return "Demand zone";
    if (a.subtype.startsWith("supply_")) return "Supply zone";
    return "Price zone";
  }
  if (g.type === "fib") return "Fibonacci";
  if (g.type === "pivot") return "Pivot";
  if (g.type === "ema_event") return g.event === "cross" ? "EMA cross" : `EMA ${g.event}`;
  if (g.type === "level") return titleise(a.subtype);
  if (g.type === "pattern_marker") return titleise(a.subtype);
  return "RON scenario";
}

export function buildRonChartAnnotationDisplayV1(
  value: unknown,
  currentPrice?: number | null,
): RonChartAnnotationDisplayV1 | null {
  const valid = validateRonChartAnnotationV1(value);
  if (!valid.ok) return null;
  const a = value as RonChartAnnotationV1;
  const distance = liveAnnotationDistancePriceUnits(a, currentPrice);
  const distanceText = distance == null
    ? null
    : distance === 0
      ? "Price is inside/at this level now"
      : `${price(a.symbol, distance)} price units from current quote`;

  return {
    id: a.id,
    kind: a.kind,
    direction: a.direction,
    lifecycle: a.lifecycle,
    title: displayTitle(a),
    primary: primaryText(a),
    originLabel: `Origin ${shortTimestamp(a.origin_anchor.bar_time)}`,
    lastTestLabel: a.last_test_anchor ? `Last test ${shortTimestamp(a.last_test_anchor.bar_time)}` : null,
    retestLabel: typeof a.retest_count === "number" ? `${a.retest_count} retest${a.retest_count === 1 ? "" : "s"}` : null,
    sourceLabel: `Source: ${titleise(a.source_agent)}`,
    liveDistanceLabel: distanceText,
  };
}

/**
 * Reads the forward annotation array only when it is actually present. No fallback object
 * is fabricated from prose or inferred from the TradingView iframe.
 */
export function buildRonChartAnnotationDisplaysFromFeaturesV1(
  features: unknown,
  currentPrice?: number | null,
): RonChartAnnotationDisplayV1[] {
  if (!features || typeof features !== "object") return [];
  const rows = (features as Record<string, unknown>).chart_annotations_v1;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => buildRonChartAnnotationDisplayV1(row, currentPrice))
    .filter((row): row is RonChartAnnotationDisplayV1 => row != null);
}
