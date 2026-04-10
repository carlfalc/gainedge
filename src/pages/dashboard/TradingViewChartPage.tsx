import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { provisionAccount } from "@/services/metaapi-client";
import TradeExecutionPanel from "@/components/dashboard/TradeExecutionPanel";
import { ExternalLink } from "lucide-react";

/* ── Broker → TradingView exchange prefix ── */
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

function getTvSymbol(sym: string, broker: string): string {
  const exchange = BROKER_EXCHANGES[broker] || "";
  const map = TV_SYMBOL_MAP[sym];
  if (map) {
    return map[exchange] || map.default || `FX:${sym}`;
  }
  if (exchange) return `${exchange}:${sym}`;
  return `FX:${sym}`;
}

export default function TradingViewChartPage() {
  const { userId, profile } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedBroker, setSelectedBroker] = useState<string>("Pepperstone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const widgetContainerRef = useRef<HTMLDivElement>(null);

  // Load user broker preference
  useEffect(() => {
    if (profile?.broker) {
      const match = BROKERS.find(b => b.toLowerCase() === profile.broker.toLowerCase());
      if (match) setSelectedBroker(match);
    }
  }, [profile]);

  // Load instruments
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

  // Provision MetaApi account for trade execution
  useEffect(() => {
    if (!userId) return;
    setConnectionStatus("connecting");
    provisionAccount()
      .then(({ accountId: aid }) => {
        setAccountId(aid);
        setConnectionStatus("live");
      })
      .catch(() => setConnectionStatus("demo"));
  }, [userId]);

  // Embed TradingView widget
  useEffect(() => {
    if (!selected || !widgetContainerRef.current) return;
    const container = widgetContainerRef.current;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: getTvSymbol(selected, selectedBroker),
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "8",
      locale: "en",
      allow_symbol_change: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      calendar: false,
      show_popup_button: true,
      popup_width: "1000",
      popup_height: "650",
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
  }, [selected, selectedBroker]);

  const handlePopOut = () => {
    window.open(`/chart-popout?type=tradingview&symbol=${selected}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-104px)]">
      {/* Top bar: instruments + broker selector + pop-out */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {instruments.map((sym) => (
          <button
            key={sym}
            onClick={() => setSelected(sym)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all border ${
              selected === sym
                ? "bg-white/10 border-white/30 text-white"
                : "bg-[#111724] border-white/10 text-[#8892A4] hover:text-white hover:border-white/20"
            }`}
          >
            {sym}
          </button>
        ))}

        {/* Broker pills */}
        <div className="ml-2 h-5 w-px bg-white/10" />
        {BROKERS.map((broker) => (
          <button
            key={broker}
            onClick={() => setSelectedBroker(broker)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all border ${
              selectedBroker === broker
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-[#111724] border-white/10 text-[#8892A4] hover:text-amber-300 hover:border-amber-500/20"
            }`}
          >
            {broker}
          </button>
        ))}

        <div className="ml-auto">
          <button
            onClick={handlePopOut}
            className="px-3 py-1.5 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Pop Out ↗
          </button>
        </div>
      </div>

      {/* TradingView widget */}
      <div className="flex-1 rounded-lg overflow-hidden border border-white/[0.06] min-h-[300px]">
        <div
          className="tradingview-widget-container"
          ref={widgetContainerRef}
          style={{ height: "100%", width: "100%" }}
        >
          <div
            className="tradingview-widget-container__widget"
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </div>

      {/* Trade Execution Panel */}
      <TradeExecutionPanel
        symbol={selected}
        accountId={accountId}
        connectionStatus={connectionStatus}
      />
    </div>
  );
}
