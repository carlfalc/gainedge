import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BacktestResult {
  id: string; symbol: string; timeframe: string; candle_type: string;
  ema_fast: number; ema_slow: number; period_months: number;
  total_trades: number; win_rate: number; profit_factor: number;
  net_pnl: number; max_drawdown: number; avg_rr: number;
  sharpe_ratio: number | null; expectancy: number;
  equity_curve: number[] | null;
}

export default function BacktestingPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);
  const [instrument, setInstrument] = useState("NAS100");
  const [tf, setTf] = useState("15");
  const [candleType, setCandleType] = useState("heiken_ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [period, setPeriod] = useState("6");

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("backtest_results")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (data && data.length > 0) {
      setResults(data as BacktestResult[]);
      setSelectedResult(data[0] as BacktestResult);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setRunning(false); return; }

    // Generate mock backtest result
    const totalTrades = Math.floor(Math.random() * 100) + 60;
    const winRate = Math.floor(Math.random() * 25) + 55;
    const netPnl = Math.floor(Math.random() * 10000) + 2000;
    const equity: number[] = [0];
    for (let i = 1; i <= totalTrades; i++) {
      equity.push(equity[i - 1] + (Math.random() > 0.4 ? Math.floor(Math.random() * 200) : -Math.floor(Math.random() * 100)));
    }

    const result = {
      user_id: session.user.id,
      symbol: instrument,
      timeframe: tf,
      candle_type: candleType,
      ema_fast: parseInt(emaFast),
      ema_slow: parseInt(emaSlow),
      period_months: parseInt(period),
      total_trades: totalTrades,
      win_rate: winRate,
      profit_factor: parseFloat((1 + Math.random()).toFixed(2)),
      net_pnl: netPnl,
      max_drawdown: -Math.floor(Math.random() * 2000),
      avg_rr: parseFloat((1 + Math.random()).toFixed(1)),
      sharpe_ratio: parseFloat((1 + Math.random()).toFixed(2)),
      expectancy: parseFloat((netPnl / totalTrades).toFixed(1)),
      equity_curve: equity,
    };

    const { data } = await supabase.from("backtest_results").insert(result).select().single();
    if (data) {
      setSelectedResult(data as BacktestResult);
      setResults(prev => [data as BacktestResult, ...prev]);
      toast.success("Backtest complete");
    }
    setRunning(false);
  };

  const r = selectedResult;

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Backtesting</h1>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Configuration</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Field label="Instrument">
            <select value={instrument} onChange={e => setInstrument(e.target.value)} style={inputStyle}>
              {["NAS100", "US30", "AUDUSD", "NZDUSD", "XAUUSD"].map(i => <option key={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={tf} onChange={e => setTf(e.target.value)} style={inputStyle}>
              {["5", "15", "30", "60", "240"].map(t => <option key={t} value={t}>{t === "60" ? "1h" : t === "240" ? "4h" : t + "m"}</option>)}
            </select>
          </Field>
          <Field label="Candle Type">
            <select value={candleType} onChange={e => setCandleType(e.target.value)} style={inputStyle}>
              <option value="heiken_ashi">Heiken Ashi</option>
              <option value="standard">Standard</option>
              <option value="renko">Renko</option>
            </select>
          </Field>
          <Field label="EMA Fast">
            <input value={emaFast} onChange={e => setEmaFast(e.target.value)} style={inputStyle} type="number" />
          </Field>
          <Field label="EMA Slow">
            <input value={emaSlow} onChange={e => setEmaSlow(e.target.value)} style={inputStyle} type="number" />
          </Field>
          <Field label="Period (months)">
            <select value={period} onChange={e => setPeriod(e.target.value)} style={inputStyle}>
              {["1", "3", "6", "12", "24"].map(p => <option key={p} value={p}>{p}mo</option>)}
            </select>
          </Field>
        </div>
        <button onClick={handleRun} disabled={running} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 28px",
          borderRadius: 10, border: "none", cursor: running ? "wait" : "pointer",
          background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
          color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          marginTop: 16, opacity: running ? 0.7 : 1,
        }}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? "Running backtest..." : "Run Backtest"}
        </button>
      </div>

      {r && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatBox label="Total Trades" value={String(r.total_trades)} color={C.text} />
            <StatBox label="Win Rate" value={`${r.win_rate}%`} color={C.jade} />
            <StatBox label="Profit Factor" value={String(r.profit_factor)} color={C.blue} />
            <StatBox label="Net P&L" value={`$${r.net_pnl.toLocaleString()}`} color={C.green} />
            <StatBox label="Max Drawdown" value={`$${r.max_drawdown.toLocaleString()}`} color={C.red} />
            <StatBox label="Avg R:R" value={`${r.avg_rr}:1`} color={C.purple} />
            <StatBox label="Sharpe Ratio" value={String(r.sharpe_ratio ?? "—")} color={C.orange} />
            <StatBox label="Expectancy" value={`$${r.expectancy}`} color={C.jade} />
          </div>

          {r.equity_curve && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                Equity Curve — {r.symbol} {r.timeframe}m {r.candle_type === "heiken_ashi" ? "HA" : r.candle_type} EMA {r.ema_fast}/{r.ema_slow}
              </div>
              <Sparkline data={r.equity_curve as number[]} color={C.jade} w={900} h={160} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
};
