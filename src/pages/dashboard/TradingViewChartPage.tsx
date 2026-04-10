import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { provisionAccount } from "@/services/metaapi-client";
import TradeExecutionPanel from "@/components/dashboard/TradeExecutionPanel";
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
    <div className="flex flex-col gap-2 h-[calc(100vh-104px)]">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
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

      {/* TradingView iframe – 60% height */}
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: "60%" }}>
        {selected && (
          <iframe
            key={`${selected}-${selectedBroker}`}
            src={buildIframeUrl(selected, selectedBroker)}
            style={{ width: "100%", height: "100%", border: "none" }}
            allowFullScreen
          />
        )}
      </div>

      {/* Trade Execution Panel */}
      <div className="flex-1 overflow-auto">
        <TradeExecutionPanel
          symbol={selected}
          accountId={accountId}
          connectionStatus={connectionStatus}
        />
      </div>
    </div>
  );
}
