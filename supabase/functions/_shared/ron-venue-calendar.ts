/**
 * RON Phase 2D.1f — RESEARCH-ONLY deterministic XAUUSD venue calendar (v1).
 *
 * Research V2 split coverage epochs on a raw wall-clock ">72h" threshold, which wrongly
 * treated the genuine Easter 2026 closure (~73h02m) as a data defect. V3 replaces the
 * clock heuristic with an EXPECTED-OPEN minute contract: a period is only a coverage
 * defect when the venue was expected to be OPEN and the accepted source has no bar.
 *
 * The base weekly schedule is the ALREADY-ACCEPTED `xauVenueOpen()` from ron-sessions.ts
 * (Sun 17:00 NY -> Fri 17:00 NY, daily 17:00-18:00 NY break, DST-aware). This module adds
 * ONLY the explicit holiday / early-close rules that the accepted schedule lacks. Every
 * rule is written out literally and hashed; nothing is inferred from observed absences.
 *
 * HARD RULES
 *  - Pure deterministic function of a UTC instant. No "now", no DB, no randomness.
 *  - Nothing here is a probability, a signal, a trade level or a product surface.
 *  - Adding a rule REQUIRES a version bump, because the hash feeds run identity.
 */
import { xauVenueOpen } from "./ron-sessions.ts";

/** Re-exported so consumers can assert the accepted base schedule is what V3 uses. */
export { xauVenueOpen };

export const RON_VENUE_CALENDAR_VERSION = 1;

/** Closure shapes, expressed in America/New_York LOCAL wall-clock minutes-from-midnight. */
export type ClosureKind = "full_day" | "early_close_1300";

/** [from,to) NY-local minute window that is EXPECTED-CLOSED on top of the base schedule. */
const CLOSURE_WINDOW: Record<ClosureKind, { from: number; to: number }> = {
  // Trading resumes at 18:00 NY (the base schedule's daily reopen).
  full_day: { from: 0, to: 18 * 60 },
  early_close_1300: { from: 13 * 60, to: 18 * 60 },
};

export interface HolidayRule {
  code: string;
  kind: ClosureKind;
  /** Literal, deterministic date rule in NY local calendar terms. */
  rule: string;
}

/**
 * A `full_day` holiday also suppresses the PRECEDING evening session: the venue closes at
 * 17:00 NY on the eve and does not reopen at 18:00 NY, resuming only at 18:00 NY on the
 * holiday itself. `early_close_1300` days keep their normal preceding evening session.
 */
const FULL_DAY_EVE_CLOSED_FROM = 18 * 60;

/**
 * FROZEN holiday set for the CME/COMEX-linked XAUUSD venue.
 * `early_close_1300` = 13:00 NY halt with the normal 18:00 NY reopen (the standard COMEX
 * US-holiday session). `full_day` = no trading until 18:00 NY.
 */
export const HOLIDAY_RULES: readonly HolidayRule[] = [
  { code: "new_years_day", kind: "full_day", rule: "Jan 1; if Sat -> Dec 31 prior, if Sun -> Jan 2" },
  { code: "mlk_day", kind: "early_close_1300", rule: "3rd Monday of January" },
  { code: "presidents_day", kind: "early_close_1300", rule: "3rd Monday of February" },
  { code: "good_friday", kind: "full_day", rule: "Friday before Gregorian Easter Sunday (anonymous Gregorian computus)" },
  { code: "memorial_day", kind: "early_close_1300", rule: "last Monday of May" },
  { code: "juneteenth", kind: "early_close_1300", rule: "Jun 19; if Sat -> Jun 18, if Sun -> Jun 20" },
  { code: "independence_day", kind: "early_close_1300", rule: "Jul 4; if Sat -> Jul 3, if Sun -> Jul 5" },
  { code: "labor_day", kind: "early_close_1300", rule: "1st Monday of September" },
  { code: "thanksgiving", kind: "early_close_1300", rule: "4th Thursday of November" },
  { code: "thanksgiving_friday", kind: "early_close_1300", rule: "day after the 4th Thursday of November" },
  { code: "christmas_eve", kind: "early_close_1300", rule: "Dec 24" },
  { code: "christmas_day", kind: "full_day", rule: "Dec 25; if Sat -> Dec 24, if Sun -> Dec 26" },
  { code: "new_years_eve", kind: "early_close_1300", rule: "Dec 31" },
];

/** Ordered, hashable payload of the entire calendar contract. */
export function venueCalendarPayload() {
  return [
    "ron_venue_calendar_version", RON_VENUE_CALENDAR_VERSION,
    "base_schedule", "xauVenueOpen: Sun 17:00 NY open -> Fri 17:00 NY close, daily 17:00-18:00 NY break, IANA DST-aware",
    "closure_windows", (Object.keys(CLOSURE_WINDOW) as ClosureKind[]).sort()
      .map((k) => [k, CLOSURE_WINDOW[k].from, CLOSURE_WINDOW[k].to]),
    "full_day_eve_closed_from_ny_minutes", FULL_DAY_EVE_CLOSED_FROM,
    "holiday_rules", [...HOLIDAY_RULES]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((h) => [h.code, h.kind, h.rule]),
    "timezone", "America/New_York",
    "grain_minutes", 1,
  ];
}

/* ------------------------------------------------------------ NY local time */

const NY = "America/New_York";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY, hour12: false,
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", weekday: "short",
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface NyClock { y: number; m: number; d: number; dow: number; minutes: number }

function nyClockSlow(d: Date): NyClock {
  const p = fmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    y: Number(g("year")), m: Number(g("month")), d: Number(g("day")),
    dow: WD[g("weekday")] ?? 0,
    minutes: (Number(g("hour")) % 24) * 60 + Number(g("minute")),
  };
}

/**
 * NY local wall-clock breakdown of a UTC instant.
 *
 * The IANA offset is resolved once per UTC hour and cached, then minute arithmetic is
 * exact. DST transitions land on hour boundaries in America/New_York, so this is
 * identical to formatting every minute — just fast enough to scan a year of minutes.
 */
const offsetCache = new Map<number, number>();
export function nyClock(d: Date): NyClock {
  const t = d.getTime();
  const hourKey = Math.floor(t / 3_600_000);
  let off = offsetCache.get(hourKey);
  if (off === undefined) {
    const base = new Date(hourKey * 3_600_000);
    const c = nyClockSlow(base);
    const utc = Date.UTC(c.y, c.m - 1, c.d, Math.floor(c.minutes / 60), c.minutes % 60);
    off = Math.round((utc - hourKey * 3_600_000) / 60_000);
    if (offsetCache.size > 40_000) offsetCache.clear();
    offsetCache.set(hourKey, off);
  }
  const local = new Date(t + off * 60_000);
  return {
    y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(),
    dow: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/**
 * The ACCEPTED base weekly schedule, expressed on the cached NY clock. Byte-equivalent to
 * `xauVenueOpen()` from ron-sessions.ts (asserted in the 2D.1f test suite).
 */
function baseOpen(c: NyClock): boolean {
  if (c.dow === 6) return false;
  if (c.dow === 5 && c.minutes >= 17 * 60) return false;
  if (c.dow === 0 && c.minutes < 17 * 60) return false;
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return false;
  return true;
}

/** Day-of-week of a NY calendar date (proleptic Gregorian, timezone-free). */
const dowOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** Nth given weekday of a month; n<0 counts back from the end. */
function nthWeekday(y: number, m: number, dow: number, n: number): number {
  if (n > 0) {
    const first = dowOf(y, m, 1);
    return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((dowOf(y, m, last) - dow + 7) % 7);
}

/** Gregorian Easter Sunday (anonymous computus). */
function easterSunday(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m2 + 114) / 31);
  const day = ((h + l - 7 * m2 + 114) % 31) + 1;
  return { m: month, d: day };
}

const shift = (y: number, m: number, d: number, days: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

/** Weekend-observance shift used by the fixed-date rules above. */
function observed(y: number, m: number, d: number, satBack = true): { y: number; m: number; d: number } {
  const w = dowOf(y, m, d);
  if (w === 6) return satBack ? shift(y, m, d, -1) : { y, m, d };
  if (w === 0) return shift(y, m, d, 1);
  return { y, m, d };
}

const keyOf = (y: number, m: number, d: number) => `${y}-${m}-${d}`;
const cache = new Map<number, Map<string, HolidayRule>>();

/** All observed holiday dates for a NY calendar year, keyed `y-m-d`. */
export function holidayMap(year: number): Map<string, HolidayRule> {
  const hit = cache.get(year);
  if (hit) return hit;
  const out = new Map<string, HolidayRule>();
  const byCode = Object.fromEntries(HOLIDAY_RULES.map((h) => [h.code, h])) as Record<string, HolidayRule>;
  const put = (code: string, y: number, m: number, d: number) => {
    if (y === year) out.set(keyOf(y, m, d), byCode[code]);
  };

  put("new_years_day", ...Object.values(observed(year, 1, 1)) as [number, number, number]);
  put("mlk_day", year, 1, nthWeekday(year, 1, 1, 3));
  put("presidents_day", year, 2, nthWeekday(year, 2, 1, 3));
  const e = easterSunday(year);
  const gf = shift(year, e.m, e.d, -2);
  put("good_friday", gf.y, gf.m, gf.d);
  put("memorial_day", year, 5, nthWeekday(year, 5, 1, -1));
  const jt = observed(year, 6, 19);
  put("juneteenth", jt.y, jt.m, jt.d);
  const id = observed(year, 7, 4);
  put("independence_day", id.y, id.m, id.d);
  put("labor_day", year, 9, nthWeekday(year, 9, 1, 1));
  const tg = nthWeekday(year, 11, 4, 4);
  put("thanksgiving", year, 11, tg);
  const tf = shift(year, 11, tg, 1);
  put("thanksgiving_friday", tf.y, tf.m, tf.d);
  put("christmas_eve", year, 12, 24);
  const xm = observed(year, 12, 25);
  put("christmas_day", xm.y, xm.m, xm.d);
  put("new_years_eve", year, 12, 31);

  cache.set(year, out);
  return out;
}

/** The holiday rule in force at a NY local instant, if any. */
export function holidayAt(c: NyClock): HolidayRule | null {
  const h = holidayMap(c.y).get(keyOf(c.y, c.m, c.d));
  if (h) {
    const w = CLOSURE_WINDOW[h.kind];
    if (c.minutes >= w.from && c.minutes < w.to) return h;
  }
  // Eve of a full-day closure: the evening session never reopens.
  if (c.minutes >= FULL_DAY_EVE_CLOSED_FROM) {
    const n = shift(c.y, c.m, c.d, 1);
    const next = holidayMap(n.y).get(keyOf(n.y, n.m, n.d));
    if (next && next.kind === "full_day") return next;
  }
  return null;
}

/**
 * TRUE when the XAUUSD venue is EXPECTED to be quoting at this UTC instant.
 * Base accepted weekly schedule AND no holiday closure window in force.
 */
export function expectedOpen(t: number | Date): boolean {
  const d = t instanceof Date ? t : new Date(t);
  const c = nyClock(d);
  if (!baseOpen(c)) return false;
  return holidayAt(c) === null;
}

/** Why an instant is expected-closed (null when it is expected-open). */
export function expectedClosedReason(t: number | Date): string | null {
  const d = t instanceof Date ? t : new Date(t);
  const c = nyClock(d);
  if (!baseOpen(c)) {
    if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return "daily_break_1700_1800_ny";
    return "weekly_closure_fri1700_sun1700_ny";
  }
  const h = holidayAt(c);
  return h ? `${h.code}:${h.kind}` : null;
}

const MIN = 60_000;

/**
 * Count EXPECTED-OPEN minutes in the half-open UTC interval [fromMs, toMs).
 * Minute-grained and deterministic; both bounds are floored to the minute.
 */
export function expectedOpenMinutes(fromMs: number, toMs: number): number {
  let n = 0;
  const a = Math.ceil(fromMs / MIN) * MIN;
  for (let t = a; t < toMs; t += MIN) if (expectedOpen(t)) n++;
  return n;
}

/** Dominant expected-closed reasons inside an interval, with minute counts. */
export function closedReasonHistogram(fromMs: number, toMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  const a = Math.ceil(fromMs / MIN) * MIN;
  for (let t = a; t < toMs; t += MIN) {
    const r = expectedClosedReason(t);
    if (r) out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}
