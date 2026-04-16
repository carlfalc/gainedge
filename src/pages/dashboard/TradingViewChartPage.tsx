import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { provisionAccount } from "@/services/metaapi-client";
import TradeExecutionPanel, { type OrderMode, type LimitOrderPrices, type TradeExecutionPanelRef, type Position } from "@/components/dashboard/TradeExecutionPanel";
import TradingViewWidget from "@/components/dashboard/TradingViewWidget";
import ChartSidePanel from "@/components/dashboard/ChartSidePanel";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BROKERS = ["Eightcap", "Pepperstone", "IC Markets", "OANDA"] as const;

export default function TradingViewChartPage() {
  const { userId, profile } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedBroker, setSelectedBroker] = useState<string>("Pepperstone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrices, setLimitPrices] = useState<LimitOrderPrices | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const tradePanelRef = useRef<TradeExecutionPanelRef>(null);

  useEffect(() => {
    if (profile?.broker) {
      const match = BROKERS.find(b => b.toLowerCase() === profile.broker.toLowerCase());
      if (match) setSelectedBroker(match);
    }
  }, [profile]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_instruments")
      .select("symbol")
      .eq("user_id", userId)
      .then(({ data }) => {
        const syms = data?.map((d) => d.symbol) ?? [];
        const list = syms.length > 0 ? syms : ["NAS100", "US30", "XAUUSD", "AUDUSD", "NZDUSD"];
        setInstruments(list);
        if (!selected) setSelected(list[0]);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setConnectionStatus("connecting");
    provisionAccount()
      .then(({ accountId: aid }) => { setAccountId(aid); setConnectionStatus("live"); })
      .catch(() => setConnectionStatus("demo"));
  }, [userId]);

  const handleClosePosition = useCallback(async (positionId: string) => {
    if (!accountId) return;
    setClosingId(positionId);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/metaapi-trade`,
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to close position");
    } finally {
      setClosingId(null);
    }
  }, [accountId]);

  const handlePopOut = () => {
    window.open(`/chart-popout?type=tradingview&symbol=${selected}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Top bar — compact */}
      <div className="flex items-center gap-1.5 flex-wrap px-2 py-1.5 border-b border-border shrink-0">
        {instruments.map((sym) => (
          <button
            key={sym}
            onClick={() => setSelected(sym)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide transition-all border ${
              selected === sym
                ? "bg-white/10 border-white/30 text-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            {sym}
          </button>
        ))}

        <div className="ml-2 h-4 w-px bg-border" />
        {BROKERS.map((broker) => (
          <button
            key={broker}
            onClick={() => setSelectedBroker(broker)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-all border ${
              selectedBroker === broker
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-card border-border text-muted-foreground hover:text-amber-300 hover:border-amber-500/20"
            }`}
          >
            {broker}
          </button>
        ))}

        <div className="ml-auto">
          <button
            onClick={handlePopOut}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Pop Out
          </button>
        </div>
      </div>

      {/* Main content: chart + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Chart area — takes remaining space */}
        <div className="flex-1 min-w-0 relative" style={{ minHeight: 500 }}>
          {selected && (
            <TradingViewWidget symbol={selected} broker={selectedBroker} />
          )}
        </div>

        {/* Right sidebar — fixed 280px */}
        <div className="w-[280px] shrink-0 hidden lg:block">
          <ChartSidePanel
            symbol={selected}
            userId={userId}
            accountId={accountId}
            positions={positions}
            onClosePosition={handleClosePosition}
            closingId={closingId}
          />
        </div>
      </div>

      {/* Bottom trade strip — compact */}
      <div className="shrink-0 border-t border-border">
        <TradeExecutionPanel
          ref={tradePanelRef}
          symbol={selected}
          accountId={accountId}
          connectionStatus={connectionStatus}
          onOrderModeChange={setOrderMode}
          onLimitPricesChange={setLimitPrices}
          onPositionsChange={setPositions}
        />
      </div>
    </div>
  );
}
