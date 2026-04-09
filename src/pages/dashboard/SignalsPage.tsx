import { useState, useEffect, useMemo } from "react";
import { C } from "@/lib/mock-data";
import { ChevronDown, ChevronUp, Filter, Settings, TrendingUp, TrendingDown, Target, BarChart3, Award, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, startOfWeek, startOfDay } from "date-fns";
import { SignalAlertSettingsModal } from "@/components/dashboard/SignalAlertSettingsModal";

interface Signal {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number; take_profit: number; stop_loss: number;
  risk_reward: string; result: string; pnl: number | null;
  pnl_pips: number | null; notes: string | null;
  created_at: string; resolved_at: string | null;
}

type SortKey = "date" | "instrument" | "confidence";
type DateRange = "today" | "week" | "month" | "all";

const CURRENCIES = ["NZD", "USD", "AUD", "GBP", "EUR", "JPY"];

// USD P&L per pip for a given lot size
// Forex 4-decimal: 1 pip = $10 per standard lot (1.0), so $0.10 per 0.01 lot
// XAUUSD: 1 pip (0.01 move) = $1 per standard lot, so $0.01 per 0.01 lot
// Indices: 1 point = $1 per standard lot, so $0.01 per 0.01 lot
function pipToUsd(pips: number, symbol: string, lotSize: number): number {
  const isIndex = ["US30", "NAS100", "SPX500", "DJ30", "NDX100", "USTEC"].includes(symbol);
  const isGold = symbol === "XAUUSD";
  // pip value per standard lot (1.0 lot)
  const pipValuePerLot = isIndex ? 1 : isGold ? 1 : 10;
  return pips * pipValuePerLot * lotSize;
}

// Convert USD amount to display currency using live FX rates
function convertToDisplayCurrency(usdAmount: number, currency: string, fxRates: Record<string, number>): number {
  if (currency === "USD") return usdAmount;
  // For XXX/USD pairs (NZD, AUD): USD→XXX = usdAmount * (1 / XXXUSD rate)
  // For USD/XXX pairs (GBP, EUR): USD→XXX = usdAmount / XXXUSD rate
  // Since live_market_data stores NZDUSD, AUDUSD, GBPUSD, EURUSD, USDJPY
  const rate = fxRates[currency];
  if (!rate || rate === 0) {
    // Fallback static rates
    const fallback: Record<string, number> = { NZD: 1.72, AUD: 1.55, GBP: 0.79, EUR: 0.92, JPY: 155 };
    return usdAmount * (fallback[currency] || 1);
  }
  // NZDUSD=0.58 means 1 NZD = 0.58 USD, so 1 USD = 1/0.58 NZD
  // USDJPY=155 means 1 USD = 155 JPY — but we store it as USDJPY
  if (currency === "JPY") return usdAmount * rate; // USDJPY is already USD→JPY
  return usdAmount / rate; // NZDUSD, AUDUSD, GBPUSD, EURUSD: divide to get local
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterInst, setFilterInst] = useState("");
  const [filterDir, setFilterDir] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [minConf, setMinConf] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currency, setCurrency] = useState("NZD");
  const [lotSize, setLotSize] = useState(0.01);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  useEffect(() => {
    loadSignals();
    loadPrefs();
    loadFxRates();
    const channel = supabase.channel('signals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => loadSignals())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadFxRates = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Fetch live prices for FX conversion pairs
    const { data } = await supabase
      .from("live_market_data")
      .select("symbol, last_price")
      .eq("user_id", session.user.id)
      .in("symbol", ["NZDUSD", "AUDUSD", "GBPUSD", "EURUSD", "USDJPY"]);
    const rates: Record<string, number> = {};
    if (data) {
      for (const row of data as any[]) {
        // Map symbol to currency code
        if (row.symbol === "NZDUSD") rates["NZD"] = row.last_price;
        else if (row.symbol === "AUDUSD") rates["AUD"] = row.last_price;
        else if (row.symbol === "GBPUSD") rates["GBP"] = row.last_price;
        else if (row.symbol === "EURUSD") rates["EUR"] = row.last_price;
        else if (row.symbol === "USDJPY") rates["JPY"] = row.last_price;
      }
    }
    setFxRates(rates);
  };

  const loadSignals = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("signals")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (data) {
      setSignals(data as Signal[]);
      const syms = [...new Set(data.map((s: any) => s.symbol))];
      setInstruments(syms);
    }
  };

  const loadPrefs = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("user_signal_preferences")
      .select("currency, lot_size")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) {
      setCurrency((data as any).currency || "NZD");
      setLotSize((data as any).lot_size ?? 0.01);
    }
  };

  const savePrefs = async (newCurrency: string, newLotSize: number) => {
    setPrefsSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setPrefsSaving(false); return; }
    await supabase.from("user_signal_preferences").upsert({
      user_id: session.user.id,
      currency: newCurrency,
      lot_size: newLotSize,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setPrefsSaving(false);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Stats
  const stats = useMemo(() => {
    const resolved = signals.filter(s => s.result !== "pending");
    const wins = resolved.filter(s => s.result === "win");
    const losses = resolved.filter(s => s.result === "loss");
    const allTimePnlUsd = resolved.reduce((sum, s) => sum + pipToUsd(s.pnl_pips ?? 0, s.symbol, lotSize), 0);
    const allTimePnlCurrency = convertToDisplayCurrency(allTimePnlUsd, currency, fxRates);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthSignals = resolved.filter(s => new Date(s.resolved_at || s.created_at) >= monthStart);
    const monthPnlUsd = monthSignals.reduce((sum, s) => sum + pipToUsd(s.pnl_pips ?? 0, s.symbol, lotSize), 0);
    const monthPnlCurrency = convertToDisplayCurrency(monthPnlUsd, currency, fxRates);

    // Win rate: wins / (wins + losses) — exclude expired/pending
    const winsAndLosses = wins.length + losses.length;
    const winRate = winsAndLosses > 0 ? (wins.length / winsAndLosses) * 100 : 0;

    // Parse R:R strings like "2.1:1" and average them for resolved wins/losses
    const rrValues = resolved
      .filter(s => s.risk_reward)
      .map(s => {
        const match = s.risk_reward.match(/([\d.]+):\d/);
        return match ? parseFloat(match[1]) : 0;
      })
      .filter(v => v > 0);
    const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

    return { allTimePnlCurrency, monthPnlCurrency, winRate, totalSignals: signals.length, avgRR, wins: wins.length, losses: losses.length, resolved: resolved.length, winsAndLosses };
  }, [signals, lotSize, currency, fxRates]);

  // Filter
  const filtered = useMemo(() => {
    const now = new Date();
    return signals
      .filter(s => !filterInst || s.symbol === filterInst)
      .filter(s => !filterDir || s.direction === filterDir)
      .filter(s => !filterResult || s.result === filterResult)
      .filter(s => s.confidence >= minConf)
      .filter(s => {
        if (dateRange === "all") return true;
        const d = new Date(s.created_at);
        if (dateRange === "today") return d >= startOfDay(now);
        if (dateRange === "week") return d >= startOfWeek(now, { weekStartsOn: 1 });
        if (dateRange === "month") return d >= startOfMonth(now);
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "date") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        else if (sortKey === "instrument") cmp = a.symbol.localeCompare(b.symbol);
        else if (sortKey === "confidence") cmp = a.confidence - b.confidence;
        return sortDir === "desc" ? -cmp : cmp;
      });
  }, [signals, filterInst, filterDir, filterResult, minConf, dateRange, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ?
    (sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : null;

  const formatPrice = (v: number) => v >= 100 ? v.toLocaleString() : v.toFixed(4);

  const resultColor = (r: string, pnlPips?: number | null) => {
    if (r === "win") return C.green;
    if (r === "loss") return C.red;
    if (r === "expired") return (pnlPips ?? 0) >= 0 ? C.amber : C.muted;
    return C.amber;
  };

  const formatPnl = (s: Signal): { text: string; color: string } => {
    if (s.result === "pending") return { text: "Pending...", color: C.amber };
    const pips = s.pnl_pips ?? 0;
    const usdVal = pipToUsd(pips, s.symbol, lotSize);
    const displayVal = convertToDisplayCurrency(usdVal, currency, fxRates);
    const sign = pips >= 0 ? "+" : "";
    const currSymbol = currency === "JPY" ? "¥" : "$";
    if (s.result === "expired") {
      const color = pips >= 0 ? C.amber : C.muted;
      return { text: `EXPIRED (${sign}${pips.toFixed(1)} pips / ${currSymbol}${Math.abs(displayVal).toFixed(2)} ${currency})`, color };
    }
    const color = pips >= 0 ? C.green : C.red;
    return { text: `${sign}${pips.toFixed(1)} pips (${currSymbol}${Math.abs(displayVal).toFixed(2)} ${currency})`, color };
  };

  const hdr: React.CSSProperties = {
    fontSize: 11, color: C.sec, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: 1, padding: "10px 12px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>Signal History</h1>
      <p style={{ fontSize: 11, color: C.muted, marginBottom: 20, letterSpacing: 0.5 }}>Signals powered by <span style={{ color: C.jade, fontWeight: 600 }}>Falconer AI</span></p>

      {/* Performance Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatTile
          icon={<TrendingUp size={16} />}
          label="All-Time P&L"
          value={`${stats.allTimePnlCurrency >= 0 ? "+$" : "-$"}${Math.abs(stats.allTimePnlCurrency).toFixed(2)} ${currency}`}
          color={stats.allTimePnlCurrency >= 0 ? C.green : C.red}
          sub="Simulated — signal entry/TP/SL vs live"
        />
        <StatTile
          icon={<BarChart3 size={16} />}
          label="This Month P&L"
          value={`${stats.monthPnlCurrency >= 0 ? "+$" : "-$"}${Math.abs(stats.monthPnlCurrency).toFixed(2)} ${currency}`}
          color={stats.monthPnlCurrency >= 0 ? C.green : C.red}
          sub={format(new Date(), "MMMM yyyy")}
        />
        <StatTile
          icon={<Award size={16} />}
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? C.green : stats.winRate > 0 ? C.amber : C.muted}
          sub={`${stats.winsAndLosses} decided (${stats.resolved} resolved)`}
        />
        <StatTile
          icon={<Target size={16} />}
          label="Total Signals"
          value={String(stats.totalSignals)}
          color={C.jade}
          sub={`${signals.filter(s => s.result === "pending").length} pending`}
        />
        <StatTile
          icon={<TrendingDown size={16} />}
          label="Avg R:R Achieved"
          value={`${stats.avgRR.toFixed(1)}:1`}
          color={stats.avgRR >= 1.5 ? C.green : C.amber}
          sub="risk:reward"
        />
      </div>

      {/* Currency & Lot Size Settings */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center", marginBottom: 16,
        padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      }}>
        <DollarSign size={14} color={C.jade} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sec, textTransform: "uppercase", letterSpacing: 0.8 }}>P&L Settings</span>
        <select
          value={currency}
          onChange={e => { setCurrency(e.target.value); savePrefs(e.target.value, lotSize); }}
          style={selStyle}
        >
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 11, color: C.sec, fontWeight: 600 }}>Lot Size:</label>
        <input
          type="number"
          value={lotSize}
          min={0.01}
          step={0.01}
          onChange={e => {
            const v = parseFloat(e.target.value) || 0.01;
            setLotSize(v);
            savePrefs(currency, v);
          }}
          style={{ ...selStyle, width: 72, textAlign: "center" as const }}
        />
        {prefsSaving && <span style={{ fontSize: 10, color: C.muted }}>Saving...</span>}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Filter size={14} color={C.sec} />
        <select value={filterInst} onChange={e => setFilterInst(e.target.value)} style={selStyle}>
          <option value="">All Instruments</option>
          {instruments.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filterDir} onChange={e => setFilterDir(e.target.value)} style={selStyle}>
          <option value="">All Directions</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={selStyle}>
          <option value="">All Results</option>
          <option value="win">WIN</option>
          <option value="loss">LOSS</option>
          <option value="expired">EXPIRED</option>
          <option value="pending">PENDING</option>
        </select>
        <select value={minConf} onChange={e => setMinConf(Number(e.target.value))} style={selStyle}>
          <option value={0}>Min Confidence: Any</option>
          {[3, 5, 7].map(v => <option key={v} value={v}>≥ {v}</option>)}
        </select>
        <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRange)} style={selStyle}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            background: C.amber + "15", border: `1px solid ${C.amber}40`, borderRadius: 8,
            padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Settings size={14} color={C.amber} />
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>Alerts</span>
        </button>
      </div>

      {/* Signal Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 90px 60px 50px 80px 80px 80px 50px 80px 100px", borderBottom: `1px solid ${C.border}` }}>
          <div style={hdr} onClick={() => toggleSort("date")}>Date <SortIcon k="date" /></div>
          <div style={hdr} onClick={() => toggleSort("instrument")}>Instrument <SortIcon k="instrument" /></div>
          <div style={hdr}>Dir</div>
          <div style={hdr} onClick={() => toggleSort("confidence")}>Conf <SortIcon k="confidence" /></div>
          <div style={hdr}>Entry</div>
          <div style={hdr}>TP</div>
          <div style={hdr}>SL</div>
          <div style={hdr}>R:R</div>
          <div style={hdr}>Result</div>
          <div style={hdr}>P&L</div>
        </div>
        {filtered.map(s => {
          const pnlInfo = formatPnl(s);
          return (
            <div key={s.id}>
              <div
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                style={{
                  display: "grid", gridTemplateColumns: "140px 90px 60px 50px 80px 80px 80px 50px 80px 100px",
                  padding: 0, cursor: "pointer", borderBottom: `1px solid ${C.border}`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.cardH}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Cell mono>{format(new Date(s.created_at), "MMM d HH:mm")}</Cell>
                <Cell bold>{s.symbol}</Cell>
                <Cell><span style={{ color: s.direction === "BUY" ? C.green : C.red, fontWeight: 700 }}>{s.direction}</span></Cell>
                <Cell mono>{s.confidence}</Cell>
                <Cell mono>{formatPrice(s.entry_price)}</Cell>
                <Cell mono>{formatPrice(s.take_profit)}</Cell>
                <Cell mono>{formatPrice(s.stop_loss)}</Cell>
                <Cell mono>{s.risk_reward}</Cell>
                <Cell>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: resultColor(s.result) + "20",
                    color: resultColor(s.result),
                    textTransform: "uppercase",
                  }}>{s.result}</span>
                </Cell>
                <Cell mono style={{ color: pnlInfo.color, fontWeight: 600, fontSize: 11 }}>
                  {pnlInfo.text}
                </Cell>
              </div>
              {expanded === s.id && s.notes && (
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
                  <span style={{ color: C.jade, fontWeight: 600, fontSize: 12 }}>Notes: </span>
                  <span style={{ color: C.sec, fontSize: 12, lineHeight: 1.6 }}>{s.notes}</span>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No signals found.</div>
        )}
      </div>

      <SignalAlertSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ─── Stat Tile ─── */
function StatTile({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: string; color: string; sub: string;
}) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${color}30`, borderRadius: 12,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.sec, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
    </div>
  );
}

/* ─── Cell ─── */
function Cell({ children, mono, bold, style }: { children: React.ReactNode; mono?: boolean; bold?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: "10px 12px", fontSize: 12, color: C.text,
      fontFamily: mono ? "'JetBrains Mono', monospace" : "'DM Sans', sans-serif",
      fontWeight: bold ? 700 : 400, display: "flex", alignItems: "center",
      ...style,
    }}>
      {children}
    </div>
  );
}

const selStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "6px 10px", color: C.sec, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  outline: "none",
};
