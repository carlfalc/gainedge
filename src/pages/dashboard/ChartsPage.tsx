import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Activity, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

declare global {
  interface Window {
    TradingView: any;
  }
}

interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; reasoning: string; scanned_at: string;
}

const TV_SYMBOL_MAP: Record<string, string> = {
  "XAUUSD": "OANDA:XAUUSD",
  "US30": "TVC:DJI",
  "NAS100": "PEPPERSTONE:NAS100",
  "NZDUSD": "FX:NZDUSD",
  "AUDUSD": "FX:AUDUSD",
  "EURUSD": "FX:EURUSD",
  "GBPUSD": "FX:GBPUSD",
  "USDJPY": "FX:USDJPY",
  "USDCAD": "FX:USDCAD",
  "USDCHF": "FX:USDCHF",
  "GBPJPY": "FX:GBPJPY",
  "EURJPY": "FX:EURJPY",
  "EURGBP": "FX:EURGBP",
  "XAGUSD": "OANDA:XAGUSD",
  "BTCUSD": "COINBASE:BTCUSD",
  "ETHUSD": "COINBASE:ETHUSD",
  "US500": "TVC:SPX",
  "SPX500": "TVC:SPX",
};

export default function ChartsPage() {
  const { profile, userId } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const widgetRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  // Fetch user instruments
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol").eq("user_id", userId)
      .then(({ data }) => {
        const syms = data?.map(d => d.symbol) ?? [];
        if (syms.length === 0) {
          const defaults = ["NAS100", "US30", "XAUUSD", "AUDUSD", "NZDUSD"];
          setInstruments(defaults);
          setSelected(defaults[0]);
        } else {
          setInstruments(syms);
          setSelected(syms[0]);
        }
      });
  }, [userId]);

  // Fetch latest scan result for selected instrument
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("scan_results").select("*")
      .eq("user_id", userId).eq("symbol", selected)
      .order("scanned_at", { ascending: false }).limit(1)
      .then(({ data }) => {
        setScanResult(data?.[0] as ScanResult ?? null);
      });
  }, [userId, selected]);

  // Load TradingView script once
  useEffect(() => {
    if (scriptLoaded.current || document.getElementById("tv-script")) return;
    const script = document.createElement("script");
    script.id = "tv-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => { scriptLoaded.current = true; };
    document.head.appendChild(script);
    return () => {};
  }, []);

  const getSymbol = useCallback(() => {
    const broker = profile?.broker || "OANDA";
    const prefix = BROKER_PREFIX_MAP[broker] || "OANDA";
    return `${prefix}:${selected}`;
  }, [profile?.broker, selected]);

  // Create/recreate widget when symbol changes
  useEffect(() => {
    if (!selected) return;

    const initWidget = () => {
      if (!window.TradingView || !containerRef.current) return;

      // Clear previous widget
      const container = document.getElementById("tradingview_chart");
      if (container) container.innerHTML = "";

      try {
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: getSymbol(),
          interval: "15",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          hide_legend: false,
          save_image: true,
          toolbar_bg: "#111724",
          withdateranges: true,
          details: true,
          hotlist: true,
          calendar: true,
          show_popup_button: true,
          popup_width: "1200",
          popup_height: "800",
          backgroundColor: "rgba(17, 23, 36, 1)",
          gridColor: "rgba(255, 255, 255, 0.04)",
          studies: ["MAExp@tv-basicstudies"],
          container_id: "tradingview_chart",
        });
      } catch (e) {
        console.error("TradingView widget error:", e);
      }
    };

    if (scriptLoaded.current && window.TradingView) {
      initWidget();
    } else {
      const check = setInterval(() => {
        if (window.TradingView) {
          clearInterval(check);
          initWidget();
        }
      }, 200);
      return () => clearInterval(check);
    }
  }, [selected, getSymbol]);

  const dirColor = (d: string) =>
    d === "BUY" ? "text-green-400" : d === "SELL" ? "text-red-400" : "text-amber-400";
  const dirIcon = (d: string) =>
    d === "BUY" ? <ArrowUpRight className="w-4 h-4" /> : d === "SELL" ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />;

  return (
    <div className="flex flex-col h-full w-full gap-2 p-2 sm:p-4">
      {/* Instrument pills */}
      <div className="flex flex-wrap gap-2">
        {instruments.map(sym => (
          <button
            key={sym}
            onClick={() => setSelected(sym)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all border ${
              selected === sym
                ? "bg-[#00CFA5]/20 border-[#00CFA5] text-[#00CFA5] shadow-[0_0_12px_rgba(0,207,165,0.25)]"
                : "bg-[#111724] border-white/10 text-[#8892A4] hover:border-white/20 hover:text-white"
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* TradingView Chart */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[60vh] rounded-lg overflow-hidden border border-white/[0.06]"
      >
        <div id="tradingview_chart" style={{ width: "100%", height: "100%" }} />
      </div>

      {/* AI Analysis Panel */}
      {scanResult && (
        <div className="rounded-lg border border-white/[0.06] bg-[#111724] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#00CFA5]" />
            <span className="text-xs font-bold text-[#00CFA5] tracking-wider">AI ANALYSIS — {scanResult.symbol}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs mb-2">
            <span className={`font-bold flex items-center gap-1 ${dirColor(scanResult.direction)}`}>
              {dirIcon(scanResult.direction)} {scanResult.direction}
            </span>
            <span className="text-white/60">
              Confidence: <span className="text-white font-bold">{scanResult.confidence}/10</span>
            </span>
            {scanResult.entry_price && (
              <span className="text-white/60">
                Entry: <span className="text-white font-bold">{scanResult.entry_price}</span>
              </span>
            )}
            {scanResult.take_profit && (
              <span className="text-white/60">
                TP: <span className="text-green-400 font-bold">{scanResult.take_profit}</span>
              </span>
            )}
            {scanResult.stop_loss && (
              <span className="text-white/60">
                SL: <span className="text-red-400 font-bold">{scanResult.stop_loss}</span>
              </span>
            )}
            {scanResult.risk_reward && (
              <span className="text-white/60">
                R:R: <span className="text-amber-400 font-bold">{scanResult.risk_reward}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{scanResult.reasoning}</p>
          <p className="text-[10px] text-white/20 mt-2">
            Scanned: {new Date(scanResult.scanned_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* Attribution */}
      <p className="text-[10px] text-white/20 text-center">
        Charts powered by TradingView
      </p>
    </div>
  );
}
