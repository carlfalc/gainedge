/**
 * RON market snapshots (Phase 1A: XAUUSD 15m).
 *
 * Reads the deterministic feature snapshots computed server-side by the `ron-snapshot`
 * worker. The UI must never invent values: anything missing renders as "—" / "No data".
 */
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";

/**
 * The ONLY snapshot feature version the UI reads. v1 rows stay in the table for audit
 * but must never be mixed into current-state queries.
 */
export const CURRENT_RON_FEATURE_VERSION = 3;

export interface RonSnapshotRow {
  symbol: string;
  timeframe: string;
  bar_time: string;
  open: number; high: number; low: number; close: number;
  volume: number | null;
  features: Record<string, any>;
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

/** Latest RON snapshot per symbol, keyed by symbol. Live-updates via Realtime. */
export function useRonSnapshots() {
  const [data, setData] = useState<Map<string, RonSnapshotRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from("ron_market_snapshots")
      .select("symbol, timeframe, bar_time, open, high, low, close, volume, features, patterns, data_health, computed_at")
      .eq("feature_version", CURRENT_RON_FEATURE_VERSION)
      .order("bar_time", { ascending: false })
      .limit(200);
    const map = new Map<string, RonSnapshotRow>();
    for (const r of (rows as any[]) ?? []) {
      if (!map.has(r.symbol)) map.set(r.symbol, r as RonSnapshotRow);
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
  currentBar: string;
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
      const barMs = 15 * 60 * 1000;
      const currentBar = new Date(Math.floor(Date.now() / barMs) * barMs - barMs).toISOString();
      const [crit, warn, latest, current] = await Promise.all([
        base().eq("severity", "critical"),
        base().eq("severity", "warning"),
        supabase.from("ron_data_quality_flags").select("bar_time")
          .eq("symbol", symbol).eq("timeframe", timeframe)
          .eq("quality_version", CURRENT_RON_QUALITY_VERSION).eq("severity", "critical")
          .order("bar_time", { ascending: false }).limit(1).maybeSingle(),
        base().eq("severity", "critical").eq("bar_time", currentBar),
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