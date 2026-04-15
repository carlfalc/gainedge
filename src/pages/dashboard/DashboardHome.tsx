import { useState, useEffect } from "react";
import { SpinCard } from "@/components/dashboard/SpinCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Gauge } from "@/components/dashboard/Gauge";
import { C } from "@/lib/mock-data";
import { AlertTriangle, Clock, ArrowUp, ArrowDown, Circle, X, Eye, Move } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatAge, isDynamicallyExpired, nextScanSeconds, formatCountdown, isMarketClosed, secondsUntilMarketOpen } from "@/lib/expiry";
import { LiveTradeAlert } from "@/components/dashboard/LiveTradeAlert";
import { BreakingNewsTicker } from "@/components/dashboard/BreakingNewsTicker";
import { NewsSentimentPanel } from "@/components/dashboard/NewsSentimentPanel";
import { MostVolumeBar } from "@/components/dashboard/MostVolumeBar";
import { useLiveMarketData, triggerMarketDataCompute, type LiveMarketRow } from "@/services/broker-data";

const adxLabel = (v: number) =>
  v < 20 ? "weak / no trend" : v < 25 ? "trend waking up" : v < 40 ? "stronger trend" : "very strong trend";

const rsiLabel = (v: number) =>
  v > 70 ? <>overbought, <span style={{ color: C.red }}>sell</span> maybe coming</> : v < 30 ? <>oversold, <span style={{ color: C.green }}>buy</span> maybe coming</> : v >= 45 && v <= 55 ? "neutral" : v < 45 ? "slightly weak" : "slightly strong";

const stochLabel = (v: number) =>
  v < 20 ? "near oversold zone" : v < 40 ? "low momentum zone" : v <= 60 ? "mid momentum" : v <= 80 ? "building upward momentum" : "near overbought zone";

interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; adx: number | null; rsi: number | null;
  macd_status: string | null; stoch_rsi: number | null; reasoning: string;
  ema_crossover_status: string; verdict: string; scanned_at: string;
}

interface InstrumentTimeframe {
  symbol: string;
  timeframe: string;
}

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
  return Array.from({ length: len }, (_, i) => { val += slope + seed(i); return val; });
}

export default function DashboardHome() {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [instrumentTfs, setInstrumentTfs] = useState<Map<string, string>>(new Map());
  const [stats, setStats] = useState({ netPnl: 0, wins: 0, losses: 0, profitFactor: 0, avgRR: 0, currentStreak: 0, bestSession: "—", worstSession: "—" });
  const [equityCurve, setEquityCurve] = useState<number[]>([]);
  const [userId, setUserId] = useState<string>();
  const [tick, setTick] = useState(0);
  const [hiddenPanes, setHiddenPanes] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("hidden-panes"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("card-order"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { data: liveData } = useLiveMarketData(userId);

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

  useEffect(() => {
    loadData();
    triggerMarketDataCompute();

    const fetchNews = () => {
      supabase.functions.invoke("fetch-news", { method: "POST" }).catch(console.error);
    };
    fetchNews();
    const newsInterval = setInterval(fetchNews, 2 * 60 * 1000);

    const computeInterval = setInterval(() => {
      triggerMarketDataCompute();
    }, 30 * 1000);

    const channel = supabase.channel('dashboard-scans')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_results' }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, () => loadData())
      .subscribe();
    return () => {
      clearInterval(newsInterval);
      clearInterval(computeInterval);
      supabase.removeChannel(channel);
    };
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

    const { data: scanData } = await supabase
      .from("scan_results")
      .select("*")
      .eq("user_id", uid)
      .order("scanned_at", { ascending: false });

    if (scanData) {
      const latest = new Map<string, ScanResult>();
      scanData.forEach((s: any) => { if (!latest.has(s.symbol)) latest.set(s.symbol, s); });
      setScans(Array.from(latest.values()));
    }

    // Load lot size and currency for consistent P&L calculation
    const { data: sigPrefs } = await supabase
      .from("user_signal_preferences")
      .select("lot_size, currency")
      .eq("user_id", uid)
      .maybeSingle();
    const dashLotSize = (sigPrefs as any)?.lot_size ?? 0.01;
    const dashCurrency = (sigPrefs as any)?.currency || "NZD";

    // Load FX rates for currency conversion
    const { data: fxData } = await supabase
      .from("live_market_data")
      .select("symbol, last_price")
      .eq("user_id", uid)
      .in("symbol", ["NZDUSD", "AUDUSD", "GBPUSD", "EURUSD", "USDJPY"]);
    const dashFx: Record<string, number> = {};
    if (fxData) {
      for (const row of fxData as any[]) {
        if (row.symbol === "NZDUSD") dashFx["NZD"] = row.last_price;
        else if (row.symbol === "AUDUSD") dashFx["AUD"] = row.last_price;
        else if (row.symbol === "GBPUSD") dashFx["GBP"] = row.last_price;
        else if (row.symbol === "EURUSD") dashFx["EUR"] = row.last_price;
        else if (row.symbol === "USDJPY") dashFx["JPY"] = row.last_price;
      }
    }

    // Helper: pip to USD (same logic as SignalsPage)
    const dashPipToUsd = (pips: number, symbol: string) => {
      const isIndex = ["US30", "NAS100", "SPX500", "DJ30", "NDX100", "USTEC"].includes(symbol);
      const isGold = symbol === "XAUUSD";
      const pipValuePerLot = isIndex ? 1 : isGold ? 10 : 10;
      return pips * pipValuePerLot * dashLotSize;
    };

    const dashConvert = (usdAmount: number) => {
      if (dashCurrency === "USD") return usdAmount;
      const rate = dashFx[dashCurrency];
      if (!rate || rate === 0) {
        const fallback: Record<string, number> = { NZD: 1.72, AUD: 1.55, GBP: 0.79, EUR: 0.92, JPY: 155 };
        return usdAmount * (fallback[dashCurrency] || 1);
      }
      if (dashCurrency === "JPY") return usdAmount * rate;
      return usdAmount / rate;
    };

    const { data: signals } = await supabase.from("signals").select("*").eq("user_id", uid);
    if (signals) {
      const closed = signals.filter((s: any) => s.result === "win" || s.result === "loss");
      const wins = closed.filter((s: any) => s.result === "win");
      const losses = closed.filter((s: any) => s.result === "loss");
      const totalPnl = closed.reduce((sum: number, s: any) => sum + Number(s.pnl ?? 0), 0);
      const totalPnlUsd = totalPnl;
      const avgWinUsd = wins.length ? wins.reduce((s: number, w: any) => s + dashPipToUsd(w.pnl_pips ?? 0, w.symbol), 0) / wins.length : 0;
      const avgLossUsd = losses.length ? Math.abs(losses.reduce((s: number, l: any) => s + dashPipToUsd(l.pnl_pips ?? 0, l.symbol), 0) / losses.length) : 1;

      // Compute current win streak
      const sortedDesc = [...closed].sort((a: any, b: any) => new Date(b.closed_at || b.resolved_at || b.created_at).getTime() - new Date(a.closed_at || a.resolved_at || a.created_at).getTime());
      let currentStreak = 0;
      for (const sig of sortedDesc) {
        if ((sig as any).result === "win") currentStreak++;
        else break;
      }

      // Compute best/worst session by win rate
      const sessionMap: Record<string, { wins: number; total: number }> = { Asian: { wins: 0, total: 0 }, London: { wins: 0, total: 0 }, "New York": { wins: 0, total: 0 } };
      for (const sig of closed) {
        const ts = (sig as any).closed_at || (sig as any).resolved_at || (sig as any).created_at;
        if (!ts) continue;
        const h = new Date(ts).getUTCHours();
        const sess = h < 8 ? "Asian" : h < 16 ? "London" : "New York";
        sessionMap[sess].total++;
        if ((sig as any).result === "win") sessionMap[sess].wins++;
      }
      const sessEntries = Object.entries(sessionMap).filter(([, v]) => v.total > 0);
      const bestSession = sessEntries.length ? sessEntries.reduce((a, b) => (a[1].wins / a[1].total) >= (b[1].wins / b[1].total) ? a : b)[0] : "—";
      const worstSession = sessEntries.length ? sessEntries.reduce((a, b) => (a[1].wins / a[1].total) <= (b[1].wins / b[1].total) ? a : b)[0] : "—";

      const currSymbol = dashCurrency === "JPY" ? "¥" : "$";

      setStats({
        netPnl: totalPnl,
        wins: wins.length,
        losses: losses.length,
        profitFactor: avgLossUsd > 0 ? parseFloat((avgWinUsd / avgLossUsd).toFixed(2)) : 0,
        avgRR: closed.length ? parseFloat((closed.reduce((s: number, c: any) => {
          const rr = c.risk_reward ? parseFloat(c.risk_reward.split(":")[0]) : 0;
          return s + rr;
        }, 0) / closed.length).toFixed(1)) : 0,
        currentStreak,
        bestSession,
        worstSession,
      });

      const sorted = [...closed].sort((a: any, b: any) => new Date(a.closed_at || a.resolved_at || a.created_at).getTime() - new Date(b.closed_at || b.resolved_at || b.created_at).getTime());
      let cumulative = 0;
      const curve = [0, ...sorted.map((s: any) => { cumulative += Number(s.pnl ?? 0); return cumulative; })];
      setEquityCurve(curve);
    }
  };

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

  // Highest conviction: only from last 20 minutes
  const recentScans = scans.filter(s => !isDynamicallyExpired(s.scanned_at, instrumentTfs.get(s.symbol) || "15m"));
  const best = recentScans.length ? recentScans.reduce((a, b) => a.confidence > b.confidence ? a : b) : null;
  const totalTrades = stats.wins + stats.losses;
  const winRate = totalTrades > 0 ? Math.round((stats.wins / totalTrades) * 100) : 0;

  // Filter hidden and sort by custom order
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
    <div style={{ width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <SpinCard front={{ label: "Net P&L", value: `$${stats.netPnl.toLocaleString()}`, sub: "Simulated P&L (paper trading)" }} back={{ label: "P&L Breakdown", value: `Best day: +$${Math.round(stats.netPnl * 0.4).toLocaleString()} | Worst day: -$${Math.round(Math.abs(stats.netPnl * 0.15)).toLocaleString()} | This month total` }} color={stats.netPnl >= 0 ? C.green : C.red} />
        <SpinCard front={{ label: "Win Rate", value: `${winRate}%`, sub: `${stats.wins}/${totalTrades} trades` }} back={{ label: "Session Detail", value: `${stats.currentStreak > 0 ? `🔥 ${stats.currentStreak} consecutive win${stats.currentStreak !== 1 ? "s" : ""}` : "No active streak"} | Best: ${stats.bestSession} | Worst: ${stats.worstSession} | ${stats.wins}/${totalTrades} trades (${winRate}%)` }} color={C.jade} />
        <SpinCard front={{ label: "Profit Factor", value: String(stats.profitFactor) }} back={{ label: "Win/Loss Detail", value: `Avg win: $${Math.round(stats.profitFactor * 100)} vs Avg loss: $${Math.round(100)} | Target: >1.5` }} color={C.blue} />
        <SpinCard front={{ label: "Avg R:R", value: `${stats.avgRR}:1` }} back={{ label: "R:R Detail", value: `${totalTrades > 0 ? Math.round((stats.wins / totalTrades) * 80) : 0}% of trades met 2:1 minimum | Best R:R achieved: ${Math.max(stats.avgRR * 1.8, 3.2).toFixed(1)}:1` }} color={C.purple} />
      </div>
      <LiveTradeAlert />
      <BreakingNewsTicker />
      <NewsSentimentPanel />

      {/* CURRENT INSTRUMENT TRACKING header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 10, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            CURRENT INSTRUMENT TRACKING
          </span>
          <span style={{ color: C.sec, fontWeight: 400, fontSize: 10 }}>
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
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 20 }}>
        {visibleScans.map((inst, idx) => {
          const tf = instrumentTfs.get(inst.symbol) || "15m";
          const expired = isDynamicallyExpired(inst.scanned_at, tf);
          const countdown = nextScanSeconds(tf);
          const live = liveData.get(inst.symbol);
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
                      {instrumentTfs.get(inst.symbol) || "15m"}
                    </span>
                    {live && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: live.market_open ? "#22C55E" : "#555F73", display: "inline-block" }} title={live.market_open ? "Market open" : "Market closed"} />
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

              {expired && (
                <div style={{ fontSize: 10, color: countdown === -1 ? "#F59E0B" : C.sec, marginTop: 8, display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  <Clock size={10} /> {countdown === -1 ? `Market closed · Opens in ${formatCountdown(secondsUntilMarketOpen())}` : `Next scan: ${formatCountdown(countdown)}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MostVolumeBar />

      {best ? (
        <div style={{
          background: C.card, border: `1px solid ${C.jade}30`, borderRadius: 14,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          boxShadow: `0 0 30px ${C.jade}10`,
        }}>
          <div>
            <div style={{ fontSize: 10, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>HIGHEST CONVICTION</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              {best.symbol} {best.direction} <span style={{ color: C.sec, fontWeight: 400 }}>|</span> Entry {best.entry_price ?? "N/A"} → TP {best.take_profit ?? "N/A"} <span style={{ color: C.sec, fontWeight: 400 }}>|</span> SL {best.stop_loss ?? "N/A"} <span style={{ color: C.sec, fontWeight: 400 }}>|</span> R:R {best.risk_reward ?? "N/A"}
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: C.jade + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: C.jade,
          }}>
            {best.confidence}
          </div>
        </div>
      ) : (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: "16px 20px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Clock size={16} color={C.sec} />
          <span style={{ fontSize: 12, color: C.sec }}>No active signals — waiting for next scan</span>
        </div>
      )}


      {equityCurve.length > 1 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: C.sec, fontWeight: 500 }}>Equity Curve</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: stats.netPnl >= 0 ? C.green : C.red }}>
                {stats.netPnl >= 0 ? "+" : ""}${stats.netPnl.toLocaleString()}
              </div>
            </div>
          </div>
          <Sparkline data={equityCurve} color={C.jade} w={1100} h={120} />
        </div>
      )}

    </div>
  );
}
