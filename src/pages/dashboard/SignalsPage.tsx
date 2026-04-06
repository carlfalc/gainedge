import { useState } from "react";
import { C, SIGNAL_HISTORY } from "@/lib/mock-data";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";

type SortKey = "date" | "instrument" | "confidence" | "pnl";

export default function SignalsPage() {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterInst, setFilterInst] = useState("");
  const [filterDir, setFilterDir] = useState("");
  const [minConf, setMinConf] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = SIGNAL_HISTORY
    .filter(s => !filterInst || s.instrument === filterInst)
    .filter(s => !filterDir || s.direction === filterDir)
    .filter(s => s.confidence >= minConf)
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "instrument") cmp = a.instrument.localeCompare(b.instrument);
      else if (sortKey === "confidence") cmp = a.confidence - b.confidence;
      else cmp = 0;
      return sortDir === "desc" ? -cmp : cmp;
    });

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ?
    (sortDir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : null;

  const hdr: React.CSSProperties = { fontSize: 11, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Signal History</h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Filter size={14} color={C.sec} />
        <select value={filterInst} onChange={e => setFilterInst(e.target.value)} style={selStyle}>
          <option value="">All Instruments</option>
          {["NAS100", "US30", "AUDUSD", "NZDUSD", "XAUUSD"].map(i => <option key={i} value={i}>{i}</option>)}
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

      {/* Table */}
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
              <Cell mono>{s.date}</Cell>
              <Cell bold>{s.instrument}</Cell>
              <Cell><span style={{ color: s.direction === "BUY" ? C.green : C.red, fontWeight: 700 }}>{s.direction}</span></Cell>
              <Cell mono>{s.confidence}</Cell>
              <Cell mono>{s.entry}</Cell>
              <Cell mono>{s.tp}</Cell>
              <Cell mono>{s.sl}</Cell>
              <Cell mono>{s.rr}</Cell>
              <Cell>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: s.outcome === "Win" ? C.green + "20" : s.outcome === "Loss" ? C.red + "20" : C.muted + "20",
                  color: s.outcome === "Win" ? C.green : s.outcome === "Loss" ? C.red : C.sec,
                }}>{s.outcome}</span>
              </Cell>
              <Cell mono style={{ color: s.pnl.startsWith("+") ? C.green : s.pnl.startsWith("-") ? C.red : C.sec }}>{s.pnl}</Cell>
            </div>
            {expanded === s.id && (
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
                <span style={{ color: C.jade, fontWeight: 600, fontSize: 12 }}>AI Reasoning: </span>
                <span style={{ color: C.sec, fontSize: 12, lineHeight: 1.6 }}>{s.reasoning}</span>
              </div>
            )}
          </div>
        ))}
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
