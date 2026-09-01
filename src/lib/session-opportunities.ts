/**
 * GAINEDGE_DASHBOARD_UI — deterministic session board (Sydney / Asian / London / New York)
 * plus an observed "best opportunities this session" summary.
 *
 * Governance:
 * - Venue open/closed is a pure function of the instant, resolved through IANA zones.
 * - "Best opportunities" is strictly a ranking of ALREADY-STORED watch context for the
 *   tracked markets. Nothing is predicted and no probability is stated.
 */
import type { PulseSnapshot } from "@/lib/dashboard-pulse";

export type VenueKey = "sydney" | "tokyo" | "london" | "newyork";

export interface VenueWindow {
  key: VenueKey;
  label: string;
  zone: string;
  /** local minutes from midnight */
  open: number;
  close: number;
}

export const VENUE_WINDOWS: VenueWindow[] = [
  { key: "sydney", label: "Sydney", zone: "Australia/Sydney", open: 10 * 60, close: 16 * 60 },
  { key: "tokyo", label: "Asian", zone: "Asia/Tokyo", open: 9 * 60, close: 15 * 60 },
  { key: "london", label: "London", zone: "Europe/London", open: 8 * 60, close: 16 * 60 + 30 },
  { key: "newyork", label: "New York", zone: "America/New_York", open: 8 * 60, close: 17 * 60 },
];

function localClock(d: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const floor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  const offset = Math.round((asUtc - floor) / 60_000);
  const local = new Date(d.getTime() + offset * 60_000);
  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export interface VenueStatus {
  key: VenueKey;
  label: string;
  open: boolean;
  /** minutes since this venue opened, when open */
  minutesIn: number | null;
}

export function venueStatuses(now: Date = new Date()): VenueStatus[] {
  return VENUE_WINDOWS.map((w) => {
    const { day, minutes } = localClock(now, w.zone);
    const weekend = day === 0 || day === 6;
    const open = !weekend && minutes >= w.open && minutes < w.close;
    return { key: w.key, label: w.label, open, minutesIn: open ? minutes - w.open : null };
  });
}

export function venueBoardLine(statuses: VenueStatus[]): string {
  return statuses.map((s) => `${s.label} ${s.open ? "open" : "closed"}`).join(" · ");
}

const STATE_RANK: Record<string, number> = { "SETUP FORMING": 3, WATCH: 2, WAIT: 1 };

export interface SessionOpportunity {
  symbol: string;
  timeframe: string;
  state: string;
  bias: string | null;
  bar_time: string;
}

/** Stored watch context observed on bars that fall inside the currently open venues. */
export function bestOpportunitiesThisSession(
  snapshots: PulseSnapshot[],
  now: Date = new Date(),
  max = 3,
): SessionOpportunity[] {
  const open = venueStatuses(now).filter((s) => s.open);
  const earliestOpenMs = open.length
    ? Math.min(...open.map((s) => now.getTime() - (s.minutesIn ?? 0) * 60_000))
    : now.getTime() - 8 * 3_600_000; // closed venues: fall back to the last 8h of stored records

  return snapshots
    .filter((s) => s.state && (STATE_RANK[s.state] ?? 0) >= 2)
    .filter((s) => new Date(s.bar_time).getTime() >= earliestOpenMs)
    .sort((a, b) => {
      const r = (STATE_RANK[b.state ?? ""] ?? 0) - (STATE_RANK[a.state ?? ""] ?? 0);
      if (r !== 0) return r;
      return new Date(b.bar_time).getTime() - new Date(a.bar_time).getTime();
    })
    .slice(0, max)
    .map((s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      state: s.state as string,
      bias: s.bias ?? null,
      bar_time: s.bar_time,
    }));
}

export function sessionOpportunityLines(
  opportunities: SessionOpportunity[],
  anyVenueOpen: boolean,
): string[] {
  if (opportunities.length === 0) {
    return [
      anyVenueOpen
        ? "Best opportunities so far this session: none. No tracked market has reached watch context on a completed bar since the open."
        : "No venue is currently open. No qualifying watch context in the most recent stored records.",
    ];
  }
  return [
    "Best opportunities so far this session (stored, completed bars only):",
    ...opportunities.map(
      (o) => `${o.symbol} ${o.timeframe} · ${o.state}${o.bias ? ` ${o.bias}` : ""}`,
    ),
  ];
}
