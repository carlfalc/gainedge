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


/** Home currency of a tagged index / commodity symbol, for rate transmission. */
const INDEX_HOME: Record<string, string> = {
  NAS100: "USD", US30: "USD", SPX500: "USD", US500: "USD", US100: "USD",
  GER40: "EUR", GER30: "EUR", EU50: "EUR",
  UK100: "GBP", JP225: "JPY", AUS200: "AUD", HK50: "HKD", CHINA50: "CNH",
};

/**
 * Deterministic, mechanics-only statement of how this class of event typically
 * transmits into one tagged instrument. `strengthens` is null when the headline
 * gives no rate direction — then both directions are stated.
 */
function effectLine(sym: string, primary: string | null, strengthens: boolean | null): string | null {
  const s = sym.toUpperCase();

  // Metals quoted in USD.
  if (s === "XAUUSD" || s === "XAGUSD") {
    const name = s === "XAUUSD" ? "Gold" : "Silver";
    if (primary === "USD" && strengthens !== null) {
      return strengthens
        ? `${s} — ${name} is priced in USD and pays no yield, so higher USD rates and a firmer USD are usually an adverse backdrop: prices tend to fall.`
        : `${s} — ${name} is priced in USD and pays no yield, so lower USD rates and a softer USD are usually a supportive backdrop: prices tend to rise.`;
    }
    if (primary && primary !== "USD" && strengthens !== null) {
      return `${s} — ${name} is a USD-priced haven. A ${strengthens ? "stronger" : "weaker"} ${primary} mainly matters here through USD: if it drags the USD ${strengthens ? "lower" : "higher"}, ${s} tends to ${strengthens ? "rise" : "fall"}.`;
    }
    return `${s} — ${name} is USD-priced and yield-free: firmer USD rates usually weigh on it, softer USD rates usually support it.`;
  }

  // FX pairs.
  if (/^[A-Z]{6}$/.test(s)) {
    const base = s.slice(0, 3);
    const quote = s.slice(3);
    if (!primary || (primary !== base && primary !== quote)) {
      return `${s} — neither leg is the currency in this headline, so any effect is second-hand via broad risk appetite and the USD.`;
    }
    const isBase = primary === base;
    if (strengthens === null) {
      return `${s} — ${primary} is the ${isBase ? "base" : "quote"}: if ${primary} strengthens this pair tends to ${isBase ? "rise" : "fall"}, if ${primary} weakens it tends to ${isBase ? "fall" : "rise"}.`;
    }
    const up = isBase ? strengthens : !strengthens;
    return `${s} — ${primary} is the ${isBase ? "base" : "quote"}, so a ${strengthens ? "stronger" : "weaker"} ${primary} typically pushes this pair ${up ? "up (adverse for shorts)" : "down (adverse for longs)"}.`;
  }

  // Equity indices.
  const home = INDEX_HOME[s];
  if (home) {
    if (strengthens === null) {
      return `${s} — an equity index priced in ${home}: higher rates raise discount rates and usually weigh on it, lower rates usually support it.`;
    }
    if (home === primary) {
      return strengthens
        ? `${s} — higher ${home} rates raise borrowing and discount rates for its constituents, usually an adverse backdrop: the index tends to fall.`
        : `${s} — lower ${home} rates ease borrowing and discount rates for its constituents, usually a supportive backdrop: the index tends to rise.`;
    }
    return strengthens
      ? `${s} — priced in ${home}. Tighter ${primary} policy usually tightens global financial conditions and risk appetite, a mildly adverse backdrop.`
      : `${s} — priced in ${home}. Easier ${primary} policy usually loosens global financial conditions and risk appetite, a mildly supportive backdrop.`;
  }

  return `${s} — tagged by the source; no standard rate-transmission channel applies, so treat it as adjacency only.`;
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
