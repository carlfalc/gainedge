/**
 * RON snapshot worker — Phase 1A (XAUUSD 15m only).
 *
 * Modes:
 *   { mode: "live" }                                  -> snapshot the latest CLOSED 15m bar (no-op if present)
 *   { mode: "backfill", start, end, limit, force }    -> bounded chronological replay
 *
 * Guarantees: no future bars are used, no LLM calls, no order placement, idempotent upserts.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { computeRonSnapshot, RON_FEATURE_VERSION } from "../_shared/ron-features.ts";
import type { Candle } from "../_shared/falconer-strategy.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const WARMUP_BARS = 400;      // >= EMA200 + ADX warmup
const BAR_MS = 15 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  // Accept the env service-role key, or any service-role JWT (the pg_cron tick uses a
  // Vault-stored service-role key, which is a distinct but equally privileged token).
  const isServiceRoleJwt = (t: string) => {
    try {
      const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return p.role === "service_role";
    } catch { return false; }
  };
  if (!token || (token !== serviceKey && !isServiceRoleJwt(token))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body == live tick */ }
  const mode = body.mode === "backfill" ? "backfill" : "live";

  try {
    // ── load candles for the working window ──────────────────────────
    const loadCandles = async (fromIso: string | null, toIso: string): Promise<Candle[]> => {
      const rows: any[] = [];
      let cursor = toIso;
      // page backwards so we never rely on a single 1000-row page
      for (let page = 0; page < 12; page++) {
        let q = supabase
          .from("candle_history")
          .select("timestamp, open, high, low, close, volume")
          .eq("symbol", SYMBOL)
          .eq("timeframe", TIMEFRAME)
          .lte("timestamp", cursor)
          .order("timestamp", { ascending: false })
          .limit(1000);
        if (fromIso) q = q.gte("timestamp", fromIso);
        const { data, error } = await q;
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < 1000) break;
        cursor = new Date(new Date(data[data.length - 1].timestamp).getTime() - 1).toISOString();
      }
      return rows
        .map((c) => ({
          time: new Date(c.timestamp).getTime(),
          open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
          volume: c.volume == null ? undefined : Number(c.volume),
        }))
        .sort((a, b) => a.time - b.time);
    };

    const upsert = async (snaps: any[]) => {
      if (!snaps.length) return;
      const { error } = await supabase
        .from("ron_market_snapshots")
        .upsert(snaps, { onConflict: "symbol,timeframe,bar_time,feature_version" });
      if (error) throw error;
    };

    if (mode === "live") {
      // Latest CLOSED bar = newest stored bar whose close time has passed.
      const nowMs = Date.now();
      const { data: latest, error: le } = await supabase
        .from("candle_history")
        .select("timestamp")
        .eq("symbol", SYMBOL)
        .eq("timeframe", TIMEFRAME)
        .lte("timestamp", new Date(nowMs - BAR_MS).toISOString())
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (le) throw le;
      if (!latest) return json({ ok: true, mode, skipped: "no_candles" });

      const targetIso = new Date(latest.timestamp).toISOString();
      const { data: existing } = await supabase
        .from("ron_market_snapshots")
        .select("id")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("bar_time", targetIso).eq("feature_version", RON_FEATURE_VERSION)
        .maybeSingle();
      if (existing && !body.force) {
        return json({ ok: true, mode, skipped: "already_snapshotted", bar_time: targetIso });
      }

      const candles = await loadCandles(null, targetIso);
      if (candles.length < 30) return json({ ok: true, mode, skipped: "insufficient_history" });

      const snap = computeRonSnapshot(SYMBOL, TIMEFRAME, candles, { source: "candle_history" });
      // Freshness: a bar much older than one interval means the feed is behind (or market closed).
      const ageMin = (nowMs - new Date(targetIso).getTime()) / 60000;
      if (ageMin > 45 && snap.data_health === "healthy") snap.data_health = "stale";
      await upsert([snap]);
      return json({ ok: true, mode, bar_time: targetIso, data_health: snap.data_health, age_minutes: Math.round(ageMin) });
    }

    // ── backfill ─────────────────────────────────────────────────────
    const limit = Math.max(1, Math.min(Number(body.limit ?? 300), 800));
    const startIso = body.start ? new Date(body.start).toISOString() : null;
    const endIso = body.end ? new Date(body.end).toISOString() : new Date().toISOString();

    // Targets to snapshot, ascending from `start`.
    let tq = supabase
      .from("candle_history")
      .select("timestamp")
      .eq("symbol", SYMBOL)
      .eq("timeframe", TIMEFRAME)
      .lte("timestamp", endIso)
      .order("timestamp", { ascending: true })
      .limit(limit);
    if (startIso) tq = tq.gte("timestamp", startIso);
    const { data: targets, error: te } = await tq;
    if (te) throw te;
    if (!targets?.length) return json({ ok: true, mode, processed: 0, note: "no target bars" });

    const firstTarget = new Date(targets[0].timestamp).getTime();
    const lastTarget = new Date(targets[targets.length - 1].timestamp).getTime();
    // Load warmup history strictly BEFORE the first target plus the target range itself.
    const warmFromIso = new Date(firstTarget - WARMUP_BARS * BAR_MS * 3).toISOString();
    const all = await loadCandles(warmFromIso, new Date(lastTarget).toISOString());
    const indexOfTime = new Map<number, number>();
    all.forEach((c, idx) => indexOfTime.set(c.time, idx));

    const snaps: any[] = [];
    let skippedWarmup = 0;
    for (const t of targets) {
      const ms = new Date(t.timestamp).getTime();
      const idx = indexOfTime.get(ms);
      if (idx === undefined) continue;
      if (idx < 30) { skippedWarmup++; continue; }
      // NO LOOKAHEAD: slice ends at the target bar (inclusive).
      const window = all.slice(Math.max(0, idx - (WARMUP_BARS + 200) + 1), idx + 1);
      snaps.push(computeRonSnapshot(SYMBOL, TIMEFRAME, window, { source: "candle_history_backfill" }));
    }

    for (let k = 0; k < snaps.length; k += 200) await upsert(snaps.slice(k, k + 200));

    return json({
      ok: true,
      mode,
      processed: snaps.length,
      skipped_warmup: skippedWarmup,
      first_bar: snaps[0]?.bar_time ?? null,
      last_bar: snaps[snaps.length - 1]?.bar_time ?? null,
      next_cursor: snaps.length ? new Date(new Date(snaps[snaps.length - 1].bar_time).getTime() + 1).toISOString() : null,
    });
  } catch (e) {
    console.error("ron-snapshot error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});