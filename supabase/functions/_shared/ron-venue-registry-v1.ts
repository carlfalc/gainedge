/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — instrument-aware VENUE REGISTRY V1.
 *
 * Pure, deterministic, side-effect free. It answers exactly one question for one
 * instrument at one instant: is the venue OPEN, CLOSED, or is the calendar simply
 * NOT AUTHORITATIVE enough to say?
 *
 * Hard rules encoded here:
 *   1. No instrument inherits XAUUSD semantics implicitly. Every instrument must be
 *      REGISTERED with an explicit venue class, or it is `unregistered` and RON must
 *      not reason about it.
 *   2. Holidays are never guessed. A venue whose class needs an exchange holiday
 *      calendar, and for which no authoritative calendar exists in this repo, reports
 *      `calendar_unavailable` for any instant that would otherwise be inside a
 *      trading session. Definitive CLOSED windows (weekend, outside the cash session,
 *      lunch break) remain assertable because no holiday can make a venue MORE open.
 *   3. XAUUSD keeps its accepted venue calendar (`ron-venue-calendar-v2.ts`) unchanged.
 *      This module is additive; it mutates no frozen artifact.
 *
 * It never fabricates a bar, never emits a probability, never proposes an order.
 */
import { nyClock, type NyClock } from "./ron-venue-calendar.ts";
import { expectedClosedReasonV2, expectedOpenV2 } from "./ron-venue-calendar-v2.ts";

export const RON_VENUE_REGISTRY_VERSION = 1;

export type VenueClass =
  | "metals_cfd_24x5"
  | "fx_cfd_24x5"
  | "index_cfd_24x5"
  | "energy_cfd_24x5"
  | "exchange_cash_hkex";

export interface LocalSession {
  /** Minutes from local midnight, inclusive. */
  from: number;
  /** Minutes from local midnight, exclusive. */
  to: number;
}

export interface VenueSpec {
  instrument: string;
  venue_class: VenueClass;
  /** IANA zone the venue's own schedule is expressed in. */
  timezone: string;
  /** True only when an AUTHORITATIVE holiday calendar for this venue exists in-repo. */
  holiday_calendar_available: boolean;
  /** Cash sessions in venue-local minutes. Empty for continuous 24x5 venues. */
  sessions: readonly LocalSession[];
  note: string;
}

/**
 * The declared venue registry. Adding an instrument is an explicit, audited change —
 * there is no wildcard and no inference from symbol shape.
 */
export const VENUE_REGISTRY: Readonly<Record<string, VenueSpec>> = Object.freeze({
  XAUUSD: {
    instrument: "XAUUSD",
    venue_class: "metals_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: true,
    sessions: [],
    note: "Accepted XAUUSD venue calendar v2 (Sun 17:00 NY open, Fri 17:00 NY close, 17:00-18:00 daily break, 13 holiday rules).",
  },
  NAS100: {
    instrument: "NAS100",
    venue_class: "index_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: false,
    sessions: [],
    note: "Broker CFD weekly schedule only. No accepted exchange holiday calendar; XAU holiday rules are deliberately NOT applied.",
  },
  NZDUSD: {
    instrument: "NZDUSD",
    venue_class: "fx_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: false,
    sessions: [],
    note: "Spot FX weekly schedule (Sun 17:00 NY -> Fri 17:00 NY).",
  },
  USDCAD: {
    instrument: "USDCAD",
    venue_class: "fx_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: false,
    sessions: [],
    note: "Spot FX weekly schedule (Sun 17:00 NY -> Fri 17:00 NY).",
  },
  HK50: {
    instrument: "HK50",
    venue_class: "exchange_cash_hkex",
    timezone: "Asia/Hong_Kong",
    holiday_calendar_available: false,
    sessions: [
      { from: 9 * 60 + 30, to: 12 * 60 },
      { from: 13 * 60, to: 16 * 60 },
    ],
    note: "HKEX cash sessions 09:30-12:00 and 13:00-16:00 HKT with lunch break. NO authoritative HK public-holiday calendar exists in this repo, so in-session instants report calendar_unavailable rather than asserting openness.",
  },
  USOUSD: {
    instrument: "USOUSD",
    venue_class: "energy_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: false,
    sessions: [],
    note: "WTI CFD weekly schedule only. Data-ready; not part of the RON specialist pilot set.",
  },
  UKOUSD: {
    instrument: "UKOUSD",
    venue_class: "energy_cfd_24x5",
    timezone: "America/New_York",
    holiday_calendar_available: false,
    sessions: [],
    note: "Brent CFD weekly schedule only. Data-ready; not part of the RON specialist pilot set.",
  },
});

/** Instruments RON is authorised to reason about in this phase. Oil is data-only. */
export const RON_PILOT_INSTRUMENTS = ["XAUUSD", "NAS100", "NZDUSD", "USDCAD", "HK50"] as const;
export type PilotInstrument = typeof RON_PILOT_INSTRUMENTS[number];

/** Instruments ingested and health-watched, whether or not RON reasons about them. */
export const RON_DATA_INSTRUMENTS = [
  ...RON_PILOT_INSTRUMENTS, "USOUSD", "UKOUSD",
] as const;

export type VenueState =
  | "open"
  | "closed"
  /** Schedule says "could be open" but no authoritative holiday calendar exists. */
  | "calendar_unavailable"
  | "unregistered";

export interface VenueAssessment {
  instrument: string;
  venue_class: VenueClass | null;
  timezone: string | null;
  state: VenueState;
  /** Machine-stable reason code. Never free prose at call sites. */
  reason: string;
  holiday_calendar_available: boolean;
  registry_version: number;
  evaluated_at: string;
  /** Only populated when it can be derived without guessing holidays. */
  next_expected_open: string | null;
}

const MIN = 60_000;

/** Continuous 24x5 broker window: Sun 17:00 NY open, Fri 17:00 NY close, 17:00-18:00 break. */
function weeklyOpen(c: NyClock): boolean {
  if (c.dow === 6) return false;
  if (c.dow === 5 && c.minutes >= 17 * 60) return false;
  if (c.dow === 0 && c.minutes < 17 * 60) return false;
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return false;
  return true;
}

function weeklyClosedReason(c: NyClock): string {
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return "daily_break_1700_1800_ny";
  return "weekly_closure_fri1700_sun1700_ny";
}

interface LocalClock { dow: number; minutes: number }

/** Venue-local weekday + minutes-from-midnight, DST-aware via IANA data. */
export function localClock(t: number | Date, timezone: string): LocalClock {
  const d = t instanceof Date ? t : new Date(t);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get("hour")) % 24;
  return { dow: dowMap[get("weekday")] ?? 0, minutes: hour * 60 + Number(get("minute")) };
}

function inAnySession(c: LocalClock, sessions: readonly LocalSession[]): boolean {
  return sessions.some((s) => c.minutes >= s.from && c.minutes < s.to);
}

/** Raw "would the published schedule have this venue trading?" — holidays excluded. */
function scheduleOpen(spec: VenueSpec, t: number): boolean {
  if (spec.venue_class === "exchange_cash_hkex") {
    const c = localClock(t, spec.timezone);
    if (c.dow === 0 || c.dow === 6) return false;
    return inAnySession(c, spec.sessions);
  }
  return weeklyOpen(nyClock(new Date(t)));
}

function scheduleClosedReason(spec: VenueSpec, t: number): string {
  if (spec.venue_class === "exchange_cash_hkex") {
    const c = localClock(t, spec.timezone);
    if (c.dow === 0 || c.dow === 6) return "hkex_weekend_closure";
    if (c.minutes >= 12 * 60 && c.minutes < 13 * 60) return "hkex_lunch_break_1200_1300_hkt";
    return "hkex_outside_cash_session_hkt";
  }
  return weeklyClosedReason(nyClock(new Date(t)));
}

/**
 * Next instant the published schedule reopens, scanned forward at 1-minute grain for at
 * most 8 days. Returns null when the venue's calendar is not authoritative enough to
 * promise an opening (exchange-cash venues without a holiday calendar).
 */
export function nextExpectedOpen(instrument: string, from: number | Date): string | null {
  const spec = VENUE_REGISTRY[instrument];
  if (!spec) return null;
  if (!spec.holiday_calendar_available && spec.venue_class === "exchange_cash_hkex") return null;
  const start = (from instanceof Date ? from.getTime() : from);
  const openAt = spec.instrument === "XAUUSD"
    ? (t: number) => expectedOpenV2(t)
    : (t: number) => scheduleOpen(spec, t);
  for (let k = 1; k <= 8 * 24 * 60; k++) {
    const t = Math.ceil(start / MIN) * MIN + k * MIN;
    if (openAt(t)) return new Date(t).toISOString();
  }
  return null;
}

/** Deny-by-default venue assessment. Never asserts openness it cannot justify. */
export function assessVenue(instrument: string, at: number | Date): VenueAssessment {
  const t = at instanceof Date ? at.getTime() : at;
  const evaluated_at = new Date(t).toISOString();
  const spec = VENUE_REGISTRY[instrument];

  if (!spec) {
    return {
      instrument, venue_class: null, timezone: null, state: "unregistered",
      reason: "instrument_not_in_venue_registry", holiday_calendar_available: false,
      registry_version: RON_VENUE_REGISTRY_VERSION, evaluated_at, next_expected_open: null,
    };
  }

  const base = {
    instrument, venue_class: spec.venue_class, timezone: spec.timezone,
    holiday_calendar_available: spec.holiday_calendar_available,
    registry_version: RON_VENUE_REGISTRY_VERSION, evaluated_at,
  };

  // XAUUSD: accepted holiday-aware calendar. Authoritative in both directions.
  if (spec.instrument === "XAUUSD") {
    const open = expectedOpenV2(t);
    return {
      ...base,
      state: open ? "open" : "closed",
      reason: open ? "venue_calendar_v2_open" : (expectedClosedReasonV2(t) ?? "venue_calendar_v2_closed"),
      next_expected_open: open ? null : nextExpectedOpen(instrument, t),
    };
  }

  // Everything else: a definitive schedule CLOSURE is assertable without holidays.
  if (!scheduleOpen(spec, t)) {
    return {
      ...base, state: "closed", reason: scheduleClosedReason(spec, t),
      next_expected_open: nextExpectedOpen(instrument, t),
    };
  }

  // In-schedule. Exchange-cash venues need a holiday calendar before openness is claimed.
  if (spec.venue_class === "exchange_cash_hkex" && !spec.holiday_calendar_available) {
    return {
      ...base, state: "calendar_unavailable",
      reason: "hkex_holiday_calendar_unavailable",
      next_expected_open: null,
    };
  }

  return {
    ...base, state: "open",
    reason: spec.venue_class === "exchange_cash_hkex"
      ? "hkex_cash_session_open"
      : "broker_weekly_schedule_open",
    next_expected_open: null,
  };
}

/**
 * May RON run specialist reasoning for this instrument at this instant?
 * Deny-by-default: only a venue whose state is provably `open` or provably `closed`
 * carries enough calendar truth. `calendar_unavailable` and `unregistered` block.
 */
export function venueReasoningAllowed(a: VenueAssessment): boolean {
  return a.state === "open" || a.state === "closed";
}

export function venueRegistryPayload() {
  return [
    "ron_venue_registry_version", RON_VENUE_REGISTRY_VERSION,
    "pilot_instruments", [...RON_PILOT_INSTRUMENTS],
    "data_instruments", [...RON_DATA_INSTRUMENTS],
    "deny_by_default", true,
    "holidays_never_inferred", true,
    "venues", Object.keys(VENUE_REGISTRY).sort().map((k) => {
      const v = VENUE_REGISTRY[k];
      return [
        v.instrument, v.venue_class, v.timezone, v.holiday_calendar_available,
        v.sessions.map((s) => [s.from, s.to]),
      ];
    }),
  ];
}
