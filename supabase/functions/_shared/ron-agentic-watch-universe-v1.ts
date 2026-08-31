/**
 * GAINEDGE_RON_AGENTIC_WATCH_V1 — selected market universe.
 *
 * This is the forward runtime source of truth for markets that receive continuous RON
 * agentic observation. "Continuous" means every eligible completed 15m broker bar while
 * the instrument venue is genuinely open. Session labels are context/research dimensions
 * only and MUST NOT gate evaluation.
 */
export const RON_AGENTIC_WATCH_VERSION = 1;

export const RON_SELECTED_WATCH_INSTRUMENTS = [
  "XAUUSD",
  "NAS100",
  "NZDUSD",
  "USDCAD",
  "HK50",
  "GER40",
] as const;

export type RonSelectedWatchInstrument = typeof RON_SELECTED_WATCH_INSTRUMENTS[number];

/** Oil remains ingested/data-ready but is not yet in the specialist watch set. */
export const RON_DATA_INSTRUMENTS_V2 = [
  ...RON_SELECTED_WATCH_INSTRUMENTS,
  "USOUSD",
  "UKOUSD",
] as const;

export function isSelectedRonWatchInstrument(value: string): value is RonSelectedWatchInstrument {
  return (RON_SELECTED_WATCH_INSTRUMENTS as readonly string[]).includes(value);
}

export function ronAgenticWatchPayload() {
  return [
    "ron_agentic_watch_version", RON_AGENTIC_WATCH_VERSION,
    "selected_instruments", [...RON_SELECTED_WATCH_INSTRUMENTS],
    "timeframe", "15m",
    "evaluate_every_eligible_completed_bar", true,
    "session_labels_are_context_only", true,
    "london_or_new_york_gate", false,
    "execution_allowed", false,
  ];
}
