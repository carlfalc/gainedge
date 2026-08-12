import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { C as CBase } from "@/lib/mock-data";
import { Clock, ArrowUp, ArrowDown, Circle, X, Eye, Move, ExternalLink, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatAge, isDynamicallyExpired, nextScanSeconds, formatCountdown, secondsUntilMarketOpen } from "@/lib/expiry";
import { formatPrintedLocal } from "@/lib/signal-time";
import { explainPatterns, summariseStructure, fmtLevel } from "@/lib/pattern-interpretation";
import { useLiveMarketData } from "@/services/broker-data";
import { useLiveQuotes, isQuoteFresh } from "@/services/live-quotes";
import {
  useRonSnapshots, useRonOutcomeStats, useRonDataQuality, useRonRebuildStatus,
  ronStateFrom, ronStateColor,
  CURRENT_RON_FEATURE_VERSION, CURRENT_RON_LABEL_VERSION, CURRENT_RON_QUALITY_VERSION,
} from "@/services/ron-snapshots";
import { assessDataHealth } from "@/lib/market-hours";
import { classifyRonSession } from "@/lib/ron-sessions";

const C = { ...CBase, text: "#FFFFFF", sec: "#FFFFFF" };
interface ScanResult {
  id: string; symbol: string;
  /** Falconer signal-history direction ("long"/"short"), or null when no signal exists. */
  direction: string | null;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; adx: number | null; rsi: number | null;
  macd_status: string | null; stoch_rsi: number | null; reasoning: string;
  ema_crossover_status: string; verdict: string;
  /** Genuine falconer_trades.opened_at, or null when the instrument has no signal history. */
  scanned_at: string | null;
}

const adxLabel = (v: number) =>
  v < 20 ? "weak / no trend" : v < 25 ? "trend waking up" : v < 40 ? "stronger trend" : "very strong trend";

const rsiLabel = (v: number) =>
  v > 70 ? <>overbought, <span style={{ color: C.red }}>sell</span> maybe coming</> : v < 30 ? <>oversold, <span style={{ color: C.green }}>buy</span> maybe coming</> : v >= 45 && v <= 55 ? "neutral" : v < 45 ? "slightly weak" : "slightly strong";

const stochLabel = (v: number) =>
  v < 20 ? "near oversold zone" : v < 40 ? "low momentum zone" : v <= 60 ? "mid momentum" : v <= 80 ? "building upward momentum" : "near overbought zone";

const directionColor = (dir: string) => {
  if (dir === "BUY") return "#22C55E";
  if (dir === "SELL") return "#EF4444";
  if (dir === "WAIT") return "#F59E0B";
  return "#555F73";
};

const num = (v: unknown, dp = 1): string =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(dp);

const macdLabel = (s: string | null | undefined) =>
  !s ? "—" : s.replace("_", " ");

interface InstrumentTrackingPanelProps {
  /** When true, renders the "Pop Out" button. Hide it on the popout page itself. */
  showPopOutButton?: boolean;
}

export default function InstrumentTrackingPanel({ showPopOutButton = true }: InstrumentTrackingPanelProps) {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [instrumentTfs, setInstrumentTfs] = useState<Map<string, string>>(new Map());
  const [userId, setUserId] = useState<string>();
  const [, setTick] = useState(0);
  const [hiddenPanes, setHiddenPanes] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("hidden-panes"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("card-order"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { data: liveData } = useLiveMarketData(userId);
  const { snapshots } = useRonSnapshots();
  const outcomeStats = useRonOutcomeStats();
  const dataQuality = useRonDataQuality();
  const rebuild = useRonRebuildStatus();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  // 1-second tick for live countdowns
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Cross-tab/window sync for hidden panes & card order (so popout window stays in sync with main dashboard)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hidden-panes") {
        try { setHiddenPanes(e.newValue ? new Set(JSON.parse(e.newValue)) : new Set()); } catch { /* ignore */ }
      }
      if (e.key === "card-order") {
        try { setCardOrder(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const { data: instData } = await supabase
      .from("user_instruments")
      .select("symbol, timeframe")
      .eq("user_id", uid);
    if (instData) {
      const tfMap = new Map<string, string>();
      instData.forEach((i: any) => tfMap.set(i.symbol, i.timeframe || "15m"));
      setInstrumentTfs(tfMap);
    }

    // scan_results was removed in the Falconer wipe. Build a card per tracked
    // instrument, overlaying the latest Falconer trade (if any) for direction/levels.
    const { data: tradeData } = await supabase
      .from("falconer_trades")
      .select("*")
      .eq("user_id", uid)
      .eq("mode", "live")
      .order("opened_at", { ascending: false });

    const latestTrade = new Map<string, any>();
    (tradeData || []).forEach((t: any) => {
      if (!latestTrade.has(t.symbol)) latestTrade.set(t.symbol, t);
    });

    const rows: ScanResult[] = [];
    (instData || []).forEach((i: any) => {
      const t = latestTrade.get(i.symbol);
      rows.push({
        id: t?.id ?? `placeholder-${i.symbol}`,
        symbol: i.symbol,
        direction: t?.direction ?? null,
        entry_price: t?.entry_price ?? null,
        take_profit: t?.tp3_price ?? null,
        stop_loss: t?.sl_price ?? null,
        risk_reward: t && t.entry_price != null && t.sl_price != null && t.tp3_price != null && t.entry_price !== t.sl_price
          ? `1:${(Math.abs(t.tp3_price - t.entry_price) / Math.abs(t.entry_price - t.sl_price)).toFixed(2)}`
          : null,
        adx: null, rsi: null, macd_status: null, stoch_rsi: null,
        reasoning: t ? `Falconer v7 ${t.trigger_type}` : "",
        ema_crossover_status: "",
        verdict: t?.status ?? "PENDING",
        // Truthfulness: never manufacture a scan time. No signal row ⇒ null.
        scanned_at: t?.opened_at ?? null,
      });
    });
    setScans(rows);
  };

  useEffect(() => {
    loadData();
    // Re-load whenever auth state changes (critical for popout windows that may
    // initialise before the Supabase session is hydrated from localStorage).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        loadData();
      }
    });
    const channel = supabase.channel(`instrument-tracking-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'falconer_trades' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_instruments' }, () => loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, []);

  // Re-fetch when userId is established (covers slow session hydration in popout windows)
  useEffect(() => {
    if (userId) loadData();
  }, [userId]);

  const hidePane = (symbol: string) => {
    setHiddenPanes(prev => {
      const next = new Set(prev);
      next.add(symbol);
      localStorage.setItem("hidden-panes", JSON.stringify([...next]));
      return next;
    });
  };

  const showAllPanes = () => {
    setHiddenPanes(new Set());
    localStorage.removeItem("hidden-panes");
  };

  const visibleScans = scans
    .filter(s => !hiddenPanes.has(s.symbol))
    .sort((a, b) => {
      const ai = cardOrder.indexOf(a.symbol);
      const bi = cardOrder.indexOf(b.symbol);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  // Genuine broker quotes for the visible tiles only (single bounded poll loop).
  const { quotes: liveQuotes } = useLiveQuotes(visibleScans.map(s => s.symbol));

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };
  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIdx) { setDragIndex(null); setDragOverIndex(null); return; }
    const ordered = visibleScans.map(s => s.symbol);
    const [moved] = ordered.splice(dragIndex, 1);
    ordered.splice(dropIdx, 0, moved);
    const allSymbols = [...ordered, ...scans.map(s => s.symbol).filter(s => !ordered.includes(s))];
    setCardOrder(allSymbols);
    localStorage.setItem("card-order", JSON.stringify(allSymbols));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 10, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            CURRENT INSTRUMENT TRACKING
          </span>
          <span style={{ color: C.text, fontWeight: 400, fontSize: 10 }}>
            {visibleScans.length}/{scans.length} visible
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.text,
              background: "transparent", border: "none", cursor: "grab",
              fontWeight: 500, opacity: 0.7,
            }}
            title="Drag cards to reorder"
          >
            <Move size={13} color={C.text} /> Move
          </button>
          <button
            onClick={showAllPanes}
            style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.jade,
              background: hiddenPanes.size > 0 ? C.jade + "15" : "transparent",
              border: hiddenPanes.size > 0 ? `1px solid ${C.jade}30` : "1px solid transparent",
              borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600,
              opacity: hiddenPanes.size > 0 ? 1 : 0.5,
            }}
          >
            <Eye size={12} /> Show All
          </button>
          {showPopOutButton && (
            <button
              onClick={() => window.open("/instruments-popout", "_blank", "noopener,width=1400,height=900")}
              style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.jade,
                background: "transparent", border: `1px solid ${C.jade}30`,
                borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600,
              }}
              title="Pop this section out into a separate window — perfect for multi-monitor setups"
            >
              <ExternalLink size={12} /> Pop Out ↗
            </button>
          )}
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 20 }}>
        {visibleScans.map((inst, idx) => {
          const tf = instrumentTfs.get(inst.symbol) || "15m";
          const expired = isDynamicallyExpired(inst.scanned_at, tf);
          const countdown = nextScanSeconds(tf);
          const live = liveData.get(inst.symbol);
          const snap = snapshots.get(inst.symbol);
          const f = snap?.features ?? null;
          const ron = ronStateFrom(f);
          const health = assessDataHealth(snap?.bar_time ?? null, 15);
          // Canonical all-session context — a pure function of the completed bar's
          // instant, so it is reproducible server-side and never invented.
          const sess = snap ? classifyRonSession(snap.bar_time) : null;
          const sparkColor = live?.price_direction === "up" ? "#22C55E" : live?.price_direction === "down" ? "#EF4444" : "#F59E0B";
          const color = expired ? "#555F73" : directionColor(inst.direction);
          // Prefer the live feed only while it is actually fresh; otherwise fall back to the
          // RON snapshot so the indicator row can never contradict RON's own reasoning.
          const liveFresh = !!live && Date.now() - new Date(live.updated_at).getTime() < 10 * 60 * 1000;
          // Headline quote — genuine broker feed only. Never live_market_data, never a RON close.
          const quote = liveQuotes.get(inst.symbol);
          const quoteFresh = isQuoteFresh(quote);
          const quoteInstant = quote?.broker_time ?? quote?.fetched_at ?? null;
          const quoteSourceLabel = quote?.broker_time ? "broker quote time" : "server fetch time";
          // Truthfulness: only real AND fresh price paths are plotted. No synthetic sparkline,
          // and never a stale series presented as live.
          const sparkData = liveFresh && live?.sparkline_data?.length ? live.sparkline_data : null;
          const liveRsi = (liveFresh ? live?.rsi : null) ?? (f?.rsi14 ?? null);
          const liveAdx = (liveFresh ? live?.adx : null) ?? (f?.adx14 ?? null);
          const liveMacd = (liveFresh ? live?.macd_status : null) ?? (f?.macd_state ?? null);
          const liveStoch = (liveFresh ? live?.stoch_rsi : null) ?? (f?.stoch_rsi ?? null);
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;
          return (
            <div
              key={inst.symbol}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                background: C.card,
                border: `1px solid ${isDragOver ? C.jade : C.border}`,
                borderRadius: 14, padding: 18,
                opacity: dragIndex === idx ? 0.5 : expired ? 0.9 : 1,
                transition: "opacity 0.3s, border-color 0.2s",
                cursor: "grab",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {expired ? (
                      <Circle size={16} color="#555F73" fill="#555F73" />
                    ) : inst.direction === "BUY" ? (
                      <ArrowUp size={16} color="#22C55E" strokeWidth={3} />
                    ) : inst.direction === "SELL" ? (
                      <ArrowDown size={16} color="#EF4444" strokeWidth={3} />
                    ) : (
                      <Circle size={16} color="#555F73" fill="#555F73" />
                    )}
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{inst.symbol}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.jade, background: C.jade + "18", padding: "1px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {tf}
                    </span>
                    {quote && (
                      <span
                        style={{ width: 6, height: 6, borderRadius: "50%", background: quoteFresh ? "#22C55E" : "#555F73", display: "inline-block" }}
                        title={quoteFresh ? "Live broker quote streaming" : "No fresh broker quote"}
                      />
                    )}
                  </div>
                  {quote && quote.bid != null ? (
                    <div style={{ marginTop: 2 }}>
                      <div
                        style={{
                          fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                          color: !quoteFresh ? C.text : quote.direction === "up" ? C.green : quote.direction === "down" ? C.red : C.text,
                        }}
                        title={`${quote.symbol} → ${quote.broker_symbol ?? "—"} · bid ${quote.bid} / ask ${quote.ask ?? "—"} · ${quoteSourceLabel} ${quoteInstant}`}
                      >
                        {quote.bid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                      </div>
                      <div style={{ fontSize: 9, color: quoteFresh ? C.text : "#F59E0B", fontFamily: "'JetBrains Mono', monospace" }}>
                        {quoteFresh
                          ? `Live broker bid · ask ${quote.ask ?? "—"} · ${formatAge(quoteInstant!)}`
                          : `Market closed / feed idle · last quote ${formatAge(quoteInstant!)}`}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 2, fontStyle: "italic" }}>
                      No live price feed
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.text }}>
                    <span>Last scan:</span>
                    <Clock size={10} />
                    <span>{formatAge(inst.scanned_at)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                      background: expired ? C.muted + "20" : inst.direction === "BUY" ? C.green + "20" : inst.direction === "SELL" ? C.red + "20" : inst.direction === "WAIT" ? C.amber + "20" : C.muted + "20",
                      color: expired ? C.muted : inst.direction === "BUY" ? C.green : inst.direction === "SELL" ? C.red : inst.direction === "WAIT" ? C.amber : C.muted,
                    }}>
                      {inst.direction}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); hidePane(inst.symbol); }}
                      style={{
                        background: "transparent", border: "none", cursor: "pointer",
                        padding: 2, display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 4, opacity: 0.4, transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
                      title="Hide this card"
                    >
                      <X size={14} color={C.text} />
                    </button>
                  </div>
                  <span style={{ fontSize: 9, color: countdown === -1 ? "#F59E0B" : C.text, fontWeight: 500, display: "flex", alignItems: "center", gap: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                    <Clock size={9} /> {countdown === -1 ? "Market closed" : `Next scan: ${formatCountdown(countdown)}`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.text, letterSpacing: 1, textTransform: "uppercase" }}>RON state</div>
                  {(() => {
                    // Phase 2C.2: the headline is a statement about the CURRENT source bar
                    // only. Historical flag counts are detail, never the current verdict.
                    const quarantined = inst.symbol === "XAUUSD" && !!dataQuality?.currentSourceQuarantined;
                    return (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: quarantined ? "#F59E0B" : ron ? ronStateColor(ron.state) : C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                          {quarantined ? "NO TRADABLE SETUP" : ron ? ron.state : "DATA BUILDING"}
                        </div>
                        {inst.symbol === "XAUUSD" && dataQuality && (
                         <div style={{ fontSize: 9, marginTop: 2, color: quarantined ? "#F59E0B" : C.text }}
                              title={`Deterministic source-data quality v${CURRENT_RON_QUALITY_VERSION} for source anchor ${dataQuality.currentBar ?? "unavailable"}. Historical detail: ${dataQuality.critical} critical, ${dataQuality.warning} warning flags across all stored history. Raw candle history is never modified.`}>
                            Current source: {!dataQuality.currentBar ? "Unavailable" : quarantined ? "Quarantined" : "Healthy"}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div style={{ fontSize: 9, color: C.text, marginTop: 2 }}>
                    Probability: {ron ? "Not calibrated yet · building evidence" : "Not calibrated yet"}
                  </div>
                  <div style={{
                    fontSize: 9, marginTop: 2, fontWeight: 600,
                    color: health.label === "LIVE" ? C.jade
                      : health.label === "STALE / FEED BEHIND" ? "#EF4444"
                        : "#F59E0B",
                  }} title={health.detail}>
                    {health.label}{snap ? ` · ${formatAge(snap.bar_time)}` : ""}
                  </div>
                  {snap && (
                    <div style={{ fontSize: 9, color: snap.data_health === "healthy" ? C.text : "#F59E0B" }}>
                      {snap.timeframe} bar {new Date(snap.bar_time).toISOString().slice(5, 16).replace("T", " ")}Z
                      {snap.data_health !== "healthy" ? ` · ${snap.data_health}` : ""}
                    </div>
                  )}
                </div>
                {sparkData ? (
                  <Sparkline data={sparkData} color={sparkColor} w={120} h={32} />
                ) : (
                  <span style={{ fontSize: 9, color: C.text, fontStyle: "italic" }} title="No genuine intraday series available; nothing is synthesised.">
                    No sparkline series
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: C.text, marginBottom: 12 }}>
                <span>ADX <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{num(liveAdx)}</span>{liveAdx != null && <span style={{ color: C.text, fontSize: 10 }}> - {adxLabel(Number(liveAdx))}</span>}</span>
                <span>RSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{num(liveRsi)}</span>{liveRsi != null && <span style={{ color: C.text, fontSize: 10 }}> - {rsiLabel(Number(liveRsi))}</span>}</span>
                <span>MACD <span style={{ color: String(liveMacd).startsWith("bullish") || liveMacd === "Bullish" ? C.green : String(liveMacd).startsWith("bearish") || liveMacd === "Bearish" ? C.red : C.text, fontWeight: 600 }}>{macdLabel(liveMacd)}</span></span>
                <span>StochRSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{num(liveStoch)}</span>{liveStoch != null && <span style={{ color: C.text, fontSize: 10 }}> - {stochLabel(Number(liveStoch))}</span>}</span>
              </div>

              {snap && f ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: C.text, marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span>Completed {snap.timeframe} close <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{snap.close}</span></span>
                  <span>ATR% <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{num(f.atr_pct, 3)}</span></span>
                  <span>Regime <span style={{ color: C.text }}>{String(f.regime ?? "—").replace("_", " ")}</span></span>
                  <span>
                    Context <span style={{ color: sess?.overlap ? C.jade : C.text, fontWeight: sess?.overlap ? 700 : 400 }}>
                      {sess ? sess.label : "—"}
                    </span>
                  </span>
                  <span style={{ gridColumn: "1 / -1", color: C.text, fontSize: 10 }}>
                    {sess
                      ? `${sess.active.length ? sess.active.join(" + ") : "no cash session"}` +
                        `${sess.minutes_into_session != null ? ` · ${sess.minutes_into_session}m in` : ""}` +
                        `${sess.in_asian_range_window ? " · inside Asian range window 22:00-06:00Z" : ""}`
                      : ""}
                  </span>
                  <span style={{ gridColumn: "1 / -1" }}>
                    Patterns <span style={{ color: C.text }}>
                      {snap.patterns?.length
                        ? snap.patterns
                            .slice(0, 3)
                            .map((p: any) =>
                              [p?.pattern_name, p?.direction].filter(Boolean).join(" ") || "unnamed",
                            )
                            .join(", ")
                        : "No pattern detected"}
                    </span>
                  </span>
                  <span style={{ gridColumn: "1 / -1", color: C.text, fontSize: 10 }}>
                    Completed bar close — not a live tick quote.
                  </span>
                  <span style={{ gridColumn: "1 / -1", color: C.text, fontSize: 10 }}>
                    {rebuild && !rebuild.complete
                      ? `Historical evidence: rebuilding (clean lineage quality v${CURRENT_RON_QUALITY_VERSION} · feature v${CURRENT_RON_FEATURE_VERSION} · label v${CURRENT_RON_LABEL_VERSION}). Nothing on this dashboard is derived from it.`
                      : `Outcome labels (research only, label v${CURRENT_RON_LABEL_VERSION}, feature v${CURRENT_RON_FEATURE_VERSION}, XAUUSD 15m): ${outcomeStats
                        ? `${outcomeStats.labelled.toLocaleString()} labelled, ${outcomeStats.excluded.toLocaleString()} excluded (venue-closed minutes and/or missing 1m candles). Nothing shown on this dashboard is derived from them.`
                        : "loading"}`}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#F59E0B", marginBottom: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  DATA BUILDING — no RON snapshot for {inst.symbol} yet. Indicators unavailable; this is not a current assessment.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, opacity: expired ? 0.75 : 1 }}>
                <div><span style={{ color: C.text }}>Entry:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.text, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.entry_price ?? "—"}</span></div>
                <div><span style={{ color: C.text }}>TP:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.green, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.take_profit ?? "—"}</span></div>
                <div><span style={{ color: C.text }}>SL:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.red, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.stop_loss ?? "—"}</span></div>
                <div><span style={{ color: C.text }}>R:R:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.risk_reward ?? "—"}</span></div>
              </div>

              <div style={{ fontSize: 11, color: expired ? "rgba(255,255,255,0.7)" : C.text, lineHeight: 1.6, paddingTop: 10, borderTop: `1px solid ${C.border}`, opacity: expired ? 0.75 : 1 }}>
                {expired && (
                  <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600, marginBottom: 4 }}>
                    (Expired — {formatAge(inst.scanned_at)})
                  </div>
                )}
                <span style={{ color: expired ? "rgba(255,255,255,0.7)" : C.jade, fontWeight: 600 }}>RON: </span>
                {ron ? (
                  <>
                    {ron.why}
                    <div style={{ marginTop: 4, color: C.text }}>What would change it: {ron.next}</div>
                    {inst.reasoning && <div style={{ marginTop: 4 }}>{inst.reasoning}</div>}
                  </>
                ) : (
                  inst.reasoning || "DATA BUILDING — RON has not computed a snapshot for this instrument yet."
                )}
              </div>

              {expired && (
                <div style={{ fontSize: 10, color: countdown === -1 ? "#F59E0B" : C.text, marginTop: 8, display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  <Clock size={10} /> {countdown === -1 ? `Market closed · Opens in ${formatCountdown(secondsUntilMarketOpen())}` : `Next scan: ${formatCountdown(countdown)}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
