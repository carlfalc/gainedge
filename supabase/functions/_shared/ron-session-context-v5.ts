/**
 * GAINEDGE_RON_SESSION_CONTEXT_V5
 *
 * Forward-only extension of Session V4. Adds GER40 European-index context and makes the
 * all-session watch rule explicit: session classification describes a completed bar but
 * NEVER gates RON evaluation. If the venue is open and a genuine eligible completed bar
 * exists, the bar is eligible for agentic observation irrespective of session label.
 */
import { localClock } from "./ron-venue-registry-v1.ts";
import {
  assessVenueV3,
  VENUE_REGISTRY_V3,
} from "./ron-venue-registry-v3.ts";
import type { NativeCompletedBarProof } from "./ron-venue-registry-v2.ts";
import type { VenueAssessment } from "./ron-venue-registry-v1.ts";

export const RON_SESSION_CONTEXT_VERSION_V5 = 5;

export type RonSessionFamilyV5 = "metals" | "fx" | "us_index" | "hk_index" | "eu_index";
export type RonSessionLabelV5 =
  | "asia"
  | "london"
  | "new_york"
  | "london_new_york_overlap"
  | "global_transition"
  | "us_pre_cash"
  | "us_cash_opening"
  | "us_cash_mid"
  | "us_cash_closing"
  | "us_after_cash"
  | "hkex_morning"
  | "hkex_lunch_break"
  | "hkex_afternoon"
  | "hkex_outside_cash"
  | "europe_pre_cash"
  | "europe_cash_opening"
  | "europe_cash_mid"
  | "europe_cash_closing"
  | "europe_after_cash"
  | "market_closed"
  | "calendar_unavailable";

export interface RonSessionContextV5 {
  version: 5;
  instrument: string;
  evaluation_anchor: string;
  venue: VenueAssessment;
  session_family: RonSessionFamilyV5;
  session_label: RonSessionLabelV5;
  local_timezone: string;
  local_weekday: number;
  local_minutes: number;
  local_day_name: string;
  local_time_bucket: string;
  active_trading_session: boolean;
  /** Always false. Session labels never suppress an otherwise eligible completed bar. */
  session_gates_agentic_watch: false;
  cohort_dimensions: {
    weekday: string;
    session: RonSessionLabelV5;
    local_time_bucket: string;
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const bucketMinute = Math.floor((minutes % 60) / 15) * 15;
  return `${h}:${bucketMinute.toString().padStart(2, "0")}`;
}

function familyFor(instrument: string): RonSessionFamilyV5 {
  if (instrument === "NAS100") return "us_index";
  if (instrument === "HK50") return "hk_index";
  if (instrument === "GER40") return "eu_index";
  if (instrument === "NZDUSD" || instrument === "USDCAD") return "fx";
  return "metals";
}

function inside(minutes: number, fromHour: number, toHour: number): boolean {
  return minutes >= fromHour * 60 && minutes < toHour * 60;
}

function globalSessionLabel(anchorMs: number): RonSessionLabelV5 {
  const london = localClock(anchorMs, "Europe/London");
  const newYork = localClock(anchorMs, "America/New_York");
  const tokyo = localClock(anchorMs, "Asia/Tokyo");
  const londonActive = inside(london.minutes, 8, 17);
  const newYorkActive = inside(newYork.minutes, 8, 17);
  const asiaActive = inside(tokyo.minutes, 9, 18);
  if (londonActive && newYorkActive) return "london_new_york_overlap";
  if (londonActive) return "london";
  if (newYorkActive) return "new_york";
  if (asiaActive) return "asia";
  return "global_transition";
}

function nas100Label(m: number): RonSessionLabelV5 {
  if (m < 9 * 60 + 30) return "us_pre_cash";
  if (m < 10 * 60 + 30) return "us_cash_opening";
  if (m < 15 * 60) return "us_cash_mid";
  if (m < 16 * 60) return "us_cash_closing";
  return "us_after_cash";
}

function hk50Label(m: number): RonSessionLabelV5 {
  if (m >= 9 * 60 + 30 && m < 12 * 60) return "hkex_morning";
  if (m >= 12 * 60 && m < 13 * 60) return "hkex_lunch_break";
  if (m >= 13 * 60 && m < 16 * 60) return "hkex_afternoon";
  return "hkex_outside_cash";
}

/** Xetra cash hours are context only; GER40 CFD monitoring is not limited to them. */
function ger40Label(m: number): RonSessionLabelV5 {
  if (m < 9 * 60) return "europe_pre_cash";
  if (m < 10 * 60) return "europe_cash_opening";
  if (m < 16 * 60 + 30) return "europe_cash_mid";
  if (m < 17 * 60 + 30) return "europe_cash_closing";
  return "europe_after_cash";
}

export function buildRonSessionContextV5(args: {
  instrument: string;
  evaluation_anchor: string | number | Date;
  native_completed_bar?: NativeCompletedBarProof | null;
}): RonSessionContextV5 {
  const anchorMs = args.evaluation_anchor instanceof Date
    ? args.evaluation_anchor.getTime()
    : typeof args.evaluation_anchor === "number"
      ? args.evaluation_anchor
      : Date.parse(args.evaluation_anchor);
  if (!Number.isFinite(anchorMs)) throw new Error("invalid_evaluation_anchor");

  const spec = VENUE_REGISTRY_V3[args.instrument];
  if (!spec) throw new Error(`unregistered_instrument:${args.instrument}`);

  const venue = assessVenueV3(args.instrument, anchorMs, args.native_completed_bar ?? null);
  const clock = localClock(anchorMs, spec.timezone);
  const family = familyFor(args.instrument);

  let session: RonSessionLabelV5;
  if (venue.state === "calendar_unavailable") session = "calendar_unavailable";
  else if (venue.state === "closed") {
    session = family === "hk_index" && clock.minutes >= 12 * 60 && clock.minutes < 13 * 60
      ? "hkex_lunch_break"
      : "market_closed";
  } else if (family === "us_index") session = nas100Label(clock.minutes);
  else if (family === "hk_index") session = hk50Label(clock.minutes);
  else if (family === "eu_index") session = ger40Label(clock.minutes);
  else session = globalSessionLabel(anchorMs);

  const localDay = DAY_NAMES[clock.dow] ?? "Unknown";
  const timeBucket = hhmm(clock.minutes);
  return {
    version: RON_SESSION_CONTEXT_VERSION_V5,
    instrument: args.instrument,
    evaluation_anchor: new Date(anchorMs).toISOString(),
    venue,
    session_family: family,
    session_label: session,
    local_timezone: spec.timezone,
    local_weekday: clock.dow,
    local_minutes: clock.minutes,
    local_day_name: localDay,
    local_time_bucket: timeBucket,
    active_trading_session: venue.state === "open",
    session_gates_agentic_watch: false,
    cohort_dimensions: { weekday: localDay, session, local_time_bucket: timeBucket },
  };
}

export function sessionContextV5Payload() {
  return [
    "ron_session_context_version", RON_SESSION_CONTEXT_VERSION_V5,
    "venue_registry_version", 3,
    "ger40_supported", true,
    "all_open_sessions_watched", true,
    "session_labels_are_context_only", true,
    "session_gate", false,
    "cohort_dimensions", ["weekday", "session", "local_time_bucket"],
    "trade_instruction", false,
  ];
}
