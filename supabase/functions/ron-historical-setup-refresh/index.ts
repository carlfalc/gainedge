/**
 * Forward historical-setup observation worker.
 *
 * Converts stored v7 snapshots plus genuine subsequent 15m candles into append-only,
 * replayable setup outcome rows for every selected RON market. This is the measured data
 * source behind specialist historical commentary. It never calls an LLM or a broker and
 * it never places an order.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { RON_FEATURE_VERSION } from "../_shared/ron-features.ts";
import {
  RON_SELECTED_WATCH_INSTRUMENTS,
} from "../_shared/ron-agentic-watch-universe-v1.ts";
import { buildRonSessionContextV5 } from "../_shared/ron-session-context-v5.ts";
import {
  buildHistoricalSetupObservationsV1,
  RON_HISTORICAL_SETUP_HORIZON_BARS,
} from "../_shared/ron-historical-setup-observation-v1.ts";
import type { RonChartAnnotationV1 } from "../_shared/ron-chart-annotation-v1.ts";
import type { Candle } from "../_shared/falconer-strategy.ts";

const BAR_MS = 15 * 60_000;
const TIMEFRAME = "15m";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function candle(row: Record<string, unknown>): Candle | null {
  const out: Candle = {
    time: Date.parse(String(row.timestamp)),
    open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
    volume: row.volume == null ? undefined : Number(row.volume),
  };
  return [out.time, out.open, out.high, out.low, out.close].every(Number.isFinite) ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });
  let authorized = !!token && !!serviceKey && timingSafeEq(token, serviceKey);
  if (!authorized && token) {
    const { data: ok } = await db.rpc("ron_verify_cron_token", { _token: token });
    authorized = ok === true;
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const instrument = String(body.instrument ?? "").trim().toUpperCase();
  if (!(RON_SELECTED_WATCH_INSTRUMENTS as readonly string[]).includes(instrument)) {
    return json({ error: "instrument_not_in_selected_watch", instrument }, 400);
  }
  const horizonBars = Math.max(1, Math.min(16,
    Math.floor(Number(body.horizon_bars ?? RON_HISTORICAL_SETUP_HORIZON_BARS))));
  const limit = Math.max(1, Math.min(500, Math.floor(Number(body.limit ?? 250))));
  const endIso = body.end ? new Date(String(body.end)).toISOString() : new Date().toISOString();
  const startIso = body.start
    ? new Date(String(body.start)).toISOString()
    : new Date(Date.parse(endIso) - 90 * 24 * 60 * 60_000).toISOString();

  try {
    const { data: snapshots, error: snapshotError } = await db
      .from("ron_market_snapshots")
      .select("bar_time,open,high,low,close,volume,features,chart_annotations_v1")
      .eq("symbol", instrument).eq("timeframe", TIMEFRAME)
      .eq("feature_version", RON_FEATURE_VERSION)
      .gte("bar_time", startIso).lte("bar_time", endIso)
      .order("bar_time", { ascending: true }).limit(limit);
    if (snapshotError) throw snapshotError;
    if (!snapshots?.length) {
      return json({ ok: true, instrument, processed_snapshots: 0, observations: 0 });
    }

    const firstMs = Date.parse(String(snapshots[0].bar_time));
    const lastMs = Date.parse(String(snapshots[snapshots.length - 1].bar_time));
    const { data: candleRows, error: candleError } = await db
      .from("candle_history")
      .select("timestamp,open,high,low,close,volume")
      .eq("symbol", instrument).eq("timeframe", TIMEFRAME)
      .gte("timestamp", new Date(firstMs).toISOString())
      .lte("timestamp", new Date(lastMs + horizonBars * BAR_MS).toISOString())
      .order("timestamp", { ascending: true }).limit(limit + horizonBars + 20);
    if (candleError) throw candleError;
    const bars = (candleRows ?? []).map((r) => candle(r)).filter((r): r is Candle => !!r);
    const byTime = new Map(bars.map((b) => [b.time, b]));

    const observations: Record<string, unknown>[] = [];
    let incompleteFuture = 0;
    let noTechnicalSetups = 0;
    for (const snapshot of snapshots) {
      const barTime = Date.parse(String(snapshot.bar_time));
      const anchorBar = byTime.get(barTime);
      if (!anchorBar) continue;
      const annotations = Array.isArray(snapshot.chart_annotations_v1)
        ? snapshot.chart_annotations_v1 as unknown as RonChartAnnotationV1[]
        : [];
      if (!annotations.length) { noTechnicalSetups++; continue; }
      const future = bars.filter((b) => b.time > barTime && b.time <= barTime + horizonBars * BAR_MS);
      const evaluationAnchor = new Date(barTime + BAR_MS).toISOString();
      const session = buildRonSessionContextV5({
        instrument,
        evaluation_anchor: evaluationAnchor,
        native_completed_bar: instrument === "HK50"
          ? { bar_open: new Date(barTime).toISOString(), timeframe_minutes: 15 }
          : null,
      });
      const features = snapshot.features && typeof snapshot.features === "object"
        ? snapshot.features as Record<string, unknown>
        : {};
      const built = buildHistoricalSetupObservationsV1({
        instrument,
        timeframe: TIMEFRAME,
        snapshot_bar_time: new Date(barTime).toISOString(),
        snapshot_bar: anchorBar,
        atr_at_anchor: features.atr14 == null ? null : Number(features.atr14),
        volatility_regime: String(features.volatility_regime ?? features.regime ?? "unknown"),
        annotations,
        forward_bars: future,
        session_context: session,
        horizon_bars: horizonBars,
      });
      if (!built.length && future.length < horizonBars) incompleteFuture++;
      observations.push(...built.map((row) => ({
        observation_version: row.observation_version,
        symbol: row.instrument,
        timeframe: row.timeframe,
        bar_time: new Date(barTime).toISOString(),
        evaluation_anchor: row.evaluation_anchor,
        future_data_cutoff: row.future_data_cutoff,
        setup_id: row.setup_id,
        source_agent: row.source_agent,
        direction_context: row.direction_context,
        weekday: row.weekday,
        session: row.session,
        local_time_bucket: row.local_time_bucket,
        volatility_regime: row.volatility_regime,
        horizon_bars: row.horizon_bars,
        outcome_atr_threshold: row.outcome_atr_threshold,
        outcome_observed: row.outcome_observed,
        favourable_excursion_price: row.favourable_excursion_price,
        adverse_excursion_price: row.adverse_excursion_price,
        point_size: row.point_size,
        bars_to_peak_favourable: row.bars_to_peak_favourable,
        aligned_ha_candles_15m: row.aligned_ha_candles_15m,
      })));
    }

    for (let i = 0; i < observations.length; i += 200) {
      const { error } = await db.from("ron_historical_setup_observations")
        .upsert(observations.slice(i, i + 200), {
          onConflict: "symbol,timeframe,bar_time,setup_id,direction_context,horizon_bars,observation_version",
        });
      if (error) throw error;
    }

    return json({
      ok: true,
      instrument,
      timeframe: TIMEFRAME,
      feature_version: RON_FEATURE_VERSION,
      horizon_bars: horizonBars,
      processed_snapshots: snapshots.length,
      observations: observations.length,
      incomplete_future_horizons: incompleteFuture,
      snapshots_without_technical_setups: noTechnicalSetups,
      first_bar: snapshots[0].bar_time,
      last_bar: snapshots[snapshots.length - 1].bar_time,
      next_cursor: new Date(lastMs + 1).toISOString(),
      execution_allowed: false,
    });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
