/**
 * GAINEDGE_RON_AGENTIC_WATCH_V1 — venue registry V3.
 *
 * Forward-only extension of V2. V1/V2 remain replayable and untouched.
 * Adds GER40 as an explicit Eightcap/MetaApi CFD subject. The broker alias table already
 * resolves GER40 through GER40/DAX40/DE40/GER40.i; this module supplies only venue truth.
 *
 * GER40 is treated as a broker index CFD for availability, not as a cash-only Xetra
 * instrument. RON may observe every genuine completed broker bar across Eightcap's
 * published GER40 session. European cash-session labels remain descriptive context only
 * and never gate the agentic watch.
 *
 * Eightcap publishes GER40 as 03:15–23:00 broker time (GMT+3 during US daylight time,
 * GMT+2 during US standard time). Expressing the session in America/New_York keeps those
 * DST shifts aligned: 20:15 previous day through 16:00 New York, Monday–Friday.
 * Source: https://www.eightcap.com/en-au/traders/trade/ger40/
 */
import {
  localClock,
  VENUE_REGISTRY,
  type VenueAssessment,
  type VenueSpec,
} from "./ron-venue-registry-v1.ts";
import {
  assessVenueV2,
  type NativeCompletedBarProof,
} from "./ron-venue-registry-v2.ts";

export const RON_VENUE_REGISTRY_VERSION_V3 = 3;

export const GER40_VENUE_SPEC: VenueSpec = Object.freeze({
  instrument: "GER40",
  venue_class: "index_cfd_24x5",
  timezone: "Europe/Berlin",
  holiday_calendar_available: false,
  sessions: [],
  note: "Eightcap/MetaApi GER40 CFD. Eightcap's published 03:15–23:00 broker session is used for availability; European cash hours are descriptive context only and never an agentic-watch gate.",
});

export const VENUE_REGISTRY_V3: Readonly<Record<string, VenueSpec>> = Object.freeze({
  ...VENUE_REGISTRY,
  GER40: GER40_VENUE_SPEC,
});

const MIN = 60_000;
const GER40_OPEN_NY = 20 * 60 + 15;
const GER40_CLOSE_NY = 16 * 60;

/**
 * Eightcap GER40 session in New York local time.
 * Sunday 20:15 opens Monday's broker session; Friday 16:00 begins the weekend closure.
 */
function eightcapGer40Open(t: number): boolean {
  const c = localClock(t, "America/New_York");
  if (c.dow === 6) return false;
  if (c.dow === 0) return c.minutes >= GER40_OPEN_NY;
  if (c.dow === 5) return c.minutes < GER40_CLOSE_NY;
  return c.minutes < GER40_CLOSE_NY || c.minutes >= GER40_OPEN_NY;
}

function brokerClosedReason(t: number): string {
  const c = localClock(t, "America/New_York");
  if (c.dow === 5 && c.minutes >= GER40_CLOSE_NY) return "eightcap_ger40_weekend_close";
  if (c.dow === 6) return "eightcap_ger40_weekend_close";
  if (c.dow === 0 && c.minutes < GER40_OPEN_NY) return "eightcap_ger40_weekend_close";
  return "eightcap_ger40_daily_close_1600_2015_ny";
}

function nextBrokerOpen(from: number): string | null {
  const start = Math.ceil(from / MIN) * MIN;
  for (let k = 1; k <= 8 * 24 * 60; k++) {
    const t = start + k * MIN;
    if (eightcapGer40Open(t)) return new Date(t).toISOString();
  }
  return null;
}

/**
 * V3 venue assessment. Existing subjects inherit V2 exactly. GER40 is explicit and
 * deny-by-default by symbol, with no inference from DAX/DE naming.
 */
export function assessVenueV3(
  instrument: string,
  evaluationAnchor: string | number | Date,
  nativeProof?: NativeCompletedBarProof | null,
): VenueAssessment {
  if (instrument !== "GER40") {
    const base = assessVenueV2(instrument, evaluationAnchor, nativeProof);
    return { ...base, registry_version: RON_VENUE_REGISTRY_VERSION_V3 };
  }

  const t = evaluationAnchor instanceof Date
    ? evaluationAnchor.getTime()
    : typeof evaluationAnchor === "number"
      ? evaluationAnchor
      : Date.parse(evaluationAnchor);
  if (!Number.isFinite(t)) {
    return {
      instrument,
      venue_class: GER40_VENUE_SPEC.venue_class,
      timezone: GER40_VENUE_SPEC.timezone,
      state: "unregistered",
      reason: "invalid_evaluation_anchor",
      holiday_calendar_available: false,
      registry_version: RON_VENUE_REGISTRY_VERSION_V3,
      evaluated_at: "Invalid Date",
      next_expected_open: null,
    };
  }

  const open = eightcapGer40Open(t);
  return {
    instrument,
    venue_class: GER40_VENUE_SPEC.venue_class,
    timezone: GER40_VENUE_SPEC.timezone,
    state: open ? "open" : "closed",
    reason: open ? "eightcap_ger40_published_session_open" : brokerClosedReason(t),
    holiday_calendar_available: false,
    registry_version: RON_VENUE_REGISTRY_VERSION_V3,
    evaluated_at: new Date(t).toISOString(),
    next_expected_open: open ? null : nextBrokerOpen(t),
  };
}

export function venueReasoningAllowedV3(a: VenueAssessment): boolean {
  return a.state === "open" || a.state === "closed";
}

export function venueRegistryV3Payload() {
  return [
    "ron_venue_registry_version", RON_VENUE_REGISTRY_VERSION_V3,
    "supersedes_version", 2,
    "ger40_registered", true,
    "ger40_provider", "Eightcap/MetaApi",
    "ger40_availability", "eightcap_ger40_0315_2300_broker_time",
    "cash_session_is_watch_gate", false,
    "hk50_native_completed_bar_exact_slot_proof", true,
  ];
}
