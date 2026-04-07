import { useState, useEffect } from "react";
import { SpinCard } from "@/components/dashboard/SpinCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Gauge } from "@/components/dashboard/Gauge";
import { C } from "@/lib/mock-data";
import { AlertTriangle, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LiveTradeAlert } from "@/components/dashboard/LiveTradeAlert";
import { BreakingNewsTicker } from "@/components/dashboard/BreakingNewsTicker";

interface ScanResult {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null; adx: number | null; rsi: number | null;
  macd_status: string | null; stoch_rsi: number | null; reasoning: string;
  ema_crossover_status: string; verdict: string;
}

const colorMap: Record<string, string> = { NAS100: C.green, US30: C.blue, AUDUSD: C.amber, NZDUSD: C.cyan, XAUUSD: C.orange };
const sparkMap: Record<string, number[]> = {
  NAS100: [20,22,21,25,28,27,30,32,35,34,38], US30: [40,42,41,43,44,43,46,45,47,46,48],
  AUDUSD: [68,69,68,69,69,68,69,69,70,69,69], NZDUSD: [56,57,56,57,57,56,57,57,57,57,57],
  XAUUSD: [46,47,46,45,46,47,46,45,46,47,46],
};

export default function DashboardHome() {
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState({ netPnl: 0, wins: 0, losses: 0, profitFactor: 0, avgRR: 0 });
  const [equityCurve, setEquityCurve] = useState<number[]>([]);

  useEffect(() => {
    loadData();
    const channel = supabase.channel('dashboard-scans')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_results' }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

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

    const { data: signals } = await supabase.from("signals").select("*").eq("user_id", uid);
    if (signals) {
      const closed = signals.filter((s: any) => s.result !== "pending");
      const wins = closed.filter((s: any) => s.result === "win");
      const losses = closed.filter((s: any) => s.result === "loss");
      const totalPnl = closed.reduce((sum: number, s: any) => sum + (s.pnl || 0), 0);
      const avgWin = wins.length ? wins.reduce((s: number, w: any) => s + (w.pnl || 0), 0) / wins.length : 0;
      const avgLoss = losses.length ? Math.abs(losses.reduce((s: number, l: any) => s + (l.pnl || 0), 0) / losses.length) : 1;

      setStats({
        netPnl: totalPnl,
        wins: wins.length,
        losses: losses.length,
        profitFactor: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0,
        avgRR: closed.length ? parseFloat((closed.reduce((s: number, c: any) => {
          const rr = c.risk_reward ? parseFloat(c.risk_reward.split(":")[0]) : 0;
          return s + rr;
        }, 0) / closed.length).toFixed(1)) : 0,
      });

      const sorted = [...closed].sort((a: any, b: any) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());
      let cumulative = 0;
      const curve = [0, ...sorted.map((s: any) => { cumulative += (s.pnl || 0); return cumulative; })];
      setEquityCurve(curve);
    }
  };

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); loadData(); }, 3000);
  };

  const best = scans.length ? scans.reduce((a, b) => a.confidence > b.confidence ? a : b) : null;
  const totalTrades = stats.wins + stats.losses;
  const winRate = totalTrades > 0 ? Math.round((stats.wins / totalTrades) * 100) : 0;

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <SpinCard front={{ label: "Net P&L", value: `$${stats.netPnl.toLocaleString()}`, sub: stats.netPnl >= 0 ? "▲ Profitable" : "▼ Drawdown" }} back={{ label: "Detail", value: `${stats.wins} wins, ${stats.losses} losses` }} color={stats.netPnl >= 0 ? C.green : C.red} delay={0} />
        <SpinCard front={{ label: "Win Rate", value: `${winRate}%`, sub: `${stats.wins}/${totalTrades} trades` }} back={{ label: "Detail", value: "Based on closed signals" }} color={C.jade} delay={500} />
        <SpinCard front={{ label: "Profit Factor", value: String(stats.profitFactor) }} back={{ label: "Detail", value: "Avg win / avg loss ratio" }} color={C.blue} delay={1000} />
        <SpinCard front={{ label: "Avg R:R", value: `${stats.avgRR}:1` }} back={{ label: "Detail", value: "Average risk-reward" }} color={C.purple} delay={1500} />
      </div>

      {best && (
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
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 20 }}>
        {scans.map(inst => {
          const color = colorMap[inst.symbol] || C.jade;
          return (
            <div key={inst.symbol} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{inst.symbol}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>15m Heiken Ashi</div>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: inst.direction === "BUY" ? C.green + "20" : inst.direction === "SELL" ? C.red + "20" : inst.direction === "WAIT" ? C.amber + "20" : C.muted + "20",
                  color: inst.direction === "BUY" ? C.green : inst.direction === "SELL" ? C.red : inst.direction === "WAIT" ? C.amber : C.muted,
                }}>
                  {inst.direction}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Gauge value={inst.confidence} color={color} size={44} />
                <Sparkline data={sparkMap[inst.symbol] || [1,2,3]} color={color} w={120} h={32} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: C.sec, marginBottom: 12 }}>
                <span>ADX <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.adx ?? "—"}</span></span>
                <span>RSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.rsi ?? "—"}</span></span>
                <span>MACD <span style={{ color: inst.macd_status === "Bullish" ? C.green : inst.macd_status === "Bearish" ? C.red : C.muted, fontWeight: 600 }}>{inst.macd_status ?? "—"}</span></span>
                <span>StochRSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.stoch_rsi ?? "—"}</span></span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div><span style={{ color: C.sec }}>Entry:</span> <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.entry_price ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>TP:</span> <span style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace" }}>{inst.take_profit ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>SL:</span> <span style={{ color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>{inst.stop_loss ?? "—"}</span></div>
                <div><span style={{ color: C.sec }}>R:R:</span> <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.risk_reward ?? "—"}</span></div>
              </div>

              <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.6, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.jade, fontWeight: 600 }}>AI Reasoning: </span>{inst.reasoning || "No reasoning available."}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        background: C.amber + "10", border: `1px solid ${C.amber}30`, borderRadius: 12,
        padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
      }}>
        <AlertTriangle size={16} color={C.amber} />
        <span style={{ fontSize: 12, color: C.amber }}>
          NAS100 + US30 correlated — pick one. &nbsp; AUDUSD + NZDUSD correlated — pick one.
        </span>
      </div>

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

      <button onClick={handleScan} disabled={scanning} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "14px 32px",
        borderRadius: 12, border: "none", cursor: scanning ? "wait" : "pointer",
        background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
        color: C.bg, fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
        boxShadow: `0 4px 20px ${C.jade}30`,
        opacity: scanning ? 0.7 : 1, transition: "all 0.2s",
      }}>
        {scanning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
        {scanning ? "Scanning..." : "Run Scan"}
      </button>
    </div>
  );
}