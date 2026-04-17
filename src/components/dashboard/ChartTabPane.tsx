import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentPrice } from "@/services/metaapi-client";
import { toast } from "sonner";
import TradingViewWidget from "./TradingViewWidget";
import TradeExecutionPanel, {
  type TradeExecutionPanelRef,
  type OrderMode,
  type LimitOrderPrices,
  type Position,
} from "./TradeExecutionPanel";
import RonSignalAlert from "./RonSignalAlert";
import ChartOverlay from "./ChartOverlay";
import TradeLevelOverlay from "./TradeLevelOverlay";
import LivePnLBar from "./LivePnLBar";
import type { ChartMode } from "./AddChartTabModal";

const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  XAUUSD: ["XAUUSD"], US30: ["US30", "DJ30"], NAS100: ["NAS100", "USTEC"],
  NZDUSD: ["NZDUSD"], AUDUSD: ["AUDUSD"], EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"], USDJPY: ["USDJPY"],
};

interface Props {
  symbol: string;
  mode: ChartMode;
  broker: string;
  userId: string | undefined;
  accountId: string | null;
  connectionStatus: "disconnected" | "connecting" | "live" | "demo";
  active: boolean;
}

/**
 * Self-contained chart pane for one tab.
 * Each instance owns its own TradeExecutionPanel state, position list, live price polling,
 * RON signal alert, and trade-level overlay. Inactive tabs stay mounted (display:none) so
 * state is preserved when the user switches tabs.
 */
export default function ChartTabPane({
  symbol, mode, broker, userId, accountId, connectionStatus, active,
}: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrices, setLimitPrices] = useState<LimitOrderPrices | null>(null);
  const tradePanelRef = useRef<TradeExecutionPanelRef>(null);

  const isLive = connectionStatus === "live" && !!accountId;

  /* live mid-price polling (used by P&L bar + chart header) */
  useEffect(() => {
    if (!isLive) { setLivePrice(null); return; }
    let cancelled = false;
    const variants = BROKER_SYMBOL_MAP[symbol] ?? [symbol];
    const poll = async () => {
      for (const sym of variants) {
        try {
          const p = await fetchCurrentPrice(accountId!, sym);
          if (p && !cancelled) { setLivePrice((p.bid + p.ask) / 2); return; }
        } catch { /* try next variant */ }
      }
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isLive, accountId, symbol]);

  const handleClosePosition = useCallback(async (positionId: string) => {
    if (!accountId) return;
    setClosingId(positionId);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/metaapi-trade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "close", accountId, positionId }),
        }
      );
      if (!res.ok) throw new Error("Close failed");
      toast.success("Position closed");
      setPositions((prev) => prev.filter((p) => p.id !== positionId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to close position");
    } finally {
      setClosingId(null);
    }
  }, [accountId]);

  return (
    <div className={`flex flex-col h-full ${active ? "" : "hidden"}`}>
      {/* Optional active-mode pill + live price for this tab */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05] shrink-0">
        <span className="text-[11px] font-bold tracking-wide text-white">{symbol}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
            mode === "auto"
              ? "bg-[#00CFA5]/15 border-[#00CFA5]/40 text-[#00CFA5]"
              : "bg-blue-500/15 border-blue-500/40 text-blue-400"
          }`}
        >
          {mode}
        </span>
        {livePrice != null && (
          <span className="font-mono text-[11px] font-bold text-white ml-2">
            {livePrice.toFixed(symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5)}
          </span>
        )}
      </div>

      <RonSignalAlert symbol={symbol} userId={userId} />

      <div className="relative flex-1 min-h-0">
        <TradingViewWidget symbol={symbol} broker={broker} />
        <ChartOverlay symbol={symbol} userId={userId} positions={positions} />
        <TradeLevelOverlay symbol={symbol} positions={positions} />
      </div>

      <LivePnLBar
        symbol={symbol}
        positions={positions}
        currentPrice={livePrice}
        onClose={handleClosePosition}
        closingId={closingId}
      />

      <div className="shrink-0 border-t border-white/[0.05] max-h-[40vh] overflow-y-auto">
        <TradeExecutionPanel
          ref={tradePanelRef}
          symbol={symbol}
          accountId={accountId}
          connectionStatus={connectionStatus}
          currentPrice={livePrice}
          mode={mode}
          onOrderModeChange={setOrderMode}
          onLimitPricesChange={setLimitPrices}
          onPositionsChange={setPositions}
        />
      </div>
    </div>
  );
}
