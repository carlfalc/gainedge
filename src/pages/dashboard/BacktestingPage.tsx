import { useState } from "react";
import { C } from "@/lib/mock-data";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Play, Loader2 } from "lucide-react";

const mockResults = {
  totalTrades: 142,
  winRate: 68,
  profitFactor: 1.92,
  netPnl: 8420,
  maxDrawdown: -1240,
  avgRR: "1.7:1",
  sharpe: 1.84,
  expectancy: 59.3,
  equity: [0, 200, 150, 400, 600, 550, 800, 1100, 950, 1200, 1500, 1400, 1800, 2100, 2000, 2400, 2800, 2700, 3200, 3600, 3500, 4000, 4400, 4200, 4800, 5200, 5600, 5400, 6000, 6400, 6200, 6800, 7200, 7000, 7600, 8000, 7800, 8420],
};

export default function BacktestingPage() {
  const [running, setRunning] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [instrument, setInstrument] = useState("NAS100");
  const [tf, setTf] = useState("15m");
  const [candleType, setCandleType] = useState("heiken-ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [period, setPeriod] = useState("6m");

  const handleRun = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setShowResults(true); }, 2500);
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Backtesting</h1>

      {/* Config */}
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
              {["5m", "15m", "30m", "1h", "4h"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Candle Type">
            <select value={candleType} onChange={e => setCandleType(e.target.value)} style={inputStyle}>
              <option value="heiken-ashi">Heiken Ashi</option>
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
          <Field label="Period">
            <select value={period} onChange={e => setPeriod(e.target.value)} style={inputStyle}>
              {["1m", "3m", "6m", "1y", "2y"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 28px",
            borderRadius: 10, border: "none", cursor: running ? "wait" : "pointer",
            background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
            color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            marginTop: 16, opacity: running ? 0.7 : 1,
          }}
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? "Running backtest..." : "Run Backtest"}
        </button>
      </div>

      {/* Results */}
      {showResults && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatBox label="Total Trades" value={String(mockResults.totalTrades)} color={C.text} />
            <StatBox label="Win Rate" value={`${mockResults.winRate}%`} color={C.jade} />
            <StatBox label="Profit Factor" value={String(mockResults.profitFactor)} color={C.blue} />
            <StatBox label="Net P&L" value={`$${mockResults.netPnl.toLocaleString()}`} color={C.green} />
            <StatBox label="Max Drawdown" value={`$${mockResults.maxDrawdown.toLocaleString()}`} color={C.red} />
            <StatBox label="Avg R:R" value={mockResults.avgRR} color={C.purple} />
            <StatBox label="Sharpe Ratio" value={String(mockResults.sharpe)} color={C.orange} />
            <StatBox label="Expectancy" value={`$${mockResults.expectancy}`} color={C.jade} />
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Equity Curve — {instrument} {tf} {candleType === "heiken-ashi" ? "HA" : candleType} EMA {emaFast}/{emaSlow}</div>
            <Sparkline data={mockResults.equity} color={C.jade} w={900} h={160} />
          </div>
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
