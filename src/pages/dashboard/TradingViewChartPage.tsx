import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { provisionAccount } from "@/services/metaapi-client";
import TradeExecutionPanel, { type OrderMode, type LimitOrderPrices, type TradeExecutionPanelRef } from "@/components/dashboard/TradeExecutionPanel";
import ChartOrderLines from "@/components/dashboard/ChartOrderLines";
import { ExternalLink } from "lucide-react";

const BROKER_EXCHANGES: Record<string, string> = {
  Eightcap: "EIGHTCAP",
  Pepperstone: "PEPPERSTONE",
  "IC Markets": "ICMARKETS",
  OANDA: "OANDA",
};

const TV_SYMBOL_MAP: Record<string, Record<string, string>> = {
  XAUUSD: { default: "OANDA:XAUUSD", EIGHTCAP: "EIGHTCAP:XAUUSD", PEPPERSTONE: "PEPPERSTONE:XAUUSD", ICMARKETS: "ICMARKETS:XAUUSD", OANDA: "OANDA:XAUUSD" },
  XAGUSD: { default: "OANDA:XAGUSD", EIGHTCAP: "EIGHTCAP:XAGUSD", PEPPERSTONE: "PEPPERSTONE:XAGUSD", ICMARKETS: "ICMARKETS:XAGUSD", OANDA: "OANDA:XAGUSD" },
  EURUSD: { default: "FX:EURUSD", EIGHTCAP: "EIGHTCAP:EURUSD", PEPPERSTONE: "PEPPERSTONE:EURUSD", ICMARKETS: "ICMARKETS:EURUSD", OANDA: "OANDA:EURUSD" },
  GBPUSD: { default: "FX:GBPUSD", EIGHTCAP: "EIGHTCAP:GBPUSD", PEPPERSTONE: "PEPPERSTONE:GBPUSD", ICMARKETS: "ICMARKETS:GBPUSD", OANDA: "OANDA:GBPUSD" },
  USDJPY: { default: "FX:USDJPY", EIGHTCAP: "EIGHTCAP:USDJPY", PEPPERSTONE: "PEPPERSTONE:USDJPY", ICMARKETS: "ICMARKETS:USDJPY", OANDA: "OANDA:USDJPY" },
  AUDUSD: { default: "FX:AUDUSD", EIGHTCAP: "EIGHTCAP:AUDUSD", PEPPERSTONE: "PEPPERSTONE:AUDUSD", ICMARKETS: "ICMARKETS:AUDUSD", OANDA: "OANDA:AUDUSD" },
  NZDUSD: { default: "FX:NZDUSD", EIGHTCAP: "EIGHTCAP:NZDUSD", PEPPERSTONE: "PEPPERSTONE:NZDUSD", ICMARKETS: "ICMARKETS:NZDUSD", OANDA: "OANDA:NZDUSD" },
  USDCAD: { default: "FX:USDCAD", EIGHTCAP: "EIGHTCAP:USDCAD", PEPPERSTONE: "PEPPERSTONE:USDCAD", ICMARKETS: "ICMARKETS:USDCAD", OANDA: "OANDA:USDCAD" },
  USDCHF: { default: "FX:USDCHF", EIGHTCAP: "EIGHTCAP:USDCHF", PEPPERSTONE: "PEPPERSTONE:USDCHF", ICMARKETS: "ICMARKETS:USDCHF", OANDA: "OANDA:USDCHF" },
  EURGBP: { default: "FX:EURGBP" },
  EURJPY: { default: "FX:EURJPY" },
  GBPJPY: { default: "FX:GBPJPY" },
  NAS100: { default: "PEPPERSTONE:NAS100", EIGHTCAP: "EIGHTCAP:NAS100", PEPPERSTONE: "PEPPERSTONE:NAS100", ICMARKETS: "ICMARKETS:NAS100" },
  US30: { default: "TVC:DJI", EIGHTCAP: "EIGHTCAP:US30", PEPPERSTONE: "PEPPERSTONE:US30", ICMARKETS: "ICMARKETS:US30" },
  SPX500: { default: "SP:SPX", EIGHTCAP: "EIGHTCAP:SPX500", PEPPERSTONE: "PEPPERSTONE:SPX500", ICMARKETS: "ICMARKETS:SPX500" },
  UK100: { default: "TVC:UKX" },
  GER40: { default: "XETR:DAX" },
  BTCUSD: { default: "COINBASE:BTCUSD" },
  ETHUSD: { default: "COINBASE:ETHUSD" },
};

const BROKERS = ["Eightcap", "Pepperstone", "IC Markets", "OANDA"] as const;

// Approximate price ranges for linear coordinate mapping
const PRICE_RANGE_MAP: Record<string, number> = {
  XAUUSD: 60, XAGUSD: 2, EURUSD: 0.015, GBPUSD: 0.015, USDJPY: 3,
  AUDUSD: 0.01, NZDUSD: 0.01, USDCAD: 0.015, USDCHF: 0.015,
  EURGBP: 0.01, EURJPY: 3, GBPJPY: 4, NAS100: 500, US30: 500,
  SPX500: 100, UK100: 200, GER40: 300, BTCUSD: 5000, ETHUSD: 500,
};

function getTvSymbol(sym: string, broker: string): string {
  const exchange = BROKER_EXCHANGES[broker] || "";
  const map = TV_SYMBOL_MAP[sym];
  if (map) return map[exchange] || map.default || `FX:${sym}`;
  if (exchange) return `${exchange}:${sym}`;
  return `FX:${sym}`;
}

function buildIframeUrl(symbol: string, broker: string): string {
  const tvSymbol = getTvSymbol(symbol, broker);
  return `https://www.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tvSymbol)}&interval=15&theme=dark&style=1&locale=en&allow_symbol_change=true&hide_top_toolbar=false&hide_side_toolbar=false`;
}

export default function TradingViewChartPage() {
  const { userId, profile } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedBroker, setSelectedBroker] = useState<string>("Pepperstone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrices, setLimitPrices] = useState<LimitOrderPrices | null>(null);
  const tradePanelRef = useRef<TradeExecutionPanelRef>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const priceDec = selected.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => selected.includes(s)) ? 2 : 5;

  // Estimated center price for coordinate mapping
  const estimatedPrice = useCallback(() => {
    return tradePanelRef.current?.getCurrentPrice() ?? null;
  }, []);

  // Linear price-to-Y mapping for overlay
  const priceRange = PRICE_RANGE_MAP[selected] ?? 100;

  const priceToY = useCallback((price: number): number | null => {
    const center = estimatedPrice();
    if (!center || !chartContainerRef.current) return null;
    const h = chartContainerRef.current.clientHeight;
    const topMargin = 40; // approximate TV top toolbar
    const bottomMargin = 30; // approximate TV time axis
    const usable = h - topMargin - bottomMargin;
    // Map: center price -> middle of usable area
    const mid = topMargin + usable / 2;
    const pixelsPerUnit = usable / priceRange;
    return mid - (price - center) * pixelsPerUnit;
  }, [estimatedPrice, priceRange]);

  const yToPrice = useCallback((y: number): number | null => {
    const center = estimatedPrice();
    if (!center || !chartContainerRef.current) return null;
    const h = chartContainerRef.current.clientHeight;
    const topMargin = 40;
    const bottomMargin = 30;
    const usable = h - topMargin - bottomMargin;
    const mid = topMargin + usable / 2;
    const pixelsPerUnit = usable / priceRange;
    return center - (y - mid) / pixelsPerUnit;
  }, [estimatedPrice, priceRange]);

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

  const handlePopOut = () => {
    window.open(`/chart-popout?type=tradingview&symbol=${selected}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-104px)]">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 flex-wrap px-1 py-1.5">
        {instruments.map((sym) => (
          <button
            key={sym}
            onClick={() => setSelected(sym)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all border ${
              selected === sym
                ? "bg-white/10 border-white/30 text-foreground"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            {sym}
          </button>
        ))}

        <div className="ml-2 h-5 w-px bg-border" />
        {BROKERS.map((broker) => (
          <button
            key={broker}
            onClick={() => setSelectedBroker(broker)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all border ${
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
            className="px-3 py-1.5 rounded text-[11px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Pop Out ↗
          </button>
        </div>
      </div>

      {/* TradingView iframe with order lines overlay */}
      <div
        ref={chartContainerRef}
        className="overflow-hidden border-y border-border relative"
        style={{ height: "60%", minHeight: 500 }}
      >
        {selected && (
          <iframe
            key={`${selected}-${selectedBroker}`}
            src={buildIframeUrl(selected, selectedBroker)}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allowFullScreen
          />
        )}
        <ChartOrderLines
          visible={orderMode !== "market" || !!(limitPrices?.sl || limitPrices?.tp)}
          orderMode={orderMode}
          entry={orderMode !== "market" ? (limitPrices?.entry ?? null) : null}
          sl={limitPrices?.sl ?? null}
          tp={limitPrices?.tp ?? null}
          priceDec={priceDec}
          priceToY={priceToY}
          yToPrice={yToPrice}
          onEntryDrag={(price) => tradePanelRef.current?.setLimitEntry(price.toFixed(priceDec))}
          onSLDrag={(price) => {
            if (orderMode === "market") tradePanelRef.current?.setMarketSL(price.toFixed(priceDec));
            else tradePanelRef.current?.setLimitSL(price.toFixed(priceDec));
          }}
          onTPDrag={(price) => {
            if (orderMode === "market") tradePanelRef.current?.setMarketTP(price.toFixed(priceDec));
            else tradePanelRef.current?.setLimitTP(price.toFixed(priceDec));
          }}
          onSLRemove={() => {
            if (orderMode === "market") tradePanelRef.current?.setMarketSL("");
            else tradePanelRef.current?.setLimitSL("");
          }}
          onTPRemove={() => {
            if (orderMode === "market") tradePanelRef.current?.setMarketTP("");
            else tradePanelRef.current?.setLimitTP("");
          }}
        />
      </div>

      {/* Trade Execution Panel */}
      <div className="flex-1 overflow-auto">
        <TradeExecutionPanel
          ref={tradePanelRef}
          symbol={selected}
          accountId={accountId}
          connectionStatus={connectionStatus}
          onOrderModeChange={setOrderMode}
          onLimitPricesChange={setLimitPrices}
        />
        <div className="text-center py-2 text-[10px] font-medium" style={{ color: "#00CFA5" }}>
          Powered by RON
        </div>
      </div>
    </div>
  );
}
