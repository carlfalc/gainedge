import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Subscribes to auto_trade_executions inserts for the current user
 * and surfaces toast notifications.
 *
 * - status="filled" → green success toast (auto-dismiss 6s)
 * - status="failed" → red error toast (sticky until dismissed)
 *
 * Should be mounted once at the dashboard layout level.
 */
export function useAutoTradeNotifications(userId: string | null) {
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`auto-trade-exec-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "auto_trade_executions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            symbol: string;
            direction: string;
            volume: number;
            entry_price: number | null;
            sl: number | null;
            tp: number | null;
            status: string;
            error_message: string | null;
          };

          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);

          const fmt = (n: number | null) =>
            n == null ? "—" : Number(n).toFixed(row.symbol.includes("JPY") ? 3 : 5).replace(/\.?0+$/, "");

          if (row.status === "filled") {
            toast.success(
              `✅ RON Auto-Executed: ${row.direction} ${row.symbol}`,
              {
                description: `${row.volume} lots at ${fmt(row.entry_price)} · TP ${fmt(row.tp)} · SL ${fmt(row.sl)}`,
                duration: 6000,
              }
            );
          } else if (row.status === "failed") {
            toast.error(
              `❌ Auto-Trade Failed: ${row.direction} ${row.symbol}`,
              {
                description: row.error_message || "Unknown error from broker",
                duration: Infinity,
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
