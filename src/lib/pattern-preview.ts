/**
 * GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — pure helpers for the educational
 * "Show pattern" preview.
 *
 * TRUTHFULNESS CONTRACT
 *  - The preview reproduces the EXACT candle eligibility contract the RON detector ran
 *    on (`supabase/functions/_shared/ron-quality-contract.ts` +
 *    `ron-window.ts`): quarantined (critical, quality_version 5) bars are removed FIRST,
 *    then the last N eligible bars ending at the snapshot's `bar_time` are taken. Only
 *    then can a stored `start_index` / `end_index` be mapped to a candle.
 *  - Only completed historical candles at or before the snapshot anchor are shown. No
 *    post-anchor / future candle is ever loaded or drawn.
 *  - Only geometry the detector actually STORED is drawn. Peak / trough / neckline
 *    arrays carry prices but no per-point candle index, so they are drawn as horizontal
 *    reference levels and explicitly labelled as such — never as invented pivot anchors.
 *  - No numeric confidence, probability, score or BUY/SELL recommendation is produced.
 */
import { xauVenueOpen } from "@/lib/ron-sessions";

/**
 * Detector pattern-input window: `computeRonSnapshot` calls
 * `detectPatterns(candles.slice(Math.max(0, i - 149)))`, so stored indices are relative
 * to the LAST 150 quality-eligible bars ending at (and including) the snapshot bar.
 */
export const PATTERN_PREVIEW_WINDOW_BARS = 150;

/** Quality version whose CRITICAL flags quarantine a source bar. Mirrors RON_QUALITY_VERSION. */
export const PATTERN_PREVIEW_QUALITY_VERSION = 5;

/** Raw `candle_history` row shape used by the preview reader. */
export interface PreviewCandleRow {
  timestamp: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string | null;
  created_at?: string | null;
}

export interface PreviewCandle {
  /** bar OPEN, epoch ms */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  /** candle_history.created_at, epoch ms */
  createdAt: number | null;
}

export function toPreviewCandles(rows: PreviewCandleRow[]): PreviewCandle[] {
  return rows
    .map((r) => ({
      time: new Date(r.timestamp).getTime(),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume == null ? null : Number(r.volume),
      createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
    }))
    .filter((c) => Number.isFinite(c.time))
    .sort((a, b) => a.time - b.time);
}

/**
 * Source-derivable CRITICAL rules for one bar — byte-for-byte the same two rules the
 * backend contract recomputes (`venue_break_bar`, `premature_bar_persisted`).
 */
export function previewCriticalRules(bar: PreviewCandle, barMinutes: number): string[] {
  const rules: string[] = [];
  if (!xauVenueOpen(new Date(bar.time))) rules.push("venue_break_bar");
  const closeMs = bar.time + barMinutes * 60_000;
  if (bar.createdAt != null && Number.isFinite(bar.createdAt) && bar.createdAt < closeMs) {
    rules.push("premature_bar_persisted");
  }
  return rules;
}

/**
 * Eligibility = NOT persisted-critical AND NOT source-derivable-critical.
 * `persistedCritical` holds ISO bar_times from `ron_data_quality_flags`
 * (severity `critical`, quality_version 5).
 */
export function isPreviewQuarantined(
  bar: PreviewCandle,
  barMinutes: number,
  persistedCritical: Set<string>,
): boolean {
  return (
    persistedCritical.has(new Date(bar.time).toISOString()) ||
    previewCriticalRules(bar, barMinutes).length > 0
  );
}

export function filterEligibleCandles(
  candles: PreviewCandle[],
  barMinutes: number,
  persistedCritical: Set<string>,
): { eligible: PreviewCandle[]; excluded: number } {
  const eligible: PreviewCandle[] = [];
  let excluded = 0;
  for (const c of candles) {
    if (isPreviewQuarantined(c, barMinutes, persistedCritical)) { excluded++; continue; }
    eligible.push(c);
  }
  return { eligible, excluded };
}

export interface PatternWindow {
  /** Exactly the bars the detector indexed, ascending. Index 0 == detector index 0. */
  candles: PreviewCandle[];
  /** Quarantined bars removed at or before the anchor. */
  excluded: number;
  /** True only when the anchor bar is the last eligible bar AND the window is full. */
  aligned: boolean;
  /** Machine reason when `aligned` is false. */
  reason:
    | "aligned"
    | "anchor_not_eligible"
    | "anchor_not_last"
    | "insufficient_history";
}

/**
 * Rebuilds the EXACT detector input window.
 *
 * Steps mirror the backend contract in order: (1) bars at or before the anchor,
 * (2) remove every quarantined bar, (3) require the anchor to be the last eligible bar,
 * (4) take the last `windowBars` eligible bars.
 */
export function buildPatternWindow(
  candles: PreviewCandle[],
  anchorMs: number,
  barMinutes: number,
  persistedCritical: Set<string>,
  windowBars: number = PATTERN_PREVIEW_WINDOW_BARS,
): PatternWindow {
  const upTo = candles.filter((c) => c.time <= anchorMs);
  const { eligible, excluded } = filterEligibleCandles(upTo, barMinutes, persistedCritical);
  const last = eligible[eligible.length - 1];
  if (!last) return { candles: [], excluded, aligned: false, reason: "anchor_not_eligible" };
  if (last.time !== anchorMs) {
    const anchorPresent = upTo.some((c) => c.time === anchorMs);
    return {
      candles: [], excluded, aligned: false,
      reason: anchorPresent ? "anchor_not_eligible" : "anchor_not_last",
    };
  }
  const slice = eligible.slice(Math.max(0, eligible.length - windowBars));
  if (slice.length < windowBars) {
    return { candles: slice, excluded, aligned: false, reason: "insufficient_history" };
  }
  return { candles: slice, excluded, aligned: true, reason: "aligned" };
}

/* ------------------------------------------------------------------ *
 * Stored geometry extraction
 * ------------------------------------------------------------------ */

export interface StoredLine {
  /** "Upper boundary" / "Lower boundary" */
  label: string;
  /** epoch SECONDS, exactly as stored by the detector */
  start: { time: number; price: number };
  end: { time: number; price: number };
}

export interface ReferenceLevel {
  label: string;
  price: number;
}

export interface PatternGeometry {
  name: string;
  direction: string | null;
  startIndex: number | null;
  endIndex: number | null;
  /** Bars covered by the detection span, inclusive. Null when indices are missing. */
  spanBars: number | null;
  /** Lines whose exact time+price coordinates are stored by the detector. */
  lines: StoredLine[];
  /** Price-only levels: no candle position is stored for these. */
  levels: ReferenceLevel[];
  /** True when at least one exactly-coordinated line is stored. */
  hasExactGeometry: boolean;
  /** True when price-only pivot data (peaks / troughs / neckline) is present. */
  hasPriceOnlyPivots: boolean;
}

const NUM = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function readLine(raw: unknown, label: string): StoredLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, any>;
  const st = l.start, en = l.end;
  if (!st || !en || typeof st !== "object" || typeof en !== "object") return null;
  const sT = NUM(st.time), sP = NUM(st.price), eT = NUM(en.time), eP = NUM(en.price);
  if (sT == null || sP == null || eT == null || eP == null) return null;
  return { label, start: { time: sT, price: sP }, end: { time: eT, price: eP } };
}

/** Reads ONLY fields the active detector actually writes into `key_prices`. */
export function extractPatternGeometry(pattern: unknown): PatternGeometry {
  const p = (pattern ?? {}) as Record<string, any>;
  const kp = (p.key_prices ?? {}) as Record<string, any>;
  const name = typeof p.pattern_name === "string" ? p.pattern_name : "Pattern";
  const direction = typeof p.direction === "string" && p.direction.trim() ? p.direction : null;
  const startIndex = NUM(p.start_index);
  const endIndex = NUM(p.end_index);

  const lines: StoredLine[] = [];
  const upper = readLine(kp.upper_line, "Upper boundary");
  if (upper) lines.push(upper);
  const lower = readLine(kp.lower_line, "Lower boundary");
  if (lower) lines.push(lower);

  const levels: ReferenceLevel[] = [];
  const push = (label: string, v: unknown) => {
    const n = NUM(v);
    if (n != null) levels.push({ label, price: n });
  };
  push("Neckline", kp.neckline);
  push("Resistance", kp.resistance);
  push("Support", kp.support);
  push("Measured move", kp.target);
  const peaks = Array.isArray(kp.peaks) ? kp.peaks : [];
  peaks.forEach((v: unknown, i: number) => push(`Peak ${i + 1}`, v));
  const troughs = Array.isArray(kp.troughs) ? kp.troughs : [];
  troughs.forEach((v: unknown, i: number) => push(`Trough ${i + 1}`, v));

  const hasPriceOnlyPivots =
    peaks.length > 0 || troughs.length > 0 || NUM(kp.neckline) != null;

  return {
    name,
    direction,
    startIndex: startIndex == null ? null : Math.floor(startIndex),
    endIndex: endIndex == null ? null : Math.floor(endIndex),
    spanBars:
      startIndex == null || endIndex == null ? null : Math.floor(endIndex) - Math.floor(startIndex) + 1,
    lines,
    levels,
    hasExactGeometry: lines.length > 0,
    hasPriceOnlyPivots,
  };
}

/** Shown whenever price-only pivot data is rendered. */
export const PRICE_ONLY_GEOMETRY_NOTE =
  "The detector stores the prices of these pivots but not their exact candle positions, so they are drawn as horizontal reference levels across the detected span — not as pinpointed pivot candles.";

/** Shown when the detector stored real time+price line coordinates. */
export const EXACT_GEOMETRY_NOTE =
  "Boundary lines are drawn from the exact time and price coordinates stored by the detector.";

export const PREVIEW_WINDOW_NOTE =
  "Historical completed candles only, rebuilt from the same quality-eligible window RON scanned. No candle after the evaluated bar is shown.";

export const PREVIEW_EDUCATIONAL_NOTE =
  "Educational context only. This is not a signal, a forecast, or a buy/sell recommendation.";

/* ------------------------------------------------------------------ *
 * Deterministic educational glossary
 * ------------------------------------------------------------------ */

export interface PatternGlossaryEntry {
  /** What the shape is. */
  what: string;
  /** What traders conventionally read from it — neutral, no prediction. */
  reading: string;
  /** What the detector measured, in plain words. */
  measured: string;
}

/**
 * Neutral teaching copy for EVERY named chart pattern the active detector
 * (`supabase/functions/_shared/ron-patterns.ts`) can emit. Support and Resistance are
 * structural level context, not named chart patterns, and are deliberately absent.
 */
export const PATTERN_GLOSSARY: Record<string, PatternGlossaryEntry> = {
  "double top": {
    what: "Two swing highs formed at a similar price, separated by a pullback low. The pullback low is the neckline.",
    reading: "Buyers twice failed to push through the same area. Traders watch whether price holds above the neckline or closes below it.",
    measured: "The detector stored the two peak prices, the neckline price, and a measured move projected the height of the pattern below the neckline.",
  },
  "double bottom": {
    what: "Two swing lows formed at a similar price, separated by a rally high. The rally high is the neckline.",
    reading: "Sellers twice failed to push through the same area. Traders watch whether price stays below the neckline or closes above it.",
    measured: "The detector stored the two trough prices, the neckline price, and a measured move projected the height of the pattern above the neckline.",
  },
  "head & shoulders": {
    what: "Three swing highs where the middle high (the head) is above the two outer highs (the shoulders), with a neckline drawn under the pattern.",
    reading: "The failure of the second shoulder to reach the head is read as weakening upside momentum. The neckline is the level traders watch.",
    measured: "The detector stored the three peak prices, the neckline price, and a measured move equal to the head-to-neckline distance projected below the neckline.",
  },
  "ascending triangle": {
    what: "A roughly flat upper boundary with rising lows beneath it, compressing price into the corner.",
    reading: "Lows rising into a fixed ceiling is read as buyers absorbing supply at one level. Traders watch which boundary gives way first.",
    measured: "The detector stored the flat resistance line and the rising support line with real time and price coordinates, plus a measured move equal to the triangle height added to the resistance.",
  },
  "descending triangle": {
    what: "A roughly flat lower boundary with falling highs above it, compressing price into the corner.",
    reading: "Highs falling into a fixed floor is read as sellers repeatedly capping rallies. Traders watch which boundary gives way first.",
    measured: "The detector stored the falling resistance line and the flat support line with real time and price coordinates, plus a measured move equal to the triangle height subtracted from the support.",
  },
  "bull flag": {
    what: "A sharp upward move (the pole) followed by a shallow drift lower or sideways (the flag).",
    reading: "A shallow pullback after a strong advance is read as consolidation rather than reversal. Traders watch the flag boundaries.",
    measured: "The detector stored the flag's upper and lower boundaries with real time and price coordinates, plus a measured move equal to the pole length added to the end of the flag.",
  },
  "bear flag": {
    what: "A sharp downward move (the pole) followed by a shallow drift higher or sideways (the flag).",
    reading: "A shallow bounce after a strong decline is read as consolidation rather than reversal. Traders watch the flag boundaries.",
    measured: "The detector stored the flag's upper and lower boundaries with real time and price coordinates, plus a measured move equal to the pole length subtracted from the end of the flag.",
  },
};

/** Case/spacing-insensitive glossary lookup. Returns null for unknown names. */
export function patternGlossary(name: string | null | undefined): PatternGlossaryEntry | null {
  const key = String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return PATTERN_GLOSSARY[key] ?? null;
}
