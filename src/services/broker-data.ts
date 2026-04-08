/**
 * Shared broker data service — reads from live_market_data table (populated by background job).
 * Provides real-time subscriptions via Supabase Realtime.
 */

import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useCallback } from "react";

export interface LiveMarketRow {
  symbol: string;
  bid: number | null;
  ask: number | null;
  last_price: number | null;
  rsi: number | null;
  adx: number | null;
  macd_status: string | null;
  stoch_rsi: number | null;
  volume_today: number;
  market_open: boolean;
  sparkline_data: number[];
  price_direction: string;
  updated_at: string;
}

/**
 * React hook: subscribe to live market data for the current user.
 * Returns a Map<symbol, LiveMarketRow> that auto-updates via Realtime.
 */
export function useLiveMarketData(userId: string | undefined) {
  const [data, setData] = useState<Map<string, LiveMarketRow>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: rows } = await supabase
      .from("live_market_data")
      .select("*")
      .eq("user_id", userId);

    if (rows) {
      const map = new Map<string, LiveMarketRow>();
      for (const r of rows as any[]) {
        map.set(r.symbol, {
          symbol: r.symbol,
          bid: r.bid,
          ask: r.ask,
          last_price: r.last_price,
          rsi: r.rsi,
          adx: r.adx,
          macd_status: r.macd_status,
          stoch_rsi: r.stoch_rsi,
          volume_today: r.volume_today ?? 0,
          market_open: r.market_open ?? true,
          sparkline_data: Array.isArray(r.sparkline_data) ? r.sparkline_data : [],
          price_direction: r.price_direction ?? "flat",
          updated_at: r.updated_at,
        });
      }
      setData(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("live-market-data")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_market_data",
      }, (payload: any) => {
        const row = payload.new;
        if (row && row.user_id === userId) {
          setData(prev => {
            const next = new Map(prev);
            next.set(row.symbol, {
              symbol: row.symbol,
              bid: row.bid,
              ask: row.ask,
              last_price: row.last_price,
              rsi: row.rsi,
              adx: row.adx,
              macd_status: row.macd_status,
              stoch_rsi: row.stoch_rsi,
              volume_today: row.volume_today ?? 0,
              market_open: row.market_open ?? true,
              sparkline_data: Array.isArray(row.sparkline_data) ? row.sparkline_data : [],
              price_direction: row.price_direction ?? "flat",
              updated_at: row.updated_at,
            });
            return next;
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  return { data, loading, refresh: load };
}

/**
 * Trigger the background compute job manually (e.g., on page load).
 */
export async function triggerMarketDataCompute() {
  try {
    await supabase.functions.invoke("compute-market-data", { method: "POST" });
  } catch (e) {
    console.warn("Failed to trigger market data compute:", e);
  }
}
