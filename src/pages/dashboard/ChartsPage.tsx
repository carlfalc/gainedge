import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { generateMockCandles } from "@/lib/mock-candles";
import {
  provisionAccount,
  fetchCandles,
  fetchCurrentPrice,
  type FormattedCandle,
} from "@/services/metaapi-client";
import {
  calculateEMA,
  calculateSMA,
  calculateBollingerBands,
  toHeikenAshi,
  type OHLCData,
} from "@/lib/chart-indicators";
import {
  Activity, ArrowUpRight, ArrowDownRight, Minus,
  Maximize2, Minimize2, ZoomIn, Search, X, MinusIcon, Loader2, Wifi, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import BrokerModal from "@/components/dashboard/BrokerModal";

/* ───── types ───── */
interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; reasoning: string; scanned_at: string;
}

interface CrosshairData {
  open: number; high: number; low: number; close: number; volume: number; time: number;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];
const CHART_TYPES = ["Candlestick", "Heiken Ashi"] as const;

type ConnectionStatus = "disconnected" | "connecting" | "live" | "demo";

/* ───── indicator config ───── */
interface IndicatorConfig {
  id: string; label: string; enabled: boolean; params?: Record<string, number>;
}

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "ema_fast", label: "EMA 4", enabled: true, params: { period: 4 } },
  { id: "ema_slow", label: "EMA 17", enabled: true, params: { period: 17 } },
  { id: "bollinger", label: "Bollinger Bands", enabled: false, params: { period: 20, stdDev: 2 } },
  { id: "sma_50", label: "SMA 50", enabled: false, params: { period: 50 } },
  { id: "sma_200", label: "SMA 200", enabled: false, params: { period: 200 } },
  { id: "rsi", label: "RSI 14", enabled: false, params: { period: 14 } },
  { id: "macd", label: "MACD", enabled: false },
];

/* ───── symbol mapping for Eightcap MT5 ───── */
const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  XAUUSD: ["XAUUSD"],
  US30: ["US30", "DJ30"],
  NAS100: ["NAS100", "USTEC"],
  NZDUSD: ["NZDUSD"],
  AUDUSD: ["AUDUSD"],
  EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"],
  USDJPY: ["USDJPY"],
};

export default function ChartsPage() {
  const { profile, userId } = useProfile();
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [timeframe, setTimeframe] = useState("15m");
  const [chartType, setChartType] = useState<typeof CHART_TYPES[number]>("Candlestick");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [crosshair, setCrosshair] = useState<CrosshairData | null>(null);
  const [countdown, setCountdown] = useState("");
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(DEFAULT_INDICATORS);
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [hLineMode, setHLineMode] = useState(false);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [brokerLabel, setBrokerLabel] = useState("");

  // MetaApi state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [loadingMessage, setLoadingMessage] = useState("");
  const accountIdRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const rawDataRef = useRef<OHLCData[]>([]);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const pricePollingRef = useRef<ReturnType<typeof setInterval>>();

  /* ─── load broker label from profile ─── */
  const BROKER_LABELS: Record<string, string> = {
    eightcap: "EIGHTCAP", ic_markets: "IC MARKETS", pepperstone: "PEPPERSTONE",
    oanda: "OANDA", "forex_com": "FOREX.COM", interactive_brokers: "INTERACTIVE BROKERS",
    saxo_bank: "SAXO BANK", avatrade: "AVATRADE", plus500: "PLUS500", "capital_com": "CAPITAL.COM",
    xtb: "XTB", fusion_markets: "FUSION MARKETS", fp_markets: "FP MARKETS", vantage: "VANTAGE",
    fxcm: "FXCM", ig: "IG", cmc_markets: "CMC MARKETS", admirals: "ADMIRALS",
    tickmill: "TICKMILL", thinkmarkets: "THINKMARKETS",
  };

  useEffect(() => {
    if (profile?.broker) {
      setBrokerLabel(BROKER_LABELS[profile.broker] || profile.broker.toUpperCase());
    }
  }, [profile]);

  /* ─── fetch instruments ─── */
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol").eq("user_id", userId)
      .then(({ data }) => {
        const syms = data?.map(d => d.symbol) ?? [];
        const list = syms.length > 0 ? syms : ["NAS100", "US30", "XAUUSD", "AUDUSD", "NZDUSD"];
        setInstruments(list);
        if (!selected) setSelected(list[0]);
      });
  }, [userId]);

  /* ─── fetch scan result ─── */
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("scan_results").select("*")
      .eq("user_id", userId).eq("symbol", selected)
      .order("scanned_at", { ascending: false }).limit(1)
      .then(({ data }) => setScanResult(data?.[0] as ScanResult ?? null));
  }, [userId, selected]);

  /* ─── countdown timer ─── */
  useEffect(() => {
    const tfMinutes: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240, "1D": 1440 };
    const mins = tfMinutes[timeframe] ?? 15;
    const update = () => {
      const now = Date.now();
      const intervalMs = mins * 60000;
      const nextClose = Math.ceil(now / intervalMs) * intervalMs;
      const diff = nextClose - now;
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timeframe]);

  /* ─── provision MetaApi on mount ─── */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const init = async () => {
      setConnectionStatus("connecting");
      setLoadingMessage("Connecting to broker...");
      try {
        const { accountId, state } = await provisionAccount();
        if (cancelled) return;
        accountIdRef.current = accountId;

        if (state === "DEPLOYING") {
          setLoadingMessage("Deploying account (may take up to 60s)...");
          // Poll for deployment completion
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            if (cancelled) return;
            try {
              const { accountId: aid, state: s } = await provisionAccount();
              if (s === "DEPLOYED" || s === "CONNECTED") {
                accountIdRef.current = aid;
                break;
              }
            } catch { /* keep polling */ }
          }
        }

        if (!cancelled) {
          setConnectionStatus("live");
          setLoadingMessage("");
          toast.success("Connected to broker — loading live data");
        }
      } catch (e: any) {
        if (cancelled) return;
        console.warn("MetaApi provision failed, using mock data:", e.message);
        accountIdRef.current = null;
        setConnectionStatus("demo");
        setLoadingMessage("");
        toast.error("Could not connect to broker. Showing simulated data.");
      }
    };

    init();
    return () => { cancelled = true; };
  }, [userId]);

  /* ─── load candles (real or mock) ─── */
  const loadCandles = useCallback(async (): Promise<OHLCData[]> => {
    const acctId = accountIdRef.current;
    if (acctId && connectionStatus === "live") {
      try {
        setLoadingMessage("Loading candles...");
        // Try broker symbol variants
        const variants = BROKER_SYMBOL_MAP[selected] ?? [selected];
        let candles: FormattedCandle[] = [];

        for (const sym of variants) {
          try {
            candles = await fetchCandles(acctId, sym, timeframe, 500);
            if (candles.length > 0) break;
          } catch { /* try next variant */ }
        }

        setLoadingMessage("");

        if (candles.length > 0) {
          return candles.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
        }

        // No candles returned — fall back to mock
        toast.error(`No data for ${selected}. Showing simulated data.`);
      } catch (e: any) {
        setLoadingMessage("");
        console.warn("Failed to fetch candles:", e.message);
      }
    }

    // Fallback to mock data
    if (connectionStatus === "live") setConnectionStatus("demo");
    return generateMockCandles(selected, timeframe, 500);
  }, [selected, timeframe, connectionStatus]);

  /* ─── start price polling ─── */
  const startPricePolling = useCallback(() => {
    if (pricePollingRef.current) clearInterval(pricePollingRef.current);

    const acctId = accountIdRef.current;
    if (!acctId || connectionStatus !== "live") {
      // Use mock tick simulation
      startMockTicks();
      return;
    }

    const variants = BROKER_SYMBOL_MAP[selected] ?? [selected];
    const brokerSymbol = variants[0]; // Use primary symbol

    pricePollingRef.current = setInterval(async () => {
      try {
        const price = await fetchCurrentPrice(acctId, brokerSymbol);
        if (!price) return;

        const last = rawDataRef.current[rawDataRef.current.length - 1];
        if (!last) return;

        const mid = (price.bid + price.ask) / 2;
        const updated: OHLCData = {
          ...last,
          close: mid,
          high: Math.max(last.high, mid),
          low: Math.min(last.low, mid),
        };
        rawDataRef.current[rawDataRef.current.length - 1] = updated;

        const display = chartType === "Heiken Ashi"
          ? toHeikenAshi(rawDataRef.current).pop()!
          : updated;

        candleSeriesRef.current?.update({
          time: display.time as Time,
          open: display.open, high: display.high, low: display.low, close: display.close,
        });
      } catch { /* ignore polling errors */ }
    }, 2000);
  }, [selected, connectionStatus, chartType]);

  const startMockTicks = useCallback(() => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => {
      const last = rawDataRef.current[rawDataRef.current.length - 1];
      if (!last) return;
      const vol = VOLATILITY_MAP[selected] ?? last.close * 0.0003;
      const change = (Math.random() - 0.5) * vol;
      const newClose = +(last.close + change).toFixed(5);
      const updated: OHLCData = {
        ...last,
        close: newClose,
        high: Math.max(last.high, newClose),
        low: Math.min(last.low, newClose),
      };
      rawDataRef.current[rawDataRef.current.length - 1] = updated;
      const display = chartType === "Heiken Ashi"
        ? toHeikenAshi(rawDataRef.current).pop()!
        : updated;
      candleSeriesRef.current?.update({
        time: display.time as Time,
        open: display.open, high: display.high, low: display.low, close: display.close,
      });
    }, 1500);
  }, [selected, chartType]);

  /* ─── create chart ─── */
  const buildChart = useCallback(async () => {
    if (!containerRef.current || !selected) return;
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    overlaySeriesRefs.current = [];

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "#080B12" },
        textColor: "#9CA3AF",
        fontFamily: "'DM Sans', sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
        horzLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.1)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22C55E", downColor: "#EF4444",
      borderUpColor: "#22C55E", borderDownColor: "#EF4444",
      wickUpColor: "#22C55E", wickDownColor: "#EF4444",
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    // Load data (real or mock)
    const rawData = await loadCandles();
    rawDataRef.current = rawData;
    const displayData = chartType === "Heiken Ashi" ? toHeikenAshi(rawData) : rawData;

    candleSeries.setData(displayData.map(d => ({
      time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close,
    })));

    volSeries.setData(displayData.map(d => ({
      time: d.time as Time, value: d.volume ?? 0,
      color: d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    })));

    // Current price line
    const lastCandle = displayData[displayData.length - 1];
    if (lastCandle) {
      candleSeries.createPriceLine({
        price: lastCandle.close,
        color: lastCandle.close >= lastCandle.open ? "#22C55E" : "#EF4444",
        lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Price",
      });
    }

    // Scan result lines
    if (scanResult) {
      if (scanResult.entry_price) {
        candleSeries.createPriceLine({ price: scanResult.entry_price, color: "#3B82F6", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entry" });
      }
      if (scanResult.take_profit) {
        candleSeries.createPriceLine({ price: scanResult.take_profit, color: "#22C55E", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "TP" });
      }
      if (scanResult.stop_loss) {
        candleSeries.createPriceLine({ price: scanResult.stop_loss, color: "#EF4444", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "SL" });
      }
    }

    // Overlay indicators
    applyIndicators(chart, rawData, displayData);

    // Crosshair
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setCrosshair(null); return; }
      const candle = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      const vol = param.seriesData.get(volSeries) as any;
      if (candle) {
        setCrosshair({
          open: candle.open, high: candle.high, low: candle.low, close: candle.close,
          volume: vol?.value ?? 0, time: param.time as number,
        });
      }
    });

    // H-Line click
    if (hLineMode) {
      chart.subscribeClick((param) => {
        if (!param.point) return;
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price !== null) {
          candleSeries.createPriceLine({ price, color: "#F59E0B", lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "" });
        }
        setHLineMode(false);
      });
    }

    chart.timeScale().fitContent();

    // Start price updates
    startPricePolling();
  }, [selected, timeframe, chartType, scanResult, hLineMode, indicators, loadCandles, startPricePolling]);

  const applyIndicators = (chart: IChartApi, rawData: OHLCData[], _displayData: OHLCData[]) => {
    overlaySeriesRefs.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    overlaySeriesRefs.current = [];

    for (const ind of indicators) {
      if (!ind.enabled) continue;
      if (ind.id === "ema_fast" || ind.id === "ema_slow") {
        const period = ind.params?.period ?? 17;
        const emaData = calculateEMA(rawData, period);
        const s = chart.addSeries(LineSeries, {
          color: ind.id === "ema_fast" ? "#00CFA5" : "#8B5CF6",
          lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        });
        s.setData(emaData.map(d => ({ time: d.time as Time, value: d.value })));
        overlaySeriesRefs.current.push(s);
      }
      if (ind.id === "sma_50" || ind.id === "sma_200") {
        const period = ind.params?.period ?? 50;
        const smaData = calculateSMA(rawData, period);
        const s = chart.addSeries(LineSeries, {
          color: ind.id === "sma_50" ? "#F59E0B" : "#EC4899",
          lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        });
        s.setData(smaData.map(d => ({ time: d.time as Time, value: d.value })));
        overlaySeriesRefs.current.push(s);
      }
      if (ind.id === "bollinger") {
        const { upper, middle, lower } = calculateBollingerBands(rawData, ind.params?.period ?? 20, ind.params?.stdDev ?? 2);
        const colors = ["#3B82F6", "#6B7280", "#3B82F6"];
        [upper, middle, lower].forEach((band, idx) => {
          const s = chart.addSeries(LineSeries, {
            color: colors[idx], lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
          });
          s.setData(band.map(d => ({ time: d.time as Time, value: d.value })));
          overlaySeriesRefs.current.push(s);
        });
      }
    }
  };

  /* rebuild chart on deps change */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await buildChart();
    };
    run();
    return () => {
      cancelled = true;
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (pricePollingRef.current) clearInterval(pricePollingRef.current);
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  /* ─── helpers ─── */
  const dirColor = (d: string) => d === "BUY" ? "text-green-400" : d === "SELL" ? "text-red-400" : "text-amber-400";
  const dirIcon = (d: string) =>
    d === "BUY" ? <ArrowUpRight className="w-4 h-4" /> :
    d === "SELL" ? <ArrowDownRight className="w-4 h-4" /> :
    <Minus className="w-4 h-4" />;

  const lastCandle = rawDataRef.current[rawDataRef.current.length - 1];
  const currentPrice = crosshair ?? (lastCandle ? {
    open: lastCandle.open, high: lastCandle.high, low: lastCandle.low,
    close: lastCandle.close, volume: lastCandle.volume ?? 0, time: lastCandle.time,
  } : null);

  const filteredIndicators = indicators.filter(i =>
    i.label.toLowerCase().includes(indicatorSearch.toLowerCase())
  );

  const statusDot = connectionStatus === "live" ? "bg-green-400" : connectionStatus === "connecting" ? "bg-amber-400 animate-pulse" : connectionStatus === "demo" ? "bg-red-400" : "bg-gray-500";
  const statusText = connectionStatus === "live" ? "Live" : connectionStatus === "connecting" ? "Connecting..." : connectionStatus === "demo" ? "Demo" : "Offline";

  return (
    <div className={`flex flex-col w-full gap-2 ${isFullscreen ? "fixed inset-0 z-50 bg-[#080B12] p-2" : "h-full p-2 sm:p-4"}`}>
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111724] border border-white/10 text-[11px] font-semibold mr-1">
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-white/60">{statusText}</span>
          {connectionStatus === "live" ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-white/30" />}
        </div>

        {/* Instrument pills */}
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
        <div className="w-px h-6 bg-white/10 mx-1" />
        {/* Timeframes */}
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all border ${
              timeframe === tf
                ? "bg-[#00CFA5]/15 border-[#00CFA5]/40 text-[#00CFA5]"
                : "bg-[#111724] border-white/10 text-[#8892A4] hover:text-white"
            }`}
          >
            {tf}
          </button>
        ))}
        <div className="w-px h-6 bg-white/10 mx-1" />
        {/* Chart type */}
        {CHART_TYPES.map(ct => (
          <button
            key={ct}
            onClick={() => setChartType(ct)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all border ${
              chartType === ct
                ? "bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-[#8B5CF6]"
                : "bg-[#111724] border-white/10 text-[#8892A4] hover:text-white"
            }`}
          >
            {ct}
          </button>
        ))}
        <div className="w-px h-6 bg-white/10 mx-1" />
        {/* Broker badge */}
        <button
          onClick={() => setShowBrokerModal(true)}
          className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider transition-all border border-[#EAB308]/50 bg-[#EAB308]/10 text-white hover:bg-[#EAB308]/20 hover:border-[#EAB308] flex items-center gap-1.5"
        >
          <span className="text-[#EAB308] text-[10px]">●</span>
          {brokerLabel || "BROKER"}
        </button>
        <button onClick={() => setShowIndicatorModal(true)} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1">
          <Search className="w-3 h-3" /> Indicators
        </button>
        <button onClick={() => setHLineMode(m => !m)} className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all border flex items-center gap-1 ${hLineMode ? "bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B]" : "bg-[#111724] border-white/10 text-[#8892A4] hover:text-white"}`}>
          <MinusIcon className="w-3 h-3" /> H-Line
        </button>
        <button onClick={() => chartRef.current?.timeScale().fitContent()} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1">
          <ZoomIn className="w-3 h-3" /> Fit
        </button>
        <button onClick={() => setIsFullscreen(f => !f)} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all ml-auto">
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* OHLCV overlay + countdown */}
      <div className="flex items-center justify-between text-[11px] px-1">
        <div className="flex items-center gap-3 font-mono">
          <span className="text-white/40">{selected}</span>
          {currentPrice && (
            <>
              <span className="text-white/60">O: <span className="text-white">{currentPrice.open}</span></span>
              <span className="text-white/60">H: <span className="text-green-400">{currentPrice.high}</span></span>
              <span className="text-white/60">L: <span className="text-red-400">{currentPrice.low}</span></span>
              <span className="text-white/60">C: <span className={currentPrice.close >= currentPrice.open ? "text-green-400" : "text-red-400"}>{currentPrice.close}</span></span>
              <span className="text-white/60">V: <span className="text-white">{currentPrice.volume?.toLocaleString()}</span></span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/40">Next close:</span>
          <span className="text-[#00CFA5] font-bold font-mono">{countdown}</span>
        </div>
      </div>

      {/* Chart container */}
      <div className="relative">
        <div
          ref={containerRef}
          className={`rounded-lg overflow-hidden border border-white/[0.06] ${isFullscreen ? "flex-1" : "min-h-[55vh]"}`}
          style={{ cursor: hLineMode ? "crosshair" : undefined }}
        />
        {/* Loading overlay */}
        {(connectionStatus === "connecting" || loadingMessage) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080B12]/80 rounded-lg z-10">
            <Loader2 className="w-8 h-8 text-[#00CFA5] animate-spin mb-3" />
            <span className="text-sm text-white/60">{loadingMessage || "Connecting to broker..."}</span>
          </div>
        )}
      </div>

      {/* AI Analysis Panel */}
      {!isFullscreen && scanResult && (
        <div className="rounded-lg border border-white/[0.06] bg-[#111724] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#00CFA5]" />
            <span className="text-xs font-bold text-[#00CFA5] tracking-wider">AI ANALYSIS — {scanResult.symbol}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs mb-2">
            <span className={`font-bold flex items-center gap-1 ${dirColor(scanResult.direction)}`}>
              {dirIcon(scanResult.direction)} {scanResult.direction}
            </span>
            <span className="text-white/60">Confidence: <span className="text-white font-bold">{scanResult.confidence}/10</span></span>
            {scanResult.entry_price && <span className="text-white/60">Entry: <span className="text-white font-bold">{scanResult.entry_price}</span></span>}
            {scanResult.take_profit && <span className="text-white/60">TP: <span className="text-green-400 font-bold">{scanResult.take_profit}</span></span>}
            {scanResult.stop_loss && <span className="text-white/60">SL: <span className="text-red-400 font-bold">{scanResult.stop_loss}</span></span>}
            {scanResult.risk_reward && <span className="text-white/60">R:R: <span className="text-amber-400 font-bold">{scanResult.risk_reward}</span></span>}
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{scanResult.reasoning}</p>
          <p className="text-[10px] text-white/20 mt-2">Scanned: {new Date(scanResult.scanned_at).toLocaleString()}</p>
        </div>
      )}

      {/* Attribution */}
      {!isFullscreen && (
        <p className="text-[10px] text-white/20 text-center">
          Charts powered by{" "}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" className="underline">
            Lightweight Charts™
          </a>{" "}• tradingview.com
        </p>
      )}

      {/* Indicator modal */}
      {showIndicatorModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={() => setShowIndicatorModal(false)}>
          <div className="bg-[#111724] border border-white/10 rounded-xl p-5 w-[360px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-white">Indicators</span>
              <button onClick={() => setShowIndicatorModal(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <input
              value={indicatorSearch} onChange={e => setIndicatorSearch(e.target.value)}
              placeholder="Search indicators..."
              className="w-full bg-[#080B12] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 mb-3 outline-none focus:border-[#00CFA5]/40"
            />
            <div className="flex flex-col gap-1">
              {filteredIndicators.map(ind => (
                <button
                  key={ind.id}
                  onClick={() => setIndicators(prev => prev.map(i => i.id === ind.id ? { ...i, enabled: !i.enabled } : i))}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all ${
                    ind.enabled ? "bg-[#00CFA5]/10 text-[#00CFA5] border border-[#00CFA5]/30" : "text-white/60 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <span className="font-medium">{ind.label}</span>
                  <span className="text-[10px]">{ind.enabled ? "ON" : "OFF"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Broker modal */}
      <BrokerModal
        open={showBrokerModal}
        onClose={() => setShowBrokerModal(false)}
        userId={userId}
        onBrokerChange={(key, label) => {
          setBrokerLabel(label.toUpperCase());
          setShowBrokerModal(false);
        }}
      />
    </div>
  );
}

const VOLATILITY_MAP: Record<string, number> = {
  XAUUSD: 0.5, US30: 5, NAS100: 3, NZDUSD: 0.0002, AUDUSD: 0.0002,
  EURUSD: 0.0002, GBPUSD: 0.0003, USDJPY: 0.03, USDCAD: 0.0002,
  USDCHF: 0.0002, GBPJPY: 0.04, EURJPY: 0.03, XAGUSD: 0.02,
  BTCUSD: 30, ETHUSD: 3, US500: 1, SPX500: 1,
};
