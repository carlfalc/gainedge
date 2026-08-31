import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildHistoricalSetupObservationsV1,
  buildSpecialistHistoricalCommentariesV1,
  currentHistoricalSetupsV1,
  type HistoricalSetupObservationV1,
} from "../../supabase/functions/_shared/ron-historical-setup-observation-v1.ts";
import { buildRonSessionContextV5 } from "../../supabase/functions/_shared/ron-session-context-v5.ts";
import type { RonChartAnnotationV1 } from "../../supabase/functions/_shared/ron-chart-annotation-v1.ts";

const at = Date.parse("2026-08-03T08:00:00.000Z");

function emaAnnotation(direction: "bullish" | "bearish" = "bullish"): RonChartAnnotationV1 {
  return {
    annotation_version: 1,
    id: "XAUUSD:15m:ema_9_21_bull_cross",
    symbol: "XAUUSD",
    timeframe: "15m",
    kind: "ema_event",
    subtype: direction === "bullish" ? "ema_9_21_bull_cross" : "ema_9_21_bear_cross",
    direction,
    lifecycle: "detected",
    source_agent: "pattern_context",
    source_setup_id: direction === "bullish" ? "ema_9_21_bull_cross" : "ema_9_21_bear_cross",
    as_of_bar_time: new Date(at).toISOString(),
    origin_anchor: { bar_time: new Date(at).toISOString(), price: 2400 },
    geometry: {
      type: "ema_event", event: "cross", fast_period: 9, slow_period: 21,
      event_anchor: { bar_time: new Date(at).toISOString(), price: 2400 },
      fast_value: 2399.8, slow_value: 2399.5,
    },
  };
}

const bar = (i: number, open: number, high: number, low: number, close: number) => ({
  time: at + i * 15 * 60_000, open, high, low, close,
});

describe("RON historical setup runtime V1", () => {
  it("measures potential points, bars to peak and closed HA continuation from genuine future bars", () => {
    const session = buildRonSessionContextV5({
      instrument: "XAUUSD", evaluation_anchor: at + 15 * 60_000,
    });
    const rows = buildHistoricalSetupObservationsV1({
      instrument: "XAUUSD", timeframe: "15m",
      snapshot_bar_time: new Date(at).toISOString(),
      snapshot_bar: bar(0, 2399.5, 2400.4, 2399.2, 2400),
      atr_at_anchor: 2,
      volatility_regime: "normal",
      annotations: [emaAnnotation()],
      forward_bars: [
        bar(1, 2400, 2401.2, 2399.8, 2401),
        bar(2, 2401, 2402.4, 2400.8, 2402.1),
        bar(3, 2402.1, 2403.4, 2401.9, 2403.1),
        bar(4, 2403.1, 2403.2, 2402.6, 2402.9),
      ],
      session_context: session,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome_observed).toBe(true); // 3.4 points >= 0.8 * ATR(2)
    expect(rows[0].favourable_excursion_price).toBe(3.4);
    expect(rows[0].bars_to_peak_favourable).toBe(3);
    expect(rows[0].point_size).toBe(1);
    expect(rows[0].aligned_ha_candles_15m).toBeGreaterThanOrEqual(3);
    expect(rows[0].future_data_cutoff).toBe("2026-08-03T09:15:00.000Z");
  });

  it("uses the narrowest sufficiently sampled cohort and attributes commentary to the specialist", () => {
    const session = buildRonSessionContextV5({
      instrument: "XAUUSD", evaluation_anchor: at + 15 * 60_000,
    });
    const setup = currentHistoricalSetupsV1([emaAnnotation()]);
    const observations: HistoricalSetupObservationV1[] = Array.from({ length: 12 }, (_, i) => ({
      observation_version: 1,
      setup_id: "ema_9_21_bull_cross",
      source_agent: "pattern_context",
      horizon_bars: 4,
      outcome_atr_threshold: 0.8,
      instrument: "XAUUSD",
      timeframe: "15m",
      evaluation_anchor: new Date(Date.parse("2026-06-01T08:15:00.000Z") + i * 24 * 60 * 60_000).toISOString(),
      future_data_cutoff: new Date(Date.parse("2026-06-01T09:15:00.000Z") + i * 24 * 60 * 60_000).toISOString(),
      weekday: i % 2 ? "Tuesday" : "Monday",
      session: session.session_label,
      local_time_bucket: i % 2 ? "09:15" : session.local_time_bucket,
      pattern: "ema_9_21_bull_cross",
      direction_context: "bullish",
      volatility_regime: i % 2 ? "high" : "normal",
      outcome_observed: i < 9,
      favourable_excursion_price: i < 9 ? 12 : 5,
      adverse_excursion_price: 3,
      point_size: 1,
      bars_to_peak_favourable: 3,
      aligned_ha_candles_15m: i < 8 ? 4 : 2,
    }));
    const comments = buildSpecialistHistoricalCommentariesV1({
      instrument: "XAUUSD", timeframe: "15m", current_setups: setup,
      current_session: session, volatility_regime: "normal", observations,
      lookback_start: "2026-05-01T00:00:00.000Z",
      lookback_end: "2026-08-31T00:00:00.000Z",
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].source_agent).toBe("pattern_context");
    expect(comments[0].selected_cohort).toBe("session");
    expect(comments[0].commentary).toContain("9 of 12 observations (75%)");
    expect(comments[0].commentary).toContain("average favourable excursion was 12 points");
    expect(comments[0].commentary).toContain("Heikin Ashi candles");
    expect(comments[0].commentary).toContain("not realised trade profit or a prediction");
  });

  it("wires GER40 through venue V3 and persists specialist commentary in Opportunity Context V2", () => {
    const root = process.cwd();
    const runtime = readFileSync(`${root}/supabase/functions/ron-opportunity-context/index.ts`, "utf8");
    const refresh = readFileSync(`${root}/supabase/functions/ron-historical-setup-refresh/index.ts`, "utf8");
    const scheduler = readFileSync(`${root}/supabase/functions/ron-context-scheduler/index.ts`, "utf8");
    const migration = readFileSync(
      `${root}/supabase/migrations/20260831091000_ron_historical_setup_commentary_v1.sql`, "utf8",
    );
    expect(runtime).toContain("assessVenueV3(instrument");
    expect(runtime).toContain('.from("ron_historical_setup_observations")');
    expect(runtime).toContain("specialist_commentary_v1");
    expect(refresh).toContain("RON_SELECTED_WATCH_INSTRUMENTS");
    expect(scheduler).toContain("/functions/v1/ron-historical-setup-refresh");
    expect(scheduler).toContain("historical_setup_refresh: historicalRefresh");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ron_historical_setup_observations");
  });
});
