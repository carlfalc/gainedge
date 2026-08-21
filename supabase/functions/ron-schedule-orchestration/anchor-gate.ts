/**
 * GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1 — pure completed-bar anchor gate.
 *
 * Deterministic, side-effect free. Decides whether a NEW safe completed XAUUSD 15m
 * evaluation anchor exists that has not already produced a stored RON decision.
 *
 * It never fabricates a bar, never interpolates, never widens scope beyond XAUUSD/15m,
 * never produces a probability, direction, score or execution instruction.
 */

export const RUNTIME_INSTRUMENT = "XAUUSD";
export const RUNTIME_TIMEFRAME = "15m";
export const RUNTIME_BAR_MS = 900_000;
/** Hard staleness ceiling: never orchestrate on a bar older than this (market gaps included). */
export const MAX_ANCHOR_AGE_MS = 6 * 60 * 60 * 1000;

export interface AnchorInputs {
  now_ms: number;
  /** Distinct XAUUSD 15m snapshot bar times (ISO), as stored by the RON snapshot path. */
  snapshot_bar_times: string[];
  /** Distinct XAUUSD 15m candle_history bar times (ISO) — the genuine provider source. */
  candle_bar_times: string[];
  /** Existing stored decision anchors (ISO) for XAUUSD 15m. */
  decision_anchors: string[];
  /** Bar times (ISO) carrying a blocking data-quality flag. */
  quarantined_bar_times: string[];
}

export type AnchorDecision =
  | { run: false; reason: string; anchor: null; bar_time?: string }
  | { run: true; reason: "new_completed_anchor"; anchor: string; bar_time: string };

const iso = (ms: number) => new Date(ms).toISOString();

function toMs(list: string[]): number[] {
  return list
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n));
}

/** Selects at most ONE anchor. Fails closed on every ambiguity. */
export function selectAnchor(input: AnchorInputs): AnchorDecision {
  const now = input.now_ms;
  if (!Number.isFinite(now)) return { run: false, reason: "invalid_now", anchor: null };

  const snaps = toMs(input.snapshot_bar_times);
  const candles = new Set(toMs(input.candle_bar_times));
  const decided = new Set(toMs(input.decision_anchors));
  const quarantined = new Set(toMs(input.quarantined_bar_times));

  if (snaps.length === 0) return { run: false, reason: "no_snapshot_source", anchor: null };

  // Only bars whose 15m interval has fully CLOSED are eligible. The forming bar can never
  // be selected.
  const closed = snaps
    .filter((t) => t % RUNTIME_BAR_MS === 0)
    .filter((t) => t + RUNTIME_BAR_MS <= now)
    .sort((a, b) => b - a);
  if (closed.length === 0) return { run: false, reason: "no_completed_bar", anchor: null };

  const candidate = closed[0];
  // The evaluation anchor is the bar's COMPLETED CLOSE instant (bar open + one interval).
  // Downstream orchestration contracts require every consumed completed-bar close to be
  // at or before the anchor, so a bar-open anchor would always be rejected as lookahead.
  const anchorMs = candidate + RUNTIME_BAR_MS;
  if (now - candidate > MAX_ANCHOR_AGE_MS) {
    return { run: false, reason: "stale_source", anchor: null };
  }
  if (!candles.has(candidate)) {
    return { run: false, reason: "missing_genuine_candle", anchor: null };
  }
  if (quarantined.has(candidate)) {
    return { run: false, reason: "quarantined_bar", anchor: null };
  }
  if (decided.has(anchorMs)) {
    return { run: false, reason: "already_decided", anchor: null };
  }
  return {
    run: true, reason: "new_completed_anchor", anchor: iso(anchorMs), bar_time: iso(candidate),
  };
}
