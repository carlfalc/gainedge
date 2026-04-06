import { useState } from "react";
import { SpinCard } from "@/components/dashboard/SpinCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Gauge } from "@/components/dashboard/Gauge";
import { C, INSTRUMENTS, EQUITY_CURVE } from "@/lib/mock-data";
import { AlertTriangle, Play, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export default function DashboardHome() {
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 3000);
  };

  const best = INSTRUMENTS[0];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <SpinCard front={{ label: "Net P&L", value: "$5,160", sub: "▲ 12.4%" }} back={{ label: "Detail", value: "21 wins, 9 losses. Best day: +$680" }} color={C.green} delay={0} />
        <SpinCard front={{ label: "Win Rate", value: "70%", sub: "21/30 trades" }} back={{ label: "Detail", value: "Best: London overlap. Worst: Asian on indices" }} color={C.jade} delay={500} />
        <SpinCard front={{ label: "Profit Factor", value: "2.14" }} back={{ label: "Detail", value: "Avg win $245 vs avg loss $114" }} color={C.blue} delay={1000} />
        <SpinCard front={{ label: "Avg R:R", value: "1.8:1" }} back={{ label: "Detail", value: "85% of trades met 2:1 minimum criteria" }} color={C.purple} delay={1500} />
      </div>

      {/* Best Signal Banner */}
      <div style={{
        background: C.card, border: `1px solid ${C.jade}30`, borderRadius: 14,
        padding: "16px 20px", marginBottom: 20,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: `0 0 30px ${C.jade}10`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>HIGHEST CONVICTION</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {best.symbol} {best.direction} <span style={{ color: C.sec, fontWeight: 400 }}>|</span> Entry {best.entry} → TP {best.tp} <span style={{ color: C.sec, fontWeight: 400 }}>|</span> R:R {best.rr}
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

      {/* Instrument Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210, 1fr))", gap: 12, marginBottom: 20 }}>
        {INSTRUMENTS.map(inst => (
          <div
            key={inst.symbol}
            style={{
              background: C.card, border: `1px solid ${expanded === inst.symbol ? C.jade + "40" : C.border}`,
              borderRadius: 14, padding: 16, cursor: "pointer",
              transition: "all 0.3s",
            }}
            onClick={() => setExpanded(expanded === inst.symbol ? null : inst.symbol)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{inst.symbol}</div>
                <div style={{ fontSize: 10, color: C.muted }}>15m HA</div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                background: inst.direction === "BUY" ? C.green + "20" : inst.direction === "WAIT" ? C.amber + "20" : C.muted + "20",
                color: inst.direction === "BUY" ? C.green : inst.direction === "WAIT" ? C.amber : C.muted,
              }}>
                {inst.direction}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Gauge value={inst.confidence} color={inst.color} size={40} />
              <Sparkline data={inst.spark} color={inst.color} w={100} h={28} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10, color: C.sec }}>
              <span>ADX <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.adx}</span></span>
              <span>RSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.rsi}</span></span>
              <span>MACD <span style={{ color: inst.macd === "Bullish" ? C.green : inst.macd === "Bearish" ? C.red : C.muted, fontWeight: 600 }}>{inst.macd}</span></span>
              <span>StochRSI <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.stochRsi}</span></span>
            </div>

            {expanded === inst.symbol && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11, marginBottom: 8 }}>
                  <div><span style={{ color: C.sec }}>Entry:</span> <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.entry}</span></div>
                  <div><span style={{ color: C.sec }}>TP:</span> <span style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace" }}>{inst.tp}</span></div>
                  <div><span style={{ color: C.sec }}>SL:</span> <span style={{ color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>{inst.sl}</span></div>
                  <div><span style={{ color: C.sec }}>R:R:</span> <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{inst.rr}</span></div>
                </div>
                <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.6 }}>
                  <span style={{ color: C.jade, fontWeight: 600 }}>AI Reasoning: </span>{inst.reasoning}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              {expanded === inst.symbol ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
            </div>
          </div>
        ))}
      </div>

      {/* Correlation Warnings */}
      <div style={{
        background: C.amber + "10", border: `1px solid ${C.amber}30`, borderRadius: 12,
        padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
      }}>
        <AlertTriangle size={16} color={C.amber} />
        <span style={{ fontSize: 12, color: C.amber }}>
          NAS100 + US30 correlated — pick one. &nbsp; AUDUSD + NZDUSD correlated — pick one.
        </span>
      </div>

      {/* Equity Curve */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.sec, fontWeight: 500 }}>Equity Curve — April 2026</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.green }}>+$5,160</div>
          </div>
        </div>
        <Sparkline data={EQUITY_CURVE} color={C.jade} w={1100} h={120} />
      </div>

      {/* Run Scan */}
      <button
        onClick={handleScan}
        disabled={scanning}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "14px 32px",
          borderRadius: 12, border: "none", cursor: scanning ? "wait" : "pointer",
          background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
          color: C.bg, fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          boxShadow: `0 4px 20px ${C.jade}30`,
          opacity: scanning ? 0.7 : 1, transition: "all 0.2s",
        }}
      >
        {scanning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
        {scanning ? "Scanning..." : "Run Scan"}
      </button>
    </div>
  );
}
