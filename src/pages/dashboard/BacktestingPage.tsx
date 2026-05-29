import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("15m");
  const [start, setStart] = useState("2025-12-01");
  const [end, setEnd] = useState("2026-05-14");
  const [riskUsd, setRiskUsd] = useState(200);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("falconer_backtest_runs")
      .select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(20);
    setHistory(data ?? []);
  };
  useEffect(() => { loadHistory(); }, []);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("falconer-backtest", {
        body: { symbol, timeframe, period_start: start, period_end: end, risk_usd: riskUsd },
      });
      if (error) throw error;
      setResult(data);
      await loadHistory();
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Falconer v7 TP3 · Backtest</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16, maxWidth: 800 }}>
        <Field label="Symbol"><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} style={inp} /></Field>
        <Field label="Timeframe">
          <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inp}>
            <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option>
          </select>
        </Field>
        <Field label="Start"><input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} /></Field>
        <Field label="End"><input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} /></Field>
        <Field label="Risk USD"><input type="number" value={riskUsd} onChange={e => setRiskUsd(+e.target.value)} style={inp} /></Field>
      </div>
      <button onClick={run} disabled={running} style={{
        padding: "10px 20px", borderRadius: 8, border: "none", cursor: running ? "wait" : "pointer",
        background: C.jade, color: "#000", fontWeight: 700, fontSize: 13,
      }}>{running ? "Running…" : "Run Backtest"}</button>

      {result && (
        <pre style={{ marginTop: 24, padding: 16, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.text, overflowX: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
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
