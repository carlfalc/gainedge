import { useState, useEffect } from "react";
import {
  Zap, Shield, BarChart3, Bell, Brain, Target, Calendar, Filter,
  TrendingUp, RefreshCw, Layers, BookOpen, Save, Clock, Maximize2,
  Move, EyeOff, SlidersHorizontal, DollarSign, Check, X, ChevronDown
} from "lucide-react";

// ── COLORS ────────────────────────────────────────────────
const C = {
  bg: "#080B12", bg2: "#0D1117", card: "#111724", cardH: "#161D2B",
  border: "rgba(255,255,255,0.06)", borderH: "rgba(255,255,255,0.14)", nav: "rgba(8,11,18,0.88)",
  jade: "#00CFA5", teal: "#06B6D4", text: "#E4E9F0", sec: "#8892A4", muted: "#555F73",
  green: "#22C55E", red: "#EF4444", amber: "#F59E0B", pink: "#F472B6", purple: "#A78BFA",
  blue: "#60A5FA", orange: "#FB923C", cyan: "#22D3EE", lime: "#84CC16",
};

// ── ICON MAP ──────────────────────────────────────────────
const iconMap: Record<string, React.ElementType> = {
  bolt: Zap, shield: Shield, chart: BarChart3, bell: Bell, brain: Brain,
  target: Target, calendar: Calendar, filter: Filter, stats: TrendingUp,
  refresh: RefreshCw, layers: Layers, book: BookOpen, save: Save,
  clock: Clock, expand: Maximize2, move: Move, eyeOff: EyeOff,
  sliders: SlidersHorizontal, dollar: DollarSign, check: Check, trendUp: TrendingUp,
};

const IconBox = ({ type, color, size = 44 }: { type: string; color: string; size?: number }) => {
  const Ico = iconMap[type] || Zap;
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Ico size={size * 0.5} color={color} strokeWidth={1.8} />
    </div>
  );
};

// ── SPINNING STAT CARDS ───────────────────────────────────
function SpinCard({ front, back, color, delay = 0 }: {
  front: { label: string; value: string; sub?: string };
  back: { label: string; value: string };
  color: string; delay?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAutoSpin(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!autoSpin) return;
    const interval = setInterval(() => setFlipped(f => !f), 4000 + delay);
    return () => clearInterval(interval);
  }, [autoSpin, delay]);

  return (
    <div
      onClick={() => { setAutoSpin(false); setFlipped(f => !f); }}
      style={{ perspective: 800, cursor: "pointer", flex: 1, minWidth: 0 }}
    >
      <div style={{
        position: "relative", width: "100%", height: 80,
        transformStyle: "preserve-3d",
        transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
        transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)",
      }}>
        {/* FRONT */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "center",
          borderTop: `2px solid ${color}`,
        }}>
          <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{front.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: C.text, marginTop: 2 }}>{front.value}</div>
          {front.sub && <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 1 }}>{front.sub}</div>}
        </div>
        {/* BACK */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateX(180deg)",
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: "10px 14px", display: "flex", flexDirection: "column", justifyContent: "center",
          borderTop: `2px solid ${color}`,
        }}>
          <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{back.label}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{back.value}</div>
        </div>
      </div>
    </div>
  );
}

// ── SPARKLINE SVG ─────────────────────────────────────────
function Sparkline({ data, color, w = 120, h = 32 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs><linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={`url(#sg-${color.replace('#', '')})`} />
    </svg>
  );
}

// ── CIRCULAR GAUGE ────────────────────────────────────────
function Gauge({ value, max = 10, color, size = 36 }: { value: number; max?: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value / max;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`} strokeLinecap="round" />
    </svg>
  );
}

// ── PREMIUM DASHBOARD MOCKUP ──────────────────────────────
function PremiumDash() {
  const rows = [
    { s: "NAS100", d: "BUY", c: 6, col: C.green, pnl: "+$1,240", spark: [20, 22, 21, 25, 28, 27, 30, 32, 35, 34, 38] },
    { s: "US30", d: "BUY", c: 5, col: C.green, pnl: "+$890", spark: [40, 42, 41, 43, 44, 43, 46, 45, 47, 46, 48] },
    { s: "AUDUSD", d: "WAIT", c: 3, col: C.amber, pnl: "+$320", spark: [68, 69, 68, 69, 69, 68, 69, 69, 70, 69, 69] },
    { s: "NZDUSD", d: "WAIT", c: 3, col: C.amber, pnl: "+$180", spark: [56, 57, 56, 57, 57, 56, 57, 57, 57, 57, 57] },
    { s: "XAUUSD", d: "—", c: 2, col: C.red, pnl: "-$45", spark: [46, 47, 46, 45, 46, 47, 46, 45, 46, 47, 46] },
  ];
  const equityCurve = [0, 245, 125, 505, 505, 420, 930, 1105, 895, 1315, 1410, 1365, 2045, 2045, 2355, 2180, 2405, 2405, 2315, 2760, 3320, 3290, 3485, 3855, 3855, 4140, 3985, 4595, 4735, 4735, 5160];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, maxWidth: 520, width: "100%" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse-dot 2s infinite" }} />
          <span style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>LIVE</span>
          <span style={{ color: C.muted, fontSize: 11 }}>London Session • EMA 4/17 • 15m</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["1D", "1W", "1M", "ALL"].map((t, i) => (
            <span key={t} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: i === 0 ? C.jade + "20" : "transparent", color: i === 0 ? C.jade : C.muted, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Spinning stat cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <SpinCard front={{ label: "Net P&L", value: "$5,160", sub: "▲ 12.4%" }} back={{ label: "Best Day", value: "$1,240 on NAS100 BUY" }} color={C.green} delay={0} />
        <SpinCard front={{ label: "Win Rate", value: "70%", sub: "21/30 trades" }} back={{ label: "Streak", value: "5 consecutive wins" }} color={C.jade} delay={500} />
        <SpinCard front={{ label: "Profit Factor", value: "2.14" }} back={{ label: "Expectancy", value: "$172 per trade avg" }} color={C.blue} delay={1000} />
        <SpinCard front={{ label: "Avg R:R", value: "1.8:1" }} back={{ label: "Max DD", value: "-$380 (2.1%)" }} color={C.purple} delay={1500} />
      </div>

      {/* Mini equity curve */}
      <div style={{ background: C.bg2, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: C.sec, fontWeight: 500 }}>Equity Curve — April 2026</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: C.green }}>+$5,160</div>
          </div>
          <Sparkline data={equityCurve} color={C.green} w={160} h={40} />
        </div>
      </div>

      {/* Best signal banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: `linear-gradient(90deg, ${C.jade}15, transparent)`, border: `1px solid ${C.jade}30`, borderRadius: 12, padding: "10px 16px", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: C.jade, textTransform: "uppercase" }}>HIGHEST CONVICTION</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>NAS100 BUY • Entry 24,059 → TP 24,277</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: C.jade + "20", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 18, color: C.jade }}>6</div>
      </div>

      {/* Instrument rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(r => (
          <div key={r.s} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: C.bg2, border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
              <Gauge value={r.c} color={r.col} size={30} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{r.s}</div>
                <div style={{ fontSize: 9, color: C.muted }}>15m HA</div>
              </div>
            </div>
            <Sparkline data={r.spark} color={r.col} w={80} h={24} />
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: r.pnl.startsWith("+") ? C.green : C.red, minWidth: 60, textAlign: "right" }}>{r.pnl}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: r.col + "18", color: r.col }}>{r.d}</span>
          </div>
        ))}
      </div>

      {/* Correlation warning */}
      <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: C.amber + "10", border: `1px solid ${C.amber}20`, fontSize: 10, color: C.amber, lineHeight: 1.5 }}>
        ⚠ NAS100 + US30 correlated — max 1 position. AUDUSD + NZDUSD correlated — pick one.
      </div>
    </div>
  );
}

// ── STRATEGY PERFORMANCE MOCKUP ───────────────────────────
function StratMock() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d26 = [1100, null, null, -3000, 1400, 3000, 1000, null, null, 2600, null, -500];
  const d25: (number | null)[] = [null, 1100, null, null, 1400, null, null, 2600, null, null, null, null];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <SpinCard front={{ label: "Net P&L", value: "$5,160", sub: "▲ 12.4%" }} back={{ label: "Best Day", value: "$1,240 NAS100" }} color={C.green} delay={0} />
        <SpinCard front={{ label: "Win Rate", value: "70%" }} back={{ label: "Streak", value: "5 wins" }} color={C.jade} delay={600} />
        <SpinCard front={{ label: "Profit Factor", value: "2.14" }} back={{ label: "Expectancy", value: "$172/trade" }} color={C.blue} delay={1200} />
        <SpinCard front={{ label: "Avg R:R", value: "1.8:1" }} back={{ label: "Max DD", value: "-$380" }} color={C.purple} delay={1800} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["Win rate", "P&L", "Trades"].map((t, i) => (
          <button key={t} style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, background: i === 1 ? C.jade + "20" : "transparent", color: i === 1 ? C.jade : C.muted }}>{t}</button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr>
              <th style={{ padding: 4, textAlign: "left", color: C.sec, fontWeight: 600 }}>Year</th>
              {months.map(m => <th key={m} style={{ padding: 4, color: C.sec, fontWeight: 500 }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {([["2026", d26], ["2025", d25]] as [string, (number | null)[]][]).map(([yr, data]) => (
              <tr key={yr}>
                <td style={{ padding: 4, fontWeight: 700, color: C.text }}>{yr}</td>
                {data.map((v, i) => (
                  <td key={i} style={{ padding: 4, textAlign: "center" }}>
                    {v !== null ? (
                      <span style={{ background: v > 0 ? C.green + "20" : C.red + "20", color: v > 0 ? C.green : C.red, borderRadius: 4, padding: "3px 5px", fontSize: 8, fontWeight: 700 }}>
                        {v > 0 ? "+" : "-"}${Math.abs(v / 1000).toFixed(0)}K
                      </span>
                    ) : <span style={{ color: C.muted }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, color: C.sec, marginBottom: 6 }}>Cumulative Performance</div>
        <Sparkline data={[0, 400, 600, 1100, 1500, 1200, 2200, 3000, 2800, 3500, 4200, 5160]} color={C.jade} w={400} h={50} />
      </div>
    </div>
  );
}

// ── DATA ──────────────────────────────────────────────────
const TABS = [
  { id: "signals", label: "AI Signals", icon: "bolt", color: C.jade },
  { id: "analytics", label: "Analytics", icon: "chart", color: C.blue },
  { id: "calendar", label: "Performance Calendar", icon: "calendar", color: C.purple },
  { id: "journal", label: "Trade Journal", icon: "book", color: C.pink },
  { id: "backtest", label: "Backtesting", icon: "refresh", color: C.orange },
  { id: "alerts", label: "Alerts", icon: "bell", color: C.amber },
];

const TD: Record<string, { t: string; d: string; ch: string[] }> = {
  signals: { t: "Artificial Intelligence Powered Signals", d: "Every instrument scanned across multiple timeframes. The engine analyses EMAs, RSI, MACD, ADX, volume, price structure, and news — then delivers a conviction-scored execution summary.", ch: ["Real-time multi-instrument scanning", "Conviction scoring 1–10", "Entry, TP, SL with R:R ratio", "Correlation & risk warnings", "Session-aware analysis", "News blackout detection"] },
  analytics: { t: "Advanced Performance Analytics", d: "50+ metrics that reveal exactly where your edge lives. Break down performance by instrument, session, strategy, and more.", ch: ["Win rate & profit factor", "Best & worst trading days", "Setup performance breakdown", "Risk-reward tracking", "Drawdown analysis", "Expectancy calculations"] },
  calendar: { t: "P&L Heatmap Calendar", d: "Visual daily performance tracker. Green and red days at a glance. Spot patterns — which sessions are most profitable.", ch: ["Daily P&L colour-coded heatmap", "Monthly cumulative tracking", "Session breakdown", "Win streak identification", "Loss pattern detection", "Exportable reports"] },
  journal: { t: "Automated Trade Journal", d: "Every signal, analysis, and outcome logged automatically. Add notes, tag strategies, build a searchable history.", ch: ["Auto-logged from signals", "Custom notes & reflections", "Strategy tagging", "Screenshot capture", "Trade replay integration", "Searchable history"] },
  backtest: { t: "Artificial Intelligence Backtest Strategy & Indicator Model", d: "Test any configuration against historical data. Compare EMA combinations, candle types, timeframes, and sessions.", ch: ["Historical data analysis", "EMA pair optimisation", "Candle type comparison", "Session performance testing", "Statistical confidence scoring", "Exportable results"] },
  alerts: { t: "Smart Notifications", d: "Get alerted when a high-conviction setup appears — even at 1:30am during the New York session.", ch: ["Push notifications", "Email & SMS alerts", "Custom conviction thresholds", "Session-specific alerts", "Cooldown controls", "Multi-device sync"] },
};

const HELPS = [
  { icon: "target", color: C.jade, t: "Find High-Probability Setups", d: "AI scans every instrument and surfaces only setups with genuine edge." },
  { icon: "shield", color: C.blue, t: "Manage Risk Automatically", d: "Every signal includes stop loss, position sizing, and correlation warnings." },
  { icon: "chart", color: C.purple, t: "Track What Actually Works", d: "Automated journaling shows exactly which setups make you money." },
  { icon: "bell", color: C.amber, t: "Never Miss a Session", d: "Smart alerts when high-conviction setups appear — even while you sleep." },
  { icon: "brain", color: C.pink, t: "Intelligence That Learns", d: "The system builds memory. It learns which setups work best per instrument." },
  { icon: "refresh", color: C.orange, t: "Backtest Before You Risk", d: "Test configurations against historical data. Know your edge first." },
];

const HC = [
  { icon: "save", color: C.blue, t: "Save Chart Settings", d: "Lock in preferred indicators and layouts for every session." },
  { icon: "clock", color: C.purple, t: "Session Timing", d: "Auto session detection — London, New York, Asian — with overlap alerts." },
  { icon: "expand", color: C.jade, t: "Full Analysis Mode", d: "Full dashboard with all indicators, levels, and AI commentary." },
  { icon: "sliders", color: C.orange, t: "Custom Configuration", d: "Configure EMA pairs, candle types, timeframes, and risk parameters." },
  { icon: "move", color: C.cyan, t: "Visual SL/TP Levels", d: "See stop loss and take profit levels. Adjust with a click." },
  { icon: "eyeOff", color: C.pink, t: "Noise Reduction", d: "Filter out low-conviction signals. See only quality setups." },
  { icon: "layers", color: C.lime, t: "Multi-Candle Analysis", d: "Heiken Ashi, Renko, standard — the AI adapts to each type." },
  { icon: "dollar", color: C.green, t: "Quick Execution", d: "One-tap access to entry, TP, SL, and R:R for every signal." },
];

const PR = [
  { n: "Scout", p: 29, yp: 23, inst: 3, d: "Getting started", f: ["3 Instruments", "Daily briefs", "P&L calendar", "Email alerts", "Basic analytics", "Trade journal"], cta: "Start Free Trial" },
  { n: "Trader", p: 59, yp: 47, inst: 10, pop: true, d: "Active traders", f: ["10 Instruments", "Real-time signals", "Full analytics", "Push notifications", "Backtesting", "Priority scanning", "Strategy tagging", "Custom EMA config"], cta: "Start Free Trial" },
  { n: "Elite", p: 129, yp: 99, inst: 999, d: "Professional", f: ["Unlimited instruments", "Priority AI", "Full analytics + exports", "All alert channels", "Advanced backtesting", "API access", "1-on-1 onboarding", "Custom integrations"], cta: "Contact Sales" },
];

const FAQ_DATA = [
  { q: "What instruments are supported?", a: "Forex, indices, commodities, and crypto. Any TradingView-available instrument." },
  { q: "How does the artificial intelligence work?", a: "Our engine connects to TradingView live, reads every candle and indicator, analyses EMA crossovers, RSI, MACD, ADX, volume, and structure, then produces conviction-scored execution summaries." },
  { q: "Does this trade for me?", a: "No. We provide analysis and signals with exact entry, TP, and SL. You maintain full control." },
  { q: "Can I customise EMA settings?", a: "Yes. Default is EMA 4/17 on Heiken Ashi. Configure any pair, candle type, and timeframe." },
  { q: "Is my data secure?", a: "All processing is local. We never sell or share your data. All connections encrypted." },
];

// ── MAIN COMPONENT ────────────────────────────────────────
export default function Index() {
  const [tab, setTab] = useState("signals");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [yr, setYr] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [auth, setAuth] = useState<string | null>(null);

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", f);
    return () => window.removeEventListener("scroll", f);
  }, []);

  const td = TD[tab];

  return (
    <div>
      {/* ── AUTH MODAL ── */}
      {auth && (
        <div onClick={() => setAuth(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 36, width: 380, maxWidth: "90vw", position: "relative" }}>
            <button onClick={() => setAuth(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={18} /></button>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{auth === "login" ? "Welcome back" : "Get started free"}</h2>
            <p style={{ fontSize: 13, color: C.sec, marginBottom: 24 }}>{auth === "login" ? "Log in to your dashboard" : "14-day free trial. No card required."}</p>
            {["Email", auth === "signup" ? "Full Name" : null, "Password"].filter(Boolean).map(f => (
              <div key={f} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.sec, display: "block", marginBottom: 5 }}>{f}</label>
                <input
                  type={f === "Password" ? "password" : f === "Email" ? "email" : "text"}
                  placeholder={f === "Email" ? "you@example.com" : f === "Password" ? "••••••••" : "Your name"}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                  onFocus={e => (e.target.style.borderColor = C.jade + "60")}
                  onBlur={e => (e.target.style.borderColor = C.border)}
                />
              </div>
            ))}
            <button className="bp" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>{auth === "login" ? "Log In" : "Start Free Trial →"}</button>
            <p style={{ textAlign: "center", fontSize: 13, color: C.sec, marginTop: 16 }}>
              {auth === "login" ? "New here? " : "Already have an account? "}
              <span onClick={() => setAuth(auth === "login" ? "signup" : "login")} style={{ color: C.jade, cursor: "pointer", fontWeight: 600 }}>{auth === "login" ? "Create account" : "Log in"}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── NAV ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", background: scrolled ? C.nav : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", borderBottom: scrolled ? `1px solid ${C.border}` : "none", transition: "all .3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={22} color={C.jade} strokeWidth={2.5} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>GAINEDGE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["Features", "How It Works", "Pricing", "FAQ"].map(n => (
            <button key={n} className="ni" onClick={() => document.getElementById(n.toLowerCase().replace(/ /g, ""))?.scrollIntoView({ behavior: "smooth" })}>{n}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="ni" onClick={() => setAuth("login")}>Log In</button>
          <button className="bp" onClick={() => setAuth("signup")} style={{ padding: "8px 20px", fontSize: 13 }}>Get Started →</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ paddingTop: 120, paddingBottom: 60 }}>
        <div className="sec" style={{ display: "flex", alignItems: "center", gap: 60, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 340 }}>
            <div className="fu" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.jade + "12", border: `1px solid ${C.jade}25`, borderRadius: 100, padding: "8px 18px", marginBottom: 24 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse-dot 2s infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.jade, letterSpacing: 1 }}>Artificial Intelligence • Connected Live</span>
            </div>
            <h1 className="fu d1 ttl" style={{ fontSize: 44, maxWidth: 540 }}>
              The connection between artificial intelligence and the markets — finally made.
            </h1>
            <p className="fu d2 sub" style={{ maxWidth: 500 }}>
              The edge traders have been waiting for. Artificial intelligence, connected live to your charts, delivering conviction-scored signals so you trade with confidence.
            </p>
            <div className="fu d3" style={{ display: "flex", gap: 12, marginTop: 28 }}>
              <button className="bp" onClick={() => setAuth("signup")}>Start Free Trial →</button>
              <button className="bg2" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>See Features</button>
            </div>
            <div className="fu d4" style={{ display: "flex", gap: 32, marginTop: 32 }}>
              {[["50,000+", "Traders"], ["$2.1B+", "Analysed"]].map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
                  <div style={{ fontSize: 13, color: C.sec }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 340, display: "flex", justifyContent: "center" }}>
            <PremiumDash />
          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "16px 0", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 48, animation: "marquee 35s linear infinite", width: "max-content" }}>
          {[...Array(2)].flatMap(() => [["50+", "Metrics"], ["5", "Instruments"], ["<60s", "Full Scan"], ["24/7", "Monitoring"], ["81", "AI Tools"], ["15m", "Refresh"]]).map(([v, l], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: C.jade }}>{v}</span>
              <span style={{ color: C.sec, fontSize: 14 }}>{l}</span>
              <span style={{ color: C.muted }}>•</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "80px 0" }}>
        <div className="sec">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">Features</div>
            <h2 className="ttl">Everything In One Location</h2>
            <p className="sub" style={{ margin: "10px auto 0" }}>Your entire trading workflow — analysed, tracked, and optimised.</p>
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
            {TABS.map(t => {
              const Ico = iconMap[t.icon] || Zap;
              return (
                <button key={t.id} className={`tb ${tab === t.id ? "ac" : ""}`} onClick={() => setTab(t.id)}>
                  <Ico size={16} color={tab === t.id ? t.color : C.muted} strokeWidth={1.8} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>{td.t}</h3>
              <p style={{ fontSize: 14, color: C.sec, lineHeight: 1.7, marginBottom: 24 }}>{td.d}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", marginBottom: 28 }}>
                {td.ch.map(c => (
                  <div key={c} className="ci">
                    <Check size={16} color={C.jade} strokeWidth={2.5} />
                    {c}
                  </div>
                ))}
              </div>
              <button className="bp" onClick={() => setAuth("signup")}>Get Started →</button>
            </div>
            <div style={{ flex: 1, minWidth: 320 }}>
              {tab === "backtest" || tab === "analytics" ? <StratMock /> : <PremiumDash />}
            </div>
          </div>
        </div>
      </section>

      {/* ── STRATEGY PERF ── */}
      <section style={{ padding: "80px 0", background: C.bg2 }}>
        <div className="sec">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">Performance</div>
            <h2 className="ttl">Your Trading Performance At A Glance</h2>
          </div>
          <div style={{ display: "flex", gap: 48, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 340 }}>
              <StratMock />
            </div>
            <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 20 }}>
              {[
                { icon: "trendUp", color: C.jade, t: "Strategy Performance", d: "See best and worst strategies with win %, net P&L, avg win/loss." },
                { icon: "calendar", color: C.purple, t: "Performance Calendar", d: "Yearly view shows P&L, win rate, and trade count by month." },
                { icon: "filter", color: C.cyan, t: "Filter By Anything", d: "Slice data by strategy, symbol, tags, day & time, risk." },
                { icon: "stats", color: C.orange, t: "Deep Statistics", d: "Time spent, avg R-multiple, hold time, consecutive streaks." },
              ].map(i => (
                <div key={i.t} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <IconBox type={i.icon} color={i.color} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{i.t}</div>
                    <div style={{ fontSize: 13, color: C.sec, lineHeight: 1.6 }}>{i.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="howitworks" style={{ padding: "80px 0" }}>
        <div className="sec">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">How It Works</div>
            <h2 className="ttl">Built To Make You A Better Trader</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {HELPS.map(h => (
              <div key={h.t} className="cd" style={{ padding: 28 }}>
                <IconBox type={h.icon} color={h.color} />
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "14px 0 8px" }}>{h.t}</h3>
                <p style={{ fontSize: 13, color: C.sec, lineHeight: 1.7 }}>{h.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOVER CARDS ── */}
      <section id="platform" style={{ padding: "80px 0", background: C.bg2 }}>
        <div className="sec">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">Platform</div>
            <h2 className="ttl">Explore All Capabilities</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {HC.map(c => (
              <div key={c.t} className="hc">
                <div className="hci"><IconBox type={c.icon} color={c.color} /></div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{c.t}</div>
                <div className="hcd">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "80px 0" }}>
        <div className="sec">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">Pricing</div>
            <h2 className="ttl">Invest In Your Trading Edge</h2>
            <p className="sub" style={{ margin: "10px auto 0" }}>14-day free trial. Cancel anytime.</p>
            <div style={{ display: "inline-flex", background: C.card, borderRadius: 10, padding: 4, marginTop: 20, border: `1px solid ${C.border}` }}>
              {[false, true].map(y => (
                <button key={String(y)} onClick={() => setYr(y)} style={{ padding: "7px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, background: yr === y ? C.jade : "transparent", color: yr === y ? C.bg : C.muted, transition: "all .2s", display: "flex", alignItems: "center", gap: 6 }}>
                  {y ? "Yearly" : "Monthly"}
                  {y && <span style={{ fontSize: 10, background: C.jade + "30", color: C.jade, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>Save 20%</span>}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, maxWidth: 1000, margin: "0 auto" }}>
            {PR.map(t => (
              <div key={t.n} className="cd" style={{ padding: 32, position: "relative", borderColor: t.pop ? C.jade + "40" : C.border }}>
                {t.pop && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: C.jade, color: C.bg, fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 100, letterSpacing: 1 }}>POPULAR</div>}
                <div style={{ fontSize: 13, color: C.sec, fontWeight: 600, marginBottom: 4 }}>{t.n}</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>{t.d}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>${yr ? t.yp : t.p}</span>
                  <span style={{ color: C.muted, fontSize: 14 }}>/mo</span>
                </div>
                {yr && <div style={{ fontSize: 11, color: C.sec, marginBottom: 8 }}>billed ${t.yp * 12}/yr</div>}
                <div style={{ fontSize: 12, color: C.sec, marginBottom: 20 }}>{t.inst === 999 ? "Unlimited" : `Up to ${t.inst}`} instruments</div>
                <button className="bp" onClick={() => setAuth("signup")} style={{ width: "100%", justifyContent: "center", marginBottom: 18 }}>{t.cta}</button>
                {t.f.map(f => (
                  <div key={f} className="ci" style={{ padding: "4px 0" }}>
                    <Check size={14} color={C.jade} strokeWidth={2.5} />
                    {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "80px 0", background: C.bg2 }}>
        <div className="sec" style={{ maxWidth: 720 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="lbl">FAQ</div>
            <h2 className="ttl">Frequently Asked Questions</h2>
          </div>
          {FAQ_DATA.map((f, i) => (
            <div key={i} className="fq">
              <div className="fqq" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {f.q}
                <span style={{ color: C.jade, fontSize: 20, transition: "transform .3s", transform: faqOpen === i ? "rotate(45deg)" : "rotate(0deg)", display: "inline-block" }}>+</span>
              </div>
              {faqOpen === i && <div className="fqa">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "80px 0" }}>
        <div className="sec" style={{ textAlign: "center" }}>
          <div style={{ background: C.card, border: `1px solid ${C.jade}30`, borderRadius: 24, padding: "56px 40px", boxShadow: `0 0 80px ${C.jade}10` }}>
            <h2 className="ttl" style={{ fontSize: 32 }}>Ready to find your edge?</h2>
            <p className="sub" style={{ margin: "10px auto 0" }}>Start your free 14-day trial. No credit card required.</p>
            <button className="bp" onClick={() => setAuth("signup")} style={{ marginTop: 20, fontSize: 15, padding: "13px 32px" }}>Get Started Free →</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "48px 0 24px" }}>
        <div className="sec">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 40, marginBottom: 40 }}>
            <div style={{ maxWidth: 260 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Zap size={20} color={C.jade} strokeWidth={2.5} />
                <span style={{ fontWeight: 800, fontSize: 17 }}>TradingAI</span>
              </div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>Artificial intelligence powered trading platform.</p>
            </div>
            {[
              { t: "Product", l: ["Features", "Pricing", "Dashboard", "API"] },
              { t: "Company", l: ["About", "Blog", "Careers", "Contact"] },
              { t: "Legal", l: ["Privacy", "Terms", "Disclaimer"] },
            ].map(c => (
              <div key={c.t}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.text }}>{c.t}</div>
                {c.l.map(l => (
                  <div key={l} style={{ fontSize: 13, color: C.muted, padding: "4px 0", cursor: "pointer", transition: "color .2s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>© 2026 TradingAI. All rights reserved.</span>
            <span style={{ fontSize: 11, color: C.muted }}>Not financial advice. Past performance is not indicative of future results.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
