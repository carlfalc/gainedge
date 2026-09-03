/**
 * GAINEDGE_INSTRUMENT_REGISTRY_V1 — the single canonical instrument list.
 *
 * Before this module three lists disagreed: the Strategy Lab market list, the RON
 * agentic watch universe, and the landing-page sample tiles. This registry is now the
 * one source every surface consumes.
 *
 * HARD RULES
 *   • This registry is a PRODUCT-SURFACE list. It is NOT an authority for RON's sealed
 *     instrument scope: `admissibleInstrumentScope` in
 *     `supabase/functions/_shared/ron-multi-market-scope-v1.ts` continues to derive
 *     admission solely from the frozen forward-instrument binding. Nothing here widens it.
 *   • `ron_watch` MIRRORS the sealed `RON_SELECTED_WATCH_INSTRUMENTS`; it never defines it.
 *     A contract test asserts the two sets match exactly.
 *   • `backtest_timeframes` lists ONLY timeframes where stored `candle_history` coverage
 *     genuinely clears the Strategy Lab minimum-candle gate. An empty list means the Lab
 *     must not offer that instrument, rather than letting a run start and die on the audit.
 *
 * A mirrored copy lives at `supabase/functions/_shared/instrument-registry.ts` because the
 * Deno edge runtime cannot import from `src/`. A contract test asserts the two agree.
 */

export const INSTRUMENT_REGISTRY_VERSION = 1;

export type InstrumentAssetClass = "metals" | "index" | "fx" | "energy";

/** Mirrors `VenueClass` in `ron-venue-registry-v1.ts`. */
export type InstrumentVenueClass =
  | "metals_cfd_24x5"
  | "fx_cfd_24x5"
  | "index_cfd_24x5"
  | "energy_cfd_24x5"
  | "exchange_cash_hkex";

export interface InstrumentRegistryEntry {
  /** Canonical GAINEDGE symbol. Broker-specific symbols live in `broker_symbol_mappings`. */
  readonly symbol: string;
  readonly display_name: string;
  readonly asset_class: InstrumentAssetClass;
  readonly venue_class: InstrumentVenueClass;
  /** True only for instruments in the sealed RON agentic watch universe. */
  readonly ron_watch: boolean;
  /** True when at least one timeframe has sufficient stored candle coverage. */
  readonly backtestable: boolean;
  /** Timeframes RON observes for this instrument. */
  readonly observation_timeframes: readonly string[];
  /** Timeframes with verified sufficient stored coverage for a Strategy Lab run. */
  readonly backtest_timeframes: readonly string[];
  readonly note: string;
}

const entry = (e: InstrumentRegistryEntry): InstrumentRegistryEntry => Object.freeze(e);

export const INSTRUMENT_REGISTRY: readonly InstrumentRegistryEntry[] = Object.freeze([
  entry({
    symbol: "XAUUSD",
    display_name: "Gold",
    asset_class: "metals",
    venue_class: "metals_cfd_24x5",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["1m", "15m"],
    note: "Deepest stored coverage: 1m and 15m both clear the Lab minimum-candle gate.",
  }),
  entry({
    symbol: "NAS100",
    display_name: "NASDAQ 100",
    asset_class: "index",
    venue_class: "index_cfd_24x5",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["15m"],
    note: "15m only. No other stored timeframe reaches the minimum-candle gate.",
  }),
  entry({
    symbol: "NZDUSD",
    display_name: "NZD/USD",
    asset_class: "fx",
    venue_class: "fx_cfd_24x5",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["15m"],
    note: "15m coverage clears the gate; no 1m/5m/1h/4h history is stored.",
  }),
  entry({
    symbol: "USDCAD",
    display_name: "USD/CAD",
    asset_class: "fx",
    venue_class: "fx_cfd_24x5",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["15m"],
    note: "15m coverage clears the gate; no 1m/5m/1h/4h history is stored.",
  }),
  entry({
    symbol: "HK50",
    display_name: "Hang Seng 50",
    asset_class: "index",
    venue_class: "exchange_cash_hkex",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["15m"],
    note: "Cash-session instrument: 15m only, and the venue calendar gates observation.",
  }),
  entry({
    symbol: "GER40",
    display_name: "DAX 40",
    asset_class: "index",
    venue_class: "index_cfd_24x5",
    ron_watch: true,
    backtestable: true,
    observation_timeframes: ["15m"],
    backtest_timeframes: ["15m"],
    note: "Eightcap GER40 CFD. 15m only.",
  }),
  entry({
    symbol: "USOUSD",
    display_name: "WTI Crude",
    asset_class: "energy",
    venue_class: "energy_cfd_24x5",
    ron_watch: false,
    backtestable: false,
    observation_timeframes: [],
    backtest_timeframes: [],
    note: "Data-only: candles are ingested, but no RON specialist watch and no Lab exposure.",
  }),
  entry({
    symbol: "UKOUSD",
    display_name: "Brent Crude",
    asset_class: "energy",
    venue_class: "energy_cfd_24x5",
    ron_watch: false,
    backtestable: false,
    observation_timeframes: [],
    backtest_timeframes: [],
    note: "Data-only: candles are ingested, but no RON specialist watch and no Lab exposure.",
  }),
]);

export const INSTRUMENT_SYMBOLS: readonly string[] = Object.freeze(
  INSTRUMENT_REGISTRY.map((i) => i.symbol),
);

/** The six instruments RON continuously observes. Mirrors the sealed watch universe. */
export const RON_WATCH_SYMBOLS: readonly string[] = Object.freeze(
  INSTRUMENT_REGISTRY.filter((i) => i.ron_watch).map((i) => i.symbol),
);

/** Instruments the Strategy Lab may offer, in registry order. */
export const BACKTESTABLE_SYMBOLS: readonly string[] = Object.freeze(
  INSTRUMENT_REGISTRY.filter((i) => i.backtestable).map((i) => i.symbol),
);

/** Every broker key `broker_symbol_mappings` is expected to cover. */
export const SUPPORTED_BROKERS: readonly string[] = Object.freeze([
  "eightcap", "icmarkets", "pepperstone", "oanda", "fxcm",
]);

export function getInstrument(symbol: string): InstrumentRegistryEntry | null {
  return INSTRUMENT_REGISTRY.find((i) => i.symbol === symbol) ?? null;
}

export function instrumentDisplayName(symbol: string): string {
  return getInstrument(symbol)?.display_name ?? symbol;
}

/** True only when stored coverage for this exact pair is known to clear the Lab gate. */
export function isBacktestable(symbol: string, timeframe: string): boolean {
  return getInstrument(symbol)?.backtest_timeframes.includes(timeframe) ?? false;
}

/**
 * A truthful, non-promissory note for the Strategy Lab market/timeframe picker.
 * It never claims a run will succeed — the server-side data audit remains authoritative.
 */
export function backtestCoverageNote(symbol: string, timeframe: string): string {
  const item = getInstrument(symbol);
  if (!item) return `${symbol} is not in the instrument registry.`;
  if (!item.backtestable) return `${item.display_name} is data-only and cannot be searched.`;
  if (item.backtest_timeframes.includes(timeframe)) {
    return `${item.display_name} ${timeframe}: stored coverage clears the minimum-candle gate. `
      + "The server-side data audit still has the final say.";
  }
  return `${item.display_name} has no stored ${timeframe} history that clears the minimum-candle gate. `
    + `A run would be refused as INCONCLUSIVE. Available: ${item.backtest_timeframes.join(", ") || "none"}.`;
}
