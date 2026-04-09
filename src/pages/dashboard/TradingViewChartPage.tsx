import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { ExternalLink } from "lucide-react";

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  EURUSD: "FX:EURUSD",
  GBPUSD: "FX:GBPUSD",
  USDJPY: "FX:USDJPY",
  AUDUSD: "FX:AUDUSD",
  NZDUSD: "FX:NZDUSD",
  USDCAD: "FX:USDCAD",
  USDCHF: "FX:USDCHF",
  EURGBP: "FX:EURGBP",
  EURJPY: "FX:EURJPY",
  GBPJPY: "FX:GBPJPY",
  NAS100: "PEPPERSTONE:NAS100",
  US30: "TVC:DJI",
  SPX500: "SP:SPX",
  UK100: "TVC:UKX",
  GER40: "XETR:DAX",
  BTCUSD: "COINBASE:BTCUSD",
  ETHUSD: "COINBASE:ETHUSD",
};

function getTvSymbol(sym: string): string {
  return TV_SYMBOL_MAP[sym] || `FX:${sym}`;
}

export default function TradingViewChartPage() {
  const { userId } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const widgetContainerRef = useRef<HTMLDivElement>(null);

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
    if (!selected || !widgetContainerRef.current) return;
    const container = widgetContainerRef.current;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: getTvSymbol(selected),
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
  }, [selected]);

  const handlePopOut = () => {
    window.open(`/chart-popout?type=tradingview&symbol=${selected}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-104px)]">
      {/* Instrument pills + pop-out */}
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
      <div className="flex-1 rounded-lg overflow-hidden border border-white/[0.06]">
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
    </div>
  );
}
