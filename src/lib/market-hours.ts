/**
 * Deterministic XAUUSD (spot gold) market schedule.
 *
 * Broker convention (Eightcap / MT5): the trading week runs from Sunday 17:00
 * New York time to Friday 17:00 New York time, with a one-hour daily break at
 * 17:00 New York (the same 17:00 NY boundary the Falconer daily session uses).
 * All boundaries are DST-aware because 17:00 NY is 21:00 UTC in EDT and
 * 22:00 UTC in EST.
 *
 * This module is presentation/health only. It contains no trading logic and is
 * never used to place or size an order.
 */

/** UTC offset of America/New_York for a given instant: -4 (EDT) or -5 (EST). */
export function nyUtcOffsetHours(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const nyAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24);
  const utcHourFloor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  return Math.round((nyAsUtc - utcHourFloor) / 3_600_000);
}

export interface MarketStatus {
  open: boolean;
  /** Machine-readable reason a closed market is closed. */
  reason: "open" | "weekend" | "daily_break";
  label: string;
}

/** Deterministic XAUUSD market status for an instant (defaults to now). */
export function xauMarketStatus(now: Date = new Date()): MarketStatus {
  const off = nyUtcOffsetHours(now); // -4 or -5
  // Convert to New York wall clock.
  const ny = new Date(now.getTime() + off * 3_600_000);
  const day = ny.getUTCDay();          // NY weekday
  const hour = ny.getUTCHours();       // NY hour
  const min = ny.getUTCMinutes();

  // Weekend: Fri 17:00 NY -> Sun 17:00 NY
  if (day === 6) return { open: false, reason: "weekend", label: "MARKET CLOSED (weekend)" };
  if (day === 5 && hour >= 17) return { open: false, reason: "weekend", label: "MARKET CLOSED (weekend)" };
  if (day === 0 && hour < 17) return { open: false, reason: "weekend", label: "MARKET CLOSED (weekend)" };

  // Daily break: 17:00–18:00 NY on trading days
  if (hour === 17) return { open: false, reason: "daily_break", label: "MARKET CLOSED (daily break)" };

  void min;
  return { open: true, reason: "open", label: "MARKET OPEN" };
}

export type DataHealthLabel =
  | "LIVE"
  | "MARKET CLOSED"
  | "STALE / FEED BEHIND"
  | "DATA BUILDING";

export interface DataHealthVerdict {
  label: DataHealthLabel;
  detail: string;
  /** true when the market should be open but data is behind — an ingestion gap. */
  ingestionGap: boolean;
}

/**
 * Distinguish an expected market closure from a broken feed.
 * `barTime` is the timestamp of the latest COMPLETED bar; `barMinutes` the timeframe.
 */
export function assessDataHealth(
  barTime: string | Date | null | undefined,
  barMinutes = 15,
  now: Date = new Date(),
): DataHealthVerdict {
  if (!barTime) {
    return { label: "DATA BUILDING", detail: "No snapshot computed yet", ingestionGap: false };
  }
  const ageMin = (now.getTime() - new Date(barTime).getTime()) / 60000;
  // One bar of latency plus a small tolerance is normal.
  const tolerance = barMinutes * 2 + 5;
  const status = xauMarketStatus(now);
  if (ageMin <= tolerance) {
    return { label: "LIVE", detail: `Last completed bar ${Math.round(ageMin)}m ago`, ingestionGap: false };
  }
  if (!status.open) {
    return { label: "MARKET CLOSED", detail: status.label, ingestionGap: false };
  }
  return {
    label: "STALE / FEED BEHIND",
    detail: `Market open but last completed bar is ${Math.round(ageMin)}m old — upstream ingestion gap`,
    ingestionGap: true,
  };
}
