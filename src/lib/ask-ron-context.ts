/**
 * GAINEDGE_PRODUCT_ASK_RON_CONTEXT_PAIR_V1 — pure helpers carrying an exact
 * stored-record {instrument,timeframe} pair to the existing Ask RON page.
 * No mapping, no aliasing, no fallback, no market claim: strings only.
 */
export interface AskRonContextPair {
  instrument: string;
  timeframe: string;
}

/** Mirrors the backend's safe request contract without introducing mapping. */
const MAX_LEN = 16;

/** Builds exactly `/dashboard/ai?instrument=...&timeframe=...`. */
export function askRonContextHref(instrument: string, timeframe: string): string {
  return `/dashboard/ai?instrument=${encodeURIComponent(instrument)}&timeframe=${encodeURIComponent(timeframe)}`;
}

/** Truthful, non-predictive label for the deep-link control. */
export function askRonContextTitle(instrument: string, timeframe: string): string {
  return `Ask RON about the stored ${instrument} ${timeframe} decision record`;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;
  return trimmed;
}

/**
 * Returns the exact pair only when BOTH params are present and valid.
 * Partial, empty or over-long values yield null — never a synthesized pair.
 */
export function parseAskRonContext(
  params: { get(key: string): string | null } | null | undefined,
): AskRonContextPair | null {
  if (!params) return null;
  const instrument = clean(params.get("instrument"));
  const timeframe = clean(params.get("timeframe"));
  if (!instrument || !timeframe) return null;
  return { instrument, timeframe };
}

/** Truthful indicator text for a valid stored-context pair. */
export function askRonContextLabel(pair: AskRonContextPair): string {
  return `Stored RON context: ${pair.instrument} ${pair.timeframe}`;
}
