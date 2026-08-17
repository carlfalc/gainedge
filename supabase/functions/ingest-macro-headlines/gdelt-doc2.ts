/**
 * GAINEDGE_GDELT_RAW_HEADLINES_V1 — deterministic, dependency-free GDELT DOC 2.0
 * request construction and row normalization.
 *
 * SOURCE FACTS ONLY. This module never infers instruments, sentiment, direction,
 * impact, importance, causality or probability, and never substitutes wall-clock
 * time for a missing/unparseable source timestamp.
 */

/** Official GDELT DOC 2.0 API endpoint (no API key required). */
export const GDELT_DOC2_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

export const GDELT_PROVIDER = "gdelt_doc2";
export const GDELT_MODE = "artlist";
export const GDELT_FORMAT = "json";
export const GDELT_SORT = "datedesc";
export const GDELT_TIMESPAN = "15min";
/** Bounded per-bucket cap. */
export const GDELT_MAX_RECORDS = 100;

export type QueryBucket =
  | "geopolitics_conflict"
  | "central_banks_macro"
  | "commodities_energy"
  | "trade_policy";

/** Fixed, deterministic query buckets. Macro / geopolitics / commodities only. */
export const GDELT_QUERY_BUCKETS: ReadonlyArray<{ bucket: QueryBucket; query: string }> = [
  {
    bucket: "geopolitics_conflict",
    query:
      '(war OR conflict OR attack OR missile OR sanctions OR ceasefire OR Iran OR Israel OR Gaza OR Russia OR Ukraine OR "Red Sea" OR "Strait of Hormuz" OR "shipping disruption")',
  },
  {
    bucket: "central_banks_macro",
    query:
      '(Fed OR FOMC OR Powell OR ECB OR "Bank of England" OR "Bank of Japan" OR RBA OR RBNZ OR "central bank" OR inflation OR CPI OR payrolls OR unemployment OR GDP OR PMI OR "Treasury yields" OR "dollar index" OR DXY)',
  },
  {
    bucket: "commodities_energy",
    query:
      '(gold OR bullion OR silver OR copper OR oil OR crude OR OPEC OR Brent OR WTI OR "natural gas")',
  },
  {
    bucket: "trade_policy",
    query:
      '(tariff OR "trade war" OR "export controls" OR sanctions OR "trade restrictions")',
  },
] as const;

/** Build a bucket request URL with URL/URLSearchParams (never string concatenation). */
export function buildBucketUrl(query: string): string {
  const url = new URL(GDELT_DOC2_ENDPOINT);
  const params = new URLSearchParams({
    query,
    mode: GDELT_MODE,
    format: GDELT_FORMAT,
    sort: GDELT_SORT,
    timespan: GDELT_TIMESPAN,
    maxrecords: String(GDELT_MAX_RECORDS),
  });
  url.search = params.toString();
  return url.toString();
}

/**
 * Parse a GDELT source timestamp. Accepts the DOC 2.0 `seendate` compact form
 * (`YYYYMMDDTHHMMSSZ`) and plain ISO-8601. Returns null when absent/unparseable —
 * callers MUST reject the row, never fall back to `new Date()`.
 */
export function parseGdeltTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (compact) {
    const [, y, mo, d, h, mi, sec] = compact;
    const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${sec}Z`);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deterministic provider event id.
 *
 * GDELT DOC 2.0 artlist rows expose no stable document/article identifier, so V1
 * uses a SHA-256 of the canonical identity string `<url>|<published_at ISO>`.
 * Same URL + same source timestamp always yields the same id; never random.
 */
export function providerEventId(url: string, publishedAtIso: string): Promise<string> {
  return sha256Hex(`${url}|${publishedAtIso}`);
}

export interface MacroSourceEventRow {
  provider: string;
  provider_event_id: string;
  url: string;
  publisher: string | null;
  headline: string;
  published_at: string;
  source_country: string | null;
  source_language: string | null;
  query_bucket: QueryBucket;
  raw_topic_metadata: Record<string, unknown>;
  raw: unknown;
}

export type NormalizeResult =
  | { ok: true; row: MacroSourceEventRow }
  | { ok: false; reason: "missing_url" | "missing_headline" | "invalid_source_timestamp" };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Normalize one raw GDELT artlist row. Rejects malformed rows; never repairs them. */
export async function normalizeArticle(
  raw: unknown, bucket: QueryBucket,
): Promise<NormalizeResult> {
  const a = (raw ?? {}) as Record<string, unknown>;
  const url = str(a.url);
  if (!url) return { ok: false, reason: "missing_url" };
  const headline = str(a.title);
  if (!headline) return { ok: false, reason: "missing_headline" };
  const published_at = parseGdeltTimestamp(a.seendate);
  if (!published_at) return { ok: false, reason: "invalid_source_timestamp" };

  return {
    ok: true,
    row: {
      provider: GDELT_PROVIDER,
      provider_event_id: await providerEventId(url, published_at),
      url,
      publisher: str(a.domain) || null,
      headline,
      published_at,
      source_country: str(a.sourcecountry) || null,
      source_language: str(a.language) || null,
      query_bucket: bucket,
      // Descriptive source/bucket metadata only — no derived claim of any kind.
      raw_topic_metadata: {
        query_bucket: bucket,
        provider: GDELT_PROVIDER,
        source_timestamp_field: "seendate",
      },
      raw,
    },
  };
}
