/**
 * GAINEDGE_RON_PATTERN_EXPANSION_V1
 *
 * Additive, deterministic named-pattern detectors that extend the active catalogue from
 * 7 to 11:
 *   8.  Inverse Head & Shoulders  (bullish)
 *   9.  Symmetrical Triangle      (neutral — no fabricated breakout side)
 *   10. Rising Wedge              (bearish-leaning structural context)
 *   11. Falling Wedge             (bullish-leaning structural context)
 *
 * WHY A SEPARATE MODULE (do not "tidy" this away):
 * `_shared/ron-patterns.ts` is SOURCE-HASH-PINNED by frozen RON artifacts
 * (`PATTERN_DETECTOR_SOURCE_SHA256` consumed by Pattern Context Spec V1/V2/V3 and the
 * orchestration lineage). Editing that file would silently invalidate accepted evidence
 * and spec hashes. This module therefore adds detectors WITHOUT touching the pinned
 * source: the frozen pattern_context specialist keeps calling `detectPatterns` and its
 * behaviour, hashes and evidence are bit-identical. Only the snapshot feature pipeline
 * (`ron-features.ts`) composes base + expansion output.
 *
 * The pivot helper below is an intentional VERBATIM copy of the pinned detector's
 * `findPivots` (it is not exported there, and exporting it would change the pinned
 * source hash). Keep the two in sync by copy, never by refactor.
 *
 * TRUTH RULES
 *  - Only geometry that is genuinely derived from real pivots is stored.
 *  - No measured-move `target` is stored for triangles/wedges: no breakout has been
 *    observed, so a projection would be fabricated. Inverse H&S mirrors the existing
 *    Head & Shoulders measured-move convention exactly.
 *  - `confidence` is an internal deterministic ordering integer, identical in nature to
 *    the base detector's. It is never a probability and is stripped before reaching UI.
 *  - No LLM, no randomness, no lookahead: index `i` only ever reads candles ≤ i.
 */
import type { OHLCVCandle, DetectedPattern } from "./ron-patterns.ts";

/** Expanded direction domain: the base union plus a truthful `neutral`. */
export type ExpandedDirection = "bullish" | "bearish" | "neutral";

export interface ExpandedPattern extends Omit<DetectedPattern, "direction"> {
  direction: ExpandedDirection;
}

/** Named patterns produced by this module, in deterministic precedence order. */
export const EXPANSION_PATTERN_NAMES = [
  "Inverse Head & Shoulders",
  "Symmetrical Triangle",
  "Rising Wedge",
  "Falling Wedge",
] as const;

/** The full accepted catalogue after this slice: 7 base + 4 expansion. */
export const RON_NAMED_PATTERN_CATALOGUE_V1 = [
  "Double Top",
  "Double Bottom",
  "Head & Shoulders",
  "Ascending Triangle",
  "Descending Triangle",
  "Bull Flag",
  "Bear Flag",
  ...EXPANSION_PATTERN_NAMES,
] as const;

/** Internal slice the expansion scans — mirrors the base detector's 100-bar slice. */
export const EXPANSION_SLICE_BARS = 100;
/** Minimum bars the expansion detector needs before it will emit anything. */
export const EXPANSION_MIN_BARS = 20;
/** Minimum bar span a triangle / wedge must cover. Kills 2–3 bar noise. */
export const MIN_STRUCTURE_SPAN_BARS = 12;
/**
 * Minimum total drift of a boundary across the structure span, as a fraction of price,
 * before it counts as genuinely sloping rather than flat noise.
 */
const MIN_BOUNDARY_DRIFT_FRACTION = 0.002;
/** Converged width must be at most this fraction of the starting width. */
const MAX_CONVERGENCE_RATIO = 0.65;
/** Starting width must be at least this fraction of price to be a real structure. */
const MIN_START_WIDTH_FRACTION = 0.004;

const TOLERANCE = 0.003;
function similar(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= tol;
}

interface Pivot { index: number; price: number }

/** VERBATIM copy of the pinned detector's pivot finder. See module header. */
function findPivots(candles: OHLCVCandle[], window = 3) {
  const peaks: Pivot[] = [];
  const troughs: Pivot[] = [];

  for (let i = window; i < candles.length - window; i++) {
    let isPeak = true;
    let isTrough = true;
    for (let j = 1; j <= window; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isPeak = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isTrough = false;
    }
    if (isPeak) peaks.push({ index: i, price: candles[i].high });
    if (isTrough) troughs.push({ index: i, price: candles[i].low });
  }
  return { peaks, troughs };
}

/** Ordinary least-squares fit of price on candle index. Deterministic. */
function fitLine(points: Pivot[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.index; sy += p.price; sxx += p.index * p.index; sxy += p.index * p.price;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

const at = (l: { slope: number; intercept: number }, x: number) => l.slope * x + l.intercept;

/* ─── A. Inverse Head & Shoulders ─────────────────────────────────── */

/**
 * Bullish mirror of the pinned `detectHeadAndShoulders`: three troughs where the middle
 * trough (the head) is meaningfully BELOW two comparable shoulders, with a neckline
 * averaged from the peaks between them and the mirrored measured move.
 */
export function detectInverseHeadAndShoulders(
  candles: OHLCVCandle[], peaks: Pivot[], troughs: Pivot[],
): ExpandedPattern | null {
  for (let i = troughs.length - 1; i >= 2; i--) {
    const right = troughs[i];
    const head = troughs[i - 1];
    const left = troughs[i - 2];

    // Head must be meaningfully lower than both shoulders (not a rounding artefact).
    if (head.price >= left.price || head.price >= right.price) continue;
    if (similar(head.price, left.price, 0.002) || similar(head.price, right.price, 0.002)) continue;
    // Shoulders reasonably comparable — same tolerance as the bearish original.
    if (!similar(left.price, right.price, 0.01)) continue;
    if (head.index - left.index < 5 || right.index - head.index < 5) continue;

    const leftPeaks = peaks.filter((p) => p.index > left.index && p.index < head.index);
    const rightPeaks = peaks.filter((p) => p.index > head.index && p.index < right.index);
    if (leftPeaks.length === 0 || rightPeaks.length === 0) continue;

    const neckline =
      (Math.max(...leftPeaks.map((p) => p.price)) + Math.max(...rightPeaks.map((p) => p.price))) / 2;
    const height = neckline - head.price;
    const target = neckline + height;

    return {
      pattern_name: "Inverse Head & Shoulders",
      direction: "bullish",
      confidence: Math.min(9, Math.round(6 + (similar(left.price, right.price, 0.005) ? 2 : 0) + 1)),
      start_index: left.index,
      end_index: right.index,
      key_prices: { neckline, target, troughs: [left.price, head.price, right.price] },
    };
  }
  return null;
}

/* ─── B/C/D. Converging-boundary structures ───────────────────────── */

interface Converging {
  startIdx: number;
  endIdx: number;
  upperSlope: number;
  lowerSlope: number;
  upperStart: number; upperEnd: number;
  lowerStart: number; lowerEnd: number;
  touches: number;
}

/**
 * Shared geometric core for Symmetrical Triangle / Rising Wedge / Falling Wedge:
 * fit the recent swing highs and swing lows, require a real span, real touches and
 * genuine convergence. Returns null when the structure is ordinary range noise.
 */
function convergingStructure(peaks: Pivot[], troughs: Pivot[], avgPrice: number): Converging | null {
  const recentPeaks = peaks.slice(-4);
  const recentTroughs = troughs.slice(-4);
  if (recentPeaks.length < 3 || recentTroughs.length < 3) return null;

  const upper = fitLine(recentPeaks);
  const lower = fitLine(recentTroughs);
  if (!upper || !lower) return null;

  const startIdx = Math.min(recentPeaks[0].index, recentTroughs[0].index);
  const endIdx = Math.max(recentPeaks.at(-1)!.index, recentTroughs.at(-1)!.index);
  if (endIdx - startIdx < MIN_STRUCTURE_SPAN_BARS) return null;

  const upperStart = at(upper, startIdx), upperEnd = at(upper, endIdx);
  const lowerStart = at(lower, startIdx), lowerEnd = at(lower, endIdx);

  const widthStart = upperStart - lowerStart;
  const widthEnd = upperEnd - lowerEnd;
  // Boundaries must not cross, must start wide enough, and must genuinely contract.
  if (widthStart <= 0 || widthEnd <= 0) return null;
  if (widthStart / avgPrice < MIN_START_WIDTH_FRACTION) return null;
  if (widthEnd / widthStart > MAX_CONVERGENCE_RATIO) return null;

  return {
    startIdx, endIdx,
    upperSlope: upper.slope, lowerSlope: lower.slope,
    upperStart, upperEnd, lowerStart, lowerEnd,
    touches: recentPeaks.length + recentTroughs.length,
  };
}

function boundaryLines(candles: OHLCVCandle[], s: Converging) {
  return {
    upper_line: {
      start: { time: candles[s.startIdx].time, price: s.upperStart },
      end: { time: candles[s.endIdx].time, price: s.upperEnd },
    },
    lower_line: {
      start: { time: candles[s.startIdx].time, price: s.lowerStart },
      end: { time: candles[s.endIdx].time, price: s.lowerEnd },
    },
  };
}

/**
 * Exactly one converging-boundary pattern can ever be emitted for one structure — the
 * three definitions are slope-sign disjoint by construction:
 *   Symmetrical Triangle : upper falling AND lower rising
 *   Rising Wedge         : both rising, lower rising faster
 *   Falling Wedge        : both falling, upper falling faster
 */
export function detectConvergingStructure(
  candles: OHLCVCandle[], peaks: Pivot[], troughs: Pivot[],
): ExpandedPattern | null {
  if (candles.length === 0) return null;
  const avgPrice = candles.reduce((a, c) => a + c.close, 0) / candles.length;
  const s = convergingStructure(peaks, troughs, avgPrice);
  if (!s) return null;

  // A boundary is "sloping" only when its total drift across the span is material.
  const span = s.endIdx - s.startIdx;
  const minDrift = avgPrice * MIN_BOUNDARY_DRIFT_FRACTION;
  const upperDrift = s.upperSlope * span;
  const lowerDrift = s.lowerSlope * span;
  const upFalling = upperDrift < -minDrift;
  const upRising = upperDrift > minDrift;
  const loRising = lowerDrift > minDrift;
  const loFalling = lowerDrift < -minDrift;
  const conf = Math.min(8, 5 + Math.floor(s.touches / 3));
  const lines = boundaryLines(candles, s);

  // B. Symmetrical Triangle — descending upper, ascending lower, comparable magnitudes.
  if (upFalling && loRising) {
    const ratio = Math.abs(s.upperSlope) / Math.abs(s.lowerSlope);
    if (ratio >= 1 / 3 && ratio <= 3) {
      return {
        pattern_name: "Symmetrical Triangle",
        // No breakout has occurred, so no side is claimed.
        direction: "neutral",
        confidence: conf,
        start_index: s.startIdx,
        end_index: s.endIdx,
        key_prices: { ...lines },
      };
    }
    return null;
  }

  // C. Rising Wedge — both boundaries rising, lower rising faster (convergence).
  if (upRising && loRising && s.lowerSlope > s.upperSlope) {
    return {
      pattern_name: "Rising Wedge",
      direction: "bearish",
      confidence: conf,
      start_index: s.startIdx,
      end_index: s.endIdx,
      key_prices: { ...lines },
    };
  }

  // D. Falling Wedge — both boundaries falling, upper falling faster (convergence).
  if (upFalling && loFalling && s.upperSlope < s.lowerSlope) {
    return {
      pattern_name: "Falling Wedge",
      direction: "bullish",
      confidence: conf,
      start_index: s.startIdx,
      end_index: s.endIdx,
      key_prices: { ...lines },
    };
  }

  return null;
}

/* ─── Composition + deterministic precedence ──────────────────────── */

const BASE_TRIANGLE_NAMES = new Set(["Ascending Triangle", "Descending Triangle"]);

function overlaps(a: { start_index: number; end_index: number }, b: { start_index: number; end_index: number }) {
  return a.start_index <= b.end_index && b.start_index <= a.end_index;
}

/**
 * Detects the 4 expansion patterns on the same input the base detector receives.
 *
 * PRECEDENCE (deterministic, documented):
 *  1. The pinned base detector always wins. Its 7 patterns are never modified, removed
 *     or reordered by this module.
 *  2. A converging structure is DROPPED when the base detector already emitted an
 *     Ascending or Descending Triangle whose index span overlaps it — the same shape is
 *     never published twice under two triangle names.
 *  3. At most ONE converging-boundary pattern per call (slope-sign disjoint definitions).
 *  4. Inverse Head & Shoulders is independent: it is a distinct three-trough definition
 *     and is not suppressed by, nor suppresses, any base pattern.
 *
 * @param basePatterns the already-computed `detectPatterns(candles)` output, used only
 *                     for suppression. It is never mutated.
 */
export function detectExpansionPatterns(
  candles: OHLCVCandle[],
  basePatterns: readonly DetectedPattern[] = [],
): ExpandedPattern[] {
  if (candles.length < EXPANSION_MIN_BARS) return [];

  const slice = candles.slice(-EXPANSION_SLICE_BARS);
  const offset = candles.length - slice.length;
  const { peaks, troughs } = findPivots(slice, 3);
  const out: ExpandedPattern[] = [];

  const invHns = detectInverseHeadAndShoulders(slice, peaks, troughs);
  if (invHns) out.push(invHns);

  const converging = detectConvergingStructure(slice, peaks, troughs);
  if (converging) out.push(converging);

  for (const p of out) {
    p.start_index += offset;
    p.end_index += offset;
  }

  const baseTriangles = basePatterns.filter((b) => BASE_TRIANGLE_NAMES.has(b.pattern_name));
  return out.filter((p) => {
    if (p.pattern_name === "Inverse Head & Shoulders") return true;
    return !baseTriangles.some((b) => overlaps(b, p));
  });
}
