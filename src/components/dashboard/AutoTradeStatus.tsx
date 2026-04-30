import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Plug, CheckCircle2, Activity, Info } from "lucide-react";

interface AutoTradeStatusProps {
  symbol: string;
  userId: string | null;
  autoTradeEnabled: boolean;
  brokerConnected: boolean;
  signalsPaused: boolean;
  signalDirection: "buy" | "sell" | "both";
  openPositionsForSymbol: number;
  totalOpenPositions: number;
}

interface ExecRow {
  id: string;
  symbol: string;
  direction: string;
  volume: number;
  entry_price: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function AutoTradeStatus({
  symbol,
  userId,
  autoTradeEnabled,
  brokerConnected,
  signalsPaused,
  signalDirection,
  openPositionsForSymbol,
  totalOpenPositions,
}: AutoTradeStatusProps) {
  const [recentExec, setRecentExec] = useState<ExecRow | null>(null);
  const [now, setNow] = useState(Date.now());

  // Poll most recent execution for this symbol
  useEffect(() => {
    if (!userId || !symbol) return;
    let cancelled = false;
    const fetchRecent = async () => {
      const { data } = await supabase
        .from("auto_trade_executions")
        .select("id,symbol,direction,volume,entry_price,status,error_message,created_at")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) {
        setRecentExec(data[0] as ExecRow);
      }
    };
    fetchRecent();

    // Realtime subscription for fresh executions on this symbol
    const ch = supabase
      .channel(`autotrade-status-${symbol}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "auto_trade_executions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as ExecRow;
          if (row.symbol === symbol) setRecentExec(row);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [userId, symbol]);

  // Tick the clock every 5s so the "Xs ago" label updates and fades after 60s
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, []);

  // ───── Render priority ─────
  // 1) Position counter strip (always shown)
  const positionStrip = (
    <div className="flex items-center gap-3 text-[10px] text-white/50 font-mono">
      <span>📊 Open on {symbol}: <span className="text-white">{openPositionsForSymbol}</span></span>
      <span className="text-white/20">·</span>
      <span>Total open: <span className="text-white">{totalOpenPositions}</span></span>
    </div>
  );

  // 2) No broker connected — simple inline text directing to Settings
  if (!brokerConnected) {
    return (
      <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/60">
        Link your broker in{" "}
        <Link to="/dashboard/settings" className="text-[#00CFA5] hover:underline font-semibold">
          Settings
        </Link>{" "}
        first to enable live trading.
      </div>
    );
  }

  // 3) Most recent execution within last 60s — success or failure
  const recentAgeMs = recentExec ? now - new Date(recentExec.created_at).getTime() : Infinity;
  const showRecent = recentExec && recentAgeMs < 60_000;
  if (showRecent && recentExec) {
    const seconds = Math.max(0, Math.round(recentAgeMs / 1000));
    const opacity = Math.max(0.3, 1 - recentAgeMs / 60_000);
    if (recentExec.status === "filled") {
      return (
        <div
          className="rounded border border-[#00CFA5]/30 bg-[#00CFA5]/[0.08] px-3 py-2 transition-opacity"
          style={{ opacity }}
        >
          <div className="flex items-center gap-2 text-[11px] text-[#00CFA5]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              ✅ RON just executed: {recentExec.direction} {recentExec.volume} lots
              {recentExec.entry_price ? ` at ${Number(recentExec.entry_price).toFixed(symbol.includes("JPY") ? 3 : 5)}` : ""} · {seconds}s ago
            </span>
          </div>
          <div className="mt-1.5">{positionStrip}</div>
        </div>
      );
    }
    if (recentExec.status === "failed") {
      return (
        <div className="rounded border border-red-500/30 bg-red-500/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-red-300">
            <Info className="w-3.5 h-3.5" />
            <span>
              ℹ️ Signal skipped: {recentExec.error_message || "broker rejected order"} · {seconds}s ago
            </span>
          </div>
          <div className="mt-1.5">{positionStrip}</div>
        </div>
      );
    }
  }

  // 4) Auto-trade ON, monitoring
  if (autoTradeEnabled) {
    let banner: React.ReactNode;
    if (signalsPaused) {
      banner = (
        <div className="flex items-center gap-2 text-[11px] text-amber-300">
          <Info className="w-3.5 h-3.5" />
          <span>ℹ️ Signals paused (kill switch on) — auto-trade will resume when re-enabled</span>
        </div>
      );
    } else {
      const dirLabel =
        signalDirection === "buy"
          ? "BUYS only"
          : signalDirection === "sell"
          ? "SELLS only"
          : "BUY & SELL";
      banner = (
        <div className="flex items-center gap-2 text-[11px] text-[#00CFA5]">
          <Activity className="w-3.5 h-3.5" />
          <span>
            🟢 RON v3 ON — Monitoring {symbol} ({dirLabel}) · DLO + Squeeze + HA + EMA 12/69 · Tier A/B only
          </span>
        </div>
      );
    }
    return (
      <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2">
        {banner}
        <div className="mt-1.5">{positionStrip}</div>
      </div>
    );
  }

  // 5) Auto-trade OFF (broker connected) — only show position counter
  return (
    <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2">
      {positionStrip}
    </div>
  );
}
