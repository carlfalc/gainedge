/**
 * GAINEDGE_SIGNALS_V1 — pure presentation helpers for the Signals & Opportunities page.
 *
 * Deterministic formatting only. Every mapping in this file is either:
 *   • confirmed against the Falconer engine/strategy source (see comments), or
 *   • a mechanical prettifier that attaches NO meaning to an unknown token.
 * Nothing here invents lifecycle states, probability, confidence or broker P&L.
 */

/** Falconer stored `status` tokens whose meaning is confirmed in the engine source. */
const FALCONER_STATUS_LABELS: Record<string, string> = {
  // supabase/functions/falconer-engine/index.ts — managed (still running) statuses
  open: "Open",
  tp1_hit: "TP1 hit",
  tp2_hit: "TP2 hit",
  // `updates.status = beDone ? "be_active" : ...` — stop moved to break-even
  be_active: "Break-even active",
  // FALCONER_CLOSED_STATUSES
  closed_sl: "Closed · stop loss",
  closed_tp3: "Closed · TP3",
  closed_ha_flip: "Closed · Heikin Ashi flip",
};

/** Statuses the engine treats as still-managed. Mirrors FALCONER_LIVE_MANAGED_STATUSES. */
export const FALCONER_MANAGED_STATUSES = ["open", "tp1_hit", "tp2_hit", "be_active"];
/** Statuses the engine treats as finished. Mirrors FALCONER_CLOSED_STATUSES. */
export const FALCONER_CLOSED_STATUSES = ["closed_sl", "closed_tp3", "closed_ha_flip"];

/** Falconer `trigger_type` tokens, described from `_shared/falconer-strategy.ts`. */
const FALCONER_TRIGGER_LABELS: Record<string, { label: string; detail: string }> = {
  tpLong: {
    label: "Trend pullback",
    detail: "Trend pullback into the EMA21 band with Heikin Ashi confirmation.",
  },
  sqzUp: {
    label: "Squeeze release",
    detail: "Volatility squeeze released with a close above the prior upper Bollinger band.",
  },
  swPDL: {
    label: "Previous-day low sweep",
    detail: "Prior bar swept the previous-day low and reclaimed it, with momentum up.",
  },
  swAL: {
    label: "Asian low sweep",
    detail: "Prior bar swept the Asian-session low (22:00–06:00 UTC) and reclaimed it.",
  },
};

/** Prettifies an unknown token without assigning it any meaning. */
export function prettifyToken(token: string | null | undefined): string {
  const raw = (token ?? "").trim();
  if (!raw) return "—";
  return raw
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export interface TokenPresentation {
  label: string;
  /** True when the token is not in the confirmed map (mechanical prettify used). */
  unknown: boolean;
  /** Only present for confirmed tokens. */
  detail?: string;
}

export function presentFalconerStatus(token: string | null | undefined): TokenPresentation {
  const key = (token ?? "").trim();
  const known = FALCONER_STATUS_LABELS[key];
  if (known) return { label: known, unknown: false };
  return { label: prettifyToken(key), unknown: true };
}

export function presentFalconerTrigger(token: string | null | undefined): TokenPresentation {
  const key = (token ?? "").trim();
  const known = FALCONER_TRIGGER_LABELS[key];
  if (known) return { label: known.label, detail: known.detail, unknown: false };
  return { label: prettifyToken(key), unknown: true };
}

/** True when the stored status is one the engine still manages. */
export function isManagedStatus(status: string | null | undefined): boolean {
  return FALCONER_MANAGED_STATUSES.includes((status ?? "").trim());
}

/**
 * Price precision derived from the value's own magnitude — no broker/tick metadata is
 * available to this page, so this is presentation rounding only, never a claimed tick size.
 */
export function priceDecimals(value: number | null | undefined): number {
  const v = Math.abs(Number(value ?? 0));
  if (!Number.isFinite(v)) return 2;
  if (v >= 100) return 2;
  if (v >= 1) return 4;
  return 5;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(priceDecimals(Number(value)));
}

/** Stored `pnl_usd` — the column name is the only currency evidence available. */
export const STORED_PNL_LABEL = "Stored strategy P&L (USD)";
export const STORED_PNL_NOTE =
  "Calculated and stored by the Falconer strategy engine from its own record. It is not a broker statement and no order was placed from this page.";

export function formatStoredPnl(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

export const FALCONER_RECORD_BANNER =
  "Falconer strategy record · not a broker order";

export const PAGE_SUBTITLE =
  "Stored RON evidence and Falconer strategy records for review. These records do not represent orders placed with your broker, and no broker orders are placed from this page.";

/** History mode switch — never blended. */
export type HistoryMode = "backtest" | "live_history";

export const HISTORY_MODE_LABELS: Record<HistoryMode, string> = {
  backtest: "Backtest",
  live_history: "Live history",
};

export const HISTORY_MODE_NOTES: Record<HistoryMode, string> = {
  backtest:
    "Simulated records produced by the Falconer backtest runner over historical candles. No live capital, no broker order.",
  live_history:
    "Live-mode Falconer records the engine has finished managing. Strategy records only — not broker orders.",
};

/** Deep links. Only routes/params the existing pages actually accept. */
export function chartsHref(symbol: string): string {
  return `/dashboard/charts?symbol=${encodeURIComponent(symbol)}`;
}

/**
 * The Charts page currently accepts `symbol` only; timeframe is a chart-tab concern
 * there, so it is deliberately NOT appended as a param that would be ignored.
 */
export const CHARTS_TIMEFRAME_NOTE =
  "Charts opens the instrument tab; timeframe is selected on the chart itself.";

/** Relative age, matching the RON decision card's vocabulary. */
export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "unknown age";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown age";
  const mins = Math.floor((now.getTime() - t) / 60_000);
  if (mins < 0) return "not yet reached";
  if (mins < 1) return "less than a minute ago";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Absolute local date+time for records that may be far in the past. */
export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

/** Newest ISO instant in a list, or null. Pure. */
export function latestInstant(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isNaN(t) || t <= bestT) continue;
    bestT = t;
    best = v;
  }
  return best;
}

/** Count of records whose instant falls on the local calendar day of `now`. */
export function countToday(values: (string | null | undefined)[], now: Date = new Date()): number {
  return values.filter((v) => {
    if (!v) return false;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  }).length;
}

/** Case-insensitive contains filter over selected fields. */
export function matchesSearch(term: string, fields: (string | null | undefined)[]): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

/** Unique, sorted, non-empty option list for a filter control. */
export function filterOptions(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort();
}
