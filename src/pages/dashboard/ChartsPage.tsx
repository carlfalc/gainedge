import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import {
  Activity, TrendingUp, Minus, ArrowUpRight, ArrowDownRight, Clock,
  MousePointer2, TrendingDown, Minus as MinusIcon, MoveHorizontal,
  RectangleHorizontal, Maximize2, Settings, Search,
} from "lucide-react";

// ── Types ──
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; reasoning: string; scanned_at: string;
}

// ── Indicator calculations ──
function calcEMA(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (prev === null) {
      prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      prev = data[i] * k + prev * (1 - k);
    }
    result.push(prev);
  }
  return result;
}

function calcSMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcWMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    const denom = (period * (period + 1)) / 2;
    return slice.reduce((s, v, j) => s + v * (j + 1), 0) / denom;
  });
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [null];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      avgGain += gain; avgLoss += loss;
      if (i === period) { avgGain /= period; avgLoss /= period; }
      result.push(i < period ? null : (100 - 100 / (1 + avgGain / (avgLoss || 0.0001))));
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
    }
  }
  return result;
}

function calcMACD(closes: number[]): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: (number | null)[] = ema12.map((v, i) => (v !== null && ema26[i] !== null) ? v - ema26[i]! : null);
  const macdValues = macdLine.filter(v => v !== null) as number[];
  const signalRaw = calcEMA(macdValues, 9);
  let si = 0;
  const signal: (number | null)[] = macdLine.map(v => {
    if (v === null) return null;
    return signalRaw[si++] ?? null;
  });
  const hist = macdLine.map((v, i) => (v !== null && signal[i] !== null) ? v - signal[i]! : null);
  return { macd: macdLine, signal, hist };
}

function calcBB(closes: number[], period = 20, mult = 2): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const mid = calcSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid[i]!) ** 2, 0) / period);
    upper.push(mid[i]! + mult * std);
    lower.push(mid[i]! - mult * std);
  }
  return { upper, mid, lower };
}

function calcATR(candles: Candle[], period = 14): (number | null)[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trs.push(candles[i].high - candles[i].low); continue; }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trs.push(tr);
  }
  const result: (number | null)[] = [];
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      result.push(trs.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      result.push((result[i - 1]! * (period - 1) + trs[i]) / period);
    }
  }
  return result;
}

function calcStochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: (number | null)[]; d: (number | null)[] } {
  const kValues: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kValues.push(null); continue; }
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    kValues.push(high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100);
  }
  const kNums = kValues.filter(v => v !== null) as number[];
  const dRaw = calcSMA(kNums, dPeriod);
  let di = 0;
  const d: (number | null)[] = kValues.map(v => {
    if (v === null) return null;
    return dRaw[di++] ?? null;
  });
  return { k: kValues, d };
}

function calcCCI(candles: Candle[], period = 20): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = candles.slice(i - period + 1, i + 1);
    const tps = slice.map(c => (c.high + c.low + c.close) / 3);
    const mean = tps.reduce((a, b) => a + b, 0) / period;
    const md = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
    result.push(md === 0 ? 0 : (tps[tps.length - 1] - mean) / (0.015 * md));
  }
  return result;
}

function calcADX(candles: Candle[], period = 14): (number | null)[] {
  if (candles.length < period + 1) return candles.map(() => null);
  const pDMs: number[] = [];
  const nDMs: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    pDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    nDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  const smooth = (arr: number[]) => {
    const res: number[] = [arr.slice(0, period).reduce((a, b) => a + b, 0)];
    for (let i = period; i < arr.length; i++) res.push(res[res.length - 1] - res[res.length - 1] / period + arr[i]);
    return res;
  };
  const sTR = smooth(trs);
  const sPDM = smooth(pDMs);
  const sNDM = smooth(nDMs);
  const dx: number[] = [];
  for (let i = 0; i < sTR.length; i++) {
    const pDI = (sPDM[i] / (sTR[i] || 1)) * 100;
    const nDI = (sNDM[i] / (sTR[i] || 1)) * 100;
    dx.push(pDI + nDI === 0 ? 0 : (Math.abs(pDI - nDI) / (pDI + nDI)) * 100);
  }
  const result: (number | null)[] = new Array(period).fill(null);
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(adx);
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
    result.push(adx);
  }
  return result;
}

// ── Heiken Ashi conversion ──
function toHeikenAshi(candles: Candle[]): Candle[] {
  const ha: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    ha.push({ time: c.time, open: haOpen, high: Math.max(c.high, haOpen, haClose), low: Math.min(c.low, haOpen, haClose), close: haClose, volume: c.volume });
  }
  return ha;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];
const CHART_TYPES = ["Candlestick", "Heiken Ashi"];

const TF_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400,
};

const DRAWING_TOOLS = [
  { key: "cursor", label: "Cursor", icon: MousePointer2 },
  { key: "trendline", label: "Trend Line", icon: TrendingUp },
  { key: "hline", label: "Horizontal Line", icon: MinusIcon },
  { key: "vline", label: "Vertical Line", icon: MoveHorizontal },
  { key: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { key: "ray", label: "Ray", icon: TrendingDown },
];

interface IndicatorDef {
  key: string; label: string; type: "overlay" | "oscillator"; category: string;
}

const ALL_INDICATORS: IndicatorDef[] = [
  { key: "ema_fast", label: "EMA 4", type: "overlay", category: "Trend" },
  { key: "ema_slow", label: "EMA 17", type: "overlay", category: "Trend" },
  { key: "sma", label: "SMA 20", type: "overlay", category: "Trend" },
  { key: "wma", label: "WMA 20", type: "overlay", category: "Trend" },
  { key: "bb", label: "Bollinger Bands", type: "overlay", category: "Volatility" },
  { key: "rsi", label: "RSI (14)", type: "oscillator", category: "Momentum" },
  { key: "macd", label: "MACD (12,26,9)", type: "oscillator", category: "Momentum" },
  { key: "stochastic", label: "Stochastic (14,3)", type: "oscillator", category: "Momentum" },
  { key: "cci", label: "CCI (20)", type: "oscillator", category: "Momentum" },
  { key: "adx", label: "ADX (14)", type: "oscillator", category: "Momentum" },
  { key: "atr", label: "ATR (14)", type: "oscillator", category: "Volatility" },
];

const INDICATOR_CATEGORIES = ["Trend", "Momentum", "Volatility"];

export default function ChartsPage() {
  const [instruments, setInstruments] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("15m");
  const [chartType, setChartType] = useState("Heiken Ashi");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["ema_fast", "ema_slow"]));
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [userId, setUserId] = useState<string>();
  const [activeTool, setActiveTool] = useState("cursor");
  const [showSettings, setShowSettings] = useState(false);
  const [chartSettings, setChartSettings] = useState({
    showGrid: true, showCrosshair: true, showPriceLine: true,
    upColor: "#22C55E", downColor: "#EF4444", theme: "dark" as "dark" | "light",
  });
  const [ohlcv, setOhlcv] = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);
  const [countdown, setCountdown] = useState("");
  const [hLines, setHLines] = useState<number[]>([]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  // Load instruments
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol").eq("user_id", userId).then(({ data }) => {
      if (data && data.length > 0) {
        const syms = data.map(d => d.symbol);
        setInstruments(syms);
        if (!activeSymbol) setActiveSymbol(syms[0]);
      }
    });
  }, [userId]);

  // Fetch candles
  const fetchCandles = useCallback(async () => {
    if (!activeSymbol) return;
    setLoading(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const spans: Record<string, number> = { "1m": 3600 * 4, "5m": 3600 * 20, "15m": 3600 * 60, "1H": 86400 * 10, "4H": 86400 * 40, "1D": 86400 * 200 };
      const from = now - (spans[timeframe] || 86400 * 10);

      const { data, error } = await supabase.functions.invoke("fetch-candles", {
        body: { symbol: activeSymbol, resolution: timeframe, from, to: now },
      });

      if (error) throw error;
      if (data?.candles?.length) {
        setCandles(data.candles);
      } else {
        setCandles(generateDemoCandles(activeSymbol, from, spans[timeframe]));
      }
    } catch {
      const now = Math.floor(Date.now() / 1000);
      setCandles(generateDemoCandles(activeSymbol, now - 200 * 900, 200 * 900));
    }
    setLoading(false);
  }, [activeSymbol, timeframe]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Load latest scan result
  useEffect(() => {
    if (!userId || !activeSymbol) return;
    supabase.from("scan_results").select("*").eq("user_id", userId).eq("symbol", activeSymbol)
      .order("scanned_at", { ascending: false }).limit(1).then(({ data }) => {
        setScanResult(data?.[0] as ScanResult | null);
      });
    const channel = supabase.channel(`scan-chart-${activeSymbol}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_results" }, (payload) => {
        const row = payload.new as any;
        if (row.user_id === userId && row.symbol === activeSymbol) setScanResult(row);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activeSymbol]);

  // Display data
  const displayCandles = useMemo(() => {
    return chartType === "Heiken Ashi" ? toHeikenAshi(candles) : candles;
  }, [candles, chartType]);

  // Candle countdown timer
  useEffect(() => {
    const tfSec = TF_SECONDS[timeframe] || 900;
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = tfSec - (now % tfSec);
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      setCountdown(`${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);

  // WebSocket real-time streaming
  useEffect(() => {
    if (!activeSymbol) return;

    // Map symbol to Finnhub WS format
    const FINNHUB_WS_MAP: Record<string, string> = {
      XAUUSD: "OANDA:XAU_USD", US30: "OANDA:US30_USD", NAS100: "OANDA:NAS100_USD",
      NZDUSD: "OANDA:NZD_USD", AUDUSD: "OANDA:AUD_USD", EURUSD: "OANDA:EUR_USD",
      GBPUSD: "OANDA:GBP_USD", USDJPY: "OANDA:USD_JPY", USDCAD: "OANDA:USD_CAD",
      USDCHF: "OANDA:USD_CHF", GBPJPY: "OANDA:GBP_JPY", EURJPY: "OANDA:EUR_JPY",
      BTCUSD: "BINANCE:BTCUSDT", ETHUSD: "BINANCE:ETHUSDT",
    };

    const finnSymbol = FINNHUB_WS_MAP[activeSymbol] || activeSymbol;
    const tfSec = TF_SECONDS[timeframe] || 900;

    try {
      wsRef.current?.close();
    } catch {}

    const ws = new WebSocket("wss://ws.finnhub.io?token=d0mlsg1r01qqqs5aa4h0d0mlsg1r01qqqs5aa4hg");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", symbol: finnSymbol }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== "trade" || !msg.data?.length) return;

        const trades = msg.data as { p: number; t: number; v: number }[];
        const candleSeries = seriesRefs.current.get("candle");
        if (!candleSeries) return;

        for (const trade of trades) {
          const tradeSec = Math.floor(trade.t / 1000);
          const candleTime = Math.floor(tradeSec / tfSec) * tfSec;
          const price = trade.p;

          if (!lastCandleRef.current || candleTime > lastCandleRef.current.time) {
            // New candle
            const newCandle: Candle = { time: candleTime, open: price, high: price, low: price, close: price, volume: trade.v || 0 };
            lastCandleRef.current = newCandle;
          } else {
            // Update existing candle
            const lc = lastCandleRef.current;
            lc.high = Math.max(lc.high, price);
            lc.low = Math.min(lc.low, price);
            lc.close = price;
            lc.volume += trade.v || 0;
          }

          const lc = lastCandleRef.current;
          candleSeries.update({
            time: lc.time as Time,
            open: lc.open, high: lc.high, low: lc.low, close: lc.close,
          });

          // Update volume
          const volSeries = seriesRefs.current.get("volume");
          if (volSeries) {
            volSeries.update({
              time: lc.time as Time,
              value: lc.volume,
              color: lc.close >= lc.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
            } as any);
          }

          // Update OHLCV overlay
          setOhlcv({ o: lc.open, h: lc.high, l: lc.low, c: lc.close, v: lc.volume });
        }
      } catch {}
    };

    return () => {
      try {
        ws.send(JSON.stringify({ type: "unsubscribe", symbol: finnSymbol }));
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [activeSymbol, timeframe]);

  // Set initial OHLCV from latest candle
  useEffect(() => {
    if (displayCandles.length > 0) {
      const last = displayCandles[displayCandles.length - 1];
      setOhlcv({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
      lastCandleRef.current = candles[candles.length - 1] || null;
    }
  }, [displayCandles]);

  // ── Render chart ──
  useEffect(() => {
    if (!chartContainerRef.current || displayCandles.length === 0) return;

    try { chartRef.current?.remove(); } catch {}
    try { rsiChartRef.current?.remove(); } catch {}
    try { macdChartRef.current?.remove(); } catch {}
    chartRef.current = null;
    rsiChartRef.current = null;
    macdChartRef.current = null;
    seriesRefs.current.clear();

    const container = chartContainerRef.current;
    const bgColor = chartSettings.theme === "light" ? "#FFFFFF" : "#080B12";
    const textColor = chartSettings.theme === "light" ? "#333" : "#E4E9F0";
    const gridColor = chartSettings.showGrid
      ? (chartSettings.theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)")
      : "transparent";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: chartSettings.showCrosshair ? {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
        horzLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
      } : {
        mode: CrosshairMode.Normal,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      timeScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.1)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
    });
    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: chartSettings.upColor, downColor: chartSettings.downColor,
      borderUpColor: chartSettings.upColor, borderDownColor: chartSettings.downColor,
      wickUpColor: chartSettings.upColor, wickDownColor: chartSettings.downColor,
    });

    const chartData: CandlestickData<Time>[] = displayCandles.map(c => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeries.setData(chartData);
    seriesRefs.current.set("candle", candleSeries);

    // Volume histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(displayCandles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    })));
    seriesRefs.current.set("volume", volumeSeries);

    // Current price line
    if (chartSettings.showPriceLine && displayCandles.length > 0) {
      const lastPrice = displayCandles[displayCandles.length - 1].close;
      const prevClose = displayCandles.length > 1 ? displayCandles[displayCandles.length - 2].close : lastPrice;
      candleSeries.createPriceLine({
        price: lastPrice,
        color: lastPrice >= prevClose ? "#22C55E" : "#EF4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      });
    }

    // Horizontal lines from drawing tool
    for (const price of hLines) {
      candleSeries.createPriceLine({
        price,
        color: "#F59E0B",
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "",
      });
    }

    const closes = displayCandles.map(c => c.close);
    const times = displayCandles.map(c => c.time as Time);

    // Overlay indicators
    if (activeIndicators.has("ema_fast")) {
      const emaData = calcEMA(closes, 4);
      const series = chart.addSeries(LineSeries, { color: "#00CFA5", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(emaData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      seriesRefs.current.set("ema_fast", series);
    }
    if (activeIndicators.has("ema_slow")) {
      const emaData = calcEMA(closes, 17);
      const series = chart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(emaData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      seriesRefs.current.set("ema_slow", series);
    }
    if (activeIndicators.has("sma")) {
      const smaData = calcSMA(closes, 20);
      const series = chart.addSeries(LineSeries, { color: "#A78BFA", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(smaData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
    }
    if (activeIndicators.has("wma")) {
      const wmaData = calcWMA(closes, 20);
      const series = chart.addSeries(LineSeries, { color: "#60A5FA", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(wmaData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
    }
    if (activeIndicators.has("bb")) {
      const bb = calcBB(closes);
      const upper = chart.addSeries(LineSeries, { color: "rgba(167,139,250,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const lower = chart.addSeries(LineSeries, { color: "rgba(167,139,250,0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      upper.setData(bb.upper.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      lower.setData(bb.lower.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
    }

    // AI overlay price lines
    if (scanResult?.entry_price) {
      candleSeries.createPriceLine({ price: scanResult.entry_price, color: "#22C55E", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `Entry: ${scanResult.entry_price}` });
    }
    if (scanResult?.take_profit) {
      candleSeries.createPriceLine({ price: scanResult.take_profit, color: "#00CFA5", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP: ${scanResult.take_profit}` });
    }
    if (scanResult?.stop_loss) {
      candleSeries.createPriceLine({ price: scanResult.stop_loss, color: "#EF4444", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL: ${scanResult.stop_loss}` });
    }

    // Crosshair move handler for OHLCV overlay
    chart.subscribeCrosshairMove(param => {
      if (!param?.time) {
        if (displayCandles.length > 0) {
          const last = displayCandles[displayCandles.length - 1];
          setOhlcv({ o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume });
        }
        return;
      }
      const cd = displayCandles.find(c => c.time === param.time);
      if (cd) setOhlcv({ o: cd.open, h: cd.high, l: cd.low, c: cd.close, v: cd.volume });
    });

    // Handle click for drawing tools
    chart.subscribeClick(param => {
      if (activeTool === "hline" && param.point) {
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price !== null) {
          setHLines(prev => [...prev, price as number]);
        }
      }
    });

    chart.timeScale().fitContent();

    // RSI pane
    if (activeIndicators.has("rsi") && rsiContainerRef.current) {
      const rsiChart = createChart(rsiContainerRef.current, {
        width: rsiContainerRef.current.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      rsiChartRef.current = rsiChart;
      const rsiData = calcRSI(closes);
      const series = rsiChart.addSeries(LineSeries, { color: "#A78BFA", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(rsiData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      const ob = rsiChart.addSeries(LineSeries, { color: "rgba(239,68,68,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      ob.setData(times.map(t => ({ time: t, value: 70 })));
      const os = rsiChart.addSeries(LineSeries, { color: "rgba(34,197,94,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      os.setData(times.map(t => ({ time: t, value: 30 })));
      rsiChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { rsiChart.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // Stochastic pane
    const stochContainerEl = document.getElementById("stoch-pane");
    let stochChart: IChartApi | null = null;
    if (activeIndicators.has("stochastic") && stochContainerEl) {
      stochChart = createChart(stochContainerEl, {
        width: stochContainerEl.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      const stoch = calcStochastic(candles);
      const kSeries = stochChart.addSeries(LineSeries, { color: "#00CFA5", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      kSeries.setData(stoch.k.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      const dSeries = stochChart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      dSeries.setData(stoch.d.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      stochChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { stochChart?.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // CCI pane
    const cciContainerEl = document.getElementById("cci-pane");
    let cciChart: IChartApi | null = null;
    if (activeIndicators.has("cci") && cciContainerEl) {
      cciChart = createChart(cciContainerEl, {
        width: cciContainerEl.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      const cciData = calcCCI(candles);
      const series = cciChart.addSeries(LineSeries, { color: "#22D3EE", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(cciData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      cciChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { cciChart?.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // ADX pane
    const adxContainerEl = document.getElementById("adx-pane");
    let adxChart: IChartApi | null = null;
    if (activeIndicators.has("adx") && adxContainerEl) {
      adxChart = createChart(adxContainerEl, {
        width: adxContainerEl.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      const adxData = calcADX(candles);
      const series = adxChart.addSeries(LineSeries, { color: "#FB923C", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(adxData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      adxChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { adxChart?.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // ATR pane
    const atrContainerEl = document.getElementById("atr-pane");
    let atrChart: IChartApi | null = null;
    if (activeIndicators.has("atr") && atrContainerEl) {
      atrChart = createChart(atrContainerEl, {
        width: atrContainerEl.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      const atrData = calcATR(candles);
      const series = atrChart.addSeries(LineSeries, { color: "#F472B6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(atrData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      atrChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { atrChart?.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // MACD pane
    if (activeIndicators.has("macd") && macdContainerRef.current) {
      const macdChart = createChart(macdContainerRef.current, {
        width: macdContainerRef.current.clientWidth, height: 100,
        layout: { background: { color: bgColor }, textColor, fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { visible: true, borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      macdChartRef.current = macdChart;
      const macdData = calcMACD(closes);
      const macdLine = macdChart.addSeries(LineSeries, { color: "#00CFA5", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      macdLine.setData(macdData.macd.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      const sigLine = macdChart.addSeries(LineSeries, { color: "#F59E0B", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sigLine.setData(macdData.signal.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      const histSeries = macdChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      histSeries.setData(macdData.hist.map((v, i) => v !== null ? { time: times[i], value: v, color: v >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" } : null).filter(Boolean) as any);
      macdChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) try { macdChart.timeScale().setVisibleLogicalRange(range); } catch {} });
    }

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      if (rsiContainerRef.current && rsiChartRef.current) rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth });
      if (macdContainerRef.current && macdChartRef.current) macdChartRef.current.applyOptions({ width: macdContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      try { chart.remove(); } catch {}
      try { rsiChartRef.current?.remove(); } catch {}
      try { macdChartRef.current?.remove(); } catch {}
      try { stochChart?.remove(); } catch {}
      try { cciChart?.remove(); } catch {}
      try { adxChart?.remove(); } catch {}
      try { atrChart?.remove(); } catch {}
      chartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
    };
  }, [displayCandles, activeIndicators, scanResult, chartSettings, hLines, activeTool]);

  const toggleIndicator = (key: string) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const dirColor = scanResult?.direction === "BUY" ? C.green : scanResult?.direction === "SELL" ? C.red : C.amber;

  const filteredIndicators = ALL_INDICATORS.filter(ind =>
    ind.label.toLowerCase().includes(indicatorSearch.toLowerCase())
  );

  const formatNum = (n: number) => {
    if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(5);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 80px)" }}>
      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap",
        borderBottom: `1px solid ${C.border}`, marginBottom: 0,
      }}>
        {/* Instrument pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {instruments.map(sym => (
            <button key={sym} onClick={() => setActiveSymbol(sym)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1px solid ${activeSymbol === sym ? C.jade : C.border}`,
              background: activeSymbol === sym ? C.jade + "18" : "transparent",
              color: activeSymbol === sym ? C.jade : C.sec,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
            }}>
              {sym}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />

        {/* Timeframe pills */}
        <div style={{ display: "flex", gap: 2 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none",
              background: timeframe === tf ? C.jade + "18" : "transparent",
              color: timeframe === tf ? C.jade : C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              {tf}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />

        {/* Chart type */}
        <div style={{ display: "flex", gap: 2 }}>
          {CHART_TYPES.map(ct => (
            <button key={ct} onClick={() => setChartType(ct)} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, border: "none",
              background: chartType === ct ? "rgba(255,255,255,0.06)" : "transparent",
              color: chartType === ct ? C.text : C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              {ct}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: C.border, margin: "0 4px" }} />

        {/* Indicators button */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowIndicators(!showIndicators)} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: `1px solid ${C.border}`, background: showIndicators ? "rgba(255,255,255,0.06)" : "transparent",
            color: C.text, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            <Activity size={13} /> Indicators ({activeIndicators.size})
          </button>
          {showIndicators && (
            <div style={{
              position: "absolute", top: 32, left: 0, zIndex: 50,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: 8, minWidth: 260, maxHeight: 400, overflowY: "auto",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", marginBottom: 6, borderRadius: 6, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)" }}>
                <Search size={12} color={C.muted} />
                <input
                  type="text" placeholder="Search indicators..."
                  value={indicatorSearch} onChange={e => setIndicatorSearch(e.target.value)}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>
              {INDICATOR_CATEGORIES.map(cat => {
                const items = filteredIndicators.filter(ind => ind.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat}>
                    <div style={{ fontSize: 10, color: C.muted, padding: "6px 10px 3px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{cat}</div>
                    {items.map(ind => (
                      <button key={ind.key} onClick={() => toggleIndicator(ind.key)} style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                        background: activeIndicators.has(ind.key) ? C.jade + "14" : "transparent",
                        color: activeIndicators.has(ind.key) ? C.jade : C.sec,
                        fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                      }}>
                        <div style={{
                          width: 14, height: 14, borderRadius: 3,
                          border: `1.5px solid ${activeIndicators.has(ind.key) ? C.jade : C.muted}`,
                          background: activeIndicators.has(ind.key) ? C.jade : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {activeIndicators.has(ind.key) && <span style={{ color: "#080B12", fontSize: 10, fontWeight: 800 }}>✓</span>}
                        </div>
                        {ind.label}
                        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted }}>
                          {ind.type === "overlay" ? "overlay" : "pane"}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fit All button */}
        <button onClick={() => chartRef.current?.timeScale().fitContent()} style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
          border: `1px solid ${C.border}`, background: "transparent",
          color: C.sec, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
        }}>
          <Maximize2 size={12} /> Fit
        </button>

        {/* Settings */}
        <div style={{ position: "relative", marginLeft: "auto" }}>
          <button onClick={() => setShowSettings(!showSettings)} style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 10px", borderRadius: 6, fontSize: 11, border: `1px solid ${C.border}`,
            background: showSettings ? "rgba(255,255,255,0.06)" : "transparent",
            color: C.sec, cursor: "pointer",
          }}>
            <Settings size={13} />
          </button>
          {showSettings && (
            <div style={{
              position: "absolute", top: 32, right: 0, zIndex: 50,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: 12, minWidth: 200,
            }}>
              <div style={{ fontSize: 11, color: C.text, fontWeight: 700, marginBottom: 8 }}>Chart Settings</div>
              {[
                { label: "Grid Lines", key: "showGrid" as const },
                { label: "Crosshair", key: "showCrosshair" as const },
                { label: "Price Line", key: "showPriceLine" as const },
              ].map(item => (
                <label key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", fontSize: 11, color: C.sec, cursor: "pointer" }}>
                  {item.label}
                  <input type="checkbox" checked={chartSettings[item.key]} onChange={() => setChartSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    style={{ accentColor: C.jade }}
                  />
                </label>
              ))}
              <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>Theme</div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {(["dark", "light"] as const).map(t => (
                  <button key={t} onClick={() => setChartSettings(prev => ({ ...prev, theme: t }))} style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, border: `1px solid ${chartSettings.theme === t ? C.jade : C.border}`,
                    background: chartSettings.theme === t ? C.jade + "18" : "transparent",
                    color: chartSettings.theme === t ? C.jade : C.muted, cursor: "pointer", textTransform: "capitalize",
                  }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>Candle Colours</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                <label style={{ fontSize: 10, color: C.sec, display: "flex", alignItems: "center", gap: 4 }}>
                  Up <input type="color" value={chartSettings.upColor} onChange={e => setChartSettings(prev => ({ ...prev, upColor: e.target.value }))} style={{ width: 20, height: 20, border: "none", cursor: "pointer" }} />
                </label>
                <label style={{ fontSize: 10, color: C.sec, display: "flex", alignItems: "center", gap: 4 }}>
                  Down <input type="color" value={chartSettings.downColor} onChange={e => setChartSettings(prev => ({ ...prev, downColor: e.target.value }))} style={{ width: 20, height: 20, border: "none", cursor: "pointer" }} />
                </label>
              </div>
            </div>
          )}
        </div>

        {loading && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>Loading...</span>}
      </div>

      {/* CHART AREA WITH DRAWING TOOLS */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
        {/* Drawing tools sidebar */}
        <div style={{
          width: 36, display: "flex", flexDirection: "column", gap: 2, padding: "4px 2px",
          borderRight: `1px solid ${C.border}`, background: C.card,
        }}>
          {DRAWING_TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                title={tool.label}
                onClick={() => setActiveTool(tool.key)}
                style={{
                  width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 6, border: "none", cursor: "pointer",
                  background: activeTool === tool.key ? C.jade + "18" : "transparent",
                  color: activeTool === tool.key ? C.jade : C.muted,
                  transition: "all 0.15s",
                }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>

        {/* Chart + oscillator panes */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Main chart with overlays */}
          <div style={{ position: "relative", flex: 1, minHeight: 200 }}>
            <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />

            {/* OHLCV overlay (top-left) */}
            {ohlcv && (
              <div style={{
                position: "absolute", top: 8, left: 8, zIndex: 10,
                display: "flex", gap: 10, fontSize: 11, fontFamily: "'DM Mono', monospace",
                color: C.sec, pointerEvents: "none",
                background: "rgba(8,11,18,0.7)", padding: "4px 8px", borderRadius: 4,
              }}>
                <span>O: <span style={{ color: C.text }}>{formatNum(ohlcv.o)}</span></span>
                <span>H: <span style={{ color: C.green }}>{formatNum(ohlcv.h)}</span></span>
                <span>L: <span style={{ color: C.red }}>{formatNum(ohlcv.l)}</span></span>
                <span>C: <span style={{ color: ohlcv.c >= ohlcv.o ? C.green : C.red }}>{formatNum(ohlcv.c)}</span></span>
                <span>V: <span style={{ color: C.text }}>{Math.round(ohlcv.v).toLocaleString()}</span></span>
              </div>
            )}

            {/* Candle countdown (top-right) */}
            <div style={{
              position: "absolute", top: 8, right: 60, zIndex: 10,
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              color: C.jade, fontFamily: "'DM Mono', monospace",
              background: "rgba(8,11,18,0.7)", padding: "4px 8px", borderRadius: 4,
              pointerEvents: "none",
            }}>
              <Clock size={11} />
              {countdown}
            </div>
          </div>

          {/* Oscillator panes */}
          {activeIndicators.has("rsi") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>RSI (14)</div>
              <div ref={rsiContainerRef} style={{ height: 100 }} />
            </div>
          )}
          {activeIndicators.has("stochastic") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>Stochastic (14,3)</div>
              <div id="stoch-pane" style={{ height: 100 }} />
            </div>
          )}
          {activeIndicators.has("cci") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>CCI (20)</div>
              <div id="cci-pane" style={{ height: 100 }} />
            </div>
          )}
          {activeIndicators.has("adx") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>ADX (14)</div>
              <div id="adx-pane" style={{ height: 100 }} />
            </div>
          )}
          {activeIndicators.has("atr") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>ATR (14)</div>
              <div id="atr-pane" style={{ height: 100 }} />
            </div>
          )}
          {activeIndicators.has("macd") && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>MACD (12, 26, 9)</div>
              <div ref={macdContainerRef} style={{ height: 100 }} />
            </div>
          )}
        </div>
      </div>

      {/* AI ANALYSIS PANEL */}
      <div style={{
        height: 120, borderTop: `1px solid ${C.border}`, padding: "10px 16px",
        background: C.card, display: "flex", gap: 24, alignItems: "flex-start", overflow: "hidden",
      }}>
        {scanResult ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 100 }}>
              <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>AI Signal</span>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: dirColor + "18", color: dirColor, width: "fit-content",
              }}>
                {scanResult.direction === "BUY" ? <ArrowUpRight size={14} /> : scanResult.direction === "SELL" ? <ArrowDownRight size={14} /> : <Minus size={14} />}
                {scanResult.direction}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: dirColor }}>{scanResult.confidence}</span>
                <span style={{ fontSize: 10, color: C.muted }}>/10</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { label: "Entry", value: scanResult.entry_price, color: C.green },
                { label: "TP", value: scanResult.take_profit, color: C.jade },
                { label: "SL", value: scanResult.stop_loss, color: C.red },
                { label: "R:R", value: scanResult.risk_reward, color: C.text },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.value ?? "—"}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: C.muted }}>AI Reasoning</span>
              <p style={{ fontSize: 11, color: C.sec, lineHeight: 1.5, margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                {scanResult.reasoning}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>
              <Clock size={10} />
              {new Date(scanResult.scanned_at).toLocaleTimeString()}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 12 }}>
            <Activity size={14} />
            No AI scan data for {activeSymbol}. Run a scan to see AI analysis overlay.
          </div>
        )}
      </div>

      {/* Attribution */}
      <div style={{ textAlign: "center", padding: "4px 0", fontSize: 10, color: C.muted }}>
        Charts powered by <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" style={{ color: C.jade, textDecoration: "none" }}>TradingView Lightweight Charts™</a>
      </div>
    </div>
  );
}

function generateDemoCandles(symbol: string, from: number, span: number): Candle[] {
  const demo: Candle[] = [];
  let price = symbol === "XAUUSD" ? 2350 : symbol === "US30" ? 42000 : symbol === "NAS100" ? 21000 : 0.65;
  for (let i = 0; i < 200; i++) {
    const t = from + i * (span / 200);
    const change = (Math.random() - 0.48) * price * 0.003;
    const o = price; const c = o + change;
    const h = Math.max(o, c) + Math.random() * price * 0.001;
    const l = Math.min(o, c) - Math.random() * price * 0.001;
    demo.push({ time: Math.floor(t), open: o, high: h, low: l, close: c, volume: Math.floor(Math.random() * 5000 + 500) });
    price = c;
  }
  return demo;
}
