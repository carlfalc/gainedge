import { useEffect, useRef, memo, useId } from "react";

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
  AUDJPY: { default: "FX:AUDJPY" },
  EURNZD: { default: "FX:EURNZD" },
  AUDNZD: { default: "FX:AUDNZD" },
  AUDCAD: { default: "FX:AUDCAD" },
  NZDCAD: { default: "FX:NZDCAD" },
  GBPCAD: { default: "FX:GBPCAD" },
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

let tvScriptPromise: Promise<void> | null = null;

function loadTvScript(): Promise<void> {
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve, reject) => {
    if (window.TradingView) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { tvScriptPromise = null; reject(new Error("Failed to load TradingView")); };
    document.head.appendChild(script);
  });
  return tvScriptPromise;
}

function TradingViewWidget({ symbol, broker }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stableId = useId().replace(/:/g, "_");
  const containerId = `tv_widget_${stableId}`;

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

      containerRef.current.innerHTML = "";

      const tvSymbol = getTvSymbol(symbol, broker);

      new window.TradingView.widget({
        symbol: tvSymbol,
        interval: "15",
        container_id: containerId,
        autosize: true,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "8",
        locale: "en",
        toolbar_bg: "#0a0a0a",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
        // Remove default volume study to avoid duplicate — volume bars already shown via style 8
        studies: [],
        disabled_features: [
          "header_symbol_search",
          "volume_force_overlay",
        ],
      });
    };

    init();
    return () => { cancelled = true; };
  }, [symbol, broker, containerId]);

  return (
    <div
      ref={containerRef}
      id={containerId}
      className="w-full h-full"
      style={{ minHeight: 600 }}
    />
  );
}

export default memo(TradingViewWidget);
