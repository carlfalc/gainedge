import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AutoTradeSettingRow {
  id?: string;
  symbol: string;
  enabled: boolean;
  lot_size: number;
  signal_direction: "buy" | "sell" | "both";
}

/**
 * Hook for per-symbol auto-trade settings.
 * Loads ALL rows for the user once, exposes a map keyed by symbol,
 * and persists changes back to user_auto_trade_settings.
 */
export function useAutoTradeSettings(userId: string | undefined | null) {
  const [settings, setSettings] = useState<Record<string, AutoTradeSettingRow>>({});
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("user_auto_trade_settings")
      .select("id,symbol,enabled,lot_size,signal_direction")
      .eq("user_id", userId);
    const map: Record<string, AutoTradeSettingRow> = {};
    (data ?? []).forEach((r: any) => {
      map[r.symbol] = {
        id: r.id, symbol: r.symbol, enabled: !!r.enabled,
        lot_size: Number(r.lot_size ?? 0.01),
        signal_direction: (r.signal_direction ?? "both") as "buy" | "sell" | "both",
      };
    });
    setSettings(map);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedRef.current) return;
    loadedRef.current = true;
    refresh();
  }, [userId, refresh]);

  const get = useCallback((symbol: string): AutoTradeSettingRow => {
    return settings[symbol] ?? { symbol, enabled: false, lot_size: 0.01, signal_direction: "both" };
  }, [settings]);

  const update = useCallback(async (symbol: string, patch: Partial<AutoTradeSettingRow>) => {
    if (!userId) return;
    const current = settings[symbol] ?? { symbol, enabled: false, lot_size: 0.01, signal_direction: "both" as const };
    const merged: AutoTradeSettingRow = { ...current, ...patch, symbol };
    setSettings(prev => ({ ...prev, [symbol]: merged }));
    await supabase.from("user_auto_trade_settings").upsert({
      user_id: userId,
      symbol,
      enabled: merged.enabled,
      lot_size: merged.lot_size,
      signal_direction: merged.signal_direction,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id,symbol" });
  }, [userId, settings]);

  /** Master kill switch: turn OFF auto-trade for all currently-known symbols */
  const killAll = useCallback(async () => {
    if (!userId) return;
    const symbols = Object.keys(settings);
    setSettings(prev => {
      const next = { ...prev };
      symbols.forEach(s => { next[s] = { ...next[s], enabled: false }; });
      return next;
    });
    if (symbols.length > 0) {
      await supabase
        .from("user_auto_trade_settings")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .in("symbol", symbols);
    }
  }, [userId, settings]);

  const activeCount = Object.values(settings).filter(s => s.enabled).length;

  return { settings, loading, get, update, killAll, refresh, activeCount };
}
