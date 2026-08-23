/**
 * GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — read-only reconstruction of the exact
 * quality-eligible candle window the RON pattern detector scanned.
 *
 * Reads two existing tables under existing RLS (both readable by `authenticated`):
 *   - `candle_history`         (completed historical candles at or before the anchor)
 *   - `ron_data_quality_flags` (severity `critical`, quality_version 5)
 *
 * It writes nothing, calls no edge function, and never loads a candle after the anchor.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildPatternWindow,
  toPreviewCandles,
  PATTERN_PREVIEW_QUALITY_VERSION,
  PATTERN_PREVIEW_WINDOW_BARS,
  type PatternWindow,
  type PreviewCandleRow,
} from "@/lib/pattern-preview";

/** Minutes per bar from a timeframe string ("15m", "1h", "4h", "1d"). */
export function timeframeMinutes(tf: string | null | undefined): number | null {
  const m = String(tf ?? "").trim().toLowerCase().match(/^(\d+)\s*(m|h|d)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
}

/**
 * Raw candles are fetched with generous headroom so that, after quarantined bars are
 * removed, a full detector window is still available.
 */
const RAW_FETCH_BARS = PATTERN_PREVIEW_WINDOW_BARS * 4;

export interface PatternWindowResult extends PatternWindow {
  /** Persisted critical bar_times applied to the fetched range. */
  quarantinedApplied: number;
  qualityVersion: number;
  error: string | null;
}

export async function loadPatternPreviewWindow(
  symbol: string,
  timeframe: string,
  barTimeIso: string,
): Promise<PatternWindowResult> {
  const empty = (reason: PatternWindow["reason"], error: string | null): PatternWindowResult => ({
    candles: [], excluded: 0, aligned: false, reason,
    quarantinedApplied: 0, qualityVersion: PATTERN_PREVIEW_QUALITY_VERSION, error,
  });

  const minutes = timeframeMinutes(timeframe);
  const anchorMs = new Date(barTimeIso).getTime();
  if (minutes == null || !Number.isFinite(anchorMs)) {
    return empty("anchor_not_eligible", "Unrecognised timeframe or bar time");
  }
  const anchorIso = new Date(anchorMs).toISOString();
  const fromIso = new Date(anchorMs - RAW_FETCH_BARS * minutes * 60_000).toISOString();

  const [candleRes, flagRes] = await Promise.all([
    supabase
      .from("candle_history")
      .select("timestamp, open, high, low, close, volume, created_at")
      .eq("symbol", symbol)
      .eq("timeframe", timeframe)
      .gte("timestamp", fromIso)
      .lte("timestamp", anchorIso)
      .order("timestamp", { ascending: false })
      .limit(1000),
    supabase
      .from("ron_data_quality_flags")
      .select("bar_time")
      .eq("symbol", symbol)
      .eq("timeframe", timeframe)
      .eq("quality_version", PATTERN_PREVIEW_QUALITY_VERSION)
      .eq("severity", "critical")
      .gte("bar_time", fromIso)
      .lte("bar_time", anchorIso)
      .limit(1000),
  ]);

  if (candleRes.error) return empty("anchor_not_eligible", candleRes.error.message);
  // Quality flags MUST be readable: without them the window cannot be proven aligned.
  if (flagRes.error) return empty("anchor_not_eligible", flagRes.error.message);

  const persisted = new Set<string>(
    ((flagRes.data as { bar_time: string }[]) ?? []).map((r) => new Date(r.bar_time).toISOString()),
  );
  const candles = toPreviewCandles((candleRes.data as PreviewCandleRow[]) ?? []);
  const window = buildPatternWindow(candles, anchorMs, minutes, persisted);

  return {
    ...window,
    quarantinedApplied: persisted.size,
    qualityVersion: PATTERN_PREVIEW_QUALITY_VERSION,
    error: null,
  };
}
