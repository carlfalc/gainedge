/**
 * RON canonical all-session classifier.
 *
 * Deterministic and reproducible: a PURE function of the bar's UTC instant.
 * Nothing here reads "now", random state, or database state, so it never needs to be
 * persisted in the feature JSON to stay auditable — any consumer (worker, labeller,
 * dashboard, future research notebook) recomputes exactly the same answer from bar_time.
 *
 * WHY feature_version STAYS AT 2
 * ------------------------------
 * The stored v2 feature semantics are unchanged by this module: no existing field is
 * recomputed, redefined or removed, and the Asian range feature (asian_high/asian_low,
 * 22:00-06:00 UTC) is preserved byte-for-byte. Session context is a pure derivation of
 * `bar_time`, which is already part of the snapshot's primary key, so storing it would
 * duplicate information without adding any auditability. Bumping the version would force
 * a full re-backfill for zero information gain, so v2 is retained deliberately.
 *
 * DST: London and New York sessions are resolved through IANA timezones, so the UTC
 * windows shift correctly across BST/GMT and EDT/EST. Tokyo has no DST.
 */

export type RonSessionKey =
  | "asia"
  | "asia_london_overlap"
  | "london"
  | "london_newyork_overlap"
  | "newyork"
  | "off_session"
  | "market_closed";

export interface RonSessionContext {
  /** Primary session bucket for the bar. */
  session: RonSessionKey;
  /** Human label for the dashboard. */
  label: string;
  /** Every venue open at that instant, in order. */
  active: ("asia" | "london" | "newyork")[];
  /** True when two venues are open simultaneously. */
  overlap: boolean;
  /** Minutes since the primary venue opened (null when none is open). */
  minutes_into_session: number | null;
  /** Deterministic Asian-range window flag, 22:00-06:00 UTC — unchanged from v2. */
  in_asian_range_window: boolean;
  /** XAUUSD venue state derived from the Sun 17:00 NY -> Fri 17:00 NY schedule. */
  market_open: boolean;
}

/** UTC offset in hours of an IANA zone at an instant. */
function zoneOffsetHours(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const floor = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(),
  );
  return Math.round((asUtc - floor) / 60_000) / 60;
}

/** Local wall-clock {day, minutes-since-midnight} of an instant in a zone. */
function localClock(d: Date, timeZone: string): { day: number; minutes: number } {
  const off = zoneOffsetHours(d, timeZone);
  const local = new Date(d.getTime() + off * 3_600_000);
  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** XAUUSD venue schedule: Sun 17:00 NY -> Fri 17:00 NY with the 17:00-18:00 NY break. */
export function xauVenueOpen(d: Date): boolean {
  const { day, minutes } = localClock(d, "America/New_York");
  if (day === 6) return false;
  if (day === 5 && minutes >= 17 * 60) return false;
  if (day === 0 && minutes < 17 * 60) return false;
  if (minutes >= 17 * 60 && minutes < 18 * 60) return false;
  return true;
}

// Cash-session windows in LOCAL venue time (minutes from local midnight).
const WINDOWS = {
  asia:    { zone: "Asia/Tokyo",        open: 9 * 60,  close: 15 * 60 },
  london:  { zone: "Europe/London",     open: 8 * 60,  close: 16 * 60 + 30 },
  newyork: { zone: "America/New_York",  open: 8 * 60,  close: 17 * 60 },
} as const;

const LABELS: Record<RonSessionKey, string> = {
  asia: "Asian session",
  asia_london_overlap: "Asia / London transition",
  london: "London session",
  london_newyork_overlap: "London / New York overlap",
  newyork: "New York session",
  off_session: "Off-session (between cash sessions)",
  market_closed: "Market closed",
};

/**
 * Classify a bar instant into the canonical RON session context.
 * `t` is the bar's OPEN time (the snapshot's bar_time), matching how RON keys snapshots.
 */
export function classifyRonSession(t: number | string | Date): RonSessionContext {
  const d = t instanceof Date ? t : new Date(t);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const inAsianRange = d.getUTCHours() >= 22 || d.getUTCHours() < 6;
  const marketOpen = xauVenueOpen(d);

  const active: ("asia" | "london" | "newyork")[] = [];
  const since: Record<string, number> = {};
  for (const key of ["asia", "london", "newyork"] as const) {
    const w = WINDOWS[key];
    const { day, minutes } = localClock(d, w.zone);
    if (day === 0 || day === 6) continue;            // no cash session at the weekend
    if (minutes >= w.open && minutes < w.close) {
      active.push(key);
      since[key] = minutes - w.open;
    }
  }

  let session: RonSessionKey;
  if (!marketOpen) session = "market_closed";
  else if (active.length === 0) session = "off_session";
  else if (active.includes("london") && active.includes("newyork")) session = "london_newyork_overlap";
  else if (active.includes("asia") && active.includes("london")) session = "asia_london_overlap";
  else session = active[active.length - 1];

  // Primary venue for "minutes into session": the most recently opened active venue.
  let primary: string | null = null;
  for (const k of active) if (primary === null || since[k] < since[primary]) primary = k;

  void utcMinutes;
  return {
    session,
    label: LABELS[session],
    active,
    overlap: active.length > 1,
    minutes_into_session: primary ? since[primary] : null,
    in_asian_range_window: inAsianRange,
    market_open: marketOpen,
  };
}
