/**
 * GAINEDGE_DASHBOARD_UI — deterministic educational context for a news headline.
 *
 * Governance:
 * - Pure text derivation from the headline wording and the instruments the source
 *   already tagged. No probability, no forecast, no claim that the event caused
 *   anything. Every line is a general market-mechanics education statement, and it
 *   is labelled as such.
 */

export interface HeadlineContext {
  /** Whether the headline reads as an already-decided event or an expectation. */
  status: "announced" | "expected" | "unclear";
  statusLine: string;
  /** Plain-English education lines about what this class of event typically means. */
  lines: string[];
  /** Currencies the headline plausibly concerns, derived from wording + tags. */
  currencies: string[];
}

const BANK_CCY: [RegExp, string][] = [
  [/\bboj\b|bank of japan|japan(?:'s|ese)?\b|\byen\b/i, "JPY"],
  [/\bfed\b|federal reserve|fomc|\bu\.?s\.?\b|treasury|dollar/i, "USD"],
  [/\becb\b|european central bank|euro\b|eurozone/i, "EUR"],
  [/\bboe\b|bank of england|\buk\b|sterling|pound/i, "GBP"],
  [/\brba\b|reserve bank of australia|australia/i, "AUD"],
  [/\brbnz\b|new zealand/i, "NZD"],
  [/\bboc\b|bank of canada|canada/i, "CAD"],
  [/\bsnb\b|swiss|switzerland/i, "CHF"],
];

const UP = /\b(hike|hikes|raise|raises|raising|tighten|tightening|increase|higher rates)\b/i;
const DOWN = /\b(cut|cuts|cutting|ease|easing|lower|loosen|reduction)\b/i;
const EXPECTED = /\b(expect|expected|expects|forecast|likely|may|could|signals?|eyes|set to|ahead of|preview)\b/i;
const ANNOUNCED = /\b(announced|announces|decided|decides|held|holds|kept|keeps|raised|cut rates|delivered|votes?d)\b/i;
const RATES = /\b(rate|rates|policy|inflation|cpi|yield|yields|monetary)\b/i;

function currenciesFor(headline: string, instruments: string[]): string[] {
  const out = new Set<string>();
  for (const [re, ccy] of BANK_CCY) if (re.test(headline)) out.add(ccy);
  for (const sym of instruments) {
    const s = sym.toUpperCase();
    if (/^[A-Z]{6}$/.test(s)) { out.add(s.slice(0, 3)); out.add(s.slice(3)); }
  }
  return [...out];
}

/** Pairs from the tagged instruments where `ccy` is the base / the quote. */
function splitPairs(ccy: string, instruments: string[]) {
  const base: string[] = [];
  const quote: string[] = [];
  for (const sym of instruments) {
    const s = sym.toUpperCase();
    if (!/^[A-Z]{6}$/.test(s)) continue;
    if (s.slice(0, 3) === ccy) base.push(s);
    else if (s.slice(3) === ccy) quote.push(s);
  }
  return { base, quote };
}

export function buildHeadlineContext(headline: string, instruments: string[] = []): HeadlineContext {
  const tags = instruments.filter(Boolean).map((s) => s.toUpperCase());
  const currencies = currenciesFor(headline, tags);
  const isRates = RATES.test(headline);

  const status: HeadlineContext["status"] =
    ANNOUNCED.test(headline) && !EXPECTED.test(headline)
      ? "announced"
      : EXPECTED.test(headline)
        ? "expected"
        : "unclear";

  const statusLine =
    status === "announced"
      ? "Reported as already announced. The time below is when the source published it, on your local clock."
      : status === "expected"
        ? "This is an expectation, not a confirmed decision. If the decision is brought forward or lands differently, the reaction changes."
        : "The source wording does not make clear whether this is decided or expected.";

  const lines: string[] = [];

  const primary = currencies[0] ?? null;
  const dir = UP.test(headline) ? "up" : DOWN.test(headline) ? "down" : null;
  const strengthens = dir === "up";

  if (isRates && primary && dir) {
    lines.push(
      `Education: higher policy rates usually attract capital into a currency, lower rates usually push it away. If ${primary} rates go ${dir}, ${primary} typically ${strengthens ? "strengthens" : "weakens"}.`,
    );
  } else if (isRates && primary) {
    lines.push(
      `Education: this is a ${primary} policy/inflation story. Firmer-than-expected outcomes usually support ${primary}; softer-than-expected outcomes usually weigh on it.`,
    );
  }

  // Explicit effect line for every instrument the source tagged.
  const effects = tags
    .map((sym) => effectLine(sym, primary, isRates && dir ? strengthens : null))
    .filter((l): l is string => Boolean(l));
  if (effects.length) {
    lines.push("Likely effect on the tagged instruments:");
    lines.push(...effects);
  } else if (tags.length) {
    lines.push(
      `Education: the source tagged ${tags.slice(0, 4).join(", ")}. Relevance is adjacency only — it is not evidence that this headline moved those markets.`,
    );
  }

  lines.push("Adjacency is not causality. RON does not attribute price moves to headlines.");


  return { status, statusLine, lines, currencies };
}
