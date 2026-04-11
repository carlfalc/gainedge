import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  CrosshairMode,
} from "lightweight-charts";
import { supabase } from "@/integrations/supabase/client";
import { signalFreshness, formatAge } from "@/lib/expiry";
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
import { getAllIndicators, type IndicatorMeta } from "@/lib/indicator-registry";
import IndicatorModal, { type ActiveIndicator } from "@/components/dashboard/IndicatorModal";
import DrawingToolbar from "@/components/dashboard/DrawingToolbar";
import {
  Activity, ArrowUpRight, ArrowDownRight, Minus,
  Maximize2, Minimize2, ZoomIn, Search, X, MinusIcon, Loader2, Wifi, WifiOff, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import BrokerModal from "@/components/dashboard/BrokerModal";
import TradeExecutionPanel, { type OrderMode, type LimitOrderPrices, type Position, type TradeExecutionPanelRef } from "@/components/dashboard/TradeExecutionPanel";
import { detectPatterns, type DetectedPattern } from "@/services/pattern-detection";
import ChartOrderLines from "@/components/dashboard/ChartOrderLines";

/* ───── types ───── */
interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; reasoning: string; scanned_at: string;
}

interface CrosshairData {
  open: number; high: number; low: number; close: number; volume: number; time: number;
}

interface SavedDrawing {
  id: string;
  drawing_type: string;
  drawing_data: any;
}

interface SignalRecord {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number; stop_loss: number; take_profit: number;
  result: string; pnl_pips: number | null; created_at: string;
  resolved_at: string | null; closed_at: string | null;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];

/* ───── RON Pattern Historical Stats ───── */
const PATTERN_STATS: Record<string, { targetHitRate: number; avgPipMove: string; direction: string; avgFrequency: string }> = {
  "Double Top": { targetHitRate: 65, avgPipMove: "40-80", direction: "bearish", avgFrequency: "~3x/week" },
  "Double Bottom": { targetHitRate: 65, avgPipMove: "40-80", direction: "bullish", avgFrequency: "~3x/week" },
  "Head & Shoulders": { targetHitRate: 70, avgPipMove: "60-120", direction: "bearish", avgFrequency: "~2x/week" },
  "Ascending Triangle": { targetHitRate: 72, avgPipMove: "30-60", direction: "bullish", avgFrequency: "~4x/week" },
  "Descending Triangle": { targetHitRate: 72, avgPipMove: "30-60", direction: "bearish", avgFrequency: "~4x/week" },
  "Bull Flag": { targetHitRate: 67, avgPipMove: "25-50", direction: "bullish", avgFrequency: "~5x/week" },
  "Bear Flag": { targetHitRate: 67, avgPipMove: "25-50", direction: "bearish", avgFrequency: "~5x/week" },
};

/* ───── Pip calculation helper ───── */
const calculatePips = (priceDiff: number, symbol: string): number => {
  if (symbol.includes("XAU")) return Math.abs(priceDiff) * 10;
  if (symbol.includes("JPY") || symbol.includes("XAG")) return Math.abs(priceDiff) * 100;
  if (["US30", "NAS100", "SPX500", "US500"].some(s => symbol.includes(s))) return Math.abs(priceDiff);
  if (symbol.includes("BTC")) return Math.abs(priceDiff);
  return Math.abs(priceDiff) * 10000; // forex default
};
const CHART_TYPES = ["Candlestick", "Heiken Ashi"] as const;

type ConnectionStatus = "disconnected" | "connecting" | "live" | "demo";

/* ───── symbol mapping for Eightcap MT5 ───── */
const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  XAUUSD: ["XAUUSD"], US30: ["US30", "DJ30"], NAS100: ["NAS100", "USTEC"],
  NZDUSD: ["NZDUSD"], AUDUSD: ["AUDUSD"], EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"], USDJPY: ["USDJPY"],
};

/* ───── Drawing tool → DrawingManager mapping ───── */
const DRAWING_TOOL_MAP: Record<string, string> = {
  trend_line: "TrendLine", horizontal_line: "HorizontalLine", vertical_line: "VerticalLine",
  ray: "Ray", arrow: "Arrow", extended_line: "ExtendedLine", cross_line: "CrossLine",
  info_line: "InfoLine", trend_angle: "TrendAngle", horizontal_ray: "HorizontalRay",
  fib_retracement: "FibRetracement", fib_extension: "FibExtension", fib_channel: "FibChannel",
  fib_time_zone: "FibTimeZone", fib_speed_fan: "FibSpeedFan", fib_circles: "FibCircles",
  fib_spiral: "FibSpiral", fib_arcs: "FibArcs", fib_wedge: "FibWedge", pitchfan: "Pitchfan",
  trend_fib_time: "TrendBasedFibTime",
  parallel_channel: "ParallelChannel", regression_trend: "RegressionTrend",
  flat_top_bottom: "FlatTopBottom", disjoint_channel: "DisjointChannel",
  andrews_pitchfork: "AndrewsPitchfork", schiff_pitchfork: "SchiffPitchfork",
  modified_schiff: "ModifiedSchiffPitchfork", inside_pitchfork: "InsidePitchfork",
  gann_box: "GannBox", gann_fan: "GannFan", gann_square_fixed: "GannSquareFixed", gann_square: "GannSquare",
  rectangle: "Rectangle", circle: "Circle", triangle: "Triangle", ellipse: "Ellipse",
  arc: "Arc", price_range: "PriceRange", rotated_rectangle: "RotatedRectangle",
  path: "Path", polyline: "Polyline", curve: "Curve", double_curve: "DoubleCurve",
  text: "Text", callout: "Callout", anchored_text: "AnchoredText", note: "Note",
  price_note: "PriceNote", price_label: "PriceLabel", arrow_marker: "ArrowMarker",
  flag_mark: "FlagMark", comment: "Comment",
  long_position: "LongPosition", short_position: "ShortPosition",
  projection: "Projection", forecast: "Forecast", bars_pattern: "BarsPattern",
  date_range: "DateRange", date_price_range: "DateAndPriceRange",
};

const EDGE_CANDLE_MAX_CLOSE_DEVIATION = 0.02;
const LIVE_PRICE_MAX_CLOSE_DEVIATION = 0.02;

const getCloseDeviationRatio = (value: number, reference: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(reference)) return 0;
  const baseline = Math.abs(reference);
  if (baseline === 0) return value === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(value - reference) / baseline;
};

const dropAnomalousEdgeCandles = <T extends { close: number }>(candles: T[]) => {
  if (candles.length < 2) return candles;

  const cleaned = [...candles];

  if (
    cleaned.length >= 2 &&
    getCloseDeviationRatio(cleaned[0].close, cleaned[1].close) > EDGE_CANDLE_MAX_CLOSE_DEVIATION
  ) {
    cleaned.shift();
  }

  if (
    cleaned.length >= 2 &&
    getCloseDeviationRatio(cleaned[cleaned.length - 1].close, cleaned[cleaned.length - 2].close) > EDGE_CANDLE_MAX_CLOSE_DEVIATION
  ) {
    cleaned.pop();
  }

  return cleaned;
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
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [brokerLabel, setBrokerLabel] = useState("");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitPrices, setLimitPrices] = useState<LimitOrderPrices | null>(null);
  const [tradePositions, setTradePositions] = useState<Position[]>([]);
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [showPatternLabels, setShowPatternLabels] = useState(true);
  const [patternHistory, setPatternHistory] = useState<Array<{ pattern: DetectedPattern; detectedAt: string; entryPrice: number; outcome?: "confirmed" | "invalidated"; pipMove?: number }>>([]);
  const [patternUserStats, setPatternUserStats] = useState<{ total: number; confirmed: number } | null>(null);

  // Refs to break rebuild chain for order mode / limit prices
  const orderModeRef = useRef<OrderMode>(orderMode);
  const limitPricesRef = useRef<LimitOrderPrices | null>(limitPrices);
  const showPatternLabelsRef = useRef(showPatternLabels);
  const [chartSignals, setChartSignals] = useState<SignalRecord[]>([]);
  // Indicators
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>([]);
  const indicatorsLoadedRef = useRef(false);

  // Drawing tools
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>(null);
  const [savedDrawings, setSavedDrawings] = useState<SavedDrawing[]>([]);
  const drawingManagerRef = useRef<any>(null);

  // MetaApi state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [loadingMessage, setLoadingMessage] = useState("");
  const accountIdRef = useRef<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const paneSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const tradeLinesRef = useRef<any[]>([]);
  const patternSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const patternPriceLinesRef = useRef<Array<{ line: any; title: string }>>([]);
  const tradeConnectorSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const rawDataRef = useRef<OHLCData[]>([]);
  const chartTypeRef = useRef(chartType);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const pricePollingRef = useRef<ReturnType<typeof setInterval>>();
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const tradePanelRef = useRef<TradeExecutionPanelRef>(null);

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

  const syncChartViewport = useCallback((fitContent = false) => {
    if (!containerRef.current || !chartRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    if (width <= 0 || height <= 0) return;

    chartRef.current.applyOptions({ width, height });
    if (fitContent) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  const scheduleChartViewportSync = useCallback((fitContent = false) => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        syncChartViewport(fitContent);
      });
    });
  }, [syncChartViewport]);

  /* ─── per-instrument timeframe map ─── */
  const instrumentTfRef = useRef<Map<string, string>>(new Map());

  /* ─── fetch instruments ─── */
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol, timeframe").eq("user_id", userId)
      .then(({ data }) => {
        const syms = data?.map(d => d.symbol) ?? [];
        const list = syms.length > 0 ? syms : ["NAS100", "US30", "XAUUSD", "AUDUSD", "NZDUSD"];
        const tfMap = new Map<string, string>();
        data?.forEach(d => tfMap.set(d.symbol, d.timeframe || "15m"));
        instrumentTfRef.current = tfMap;
        setInstruments(list);
        if (!selected) {
          setSelected(list[0]);
          setTimeframe(tfMap.get(list[0]) || "15m");
        }
      });
  }, [userId]);

  /* ─── load saved indicator preferences ─── */
  useEffect(() => {
    if (!userId || indicatorsLoadedRef.current) return;
    indicatorsLoadedRef.current = true;

    supabase.from("user_indicator_preferences").select("*").eq("user_id", userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const allInds = getAllIndicators();
          const loaded: ActiveIndicator[] = data.map((row: any) => {
            const meta = allInds.find(i => i.id === row.indicator_id);
            return {
              id: row.indicator_id,
              meta: meta || { id: row.indicator_id, name: row.indicator_id, shortName: row.indicator_id, category: "Other", overlay: true, group: "standard", inputConfig: [], plotConfig: [], calculate: () => ({ metadata: { title: "", shorttitle: "", overlay: true }, plots: {} }) },
              enabled: row.enabled,
              params: row.params || {},
            };
          });
          setActiveIndicators(loaded);
        } else {
          // Default indicators
          const allInds = getAllIndicators();
          const defaults = [
            { id: "ema", params: { len: 4 } },
            { id: "ema", params: { len: 17 } },
          ];
          const defaultActive: ActiveIndicator[] = [];
          const emaMeta = allInds.find(i => i.id === "ema");
          if (emaMeta) {
            defaultActive.push({ id: "ema_4", meta: emaMeta, enabled: true, params: { len: 4 } });
            defaultActive.push({ id: "ema_17", meta: emaMeta, enabled: true, params: { len: 17 } });
          }
          setActiveIndicators(defaultActive);
        }
      });
  }, [userId]);

  /* ─── load saved drawings ─── */
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("chart_drawings").select("id, drawing_type, drawing_data")
      .eq("user_id", userId).eq("symbol", selected).eq("timeframe", timeframe)
      .then(({ data }) => {
        setSavedDrawings((data as SavedDrawing[]) || []);
      });
  }, [userId, selected, timeframe]);

  /* ─── When instrument changes, load its saved timeframe ─── */
  useEffect(() => {
    if (!selected) return;
    const savedTf = instrumentTfRef.current.get(selected);
    if (savedTf) setTimeframe(savedTf);
  }, [selected]);

  /* ─── fetch scan result ─── */
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("scan_results").select("*")
      .eq("user_id", userId).eq("symbol", selected)
      .order("scanned_at", { ascending: false }).limit(1)
      .then(({ data }) => setScanResult(data?.[0] as ScanResult ?? null));
  }, [userId, selected]);

  /* ─── fetch signals for chart markers ─── */
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("signals").select("*")
      .eq("user_id", userId).eq("symbol", selected)
      .order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setChartSignals((data as SignalRecord[]) ?? []));

    // Subscribe to realtime updates
    const channel = supabase.channel(`signals-markers-${selected}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "signals",
        filter: `symbol=eq.${selected}`,
      }, () => {
        supabase.from("signals").select("*")
          .eq("user_id", userId).eq("symbol", selected)
          .order("created_at", { ascending: true }).limit(200)
          .then(({ data }) => setChartSignals((data as SignalRecord[]) ?? []));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, selected]);

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

  /* ─── load candles (real or mock) — also fills gap to current time ─── */
  const loadCandles = useCallback(async (): Promise<OHLCData[]> => {
    const acctId = accountIdRef.current;
    if (acctId && connectionStatus === "live") {
      try {
        setLoadingMessage("Loading candles...");
        const variants = BROKER_SYMBOL_MAP[selected] ?? [selected];
        let candles: FormattedCandle[] = [];
        let usedSymbol = variants[0];

        for (const sym of variants) {
          try {
            candles = await fetchCandles(acctId, sym, timeframe, 500);
            if (candles.length > 0) { usedSymbol = sym; break; }
          } catch { /* try next variant */ }
        }

        if (candles.length > 0) {
          // ── Fill gap between last historical candle and NOW ──
          const lastTs = candles[candles.length - 1].time;
          const nowTs = Math.floor(Date.now() / 1000);
          const tfSeconds: Record<string, number> = {
            "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400,
          };
          const interval = tfSeconds[timeframe] || 900;
          const gap = nowTs - lastTs;

          if (gap > interval * 1.5) {
            // Fetch missing candles from lastTs to now
            try {
              const gapStart = new Date(lastTs * 1000).toISOString();
              const gapCandles = await fetchCandles(acctId, usedSymbol, timeframe, 200, Math.ceil(gap / 86400) + 1);
              // Only keep candles AFTER our last historical candle
              const newCandles = gapCandles.filter(c => c.time > lastTs);
              if (newCandles.length > 0) {
                candles = [...candles, ...newCandles];
              }
            } catch {
              // Gap fill failed — acceptable, we just won't bridge with fake data
            }
          }

          const cleanedCandles = dropAnomalousEdgeCandles(candles);

          setLoadingMessage("");
          return cleanedCandles.map(c => ({
            time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
          }));
        }

        setLoadingMessage("");
        toast.error(`No data for ${selected}. Showing simulated data.`);
      } catch (e: any) {
        setLoadingMessage("");
        console.warn("Failed to fetch candles:", e.message);
      }
    }

    if (connectionStatus === "live") setConnectionStatus("demo");
    return generateMockCandles(selected, timeframe, 500);
  }, [selected, timeframe, connectionStatus]);

  /* ─── start price polling ─── */
  const startPricePolling = useCallback(() => {
    if (pricePollingRef.current) clearInterval(pricePollingRef.current);

    const acctId = accountIdRef.current;
    if (!acctId || connectionStatus !== "live") {
      startMockTicks();
      return;
    }

    const variants = BROKER_SYMBOL_MAP[selected] ?? [selected];
    const brokerSymbol = variants[0];

    // Calculate the current candle period timestamp so updates stay within it
    const tfSeconds: Record<string, number> = {
      "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400,
    };
    const interval = tfSeconds[timeframe] || 900;

    pricePollingRef.current = setInterval(async () => {
      try {
        const price = await fetchCurrentPrice(acctId, brokerSymbol);
        if (!price) return;

        const last = rawDataRef.current[rawDataRef.current.length - 1];
        if (!last) return;

        const mid = (price.bid + price.ask) / 2;
        const liveDeviationRatio = getCloseDeviationRatio(mid, last.close);

        console.log("[ChartsPage] MetaApi price check", {
          symbol: brokerSymbol,
          metaApiMid: Number(mid.toFixed(5)),
          lastCandleClose: Number(last.close.toFixed(5)),
          deviationPercent: Number((liveDeviationRatio * 100).toFixed(3)),
        });

        if (liveDeviationRatio > LIVE_PRICE_MAX_CLOSE_DEVIATION) {
          console.warn(
            `[ChartsPage] Skipping stale MetaApi price for ${brokerSymbol}: mid ${mid.toFixed(5)} vs last close ${last.close.toFixed(5)} (${(liveDeviationRatio * 100).toFixed(2)}% deviation)`
          );
          return;
        }

        const nowTs = Math.floor(Date.now() / 1000);
        const currentPeriod = Math.floor(nowTs / interval) * interval;

        // ── Guard: anomaly detection ──
        // Compute avg range of last 20 candles
        const recent = rawDataRef.current.slice(-20);
        if (recent.length >= 5) {
          const avgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
          const proposedHigh = Math.max(last.time === currentPeriod ? last.high : mid, mid);
          const proposedLow = Math.min(last.time === currentPeriod ? last.low : mid, mid);
          const proposedRange = proposedHigh - proposedLow;
          if (avgRange > 0 && proposedRange > avgRange * 5) {
            console.warn(`Skipping anomalous tick: range ${proposedRange.toFixed(5)} > 5x avg ${avgRange.toFixed(5)}`);
            return;
          }
        }

        const currentChartType = chartTypeRef.current;

        // If the live price belongs to a NEW candle period, start a new candle
        if (currentPeriod > last.time) {
          const newCandle: OHLCData = {
            time: currentPeriod, open: mid, high: mid, low: mid, close: mid, volume: 0,
          };
          rawDataRef.current.push(newCandle);
          const display = currentChartType === "Heiken Ashi"
            ? toHeikenAshi(rawDataRef.current).pop()!
            : newCandle;
          candleSeriesRef.current?.update({
            time: display.time as Time,
            open: display.open, high: display.high, low: display.low, close: display.close,
          });
        } else {
          // Update the current candle in-place
          const updated: OHLCData = {
            ...last, close: mid, high: Math.max(last.high, mid), low: Math.min(last.low, mid),
          };
          rawDataRef.current[rawDataRef.current.length - 1] = updated;
          const display = currentChartType === "Heiken Ashi"
            ? toHeikenAshi(rawDataRef.current).pop()!
            : updated;
          candleSeriesRef.current?.update({
            time: display.time as Time,
            open: display.open, high: display.high, low: display.low, close: display.close,
          });
        }
      } catch { /* ignore polling errors */ }
    }, 2000);
  }, [selected, connectionStatus, timeframe]);

  const startMockTicks = useCallback(() => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => {
      const last = rawDataRef.current[rawDataRef.current.length - 1];
      if (!last) return;
      const vol = VOLATILITY_MAP[selected] ?? last.close * 0.0003;
      const change = (Math.random() - 0.5) * vol;
      const newClose = +(last.close + change).toFixed(5);
      const updated: OHLCData = {
        ...last, close: newClose, high: Math.max(last.high, newClose), low: Math.min(last.low, newClose),
      };
      rawDataRef.current[rawDataRef.current.length - 1] = updated;
      const currentChartType = chartTypeRef.current;
      const display = currentChartType === "Heiken Ashi"
        ? toHeikenAshi(rawDataRef.current).pop()!
        : updated;
      candleSeriesRef.current?.update({
        time: display.time as Time,
        open: display.open, high: display.high, low: display.low, close: display.close,
      });
    }, 1500);
  }, [selected]);

  /* ─── keep refs in sync (no rebuild) ─── */
  useEffect(() => { orderModeRef.current = orderMode; }, [orderMode]);
  useEffect(() => { limitPricesRef.current = limitPrices; }, [limitPrices]);
  useEffect(() => { showPatternLabelsRef.current = showPatternLabels; }, [showPatternLabels]);

  /* ─── draw trade level lines ─── */
  const drawTradeLines = useCallback((candleSeries: ISeriesApi<"Candlestick">) => {
    tradeLinesRef.current.forEach(line => {
      try { candleSeries.removePriceLine(line); } catch {}
    });
    tradeLinesRef.current = [];

    const addLine = (price: number, color: string, title: string) => {
      const line = candleSeries.createPriceLine({
        price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title,
      });
      tradeLinesRef.current.push(line);
    };

    if (scanResult) {
      const fresh = signalFreshness(scanResult.scanned_at);
      if (fresh !== "expired") {
        if (scanResult.entry_price) addLine(scanResult.entry_price, "#FFFFFF", `Entry: ${scanResult.entry_price.toLocaleString()}`);
        if (scanResult.stop_loss) addLine(scanResult.stop_loss, "#EF4444", `SL: ${scanResult.stop_loss.toLocaleString()}`);
        if (scanResult.take_profit) addLine(scanResult.take_profit, "#22C55E", `TP: ${scanResult.take_profit.toLocaleString()}`);
      }
    }

    const symbolPositions = tradePositions.filter(p => {
      const sym = p.symbol?.replace(".i", "").replace("NDX100", "NAS100");
      return sym === selected || p.symbol === selected;
    });
    symbolPositions.forEach((p, i) => {
      const label = i > 0 ? ` #${i + 1}` : "";
      addLine(p.openPrice, "#3B82F6", `Pos${label}: ${p.openPrice.toLocaleString()}`);
      if (p.stopLoss) addLine(p.stopLoss, "#EF4444", `Pos SL${label}`);
      if (p.takeProfit) addLine(p.takeProfit, "#22C55E", `Pos TP${label}`);
    });

    // Read from refs to avoid triggering rebuild chain
    const lp = limitPricesRef.current;
    const om = orderModeRef.current;
    if (lp && (om === "limit" || om === "stop")) {
      if (lp.entry) addLine(lp.entry, "#FFFFFF", om === "limit" ? "Limit Entry" : "Stop Entry");
      if (lp.slEnabled && lp.sl) addLine(lp.sl, "#EF4444", "Pending SL");
      if (lp.tpEnabled && lp.tp) addLine(lp.tp, "#22C55E", "Pending TP");
    }
  }, [scanResult, tradePositions, selected]);

  /* ─── redraw trade lines when order mode / limit prices change (no rebuild) ─── */
  useEffect(() => {
    if (candleSeriesRef.current) drawTradeLines(candleSeriesRef.current);
  }, [drawTradeLines, orderMode, limitPrices]);

  /* ─── toggle pattern labels without rebuild ─── */
  useEffect(() => {
    patternPriceLinesRef.current.forEach(({ line, title }) => {
      try {
        line.applyOptions({ title: showPatternLabels ? title : "" });
      } catch {}
    });
  }, [showPatternLabels]);

  /* ─── indicator toggle handler ─── */
  const handleIndicatorToggle = useCallback((meta: IndicatorMeta, params?: Record<string, any>) => {
    setActiveIndicators(prev => {
      const existing = prev.find(a => a.id === meta.id);
      if (existing) {
        // Toggle off
        const updated = prev.map(a => a.id === meta.id ? { ...a, enabled: !a.enabled } : a);
        saveIndicatorPrefs(updated);
        return updated;
      }
      // Add new
      const defaultParams: Record<string, any> = {};
      meta.inputConfig.forEach(input => {
        if (input.defval !== undefined) defaultParams[input.id] = input.defval;
      });
      const newInd: ActiveIndicator = {
        id: meta.id,
        meta,
        enabled: true,
        params: params || defaultParams,
      };
      const updated = [...prev, newInd];
      saveIndicatorPrefs(updated);
      return updated;
    });
  }, [userId]);

  const handleIndicatorRemove = useCallback((id: string) => {
    setActiveIndicators(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveIndicatorPrefs(updated);
      return updated;
    });
  }, [userId]);

  const saveIndicatorPrefs = useCallback(async (indicators: ActiveIndicator[]) => {
    if (!userId) return;
    // Delete all existing prefs, then insert new ones
    await supabase.from("user_indicator_preferences").delete().eq("user_id", userId);
    if (indicators.length > 0) {
      await supabase.from("user_indicator_preferences").insert(
        indicators.map(ind => ({
          user_id: userId,
          indicator_id: ind.id,
          enabled: ind.enabled,
          params: ind.params,
        }))
      );
    }
  }, [userId]);

  /* ─── Drawing tools ─── */
  const initDrawingManager = useCallback(async (chart: IChartApi, series: ISeriesApi<"Candlestick">) => {
    try {
      const drawingMod = await import("lightweight-charts-drawing");
      const { DrawingManager } = drawingMod;
      const dm = new DrawingManager();
      dm.attach(chart, series, containerRef.current!);
      drawingManagerRef.current = dm;

      // Load saved drawings
      if (savedDrawings.length > 0) {
        try {
          const drawingData = savedDrawings.map(d => d.drawing_data);
          // importDrawings requires a factory function
          dm.importDrawings(drawingData, (type: string, data: any) => {
            const ToolClass = (drawingMod as any)[type];
            if (ToolClass) {
              try { return new ToolClass(data); } catch { return null; }
            }
            return null;
          });
        } catch (e) {
          console.warn("Failed to import saved drawings:", e);
        }
      }

      return dm;
    } catch (e) {
      console.warn("DrawingManager init failed:", e);
      return null;
    }
  }, [savedDrawings]);

  const handleSelectDrawingTool = useCallback((toolId: string | null) => {
    setActiveDrawingTool(toolId);
    const dm = drawingManagerRef.current;
    if (!dm) return;

    if (!toolId) {
      dm.setActiveTool(null);
      return;
    }

    const toolClass = DRAWING_TOOL_MAP[toolId];
    if (toolClass) {
      dm.setActiveTool(toolClass);
    }
  }, []);

  const handleClearDrawings = useCallback(async () => {
    const dm = drawingManagerRef.current;
    if (dm) dm.clearAll();
    setSavedDrawings([]);
    if (userId && selected) {
      await supabase.from("chart_drawings").delete()
        .eq("user_id", userId).eq("symbol", selected).eq("timeframe", timeframe);
    }
  }, [userId, selected, timeframe]);

  const saveDrawings = useCallback(async () => {
    const dm = drawingManagerRef.current;
    if (!dm || !userId || !selected) return;

    try {
      const exported = dm.exportDrawings();
      // Delete existing, insert new
      await supabase.from("chart_drawings").delete()
        .eq("user_id", userId).eq("symbol", selected).eq("timeframe", timeframe);

      if (exported && exported.length > 0) {
        await supabase.from("chart_drawings").insert(
          exported.map((d: any) => ({
            user_id: userId,
            symbol: selected,
            timeframe,
            drawing_type: d.type || "unknown",
            drawing_data: d,
          }))
        );
      }
    } catch (e) {
      console.warn("Failed to save drawings:", e);
    }
  }, [userId, selected, timeframe]);

  /* ─── apply indicators using community library ─── */
  const applyIndicators = useCallback((chart: IChartApi, rawData: OHLCData[]) => {
    // Clean up existing series
    overlaySeriesRefs.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    overlaySeriesRefs.current = [];
    paneSeriesRefs.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    paneSeriesRefs.current = [];

    const bars = rawData.map(d => ({
      time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume ?? 0,
    }));

    if (bars.length < 5) return;

    // Indicator legend data
    const legendItems: string[] = [];

    for (const ind of activeIndicators) {
      if (!ind.enabled || !ind.meta.calculate) continue;

      try {
        const result = ind.meta.calculate(bars, ind.params);
        if (!result || !result.plots) continue;

        const plotKeys = Object.keys(result.plots);
        const isOverlay = result.metadata?.overlay ?? ind.meta.overlay;
        const plotConfigs = ind.meta.plotConfig || [];

        plotKeys.forEach((plotKey, plotIdx) => {
          const plotData = result.plots[plotKey];
          if (!plotData || plotData.length === 0) return;

          // Skip hidden plots
          const plotCfg = plotConfigs[plotIdx];
          if (plotCfg?.display === "none") return;

          // Filter out null values
          const validData = plotData
            .filter((p: any) => p.value !== null && p.value !== undefined && isFinite(p.value))
            .map((p: any) => ({ time: p.time as Time, value: p.value }));

          if (validData.length === 0) return;

          const color = plotCfg?.color || getDefaultColor(plotIdx);
          const lineWidth = plotCfg?.lineWidth ?? 1;

          if (isOverlay) {
            const s = chart.addSeries(LineSeries, {
              color, lineWidth: lineWidth as any, priceLineVisible: false, lastValueVisible: false,
            });
            s.setData(validData);
            overlaySeriesRefs.current.push(s);
          } else {
            // Oscillator pane
            const s = chart.addSeries(LineSeries, {
              color, lineWidth: lineWidth as any, priceLineVisible: false, lastValueVisible: true,
              priceScaleId: `pane_${ind.id}`,
            });
            chart.priceScale(`pane_${ind.id}`).applyOptions({
              scaleMargins: { top: 0.8, bottom: 0 },
              borderVisible: false,
            });
            s.setData(validData);
            paneSeriesRefs.current.push(s);
          }
        });

        // Last value for legend
        const mainPlot = result.plots[plotKeys[0]];
        const lastVal = mainPlot?.filter((p: any) => p.value !== null).pop();
        if (lastVal) {
          legendItems.push(`${ind.meta.shortName}: ${typeof lastVal.value === 'number' ? lastVal.value.toFixed(2) : lastVal.value}`);
        }
      } catch (e) {
        console.warn(`Indicator ${ind.meta.shortName} failed:`, e);
      }
    }
  }, [activeIndicators]);

  /* ─── create chart ─── */
  const buildChart = useCallback(async () => {
    if (!containerRef.current || !selected) return;
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
    if (chartRef.current) {
      // Save drawings before destroying
      await saveDrawings();
      chartRef.current.remove();
      chartRef.current = null;
    }
    overlaySeriesRefs.current = [];
    paneSeriesRefs.current = [];
    drawingManagerRef.current = null;

    const chart = createChart(containerRef.current, {
      width: Math.max(containerRef.current.clientWidth, 1),
      height: Math.max(containerRef.current.clientHeight, 1),
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
        visible: true, borderColor: "rgba(255,255,255,0.1)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        visible: true, borderColor: "rgba(255,255,255,0.1)",
        timeVisible: true, secondsVisible: false, rightOffset: 5,
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
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

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

    drawTradeLines(candleSeries);
    applyIndicators(chart, rawData);

    // ─── RON Pattern Detection ───
    patternSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    patternSeriesRef.current = [];
    patternPriceLinesRef.current = [];

    const patterns = detectPatterns(rawData.map(c => ({ time: c.time as number, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
    setDetectedPatterns(patterns);

    // Track pattern history (two most recent named patterns with timestamps + entry price + outcome)
    const namedPatterns = patterns.filter(p => p.pattern_name !== "Support" && p.pattern_name !== "Resistance");
    if (namedPatterns.length > 0) {
      const topPattern = namedPatterns.reduce((a, b) => b.confidence > a.confidence ? b : a);
      const now = new Date().toLocaleTimeString();
      const entryCandle = rawData[Math.min(topPattern.end_index, rawData.length - 1)];
      const entryPrice = entryCandle?.close ?? rawData[rawData.length - 1]?.close ?? 0;
      const currentClose = rawData[rawData.length - 1]?.close ?? 0;

      setPatternHistory(prev => {
        const isSame = prev.length > 0 && prev[0].pattern.pattern_name === topPattern.pattern_name && prev[0].pattern.confidence === topPattern.confidence;
        if (isSame) return prev;

        // Calculate outcome for the pattern being rotated to "previous"
        const updatedPrev = prev.length > 0 ? (() => {
          const old = prev[0];
          const priceDiff = currentClose - old.entryPrice;
          const isBullish = old.pattern.direction === "bullish";
          const movedRight = isBullish ? priceDiff > 0 : priceDiff < 0;
          const pips = calculatePips(priceDiff, selected);
          return { ...old, outcome: (movedRight ? "confirmed" : "invalidated") as "confirmed" | "invalidated", pipMove: pips };
        })() : null;

        const newEntry = { pattern: topPattern, detectedAt: now, entryPrice };
        return updatedPrev ? [newEntry, updatedPrev].slice(0, 2) : [newEntry];
      });
    }

    const labelsOn = showPatternLabelsRef.current;

    const addPatternPriceLine = (series: ISeriesApi<"Candlestick">, opts: any, titleText: string) => {
      const line = series.createPriceLine({ ...opts, title: labelsOn ? titleText : "" });
      patternPriceLinesRef.current.push({ line, title: titleText });
    };

    for (const pat of patterns) {
      const color = pat.direction === "bullish" ? "#22C55E" : "#EF4444";
      const isSR = pat.pattern_name === "Support" || pat.pattern_name === "Resistance";

      // Draw support/resistance as price lines on the candle series
      if (isSR) {
        const level = pat.key_prices.support ?? pat.key_prices.resistance;
        if (level) {
          addPatternPriceLine(candleSeries, {
            price: level, color: "#F59E0B", lineWidth: 1, lineStyle: 1, axisLabelVisible: true,
          }, pat.pattern_name);
        }
        continue;
      }

      // Draw trendlines for triangles, flags (these are line series, no title text)
      if (pat.key_prices.upper_line) {
        const ul = pat.key_prices.upper_line;
        const series = chart.addSeries(LineSeries, {
          color, lineWidth: 2, lineStyle: 2, priceScaleId: "right",
          lastValueVisible: false, priceLineVisible: false,
        });
        series.setData([
          { time: ul.start.time as Time, value: ul.start.price },
          { time: ul.end.time as Time, value: ul.end.price },
        ]);
        patternSeriesRef.current.push(series);
      }
      if (pat.key_prices.lower_line) {
        const ll = pat.key_prices.lower_line;
        const series = chart.addSeries(LineSeries, {
          color, lineWidth: 2, lineStyle: 2, priceScaleId: "right",
          lastValueVisible: false, priceLineVisible: false,
        });
        series.setData([
          { time: ll.start.time as Time, value: ll.start.price },
          { time: ll.end.time as Time, value: ll.end.price },
        ]);
        patternSeriesRef.current.push(series);
      }

      // Draw neckline for double top/bottom, H&S
      if (pat.key_prices.neckline) {
        addPatternPriceLine(candleSeries, {
          price: pat.key_prices.neckline, color, lineWidth: 1, lineStyle: 1, axisLabelVisible: true,
        }, `${pat.pattern_name} Neckline`);
      }

      // Draw target
      if (pat.key_prices.target) {
        addPatternPriceLine(candleSeries, {
          price: pat.key_prices.target, color, lineWidth: 1, lineStyle: 3, axisLabelVisible: true,
        }, `${pat.pattern_name} Target`);
      }
    }

    // ─── RON Trade Markers ───
    tradeConnectorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    tradeConnectorSeriesRef.current = [];

    if (chartSignals.length > 0 && rawData.length > 0) {
      const firstCandleTs = rawData[0].time;
      const lastCandleTs = rawData[rawData.length - 1].time;

      // Helper: find nearest candle timestamp for a given ISO date
      const findNearestTs = (isoDate: string): number => {
        const ts = Math.floor(new Date(isoDate).getTime() / 1000);
        // Find closest candle time
        let closest = rawData[0].time;
        let minDiff = Math.abs(ts - closest);
        for (const c of rawData) {
          const diff = Math.abs(ts - c.time);
          if (diff < minDiff) { minDiff = diff; closest = c.time; }
        }
        return closest;
      };

      const markers: Array<{
        time: Time; position: "belowBar" | "aboveBar" | "inBar";
        color: string; shape: "arrowUp" | "arrowDown" | "circle";
        text: string;
      }> = [];

      for (const sig of chartSignals) {
        const entryTs = findNearestTs(sig.created_at);
        if (entryTs < firstCandleTs || entryTs > lastCandleTs) continue;

        // Entry marker
        if (sig.direction === "BUY") {
          markers.push({
            time: entryTs as Time, position: "belowBar", color: "#22C55E",
            shape: "arrowUp", text: `BUY (${sig.confidence})`,
          });
        } else {
          markers.push({
            time: entryTs as Time, position: "aboveBar", color: "#EF4444",
            shape: "arrowDown", text: `SELL (${sig.confidence})`,
          });
        }

        // Result marker
        const resolvedDate = sig.resolved_at || sig.closed_at;
        if (resolvedDate && sig.result !== "pending") {
          const exitTs = findNearestTs(resolvedDate);
          if (exitTs >= firstCandleTs && exitTs <= lastCandleTs) {
            const isWin = sig.result.toLowerCase() === "win";
            const isLoss = sig.result.toLowerCase() === "loss";
            const pipsText = sig.pnl_pips != null
              ? `${sig.pnl_pips >= 0 ? "+" : ""}${sig.pnl_pips.toFixed(1)} pips`
              : sig.result.toUpperCase() === "EXPIRED" ? "EXP" : sig.result.toUpperCase();

            markers.push({
              time: exitTs as Time, position: "inBar",
              color: isWin ? "#22C55E" : isLoss ? "#EF4444" : "#6B7280",
              shape: "circle", text: pipsText,
            });

            // Connector line from entry to exit
            if (entryTs !== exitTs) {
              const connectorSeries = chart.addSeries(LineSeries, {
                color: isWin ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
                lineWidth: 1, lineStyle: 2, priceScaleId: "right",
                lastValueVisible: false, priceLineVisible: false,
              });
              connectorSeries.setData([
                { time: entryTs as Time, value: sig.entry_price },
                { time: exitTs as Time, value: sig.entry_price + (sig.pnl_pips ?? 0) * 0.01 },
              ]);
              tradeConnectorSeriesRef.current.push(connectorSeries);
            }
          }
        }
      }

      // Sort markers by time (required by lightweight-charts)
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      if (markers.length > 0) {
        createSeriesMarkers(candleSeries, markers);
      }
    }

    // Initialize drawing manager
    await initDrawingManager(chart, candleSeries);

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

    chart.timeScale().fitContent();
    scheduleChartViewportSync(true);

    // ─── ResizeObserver for fullscreen / window resize ───
    const ro = new ResizeObserver(() => {
      scheduleChartViewportSync(true);
    });
    ro.observe(containerRef.current);
    resizeObserverRef.current = ro;

    startPricePolling();
  }, [selected, timeframe, scanResult, activeIndicators, chartSignals, loadCandles, startPricePolling, drawTradeLines, applyIndicators, initDrawingManager, saveDrawings, scheduleChartViewportSync]);

  /* rebuild chart on deps change (excluding chartType) */
  useEffect(() => {
    buildChart();
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (pricePollingRef.current) clearInterval(pricePollingRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  /* lightweight chart-type switch — just re-set data, no rebuild */
  useEffect(() => {
    if (chartTypeRef.current === chartType) return; // skip initial
    chartTypeRef.current = chartType;

    const raw = rawDataRef.current;
    if (!raw.length || !candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;

    const displayData = chartType === "Heiken Ashi" ? toHeikenAshi(raw) : raw;

    candleSeriesRef.current.setData(displayData.map(d => ({
      time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close,
    })));

    volumeSeriesRef.current.setData(displayData.map(d => ({
      time: d.time as Time, value: d.volume ?? 0,
      color: d.close >= d.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    })));

    scheduleChartViewportSync(true);
  }, [chartType, scheduleChartViewportSync]);

  useEffect(() => {
    scheduleChartViewportSync(true);
  }, [isFullscreen, scheduleChartViewportSync]);

  // Save drawings on unmount or symbol change
  useEffect(() => {
    return () => { saveDrawings(); };
  }, [selected, timeframe]);

  // Insert pattern insights into database
  useEffect(() => {
    if (!userId || detectedPatterns.length === 0) return;
    const namedPatterns = detectedPatterns.filter(p => p.pattern_name !== "Support" && p.pattern_name !== "Resistance");
    if (namedPatterns.length === 0) return;

    const top = namedPatterns[0];
    supabase.from("insights").insert({
      user_id: userId,
      insight_type: "pattern_detected",
      symbol: selected,
      title: `${top.pattern_name} — ${top.direction === "bullish" ? "Bullish" : "Bearish"}`,
      description: `RON detected ${top.pattern_name} pattern on ${selected}. Confidence: ${top.confidence}/10.${top.key_prices.target ? ` Target: ${top.key_prices.target.toFixed(2)}` : ""}`,
      severity: top.direction === "bullish" ? "positive" : "negative",
      data: { pattern: top.pattern_name, direction: top.direction, confidence: top.confidence, key_prices: top.key_prices },
    }).then(({ error }) => {
      if (error) console.error("Pattern insight insert error:", error);
    });
  }, [detectedPatterns, userId, selected]);

  // Persist pattern outcomes when a pattern gets an outcome
  useEffect(() => {
    if (!userId || patternHistory.length < 2) return;
    const prev = patternHistory[1];
    if (!prev.outcome || prev.pipMove === undefined) return;

    supabase.from("insights").insert({
      user_id: userId,
      insight_type: "pattern_outcome",
      symbol: selected,
      title: prev.pattern.pattern_name,
      description: `${prev.outcome === "confirmed" ? "✓ Confirmed" : "✗ Invalidated"} | Moved ${prev.pipMove.toFixed(1)} pips ${prev.pattern.direction === "bullish" ? "↑" : "↓"}`,
      severity: prev.outcome === "confirmed" ? "positive" : "negative",
      data: {
        pattern_name: prev.pattern.pattern_name,
        direction: prev.pattern.direction,
        entryPrice: prev.entryPrice,
        pipMove: prev.pipMove,
        confirmed: prev.outcome === "confirmed",
      },
    }).then(({ error }) => {
      if (error) console.error("Pattern outcome insert error:", error);
    });
  }, [patternHistory, userId, selected]);

  // Query user-specific pattern stats from insights
  useEffect(() => {
    if (!userId || patternHistory.length === 0) return;
    const currentName = patternHistory[0].pattern.pattern_name;

    supabase.from("insights")
      .select("data")
      .eq("user_id", userId)
      .eq("insight_type", "pattern_outcome")
      .eq("symbol", selected)
      .eq("title", currentName)
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setPatternUserStats(null);
          return;
        }
        const total = data.length;
        const confirmed = data.filter((r: any) => r.data?.confirmed === true).length;
        setPatternUserStats({ total, confirmed });
      });
  }, [patternHistory, userId, selected]);

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

  const activeCount = activeIndicators.filter(i => i.enabled).length;
  const drawingCount = drawingManagerRef.current?.getAllDrawings?.()?.length ?? savedDrawings.length;
  const priceDec = selected.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => selected.includes(s)) ? 2 : 5;

  const statusDot = connectionStatus === "live" ? "bg-green-400" : connectionStatus === "connecting" ? "bg-amber-400 animate-pulse" : connectionStatus === "demo" ? "bg-red-400" : "bg-gray-500";
  const statusText = connectionStatus === "live" ? "Live" : connectionStatus === "connecting" ? "Connecting..." : connectionStatus === "demo" ? "Demo" : "Offline";

  return (
    <div className={`flex flex-col w-full gap-2 ${isFullscreen ? "fixed inset-0 z-50 overflow-hidden bg-[#080B12] p-2" : "h-full p-2 sm:p-4"}`}>
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
            onClick={() => {
              setTimeframe(tf);
              instrumentTfRef.current.set(selected, tf);
              if (userId && selected) {
                supabase.from("user_instruments")
                  .update({ timeframe: tf })
                  .eq("user_id", userId)
                  .eq("symbol", selected)
                  .then(() => {});
              }
            }}
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
          className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider transition-all border border-[#EAB308]/50 text-white hover:border-[#EAB308] flex items-center gap-1.5 bg-emerald-800"
        >
          <span className="text-[#EAB308] text-[10px]">●</span>
          {brokerLabel || "BROKER"}
        </button>
        <button onClick={() => setShowIndicatorModal(true)} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1">
          <Search className="w-3 h-3" /> Indicators
          {activeCount > 0 && <span className="text-[9px] text-[#00CFA5] ml-0.5">({activeCount})</span>}
        </button>
        <button onClick={() => chartRef.current?.timeScale().fitContent()} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1">
          <ZoomIn className="w-3 h-3" /> Fit
        </button>
        <button
          onClick={() => window.open(`/chart-popout?type=falconer&symbol=${selected}`, "_blank", "noopener")}
          className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> Pop Out ↗
        </button>
        <button onClick={() => setIsFullscreen(f => !f)} className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#111724] border border-white/10 text-[#8892A4] hover:text-white transition-all ml-auto">
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* OHLCV overlay + countdown + indicator legend */}
      <div className="flex items-center justify-between text-[11px] px-1">
        <div className="flex items-center gap-3 font-mono bg-secondary">
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
          {/* Active indicator names */}
          {activeIndicators.filter(i => i.enabled).slice(0, 4).map(ind => (
            <span key={ind.id} className="text-[10px] text-[#00CFA5]/60">{ind.meta.shortName}</span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg bg-background text-destructive-foreground">Next close:</span>
          <span className="text-[#00CFA5] font-bold font-mono text-lg bg-background">{countdown}</span>
        </div>
      </div>

      {/* Chart container with drawing toolbar */}
      <div className={`relative flex gap-1 ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        {/* Drawing toolbar (left) */}
        <DrawingToolbar
          activeTool={activeDrawingTool}
          onSelectTool={handleSelectDrawingTool}
          onClearAll={handleClearDrawings}
          drawingCount={drawingCount}
        />

        {/* Chart */}
        <div className={`flex-1 relative ${isFullscreen ? "min-h-0" : ""}`}>
          <div
            ref={containerRef}
            className={`rounded-lg overflow-hidden border border-white/[0.06] ${isFullscreen ? "h-full min-h-0" : "min-h-[55vh]"}`}
            style={{ cursor: activeDrawingTool ? "crosshair" : undefined }}
          />
          {/* Interactive order lines overlay */}
          <ChartOrderLines
            visible={orderMode !== "market" || !!(limitPrices?.sl || limitPrices?.tp)}
            orderMode={orderMode}
            entry={orderMode !== "market" ? (limitPrices?.entry ?? null) : null}
            sl={limitPrices?.sl ?? null}
            tp={limitPrices?.tp ?? null}
            priceDec={priceDec}
            priceToY={(price) => {
              if (!candleSeriesRef.current) return null;
              const y = candleSeriesRef.current.priceToCoordinate(price);
              return y ?? null;
            }}
            yToPrice={(y) => {
              if (!candleSeriesRef.current) return null;
              const p = candleSeriesRef.current.coordinateToPrice(y);
              return p ?? null;
            }}
            onEntryDrag={(price) => tradePanelRef.current?.setLimitEntry(price.toFixed(priceDec))}
            onSLDrag={(price) => {
              if (orderMode === "market") tradePanelRef.current?.setMarketSL(price.toFixed(priceDec));
              else tradePanelRef.current?.setLimitSL(price.toFixed(priceDec));
            }}
            onTPDrag={(price) => {
              if (orderMode === "market") tradePanelRef.current?.setMarketTP(price.toFixed(priceDec));
              else tradePanelRef.current?.setLimitTP(price.toFixed(priceDec));
            }}
            onSLRemove={() => {
              if (orderMode === "market") tradePanelRef.current?.setMarketSL("");
              else tradePanelRef.current?.setLimitSL("");
            }}
            onTPRemove={() => {
              if (orderMode === "market") tradePanelRef.current?.setMarketTP("");
              else tradePanelRef.current?.setLimitTP("");
            }}
          />
          {/* Loading overlay */}
          {(connectionStatus === "connecting" || loadingMessage) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080B12]/80 rounded-lg z-10">
              <Loader2 className="w-8 h-8 text-[#00CFA5] animate-spin mb-3" />
              <span className="text-sm text-white/60">{loadingMessage || "Connecting to broker..."}</span>
            </div>
          )}
        </div>
      </div>

      {/* RON Pattern Detection Bar */}
      {!isFullscreen && (
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-[#111724]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-[#00CFA5] tracking-wider shrink-0">RON PATTERN</span>
            <div className="w-px h-4 bg-white/10" />
            {patternHistory.length > 0 ? (() => {
              const { pattern: top, detectedAt } = patternHistory[0];
              const targetPrice = top.key_prices.target;
              const dirHint = top.direction === "bullish"
                ? `⬆ Potential bullish move${targetPrice ? ` to ${targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}`
                : `⬇ Potential bearish move${targetPrice ? ` to ${targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}`;
              return (
                <span className="text-[11px] text-white/80">
                  <span className={`font-bold ${top.direction === "bullish" ? "text-green-400" : "text-red-400"}`}>{top.pattern_name}</span>
                  {" — "}
                  <span className={`font-semibold ${top.direction === "bullish" ? "text-green-400" : "text-red-400"}`}>{dirHint}</span>
                  <span className="text-white/60">{" | "}<span className="text-white font-bold">{top.confidence}/10</span></span>
                  <span className="text-white/60">{" | "}<span className="text-white font-bold">{detectedAt}</span></span>
                </span>
              );
            })() : (
              <span className="text-[11px] text-white/40 italic">RON scanning for patterns...</span>
            )}
            {detectedPatterns.filter(p => p.pattern_name === "Support" || p.pattern_name === "Resistance").length > 0 && (
              <span className="text-[10px] text-amber-400 font-medium">
                {detectedPatterns.filter(p => p.pattern_name === "Support" || p.pattern_name === "Resistance").length} S/R levels
              </span>
            )}
            <div className="w-px h-4 bg-white/10 ml-auto" />
            <button
              onClick={() => setShowPatternLabels(v => !v)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                showPatternLabels
                  ? "bg-[#00CFA5]/15 border-[#00CFA5]/40 text-[#00CFA5]"
                  : "bg-[#111724] border-white/10 text-white/40"
              }`}
            >
              {showPatternLabels ? "Labels ON" : "Labels OFF"}
            </button>
          </div>
          {/* Previous pattern with outcome */}
          {patternHistory.length > 1 && (() => {
            const prev = patternHistory[1];
            const prevDir = prev.pattern.direction === "bullish" ? "⬆ Bullish" : "⬇ Bearish";
            const outcomeLabel = prev.outcome === "confirmed"
              ? <span className="text-green-400/70 font-bold">✓ Confirmed</span>
              : prev.outcome === "invalidated"
              ? <span className="text-red-400/70 font-bold">✗ Invalidated</span>
              : null;
            const pipLabel = prev.pipMove !== undefined
              ? ` | Moved ${prev.pipMove.toFixed(1)} pips ${prev.pattern.direction === "bullish" ? "↑" : "↓"}`
              : "";
            return (
              <div className="text-[9px] text-white/50 pl-[90px]">
                Prev: <span className={`font-semibold ${prev.pattern.direction === "bullish" ? "text-green-400/60" : "text-red-400/60"}`}>{prev.pattern.pattern_name}</span>
                {" — "}{prevDir}{" "}{outcomeLabel}{pipLabel}{" | "}{prev.confidence ?? prev.pattern.confidence}/10{" | "}{prev.detectedAt}
              </div>
            );
          })()}
          {/* RON Stats line */}
          {patternHistory.length > 0 && (() => {
            const currentName = patternHistory[0].pattern.pattern_name;
            const stats = PATTERN_STATS[currentName];
            if (!stats) return null;
            return (
              <div className="text-[9px] text-[#00CFA5]/60 pl-[90px]">
                🧠 RON Stats: "{currentName}" hits target ~{stats.targetHitRate}% historically | Avg move: {stats.avgPipMove} pips | {stats.avgFrequency} on {selected}
                {patternUserStats && patternUserStats.total > 0 && (
                  <span className="text-[#00CFA5]/80 font-semibold">
                    {" | Your history: "}{patternUserStats.confirmed}/{patternUserStats.total} confirmed ({Math.round((patternUserStats.confirmed / patternUserStats.total) * 100)}%)
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Trade Execution Panel */}
      {!isFullscreen && (
        <TradeExecutionPanel
          ref={tradePanelRef}
          symbol={selected}
          accountId={accountIdRef.current}
          connectionStatus={connectionStatus}
          currentPrice={lastCandle?.close ?? null}
          onOrderModeChange={setOrderMode}
          onLimitPricesChange={setLimitPrices}
        />
      )}

      {/* RON Analysis Panel */}
      {!isFullscreen && scanResult && (() => {
        const fresh = signalFreshness(scanResult.scanned_at);
        const expired = fresh === "expired";
        const aging = fresh === "aging";
        return (
          <div className={`rounded-lg border border-white/[0.06] bg-[#111724] p-4 ${expired ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className={`w-4 h-4 ${expired ? "text-amber-400" : "text-[#00CFA5]"}`} />
              <span className={`text-xs font-bold tracking-wider ${expired ? "text-amber-400" : "text-[#00CFA5]"}`}>
                {expired ? `SIGNAL EXPIRED — last scan ${formatAge(scanResult.scanned_at)}` : `RON ANALYSIS — ${scanResult.symbol}`}
              </span>
              {aging && <span className="text-[10px] text-amber-400 font-semibold ml-2">⏰ Expiring soon</span>}
            </div>
            {!expired && (
              <>
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
              </>
            )}
            <p className="text-[10px] text-white/20 mt-2">Scanned: {new Date(scanResult.scanned_at).toLocaleString()}</p>
          </div>
        );
      })()}

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
      <IndicatorModal
        open={showIndicatorModal}
        onClose={() => setShowIndicatorModal(false)}
        active={activeIndicators}
        onToggle={handleIndicatorToggle}
        onRemove={handleIndicatorRemove}
      />

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

function getDefaultColor(index: number): string {
  const colors = [
    "#00CFA5", "#8B5CF6", "#F59E0B", "#EC4899", "#3B82F6",
    "#EF4444", "#10B981", "#6366F1", "#F97316", "#14B8A6",
  ];
  return colors[index % colors.length];
}
