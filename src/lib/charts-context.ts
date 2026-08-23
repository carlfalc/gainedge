/**
 * GAINEDGE_CHARTS_UI_V1_PATH_A — pure presentation helpers for the Charts page.
 *
 * Truthfulness rules encoded here:
 *  - The TradingView chart FEED and the connected MetaAPI TRADING account are two
 *    independent things. This module never implies one changes the other, and never
 *    claims price equivalence between them.
 *  - RON context is read from the CURRENT production snapshot only. When no snapshot
 *    exists for a symbol we emit an explicit "data building" state, never intelligence.
 *  - No probability, confidence, score, forecast, or BUY/SELL/entry/SL/TP recommendation
 *    is ever produced here.
 *  - The TradingView iframe's user-selected interval is NOT observable from the app, so
 *    every RON label states the RON evidence timeframe (15m), not the chart interval.
 */
import { formatAgeShort } from "@/lib/market-provenance-presentation";
import { ronStateFrom, type RonSnapshotRow, type RonState } from "@/services/ron-snapshots";

/** RON evidence timeframe for the charts rail. Not the TradingView chart interval. */
export const RON_CONTEXT_TIMEFRAME = "15m";

/* ------------------------------------------------------------------ *
 * Chart feed vs trading account
 * ------------------------------------------------------------------ */

export interface TradingAccountInfo {
  brokerName: string;
  accountType: string;
  status: string;
  accountId: string | null;
}

export interface FeedVsAccount {
  feedLabel: string;
  tradingLabel: string;
  connected: boolean;
  /** True only when BOTH are known and the broker identities differ. */
  mismatch: boolean;
  /** Empty string when there is nothing truthful to warn about. */
  mismatchNote: string;
}

/** Loose broker-identity key so "IC Markets" and "icmarkets" compare equal. */
export function brokerKey(name: string | null | undefined): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function describeFeedVsAccount(
  chartFeed: string,
  account: TradingAccountInfo | null,
): FeedVsAccount {
  const feedLabel = `Chart feed: ${chartFeed}`;
  if (!account || !account.accountId || account.status !== "connected") {
    return {
      feedLabel,
      tradingLabel: "Trading account: Not connected",
      connected: false,
      mismatch: false,
      mismatchNote: "",
    };
  }
  const type = account.accountType ? account.accountType.toLowerCase() : "";
  const typeLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
  const tradingLabel = `Trading: ${account.brokerName}${typeLabel ? ` ${typeLabel}` : ""} • Connected`;
  const mismatch = brokerKey(chartFeed) !== brokerKey(account.brokerName);
  return {
    feedLabel,
    tradingLabel,
    connected: true,
    mismatch,
    mismatchNote: mismatch ? "Chart prices and execution broker differ." : "",
  };
}

/* ------------------------------------------------------------------ *
 * Positions
 * ------------------------------------------------------------------ */

/** Broker symbol aliases already used by the execution panel. */
export const CHART_SYMBOL_ALIASES: Record<string, string[]> = {
  XAUUSD: ["XAUUSD"], US30: ["US30", "DJ30"], NAS100: ["NAS100", "USTEC"],
  NZDUSD: ["NZDUSD"], AUDUSD: ["AUDUSD"], EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"], USDJPY: ["USDJPY"],
};

const strip = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Filters broker positions to the active canonical symbol using known aliases only. */
export function filterPositionsForSymbol<T extends { symbol?: string }>(
  positions: T[],
  symbol: string,
): T[] {
  const canonical = strip(symbol);
  const aliases = (CHART_SYMBOL_ALIASES[canonical] ?? [canonical]).map(strip);
  return positions.filter((p) => {
    const s = strip(String(p.symbol ?? ""));
    return s.length > 0 && aliases.some((a) => s.includes(a));
  });
}

/* ------------------------------------------------------------------ *
 * RON context for the rail
 * ------------------------------------------------------------------ */

export interface RonChartContextUnavailable {
  available: false;
  message: string;
}

export interface RonChartEvidenceChip {
  label: string;
  value: string;
}

export interface RonChartContextAvailable {
  available: true;
  state: RonState;
  why: string;
  next: string;
  /** Timeframe of the RON evidence — never the TradingView interval. */
  timeframe: string;
  /** e.g. "RON evaluated on completed 15m bar · 4m ago". */
  evaluatedLabel: string;
  barTime: string;
  dataHealth: RonSnapshotRow["data_health"];
  dataHealthLabel: string;
  regime: string | null;
  chips: RonChartEvidenceChip[];
  patternsLabel: string;
}

export type RonChartContext = RonChartContextUnavailable | RonChartContextAvailable;

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Source data healthy",
  stale: "Source data stale",
  insufficient: "Insufficient source data",
  error: "Source data error",
};

function num(v: unknown, digits: number): string | null {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : null;
}

/**
 * Builds the rail's RON context strictly from a current snapshot row.
 * Any missing snapshot yields the explicit data-building state.
 */
export function buildRonChartContext(
  symbol: string,
  snapshot: RonSnapshotRow | null | undefined,
  now: number = Date.now(),
): RonChartContext {
  if (!snapshot) {
    return {
      available: false,
      message: `RON data building — no current assessment for ${symbol}`,
    };
  }
  const derived = ronStateFrom(snapshot.features);
  if (!derived) {
    return {
      available: false,
      message: `RON data building — no current assessment for ${symbol}`,
    };
  }
  const tf = snapshot.timeframe || RON_CONTEXT_TIMEFRAME;
  const barMs = new Date(snapshot.bar_time).getTime();
  const ageText = Number.isFinite(barMs) ? formatAgeShort(now - barMs) : null;
  const f = snapshot.features ?? {};

  const chips: RonChartEvidenceChip[] = [];
  const emaStack = f.ema_stack ? String(f.ema_stack) : null;
  if (emaStack) chips.push({ label: "EMA stack", value: emaStack });
  const adx = num(f.adx14, 1);
  if (adx) chips.push({ label: "ADX(14)", value: adx });
  const rsi = num(f.rsi14, 1);
  if (rsi) chips.push({ label: "RSI(14)", value: rsi });
  if (f.macd_state) chips.push({ label: "MACD", value: String(f.macd_state).replace(/_/g, " ") });
  const atr = num(f.atr_pct, 2);
  if (atr) chips.push({ label: "ATR %", value: atr });

  const patterns = Array.isArray(snapshot.patterns) ? snapshot.patterns : [];
  const patternsLabel = patterns.length
    ? patterns
        .map((p: Record<string, unknown>) => String(p?.name ?? p?.type ?? "pattern").replace(/_/g, " "))
        .slice(0, 3)
        .join(", ")
    : "No pattern on the current bar";

  return {
    available: true,
    state: derived.state,
    why: derived.why,
    next: derived.next,
    timeframe: tf,
    evaluatedLabel: ageText
      ? `RON evaluated on completed ${tf} bar · ${ageText} ago`
      : `RON evaluated on completed ${tf} bar`,
    barTime: snapshot.bar_time,
    dataHealth: snapshot.data_health,
    dataHealthLabel: HEALTH_LABEL[snapshot.data_health] ?? "Source data state unknown",
    regime: f.regime ? String(f.regime).replace(/_/g, " ") : null,
    chips,
    patternsLabel,
  };
}

/* ------------------------------------------------------------------ *
 * Chart context / freshness line
 * ------------------------------------------------------------------ */

export interface ChartContextLineInput {
  symbol: string;
  chartFeed: string;
  tradingLabel: string | null;
  sessionLabel: string | null;
  marketOpen: boolean | null;
  quoteTimestamp: string | number | Date | null;
  ronBarTime: string | null;
  ronTimeframe?: string;
  now?: number;
}

/** Returns ONLY the segments backed by real source values. Never fabricates. */
export function buildChartContextSegments(input: ChartContextLineInput): string[] {
  const now = input.now ?? Date.now();
  const out: string[] = [input.symbol];
  out.push(`Chart feed ${input.chartFeed}`);
  if (input.tradingLabel) out.push(input.tradingLabel);
  if (input.sessionLabel) out.push(input.sessionLabel);
  if (input.marketOpen !== null) out.push(input.marketOpen ? "Market open" : "Market closed");
  if (input.quoteTimestamp) {
    const ms = new Date(input.quoteTimestamp as string).getTime();
    if (Number.isFinite(ms)) out.push(`Quote ${formatAgeShort(now - ms)} ago`);
  }
  if (input.ronBarTime) {
    const ms = new Date(input.ronBarTime).getTime();
    if (Number.isFinite(ms)) {
      out.push(`RON ${input.ronTimeframe ?? RON_CONTEXT_TIMEFRAME} evaluated ${formatAgeShort(now - ms)} ago`);
    }
  }
  return out;
}

/**
 * PATH A LIMITATION (product note, deliberately code-adjacent):
 * True chart-coordinate session shading and price-coordinate order lines are NOT
 * possible inside the public TradingView Advanced Chart iframe. They are deferred to a
 * future charting-library / TradingView Trading Platform architecture. The active
 * session is therefore surfaced in the context strip only — we never overlay arbitrary
 * translucent rectangles on the iframe and call them sessions.
 */
export const CHART_SESSION_SHADING_DEFERRED =
  "Session shading on the price chart is deferred to a future charting architecture.";

/** Orders rail truthful state: pending broker orders are not retrievable yet. */
export const ORDERS_NOT_SYNCED_MESSAGE =
  "Pending broker orders are not yet synced in this build.";
