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
} from "lightweight-charts";
import {
  Activity, TrendingUp, Minus, Triangle, BarChart3,
  ArrowUpRight, ArrowDownRight, Clock,
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

const INDICATORS = [
  { key: "ema_fast", label: "EMA 4", type: "overlay" },
  { key: "ema_slow", label: "EMA 17", type: "overlay" },
  { key: "sma", label: "SMA 20", type: "overlay" },
  { key: "bb", label: "Bollinger Bands", type: "overlay" },
  { key: "rsi", label: "RSI", type: "oscillator" },
  { key: "macd", label: "MACD", type: "oscillator" },
];

export default function ChartsPage() {
  const [instruments, setInstruments] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("15m");
  const [chartType, setChartType] = useState("Heiken Ashi");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(["ema_fast", "ema_slow"]));
  const [showIndicators, setShowIndicators] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [userId, setUserId] = useState<string>();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<any>>>(new Map());

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
        // Generate demo data if API returns nothing
        const demo: Candle[] = [];
        let price = activeSymbol === "XAUUSD" ? 2350 : activeSymbol === "US30" ? 42000 : activeSymbol === "NAS100" ? 21000 : 0.65;
        for (let i = 0; i < 200; i++) {
          const t = from + i * (spans[timeframe] / 200);
          const change = (Math.random() - 0.48) * price * 0.003;
          const o = price; const c = o + change; const h = Math.max(o, c) + Math.random() * price * 0.001; const l = Math.min(o, c) - Math.random() * price * 0.001;
          demo.push({ time: Math.floor(t), open: o, high: h, low: l, close: c, volume: Math.random() * 1000 });
          price = c;
        }
        setCandles(demo);
      }
    } catch {
      // Generate fallback demo data
      const now = Math.floor(Date.now() / 1000);
      const demo: Candle[] = [];
      let price = activeSymbol === "XAUUSD" ? 2350 : activeSymbol === "US30" ? 42000 : activeSymbol === "NAS100" ? 21000 : 0.65;
      for (let i = 0; i < 200; i++) {
        const t = now - (200 - i) * 900;
        const change = (Math.random() - 0.48) * price * 0.003;
        const o = price; const c = o + change; const h = Math.max(o, c) + Math.random() * price * 0.001; const l = Math.min(o, c) - Math.random() * price * 0.001;
        demo.push({ time: Math.floor(t), open: o, high: h, low: l, close: c, volume: Math.random() * 1000 });
        price = c;
      }
      setCandles(demo);
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

  // ── Render chart ──
  useEffect(() => {
    if (!chartContainerRef.current || displayCandles.length === 0) return;

    // Cleanup previous charts safely
    try { chartRef.current?.remove(); } catch {}
    try { rsiChartRef.current?.remove(); } catch {}
    try { macdChartRef.current?.remove(); } catch {}
    chartRef.current = null;
    rsiChartRef.current = null;
    macdChartRef.current = null;
    seriesRefs.current.clear();

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: "#080B12" }, textColor: "#9CA3AF", fontFamily: "'DM Sans', sans-serif" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: {
        mode: 0,
        vertLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
        horzLine: { color: "#00CFA5", labelBackgroundColor: "#00CFA5" },
      },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22C55E", downColor: "#EF4444",
      borderUpColor: "#22C55E", borderDownColor: "#EF4444",
      wickUpColor: "#22C55E", wickDownColor: "#EF4444",
    });

    const chartData: CandlestickData<Time>[] = displayCandles.map(c => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeries.setData(chartData);
    seriesRefs.current.set("candle", candleSeries);

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
      seriesRefs.current.set("sma", series);
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

    chart.timeScale().fitContent();

    // RSI pane
    if (activeIndicators.has("rsi") && rsiContainerRef.current) {
      const rsiChart = createChart(rsiContainerRef.current, {
        width: rsiContainerRef.current.clientWidth, height: 100,
        layout: { background: { color: "#080B12" }, textColor: "#9CA3AF", fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });
      rsiChartRef.current = rsiChart;
      const rsiData = calcRSI(closes);
      const series = rsiChart.addSeries(LineSeries, { color: "#A78BFA", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      series.setData(rsiData.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as any);
      // Overbought/oversold lines
      const ob = rsiChart.addSeries(LineSeries, { color: "rgba(239,68,68,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      ob.setData(times.map(t => ({ time: t, value: 70 })));
      const os = rsiChart.addSeries(LineSeries, { color: "rgba(34,197,94,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      os.setData(times.map(t => ({ time: t, value: 30 })));
      rsiChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) rsiChart.timeScale().setVisibleLogicalRange(range); });
    }

    // MACD pane
    if (activeIndicators.has("macd") && macdContainerRef.current) {
      const macdChart = createChart(macdContainerRef.current, {
        width: macdContainerRef.current.clientWidth, height: 100,
        layout: { background: { color: "#080B12" }, textColor: "#9CA3AF", fontFamily: "'DM Sans', sans-serif" },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
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
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => { if (range) macdChart.timeScale().setVisibleLogicalRange(range); });
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
      chartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
    };
  }, [displayCandles, activeIndicators, scanResult]);

  const toggleIndicator = (key: string) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const dirColor = scanResult?.direction === "BUY" ? C.green : scanResult?.direction === "SELL" ? C.red : C.amber;

  const hasRSI = activeIndicators.has("rsi");
  const hasMACD = activeIndicators.has("macd");
  const oscHeight = (hasRSI ? 110 : 0) + (hasMACD ? 110 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 80px)" }}>
      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap",
        borderBottom: `1px solid ${C.border}`, marginBottom: 4,
      }}>
        {/* Instrument pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {instruments.map(sym => (
            <button key={sym} onClick={() => setActiveSymbol(sym)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1px solid ${activeSymbol === sym ? C.jade : C.border}`,
              background: activeSymbol === sym ? C.jade + "18" : "transparent",
              color: activeSymbol === sym ? C.jade : C.sec,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
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
              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: "none",
              background: timeframe === tf ? C.jade + "18" : "transparent",
              color: timeframe === tf ? C.jade : C.muted,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
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
              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
              border: "none",
              background: chartType === ct ? "rgba(255,255,255,0.06)" : "transparent",
              color: chartType === ct ? C.text : C.muted,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
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
              padding: 8, minWidth: 180,
            }}>
              {INDICATORS.map(ind => (
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
          )}
        </div>

        {loading && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>Loading...</span>}
      </div>

      {/* CHART AREA */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div ref={chartContainerRef} style={{ flex: 1, minHeight: 200 }} />
        {hasRSI && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>RSI (14)</div>
            <div ref={rsiContainerRef} style={{ height: 100 }} />
          </div>
        )}
        {hasMACD && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px" }}>MACD (12, 26, 9)</div>
            <div ref={macdContainerRef} style={{ height: 100 }} />
          </div>
        )}
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
