/**
 * RON Phase 2D.1 — RON_STATE_SPEC_V1 (RESEARCH ONLY).
 *
 * A FROZEN, PRE-SPECIFIED derivation of coarse market-state variables from ONE stored
 * feature_version=4 snapshot (plus its persisted pattern objects and the canonical
 * calibration session label). Every threshold below was declared BEFORE any outcome was
 * evaluated and must never be tuned from labels.
 *
 * HARD RULES
 *   - Pure deterministic function of a SINGLE anchor snapshot. No candle math, no
 *     neighbouring bars, no future information, no randomness.
 *   - Missing / non-finite / unrecognised inputs map to the literal bucket "unknown"
 *     (or "unavailable" where the spec says so). Nothing is imputed.
 *   - Pattern `confidence` is NEVER read: it is not a probability.
 *   - Nothing here is a probability, a signal, or a trade level.
 */
import { adxBucket, normRegime, normSession } from "./ron-calibration.ts";

export const RON_STATE_SPEC_VERSION = 1;

/** Predeclared tolerances. Fixed before evaluation; never fitted to outcomes. */
export const RON_STATE_TOLERANCES = {
  /** rsi14_slope3 is stored rounded to 2dp; |slope| <= this is "flat". */
  rsi_slope_flat_abs: 0.25,
  /** |di_plus - di_minus| <= this is "balanced". */
  di_balanced_abs: 2.0,
  /** |dist_to_support_pct - dist_to_resistance_pct| <= this (percentage points) is "balanced". */
  nearest_level_balanced_pct: 0.05,
} as const;

export const UNKNOWN = "unknown";
export const UNAVAILABLE = "unavailable";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const oneOf = (v: unknown, allowed: readonly string[]): string =>
  typeof v === "string" && allowed.includes(v) ? v : UNKNOWN;

/** Ordered bin helper: first band whose exclusive upper bound is not exceeded. */
function bin(v: number | null, bands: readonly { label: string; lt: number | null }[]): string {
  if (v == null) return UNKNOWN;
  for (const b of bands) {
    if (b.lt == null) return b.label;
    if (v < b.lt) return b.label;
  }
  return UNKNOWN;
}

export const RSI_ZONE_BANDS = [
  { label: "rsi_lt35", lt: 35 },
  { label: "rsi_35_45", lt: 45 },
  { label: "rsi_45_55", lt: 55 },
  { label: "rsi_55_65", lt: 65 },
  { label: "rsi_gte65", lt: null },
] as const;

export const STOCH_ZONE_BANDS = [
  { label: "stoch_lt20", lt: 20 },
  { label: "stoch_20_40", lt: 40 },
  { label: "stoch_40_60", lt: 60 },
  { label: "stoch_60_80", lt: 80 },
  { label: "stoch_gte80", lt: null },
] as const;

export const POSITION_DAY_BANDS = [
  { label: "pos_lt25", lt: 25 },
  { label: "pos_25_50", lt: 50 },
  { label: "pos_50_75", lt: 75 },
  { label: "pos_gte75", lt: null },
] as const;

export const RELATIVE_VOLUME_BANDS = [
  { label: "rvol_lt0_8", lt: 0.8 },
  { label: "rvol_0_8_1_2", lt: 1.2 },
  { label: "rvol_gt1_2", lt: null },
] as const;

export const NEAREST_LEVEL_ATR_BANDS = [
  { label: "lvl_lte0_5atr", lt: 0.5 },
  { label: "lvl_0_5_1atr", lt: 1 },
  { label: "lvl_1_2atr", lt: 2 },
  { label: "lvl_gt2atr", lt: null },
] as const;

export interface PatternLike { direction?: unknown }

/** The full derived state vector for one anchor. All values are plain strings. */
export type RonStateVector = Record<string, string>;

/** Canonical variable list — ORDER IS PART OF THE SPEC HASH. */
export const RON_STATE_VARIABLES = [
  "session",
  "regime",
  "adx_bucket",
  "volatility_regime",
  "ema_stack",
  "macd_state",
  "rsi_zone",
  "rsi_slope_sign",
  "stoch_zone",
  "di_dominance",
  "ha_state",
  "structure_bias",
  "position_day_bucket",
  "relative_volume_bucket",
  "pattern_bias",
  "pattern_count_bucket",
  "nearest_level_side",
  "nearest_level_atr_bucket",
] as const;
export type RonStateVariable = typeof RON_STATE_VARIABLES[number];

/**
 * Derive RON_STATE_SPEC_V1 for one anchor.
 * `session` MUST be the canonical calibration session label (from ron_snapshot_outcomes),
 * NOT the legacy simple `features.session` string, which uses different boundaries.
 */
export function deriveStateV1(
  features: Record<string, unknown> | null | undefined,
  patterns: PatternLike[] | null | undefined,
  canonicalSession: string | null | undefined,
): RonStateVector {
  const f = features ?? {};

  const rsi = num(f.rsi14);
  const slope = num(f.rsi14_slope3);
  const diPlus = num(f.di_plus);
  const diMinus = num(f.di_minus);
  const atrPct = num(f.atr_pct);
  const dSup = num(f.dist_to_support_pct);
  const dRes = num(f.dist_to_resistance_pct);

  // K/L — structure object is booleans only.
  const st = (f.structure ?? {}) as Record<string, unknown>;
  const bull = st.higher_high === true || st.higher_low === true;
  const bear = st.lower_high === true || st.lower_low === true;
  const structureBias = bull && bear ? "mixed" : bull ? "bullish" : bear ? "bearish" : "neutral";

  // N — relative volume is only meaningful when the source actually carried volume.
  const volAvailable = f.volume_available === true;
  const relVol = num(f.relative_volume);
  const relativeVolumeBucket = !volAvailable ? UNKNOWN : bin(relVol, RELATIVE_VOLUME_BANDS);

  // O/P — persisted pattern directions only. `confidence` is deliberately ignored.
  const pats = Array.isArray(patterns) ? patterns : [];
  const hasBull = pats.some((p) => p?.direction === "bullish");
  const hasBear = pats.some((p) => p?.direction === "bearish");
  const patternBias = hasBull && hasBear ? "mixed"
    : hasBull ? "bullish_only"
      : hasBear ? "bearish_only"
        : "none";
  const patternCountBucket = pats.length === 0 ? "patterns_0" : pats.length === 1 ? "patterns_1" : "patterns_2plus";

  // Q/R — level geometry from already-stored distances only. Nothing is invented.
  let nearestLevelSide = UNAVAILABLE;
  let nearestLevelAtrBucket = UNAVAILABLE;
  if (dSup != null && dRes != null) {
    const diff = dSup - dRes;
    nearestLevelSide = Math.abs(diff) <= RON_STATE_TOLERANCES.nearest_level_balanced_pct
      ? "balanced"
      : diff < 0 ? "support_closer" : "resistance_closer";
    const minDist = Math.min(Math.abs(dSup), Math.abs(dRes));
    if (atrPct != null && atrPct > 0) {
      nearestLevelAtrBucket = bin(minDist / atrPct, NEAREST_LEVEL_ATR_BANDS);
    }
  }

  return {
    session: normSession(canonicalSession),
    regime: normRegime(typeof f.regime === "string" ? f.regime : null),
    adx_bucket: adxBucket(num(f.adx14)),
    volatility_regime: oneOf(f.volatility_regime, ["low", "normal", "high"]),
    ema_stack: oneOf(f.ema_stack, ["up", "down", "mixed"]),
    macd_state: oneOf(f.macd_state, [
      "bullish_expanding", "bullish_fading", "bearish_expanding", "bearish_fading",
    ]),
    rsi_zone: bin(rsi, RSI_ZONE_BANDS),
    rsi_slope_sign: slope == null ? UNKNOWN
      : Math.abs(slope) <= RON_STATE_TOLERANCES.rsi_slope_flat_abs ? "flat"
        : slope > 0 ? "rising" : "falling",
    stoch_zone: bin(num(f.stoch_rsi), STOCH_ZONE_BANDS),
    di_dominance: diPlus == null || diMinus == null ? UNKNOWN
      : Math.abs(diPlus - diMinus) <= RON_STATE_TOLERANCES.di_balanced_abs ? "balanced"
        : diPlus > diMinus ? "plus" : "minus",
    ha_state: oneOf(f.ha_state, ["bullish", "bearish"]),
    structure_bias: structureBias,
    position_day_bucket: bin(num(f.position_in_day_range_pct), POSITION_DAY_BANDS),
    relative_volume_bucket: relativeVolumeBucket,
    pattern_bias: patternBias,
    pattern_count_bucket: patternCountBucket,
    nearest_level_side: nearestLevelSide,
    nearest_level_atr_bucket: nearestLevelAtrBucket,
  };
}

/** Ordered, hashable serialisation of the ENTIRE spec (definitions + tolerances + bands). */
export function stateSpecPayload() {
  return [
    "ron_state_spec_version", RON_STATE_SPEC_VERSION,
    "variables", [...RON_STATE_VARIABLES],
    "tolerances", Object.keys(RON_STATE_TOLERANCES).sort()
      .map((k) => [k, (RON_STATE_TOLERANCES as Record<string, number>)[k]]),
    "rsi_zone_bands", RSI_ZONE_BANDS.map((b) => [b.label, b.lt]),
    "stoch_zone_bands", STOCH_ZONE_BANDS.map((b) => [b.label, b.lt]),
    "position_day_bands", POSITION_DAY_BANDS.map((b) => [b.label, b.lt]),
    "relative_volume_bands", RELATIVE_VOLUME_BANDS.map((b) => [b.label, b.lt]),
    "nearest_level_atr_bands", NEAREST_LEVEL_ATR_BANDS.map((b) => [b.label, b.lt]),
    "unknown_label", UNKNOWN,
    "unavailable_label", UNAVAILABLE,
    "pattern_confidence_used", false,
    "session_source", "canonical_calibration_session",
  ];
}

/* ==========================================================================
 * RON_STATE_SPEC_V2 — Phase 2D.1a correction.
 *
 * V1 above is FROZEN and must never change: research_version=1 results are
 * reproducible only against it. V2 replaces the single ambiguous `v < b.lt`
 * helper with EXPLICIT interval descriptors carrying inclusive/exclusive
 * endpoints, and hashes those comparator semantics into the spec payload.
 * Everything else (variables, labels, tolerances, unknown handling, pattern
 * confidence never read) is identical to V1.
 * ========================================================================== */

export const RON_STATE_SPEC_VERSION_V2 = 2;

/** Explicit interval: null bound = unbounded on that side. */
export interface IntervalBand {
  label: string;
  lower: number | null;
  upper: number | null;
  lower_inclusive: boolean;
  upper_inclusive: boolean;
}

const band = (
  label: string,
  lower: number | null,
  upper: number | null,
  lower_inclusive: boolean,
  upper_inclusive: boolean,
): IntervalBand => ({ label, lower, upper, lower_inclusive, upper_inclusive });

/** Classify against explicit intervals. Bands are disjoint and exhaustive by construction. */
export function classifyInterval(v: number | null, bands: readonly IntervalBand[]): string {
  if (v == null) return UNKNOWN;
  for (const b of bands) {
    const okLo = b.lower == null || (b.lower_inclusive ? v >= b.lower : v > b.lower);
    const okHi = b.upper == null || (b.upper_inclusive ? v <= b.upper : v < b.upper);
    if (okLo && okHi) return b.label;
  }
  return UNKNOWN;
}

/** RSI: <35 ; [35,45) ; [45,55) ; [55,65) ; >=65 */
export const RSI_ZONE_BANDS_V2: readonly IntervalBand[] = [
  band("rsi_lt35", null, 35, false, false),
  band("rsi_35_45", 35, 45, true, false),
  band("rsi_45_55", 45, 55, true, false),
  band("rsi_55_65", 55, 65, true, false),
  band("rsi_gte65", 65, null, true, false),
];

/** Stoch: <20 ; [20,40) ; [40,60) ; [60,80) ; >=80 */
export const STOCH_ZONE_BANDS_V2: readonly IntervalBand[] = [
  band("stoch_lt20", null, 20, false, false),
  band("stoch_20_40", 20, 40, true, false),
  band("stoch_40_60", 40, 60, true, false),
  band("stoch_60_80", 60, 80, true, false),
  band("stoch_gte80", 80, null, true, false),
];

/** Position in day range: <25 ; [25,50) ; [50,75) ; >=75 */
export const POSITION_DAY_BANDS_V2: readonly IntervalBand[] = [
  band("pos_lt25", null, 25, false, false),
  band("pos_25_50", 25, 50, true, false),
  band("pos_50_75", 50, 75, true, false),
  band("pos_gte75", 75, null, true, false),
];

/** Relative volume: <0.8 ; [0.8,1.2] ; >1.2 — 1.2 is INCLUSIVE in the middle band. */
export const RELATIVE_VOLUME_BANDS_V2: readonly IntervalBand[] = [
  band("rvol_lt0_8", null, 0.8, false, false),
  band("rvol_0_8_1_2", 0.8, 1.2, true, true),
  band("rvol_gt1_2", 1.2, null, false, false),
];

/** Nearest-level ATR ratio: <=0.5 ; (0.5,1] ; (1,2] ; >2 */
export const NEAREST_LEVEL_ATR_BANDS_V2: readonly IntervalBand[] = [
  band("lvl_lte0_5atr", null, 0.5, false, true),
  band("lvl_0_5_1atr", 0.5, 1, false, true),
  band("lvl_1_2atr", 1, 2, false, true),
  band("lvl_gt2atr", 2, null, false, false),
];

/**
 * Derive RON_STATE_SPEC_V2 for one anchor. Identical to V1 except that every binned
 * variable uses explicit inclusive/exclusive interval endpoints.
 */
export function deriveStateV2(
  features: Record<string, unknown> | null | undefined,
  patterns: PatternLike[] | null | undefined,
  canonicalSession: string | null | undefined,
): RonStateVector {
  const f = features ?? {};
  const v1 = deriveStateV1(f, patterns, canonicalSession);

  const atrPct = num(f.atr_pct);
  const dSup = num(f.dist_to_support_pct);
  const dRes = num(f.dist_to_resistance_pct);
  const volAvailable = f.volume_available === true;

  let nearestLevelAtrBucket = UNAVAILABLE;
  if (dSup != null && dRes != null && atrPct != null && atrPct > 0) {
    const minDist = Math.min(Math.abs(dSup), Math.abs(dRes));
    nearestLevelAtrBucket = classifyInterval(minDist / atrPct, NEAREST_LEVEL_ATR_BANDS_V2);
  }

  return {
    ...v1,
    rsi_zone: classifyInterval(num(f.rsi14), RSI_ZONE_BANDS_V2),
    stoch_zone: classifyInterval(num(f.stoch_rsi), STOCH_ZONE_BANDS_V2),
    position_day_bucket: classifyInterval(num(f.position_in_day_range_pct), POSITION_DAY_BANDS_V2),
    relative_volume_bucket: !volAvailable
      ? UNKNOWN
      : classifyInterval(num(f.relative_volume), RELATIVE_VOLUME_BANDS_V2),
    nearest_level_atr_bucket: nearestLevelAtrBucket,
  };
}

const bandPayload = (bands: readonly IntervalBand[]) =>
  bands.map((b) => [b.label, b.lower, b.upper, b.lower_inclusive, b.upper_inclusive]);

/**
 * Ordered, hashable serialisation of RON_STATE_SPEC_V2, including the interval
 * comparator semantics that V1 failed to hash.
 */
export function stateSpecPayloadV2() {
  return [
    "ron_state_spec_version", RON_STATE_SPEC_VERSION_V2,
    "variables", [...RON_STATE_VARIABLES],
    "tolerances", Object.keys(RON_STATE_TOLERANCES).sort()
      .map((k) => [k, (RON_STATE_TOLERANCES as Record<string, number>)[k]]),
    "interval_semantics", "explicit_lower_upper_with_inclusivity_flags",
    "rsi_zone_bands", bandPayload(RSI_ZONE_BANDS_V2),
    "stoch_zone_bands", bandPayload(STOCH_ZONE_BANDS_V2),
    "position_day_bands", bandPayload(POSITION_DAY_BANDS_V2),
    "relative_volume_bands", bandPayload(RELATIVE_VOLUME_BANDS_V2),
    "nearest_level_atr_bands", bandPayload(NEAREST_LEVEL_ATR_BANDS_V2),
    "unknown_label", UNKNOWN,
    "unavailable_label", UNAVAILABLE,
    "pattern_confidence_used", false,
    "session_source", "canonical_calibration_session",
  ];
}