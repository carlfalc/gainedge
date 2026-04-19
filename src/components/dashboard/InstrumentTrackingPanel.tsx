import { useState, useEffect, useMemo } from "react";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Gauge } from "@/components/dashboard/Gauge";
import { C } from "@/lib/mock-data";
import { Clock, ArrowUp, ArrowDown, Circle, X, Eye, Move, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatAge, isDynamicallyExpired, nextScanSeconds, formatCountdown } from "@/lib/expiry";
import { useLiveMarketData } from "@/services/broker-data";

interface ScanResult {
  id: string;
  symbol: string;
  direction: string;
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  risk_reward: string | null;
  adx: number | null;
  rsi: number | null;
  macd_status: string | null;
  stoch_rsi: number | null;
  reasoning: string;
  ema_crossover_status: string;
  verdict: string;
  scanned_at: string;
}

interface InstrumentTrackingSnapshot {
  scans: ScanResult[];
  instrumentTfs: [string, string][];
  liveData: [string, any][];
  updatedAt: string;
}

interface InstrumentTrackingPanelProps {
  showPopOutButton?: boolean;
}

const SNAPSHOT_KEY = "instrument-tracking-snapshot";
const HIDDEN_PANES_KEY = "hidden-panes";
const CARD_ORDER_KEY = "card-order";

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

function generateSparkData(direction: string, confidence: number): number[] {
  const len = 20;
  const c = Math.max(1, Math.min(10, confidence));
  const slope = direction === "BUY" ? c * 0.3 : direction === "SELL" ? -c * 0.3 : 0;
  const noise = direction === "WAIT" || direction === "NO TRADE" ? 2.5 : 1.2;
  const seed = (i: number) => Math.sin(i * 13.7 + c * 3.1) * noise + Math.cos(i * 7.3) * noise * 0.5;
  let val = 50;
  return Array.from({ length: len }, (_, i) => {
    val += slope + seed(i);
    return val;
  });
}

function readSnapshot(): InstrumentTrackingSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function InstrumentTrackingPanel({ showPopOutButton = true }: InstrumentTrackingPanelProps) {
  const initialSnapshot = readSnapshot();
  const [scans, setScans] = useState<ScanResult[]>(() => initialSnapshot?.scans ?? []);
  const [instrumentTfs, setInstrumentTfs] = useState<Map<string, string>>(() => new Map(initialSnapshot?.instrumentTfs ?? []));
  const [fallbackLiveData, setFallbackLiveData] = useState<Map<string, any>>(() => new Map(initialSnapshot?.liveData ?? []));
  const [userId, setUserId] = useState<string>();
  const [, setTick] = useState(0);
  const [hiddenPanes, setHiddenPanes] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(HIDDEN_PANES_KEY);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(CARD_ORDER_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [trendFilter, setTrendFilter] = useState<"ALL" | "BULLISH" | "BEARISH" | "NEUTRAL">("ALL");
  const { data: liveData } = useLiveMarketData(userId);
  const mergedLiveData = useMemo(() => (liveData.size ? liveData : fallbackLiveData), [liveData, fallbackLiveData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === HIDDEN_PANES_KEY) {
        try {
          setHiddenPanes(e.newValue ? new Set(JSON.parse(e.newValue)) : new Set());
        } catch {
          // ignore malformed storage payloads
        }
      }

      if (e.key === CARD_ORDER_KEY) {
        try {
          setCardOrder(e.newValue ? JSON.parse(e.newValue) : []);
        } catch {
          // ignore malformed storage payloads
        }
      }

      if (e.key === SNAPSHOT_KEY) {
        try {
          const snapshot = e.newValue ? (JSON.parse(e.newValue) as InstrumentTrackingSnapshot) : null;
          if (!snapshot) return;
          setScans(snapshot.scans ?? []);
          setInstrumentTfs(new Map(snapshot.instrumentTfs ?? []));
          setFallbackLiveData(new Map(snapshot.liveData ?? []));
        } catch {
          // ignore malformed storage payloads
        }
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const uid = session.user.id;

    const [{ data: instData }, { data: scanData }] = await Promise.all([
      supabase.from("user_instruments").select("symbol, timeframe").eq("user_id", uid),
      supabase.from("scan_results").select("*").eq("user_id", uid).order("scanned_at", { ascending: false }),
    ]);

    if (instData) {
      const tfMap = new Map<string, string>();
      instData.forEach((i: any) => tfMap.set(i.symbol, i.timeframe || "15m"));
      setInstrumentTfs(tfMap);
    }

    if (scanData) {
      const latest = new Map<string, ScanResult>();
      scanData.forEach((s: any) => {
        if (!latest.has(s.symbol)) latest.set(s.symbol, s);
      });
      setScans(Array.from(latest.values()));
    }
  };

  useEffect(() => {
    loadData();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        loadData();
      }
    });

    const channel = supabase
      .channel(`instrument-tracking-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_results" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userId) loadData();
  }, [userId]);

  useEffect(() => {
    const snapshot: InstrumentTrackingSnapshot = {
      scans,
      instrumentTfs: Array.from(instrumentTfs.entries()),
      liveData: Array.from(mergedLiveData.entries()),
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage write failures
    }
  }, [scans, instrumentTfs, mergedLiveData]);

  const hidePane = (symbol: string) => {
    setHiddenPanes((prev) => {
      const next = new Set(prev);
      next.add(symbol);
      localStorage.setItem(HIDDEN_PANES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const showAllPanes = () => {
    setHiddenPanes(new Set());
    localStorage.removeItem(HIDDEN_PANES_KEY);
  };

  const trendOf = (s: ScanResult): "BULLISH" | "BEARISH" | "NEUTRAL" => {
    const liveMacd = liveData?.find((l) => l.symbol === s.symbol)?.macd_status;
    const macd = (liveMacd ?? s.macd_status ?? "").toString().toLowerCase();
    if (macd.includes("bull")) return "BULLISH";
    if (macd.includes("bear")) return "BEARISH";
    return "NEUTRAL";
  };

  const baseSorted = scans
    .filter((s) => !hiddenPanes.has(s.symbol))
    .sort((a, b) => {
      const ai = cardOrder.indexOf(a.symbol);
      const bi = cardOrder.indexOf(b.symbol);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const trendCounts = {
    BULLISH: baseSorted.filter((s) => trendOf(s) === "BULLISH").length,
    BEARISH: baseSorted.filter((s) => trendOf(s) === "BEARISH").length,
    NEUTRAL: baseSorted.filter((s) => trendOf(s) === "NEUTRAL").length,
  };

  const visibleScans = trendFilter === "ALL"
    ? baseSorted
    : baseSorted.filter((s) => trendOf(s) === trendFilter);


  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIndex(idx);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIdx) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const ordered = visibleScans.map((s) => s.symbol);
    const [moved] = ordered.splice(dragIndex, 1);
    ordered.splice(dropIdx, 0, moved);

    const allSymbols = [...ordered, ...scans.map((s) => s.symbol).filter((s) => !ordered.includes(s))];
    setCardOrder(allSymbols);
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(allSymbols));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            CURRENT INSTRUMENT TRACKING
          </span>
          <span style={{ color: C.sec, fontWeight: 400, fontSize: 10 }}>
            {visibleScans.length}/{scans.length} visible
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>
            {([
              { key: "ALL", label: "All", color: C.text, count: baseSorted.length },
              { key: "BULLISH", label: "Bullish", color: "#22C55E", count: trendCounts.BULLISH },
              { key: "BEARISH", label: "Bearish", color: "#EF4444", count: trendCounts.BEARISH },
              { key: "NEUTRAL", label: "Neutral", color: "#F59E0B", count: trendCounts.NEUTRAL },
            ] as const).map((tab) => {
              const active = trendFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setTrendFilter(tab.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: active ? tab.color + "22" : "transparent",
                    color: active ? tab.color : C.sec,
                    transition: "background 0.15s, color 0.15s",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                  title={`Show ${tab.label.toLowerCase()} instruments`}
                >
                  {tab.label}
                  <span style={{ fontSize: 9, opacity: 0.8, fontFamily: "'JetBrains Mono', monospace" }}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: C.text,
              background: "transparent",
              border: "none",
              cursor: "grab",
              fontWeight: 500,
              opacity: 0.7,
            }}
            title="Drag cards to reorder"
          >
            <Move size={13} color={C.text} /> Move
          </button>
          <button
            onClick={showAllPanes}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: C.jade,
              background: hiddenPanes.size > 0 ? C.jade + "15" : "transparent",
              border: hiddenPanes.size > 0 ? `1px solid ${C.jade}30` : "1px solid transparent",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
              fontWeight: 600,
              opacity: hiddenPanes.size > 0 ? 1 : 0.5,
            }}
          >
            <Eye size={12} /> Show All
          </button>
          {showPopOutButton && (
            <button
              onClick={() => window.open("/instruments-popout", "_blank", "width=1400,height=900")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                color: C.jade,
                background: "transparent",
                border: `1px solid ${C.jade}30`,
                borderRadius: 6,
                padding: "3px 10px",
                cursor: "pointer",
                fontWeight: 600,
              }}
              title="Pop this section out into a separate window — perfect for multi-monitor setups"
            >
              <ExternalLink size={12} /> Pop Out ↗
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 20 }}>
        {visibleScans.map((inst, idx) => {
          const tf = instrumentTfs.get(inst.symbol) || "15m";
          const expired = isDynamicallyExpired(inst.scanned_at, tf);
          const countdown = nextScanSeconds(tf);
          const live = mergedLiveData.get(inst.symbol);
          const sparkData = live?.sparkline_data?.length ? live.sparkline_data : generateSparkData(inst.direction, inst.confidence);
          const sparkColor = live?.price_direction === "up" ? "#22C55E" : live?.price_direction === "down" ? "#EF4444" : "#F59E0B";
          const color = expired ? "#555F73" : directionColor(inst.direction);
          const liveRsi = live?.rsi ?? inst.rsi;
          const liveAdx = live?.adx ?? inst.adx;
          const liveMacd = live?.macd_status ?? inst.macd_status;
          const liveStoch = live?.stoch_rsi ?? inst.stoch_rsi;
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
                borderRadius: 14,
                padding: 18,
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
                    {live && (
                      <span
                        style={{ width: 6, height: 6, borderRadius: "50%", background: live.market_open ? "#22C55E" : "#555F73", display: "inline-block" }}
                        title={live.market_open ? "Market open" : "Market closed"}
                      />
                    )}
                  </div>
                  {live?.last_price && (
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: live.price_direction === "up" ? C.green : live.price_direction === "down" ? C.red : C.text, marginTop: 2 }}>
                      ${live.last_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
                    <span>Last scan:</span>
                    <Clock size={10} />
                    <span>{formatAge(inst.scanned_at)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: expired ? C.muted + "20" : inst.direction === "BUY" ? C.green + "20" : inst.direction === "SELL" ? C.red + "20" : inst.direction === "WAIT" ? C.amber + "20" : C.muted + "20",
                        color: expired ? C.muted : inst.direction === "BUY" ? C.green : inst.direction === "SELL" ? C.red : inst.direction === "WAIT" ? C.amber : C.muted,
                      }}
                    >
                      {inst.direction}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        hidePane(inst.symbol);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 4,
                        opacity: 0.4,
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
                      title="Hide this card"
                    >
                      <X size={14} color={C.sec} />
                    </button>
                  </div>
                  <span style={{ fontSize: 9, color: countdown === -1 ? "#F59E0B" : C.sec, fontWeight: 500, display: "flex", alignItems: "center", gap: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                    <Clock size={9} /> {countdown === -1 ? "Market closed" : `Next scan: ${formatCountdown(countdown)}`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Gauge value={inst.confidence} color={color} size={44} />
                <Sparkline data={sparkData} color={live ? sparkColor : color} w={120} h={32} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: C.sec, marginBottom: 12 }}>
                <span>ADX <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{liveAdx ?? "—"}</span>{liveAdx != null && <span style={{ color: C.muted, fontSize: 10 }}> - {adxLabel(liveAdx)}</span>}</span>
                <span>RSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{liveRsi ?? "—"}</span>{liveRsi != null && <span style={{ color: C.muted, fontSize: 10 }}> - {rsiLabel(liveRsi)}</span>}</span>
                <span>MACD <span style={{ color: liveMacd === "Bullish" ? C.green : liveMacd === "Bearish" ? C.red : C.muted, fontWeight: 600 }}>{liveMacd ?? "—"}</span></span>
                <span>StochRSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{liveStoch ?? "—"}</span>{liveStoch != null && <span style={{ color: C.muted, fontSize: 10 }}> - {stochLabel(liveStoch)}</span>}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, opacity: expired ? 0.75 : 1 }}>
                <div><span style={{ color: C.sec }}>Entry:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.text, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.entry_price ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>TP:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.green, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.take_profit ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>SL:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.red, fontFamily: "'JetBrains Mono', monospace", textDecoration: expired ? "line-through" : "none" }}>{inst.stop_loss ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>R:R:</span> <span style={{ color: expired ? "rgba(255,255,255,0.5)" : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.risk_reward ?? "—"}</span></div>
              </div>

              <div style={{ fontSize: 11, color: expired ? "rgba(255,255,255,0.7)" : C.sec, lineHeight: 1.6, paddingTop: 10, borderTop: `1px solid ${C.border}`, opacity: expired ? 0.75 : 1 }}>
                {expired && (
                  <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600, marginBottom: 4 }}>
                    (Expired — {formatAge(inst.scanned_at)})
                  </div>
                )}
                <span style={{ color: expired ? "rgba(255,255,255,0.7)" : C.jade, fontWeight: 600 }}>RON: </span>{inst.reasoning || "No reasoning available."}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
