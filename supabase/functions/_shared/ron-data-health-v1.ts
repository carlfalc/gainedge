/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — data freshness / health WATCHDOG V1 (pure).
 *
 * Classifies, per instrument/timeframe, whether the stored source data is genuinely
 * current, legitimately waiting on a closed venue, lagging, or actually failing.
 *
 * Key truthfulness rules:
 *   - A closed venue is NEVER an ingestion failure.
 *   - A missing bar is never invented; the last genuine bar is preserved and reported.
 *   - An instrument whose venue calendar is not authoritative reports
 *     `calendar_unavailable`, not a health verdict it cannot justify.
 *   - Status is a pure function of inputs, so the writer can persist ONLY on change
 *     and stay quiet when nothing materially moved.
 */
import { assessVenue, type VenueAssessment } from "./ron-venue-registry-v1.ts";

export const RON_DATA_HEALTH_VERSION = 1;

export type HealthStatus =
  | "current"
  | "closed_waiting"
  | "provider_lag"
  | "provider_failure"
  | "no_data"
  | "calendar_unavailable"
  | "unregistered";

export interface HealthInputs {
  instrument: string;
  timeframe: string;
  now_ms: number;
  /** Newest stored bar time (ISO) for this instrument/timeframe, or null. */
  latest_bar_time: string | null;
  /** Bar interval in minutes (15 for the RON pilot). */
  bar_minutes: number;
  /** Count of CRITICAL data-quality flags in the recent lookback range. */
  critical_flag_count: number;
}

export interface HealthAssessment {
  instrument: string;
  timeframe: string;
  status: HealthStatus;
  reason: string;
  venue: VenueAssessment;
  latest_bar_time: string | null;
  age_minutes: number | null;
  critical_flag_count: number;
  /** Whether RON may evaluate a new anchor for this instrument right now. */
  evaluation_allowed: boolean;
  health_version: number;
  observed_at: string;
}

/** Lag tolerance: one bar to close plus one bar of provider latency. */
export const LAG_BARS = 2;
/** Beyond this many bars behind on an OPEN venue, the provider is treated as failing. */
export const FAILURE_BARS = 6;

export function assessDataHealth(input: HealthInputs): HealthAssessment {
  const venue = assessVenue(input.instrument, input.now_ms);
  const observed_at = new Date(input.now_ms).toISOString();
  const latestMs = input.latest_bar_time ? Date.parse(input.latest_bar_time) : NaN;
  const hasBar = Number.isFinite(latestMs);
  const ageMin = hasBar ? Math.floor((input.now_ms - latestMs) / 60_000) : null;

  const base = {
    instrument: input.instrument, timeframe: input.timeframe, venue,
    latest_bar_time: hasBar ? new Date(latestMs).toISOString() : null,
    age_minutes: ageMin, critical_flag_count: input.critical_flag_count,
    health_version: RON_DATA_HEALTH_VERSION, observed_at,
  };

  if (venue.state === "unregistered") {
    return { ...base, status: "unregistered", reason: "instrument_not_in_venue_registry", evaluation_allowed: false };
  }
  if (venue.state === "calendar_unavailable") {
    return {
      ...base, status: "calendar_unavailable", reason: venue.reason, evaluation_allowed: false,
    };
  }
  if (!hasBar) {
    return { ...base, status: "no_data", reason: "no_stored_candles", evaluation_allowed: false };
  }
  if (venue.state === "closed") {
    return {
      ...base, status: "closed_waiting",
      reason: `venue_closed:${venue.reason}`,
      // A closed venue still allows RON to finish evaluating an already-completed bar.
      evaluation_allowed: true,
    };
  }

  const lagBars = (ageMin as number) / input.bar_minutes;
  if (lagBars <= LAG_BARS) {
    return { ...base, status: "current", reason: "within_expected_bar_latency", evaluation_allowed: true };
  }
  if (lagBars <= FAILURE_BARS) {
    return { ...base, status: "provider_lag", reason: "open_venue_source_behind", evaluation_allowed: true };
  }
  return {
    ...base, status: "provider_failure",
    reason: "open_venue_source_stalled", evaluation_allowed: false,
  };
}

/**
 * Materiality gate for persistence. Only genuine state transitions are recorded, so the
 * watchdog can tick continuously without writing noise on every poll.
 */
export function isMaterialHealthChange(
  previous: { status: string; reason: string; latest_bar_time: string | null } | null,
  next: HealthAssessment,
): boolean {
  if (!previous) return true;
  if (previous.status !== next.status) return true;
  if (previous.reason !== next.reason) return true;
  // Same status + same reason + newer data is routine progress, not an incident.
  return false;
}
