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
  /** Readable current-snapshot pattern labels, max 3. */
  patternItems: string[];
  /** Count of current patterns beyond the 3 shown. */
  patternsMore: number;
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

/** Max current patterns rendered before collapsing into "+N more". */
export const MAX_VISIBLE_PATTERNS = 3;

/**
 * Reads the REAL v6 `ron_market_snapshots.patterns` schema: `pattern_name`, `direction`,
 * `confidence`, `start_index`/`end_index`, `key_prices`.
 *
 * The numeric `confidence` field is deliberately NOT surfaced: numeric probability /
 * confidence publication remains governed and is not calibrated for user-facing
 * opportunity semantics. Only the name and the categorical direction are shown.
 */
export function describeSnapshotPatterns(
  patterns: unknown,
): { items: string[]; more: number } {
  const list = Array.isArray(patterns) ? patterns : [];
  const items: string[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const nameSource = p.pattern_name ?? p.name ?? p.type;
    if (typeof nameSource !== "string" || nameSource.trim() === "") continue;
    const name = nameSource.replace(/_/g, " ").trim();
    const dir = typeof p.direction === "string" && p.direction.trim() !== ""
      ? p.direction.replace(/_/g, " ").trim()
      : null;
    items.push(dir ? `${name} · ${dir}` : name);
  }
  return {
    items: items.slice(0, MAX_VISIBLE_PATTERNS),
    more: Math.max(0, items.length - MAX_VISIBLE_PATTERNS),
  };
}

/* ------------------------------------------------------------------ *
 * GAINEDGE_CHARTS_UI_V1_2 — plain-English RON status + pattern recency
 * ------------------------------------------------------------------ */

/**
 * Plain-English rendering of the deterministic `ronStateFrom()` label.
 *
 * These are STANCE words only. They are never translated into BUY / SELL / LONG /
 * SHORT: the persisted Opportunity engine is not live in the UI, so a directional
 * recommendation would overstate what the current evidence supports.
 */
export const RON_STATE_PLAIN: Record<RonState, string> = {
  WAIT: "RON: WAITING",
  WATCH: "RON: WATCHING",
  "SETUP FORMING": "RON: SETUP FORMING",
};

export function ronPlainStatus(state: RonState): string {
  return RON_STATE_PLAIN[state];
}

/**
 * Secondary CONTEXT label — only for unambiguous directional regimes. Ranging and
 * transition regimes deliberately produce no direction: inventing one would be a
 * fabricated bias. This is context, never a BUY/SELL instruction.
 */
export function regimeContextLabel(regime: unknown): string | null {
  const r = String(regime ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (r === "trending_up") return "Bullish context";
  if (r === "trending_down") return "Bearish context";
  return null;
}

/** Hard cap of the pattern detector's input window (`computeRonSnapshot` slices 150). */
export const PATTERN_INPUT_MAX_BARS = 150;

/** Structural level detections that must never be counted as named chart patterns. */
const LEVEL_PATTERN_NAMES = new Set(["support", "resistance"]);

export interface NamedPatternDetection {
  /** Stable render key. */
  key: string;
  name: string;
  direction: string | null;
  /** "Double Bottom · bullish" */
  label: string;
  startIndex: number | null;
  endIndex: number | null;
  /** Completed bars between the detection end and the pattern-window end. */
  barsAgo: number | null;
  /** "33 bars ago" — the authoritative text. Null when provenance is unavailable. */
  barsAgoLabel: string | null;
  /** Optional non-authoritative "~8h 15m of 15m bars". Null when unparseable. */
  approxSpanLabel: string | null;
  /**
   * True only when the stored row carries provenance + a valid index span inside the
   * detector window, so a truthful candle preview can be rebuilt. Never a guess.
   */
  previewable: boolean;
  /** Short honest reason shown when `previewable` is false. Null when previewable. */
  notPreviewableReason: string | null;
  /** Verbatim stored pattern object — the only source of preview geometry. */
  source: unknown;
}


export interface LevelContextItem {
  kind: "Support" | "Resistance";
  price: string;
}

export interface PatternContext {
  /** Most recent named detection by end_index, or null when there are none. */
  latest: NamedPatternDetection | null;
  /** Older named detections, most recent first. */
  earlier: NamedPatternDetection[];
  /** Named chart-pattern count — excludes Support/Resistance entries. */
  namedCount: number;
  /** Structural support/resistance levels, max 3. */
  levels: LevelContextItem[];
}

/** Max structural levels surfaced in the level-context block. */
export const MAX_LEVEL_ITEMS = 3;

/**
 * Deterministic pattern-window size, derived ONLY from real provenance.
 * Returns null when `features.provenance.window_size` is missing or invalid — in that
 * case no age is displayed rather than guessed.
 */
export function patternInputBars(features: unknown): number | null {
  const f = (features ?? {}) as Record<string, unknown>;
  const prov = (f.provenance ?? {}) as Record<string, unknown>;
  const ws = prov.window_size;
  if (typeof ws !== "number" || !Number.isFinite(ws) || ws <= 0) return null;
  return Math.min(PATTERN_INPUT_MAX_BARS, Math.floor(ws));
}

/** Minutes per bar from a timeframe string, or null when it cannot be parsed safely. */
function timeframeMinutes(tf: unknown): number | null {
  const m = String(tf ?? "").trim().toLowerCase().match(/^(\d+)\s*(m|h|d)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
}

function approxSpan(barsAgo: number, tf: unknown): string | null {
  const mins = timeframeMinutes(tf);
  if (mins == null || barsAgo <= 0) return null;
  const total = barsAgo * mins;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  const span = h > 0 ? (mm > 0 ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
  return `~${span} of ${String(tf)} bars`;
}

function titleise(raw: string): string {
  return raw.replace(/_/g, " ").trim();
}

function priceText(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v.toFixed(Math.abs(v) >= 100 ? 2 : 4);
  }
  return null;
}

/**
 * Builds the Charts rail's PATTERN CONTEXT model from the real v6 patterns array.
 *
 * Truthfulness rules:
 *  - The detector scans a rolling recent window, so entries are NOT simultaneously
 *    active. No entry is ever labelled current/active/confirmed/valid/invalidated:
 *    the source carries no pattern lifecycle.
 *  - Ordering is by `end_index` recency, never by numeric `confidence`, and the
 *    numeric confidence value is never surfaced.
 *  - Support/Resistance are structural levels, surfaced separately and excluded from
 *    the named-pattern count.
 */
export function buildPatternContext(
  patterns: unknown,
  features: unknown,
  timeframe?: string,
): PatternContext {
  const list = Array.isArray(patterns) ? patterns : [];
  const bars = patternInputBars(features);
  const latestIndex = bars == null ? null : bars - 1;

  const named: NamedPatternDetection[] = [];
  const levels: LevelContextItem[] = [];

  list.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const p = raw as Record<string, unknown>;
    const nameSource = p.pattern_name ?? p.name ?? p.type;
    if (typeof nameSource !== "string" || nameSource.trim() === "") return;
    const name = titleise(nameSource);

    if (LEVEL_PATTERN_NAMES.has(name.toLowerCase())) {
      const kp = (p.key_prices ?? {}) as Record<string, unknown>;
      const isSupport = name.toLowerCase() === "support";
      const price = priceText(isSupport ? kp.support : kp.resistance) ?? priceText(kp.level ?? kp.price);
      if (price) levels.push({ kind: isSupport ? "Support" : "Resistance", price });
      return;
    }

    const direction = typeof p.direction === "string" && p.direction.trim() !== ""
      ? titleise(p.direction)
      : null;
    const endRaw = p.end_index;
    const endIndex = typeof endRaw === "number" && Number.isFinite(endRaw) && endRaw >= 0
      ? Math.floor(endRaw)
      : null;
    const startRaw = p.start_index;
    const startIndex = typeof startRaw === "number" && Number.isFinite(startRaw) && startRaw >= 0
      ? Math.floor(startRaw)
      : null;
    const barsAgo = latestIndex != null && endIndex != null
      ? Math.max(0, latestIndex - endIndex)
      : null;

    // Previewable ONLY when the stored span can be mapped onto real detector bars.
    let notPreviewableReason: string | null = null;
    if (bars == null || latestIndex == null) {
      notPreviewableReason = "Detector window provenance not stored for this snapshot";
    } else if (startIndex == null || endIndex == null) {
      notPreviewableReason = "Detector did not store a candle span for this detection";
    } else if (startIndex > endIndex || endIndex > latestIndex) {
      notPreviewableReason = "Stored span falls outside the detector window";
    }

    named.push({
      key: `${name}-${endIndex ?? "x"}-${i}`,
      name,
      direction,
      label: direction ? `${name} · ${direction}` : name,
      startIndex,
      endIndex,
      barsAgo,
      barsAgoLabel: barsAgo == null ? null : `${barsAgo} ${barsAgo === 1 ? "bar" : "bars"} ago`,
      approxSpanLabel: barsAgo == null ? null : approxSpan(barsAgo, timeframe),
      previewable: notPreviewableReason == null,
      notPreviewableReason,
      source: raw,
    });
  });


  // Recency ordering by end_index descending; unknown end_index sinks to the bottom.
  named.sort((a, b) => (b.endIndex ?? -1) - (a.endIndex ?? -1));

  return {
    latest: named[0] ?? null,
    earlier: named.slice(1),
    namedCount: named.length,
    levels: levels.slice(0, MAX_LEVEL_ITEMS),
  };
}

/** Compact microcopy explaining the rolling-window nature of the detector. */
export const PATTERN_CONTEXT_NOTE =
  "Pattern scanner reviews a rolling window of recent 15m candles. Older detections are shown as context, not as current signals.";




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

  const { items: patternItems, more: patternsMore } = describeSnapshotPatterns(snapshot.patterns);
  const patternsLabel = patternItems.length
    ? patternItems.join(", ") + (patternsMore > 0 ? `, +${patternsMore} more` : "")
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
    patternItems,
    patternsMore,
  };
}

/* ------------------------------------------------------------------ *
 * Compact instrument intelligence strip (top control row)
 * ------------------------------------------------------------------ */

export interface InstrumentStripChip {
  /** Stable key for rendering / priority-based hiding. */
  id: string;
  label: string;
  /** Lower priority chips hide first on narrow viewports. */
  priority: 1 | 2 | 3;
}

export interface InstrumentStrip {
  symbol: string;
  available: boolean;
  /** RON state pill text when available, otherwise null. */
  state: RonState | null;
  /**
   * Plain-English primary status, e.g. "RON: WATCHING". Never BUY/SELL — the
   * persisted opportunity engine is not live in the UI.
   */
  statusLabel: string | null;
  /** Secondary directional CONTEXT, only for unambiguous trending regimes. */
  contextLabel: string | null;
  /** Secondary freshness text, e.g. "15m context · 1d ago". */
  freshnessLabel: string | null;
  /** Truthful fallback message when no current snapshot exists. */
  message: string | null;
  chips: InstrumentStripChip[];
}

/**
 * Compact glanceable strip for the top control row's central gap.
 * Genuine v6 snapshot fields only — never probability, confidence or a recommendation.
 */
export function buildInstrumentStrip(
  symbol: string,
  snapshot: RonSnapshotRow | null | undefined,
  now: number = Date.now(),
): InstrumentStrip {
  const ctx = buildRonChartContext(symbol, snapshot, now);
  if (!ctx.available) {
    return {
      symbol, available: false, state: null, statusLabel: null,
      contextLabel: null, freshnessLabel: null,
      message: "RON data building", chips: [],
    };
  }
  const chips: InstrumentStripChip[] = [];
  const contextLabel = regimeContextLabel(snapshot?.features?.regime);
  if (ctx.regime) {
    chips.push({ id: "regime", label: ctx.regime.charAt(0).toUpperCase() + ctx.regime.slice(1), priority: 1 });
  }
  const adx = ctx.chips.find((c) => c.label === "ADX(14)");
  if (adx) chips.push({ id: "adx", label: `ADX ${adx.value}`, priority: 2 });
  const rsi = ctx.chips.find((c) => c.label === "RSI(14)");
  if (rsi) chips.push({ id: "rsi", label: `RSI ${rsi.value}`, priority: 2 });
  const barMs = new Date(ctx.barTime).getTime();
  const freshnessLabel = Number.isFinite(barMs)
    ? `${ctx.timeframe} context · ${formatAgeShort(now - barMs)} ago`
    : `${ctx.timeframe} context`;
  return {
    symbol,
    available: true,
    state: ctx.state,
    statusLabel: ronPlainStatus(ctx.state),
    contextLabel,
    freshnessLabel,
    message: null,
    chips,
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

/** Loose comparison key so "Market closed" and "market closed." collapse together. */
function segKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns ONLY the segments backed by real source values. Never fabricates.
 *
 * There is exactly ONE open/closed state segment: when the market is closed we never
 * also render a session label (a closed market has no active session), and identical or
 * semantically duplicate segments are collapsed.
 */
export function buildChartContextSegments(input: ChartContextLineInput): string[] {
  const now = input.now ?? Date.now();
  const out: string[] = [input.symbol];
  out.push(`Chart ${input.chartFeed}`);
  if (input.tradingLabel) out.push(input.tradingLabel);

  const closed = input.marketOpen === false;
  if (!closed && input.sessionLabel && segKey(input.sessionLabel) !== "marketclosed") {
    out.push(input.sessionLabel);
  }
  if (input.marketOpen !== null) out.push(input.marketOpen ? "Market open" : "Market closed");

  if (input.quoteTimestamp) {
    const ms = new Date(input.quoteTimestamp as string).getTime();
    if (Number.isFinite(ms)) out.push(`Quote ${formatAgeShort(now - ms)} ago`);
  }
  if (input.ronBarTime) {
    const ms = new Date(input.ronBarTime).getTime();
    if (Number.isFinite(ms)) {
      out.push(`RON ${input.ronTimeframe ?? RON_CONTEXT_TIMEFRAME} last bar ${formatAgeShort(now - ms)} ago`);
    }
  }

  const seen = new Set<string>();
  return out.filter((s) => {
    const k = segKey(s);
    if (k === "" || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
