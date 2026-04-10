import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD", XAGUSD: "OANDA:XAGUSD",
  EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", USDJPY: "FX:USDJPY",
  AUDUSD: "FX:AUDUSD", NZDUSD: "FX:NZDUSD", USDCAD: "FX:USDCAD",
  USDCHF: "FX:USDCHF", NAS100: "PEPPERSTONE:NAS100", US30: "TVC:DJI",
  SPX500: "SP:SPX", UK100: "TVC:UKX", GER40: "XETR:DAX",
  BTCUSD: "COINBASE:BTCUSD", ETHUSD: "COINBASE:ETHUSD",
};

export default function ChartPopout() {
  const [params] = useSearchParams();
  const type = params.get("type") || "tradingview";
  const symbol = params.get("symbol") || "XAUUSD";
  const widgetRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = `GAINEDGE — ${symbol}`;
  }, [symbol]);

  // TradingView embed
  useEffect(() => {
    if (type !== "tradingview" || !widgetRef.current) return;
    const container = widgetRef.current;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: TV_SYMBOL_MAP[symbol] || `FX:${symbol}`,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "8",
      locale: "en",
      allow_symbol_change: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      calendar: false,
    });
    container.appendChild(script);
    setReady(true);
  }, [type, symbol]);

  // For RON chart pop-out
  useEffect(() => {
    if (type === "falconer" || type === "ron") {
      setReady(true);
    }
  }, [type]);

  return (
    <div className="fixed inset-0 bg-[#0B0F1A] flex flex-col">
      {/* Banner */}
      <div className="h-9 flex items-center justify-between px-4 bg-[#111724] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold">
            <span className="text-white">G</span>
            <span className="text-[#00CFA5]">AI</span>
            <span className="text-white">NEDGE</span>
          </span>
          <span className="text-white/40 text-[12px]">—</span>
          <span className="text-white text-[12px] font-medium">{symbol} {type === "tradingview" ? "TradingView" : "RON"} Chart</span>
          <span className="text-white/30 text-[11px] ml-2">Drag this tab to another screen</span>
        </div>
        <button
          onClick={() => window.close()}
          className="text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1">
        {type === "tradingview" && (
          <div ref={widgetRef} style={{ height: "100%", width: "100%" }}>
            <div style={{ height: "100%", width: "100%" }} />
          </div>
        )}
        {(type === "falconer" || type === "ron") && (
          <iframe
            src={`/dashboard/charts?popout=1&symbol=${symbol}`}
            className="w-full h-full border-0"
            title="RON Chart"
          />
        )}
      </div>
    </div>
  );
}
