// metaapi-backfill — authenticated historical candle backfill via MetaApi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const METAAPI_TOKEN = Deno.env.get("METAAPI_TOKEN")!;
const MARKET_DATA_URL = "https://mt-market-data-client-api-v1.london.agiliumtrade.ai";

const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000, "5m": 5*60_000, "15m": 15*60_000, "30m": 30*60_000,
  "1h": 60*60_000, "4h": 4*60*60_000, "1d": 24*60*60_000,
};

const PAGE_LIMIT = 1000;
const DEFAULT_PAGES_PER_INVOCATION = 6;
const MAX_RETRIES = 2;

type Json = Record<string, unknown>;

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface MetaCandle {
  time: string; open: number; high: number; low: number; close: number;
  tickVolume?: number; volume?: number;
}

async function fetchPage(accountId: string, symbol: string, timeframe: string, startTime: string): Promise<MetaCandle[]> {
  const url = `${MARKET_DATA_URL}/users/current/accounts/${accountId}/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${timeframe}/candles?startTime=${encodeURIComponent(startTime)}&limit=${PAGE_LIMIT}`;
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, { headers: { "auth-token": METAAPI_TOKEN }, signal: controller.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_RETRIES) throw new Error(`MetaApi ${res.status} after ${attempt} retries`);
        await sleep(Math.min(8000, 500 * 2 ** attempt));
        attempt++; continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error((data && (data.message || data.error)) || `MetaApi ${res.status}`);
      return Array.isArray(data) ? (data as MetaCandle[]) : [];
    } catch (err) {
      clearTimeout(t);
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(Math.min(8000, 500 * 2 ** attempt));
      attempt++;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.slice(7);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const isServiceCall = token === SERVICE_KEY;

    const body = await req.json().catch(() => ({} as Json));

    let userId: string;
    if (isServiceCall) {
      const requested = typeof body.user_id === "string" ? body.user_id : "";
      if (!requested) return json(400, { error: "Service calls require user_id" });
      const { data: user, error: uErr } = await admin.auth.admin.getUserById(requested);
      if (uErr || !user?.user?.id) return json(400, { error: "Unknown user_id" });
      userId = user.user.id;
    } else {
      const authClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: cErr } = await authClient.auth.getClaims(token);
      if (cErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });
      userId = claims.claims.sub as string;
    }

    const { data: conns } = await admin.from("broker_connections")
      .select("metaapi_account_id, account_type, status")
      .eq("user_id", userId).eq("is_default", true).eq("status", "connected").limit(1);
    const conn = conns?.[0];
    if (!conn?.metaapi_account_id) {
      return json(409, {
        error: "NO_CONNECTED_ACCOUNT",
        message: "Connect a default MetaApi broker account in Settings before running backfill.",
      });
    }
    const accountId = conn.metaapi_account_id as string;

    const action = body.action ?? "start";

    if (action === "status") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json(400, { error: "job_id required" });
      const { data: job } = await admin.from("market_data_backfill_jobs")
        .select("*").eq("id", jobId).eq("user_id", userId).maybeSingle();
      if (!job) return json(404, { error: "Job not found" });
      return json(200, { job });
    }

    if (action === "cancel") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json(400, { error: "job_id required" });
      await admin.from("market_data_backfill_jobs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", jobId).eq("user_id", userId).in("status", ["queued", "running"]);
      return json(200, { ok: true });
    }

    const timeframe = String(body.timeframe ?? "");
    const tfMs = TIMEFRAME_MS[timeframe];
    if (!tfMs) return json(400, { error: `Unsupported timeframe: ${timeframe}` });

    let jobId: string;
    let symbol: string;
    let requestedStart: Date;
    let requestedEnd: Date;
    let cursor: Date;

    if (action === "start") {
      symbol = String(body.broker_symbol ?? body.symbol ?? "").trim();
      if (!symbol) return json(400, { error: "symbol required" });
      const rs = new Date(String(body.requested_start));
      const re = body.requested_end ? new Date(String(body.requested_end)) : new Date();
      if (isNaN(rs.getTime()) || isNaN(re.getTime()) || rs >= re) {
        return json(400, { error: "Invalid requested_start/requested_end" });
      }
      requestedStart = rs; requestedEnd = re; cursor = re;

      const { data: created, error: cErr } = await admin.from("market_data_backfill_jobs")
        .insert({
          user_id: userId, metaapi_account_id: accountId, symbol, timeframe,
          requested_start: rs.toISOString(), requested_end: re.toISOString(),
          cursor_time: re.toISOString(), status: "running",
        }).select("id").single();
      if (cErr || !created) return json(500, { error: cErr?.message ?? "Failed to create job" });
      jobId = created.id as string;
    } else if (action === "continue") {
      jobId = String(body.job_id ?? "");
      if (!jobId) return json(400, { error: "job_id required" });
      const { data: job } = await admin.from("market_data_backfill_jobs")
        .select("*").eq("id", jobId).eq("user_id", userId).maybeSingle();
      if (!job) return json(404, { error: "Job not found" });
      if (job.status === "complete" || job.status === "cancelled") return json(200, { job, done: true });
      symbol = job.symbol;
      requestedStart = new Date(job.requested_start);
      requestedEnd = new Date(job.requested_end);
      cursor = new Date(job.cursor_time ?? job.requested_end);
      await admin.from("market_data_backfill_jobs")
        .update({ status: "running", last_error: null }).eq("id", jobId);
    } else {
      return json(400, { error: "Unknown action" });
    }

    const nowBar = Math.floor(Date.now() / tfMs) * tfMs;
    const pagesPerCall = Math.max(1, Math.min(12, Number(body.pages ?? DEFAULT_PAGES_PER_INVOCATION)));
    let totalInserted = 0;
    let pagesThisCall = 0;
    let done = false;
    let lastError: string | null = null;

    try {
      for (let page = 0; page < pagesPerCall; page++) {
        if (cursor <= requestedStart) { done = true; break; }
        const pageData = await fetchPage(accountId, symbol, timeframe, cursor.toISOString());
        if (!pageData.length) { done = true; break; }

        const rows = pageData
          .map(c => ({
            symbol, timeframe,
            timestamp: new Date(c.time).toISOString(),
            open: c.open, high: c.high, low: c.low, close: c.close,
            volume: Math.round(c.tickVolume ?? c.volume ?? 0),
            _t: new Date(c.time).getTime(),
          }))
          .filter(r => r._t < nowBar && r._t <= requestedEnd.getTime())
          .map(({ _t, ...r }) => r);

        if (rows.length) {
          const { data: insertCount, error: rpcErr } = await admin.rpc("bulk_insert_candles", { candles: rows });
          if (rpcErr) throw new Error(rpcErr.message);
          totalInserted += Number(insertCount ?? 0);
        }

        const oldest = pageData.reduce((a, b) => new Date(a.time).getTime() < new Date(b.time).getTime() ? a : b);
        const nextCursor = new Date(new Date(oldest.time).getTime() - tfMs);
        if (nextCursor >= cursor) { done = true; break; }
        cursor = nextCursor;
        pagesThisCall++;
        if (cursor <= requestedStart) { done = true; break; }
      }
    } catch (err) {
      lastError = (err as Error).message;
    }

    const { data: current } = await admin.from("market_data_backfill_jobs")
      .select("rows_inserted, pages_completed").eq("id", jobId).single();
    const patch: Json = {
      cursor_time: cursor.toISOString(),
      rows_inserted: (current?.rows_inserted ?? 0) + totalInserted,
      pages_completed: (current?.pages_completed ?? 0) + pagesThisCall,
      last_error: lastError,
    };
    if (lastError) { patch.status = "failed"; patch.completed_at = new Date().toISOString(); }
    else if (done) { patch.status = "complete"; patch.completed_at = new Date().toISOString(); }
    else { patch.status = "running"; }

    await admin.from("market_data_backfill_jobs").update(patch).eq("id", jobId);

    return json(200, {
      ok: true, job_id: jobId, status: patch.status,
      inserted_this_call: totalInserted, pages_this_call: pagesThisCall,
      cursor: cursor.toISOString(), more: !done && !lastError, error: lastError,
    });
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
});
