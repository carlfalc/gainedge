import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useBrokerMappings } from "@/hooks/use-broker-mappings";
import { provisionAccount } from "@/services/metaapi-client";
import TradeExecutionPanel, { type OrderMode, type LimitOrderPrices, type TradeExecutionPanelRef, type Position } from "@/components/dashboard/TradeExecutionPanel";
import TradingViewWidget from "@/components/dashboard/TradingViewWidget";
import ChartSidePanel from "@/components/dashboard/ChartSidePanel";
import RonSignalAlert from "@/components/dashboard/RonSignalAlert";
import ActiveTradeBar from "@/components/dashboard/ActiveTradeBar";
import ChartOverlay from "@/components/dashboard/ChartOverlay";
import type { RonVersion } from "@/components/dashboard/RonVersionSelector";
import { ExternalLink, Cpu, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const BROKERS = ["Eightcap", "Pepperstone", "IC Markets", "OANDA"] as const;

export default function TradingViewChartPage() {
  const { userId, profile } = useProfile();
  const { isAvailable, defaultConnection, getAvailabilityStatus } = useBrokerMappings(userId);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedBroker, setSelectedBroker] = useState<string>("Pepperstone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrices, setLimitPrices] = useState<LimitOrderPrices | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [ronVersion, setRonVersion] = useState<RonVersion>("v1_legacy");
  const tradePanelRef = useRef<TradeExecutionPanelRef>(null);

  const selectedAvailability = getAvailabilityStatus(selected, selectedBroker);

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
    if (!userId || instruments.length === 0) return;
    const fetchPrices = () => {
      supabase
        .from("live_market_data")
        .select("symbol, last_price")
        .eq("user_id", userId)
        .in("symbol", instruments)
        .then(({ data }) => {
          if (data) {
            const map: Record<string, number> = {};
            data.forEach((d) => { if (d.last_price) map[d.symbol] = d.last_price; });
            setLivePrices(map);
          }
        });
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 5000);
    return () => clearInterval(iv);
  }, [userId, instruments]);

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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to close position");
    } finally {
      setClosingId(null);
    }
  }, [accountId]);

  const handlePopOut = () => {
    window.open(`/chart-popout?type=tradingview&symbol=${selected}`, "_blank", "noopener");
  };

  const formatPrice = (sym: string, price: number) => {
    if (sym.includes("JPY")) return price.toFixed(3);
    if (["XAUUSD", "US30", "NAS100", "SPX500", "US500"].some(s => sym.includes(s))) return price.toFixed(2);
    return price.toFixed(5);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Top bar — instrument tabs with live prices + brokers */}
      <div className="flex items-center gap-1.5 flex-wrap px-2 py-1.5 border-b border-border shrink-0">
        {instruments.map((sym) => (
          <button
            key={sym}
            onClick={() => setSelected(sym)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide transition-all border flex items-center gap-1.5 ${
              selected === sym
                ? "bg-white/10 border-white/30 text-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            {sym}
            {livePrices[sym] ? (
              <span className="font-mono text-[10px] text-muted-foreground">{formatPrice(sym, livePrices[sym])}</span>
            ) : null}
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

        <div className="ml-auto flex items-center gap-2">
          {/* RON Version pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide"
            style={{
              background: "rgba(0,207,165,0.1)",
              border: "1px solid rgba(0,207,165,0.3)",
              color: "#00CFA5",
            }}
          >
            <Cpu className="w-3 h-3" />
            {ronVersion === "v1" ? "RON V1 Legacy" : ronVersion === "v2" ? "RON V2 Knowledge Base" : "RON V1 + V2 Combined"}
          </div>
          <button
            onClick={handlePopOut}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Pop Out
          </button>
        </div>
      </div>

      {/* Signal alert + active trade bar */}
      <RonSignalAlert symbol={selected} userId={userId} />
      <ActiveTradeBar
        symbol={selected}
        positions={positions}
        onClosePosition={handleClosePosition}
        closingId={closingId}
      />
      {/* Broker unavailability banner */}
      {selected && selectedAvailability === "unavailable" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-400 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            <strong>{selected}</strong> not available on {selectedBroker}. Showing RON's analysis only.
            {" "}Auto-trade will skip signals for this instrument.
          </span>
        </div>
      )}

      {/* Main content: chart + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Left: chart + trade panel with independent scroll */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Chart area */}
          <div className="relative" style={{ height: "60vh", minHeight: 500 }}>
            {selected && (
              <>
                <TradingViewWidget symbol={selected} broker={selectedBroker} />
                <ChartOverlay symbol={selected} userId={userId} positions={positions} />
              </>
            )}
          </div>

          {/* Bottom trade strip — scrollable independently */}
          <div className="shrink-0 border-t border-border max-h-[40vh] overflow-y-auto">
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

        {/* Right sidebar — 320px, independent scroll */}
        <div className="w-[320px] shrink-0 hidden lg:block overflow-y-auto border-l border-border">
          <ChartSidePanel
            symbol={selected}
            userId={userId}
            accountId={accountId}
            positions={positions}
            onClosePosition={handleClosePosition}
            closingId={closingId}
            onVersionChange={setRonVersion}
          />
        </div>
      </div>
    </div>
  );
}
