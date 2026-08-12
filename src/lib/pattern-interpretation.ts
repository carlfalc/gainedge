/**
 * Deterministic, grounded pattern interpretation for RON snapshot patterns.
 *
 * TRUTH RULES (do not relax):
 *  - Explanations are pure functions of the persisted pattern object.
 *  - A numeric level is only ever mentioned when it genuinely exists in
 *    `key_prices`. If it is absent, the sentence stays qualitative.
 *  - No probability, no confidence score presented as probability, no trade
 *    levels, no LLM prose at runtime.
 *
 * The shape mirrors `DetectedPattern` in
 * supabase/functions/_shared/ron-patterns.ts (the producer of `snap.patterns`).
 */

export interface PatternKeyPrices {
  neckline?: number;
  target?: number;
  resistance?: number;
  support?: number;
  peaks?: number[];
  troughs?: number[];
  [k: string]: unknown;
}

export interface SnapshotPattern {
  pattern_name?: string;
  direction?: string;
  confidence?: number;
  start_index?: number;
  end_index?: number;
  key_prices?: PatternKeyPrices;
}

export interface PatternExplanation {
  /** e.g. "Double Top bearish" */
  title: string;
  direction: "bullish" | "bearish" | "unknown";
  /** What the structure normally means in the detected direction. */
  meaning: string;
  /** Observable behaviour that would strengthen it. */
  strengthens: string;
  /** Observable behaviour that would weaken/invalidate it. */
  weakens: string;
  /** Only levels genuinely present in key_prices. Empty when none stored. */
  levels: { label: string; value: number }[];
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Format a price for display without inventing precision. */
export function fmtLevel(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function normDirection(d: unknown): "bullish" | "bearish" | "unknown" {
  return d === "bullish" || d === "bearish" ? d : "unknown";
}

/** Collect only the levels that actually exist on the pattern object. */
function collectLevels(kp: PatternKeyPrices | undefined): { label: string; value: number }[] {
  if (!kp) return [];
  const out: { label: string; value: number }[] = [];
  if (isNum(kp.neckline)) out.push({ label: "neckline", value: kp.neckline });
  if (isNum(kp.support)) out.push({ label: "support", value: kp.support });
  if (isNum(kp.resistance)) out.push({ label: "resistance", value: kp.resistance });
  if (Array.isArray(kp.peaks)) {
    const peaks = kp.peaks.filter(isNum);
    if (peaks.length) out.push({ label: peaks.length > 1 ? "peaks" : "peak", value: Math.max(...peaks) });
  }
  if (Array.isArray(kp.troughs)) {
    const troughs = kp.troughs.filter(isNum);
    if (troughs.length) out.push({ label: troughs.length > 1 ? "troughs" : "trough", value: Math.min(...troughs) });
  }
  // `target` is a measured-move projection produced by the detector. It is a
  // pattern property, not a RON trade target, and is labelled as such.
  if (isNum(kp.target)) out.push({ label: "measured move", value: kp.target });
  return out;
}

/** Reference a stored level, or fall back to qualitative wording. */
function withLevel(kp: PatternKeyPrices | undefined, key: "neckline" | "support" | "resistance", withText: (v: string) => string, without: string): string {
  const v = kp?.[key];
  return isNum(v) ? withText(fmtLevel(v)) : without;
}

/**
 * Deterministic template per detected pattern. Unknown pattern names fall back
 * to a direction-only description rather than inventing structure semantics.
 */
export function explainPattern(p: SnapshotPattern): PatternExplanation {
  const direction = normDirection(p.direction);
  const name = (p.pattern_name || "Unnamed pattern").trim();
  const kp = p.key_prices;
  const title = direction === "unknown" ? name : `${name} ${direction}`;
  const levels = collectLevels(kp);
  const base = { title, direction, levels };

  switch (name) {
    case "Head & Shoulders":
      return {
        ...base,
        meaning: "A three-peak topping structure: buyers made a higher high, then failed to repeat it. It normally reads as a bearish reversal of the prior up-move.",
        strengthens: withLevel(kp, "neckline",
          v => `A decisive close below the detected neckline at ${v}, and price then failing to get back above it.`,
          "A decisive close below the structure low that joins the two shoulder troughs, and price failing to reclaim it."),
        weakens: withLevel(kp, "neckline",
          v => `Price holding above ${v} and pushing back toward the head, which removes the reversal premise.`,
          "Price holding the structure and pushing back toward the head high, which removes the reversal premise."),
      };
    case "Double Top":
      return {
        ...base,
        meaning: "Price was rejected twice from a similar high. Repeated rejection at one area normally reads as bearish supply.",
        strengthens: withLevel(kp, "neckline",
          v => `Losing the swing low between the two peaks at ${v} on a completed bar.`,
          "Losing the swing low between the two peaks on a completed bar."),
        weakens: withLevel(kp, "neckline",
          v => `Acceptance back above the twin-peak area while ${v} holds as support.`,
          "Acceptance back above the twin-peak area rather than rejection from it."),
      };
    case "Double Bottom":
      return {
        ...base,
        meaning: "Price found buyers twice at a similar low. Repeated defence of one area normally reads as bullish demand.",
        strengthens: withLevel(kp, "neckline",
          v => `Clearing the swing high between the two lows at ${v} and holding above it.`,
          "Clearing the swing high between the two lows and holding above it."),
        weakens: "A completed bar closing below the twin-low area, which turns the defended zone into supply.",
      };
    case "Support":
      return {
        ...base,
        meaning: "Buyers have repeatedly defended a detected price area beneath the market.",
        strengthens: withLevel(kp, "support",
          v => `Further rejections from ${v} — long lower wicks and closes back above it.`,
          "Further rejections from the area — long lower wicks and closes back above it."),
        weakens: withLevel(kp, "support",
          v => `A clean completed close below ${v}, which typically flips the area to resistance.`,
          "A clean completed close below the area, which typically flips it to resistance."),
      };
    case "Resistance":
      return {
        ...base,
        meaning: "Sellers have repeatedly capped a detected price area above the market.",
        strengthens: withLevel(kp, "resistance",
          v => `Further rejections from ${v} — upper wicks and closes back below it.`,
          "Further rejections from the area — upper wicks and closes back below it."),
        weakens: withLevel(kp, "resistance",
          v => `A clean completed close above ${v}, which typically flips the area to support.`,
          "A clean completed close above the area, which typically flips it to support."),
      };
    case "Ascending Triangle":
      return {
        ...base,
        meaning: "Higher lows are compressing price against a flat ceiling, which normally reads as bullish pressure building.",
        strengthens: withLevel(kp, "resistance",
          v => `A completed close above the flat ceiling at ${v} with follow-through.`,
          "A completed close above the flat ceiling with follow-through."),
        weakens: "Losing the rising sequence of higher lows, which removes the compression premise.",
      };
    case "Descending Triangle":
      return {
        ...base,
        meaning: "Lower highs are compressing price onto a flat floor, which normally reads as bearish pressure building.",
        strengthens: withLevel(kp, "support",
          v => `A completed close below the flat floor at ${v} with follow-through.`,
          "A completed close below the flat floor with follow-through."),
        weakens: "Breaking the falling sequence of lower highs, which removes the compression premise.",
      };
    case "Bull Flag":
      return {
        ...base,
        meaning: "A shallow pullback after a strong up-move — normally read as a continuation pause rather than a reversal.",
        strengthens: "Price resuming upward out of the pullback while the pullback lows hold.",
        weakens: "The pullback deepening past the origin of the up-move, which turns it into a reversal.",
      };
    case "Bear Flag":
      return {
        ...base,
        meaning: "A shallow bounce after a strong down-move — normally read as a continuation pause rather than a reversal.",
        strengthens: "Price resuming downward out of the bounce while the bounce highs cap it.",
        weakens: "The bounce extending past the origin of the down-move, which turns it into a reversal.",
      };
    default:
      return {
        ...base,
        meaning: direction === "unknown"
          ? "A chart structure was detected, but no direction was recorded with it."
          : `A ${direction} structure was detected. No specific interpretation template is defined for this pattern name.`,
        strengthens: "Continued price behaviour in the detected direction on completed bars.",
        weakens: "Price behaviour against the detected direction on completed bars.",
      };
  }
}

/**
 * One deterministic sentence describing agreement/conflict across the displayed
 * patterns. Derived only from detected directions.
 */
export function summariseStructure(patterns: SnapshotPattern[]): string | null {
  const dirs = patterns.map(p => normDirection(p.direction));
  const bull = dirs.filter(d => d === "bullish").length;
  const bear = dirs.filter(d => d === "bearish").length;
  if (bull === 0 && bear === 0) return null;
  if (bull > 0 && bear > 0) {
    return "Structure is mixed: bearish reversal patterns are being opposed by bullish support.";
  }
  if (bull > 1) return "Detected structures agree: all are bullish.";
  if (bear > 1) return "Detected structures agree: all are bearish.";
  return null;
}

/** Explanations for the same patterns the tile lists (max 3, in stored order). */
export function explainPatterns(patterns: SnapshotPattern[] | null | undefined, max = 3): PatternExplanation[] {
  if (!Array.isArray(patterns)) return [];
  return patterns.slice(0, max).map(explainPattern);
}
