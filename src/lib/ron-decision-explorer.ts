/**
 * GAINEDGE_PRODUCT_RON_DECISION_EXPLORER_V1 — pure selection helpers for the
 * read-only RON decision explorer. It makes no market claim and orders nothing:
 * this file only decides WHICH stored record the user is looking at.
 */
export interface TrackedPair {
  symbol: string;
  timeframe: string;
}

/** Historical safe fallback preserved from the original hard-coded surface. */
export const FALLBACK_PAIR: TrackedPair = { symbol: "XAUUSD", timeframe: "15m" };

export function pairKey(p: TrackedPair): string {
  return `${p.symbol}|${p.timeframe}`;
}

export function pairLabel(p: TrackedPair): string {
  return `${p.symbol} · ${p.timeframe}`;
}

/** Normalises raw rows and removes exact symbol+timeframe duplicates (display only). */
export function normaliseTracked(rows: { symbol?: string | null; timeframe?: string | null }[]): TrackedPair[] {
  const seen = new Set<string>();
  const out: TrackedPair[] = [];
  for (const r of rows ?? []) {
    const symbol = (r?.symbol ?? "").trim();
    if (!symbol) continue;
    const timeframe = (r?.timeframe ?? "").trim() || FALLBACK_PAIR.timeframe;
    const pair = { symbol, timeframe };
    const key = pairKey(pair);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

/**
 * Resolves the pair to display. Query params win only when they exactly match a
 * tracked row; otherwise tracked XAUUSD 15m, then the first tracked row, then the
 * historical safe fallback. Nothing is ever invented as "tracked".
 */
export function resolveSelection(
  tracked: TrackedPair[],
  requested: { instrument?: string | null; timeframe?: string | null } = {},
): TrackedPair {
  const symbol = (requested.instrument ?? "").trim();
  const timeframe = (requested.timeframe ?? "").trim();
  if (symbol && timeframe) {
    const match = tracked.find((p) => p.symbol === symbol && p.timeframe === timeframe);
    if (match) return match;
  }
  const gold = tracked.find(
    (p) => p.symbol === FALLBACK_PAIR.symbol && p.timeframe === FALLBACK_PAIR.timeframe,
  );
  if (gold) return gold;
  return tracked[0] ?? FALLBACK_PAIR;
}
/**
 * GAINEDGE_PRODUCT_RON_CONTEXT_LINKS_V1 — builds the read-only deep link to the
 * stored RON decision record for an exact tracked symbol+timeframe. It performs
 * no computation, no network call and no market claim: it is a URL only.
 */
export function ronDecisionRecordHref(symbol: string, timeframe: string): string {
  return `/dashboard/ron-decision?instrument=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;
}

/** Truthful, non-predictive label for the deep-link control. */
export function ronDecisionRecordTitle(symbol: string, timeframe: string): string {
  return `Open stored RON decision record for ${symbol} ${timeframe}`;
}
