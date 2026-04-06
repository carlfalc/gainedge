import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Signal {
  id: string; symbol: string; direction: string; confidence: number;
  entry_price: number; take_profit: number; stop_loss: number;
  risk_reward: string; result: string; pnl: number | null;
  notes: string | null; created_at: string;
}

type SortKey = "date" | "instrument" | "confidence";

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterInst, setFilterInst] = useState("");
  const [filterDir, setFilterDir] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<string[]>([]);

  useEffect(() => {
    loadSignals();
  }, []);

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = signals
    .filter(s => !filterInst || s.symbol === filterInst)
    .filter(s => !filterDir || s.direction === filterDir)
    .filter(s => s.confidence >= minConf)
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortKey === "instrument") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "confidence") cmp = a.confidence - b.confidence;
      return sortDir === "desc" ? -cmp : cmp;
    });

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ?
    (sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : null;

  const hdr: React.CSSProperties = { fontSize: 11, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  const formatPrice = (v: number) => v >= 100 ? v.toLocaleString() : v.toFixed(4);

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Signal History</h1>

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
        <select value={minConf} onChange={e => setMinConf(Number(e.target.value))} style={selStyle}>
          <option value={0}>Min Confidence: Any</option>
          {[3, 5, 7].map(v => <option key={v} value={v}>≥ {v}</option>)}
        </select>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 90px 60px 50px 80px 80px 80px 50px 70px 70px", borderBottom: `1px solid ${C.border}` }}>
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
        {filtered.map(s => (
          <div key={s.id}>
            <div
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              style={{
                display: "grid", gridTemplateColumns: "140px 90px 60px 50px 80px 80px 80px 50px 70px 70px",
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
                  background: s.result === "win" ? C.green + "20" : s.result === "loss" ? C.red + "20" : C.muted + "20",
                  color: s.result === "win" ? C.green : s.result === "loss" ? C.red : C.sec,
                  textTransform: "capitalize",
                }}>{s.result}</span>
              </Cell>
              <Cell mono style={{ color: (s.pnl ?? 0) >= 0 ? C.green : C.red }}>
                {s.pnl != null ? `${s.pnl >= 0 ? "+" : ""}$${s.pnl.toLocaleString()}` : "—"}
              </Cell>
            </div>
            {expanded === s.id && s.notes && (
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
                <span style={{ color: C.jade, fontWeight: 600, fontSize: 12 }}>Notes: </span>
                <span style={{ color: C.sec, fontSize: 12, lineHeight: 1.6 }}>{s.notes}</span>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No signals found.</div>
        )}
      </div>
    </div>
  );
}

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
