/**
 * RON Phase 2D.1f-a — XAUUSD venue calendar v2 (FORWARD-ONLY, RESEARCH ONLY).
 *
 * v1 (`ron-venue-calendar.ts`) is FROZEN byte-for-byte because its hash is part of the
 * accepted Research V3 run identity. This module is a NEW version for prospective
 * Research V4 and changes EXACTLY ONE thing:
 *
 *   CROSS-YEAR OBSERVED HOLIDAY FIX — when Jan 1 of year Y+1 falls on a Saturday, the
 *   observed New Year closure is Dec 31 of year Y. v1 built holidays strictly per
 *   calendar year and dropped that observed date, so the Dec 31 full-day closure was
 *   represented as a mere `new_years_eve` early close. v2 represents it in the correct
 *   calendar year, with the full-day rule taking precedence over the eve early close.
 *
 * Everything else (base weekly schedule, closure windows, the 13 holiday rules, DST
 * handling) is identical to v1.
 *
 * CALENDAR AUTHORITY NOTE: CME/COMEX holiday dates are CORROBORATING context only. The
 * broker (Eightcap via MetaApi) source remains the truth for actual XAUUSD quoting hours;
 * no Eightcap closure may be inferred solely from an exchange calendar.
 */
import {
  HOLIDAY_RULES, holidayMap as holidayMapV1, nyClock, xauVenueOpen,
  type ClosureKind, type HolidayRule, type NyClock,
} from "./ron-venue-calendar.ts";

export { HOLIDAY_RULES, nyClock, xauVenueOpen };
export type { ClosureKind, HolidayRule, NyClock };

export const RON_VENUE_CALENDAR_VERSION_V2 = 2;

const CLOSURE_WINDOW: Record<ClosureKind, { from: number; to: number }> = {
  full_day: { from: 0, to: 18 * 60 },
  early_close_1300: { from: 13 * 60, to: 18 * 60 },
};
const FULL_DAY_EVE_CLOSED_FROM = 18 * 60;

export function venueCalendarPayloadV2() {
  return [
    "ron_venue_calendar_version", RON_VENUE_CALENDAR_VERSION_V2,
    "base_schedule", "xauVenueOpen: Sun 17:00 NY open -> Fri 17:00 NY close, daily 17:00-18:00 NY break, IANA DST-aware",
    "closure_windows", (Object.keys(CLOSURE_WINDOW) as ClosureKind[]).sort()
      .map((k) => [k, CLOSURE_WINDOW[k].from, CLOSURE_WINDOW[k].to]),
    "full_day_eve_closed_from_ny_minutes", FULL_DAY_EVE_CLOSED_FROM,
    "holiday_rules", [...HOLIDAY_RULES]
      .sort((a, b) => (a.code < b.code ? -1 : 1))
      .map((h) => [h.code, h.kind, h.rule]),
    "cross_year_observed_holidays", "observed date is placed in the calendar year it actually falls in (e.g. Sat Jan 1 -> Dec 31 of the prior year), full_day precedence over eve early close",
    "exchange_calendar_authority", "corroborating_context_only_broker_source_is_truth",
    "timezone", "America/New_York",
    "grain_minutes", 1,
  ];
}

const dowOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const shift = (y: number, m: number, d: number, days: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
function observed(y: number, m: number, d: number): { y: number; m: number; d: number } {
  const w = dowOf(y, m, d);
  if (w === 6) return shift(y, m, d, -1);
  if (w === 0) return shift(y, m, d, 1);
  return { y, m, d };
}
const keyOf = (y: number, m: number, d: number) => `${y}-${m}-${d}`;

const NEW_YEARS_DAY = HOLIDAY_RULES.find((h) => h.code === "new_years_day") as HolidayRule;

const cacheV2 = new Map<number, Map<string, HolidayRule>>();

/** v1 holidays for the year PLUS any observed holiday of the following year that lands in it. */
export function holidayMapV2(year: number): Map<string, HolidayRule> {
  const hit = cacheV2.get(year);
  if (hit) return hit;
  const out = new Map(holidayMapV1(year));
  const ny = observed(year + 1, 1, 1);
  if (ny.y === year) out.set(keyOf(ny.y, ny.m, ny.d), NEW_YEARS_DAY);   // full_day beats new_years_eve
  cacheV2.set(year, out);
  return out;
}

function baseOpen(c: NyClock): boolean {
  if (c.dow === 6) return false;
  if (c.dow === 5 && c.minutes >= 17 * 60) return false;
  if (c.dow === 0 && c.minutes < 17 * 60) return false;
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return false;
  return true;
}

export function holidayAtV2(c: NyClock): HolidayRule | null {
  const h = holidayMapV2(c.y).get(keyOf(c.y, c.m, c.d));
  if (h) {
    const w = CLOSURE_WINDOW[h.kind];
    if (c.minutes >= w.from && c.minutes < w.to) return h;
  }
  if (c.minutes >= FULL_DAY_EVE_CLOSED_FROM) {
    const n = shift(c.y, c.m, c.d, 1);
    const next = holidayMapV2(n.y).get(keyOf(n.y, n.m, n.d));
    if (next && next.kind === "full_day") return next;
  }
  return null;
}

export function expectedOpenV2(t: number | Date): boolean {
  const c = nyClock(t instanceof Date ? t : new Date(t));
  return baseOpen(c) && holidayAtV2(c) === null;
}

export function expectedClosedReasonV2(t: number | Date): string | null {
  const c = nyClock(t instanceof Date ? t : new Date(t));
  if (!baseOpen(c)) {
    if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return "daily_break_1700_1800_ny";
    return "weekly_closure_fri1700_sun1700_ny";
  }
  const h = holidayAtV2(c);
  return h ? `${h.code}:${h.kind}` : null;
}

const MIN = 60_000;

export function expectedOpenMinutesV2(fromMs: number, toMs: number): number {
  let n = 0;
  for (let t = Math.ceil(fromMs / MIN) * MIN; t < toMs; t += MIN) if (expectedOpenV2(t)) n++;
  return n;
}

export function closedReasonHistogramV2(fromMs: number, toMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let t = Math.ceil(fromMs / MIN) * MIN; t < toMs; t += MIN) {
    const r = expectedClosedReasonV2(t);
    if (r) out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}
