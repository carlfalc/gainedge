/**
 * RON outcome labeller — Phase 2A (XAUUSD 15m snapshots, 1m forward resolution).
 *
 * Modes:
 *   { mode: "backfill", start, end, limit, horizons? }  -> bounded chronological labelling
 *   { mode: "single", bar_time, horizons?, data_end? }  -> label ONE snapshot; `data_end`
 *      truncates the forward dataset (used by the no-lookahead acceptance test) and is
 *      never persisted.
 *
 * Guarantees: strictly-forward windows, genuine 1m candles only, never synthesises or
 * bridges the known 1m outage, idempotent upserts, no order placement, no LLM.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { labelOutcome, metricHash, type FwdBar } from "../_shared/ron-outcomes.ts";
import { labelOutcomeV2, metricHashV2 } from "../_shared/ron-outcomes-v2.ts";
import { classifyRonSession, xauVenueOpen } from "../_shared/ron-sessions.ts";

const SYMBOL = "XAUUSD";
const TIMEFRAME = "15m";
const FEATURE_VERSION = 2;
const DEFAULT_LABEL_VERSION = 2;   // v1 rows are preserved untouched for audit
const BAR_MS = 15 * 60 * 1000;
const RES_MS = 60 * 1000;              // 1-minute forward resolution
const RES_LABEL = "1m";
const DEFAULT_HORIZONS = [15, 30, 60, 120, 240];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Authorization: exact secret match only, never a decoded JWT claim.
  const eq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  let authorized = !!token && !!serviceKey && eq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await supabase.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* live tick */ }

  const horizons: number[] = Array.isArray(body.horizons) && body.horizons.length
    ? body.horizons.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : DEFAULT_HORIZONS;
  const maxHorizon = Math.max(...horizons);
  const LABEL_VERSION = Number(body.label_version ?? DEFAULT_LABEL_VERSION) === 1 ? 1 : 2;

  try {
    /** All stored 1m bars in [fromIso, toIso], paged so we never rely on one page. */
    const load1m = async (fromIso: string, toIso: string): Promise<FwdBar[]> => {
      const out: FwdBar[] = [];
      let cursor = fromIso;
      for (let page = 0; page < 40; page++) {
        const { data, error } = await supabase
          .from("candle_history")
          .select("timestamp, open, high, low, close")
          .eq("symbol", SYMBOL).eq("timeframe", "1m")
          .gte("timestamp", cursor).lte("timestamp", toIso)
          .order("timestamp", { ascending: true })
          .limit(1000);
        if (error) throw error;
        if (!data?.length) break;
        for (const c of data) {
          out.push({
            time: new Date(c.timestamp).getTime(),
            open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
          });
        }
        if (data.length < 1000) break;
        cursor = new Date(out[out.length - 1].time + 1).toISOString();
      }
      return out;
    };

    // ── select snapshots to label ────────────────────────────────────
    let snaps: any[] = [];
    if (body.mode === "single") {
      if (!body.bar_time) return json({ error: "bar_time required for mode=single" }, 400);
      const iso = new Date(body.bar_time).toISOString();
      const { data, error } = await supabase
        .from("ron_market_snapshots")
        .select("bar_time, close, features")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("feature_version", FEATURE_VERSION).eq("bar_time", iso)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "snapshot not found", bar_time: iso }, 404);
      snaps = [data];
    } else {
      const limit = Math.max(1, Math.min(Number(body.limit ?? 200), 500));
      let q = supabase
        .from("ron_market_snapshots")
        .select("bar_time, close, features")
        .eq("symbol", SYMBOL).eq("timeframe", TIMEFRAME)
        .eq("feature_version", FEATURE_VERSION)
        .order("bar_time", { ascending: true })
        .limit(limit);
      if (body.start) q = q.gte("bar_time", new Date(body.start).toISOString());
      if (body.end) q = q.lte("bar_time", new Date(body.end).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      snaps = data ?? [];
    }
    if (!snaps.length) return json({ ok: true, mode: body.mode ?? "backfill", processed: 0, note: "no snapshots in range" });

    // ── load the forward 1m dataset once for the whole batch ─────────
    const firstAnchorClose = new Date(snaps[0].bar_time).getTime() + BAR_MS;
    const lastHorizonEnd = new Date(snaps[snaps.length - 1].bar_time).getTime() + BAR_MS + maxHorizon * 60_000;
    // `data_end` truncates the visible future (no-lookahead acceptance harness only).
    const dataEnd = body.data_end ? new Date(body.data_end).getTime() : lastHorizonEnd;
    const fwd = await load1m(
      new Date(firstAnchorClose).toISOString(),
      new Date(Math.min(lastHorizonEnd, dataEnd)).toISOString(),
    );

    const nowMs = Date.now();
    const rows: any[] = [];
    const hashes: Record<string, string> = {};
    const summary: Record<string, number> = {};

    for (const s of snaps) {
      const t = new Date(s.bar_time).getTime();
      const atr = s.features?.atr14 == null ? null : Number(s.features.atr14);
      const ctx = classifyRonSession(t);
      const anchor = Number(s.close);

      for (const h of horizons) {
        const horizonEnd = t + BAR_MS + h * 60_000;

        if (LABEL_VERSION === 2) {
          const l = labelOutcomeV2(t, BAR_MS, anchor, atr, fwd, h, RES_MS, RES_LABEL, nowMs, xauVenueOpen);
          const key = `${new Date(t).toISOString()}|${h}`;
          const hash = await metricHashV2(l);
          hashes[key] = hash;
          const bucket = l.coverage_ok ? "ok" : `excluded_${l.coverage_class}`;
          summary[bucket] = (summary[bucket] ?? 0) + 1;
          summary[`session_${ctx.session}${l.coverage_ok ? "_ok" : "_excluded"}`] =
            (summary[`session_${ctx.session}${l.coverage_ok ? "_ok" : "_excluded"}`] ?? 0) + 1;
          if (l.coverage_ok) {
            summary[`long_${l.long.first_hit}`] = (summary[`long_${l.long.first_hit}`] ?? 0) + 1;
            summary[`short_${l.short.first_hit}`] = (summary[`short_${l.short.first_hit}`] ?? 0) + 1;
          }
          rows.push({
            symbol: SYMBOL, timeframe: TIMEFRAME,
            bar_time: new Date(t).toISOString(),
            feature_version: FEATURE_VERSION, label_version: 2,
            horizon_minutes: h,
            session: ctx.session, session_overlap: ctx.overlap,
            anchor_price: anchor, atr_at_anchor: atr,
            forward_close: l.forward_close,
            forward_return_pct: l.forward_return_pct,
            forward_return_atr: l.forward_return_atr,
            // legacy columns intentionally left NULL for v2 — their v1 meaning is ambiguous
            mfe_price: null, mae_price: null, mfe_pct: null, mae_pct: null,
            mfe_atr: null, mae_atr: null,
            long_excursion_atr: null, short_excursion_atr: null,
            max_high_price: l.max_high_price, min_low_price: l.min_low_price,
            long_mfe_price: l.long_mfe_price, long_mae_price: l.long_mae_price,
            short_mfe_price: l.short_mfe_price, short_mae_price: l.short_mae_price,
            long_mfe_atr_v2: l.long_mfe_atr, long_mae_atr_v2: l.long_mae_atr,
            short_mfe_atr_v2: l.short_mfe_atr, short_mae_atr_v2: l.short_mae_atr,
            barrier_atr_mult: l.barrier_atr_mult, barrier_version: l.barrier_version,
            long_first_hit: l.long.first_hit, long_success: l.long.success,
            long_event_eligible: l.long.event_eligible, long_first_hit_time: l.long.first_hit_time,
            short_first_hit: l.short.first_hit, short_success: l.short.success,
            short_event_eligible: l.short.event_eligible, short_first_hit_time: l.short.first_hit_time,
            bars_used: l.bars_used,
            first_bar_time: l.first_bar_time,
            last_bar_time: l.last_bar_time,
            data_resolution: RES_LABEL,
            data_source: "candle_history_1m",
            coverage_ok: l.coverage_ok,
            coverage_class: l.coverage_class,
            exclusion_reason: l.exclusion_reason,
            metric_hash: hash,
            labelled_at: new Date().toISOString(),
          });
          continue;
        }

        let label = labelOutcome(t, BAR_MS, anchor, atr, fwd, h, RES_MS, RES_LABEL);
        // The horizon simply has not happened yet — that is not a data defect.
        if (!label.coverage_ok && horizonEnd > nowMs) {
          label = { ...label, exclusion_reason: "horizon_not_elapsed" };
        }
        const key = `${new Date(t).toISOString()}|${h}`;
        hashes[key] = await metricHash(label);
        const bucket = label.coverage_ok ? "ok" : `excluded_${label.exclusion_reason}`;
        summary[bucket] = (summary[bucket] ?? 0) + 1;
        summary[`session_${ctx.session}${label.coverage_ok ? "_ok" : "_excluded"}`] =
          (summary[`session_${ctx.session}${label.coverage_ok ? "_ok" : "_excluded"}`] ?? 0) + 1;

        rows.push({
          symbol: SYMBOL, timeframe: TIMEFRAME,
          bar_time: new Date(t).toISOString(),
          feature_version: FEATURE_VERSION, label_version: 1,
          horizon_minutes: h,
          session: ctx.session, session_overlap: ctx.overlap,
          anchor_price: anchor, atr_at_anchor: atr,
          forward_close: label.forward_close,
          forward_return_pct: label.forward_return_pct,
          forward_return_atr: label.forward_return_atr,
          mfe_price: label.mfe_price, mae_price: label.mae_price,
          mfe_pct: label.mfe_pct, mae_pct: label.mae_pct,
          mfe_atr: label.mfe_atr, mae_atr: label.mae_atr,
          long_excursion_atr: label.long_excursion_atr,
          short_excursion_atr: label.short_excursion_atr,
          bars_used: label.bars_used,
          first_bar_time: label.first_bar_time,
          last_bar_time: label.last_bar_time,
          data_resolution: RES_LABEL,
          data_source: "candle_history_1m",
          coverage_ok: label.coverage_ok,
          exclusion_reason: label.exclusion_reason,
          labelled_at: new Date().toISOString(),
        });
      }
    }

    if (body.dry_run !== true) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("ron_snapshot_outcomes")
          .upsert(rows.slice(i, i + 200), {
            onConflict: "symbol,timeframe,bar_time,feature_version,label_version,horizon_minutes,data_resolution",
          });
        if (error) throw error;
      }
    }

    return json({
      ok: true,
      mode: body.mode ?? "backfill",
      snapshots: snaps.length,
      rows: rows.length,
      horizons,
      summary,
      hashes: body.mode === "single" || body.with_hashes ? hashes : undefined,
      first_bar: snaps[0].bar_time,
      last_bar: snaps[snaps.length - 1].bar_time,
      next_cursor: new Date(new Date(snaps[snaps.length - 1].bar_time).getTime() + 1).toISOString(),
    });
  } catch (e) {
    console.error("ron-label error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
