import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import {
  Clock, TrendingUp, Target, AlertTriangle, ChevronDown, ChevronUp,
  Brain, Zap, Calendar, Activity, AlignCenterVertical
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const cardStyle: React.CSSProperties = {
  background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
  padding: 24, transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  color: C.text, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const,
  letterSpacing: 1, marginBottom: 8,
};

const iconMap: Record<string, any> = {
  best_time: Clock, biggest_moves: TrendingUp, edge: Target, risk_alert: AlertTriangle,
};
const colorMap: Record<string, string> = {
  best_time: C.jade, biggest_moves: C.blue, edge: C.green, risk_alert: C.red,
};

interface Insight {
  id: string; insight_type: string; symbol: string | null; title: string;
  description: string; data: any; severity: string | null;
  estimated_impact: number | null; week_start: string | null;
}

// Static data for instrument intelligence & market conditions (would come from AI backend later)
const INSTRUMENT_INSIGHTS = [
  { symbol: "NAS100", color: C.green, bestSession: "New York (14:30–21:00 UTC)", optimalEMA: "Fast: 4 / Slow: 17 on 15m HA", avgMove: { london: "85 pts", ny: "142 pts", asian: "38 pts" }, winByDay: { Mon: "65%", Tue: "72%", Wed: "68%", Thu: "78%", Fri: "60%" }, correlations: "Strong positive with US30 (r=0.92).", recommendation: "Focus on NY session. Thursday shows consistently highest win rate." },
  { symbol: "US30", color: C.blue, bestSession: "London/NY Overlap (13:00–16:00 UTC)", optimalEMA: "Fast: 5 / Slow: 20 on 15m HA", avgMove: { london: "95 pts", ny: "120 pts", asian: "42 pts" }, winByDay: { Mon: "60%", Tue: "68%", Wed: "74%", Thu: "70%", Fri: "55%" }, correlations: "Strong positive with NAS100 (r=0.92).", recommendation: "Prefer over NAS100 on Wednesdays." },
  { symbol: "AUDUSD", color: C.amber, bestSession: "Asian Session (00:00–06:00 UTC)", optimalEMA: "Fast: 8 / Slow: 21 on 15m HA", avgMove: { london: "22 pips", ny: "18 pips", asian: "35 pips" }, winByDay: { Mon: "70%", Tue: "65%", Wed: "62%", Thu: "68%", Fri: "58%" }, correlations: "Strong positive with NZDUSD (r=0.88).", recommendation: "Best during Asian session Mondays." },
  { symbol: "NZDUSD", color: C.cyan, bestSession: "Asian Session (00:00–06:00 UTC)", optimalEMA: "Fast: 8 / Slow: 21 on 15m HA", avgMove: { london: "18 pips", ny: "15 pips", asian: "28 pips" }, winByDay: { Mon: "62%", Tue: "68%", Wed: "60%", Thu: "65%", Fri: "55%" }, correlations: "Strong positive with AUDUSD (r=0.88).", recommendation: "Consider replacing with AUDUSD for better volatility." },
  { symbol: "XAUUSD", color: C.orange, bestSession: "London/NY Overlap (13:00–16:00 UTC)", optimalEMA: "Fast: 5 / Slow: 13 on 15m HA", avgMove: { london: "180 pips", ny: "220 pips", asian: "65 pips" }, winByDay: { Mon: "55%", Tue: "62%", Wed: "70%", Thu: "72%", Fri: "48%" }, correlations: "Inverse with USD (r=-0.78).", recommendation: "⚠ Avoid Asian session — your win rate drops to 35%." },
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
  const [keyInsights, setKeyInsights] = useState<Insight[]>([]);
  const [patterns, setPatterns] = useState<Insight[]>([]);
  const [weeklyDigest, setWeeklyDigest] = useState<Insight[]>([]);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("insights").select("*").eq("user_id", session.user.id);
    if (!data) return;

    const insights = data as Insight[];
    setKeyInsights(insights.filter(i => ["best_time", "biggest_moves", "edge", "risk_alert"].includes(i.insight_type)));
    setPatterns(insights.filter(i => i.insight_type === "pattern"));
    setWeeklyDigest(insights.filter(i => i.insight_type === "weekly_digest"));
  };

  // Group key insights by type
  const grouped = new Map<string, Insight[]>();
  keyInsights.forEach(i => {
    const arr = grouped.get(i.insight_type) || [];
    arr.push(i);
    grouped.set(i.insight_type, arr);
  });

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Brain size={28} style={{ color: C.jade }} />
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Artificial Intelligence Insights</h1>
        </div>
        <p style={{ color: C.text, fontSize: 14 }}>Compiled from your trading data and market analysis</p>
      </div>

      {/* Key Discoveries */}
      <div style={labelStyle}>Key Discoveries</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 32 }}>
        {Array.from(grouped.entries()).map(([type, items]) => {
          const IconComp = iconMap[type] || Activity;
          const color = colorMap[type] || C.jade;
          return (
            <div key={type} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconComp size={18} style={{ color }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{items[0].title}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {items.map(item => (
                  <div key={item.id} style={{ padding: "10px 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    {item.symbol && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", color }}>{item.symbol}</div>}
                    <div style={{ fontSize: 12, color: C.text }}>{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Instrument Intelligence */}
      <div style={labelStyle}>Instrument Intelligence</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {INSTRUMENT_INSIGHTS.map(inst => {
          const open = expandedInstrument === inst.symbol;
          return (
            <div key={inst.symbol} style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <button onClick={() => setExpandedInstrument(open ? null : inst.symbol)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: inst.color }} />
                  <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>{inst.symbol}</span>
                  <span style={{ color: C.text, fontSize: 13 }}>— {inst.bestSession}</span>
                </div>
                {open ? <ChevronUp size={18} style={{ color: C.text }} /> : <ChevronDown size={18} style={{ color: C.text }} />}
              </button>
              {open && (
                <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>OPTIMAL EMA</div>
                    <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{inst.optimalEMA}</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>AVG MOVE BY SESSION</div>
                    <div style={{ fontSize: 12, display: "flex", gap: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span>LDN: {inst.avgMove.london}</span>
                      <span>NY: {inst.avgMove.ny}</span>
                      <span>ASIA: {inst.avgMove.asian}</span>
                    </div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>WIN RATE BY DAY</div>
                    <div style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace" }}>
                      {Object.entries(inst.winByDay).map(([day, rate]) => (
                        <span key={day} style={{ color: parseInt(rate) >= 70 ? C.green : parseInt(rate) >= 60 ? C.text : C.red }}>{day}: {rate}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.text, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>CORRELATIONS</div>
                    <div style={{ fontSize: 12, color: C.text }}>{inst.correlations}</div>
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

      {/* Weekly Digest */}
      {weeklyDigest.length > 0 && (
        <>
          <div style={labelStyle}>Weekly Digest</div>
          <div style={{ ...cardStyle, marginBottom: 32, borderColor: C.jade + "30" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.jade + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Calendar size={18} style={{ color: C.jade }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Weekly Summary</div>
                <div style={{ fontSize: 12, color: C.text }}>AI-generated summary</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {weeklyDigest.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                  <TrendingUp size={16} style={{ color: C.jade, marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{item.description}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Pattern Detection */}
      {patterns.length > 0 && (
        <>
          <div style={labelStyle}>Pattern Detection</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
            {patterns.map(p => (
              <div key={p.id} style={{ ...cardStyle, borderColor: p.severity === "critical" ? C.red + "30" : C.amber + "30" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
                    background: p.severity === "critical" ? C.red + "20" : C.amber + "20",
                    color: p.severity === "critical" ? C.red : C.amber,
                  }}>
                    {p.severity}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</span>
                </div>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>{p.description}</p>
                {p.estimated_impact && (
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: p.severity === "critical" ? C.red : C.amber }}>
                    Estimated cost: ${p.estimated_impact.toLocaleString()}/month
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Market Conditions */}
      <div style={labelStyle}>Market Conditions</div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Instrument", "Regime", "Direction", "Volatility vs 30d", "Forecast", "Upcoming News"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.text, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MARKET_CONDITIONS.map(m => (
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
                    <span style={{ color: C.text, fontSize: 11, marginLeft: 6 }}>{m.volLabel}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: C.text }}>{m.forecast}</td>
                  <td style={{ padding: "12px 16px", color: C.amber, fontSize: 12 }}>{m.news}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
