/**
 * GAINEDGE_DASHBOARD_UI_V1 — pure presentation helpers that translate an already
 * stored RON snapshot feature object into analyst-style language and compact chips.
 *
 * Truthfulness rules baked in here:
 * - Nothing is invented. Every sentence fragment is derived from a field that is
 *   actually present on the snapshot; absent fields are simply omitted.
 * - No probability, confidence, entry, stop, target or recommendation is produced.
 * - The wording is contextual/educational, never predictive.
 */

export type ChipTone = "up" | "down" | "neutral" | "unknown";

export interface RonEvidenceChip {
  label: string;
  value: string;
  tone: ChipTone;
  /** Longer hover text; never a claim beyond the stored value. */
  title: string;
}

type Features = Record<string, unknown> | null | undefined;

const numOf = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const strOf = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

/** Human phrase for the stored `regime` token. Unknown tokens pass through verbatim. */
export function regimePhrase(regime: string | null): string | null {
  if (!regime) return null;
  switch (regime) {
    case "trending_up": return "Up-trending regime";
    case "trending_down": return "Down-trending regime";
    case "transition": return "Transition regime";
    case "ranging": return "Ranging regime";
    default: return `${regime.replace(/_/g, " ")} regime`;
  }
}

/** Human phrase for the stored `macd_state` token. */
export function momentumPhrase(macd: string | null): string | null {
  if (!macd) return null;
  const bullish = macd.startsWith("bullish");
  const bearish = macd.startsWith("bearish");
  const expanding = macd.includes("expand");
  const fading = macd.includes("fad") || macd.includes("contract") || macd.includes("weak");
  if (!bullish && !bearish) return `MACD is ${macd.replace(/_/g, " ")}`;
  const dir = bullish ? "Bullish" : "Bearish";
  if (expanding) return `${dir} momentum is expanding`;
  if (fading) return `${dir} momentum is fading`;
  return `${dir} momentum is present`;
}

/** Human phrase for stored ADX. */
export function trendStrengthPhrase(adx: number | null): string | null {
  if (adx == null) return null;
  if (adx < 20) return "trend strength remains weak";
  if (adx < 25) return "trend strength is waking up but unconfirmed";
  if (adx < 40) return "trend strength is confirmed";
  return "trend strength is very strong";
}

/**
 * One concise analyst-style sentence built only from present fields.
 * Returns null when there is no snapshot at all — callers must then show the
 * calm "RON data building" state rather than any assessment.
 */
export function ronSummarySentence(features: Features): string | null {
  if (!features) return null;
  const regime = regimePhrase(strOf(features.regime));
  const momentum = momentumPhrase(strOf(features.macd_state));
  const strength = trendStrengthPhrase(numOf(features.adx14));

  const parts: string[] = [];
  if (regime) parts.push(`${regime}.`);
  if (momentum && strength) parts.push(`${momentum}, but ${strength}.`);
  else if (momentum) parts.push(`${momentum}.`);
  else if (strength) parts.push(`${strength.charAt(0).toUpperCase()}${strength.slice(1)}.`);

  if (parts.length === 0) return "Stored snapshot has no readable regime or momentum fields.";
  parts.push("No qualified opportunity is available.");
  return parts.join(" ");
}

/** Compact evidence chips for the at-a-glance card. Missing fields are dropped. */
export function ronEvidenceChips(features: Features): RonEvidenceChip[] {
  if (!features) return [];
  const chips: RonEvidenceChip[] = [];

  const adx = numOf(features.adx14);
  if (adx != null) {
    chips.push({
      label: "ADX",
      value: adx.toFixed(1),
      tone: adx >= 25 ? "up" : "neutral",
      title: `ADX ${adx.toFixed(1)} — ${adx >= 25 ? "trend strength confirmed" : "trend strength weak"} on the stored completed bar`,
    });
  }

  const rsi = numOf(features.rsi14);
  if (rsi != null) {
    chips.push({
      label: "RSI",
      value: rsi.toFixed(1),
      tone: rsi > 70 ? "down" : rsi < 30 ? "up" : "neutral",
      title: `RSI ${rsi.toFixed(1)} on the stored completed bar`,
    });
  }

  const macd = strOf(features.macd_state);
  if (macd) {
    chips.push({
      label: "MACD",
      value: macd.replace(/_/g, " "),
      tone: macd.startsWith("bullish") ? "up" : macd.startsWith("bearish") ? "down" : "neutral",
      title: `Stored MACD state: ${macd}`,
    });
  }

  const stack = strOf(features.ema_stack);
  if (stack) {
    chips.push({
      label: "EMA",
      value: stack,
      tone: stack === "up" ? "up" : stack === "down" ? "down" : "neutral",
      title: `Stored EMA stack: ${stack}`,
    });
  }

  const stoch = numOf(features.stoch_rsi);
  if (stoch != null) {
    chips.push({
      label: "StochRSI",
      value: stoch.toFixed(1),
      tone: "neutral",
      title: `Stochastic RSI ${stoch.toFixed(1)} on the stored completed bar`,
    });
  }

  const atr = numOf(features.atr_pct);
  if (atr != null) {
    chips.push({
      label: "ATR%",
      value: atr.toFixed(3),
      tone: "neutral",
      title: `ATR percentage ${atr.toFixed(3)} on the stored completed bar`,
    });
  }

  return chips;
}

/**
 * Single calm empty state replacing the repeated warning lines. `available`
 * lists what genuinely exists; `unavailable` lists what does not.
 */
export interface RonEmptyState {
  headline: string;
  available: string[];
  unavailable: string[];
  note: string;
}

export function ronEmptyState(opts: {
  hasQuote: boolean;
  hasSignalHistory: boolean;
  symbol: string;
}): RonEmptyState {
  const available: string[] = [];
  const unavailable: string[] = [];
  if (opts.hasQuote) available.push("live broker quote");
  else unavailable.push("live broker quote");
  if (opts.hasSignalHistory) available.push("Falconer signal history");
  else unavailable.push("Falconer signal history");
  unavailable.push("RON snapshot", "indicator evidence", "pattern context");
  return {
    headline: "RON data building",
    available,
    unavailable,
    note: `No stored RON snapshot for ${opts.symbol} yet — this is not a current assessment.`,
  };
}
