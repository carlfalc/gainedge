/**
 * GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — GainEdge-owned educational preview of a
 * real RON pattern detection.
 *
 * Owned entirely by GainEdge: it renders OVER the TradingView area and never injects
 * into, reads from, or mutates the TradingView iframe. Closing it restores chart
 * interaction immediately.
 *
 * Truthfulness: candles come from the reconstructed quality-eligible detector window
 * (historical, completed, never past the snapshot anchor); geometry is drawn only from
 * fields the detector actually stored; teaching copy is a deterministic local glossary.
 * No numeric confidence, probability or buy/sell recommendation is shown.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Info } from "lucide-react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { NamedPatternDetection } from "@/lib/charts-context";
import {
  extractPatternGeometry,
  patternGlossary,
  EXACT_GEOMETRY_NOTE,
  PRICE_ONLY_GEOMETRY_NOTE,
  PREVIEW_EDUCATIONAL_NOTE,
  PREVIEW_WINDOW_NOTE,
  type PreviewCandle,
} from "@/lib/pattern-preview";
import { loadPatternPreviewWindow, type PatternWindowResult } from "@/services/pattern-preview-candles";

interface Props {
  symbol: string;
  timeframe: string;
  /** Snapshot anchor (bar_time) ISO — the last bar the detector saw. */
  barTime: string;
  detection: NamedPatternDetection;
  onClose: () => void;
}

/** Bars of context drawn either side of the detected span. */
export const PREVIEW_CONTEXT_MARGIN_BARS = 20;

const JADE = "#00CFA5";

const WINDOW_FAILURE_COPY: Record<PatternWindowResult["reason"], string> = {
  aligned: "",
  anchor_not_eligible:
    "The evaluated bar is not present as a quality-eligible candle in the stored history, so the detector window cannot be reproduced exactly.",
  anchor_not_last:
    "The evaluated bar is missing from stored candle history, so the detector window cannot be reproduced exactly.",
  insufficient_history:
    "Not enough stored quality-eligible candles to reproduce the full detector window, so index alignment cannot be guaranteed.",
};

export default function PatternPreviewModal({ symbol, timeframe, barTime, detection, onClose }: Props) {
  const [state, setState] = useState<PatternWindowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const geometry = useMemo(() => extractPatternGeometry(detection.source), [detection.source]);
  const glossary = useMemo(() => patternGlossary(geometry.name), [geometry.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPatternPreviewWindow(symbol, timeframe, barTime)
      .then((r) => { if (alive) { setState(r); setLoading(false); } })
      .catch((e) => {
        if (!alive) return;
        setState({
          candles: [], excluded: 0, aligned: false, reason: "anchor_not_eligible",
          quarantinedApplied: 0, qualityVersion: 5,
          error: e instanceof Error ? e.message : "Candle read failed",
        });
        setLoading(false);
      });
    return () => { alive = false; };
  }, [symbol, timeframe, barTime]);

  /** Visible slice: detected span plus a bounded margin, clipped to the real window. */
  const view: PreviewCandle[] = useMemo(() => {
    if (!state?.aligned || state.candles.length === 0) return [];
    const s = detection.startIndex ?? 0;
    const e = detection.endIndex ?? state.candles.length - 1;
    const from = Math.max(0, s - PREVIEW_CONTEXT_MARGIN_BARS);
    const to = Math.min(state.candles.length - 1, e + PREVIEW_CONTEXT_MARGIN_BARS);
    return state.candles.slice(from, to + 1);
  }, [state, detection.startIndex, detection.endIndex]);

  const spanBars = useMemo(() => {
    if (!state?.aligned) return [] as PreviewCandle[];
    const s = detection.startIndex, e = detection.endIndex;
    if (s == null || e == null) return [];
    return state.candles.slice(s, e + 1);
  }, [state, detection.startIndex, detection.endIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || view.length === 0) return;
    let chart: IChartApi | null = null;
    let series: ISeriesApi<"Candlestick"> | null = null;
    try {
      chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight || 320,
        layout: { background: { color: "transparent" }, textColor: "#8b949e", attributionLogo: false },
        grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
        timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
        handleScroll: false,
        handleScale: false,
      });
      series = chart.addSeries(CandlestickSeries, {
        upColor: JADE, borderUpColor: JADE, wickUpColor: JADE,
        downColor: "#EF4444", borderDownColor: "#EF4444", wickDownColor: "#EF4444",
      });
      series.setData(view.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })));

      // Detected span boundaries — real bar times only.
      const first = spanBars[0], last = spanBars[spanBars.length - 1];
      if (first && last) {
        createSeriesMarkers(series, [
          { time: (first.time / 1000) as UTCTimestamp, position: "belowBar", color: JADE, shape: "arrowUp", text: "RON span start" },
          { time: (last.time / 1000) as UTCTimestamp, position: "aboveBar", color: JADE, shape: "arrowDown", text: "span end" },
        ]);
      }

      // Price-only reference levels (no stored candle position).
      for (const lvl of geometry.levels.slice(0, 6)) {
        series.createPriceLine({
          price: lvl.price,
          color: "rgba(255,255,255,0.45)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: lvl.label,
        });
      }

      // Exactly-coordinated lines stored by the detector.
      for (const line of geometry.lines) {
        const ls = chart.addSeries(LineSeries, { color: JADE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        const pts = [
          { time: line.start.time as UTCTimestamp, value: line.start.price },
          { time: line.end.time as UTCTimestamp, value: line.end.price },
        ].sort((a, b) => (a.time as number) - (b.time as number));
        ls.setData(pts);
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;
    } catch {
      /* Preview chart is optional decoration; the textual context stays truthful. */
    }
    const onResize = () => { try { chart?.applyOptions({ width: el.clientWidth }); } catch { /* noop */ } };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      try { chart?.remove(); } catch { /* noop */ }
      chartRef.current = null;
    };
  }, [view, spanBars, geometry]);

  const failure = state && !state.aligned ? (state.error ?? WINDOW_FAILURE_COPY[state.reason]) : null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      data-testid="pattern-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label="RON Pattern Preview"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        data-testid="pattern-preview-backdrop"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl max-h-full overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">RON Pattern Preview</div>
            <div className="text-[15px] font-bold text-foreground" data-testid="pattern-preview-title">
              {symbol} · {geometry.name}{geometry.direction ? ` · ${geometry.direction}` : ""}
            </div>
            {detection.barsAgo != null && (
              <div className="mt-0.5 text-[11.5px] text-muted-foreground" data-testid="pattern-preview-recency">
                Detected {detection.barsAgo} completed {timeframe} bars ago
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-1 rounded text-[10.5px] font-semibold" style={{ background: `${JADE}1A`, color: JADE }}>
              Educational pattern preview
            </span>
            <button
              onClick={onClose}
              aria-label="Return to chart"
              data-testid="pattern-preview-close"
              className="p-1.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground" data-testid="pattern-preview-disclaimer">
            {PREVIEW_WINDOW_NOTE} {PREVIEW_EDUCATIONAL_NOTE}
          </p>

          {loading ? (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground" data-testid="pattern-preview-loading">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : failure ? (
            <div className="flex items-start gap-2 p-3 rounded border border-border bg-background/50" data-testid="pattern-preview-unavailable">
              <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{failure}</p>
            </div>
          ) : (
            <>
              <div ref={containerRef} className="h-[320px] w-full" data-testid="pattern-preview-chart" />
              <div className="text-[11px] text-muted-foreground" data-testid="pattern-preview-window-note">
                {view.length} completed {timeframe} candles shown, ending at the evaluated bar{" "}
                {new Date(barTime).toISOString().replace("T", " ").slice(0, 16)} UTC
                {state ? ` · ${state.excluded} quarantined bar${state.excluded === 1 ? "" : "s"} excluded (quality v${state.qualityVersion})` : ""}
              </div>
            </>
          )}

          <section data-testid="pattern-preview-geometry" className="border-t border-border pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Stored geometry</div>
            {geometry.lines.length === 0 && geometry.levels.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                The detector stored no price geometry for this detection — only the candle span is shown.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {geometry.lines.map((l) => (
                  <span key={l.label} className="px-2 py-1 rounded bg-background/60 border border-border text-[11.5px]">
                    <span className="text-muted-foreground">{l.label} </span>
                    <span className="font-mono text-foreground">exact coordinates</span>
                  </span>
                ))}
                {geometry.levels.map((l, i) => (
                  <span key={`${l.label}-${i}`} className="px-2 py-1 rounded bg-background/60 border border-border text-[11.5px]">
                    <span className="text-muted-foreground">{l.label} </span>
                    <span className="font-mono text-foreground">{l.price}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80" data-testid="pattern-preview-geometry-note">
              {geometry.hasExactGeometry ? EXACT_GEOMETRY_NOTE : ""}
              {geometry.hasExactGeometry && geometry.hasPriceOnlyPivots ? " " : ""}
              {geometry.hasPriceOnlyPivots ? PRICE_ONLY_GEOMETRY_NOTE : ""}
            </p>
          </section>

          {glossary && (
            <section data-testid="pattern-preview-glossary" className="border-t border-border pt-3 space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">What traders look for</div>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{glossary.what}</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{glossary.reading}</p>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">{glossary.measured}</p>
            </section>
          )}

          <div className="pt-1">
            <button
              onClick={onClose}
              data-testid="pattern-preview-return"
              className="px-3 py-1.5 rounded text-[12px] font-semibold border border-border text-foreground hover:bg-foreground/10 transition-colors"
            >
              Return to chart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
