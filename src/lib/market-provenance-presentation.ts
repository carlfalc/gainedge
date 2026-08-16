/**
 * Pure presentation helpers for price provenance and calibration scope.
 *
 * Truthfulness rules encoded here:
 *  - A live broker quote and a completed candle close are DIFFERENT values with
 *    different instants. This module never converts one into the other.
 *  - Freshness reuses the EXISTING `QUOTE_FRESH_MS` policy from
 *    `@/services/live-quotes`. No new threshold is introduced.
 *  - Missing/invalid instants are reported as unknown, never as live.
 *  - Accepted calibration evidence exists for XAUUSD 15m ONLY and is never
 *    transferred to another instrument or timeframe. No percentage, confidence,
 *    edge or expected-performance language is ever produced.
 */
import { QUOTE_FRESH_MS } from "@/services/live-quotes";

export type PriceSourceKind = "live_quote" | "completed_bar";
export type ProvenanceState = "fresh" | "stale" | "unknown";

export interface PriceProvenance {
  /** "unknown" whenever the instant is missing or unparseable. */
  kind: PriceSourceKind | "unknown";
  state: ProvenanceState;
  /** Primary compact label, e.g. "Live quote · updated 8s ago". */
  label: string;
  /** Secondary explanatory line. */
  detail: string;
}

export interface PriceProvenanceInput {
  kind: PriceSourceKind;
  /** Broker/server instant for the value being displayed. */
  timestamp: string | number | Date | null | undefined;
  /** Required only for completed-bar labelling. */
  timeframe?: string | null;
  /** Injectable clock for deterministic tests. */
  now?: number;
}

const UNKNOWN: PriceProvenance = {
  kind: "unknown",
  state: "unknown",
  label: "Price source unavailable",
  detail: "Freshness unknown",
};

function toMillis(ts: PriceProvenanceInput["timestamp"]): number | null {
  if (ts === null || ts === undefined || ts === "") return null;
  const ms = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Deterministic coarse age, e.g. "8s", "2m", "3h", "4d". */
export function formatAgeShort(ageMs: number): string {
  const ms = Math.max(0, Math.floor(ageMs));
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Normalised timeframe token for display, e.g. "15M" -> "15m". */
export function normaliseTimeframe(tf: string | null | undefined): string | null {
  if (!tf) return null;
  const t = String(tf).trim().toLowerCase();
  if (!t) return null;
  return /^\d+$/.test(t) ? `${t}m` : t;
}

export function presentPriceProvenance(input: PriceProvenanceInput): PriceProvenance {
  const at = toMillis(input.timestamp);
  if (at === null) return UNKNOWN;
  const now = input.now ?? Date.now();
  const age = now - at;
  const ageText = formatAgeShort(age);

  if (input.kind === "completed_bar") {
    const tf = normaliseTimeframe(input.timeframe);
    return {
      kind: "completed_bar",
      state: "fresh",
      label: tf ? `Completed ${tf} bar` : "Completed bar",
      detail: `Closed bar value · ${ageText} old · not a live quote`,
    };
  }

  if (age < QUOTE_FRESH_MS) {
    return {
      kind: "live_quote",
      state: "fresh",
      label: `Live quote · updated ${ageText} ago`,
      detail: "Broker quote inside the current freshness window",
    };
  }
  return {
    kind: "live_quote",
    state: "stale",
    label: `Live quote stale · ${ageText} old`,
    detail: "Last broker quote is outside the freshness window",
  };
}

export interface CalibrationScope {
  /** True only for the exact accepted XAUUSD 15m evidence scope. */
  inScope: boolean;
  label: string;
  secondary: string;
}

const CALIBRATED_SYMBOL = "XAUUSD";
const CALIBRATED_TIMEFRAME = "15m";

export function presentCalibrationScope(
  symbol: string | null | undefined,
  timeframe: string | null | undefined,
): CalibrationScope {
  const sym = (symbol ?? "").trim().toUpperCase();
  const tf = normaliseTimeframe(timeframe);
  if (!sym || !tf) {
    // Scope depends on BOTH instrument and timeframe. With either missing we
    // cannot classify anything, and must never assume the XAUUSD 15m scope.
    return {
      inScope: false,
      label: "Calibration scope unavailable",
      secondary: "Instrument or timeframe not specified",
    };
  }
  if (sym === CALIBRATED_SYMBOL && tf === CALIBRATED_TIMEFRAME) {
    return {
      inScope: true,
      label: "Calibration evidence: XAUUSD 15m",
      secondary: "Probability not calibrated for production",
    };
  }
  return {
    inScope: false,
    label: "Calibration: not established for this instrument/timeframe",
    secondary: "Context only · no probability",
  };
}
