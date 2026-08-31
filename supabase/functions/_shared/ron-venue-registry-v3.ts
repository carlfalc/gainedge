/**
 * GAINEDGE_RON_AGENTIC_WATCH_V1 — venue registry V3.
 *
 * Forward-only extension of V2. V1/V2 remain replayable and untouched.
 * Adds GER40 as an explicit Eightcap/MetaApi CFD subject. The broker alias table already
 * resolves GER40 through GER40/DAX40/DE40/GER40.i; this module supplies only venue truth.
 *
 * GER40 is treated as a broker index CFD for availability, not as a cash-only Xetra
 * instrument. RON may therefore observe every genuine completed broker bar across the
 * broker's weekly session. European cash-session labels are descriptive context only and
 * never a gate on the agentic watch.
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
  note: "Eightcap/MetaApi GER40 CFD. Broker weekly session is used for availability; European cash hours are descriptive context only and never an agentic-watch gate.",
});

export const VENUE_REGISTRY_V3: Readonly<Record<string, VenueSpec>> = Object.freeze({
  ...VENUE_REGISTRY,
  GER40: GER40_VENUE_SPEC,
});

const MIN = 60_000;

function brokerWeeklyOpen(t: number): boolean {
  const c = localClock(t, "America/New_York");
  if (c.dow === 6) return false;
  if (c.dow === 5 && c.minutes >= 17 * 60) return false;
  if (c.dow === 0 && c.minutes < 17 * 60) return false;
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return false;
  return true;
}

function brokerClosedReason(t: number): string {
  const c = localClock(t, "America/New_York");
  if (c.minutes >= 17 * 60 && c.minutes < 18 * 60) return "daily_break_1700_1800_ny";
  return "weekly_closure_fri1700_sun1700_ny";
}

function nextBrokerOpen(from: number): string | null {
  const start = Math.ceil(from / MIN) * MIN;
  for (let k = 1; k <= 8 * 24 * 60; k++) {
    const t = start + k * MIN;
    if (brokerWeeklyOpen(t)) return new Date(t).toISOString();
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

  const open = brokerWeeklyOpen(t);
  return {
    instrument,
    venue_class: GER40_VENUE_SPEC.venue_class,
    timezone: GER40_VENUE_SPEC.timezone,
    state: open ? "open" : "closed",
    reason: open ? "broker_weekly_schedule_open" : brokerClosedReason(t),
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
    "ger40_availability", "broker_index_cfd_weekly_session",
    "cash_session_is_watch_gate", false,
    "hk50_native_completed_bar_exact_slot_proof", true,
  ];
}
