import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface BacktestTrade {
  openedAt: number;
  trigger: string;
  entry: number;
  sl: number;
  tp3: number;
  exitReason: string;
  pnlUsd: number;
}

interface BacktestResult {
  error?: string;
  candle_count?: number;
  trades?: BacktestTrade[];
  equityCurve?: { t: number; equity: number }[];
  winRate?: number;
  netPnlUsd?: number;
  profitFactor?: number;
  maxDrawdownPct?: number;
}

type BacktestRun = {
  id: string;
  created_at: string;
  symbol: string;
  period_start: string;
  period_end: string;
  total_trades: number | null;
  win_rate: number | null;
  net_pnl_usd: number | null;
  max_drawdown_pct: number | null;
  status: string;
};

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("15m");
  const [start, setStart] = useState("2025-12-01");
  const [end, setEnd] = useState("2026-05-14");
  const [riskUsd, setRiskUsd] = useState(200);
  const [rrTp1, setRrTp1] = useState(1.5);
  const [rrTp2, setRrTp2] = useState(3);
  const [rrTp3, setRrTp3] = useState(5);
  const [beR, setBeR] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestRun[]>([]);

  const loadHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("falconer_backtest_runs")
      .select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20);
    setHistory((data as BacktestRun[]) ?? []);
  };
  useEffect(() => { loadHistory(); }, []);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("falconer-backtest", {
        body: {
          symbol,
          timeframe,
          period_start: new Date(`${start}T00:00:00Z`).toISOString(),
          period_end: new Date(`${end}T23:59:59Z`).toISOString(),
          config: { riskUsd, rrTp1, rrTp2, rrTp3, beR, pct1: 33, pct2: 33 },
        },
      });
      if (error) throw error;
      setResult(data);
      await loadHistory();
    } catch (error: unknown) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Falconer v7 TP3 · Backtest</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 16, maxWidth: 1050 }}>
        <Field label="Symbol"><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} style={inp} /></Field>
        <Field label="Timeframe">
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inp}>
            <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option>
          </select>
        </Field>
        <Field label="Start"><input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} /></Field>
        <Field label="End"><input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} /></Field>
        <Field label="Risk USD"><input type="number" value={riskUsd} onChange={e => setRiskUsd(+e.target.value)} style={inp} /></Field>
        <Field label="TP1 R"><input type="number" step="0.1" value={rrTp1} onChange={e => setRrTp1(+e.target.value)} style={inp} /></Field>
        <Field label="TP2 R"><input type="number" step="0.1" value={rrTp2} onChange={e => setRrTp2(+e.target.value)} style={inp} /></Field>
        <Field label="TP3 R"><input type="number" step="0.1" value={rrTp3} onChange={e => setRrTp3(+e.target.value)} style={inp} /></Field>
        <Field label="BE R"><input type="number" step="0.1" value={beR} onChange={e => setBeR(+e.target.value)} style={inp} /></Field>
      </div>
      <button onClick={run} disabled={running} style={{
        padding: "10px 20px", borderRadius: 8, border: "none", cursor: running ? "wait" : "pointer",
        background: C.jade, color: "#000", fontWeight: 700, fontSize: 13,
      }}>{running ? "Running…" : "Run Backtest"}</button>

      {result?.error && <div style={{ marginTop: 20, color: C.red }}>{result.error}</div>}
      {result && !result.error && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            <Kpi label="Trades" value={String(result.trades?.length ?? 0)} />
            <Kpi label="Win rate" value={`${Number(result.winRate ?? 0).toFixed(1)}%`} />
            <Kpi label="Net P&L" value={`$${Number(result.netPnlUsd ?? 0).toFixed(2)}`} />
            <Kpi label="Profit factor" value={Number(result.profitFactor ?? 0).toFixed(2)} />
            <Kpi label="Max drawdown" value={`${Number(result.maxDrawdownPct ?? 0).toFixed(2)}%`} />
            <Kpi label="Candles" value={String(result.candle_count ?? 0)} />
          </div>
          <div style={{ height: 280, padding: 12, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(result.equityCurve ?? []).map(point => ({
                time: new Date(point.t).toLocaleDateString(),
                equity: point.equity,
              }))}>
                <XAxis dataKey="time" hide />
                <YAxis domain={["auto", "auto"]} tick={{ fill: C.sec, fontSize: 10 }} width={65} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, fontSize: 11 }} />
                <Line type="monotone" dataKey="equity" stroke={C.jade} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflowX: "auto", marginTop: 14, maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", fontSize: 11 }}>
              <thead><tr><th style={th}>Opened</th><th style={th}>Trigger</th><th style={th}>Entry</th><th style={th}>Exit</th><th style={th}>Reason</th><th style={th}>P&L</th></tr></thead>
              <tbody>{(result.trades ?? []).map((trade, index) => (
                <tr key={`${trade.openedAt}-${index}`} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{new Date(trade.openedAt).toLocaleString()}</td><td style={td}>{trade.trigger}</td>
                  <td style={td}>{trade.entry}</td>
                  <td style={td}>{trade.exitReason === "tp3" ? trade.tp3 : trade.exitReason.includes("sl") ? trade.sl : "HA close"}</td>
                  <td style={td}>{trade.exitReason}</td>
                  <td style={{ ...td, color: Number(trade.pnlUsd) >= 0 ? C.jade : C.red }}>${Number(trade.pnlUsd).toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>Recent Runs</h2>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead style={{ background: C.bg2, color: C.sec }}>
            <tr>
              <th style={th}>Created</th><th style={th}>Symbol</th><th style={th}>Period</th>
              <th style={th}>Trades</th><th style={th}>Win Rate</th><th style={th}>Net P&L</th><th style={th}>Max DD %</th><th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map(r => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={td}>{r.symbol}</td>
                <td style={td}>{r.period_start?.slice(0,10)} → {r.period_end?.slice(0,10)}</td>
                <td style={td}>{r.total_trades}</td>
                <td style={td}>{Number(r.win_rate ?? 0).toFixed(1)}%</td>
                <td style={{ ...td, color: (r.net_pnl_usd ?? 0) >= 0 ? C.jade : C.red }}>${Number(r.net_pnl_usd ?? 0).toFixed(2)}</td>
                <td style={td}>{Number(r.max_drawdown_pct ?? 0).toFixed(2)}%</td>
                <td style={td}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, background: "#0F172A", border: "1px solid #1E293B", color: "#E2E8F0", fontSize: 12, width: "100%" };
const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11 };
const td: React.CSSProperties = { padding: "10px 12px", color: "#E2E8F0" };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 10, color: C.sec, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
    {children}
  </label>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 12, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
    <div style={{ color: C.sec, fontSize: 9, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
    <div style={{ color: C.text, fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
  </div>;
}
