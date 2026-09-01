/**
 * RON market snapshots (Phase 1A: XAUUSD 15m).
 *
 * Reads the deterministic feature snapshots computed server-side by the `ron-snapshot`
 * worker. The UI must never invent values: anything missing renders as "—" / "No data".
 */
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";

/**
 * The ONLY snapshot feature version the LIVE dashboard reads. Production `ron-snapshot`
 * writes feature_version 7 (GAINEDGE_RON_PATTERN_EXPANSION_V1_LINEAGE_FIX: 11-pattern
 * catalogue semantics); older versions stay in the table for audit but must never be
 * mixed into current-state queries. v6 rows carry the legacy 7-pattern semantics and are
 * immutable legacy — never read as current, never overwritten.
 *
 * v7 is key-for-key and vocabulary-for-vocabulary identical to v6/v4 for every scalar
 * field the UI consumes (rsi14, adx14, macd_state, stoch_rsi, atr_pct, regime,
 * ema_stack), so no adapter and no change to `ronStateFrom()` is required.
 */
export const CURRENT_RON_SNAPSHOT_FEATURE_VERSION = 7;

/**
 * Research-lineage feature version used ONLY for the historical outcome-label pairing
 * (feature v4 ↔ label v5) reported as research progress. Deliberately NOT bumped here:
 * the labelled-outcome lineage is a separate accepted artifact.
 */
export const CURRENT_RON_FEATURE_VERSION = 4;


export interface RonSnapshotRow {
  symbol: string;
  timeframe: string;
  bar_time: string;
  open: number; high: number; low: number; close: number;
  volume: number | null;
  features: Record<string, any>;
  chart_annotations_v1: unknown[];
  patterns: any[];
  data_health: "healthy" | "stale" | "insufficient" | "error";
  computed_at: string;
}

export type RonState = "WAIT" | "WATCH" | "SETUP FORMING";

/**
 * Deterministic evidence label — mirrors `supabase/functions/_shared/ron-features.ts`.
 * This is NOT a probability or a confidence score and must never be presented as one.
 */
export function ronStateFrom(features: Record<string, any> | null | undefined): {
  state: RonState; why: string; next: string;
} | null {
  if (!features) return null;
  const adx = features.adx14 as number | null;
  const rsi = features.rsi14 as number | null;
  const regime = String(features.regime ?? "");
  const stack = String(features.ema_stack ?? "");
  const macd = String(features.macd_state ?? "");
  const trending = regime === "trending_up" || regime === "trending_down";
  const up = regime === "trending_up";

  let score = 0;
  if (trending) score += 2;
  if (adx != null && adx >= 25) score += 1;
  if (stack === "up" || stack === "down") score += 1;
  if (macd.startsWith(up ? "bullish" : "bearish")) score += 1;

  const state: RonState = score >= 4 ? "SETUP FORMING" : score >= 2 ? "WATCH" : "WAIT";
  const why = [
    `Regime is ${regime.replace("_", " ")}`,
    adx != null ? `ADX ${Number(adx).toFixed(1)} (${adx >= 25 ? "trend strength confirmed" : "trend strength weak"})` : "ADX unavailable",
    `EMA stack ${stack}`,
    rsi != null ? `RSI ${Number(rsi).toFixed(1)}` : "RSI unavailable",
    `MACD ${macd.replace("_", " ")}`,
  ].join(" · ");
  const next = state === "SETUP FORMING"
    ? "Needs a pullback to the 21 EMA holding, then a close back in trend direction."
    : state === "WATCH"
      ? "Needs ADX above 25 and the EMA stack to align before a setup can form."
      : "Needs a directional break out of the current range with expanding ADX.";
  return { state, why, next };
}

export const ronStateColor = (s: RonState) =>
  s === "SETUP FORMING" ? "#00CFA5" : s === "WATCH" ? "#F59E0B" : "#555F73";

export type RonBias = "LONG" | "SHORT";

/**
 * Directional side of the stored evidence, presentation only.
 * Derived from the same stored features the state label uses; null when the
 * stored evidence is not directionally explicit.
 */
export function ronBiasFrom(features: Record<string, any> | null | undefined): RonBias | null {
  if (!features) return null;
  const regime = String(features.regime ?? "");
  if (regime === "trending_up") return "LONG";
  if (regime === "trending_down") return "SHORT";
  const stack = String(features.ema_stack ?? "");
  if (stack === "up") return "LONG";
  if (stack === "down") return "SHORT";
  const macd = String(features.macd_state ?? "");
  if (macd.startsWith("bullish")) return "LONG";
  if (macd.startsWith("bearish")) return "SHORT";
  return null;
}


/**
 * Presentation label combining the deterministic state with its directional side.
 * Falls back to the bare state when the stored evidence is not directionally explicit.
 */
/** Presentation colour for a directional side: green long, red short. */
export function ronBiasColor(bias: string | null | undefined): string | null {
  if (bias === "LONG") return "#00CFA5";
  if (bias === "SHORT") return "#FF4D4D";
  return null;
}

/** Directional side implied by a rendered label ending in LONG/SHORT, if any. */
export function ronBiasFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  if (/\bLONG$/.test(label)) return "LONG";
  if (/\bSHORT$/.test(label)) return "SHORT";
  return null;
}

export function ronStateLabel(state: string, bias: string | null | undefined): string {
  return bias ? `${state} ${bias}` : state;
}

/** Latest RON snapshot per symbol, keyed by symbol. Live-updates via Realtime. */
export function useRonSnapshots() {
  const [data, setData] = useState<Map<string, RonSnapshotRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from("ron_market_snapshots")
      .select("symbol, timeframe, bar_time, open, high, low, close, volume, features, chart_annotations_v1, patterns, data_health, computed_at")
      .eq("feature_version", CURRENT_RON_SNAPSHOT_FEATURE_VERSION)
      .order("bar_time", { ascending: false })
      .limit(200);
    const map = new Map<string, RonSnapshotRow>();
    for (const r of (rows as any[]) ?? []) {
      if (!map.has(r.symbol)) {
        const annotations = Array.isArray(r.chart_annotations_v1) ? r.chart_annotations_v1 : [];
        map.set(r.symbol, {
          ...r,
          chart_annotations_v1: annotations,
          features: { ...(r.features ?? {}), chart_annotations_v1: annotations },
        } as RonSnapshotRow);
      }
    }
    setData(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`ron-snapshots-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ron_market_snapshots" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { snapshots: data, loading, reload: load };
}

/**
 * Phase 2A research-evidence status. Real counts from `ron_snapshot_outcomes` — this is
 * progress reporting only and must never be rendered as a probability or a win rate.
 */
export interface RonOutcomeStats {
  labelled: number;
  excluded: number;
  latestLabelledBar: string | null;
}

/**
 * The ONLY canonical outcome label version. v1 and v2 remain in the table for audit and
 * must never be mixed into current-state queries: v2's coverage-cause classifier compared
 * aggregate counts and could report an open-market data hole as a session boundary.
 */
export const CURRENT_RON_LABEL_VERSION = 5;

export function useRonOutcomeStats() {
  const [stats, setStats] = useState<RonOutcomeStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ok, ex, latest] = await Promise.all([
        supabase.from("ron_snapshot_outcomes").select("id", { count: "exact", head: true })
          .eq("feature_version", CURRENT_RON_FEATURE_VERSION)
          .eq("label_version", CURRENT_RON_LABEL_VERSION).eq("coverage_ok", true),
        supabase.from("ron_snapshot_outcomes").select("id", { count: "exact", head: true })
          .eq("feature_version", CURRENT_RON_FEATURE_VERSION)
          .eq("label_version", CURRENT_RON_LABEL_VERSION).eq("coverage_ok", false),
        supabase.from("ron_snapshot_outcomes").select("bar_time")
          .eq("feature_version", CURRENT_RON_FEATURE_VERSION)
          .eq("label_version", CURRENT_RON_LABEL_VERSION).eq("coverage_ok", true)
          .order("bar_time", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setStats({
        labelled: ok.count ?? 0,
        excluded: ex.count ?? 0,
        latestLabelledBar: (latest.data as any)?.bar_time ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return stats;
}

/**
 * Phase 2C data-integrity status, read from the deterministic quality flags produced by
 * the `ron-quality` detector. This reports SOURCE-DATA health only — it is never a
 * probability, a confidence score or a trading opinion.
 */
export const CURRENT_RON_QUALITY_VERSION = 3;

export interface RonDataQuality {
  critical: number;
  warning: number;
  latestCriticalBar: string | null;
  /**
   * Phase 2C.2 truthfulness: the CURRENT source state is a statement about the latest
   * completed source bar only. Historical warning/info counts are detail, not the headline.
   */
  currentSourceQuarantined: boolean;
  /**
   * The exact source anchor the headline describes: the latest clean RON snapshot bar
   * (feature v4). Null when no clean snapshot exists — the headline must then say
   * "Unavailable", never "Healthy".
   */
  currentBar: string | null;
}

export function useRonDataQuality(symbol = "XAUUSD", timeframe = "15m") {
  const [quality, setQuality] = useState<RonDataQuality | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = () => supabase.from("ron_data_quality_flags")
        .select("id", { count: "exact", head: true })
        .eq("symbol", symbol).eq("timeframe", timeframe)
        .eq("quality_version", CURRENT_RON_QUALITY_VERSION);
      /**
       * Phase 2C.2 closure: the "current source" anchor is the ACTUAL latest clean RON
       * snapshot bar the UI is displaying — never a browser wall-clock bucket. A guessed
       * bucket is wrong across venue breaks, weekends, delayed ingestion and stale feeds,
       * and could claim "Healthy" for a bar RON never evaluated.
       */
      const { data: anchorRow } = await supabase
        .from("ron_market_snapshots")
        .select("bar_time")
        .eq("symbol", symbol).eq("timeframe", timeframe)
        .eq("feature_version", CURRENT_RON_SNAPSHOT_FEATURE_VERSION)
        .order("bar_time", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      const currentBar = (anchorRow as any)?.bar_time
        ? new Date((anchorRow as any).bar_time).toISOString()
        : null;
      const [crit, warn, latest, current] = await Promise.all([
        base().eq("severity", "critical"),
        base().eq("severity", "warning"),
        supabase.from("ron_data_quality_flags").select("bar_time")
          .eq("symbol", symbol).eq("timeframe", timeframe)
          .eq("quality_version", CURRENT_RON_QUALITY_VERSION).eq("severity", "critical")
          .order("bar_time", { ascending: false }).limit(1).maybeSingle(),
        currentBar
          ? base().eq("severity", "critical").eq("bar_time", currentBar)
          : Promise.resolve({ count: 0 } as { count: number }),
      ]);
      if (cancelled) return;
      setQuality({
        critical: crit.count ?? 0,
        warning: warn.count ?? 0,
        latestCriticalBar: (latest.data as any)?.bar_time ?? null,
        currentSourceQuarantined: (current.count ?? 0) > 0,
        currentBar,
      });
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  return quality;
}

/**
 * Durable rebuild progress for the clean v4/v5 research lineage. While any stage is still
 * running the dashboard must say `Historical evidence: rebuilding` rather than implying
 * the evidence base is complete.
 */
export interface RonRebuildStatus {
  complete: boolean;
  stages: { stage: string; status: string; processed: number }[];
}

export function useRonRebuildStatus() {
  const [status, setStatus] = useState<RonRebuildStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ron_rebuild_jobs")
        .select("stage, status, processed")
        .order("stage_order", { ascending: true });
      if (cancelled) return;
      const stages = (data ?? []) as { stage: string; status: string; processed: number }[];
      setStatus({
        complete: stages.length > 0 && stages.every((s) => s.status === "completed"),
        stages,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return status;
}