/**
 * GAINEDGE_CHARTS_LEVELS_V1 — deterministic support / resistance / pivot marks for the
 * Charts overlay.
 *
 * Truthfulness rules:
 *  - Prices come ONLY from the persisted RON snapshot (structural level detections and
 *    the sealed `chart_annotations_v1` envelope). Nothing is estimated or interpolated.
 *  - The TradingView chart is an iframe, so these marks are rendered as an exact price
 *    legend beside/over the chart, never as fabricated pixel-aligned lines.
 */

export type ChartLevelKind = "support" | "resistance" | "pivot";

export interface ChartLevelMark {
  id: string;
  kind: ChartLevelKind;
  /** Short display label, e.g. "Support", "Resistance", "Pivot R1". */
  label: string;
  price: number;
  priceText: string;
  /** Honest provenance note, e.g. "RON structural level" / "Daily pivot". */
  source: string;
}

export function levelDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (["XAUUSD", "NAS100", "US30", "SPX500", "HK50", "GER40", "UK100", "US500"].some((x) => s.includes(x))) return 2;
  return 5;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Max marks rendered per kind so the overlay never covers the chart. */
export const MAX_LEVEL_MARKS = 9;

export function buildChartLevelMarks(
  symbol: string,
  patterns: unknown,
  features: unknown,
): ChartLevelMark[] {
  const dec = levelDecimals(symbol);
  const marks: ChartLevelMark[] = [];
  const seen = new Set<string>();

  const push = (kind: ChartLevelKind, label: string, price: number | null, source: string) => {
    if (price == null) return;
    const priceText = price.toFixed(dec);
    const key = `${kind}:${priceText}`;
    if (seen.has(key)) return;
    seen.add(key);
    marks.push({ id: key, kind, label, price, priceText, source });
  };

  /* 1. Structural support / resistance detections from the RON pattern array. */
  const list = Array.isArray(patterns) ? patterns : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const nameSource = p.pattern_name ?? p.name ?? p.type;
    const name = String(nameSource ?? "").trim().toLowerCase();
    if (name !== "support" && name !== "resistance") continue;
    const kp = (p.key_prices ?? {}) as Record<string, unknown>;
    const price = num(name === "support" ? kp.support : kp.resistance) ?? num(kp.level) ?? num(kp.price);
    push(
      name as ChartLevelKind,
      name === "support" ? "Support" : "Resistance",
      price,
      "RON structural level",
    );
  }

  /* 2. Sealed chart annotations — exact levels and session pivots. */
  const f = (features ?? {}) as Record<string, unknown>;
  const annotations = Array.isArray(f.chart_annotations_v1) ? f.chart_annotations_v1 : [];
  for (const raw of annotations) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const g = (a.geometry ?? {}) as Record<string, unknown>;
    const direction = String(a.direction ?? "").toLowerCase();
    if (g.type === "pivot") {
      const level = String(g.level ?? "").toUpperCase();
      push("pivot", `Pivot ${level}`, num(g.price), "Session pivot (completed session H/L/C)");
    } else if (g.type === "level") {
      const kind: ChartLevelKind = direction === "bullish" ? "support" : "resistance";
      push(kind, kind === "support" ? "Support" : "Resistance", num(g.price), "RON level annotation");
    } else if (g.type === "zone") {
      const low = num(g.low);
      const high = num(g.high);
      const kind: ChartLevelKind = direction === "bullish" ? "support" : "resistance";
      push(kind, kind === "support" ? "Zone low" : "Zone high", kind === "support" ? low : high, "RON zone edge");
    }
  }

  const order: Record<ChartLevelKind, number> = { resistance: 0, pivot: 1, support: 2 };
  return marks
    .sort((a, b) => (order[a.kind] - order[b.kind]) || b.price - a.price)
    .slice(0, MAX_LEVEL_MARKS * 2);
}

export const LEVEL_OVERLAY_NOTE =
  "Exact RON prices. Standard pivot lines are drawn on the chart itself by the Pivot Points study.";
