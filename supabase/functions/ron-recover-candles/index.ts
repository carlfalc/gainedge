/**
 * ron-recover-candles — Phase 2D.1c durable genuine 1m gap recovery.
 *
 * Insertion-only. Genuine MetaApi/Eightcap historical candles are the ONLY authority:
 * no synthesis, no interpolation, no venue-hours expectation fill, no overwrites.
 * Progress is checkpointed in public.ron_data_recovery_jobs so the worker is
 * bounded, resumable and idempotent across invocations.
 *
 * MetaApi semantics: `startTime` is the END anchor; pages walk BACKWARDS.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const MARKET_DATA_ACCOUNT_ID = Deno.env.get("METAAPI_MARKET_DATA_ACCOUNT_ID") ?? "";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

// ---- frozen 2D.1c target contract -----------------------------------------
const RECOVERY_VERSION = 1;
const SOURCE = "metaapi_historical_london";
const SYMBOL = "XAUUSD";
const TIMEFRAME = "1m";
const BROKER_SYMBOL = "XAUUSD";
const RANGE_START_EXCLUSIVE = "2026-05-15T00:00:00.000Z";
const RANGE_END_EXCLUSIVE = "2026-07-31T17:33:00.000Z";
const BAR_MS = 60_000;

// hard price range (mirrors src/lib/price-ranges.ts XAUUSD) — pre-declared, not post-hoc
const PRICE_MIN = 1000;
const PRICE_MAX = 10000;

const PAGE_LIMIT = 1000;
const MAX_PAGES_PER_CALL = 20;
const CANARY_MIN_COMMON = 100;
const CANARY_WINDOW = 1000;
const DIGEST_CHUNK = 10_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface MetaCandle {
  time: string; open: number; high: number; low: number; close: number;
  tickVolume?: number; volume?: number; state?: string;
}
interface Row {
  symbol: string; timeframe: string; timestamp: string;
  open: number; high: number; low: number; close: number; volume: number;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchPage(accountId: string, endAnchor: Date): Promise<MetaCandle[]> {
  const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(BROKER_SYMBOL)}/timeframes/${TIMEFRAME}/candles?startTime=${encodeURIComponent(endAnchor.toISOString())}&limit=${PAGE_LIMIT}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: { "auth-token": METAAPI_TOKEN }, signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(`MetaApi ${res.status}: ${(data && (data.message || data.error)) || "error"}`);
    return Array.isArray(data) ? data as MetaCandle[] : [];
  } finally { clearTimeout(t); }
}

/** Pre-declared validation. Identical semantics to existing ingestion paths. */
function isValid(c: MetaCandle): boolean {
  if (c.state && c.state !== "complete") return false;
  const { open: o, high: h, low: l, close: cl } = c;
  if (![o, h, l, cl].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  if (h < Math.max(o, cl) || l > Math.min(o, cl) || l <= 0) return false;
  return [o, h, l, cl].every((v) => v >= PRICE_MIN && v <= PRICE_MAX);
}

function toRow(ts: number, c: MetaCandle): Row {
  return {
    symbol: SYMBOL, timeframe: TIMEFRAME, timestamp: new Date(ts).toISOString(),
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: Math.round(Number(c.tickVolume ?? c.volume ?? 0)),
  };
}

const num = (v: unknown) => Number(v);
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Overlap canary: source rows must equal stored rows exactly on common timestamps. */
async function canary(
  // deno-lint-ignore no-explicit-any
  db: any, accountId: string, side: "pre" | "post",
): Promise<{ side: string; common: number; mismatches: number; ok: boolean; detail?: string }> {
  const anchor = side === "pre" ? new Date(RANGE_START_EXCLUSIVE) : new Date(Date.parse(RANGE_END_EXCLUSIVE) + CANARY_WINDOW * BAR_MS);
  const page = await fetchPage(accountId, anchor);
  const src = new Map<number, MetaCandle>();
  for (const c of page) {
    const ts = new Date(c.time).getTime();
    if (side === "pre" ? ts <= Date.parse(RANGE_START_EXCLUSIVE) : ts >= Date.parse(RANGE_END_EXCLUSIVE)) src.set(ts, c);
  }
  if (src.size === 0) return { side, common: 0, mismatches: 0, ok: false, detail: "no source rows" };
  const times = [...src.keys()].sort((a, b) => a - b);
  const { data, error } = await db.from("candle_history")
    .select("timestamp,open,high,low,close,volume")
    .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
    .gte("timestamp", new Date(times[0]).toISOString())
    .lte("timestamp", new Date(times[times.length - 1]).toISOString())
    .order("timestamp", { ascending: true }).limit(2000);
  if (error) return { side, common: 0, mismatches: 0, ok: false, detail: error.message };
  let common = 0, mismatches = 0;
  let firstDetail: string | undefined;
  for (const r of data ?? []) {
    const ts = new Date(r.timestamp as string).getTime();
    const c = src.get(ts);
    if (!c) continue;
    common++;
    const eq = same(num(r.open), c.open) && same(num(r.high), c.high) && same(num(r.low), c.low) &&
      same(num(r.close), c.close) && Math.round(num(r.volume ?? 0)) === Math.round(Number(c.tickVolume ?? c.volume ?? 0));
    if (!eq) { mismatches++; firstDetail ??= `mismatch at ${r.timestamp}`; }
  }
  return { side, common, mismatches, ok: common >= CANARY_MIN_COMMON && mismatches === 0, detail: firstDetail };
}

/** Deterministic ordered digest over the frozen target range, chunked by fixed offsets. */
// deno-lint-ignore no-explicit-any
async function targetDigest(db: any): Promise<{ digest: string; rows: number; min: string | null; max: string | null }> {
  const chunkHashes: string[] = [];
  let offset = 0, rows = 0;
  let min: string | null = null, max: string | null = null;
  for (;;) {
    const { data, error } = await db.from("candle_history")
      .select("timestamp,open,high,low,close,volume")
      .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
      .gt("timestamp", RANGE_START_EXCLUSIVE).lt("timestamp", RANGE_END_EXCLUSIVE)
      .order("timestamp", { ascending: true })
      .range(offset, offset + DIGEST_CHUNK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    if (batch.length === 0) break;
    // deno-lint-ignore no-explicit-any
    const s = batch.map((r: any) =>
      `${new Date(r.timestamp).toISOString()},${num(r.open)},${num(r.high)},${num(r.low)},${num(r.close)},${Math.round(num(r.volume ?? 0))}`
    ).join("|");
    chunkHashes.push(await sha256(s));
    min ??= new Date(batch[0].timestamp).toISOString();
    max = new Date(batch[batch.length - 1].timestamp).toISOString();
    rows += batch.length;
    if (batch.length < DIGEST_CHUNK) break;
    offset += DIGEST_CHUNK;
  }
  return { digest: await sha256(chunkHashes.join(":")), rows, min, max };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let authorized = token.length > 0 && token === SERVICE_KEY;
  if (!authorized && token.length > 0) {
    const { data } = await db.rpc("ron_verify_cron_token", { _token: token });
    authorized = data === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "run";
    const accountId = MARKET_DATA_ACCOUNT_ID;
    if (!accountId) return json({ error: "NO_MARKET_DATA_ACCOUNT" }, 409);

    const identity = {
      recovery_version: RECOVERY_VERSION, symbol: SYMBOL, timeframe: TIMEFRAME,
      range_start_exclusive: RANGE_START_EXCLUSIVE, range_end_exclusive: RANGE_END_EXCLUSIVE,
    };

    const { data: existing } = await db.from("ron_data_recovery_jobs").select("*")
      .match(identity).maybeSingle();

    if (action === "status") return json({ job: existing ?? null });

    if (action === "canary") {
      const pre = await canary(db, accountId, "pre");
      const post = await canary(db, accountId, "post");
      return json({ canaries: [pre, post], ok: pre.ok && post.ok });
    }

    if (existing?.status === "complete") {
      const d = await targetDigest(db);
      return json({ done: true, idempotent: true, job: existing, verify: d });
    }

    // ---- pre-write canaries (every invocation, before any insert) ----------
    const pre = await canary(db, accountId, "pre");
    const post = await canary(db, accountId, "post");
    if (!pre.ok || !post.ok) {
      return json({ error: "RECOVERY_CANARY_FAILED", canaries: [pre, post] }, 409);
    }

    let job = existing;
    if (!job) {
      const { data: created, error } = await db.from("ron_data_recovery_jobs").insert({
        ...identity, source: SOURCE, broker_symbol: BROKER_SYMBOL,
        status: "running", cursor_end_anchor: RANGE_END_EXCLUSIVE,
      }).select("*").single();
      if (error) return json({ error: error.message }, 500);
      job = created;
    }

    let cursor = new Date(job.cursor_end_anchor ?? RANGE_END_EXCLUSIVE);
    const startMs = Date.parse(RANGE_START_EXCLUSIVE);
    const endMs = Date.parse(RANGE_END_EXCLUSIVE);

    let pages = 0, raw = 0, validated = 0, filtered = 0, inserted = 0, conflicts = 0;
    let done = false, lastError: string | null = null;

    while (pages < MAX_PAGES_PER_CALL) {
      if (cursor.getTime() <= startMs) { done = true; break; }
      let page: MetaCandle[];
      try { page = await fetchPage(accountId, cursor); }
      catch (e) { lastError = (e as Error).message; break; }
      pages++;
      if (page.length === 0) { done = true; break; }
      raw += page.length;

      const rows: Row[] = [];
      for (const c of page) {
        const ts = new Date(c.time).getTime();
        if (!(ts > startMs && ts < endMs)) { filtered++; continue; }
        if (!isValid(c)) { filtered++; continue; }
        rows.push(toRow(ts, c));
      }
      // dedupe within page, ascending
      const uniq = new Map(rows.map((r) => [r.timestamp, r]));
      const batch = [...uniq.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      validated += batch.length;

      if (batch.length) {
        const { data: n, error } = await db.rpc("bulk_insert_candles", { candles: batch });
        if (error) { lastError = error.message; break; }
        const ins = Number(n ?? 0);
        inserted += ins;
        conflicts += batch.length - ins;
      }

      const oldestSrc = page.reduce((a, b) => (new Date(a.time).getTime() < new Date(b.time).getTime() ? a : b));
      const next = new Date(new Date(oldestSrc.time).getTime() - BAR_MS);
      if (!(next.getTime() < cursor.getTime())) { // loop / non-decreasing cursor guard
        lastError = "CURSOR_NOT_DECREASING";
        break;
      }
      cursor = next;
      if (cursor.getTime() <= startMs) { done = true; break; }
    }

    const patch: Record<string, unknown> = {
      cursor_end_anchor: cursor.toISOString(),
      pages_fetched: (job.pages_fetched ?? 0) + pages,
      raw_candles: (job.raw_candles ?? 0) + raw,
      validated_in_range: (job.validated_in_range ?? 0) + validated,
      inserted: (job.inserted ?? 0) + inserted,
      conflicts_existing: (job.conflicts_existing ?? 0) + conflicts,
      filtered_out: (job.filtered_out ?? 0) + filtered,
      error_count: (job.error_count ?? 0) + (lastError ? 1 : 0),
      last_error: lastError,
      status: lastError ? "failed" : done ? "complete" : "running",
    };

    let verify: Awaited<ReturnType<typeof targetDigest>> | null = null;
    if (!lastError && done) {
      verify = await targetDigest(db);
      patch.row_digest = verify.digest;
      patch.min_inserted_ts = verify.min;
      patch.max_inserted_ts = verify.max;
      patch.completed_at = new Date().toISOString();
    }

    const { data: updated } = await db.from("ron_data_recovery_jobs")
      .update(patch).eq("id", job.id).select("*").single();

    return json({
      ok: !lastError, done, more: !done && !lastError,
      this_call: { pages, raw, validated, inserted, conflicts, filtered },
      job: updated, verify,
    });
  } catch (e) {
    console.error("ron-recover-candles error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
