/**
 * ron-recover-15m — Phase 2D.1f-c durable genuine broker-native XAUUSD 15m gap recovery.
 *
 * Insertion-only. Broker-native MetaApi/Eightcap 15m candles are the ONLY authority:
 * no synthesis, no interpolation, no forward fill, no 1m resampling, no overwrites.
 * The three accepted candidate windows (counts / min / max / digest) are frozen from the
 * accepted read-only 2D.1f-b feasibility audit. Any drift aborts WITHOUT writes.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const MARKET_DATA_ACCOUNT_ID = Deno.env.get("METAAPI_MARKET_DATA_ACCOUNT_ID") ?? "";
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const RECOVERY_VERSION = 2;
const SOURCE = "metaapi_historical_london";
const SYMBOL = "XAUUSD";
const BROKER_SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const BAR_MS = 900_000;
const PRICE_MIN = 1000;
const PRICE_MAX = 10000;
const PAGE_LIMIT = 1000;

/** Page-anchor-dependent rollover bar excluded by the accepted audit. */
const EXCLUDED_TIMESTAMPS = new Set<string>(["2026-07-09T21:45:00.000Z"]);

interface WindowSpec {
  key: "A" | "B" | "C";
  start: string; // exclusive
  end: string;   // exclusive
  rows: number;
  min: string;
  max: string;
  digest: string;
}

const WINDOWS: WindowSpec[] = [
  {
    key: "A",
    start: "2026-06-02T21:00:00.000Z", end: "2026-06-04T22:00:00.000Z",
    rows: 184, min: "2026-06-02T22:00:00.000Z", max: "2026-06-04T20:45:00.000Z",
    digest: "c30ea89226cb4ef0fa8e07ec13bfdf3d8b1986891c6e7acb39eecb5175a9ff02",
  },
  {
    key: "B",
    start: "2026-06-19T17:00:00.000Z", end: "2026-06-23T22:00:00.000Z",
    rows: 184, min: "2026-06-21T22:00:00.000Z", max: "2026-06-23T20:45:00.000Z",
    digest: "851b350286621b626813b7f4d647ee258823c1c279d78d1c30709fb16d53ac73",
  },
  {
    key: "C",
    start: "2026-07-08T21:00:00.000Z", end: "2026-07-12T22:00:00.000Z",
    rows: 184, min: "2026-07-08T22:00:00.000Z", max: "2026-07-10T20:45:00.000Z",
    digest: "8e5d7084ef4cba824019d076a8a0874769bceb855110479782c3d73d66069f92",
  },
];

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

function isValid(c: MetaCandle): boolean {
  if (c.state && c.state !== "complete") return false;
  const { open: o, high: h, low: l, close: cl } = c;
  if (![o, h, l, cl].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  if (h < Math.max(o, cl) || l > Math.min(o, cl) || l <= 0) return false;
  return [o, h, l, cl].every((v) => v >= PRICE_MIN && v <= PRICE_MAX);
}

const serialize = (r: Row) => `${r.timestamp},${r.open},${r.high},${r.low},${r.close},${r.volume}`;

async function deriveWindow(accountId: string, w: WindowSpec) {
  const startMs = Date.parse(w.start), endMs = Date.parse(w.end);
  const collected = new Map<number, MetaCandle>();
  let anchor = new Date(endMs);
  let pages = 0;
  while (pages < 4) {
    const page = await fetchPage(accountId, anchor);
    pages++;
    if (page.length === 0) break;
    for (const c of page) collected.set(new Date(c.time).getTime(), c);
    const oldest = Math.min(...page.map((c) => new Date(c.time).getTime()));
    if (oldest <= startMs) break;
    anchor = new Date(oldest - 1);
  }

  const rows: Row[] = [];
  let filtered = 0;
  for (const [ts, c] of [...collected.entries()].sort((a, b) => a[0] - b[0])) {
    if (!(ts > startMs && ts < endMs)) { filtered++; continue; }
    if (ts % BAR_MS !== 0) { filtered++; continue; }
    const iso = new Date(ts).toISOString();
    if (EXCLUDED_TIMESTAMPS.has(iso)) { filtered++; continue; }
    if (!isValid(c)) { filtered++; continue; }
    rows.push({
      symbol: SYMBOL, timeframe: TIMEFRAME, timestamp: iso,
      open: c.open, high: c.high, low: c.low, close: c.close,
      volume: Math.round(Number(c.tickVolume ?? c.volume ?? 0)),
    });
  }

  const digest = await sha256(rows.map(serialize).join("|"));
  const derived = {
    rows: rows.length,
    min: rows.length ? rows[0].timestamp : null,
    max: rows.length ? rows[rows.length - 1].timestamp : null,
    digest,
  };
  const matches = derived.rows === w.rows && derived.min === w.min && derived.max === w.max && derived.digest === w.digest;
  return { rows, derived, matches, pages, filtered };
}

// deno-lint-ignore no-explicit-any
async function storedDigest(db: any, w: WindowSpec) {
  const { data, error } = await db.from("candle_history")
    .select("timestamp,open,high,low,close,volume")
    .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
    .gt("timestamp", w.start).lt("timestamp", w.end)
    .order("timestamp", { ascending: true }).limit(1000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const s = rows.map((r) =>
    `${new Date(r.timestamp as string).toISOString()},${Number(r.open)},${Number(r.high)},${Number(r.low)},${Number(r.close)},${Math.round(Number(r.volume ?? 0))}`
  ).join("|");
  return {
    rows: rows.length,
    min: rows.length ? new Date(rows[0].timestamp as string).toISOString() : null,
    max: rows.length ? new Date(rows[rows.length - 1].timestamp as string).toISOString() : null,
    digest: await sha256(s),
  };
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
    const dryRun = body.dry_run === true;
    const accountId = MARKET_DATA_ACCOUNT_ID;
    if (!accountId) return json({ error: "NO_MARKET_DATA_ACCOUNT" }, 409);

    const report: Record<string, unknown>[] = [];

    for (const w of WINDOWS) {
      const identity = {
        recovery_version: RECOVERY_VERSION, symbol: SYMBOL, timeframe: TIMEFRAME,
        range_start_exclusive: w.start, range_end_exclusive: w.end,
      };
      const { data: existing } = await db.from("ron_data_recovery_jobs").select("*").match(identity).maybeSingle();

      const d = await deriveWindow(accountId, w);
      if (!d.matches) {
        const detail = { window: w.key, status: "AMBIGUOUS_SOURCE_DRIFT", accepted: w, derived: d.derived, inserted: 0 };
        report.push(detail);
        continue;
      }

      // conflict proof: zero pre-existing stored rows at the accepted timestamps
      const before = await storedDigest(db, w);
      const { data: conflictRows } = await db.from("candle_history")
        .select("timestamp").eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .in("timestamp", d.rows.map((r) => r.timestamp)).limit(1000);
      const conflicts = (conflictRows ?? []).length;

      if (dryRun) {
        report.push({ window: w.key, status: "dry_run", derived: d.derived, before, conflicts, inserted: 0 });
        continue;
      }
      if (conflicts > 0 && !existing) {
        report.push({ window: w.key, status: "CONFLICT_ABORT", conflicts, derived: d.derived, before, inserted: 0 });
        continue;
      }

      let job = existing;
      if (!job) {
        const { data: created, error } = await db.from("ron_data_recovery_jobs").insert({
          ...identity, source: SOURCE, broker_symbol: BROKER_SYMBOL,
          status: "running", cursor_end_anchor: w.end,
        }).select("*").single();
        if (error) return json({ error: error.message }, 500);
        job = created;
      }

      const { data: n, error: insErr } = await db.rpc("bulk_insert_candles", { candles: d.rows });
      const inserted = insErr ? 0 : Number(n ?? 0);
      const after = await storedDigest(db, w);

      const patch: Record<string, unknown> = {
        cursor_end_anchor: w.start,
        pages_fetched: (job.pages_fetched ?? 0) + d.pages,
        raw_candles: (job.raw_candles ?? 0) + d.rows.length + d.filtered,
        validated_in_range: (job.validated_in_range ?? 0) + d.rows.length,
        inserted: (job.inserted ?? 0) + inserted,
        conflicts_existing: (job.conflicts_existing ?? 0) + (d.rows.length - inserted),
        filtered_out: (job.filtered_out ?? 0) + d.filtered,
        error_count: (job.error_count ?? 0) + (insErr ? 1 : 0),
        last_error: insErr ? insErr.message : null,
        row_digest: after.digest,
        min_inserted_ts: after.min,
        max_inserted_ts: after.max,
        status: insErr ? "failed" : "complete",
        completed_at: insErr ? null : new Date().toISOString(),
      };
      const { data: updated } = await db.from("ron_data_recovery_jobs")
        .update(patch).eq("id", job.id).select("*").single();

      report.push({
        window: w.key, status: patch.status, job_id: job.id,
        accepted_digest: w.digest, derived: d.derived,
        before, after, conflicts, inserted,
        stored_matches_accepted: after.digest === w.digest && after.rows === w.rows,
        error: insErr ? insErr.message : null,
      });
    }

    const inserted_total = report.reduce((a, r) => a + Number(r.inserted ?? 0), 0);
    return json({ ok: true, recovery_version: RECOVERY_VERSION, dry_run: dryRun, inserted_total, report });
  } catch (e) {
    console.error("ron-recover-15m error:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
