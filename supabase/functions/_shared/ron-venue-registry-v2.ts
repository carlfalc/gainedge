/**
 * GAINEDGE_RON_MULTI_MARKET_RUNTIME_V2 — venue registry V2.
 *
 * Forward-only extension of venue registry V1. V1 remains replayable and untouched.
 *
 * HK50 has a known ordinary HKEX cash-session schedule but no authoritative holiday
 * calendar in-repo. V1 therefore (correctly) returns `calendar_unavailable` during an
 * otherwise-open cash session. V2 adds one narrow source-of-truth override:
 *
 *   a genuine broker-native COMPLETED HK50 15m bar at the exact analytical slot proves
 *   that trading occurred for that slot.
 *
 * A native bar can prove OPEN for its own completed slot only. It cannot prove a future
 * slot, another day, a holiday schedule generally, or the next expected opening. Missing
 * data never becomes proof of closure. No candle is fabricated and no holiday is inferred.
 */
import {
  assessVenue, localClock, VENUE_REGISTRY,
  type VenueAssessment,
} from "./ron-venue-registry-v1.ts";

export const RON_VENUE_REGISTRY_VERSION_V2 = 2;
export const RON_VENUE_NATIVE_PROOF_TIMEFRAME_MINUTES = 15;

export interface NativeCompletedBarProof {
  /** Genuine candle_history bar OPEN. */
  bar_open: string;
  /** Must be 15 for the current RON pilot. */
  timeframe_minutes: number;
}

const BAR_MS = RON_VENUE_NATIVE_PROOF_TIMEFRAME_MINUTES * 60_000;

function hkexScheduleContainsBarOpen(t: number): boolean {
  const spec = VENUE_REGISTRY.HK50;
  const c = localClock(t, spec.timezone);
  if (c.dow === 0 || c.dow === 6) return false;
  return spec.sessions.some((s) => c.minutes >= s.from && c.minutes < s.to);
}

/**
 * Strict proof validator. The proof is useful only for the exact completed analytical
 * slot being evaluated. A bar after the evaluation instant, off-grid bar, wrong
 * timeframe, lunch/weekend bar or malformed timestamp is rejected.
 */
export function nativeCompletedBarProvesHk50Trading(
  evaluationAnchor: string | number | Date,
  proof: NativeCompletedBarProof | null | undefined,
): boolean {
  if (!proof || proof.timeframe_minutes !== RON_VENUE_NATIVE_PROOF_TIMEFRAME_MINUTES) return false;
  const anchorMs = evaluationAnchor instanceof Date
    ? evaluationAnchor.getTime()
    : typeof evaluationAnchor === "number"
      ? evaluationAnchor
      : Date.parse(evaluationAnchor);
  const openMs = Date.parse(proof.bar_open);
  if (!Number.isFinite(anchorMs) || !Number.isFinite(openMs)) return false;
  if (openMs % BAR_MS !== 0 || anchorMs % BAR_MS !== 0) return false;
  if (openMs + BAR_MS !== anchorMs) return false;
  if (!hkexScheduleContainsBarOpen(openMs)) return false;
  return true;
}

/**
 * Venue assessment at one RON evaluation anchor.
 *
 * For every instrument except the narrowly proven HK50 slot, V1 truth is preserved.
 * The V2 registry version is surfaced so stored cycle evidence can identify the rule set.
 */
export function assessVenueV2(
  instrument: string,
  evaluationAnchor: string | number | Date,
  nativeProof?: NativeCompletedBarProof | null,
): VenueAssessment {
  const at = evaluationAnchor instanceof Date
    ? evaluationAnchor
    : new Date(evaluationAnchor);
  const base = assessVenue(instrument, at);

  if (
    instrument === "HK50"
    && base.state === "calendar_unavailable"
    && nativeCompletedBarProvesHk50Trading(evaluationAnchor, nativeProof)
  ) {
    return {
      ...base,
      state: "open",
      reason: "native_completed_bar_proves_hkex_trading_for_exact_slot",
      registry_version: RON_VENUE_REGISTRY_VERSION_V2,
      next_expected_open: null,
    };
  }

  return { ...base, registry_version: RON_VENUE_REGISTRY_VERSION_V2 };
}

export function venueReasoningAllowedV2(a: VenueAssessment): boolean {
  return a.state === "open" || a.state === "closed";
}

export function venueRegistryV2Payload() {
  return [
    "ron_venue_registry_version", RON_VENUE_REGISTRY_VERSION_V2,
    "supersedes_version", 1,
    "hk50_native_completed_bar_exact_slot_proof", true,
    "holiday_inference_allowed", false,
    "missing_bar_proves_closed", false,
    "native_proof_timeframe_minutes", RON_VENUE_NATIVE_PROOF_TIMEFRAME_MINUTES,
  ];
}
