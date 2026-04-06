import { useState } from "react";
import { C, INSTRUMENTS } from "@/lib/mock-data";
import {
  Clock, TrendingUp, Target, AlertTriangle, ChevronDown, ChevronUp,
  Brain, Zap, BarChart3, Shield, Calendar, Activity
} from "lucide-react";

const cardStyle: React.CSSProperties = {
  background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
  padding: 24, transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const,
  letterSpacing: 1, marginBottom: 8,
};

const KEY_DISCOVERIES = [
  {
    icon: Clock, color: C.jade, title: "Best Time to Trade",
    items: [
      { instrument: "XAUUSD", detail: "London/NY overlap, 13:00–16:00 UTC", stat: "Win rate: 78%" },
      { instrument: "NAS100", detail: "NY open 14:30–16:00 UTC", stat: "Win rate: 74%" },
      { instrument: "AUDUSD", detail: "Asian session 00:00–03:00 UTC", stat: "Win rate: 71%" },
    ],
  },
  {
    icon: TrendingUp, color: C.blue, title: "Biggest Moves",
    items: [
      { instrument: "XAUUSD", detail: "Avg 320 pips during FOMC days", stat: "+4.2x normal" },
      { instrument: "NAS100", detail: "Avg 180pts during NY open", stat: "+2.8x normal" },
      { instrument: "US30", detail: "Avg 150pts during London close", stat: "+2.1x normal" },
    ],
  },
  {
    icon: Target, color: C.green, title: "Your Edge",
    items: [
      { instrument: "EMA Cross + ADX > 25", detail: "Combined with London session", stat: "Win rate: 82%" },
      { instrument: "RSI Bounce 40-45", detail: "On trending instruments only", stat: "Win rate: 76%" },
      { instrument: "Breakout + Volume", detail: "First 30 min of session", stat: "Win rate: 73%" },
    ],
  },
  {
    icon: AlertTriangle, color: C.red, title: "Risk Alert",
    items: [
      { instrument: "Counter-trend Asian", detail: "Trading against trend in Asian session", stat: "Win rate: 28%" },
      { instrument: "Post-streak trades", detail: "Entries after 3+ consecutive wins", stat: "Win rate: 38%" },
      { instrument: "XAUUSD pre-news", detail: "Positions 30 min before high-impact", stat: "Avg loss: -$180" },
    ],
  },
];

const INSTRUMENT_INSIGHTS = [
  {
    symbol: "NAS100", color: C.green,
    bestSession: "New York (14:30–21:00 UTC)",
    optimalEMA: "Fast: 4 / Slow: 17 on 15m HA",
    avgMove: { london: "85 pts", ny: "142 pts", asian: "38 pts" },
    winByDay: { Mon: "65%", Tue: "72%", Wed: "68%", Thu: "78%", Fri: "60%" },
    correlations: "Strong positive with US30 (r=0.92). Avoid simultaneous positions.",
    recommendation: "Focus on NY session. Thursday shows consistently highest win rate. EMA 4/17 cross signals are your best setup.",
  },
  {
    symbol: "US30", color: C.blue,
    bestSession: "London/NY Overlap (13:00–16:00 UTC)",
    optimalEMA: "Fast: 5 / Slow: 20 on 15m HA",
    avgMove: { london: "95 pts", ny: "120 pts", asian: "42 pts" },
    winByDay: { Mon: "60%", Tue: "68%", Wed: "74%", Thu: "70%", Fri: "55%" },
    correlations: "Strong positive with NAS100 (r=0.92). Moderate with XAUUSD (r=-0.45).",
    recommendation: "Prefer over NAS100 on Wednesdays. Avoid Friday afternoon — your win rate drops significantly.",
  },
  {
    symbol: "AUDUSD", color: C.amber,
    bestSession: "Asian Session (00:00–06:00 UTC)",
    optimalEMA: "Fast: 8 / Slow: 21 on 15m HA",
    avgMove: { london: "22 pips", ny: "18 pips", asian: "35 pips" },
    winByDay: { Mon: "70%", Tue: "65%", Wed: "62%", Thu: "68%", Fri: "58%" },
    correlations: "Strong positive with NZDUSD (r=0.88). Trade one at a time.",
    recommendation: "Best during Asian session Mondays. Avoid during NY — price action becomes choppy for this pair.",
  },
  {
    symbol: "NZDUSD", color: C.cyan,
    bestSession: "Asian Session (00:00–06:00 UTC)",
    optimalEMA: "Fast: 8 / Slow: 21 on 15m HA",
    avgMove: { london: "18 pips", ny: "15 pips", asian: "28 pips" },
    winByDay: { Mon: "62%", Tue: "68%", Wed: "60%", Thu: "65%", Fri: "55%" },
    correlations: "Strong positive with AUDUSD (r=0.88). Inverse with USD strength.",
    recommendation: "Consider replacing with AUDUSD for better volatility. Only trade when AUDUSD is ranging.",
  },
  {
    symbol: "XAUUSD", color: C.orange,
    bestSession: "London/NY Overlap (13:00–16:00 UTC)",
    optimalEMA: "Fast: 5 / Slow: 13 on 15m HA",
    avgMove: { london: "180 pips", ny: "220 pips", asian: "65 pips" },
    winByDay: { Mon: "55%", Tue: "62%", Wed: "70%", Thu: "72%", Fri: "48%" },
    correlations: "Inverse with USD (r=-0.78). Moderate inverse with US30.",
    recommendation: "⚠ Avoid Asian session — your win rate drops to 35%. Best on Thu during London/NY overlap.",
  },
];

const WEEKLY_DIGEST = [
  { icon: TrendingUp, text: "This week you performed best on Thursday during London overlap — 4 wins, 0 losses, +$680 P&L." },
  { icon: Zap, text: "NAS100 EMA Cross signals had an 80% hit rate this week (4/5 triggered correctly)." },
  { icon: Brain, text: "Consider: AUDUSD shows strongest trend momentum entering next week — ADX rising from 18 to 26." },
  { icon: Target, text: "Strength: Your discipline on risk management improved — 95% of trades met 2:1 R:R minimum." },
  { icon: AlertTriangle, text: "Weakness: You entered 2 counter-trend trades on XAUUSD during Asian session. Both lost." },
];

const PATTERNS = [
  { title: "Over-trading after winning streaks", severity: "high" as const, detail: "You tend to increase position frequency after 3+ consecutive wins. Historical data shows your win rate drops from 72% to 38% on the 4th+ consecutive trade. Consider implementing a cool-down rule.", impact: "Estimated cost: -$840/month" },
  { title: "Counter-trend Asian session losses", severity: "high" as const, detail: "Your worst losses consistently come from counter-trend trades during the Asian session (00:00–06:00 UTC). These trades have a 28% win rate vs your overall 70%.", impact: "Estimated cost: -$520/month" },
  { title: "Position sizing opportunity on XAUUSD", severity: "medium" as const, detail: "Reducing position size on XAUUSD by 20% would have improved your Sharpe ratio from 1.4 to 1.8 based on the last 90 days of data.", impact: "Potential improvement: +12% risk-adjusted returns" },
  { title: "Friday afternoon performance drop", severity: "medium" as const, detail: "Your win rate drops to 45% after 18:00 UTC on Fridays. This correlates with lower volume and wider spreads before weekend close.", impact: "Estimated cost: -$320/month" },
];

const MARKET_CONDITIONS = [
  { symbol: "NAS100", regime: "Trending", direction: "Bullish", volatility: "+18%", volLabel: "Above avg", forecast: "Continuation likely", news: "FOMC Minutes Wed 18:00 UTC" },
  { symbol: "US30", regime: "Trending", direction: "Bullish", volatility: "+12%", volLabel: "Above avg", forecast: "Watch for pullback", news: "NFP Fri 12:30 UTC" },
  { symbol: "AUDUSD", regime: "Ranging", direction: "Neutral", volatility: "-8%", volLabel: "Below avg", forecast: "Breakout pending", news: "RBA Rate Decision Tue 03:30 UTC" },
  { symbol: "NZDUSD", regime: "Ranging", direction: "Neutral", volatility: "-12%", volLabel: "Below avg", forecast: "Follow AUDUSD lead", news: "None this week" },
  { symbol: "XAUUSD", regime: "Volatile", direction: "Mixed", volatility: "+32%", volLabel: "High", forecast: "Caution — event risk", news: "CPI Thu 12:30 UTC" },
];

export default function InsightsPage() {
  const [expandedInstrument, setExpandedInstrument] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Brain size={28} style={{ color: C.jade }} />
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
            Artificial Intelligence Insights
          </h1>
        </div>
        <p style={{ color: C.sec, fontSize: 14 }}>Compiled from your trading data and market analysis</p>
      </div>

      {/* Section 1 — Key Discoveries */}
      <div style={labelStyle}>Key Discoveries</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
        {KEY_DISCOVERIES.map((card) => (
          <div key={card.title} style={{ ...cardStyle }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: card.color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <card.icon size={18} style={{ color: card.color }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{card.title}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {card.items.map((item) => (
                <div key={item.instrument} style={{ padding: "10px 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", color: card.color }}>{item.instrument}</div>
                  <div style={{ fontSize: 12, color: C.sec, marginBottom: 4 }}>{item.detail}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.stat}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Section 2 — Instrument Intelligence */}
      <div style={labelStyle}>Instrument Intelligence</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {INSTRUMENT_INSIGHTS.map((inst) => {
          const open = expandedInstrument === inst.symbol;
          return (
            <div key={inst.symbol} style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setExpandedInstrument(open ? null : inst.symbol)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 20px", background: "none", border: "none", cursor: "pointer", color: C.text,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: inst.color }} />
                  <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>{inst.symbol}</span>
                  <span style={{ color: C.sec, fontSize: 13 }}>— {inst.bestSession}</span>
                </div>
                {open ? <ChevronUp size={18} style={{ color: C.muted }} /> : <ChevronDown size={18} style={{ color: C.muted }} />}
              </button>
              {open && (
                <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>OPTIMAL EMA</div>
                    <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{inst.optimalEMA}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>AVG MOVE BY SESSION</div>
                    <div style={{ fontSize: 12, display: "flex", gap: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span>LDN: {inst.avgMove.london}</span>
                      <span>NY: {inst.avgMove.ny}</span>
                      <span>ASIA: {inst.avgMove.asian}</span>
                    </div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>WIN RATE BY DAY</div>
                    <div style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace" }}>
                      {Object.entries(inst.winByDay).map(([day, rate]) => (
                        <span key={day} style={{ color: parseInt(rate) >= 70 ? C.green : parseInt(rate) >= 60 ? C.text : C.red }}>{day}: {rate}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>CORRELATIONS</div>
                    <div style={{ fontSize: 12, color: C.sec }}>{inst.correlations}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.jade + "10", border: `1px solid ${C.jade}30`, gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Brain size={14} style={{ color: C.jade }} />
                      <span style={{ color: C.jade, fontSize: 11, fontWeight: 700 }}>AI RECOMMENDATION</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.text }}>{inst.recommendation}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Section 3 — Weekly Digest */}
      <div style={labelStyle}>Weekly Digest</div>
      <div style={{ ...cardStyle, marginBottom: 32, borderColor: C.jade + "30" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.jade + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar size={18} style={{ color: C.jade }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Week of March 31 — April 6, 2026</div>
            <div style={{ fontSize: 12, color: C.sec }}>AI-generated summary</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {WEEKLY_DIGEST.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
              <item.icon size={16} style={{ color: C.jade, marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: C.sec, lineHeight: 1.5 }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4 — Pattern Detection */}
      <div style={labelStyle}>Pattern Detection</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
        {PATTERNS.map((p) => (
          <div key={p.title} style={{ ...cardStyle, borderColor: p.severity === "high" ? C.red + "30" : C.amber + "30" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{
                padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                background: p.severity === "high" ? C.red + "20" : C.amber + "20",
                color: p.severity === "high" ? C.red : C.amber,
              }}>
                {p.severity}
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</span>
            </div>
            <p style={{ fontSize: 13, color: C.sec, lineHeight: 1.6, marginBottom: 12 }}>{p.detail}</p>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: p.severity === "high" ? C.red : C.amber }}>
              {p.impact}
            </div>
          </div>
        ))}
      </div>

      {/* Section 5 — Market Conditions */}
      <div style={labelStyle}>Market Conditions</div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Instrument", "Regime", "Direction", "Volatility vs 30d", "Forecast", "Upcoming News"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MARKET_CONDITIONS.map((m) => (
                <tr key={m.symbol} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "12px 16px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{m.symbol}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: m.regime === "Trending" ? C.green + "20" : m.regime === "Ranging" ? C.amber + "20" : C.red + "20",
                      color: m.regime === "Trending" ? C.green : m.regime === "Ranging" ? C.amber : C.red,
                    }}>{m.regime}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: m.direction === "Bullish" ? C.green : m.direction === "Mixed" ? C.amber : C.sec }}>{m.direction}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: m.volatility.startsWith("+") ? C.amber : C.green }}>{m.volatility}</span>
                    <span style={{ color: C.muted, fontSize: 11, marginLeft: 6 }}>{m.volLabel}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: C.sec }}>{m.forecast}</td>
                  <td style={{ padding: "12px 16px", color: m.news === "None this week" ? C.muted : C.amber, fontSize: 12 }}>{m.news}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
