/**
 * ingest-candles — live broker candle ingestion into public.candle_history.
 *
 * Genuine MetaApi/Eightcap candles only. No synthesis, interpolation or forward fill.
 * Only CLOSED bars are persisted; the currently forming bar is always excluded.
 * Idempotent: rows are written through public.bulk_insert_candles (ON CONFLICT DO NOTHING)
 * on the (symbol, timeframe, timestamp) unique key.
 *
 * IMPORTANT MetaApi semantics: `startTime` is the END anchor — the API returns up to
 * `limit` candles going BACKWARDS from that instant. Paging therefore walks backwards
 * until the last stored bar is reached.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { brokerVariantsFor } from "../_shared/broker-symbol-variants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const MARKET_DATA_ACCOUNT_ID = Deno.env.get("METAAPI_MARKET_DATA_ACCOUNT_ID") ?? "";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const TF_MS: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000 };
/**
 * Multi-asset unattended targets (GAINEDGE_MULTI_ASSET_FOUNDATION_V1).
 * Broker aliases come from the shared provider alias table, not one-off maps.
 */
export const DEFAULT_TARGETS = [
  { symbol: "XAUUSD", timeframe: "15m" },
  { symbol: "NAS100", timeframe: "15m" },
  { symbol: "HK50", timeframe: "15m" },
  { symbol: "GER40", timeframe: "15m" },
  { symbol: "NZDUSD", timeframe: "15m" },
  { symbol: "USDCAD", timeframe: "15m" },
  { symbol: "USOUSD", timeframe: "15m" },
  { symbol: "UKOUSD", timeframe: "15m" },
  { symbol: "XAUUSD", timeframe: "1m" },
];

const PAGE_LIMIT = 1000;
const MAX_PAGES = 8;
const MAX_RECOVERY_PAGES = 24;          // bounded recovery ceiling
const MAX_RECOVERY_LOOKBACK_DAYS = 120; // bounded recovery ceiling
const OVERLAP_BARS = 3;          // small overlap for idempotent correction
const DEFAULT_LOOKBACK_DAYS = 21;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface MetaCandle {
  time: string; open: number; high: number; low: number; close: number;
  tickVolume?: number; volume?: number; state?: string;
}

async function fetchPage(accountId: string, brokerSymbol: string, timeframe: string, endAnchor: Date): Promise<MetaCandle[]> {
  const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(brokerSymbol)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(endAnchor.toISOString())}&limit=${PAGE_LIMIT}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: { "auth-token": METAAPI_TOKEN }, signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(`MetaApi ${res.status}: ${(data && (data.message || data.error)) || "error"}`);
    return Array.isArray(data) ? data as MetaCandle[] : [];
  } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Authorization: EXACT secret match only — never an unverified JWT claim.
  let authorized = token.length > 0 && token === SERVICE_KEY;
  if (!authorized && token.length > 0) {
    const { data } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    authorized = data === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const accountId = (typeof body.account_id === "string" && body.account_id) || MARKET_DATA_ACCOUNT_ID;
    if (!accountId) return json({ error: "NO_MARKET_DATA_ACCOUNT" }, 409);

    const lookbackDays = Math.min(
      MAX_RECOVERY_LOOKBACK_DAYS,
      Math.max(1, Number(body.lookback_days ?? DEFAULT_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS),
    );
    const maxPages = Math.min(
      MAX_RECOVERY_PAGES,
      Math.max(1, Number(body.max_pages ?? MAX_PAGES) || MAX_PAGES),
    );
    const lookbackMs = lookbackDays * 24 * 3_600_000;

    const targets = Array.isArray(body.targets) && body.targets.length
      ? body.targets as { symbol: string; timeframe: string }[]
      : DEFAULT_TARGETS;

    const now = Date.now();
    const results: Record<string, unknown>[] = [];

    // Per-symbol failure isolation: one unavailable symbol never blocks the rest.
    for (const { symbol, timeframe } of targets) {
      try {
      const barMs = TF_MS[timeframe];
      if (!barMs) { results.push({ symbol, timeframe, error: "unsupported timeframe" }); continue; }
      const variants = brokerVariantsFor(symbol);

      const { data: latest } = await supabase
        .from("candle_history")
        .select("timestamp")
        .eq("symbol", symbol).eq("timeframe", timeframe)
        .order("timestamp", { ascending: false }).limit(1);
      const lastStored = latest?.[0]?.timestamp ? new Date(latest[0].timestamp).getTime() : 0;
      const floor = Math.max(lastStored - OVERLAP_BARS * barMs, now - lookbackMs);

      // Latest legitimately CLOSED bar boundary.
      const lastClosedOpen = Math.floor(now / barMs) * barMs - barMs;
      if (lastStored >= lastClosedOpen) {
        results.push({ symbol, timeframe, inserted: 0, fetched: 0, upToDate: true, lastStored: new Date(lastStored).toISOString() });
        continue;
      }

      const collected = new Map<number, MetaCandle>();
      let anchor = new Date(now);
      let pages = 0, apiError: string | null = null;
      // Per-symbol alias resolution: first variant the broker actually serves wins.
      let resolved: string | null = null;
      while (pages < maxPages) {
        let page: MetaCandle[] | null = null;
        if (resolved) {
          try { page = await fetchPage(accountId, resolved, timeframe, anchor); }
          catch (e) { apiError = (e as Error).message; break; }
        } else {
          const errs: string[] = [];
          for (const v of variants) {
            try {
              const p = await fetchPage(accountId, v, timeframe, anchor);
              if (p.length) { resolved = v; page = p; break; }
              if (page === null) page = p;
            } catch (e) { errs.push(`${v}: ${(e as Error).message}`); }
          }
          if (page === null) { apiError = errs.join(" | ") || "no broker variant available"; break; }
        }
        pages++;
        if (page.length === 0) break;
        for (const c of page) collected.set(new Date(c.time).getTime(), c);
        const oldest = new Date(page[0].time).getTime();
        if (oldest <= floor) break;
        anchor = new Date(oldest - 1);
      }

      const rows = [...collected.entries()]
        .filter(([ts, c]) =>
          ts >= floor && ts <= lastClosedOpen &&
          (c.state ? c.state === "complete" : true) &&
          Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) &&
          c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close) && c.low > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([ts, c]) => ({
          symbol, timeframe, timestamp: new Date(ts).toISOString(),
          open: c.open, high: c.high, low: c.low, close: c.close,
          volume: Math.round(Number(c.tickVolume ?? c.volume ?? 0)),
        }));

      let inserted = 0;
      if (rows.length) {
        const { data: n, error } = await supabase.rpc("bulk_insert_candles", { candles: rows });
        if (error) { results.push({ symbol, timeframe, error: error.message, fetched: rows.length }); continue; }
        inserted = Number(n ?? 0);
      }
      // Observability only: records which broker alias actually served the symbol.
      console.info(`ingest-candles: ${symbol} ${timeframe} → alias=${resolved ?? "none"} fetched=${rows.length} inserted=${inserted}${apiError ? ` apiError=${apiError}` : ""}`);
      results.push({
        symbol, timeframe, pages, fetched: rows.length, inserted, apiError,
        brokerSymbol: resolved,
        lastStoredBefore: lastStored ? new Date(lastStored).toISOString() : null,
        newest: rows.length ? rows[rows.length - 1].timestamp : null,
      });
      } catch (e) {
        results.push({ symbol, timeframe, error: (e as Error).message, isolated: true });
      }
    }

    return json({ success: true, at: new Date(now).toISOString(), results });
  } catch (e) {
    console.error("ingest-candles error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
