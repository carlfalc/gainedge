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
import { buildEligibilityContract, RON_QUALITY_VERSION } from "../_shared/ron-quality-contract.ts";
import {
  buildEligibleSeries, windowAtEligibleIndex,
  RON_CANONICAL_WINDOW, RON_WINDOW_CONTRACT,
} from "../_shared/ron-window.ts";
import type { Candle } from "../_shared/falconer-strategy.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const WARMUP_BARS = 400;      // >= EMA200 + ADX warmup
/**
 * CANONICAL WINDOW (Phase 1B determinism fix).
 * Recursive indicators (EMA/RSI-Wilder/ADX) are seeded from the first bar of the input
 * slice, so a snapshot is only reproducible if EVERY caller feeds the SAME number of
 * preceding bars. Live and backfill therefore both compute on exactly the last
 * CANONICAL_WINDOW bars ending at (and including) the target bar. Shorter only when
 * less genuine history exists.
 */
const CANONICAL_WINDOW = RON_CANONICAL_WINDOW;
const BAR_MS = 15 * 60 * 1000;
const BAR_MINUTES = 15;

type SourceCandle = Candle & { created_at?: number | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** NY UTC offset (-4 EDT / -5 EST) for an instant. */
function nyOffsetHours(d: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour12: false,
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const nyAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24);
  const utcFloor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  return Math.round((nyAsUtc - utcFloor) / 3_600_000);
}

/** Deterministic XAUUSD schedule: Sun 17:00 NY → Fri 17:00 NY, 1h daily break at 17:00 NY. */
function marketOpen(now: Date): boolean {
  const ny = new Date(now.getTime() + nyOffsetHours(now) * 3_600_000);
  const day = ny.getUTCDay(), hour = ny.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && hour >= 17) return false;
  if (day === 0 && hour < 17) return false;
  if (hour === 17) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Authorization: EXACT secret match only. No unverified JWT claim is ever trusted.
  //   1) the Edge Function's own service-role secret, or
  //   2) a securely stored cron key, compared inside the database by
  //      public.ron_verify_cron_token (SECURITY DEFINER, service_role only).
  const timingSafeEq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let k = 0; k < a.length; k++) diff |= a.charCodeAt(k) ^ b.charCodeAt(k);
    return diff === 0;
  };
  let authorized = !!token && !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok, error: verr } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    if (verr) console.error("ron_verify_cron_token failed", verr.message);
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body == live tick */ }
  const mode = body.mode === "backfill" ? "backfill" : "live";

  try {
    /**
     * Phase 2C.1 — CENTRAL ELIGIBILITY CONTRACT.
     * Built once per request and applied identically to the live path and the backfill
     * path. Quarantined bars are removed from the anchor set AND from every recursive
     * input window, so a contaminated bar can never leak forward through EMA/RSI/ADX state.
     */
    const contract = await buildEligibilityContract(supabase, SYMBOL, TIMEFRAME, RON_QUALITY_VERSION);

    // ── load candles for the working window ──────────────────────────
    const loadCandles = async (fromIso: string | null, toIso: string): Promise<SourceCandle[]> => {
      const rows: any[] = [];
      let cursor = toIso;
      // page backwards so we never rely on a single 1000-row page
      for (let page = 0; page < 40; page++) {
        let q = supabase
          .from("candle_history")
          .select("timestamp, open, high, low, close, volume, created_at")
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
          created_at: c.created_at ? new Date(c.created_at).getTime() : null,
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
        .select("timestamp, created_at")
        .eq("symbol", SYMBOL)
        .eq("timeframe", TIMEFRAME)
        .lte("timestamp", new Date(nowMs - BAR_MS).toISOString())
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (le) throw le;
      if (!latest) return json({ ok: true, mode, skipped: "no_candles" });

      const targetIso = new Date(latest.timestamp).toISOString();
      // ── Phase 2C.1 quarantine (central contract) ───────────────────
      // A critically flagged source bar is a provider/ingestion artifact, never a genuine
      // opportunity. The raw candle is left untouched in candle_history; only the RON
      // opportunity write is refused.
      const targetBar = {
        time: new Date(targetIso).getTime(),
        created_at: (latest as any).created_at ? new Date((latest as any).created_at).getTime() : null,
      };
      if (contract.isQuarantined(targetBar, BAR_MINUTES)) {
        return json({
          ok: true, mode,
          skipped: "source_bar_quarantined",
          rule_code: contract.reasonFor(targetBar, BAR_MINUTES),
          rule_codes: contract.reasonsFor(targetBar, BAR_MINUTES),
          quality_version: RON_QUALITY_VERSION,
          bar_time: targetIso,
          presentation: "SOURCE ANOMALY QUARANTINED",
        });
      }
      const { data: existing } = await supabase
        .from("ron_market_snapshots")
        .select("id")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("bar_time", targetIso).eq("feature_version", RON_FEATURE_VERSION)
        .maybeSingle();
      if (existing && !body.force) {
        return json({ ok: true, mode, skipped: "already_snapshotted", bar_time: targetIso });
      }

      // CANONICAL WINDOW (feature v4): filter quarantined bars FIRST, then slice.
      const loaded = await loadCandles(null, targetIso);
      const { eligible, excludedAtOrBefore } = buildEligibleSeries(
        loaded, BAR_MINUTES, (b, m) => contract.isQuarantined(b, m),
      );
      const idx = eligible.length - 1;
      if (idx < 0 || eligible[idx].time !== new Date(targetIso).getTime()) {
        return json({ ok: true, mode, skipped: "target_not_eligible", bar_time: targetIso });
      }
      const candles = windowAtEligibleIndex(eligible, idx, CANONICAL_WINDOW);
      if (candles.length < 30) return json({ ok: true, mode, skipped: "insufficient_history" });

      const snap = computeRonSnapshot(SYMBOL, TIMEFRAME, candles, {
        source: "candle_history",
        quarantinedExcluded: excludedAtOrBefore[idx],
        qualityVersion: RON_QUALITY_VERSION,
        windowContract: RON_WINDOW_CONTRACT,
        eligibleCount: idx + 1,
      });
      // Freshness: only call the feed stale when the market should actually be open.
      const ageMin = (nowMs - new Date(targetIso).getTime()) / 60000;
      const isOpen = marketOpen(new Date(nowMs));
      if (ageMin > 45 && isOpen && snap.data_health === "healthy") snap.data_health = "stale";
      await upsert([snap]);
      return json({
        ok: true, mode, bar_time: targetIso,
        data_health: snap.data_health,
        market_open: isOpen,
        presentation: ageMin <= 35 ? "LIVE" : isOpen ? "STALE / FEED BEHIND" : "MARKET CLOSED",
        age_minutes: Math.round(ageMin),
      });
    }

    // ── backfill ─────────────────────────────────────────────────────
    const limit = Math.max(1, Math.min(Number(body.limit ?? 300), 800));
    const startIso = body.start ? new Date(body.start).toISOString() : null;
    const endIso = body.end ? new Date(body.end).toISOString() : new Date().toISOString();

    // Targets to snapshot, ascending from `start`.
    let tq = supabase
      .from("candle_history")
      .select("timestamp, created_at")
      .eq("symbol", SYMBOL)
      .eq("timeframe", TIMEFRAME)
      .lte("timestamp", endIso)
      .order("timestamp", { ascending: true })
      .limit(limit);
    if (startIso) tq = tq.gte("timestamp", startIso);
    const { data: targets, error: te } = await tq;
    if (te) throw te;
    if (!targets?.length) return json({ ok: true, mode, processed: 0, note: "no target bars" });

    const lastTarget = new Date(targets[targets.length - 1].timestamp).getTime();
    /**
     * The canonical v4 contract is "last 1500 QUALITY-ELIGIBLE bars at or before target",
     * so the backfill must see the full at-or-before history exactly like the live path.
     * Loading from the beginning of history (not a warmup guess) is what makes
     * live/backfill parity provable.
     */
    const all = await loadCandles(null, new Date(lastTarget).toISOString());
    const { eligible, excludedAtOrBefore } = buildEligibleSeries(
      all, BAR_MINUTES, (b, m) => contract.isQuarantined(b, m),
    );
    const eligibleIndexOfTime = new Map<number, number>();
    eligible.forEach((c, i) => eligibleIndexOfTime.set(c.time, i));

    const snaps: any[] = [];
    let skippedWarmup = 0;
    let skippedQuarantined = 0;
    const quarantinedAnchors: { bar_time: string; rule_codes: string[] }[] = [];
    // Phase 1B correction: no arbitrary warmup skip. computeRonSnapshot is proven safe
    // with <30 bars (indicators return null, data_health = "insufficient"), so every
    // genuine source bar gets a row. `min_bars` can still be set explicitly if needed.
    const minBars = Math.max(1, Number(body.min_bars ?? 1));
    for (const t of targets) {
      const ms = new Date(t.timestamp).getTime();
      const anchorBar = {
        time: ms,
        created_at: (t as any).created_at ? new Date((t as any).created_at).getTime() : null,
      };
      // Quarantined bars can never be an anchor (feature v4 contract, step 5).
      if (contract.isQuarantined(anchorBar, BAR_MINUTES)) {
        skippedQuarantined++;
        if (quarantinedAnchors.length < 50) {
          quarantinedAnchors.push({
            bar_time: new Date(ms).toISOString(),
            rule_codes: contract.reasonsFor(anchorBar, BAR_MINUTES),
          });
        }
        continue;
      }
      const idx = eligibleIndexOfTime.get(ms);
      if (idx === undefined) continue;
      if (idx + 1 < minBars) { skippedWarmup++; continue; }
      // NO LOOKAHEAD: the eligible series ends at the target bar (inclusive).
      const window = windowAtEligibleIndex(eligible, idx, CANONICAL_WINDOW);
      if (!window.length) { skippedQuarantined++; continue; }
      snaps.push(computeRonSnapshot(SYMBOL, TIMEFRAME, window, {
        source: "candle_history_backfill",
        quarantinedExcluded: excludedAtOrBefore[idx],
        qualityVersion: RON_QUALITY_VERSION,
        windowContract: RON_WINDOW_CONTRACT,
        eligibleCount: idx + 1,
      }));
    }

    for (let k = 0; k < snaps.length; k += 200) await upsert(snaps.slice(k, k + 200));

    return json({
      ok: true,
      mode,
      targets: targets.length,
      processed: snaps.length,
      skipped_warmup: skippedWarmup,
      skipped_quarantined: skippedQuarantined,
      quarantined_anchors: quarantinedAnchors,
      feature_version: RON_FEATURE_VERSION,
      quality_version: RON_QUALITY_VERSION,
      first_bar: snaps[0]?.bar_time ?? null,
      last_bar: snaps[snaps.length - 1]?.bar_time ?? null,
      next_cursor: targets.length
        ? new Date(new Date(targets[targets.length - 1].timestamp).getTime() + 1).toISOString()
        : null,
    });
  } catch (e) {
    console.error("ron-snapshot error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});