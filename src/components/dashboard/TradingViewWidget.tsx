import { useEffect, useRef, memo } from "react";

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

const BROKER_EXCHANGES: Record<string, string> = {
  Eightcap: "EIGHTCAP",
  Pepperstone: "PEPPERSTONE",
  "IC Markets": "ICMARKETS",
  OANDA: "OANDA",
};

function getTvSymbol(sym: string, broker: string): string {
  const exchange = BROKER_EXCHANGES[broker] || "";
  const map = TV_SYMBOL_MAP[sym];
  if (map) return map[exchange] || map.default || `FX:${sym}`;
  if (exchange) return `${exchange}:${sym}`;
  return `FX:${sym}`;
}

interface TradingViewWidgetProps {
  symbol: string;
  broker: string;
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

function loadTvScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TradingView) {
      resolve();
      return;
    }
    const existing = document.getElementById("tradingview-widget-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load TradingView")));
      return;
    }
    const script = document.createElement("script");
    script.id = "tradingview-widget-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load TradingView"));
    document.head.appendChild(script);
  });
}

function TradingViewWidget({ symbol, broker }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadTvScript();
      } catch {
        console.error("TradingView script failed to load");
        return;
      }
      if (cancelled || !containerRef.current || !window.TradingView) return;

      // Clear previous widget
      containerRef.current.innerHTML = "";

      const tvSymbol = getTvSymbol(symbol, broker);

      widgetRef.current = new window.TradingView.widget({
        symbol: tvSymbol,
        interval: "15",
        container_id: containerRef.current.id,
        datafeed: undefined,
        library_path: undefined,
        autosize: true,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "8", // Heiken Ashi
        locale: "en",
        toolbar_bg: "#0a0a0a",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        studies: ["Volume@tv-basicstudies"],
        show_popup_button: false,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
        width: "100%",
        height: "100%",
      });
    };

    init();

    return () => {
      cancelled = true;
      widgetRef.current = null;
    };
  }, [symbol, broker]);

  const containerId = `tv-widget-${symbol}-${broker}`.replace(/\s+/g, "");

  return (
    <div
      ref={containerRef}
      id={containerId}
      className="w-full h-full"
    />
  );
}

export default memo(TradingViewWidget);
