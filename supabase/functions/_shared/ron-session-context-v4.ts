/**
 * GAINEDGE_RON_SESSION_CONTEXT_V4
 *
 * Forward-only, instrument-aware session semantics for the multi-market RON runtime.
 * The historical Session V1-V3 XAUUSD contracts remain untouched and replayable.
 *
 * Venue availability truth and descriptive session context are separate. Session labels
 * are evidence/research dimensions, never BUY/SELL instructions or probabilities.
 */
import { localClock, VENUE_REGISTRY, type VenueAssessment } from "./ron-venue-registry-v1.ts";
import { assessVenueV2, type NativeCompletedBarProof } from "./ron-venue-registry-v2.ts";

export const RON_SESSION_CONTEXT_VERSION_V4 = 4;

export type RonSessionFamily = "metals" | "fx" | "us_index" | "hk_index";
export type RonSessionLabel =
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
  | "market_closed"
  | "calendar_unavailable";

export interface RonSessionContextV4 {
  version: 4;
  instrument: string;
  evaluation_anchor: string;
  venue: VenueAssessment;
  session_family: RonSessionFamily;
  session_label: RonSessionLabel;
  local_timezone: string;
  local_weekday: number;
  local_minutes: number;
  local_day_name: string;
  /** Stable 15-minute bucket in the instrument's venue-local timezone. */
  local_time_bucket: string;
  active_trading_session: boolean;
  cohort_dimensions: {
    weekday: string;
    session: RonSessionLabel;
    local_time_bucket: string;
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minuteWithinHour = minutes % 60;
  const bucketMinute = Math.floor(minuteWithinHour / 15) * 15;
  const m = bucketMinute.toString().padStart(2, "0");
  return `${h}:${m}`;
}

function familyFor(instrument: string): RonSessionFamily {
  if (instrument === "NAS100") return "us_index";
  if (instrument === "HK50") return "hk_index";
  if (instrument === "NZDUSD" || instrument === "USDCAD") return "fx";
  return "metals";
}

function inside(minutes: number, fromHour: number, toHour: number): boolean {
  return minutes >= fromHour * 60 && minutes < toHour * 60;
}

/**
 * DST-aware global market-session taxonomy. The clocks are evaluated in their native
 * IANA timezones instead of assuming fixed UTC offsets. These are descriptive liquidity
 * windows; venue availability still comes exclusively from the venue assessment.
 */
function globalSessionLabel(anchorMs: number): RonSessionLabel {
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

function nas100Label(localMinutes: number): RonSessionLabel {
  if (localMinutes < 9 * 60 + 30) return "us_pre_cash";
  if (localMinutes < 10 * 60 + 30) return "us_cash_opening";
  if (localMinutes < 15 * 60) return "us_cash_mid";
  if (localMinutes < 16 * 60) return "us_cash_closing";
  return "us_after_cash";
}

function hk50Label(localMinutes: number): RonSessionLabel {
  if (localMinutes >= 9 * 60 + 30 && localMinutes < 12 * 60) return "hkex_morning";
  if (localMinutes >= 12 * 60 && localMinutes < 13 * 60) return "hkex_lunch_break";
  if (localMinutes >= 13 * 60 && localMinutes < 16 * 60) return "hkex_afternoon";
  return "hkex_outside_cash";
}

export function buildRonSessionContextV4(args: {
  instrument: string;
  evaluation_anchor: string | number | Date;
  native_completed_bar?: NativeCompletedBarProof | null;
}): RonSessionContextV4 {
  const anchorMs = args.evaluation_anchor instanceof Date
    ? args.evaluation_anchor.getTime()
    : typeof args.evaluation_anchor === "number"
      ? args.evaluation_anchor
      : Date.parse(args.evaluation_anchor);
  if (!Number.isFinite(anchorMs)) throw new Error("invalid_evaluation_anchor");

  const spec = VENUE_REGISTRY[args.instrument];
  if (!spec) throw new Error(`unregistered_instrument:${args.instrument}`);

  const venue = assessVenueV2(args.instrument, anchorMs, args.native_completed_bar ?? null);
  const clock = localClock(anchorMs, spec.timezone);
  const family = familyFor(args.instrument);

  let session: RonSessionLabel;
  if (venue.state === "calendar_unavailable") session = "calendar_unavailable";
  else if (venue.state === "closed") {
    session = family === "hk_index" && clock.minutes >= 12 * 60 && clock.minutes < 13 * 60
      ? "hkex_lunch_break"
      : "market_closed";
  } else if (family === "us_index") session = nas100Label(clock.minutes);
  else if (family === "hk_index") session = hk50Label(clock.minutes);
  else session = globalSessionLabel(anchorMs);

  const localDay = DAY_NAMES[clock.dow] ?? "Unknown";
  const timeBucket = hhmm(clock.minutes);
  return {
    version: RON_SESSION_CONTEXT_VERSION_V4,
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
    cohort_dimensions: { weekday: localDay, session, local_time_bucket: timeBucket },
  };
}

export function sessionContextV4Payload() {
  return [
    "ron_session_context_version", RON_SESSION_CONTEXT_VERSION_V4,
    "venue_registry_version", 2,
    "instrument_aware", true,
    "dst_aware_global_sessions", true,
    "xau_v1_v3_unchanged", true,
    "cohort_dimensions", ["weekday", "session", "local_time_bucket"],
    "trade_instruction", false,
  ];
}
