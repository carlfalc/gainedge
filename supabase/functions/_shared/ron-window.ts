/**
 * RON Phase 2C.2 — THE canonical feature window helper.
 *
 * Feature v4 window contract (`last_1500_quality_eligible`):
 *   1. take only bars at or before the target bar
 *   2. remove EVERY qv3-critical (quarantined) bar first
 *   3. take the last up to 1500 remaining eligible bars
 *   4. compute on that exact sequence
 *   5. the target bar itself must be eligible
 *
 * The live path and the backfill path MUST both call `canonicalFeatureWindow` so their
 * outputs are bit-identical for the same target. The previous v3 implementation sliced
 * the last 1500 RAW rows and then removed quarantined bars, which produced fewer than
 * 1500 eligible inputs around critical events and therefore live/backfill drift.
 */

export const RON_CANONICAL_WINDOW = 1500;
export const RON_WINDOW_CONTRACT = "last_1500_quality_eligible";

export interface WindowBar {
  time: number;
  created_at?: number | null;
}

export interface CanonicalWindowResult<T extends WindowBar> {
  /** The exact deterministic input sequence, ascending, ending at the target bar. */
  window: T[];
  /** Number of quality-eligible bars at or before the target (before the 1500 slice). */
  eligibleCount: number;
  /** Number of critical/quarantined bars removed from the at-or-before set. */
  excludedCriticalCount: number;
  /** False when the target bar itself is quarantined — no snapshot may be produced. */
  targetEligible: boolean;
}

/**
 * Build the canonical window for `targetTime` out of `bars` (ascending, any length).
 * `isQuarantined` must be the CENTRAL quality contract, never a local re-implementation.
 */
export function canonicalFeatureWindow<T extends WindowBar>(
  bars: T[],
  targetTime: number,
  barMinutes: number,
  isQuarantined: (bar: WindowBar, barMinutes: number) => boolean,
  windowSize: number = RON_CANONICAL_WINDOW,
): CanonicalWindowResult<T> {
  // 1. at or before the target only — no lookahead is representable.
  const atOrBefore = bars.filter((b) => b.time <= targetTime);
  // 2. remove all critical bars FIRST.
  const eligible = atOrBefore.filter((b) => !isQuarantined(b, barMinutes));
  const targetEligible =
    eligible.length > 0 && eligible[eligible.length - 1].time === targetTime;
  return {
    // 3. last up to `windowSize` eligible bars.
    window: targetEligible ? eligible.slice(-windowSize) : [],
    eligibleCount: eligible.length,
    excludedCriticalCount: atOrBefore.length - eligible.length,
    targetEligible,
  };
}
