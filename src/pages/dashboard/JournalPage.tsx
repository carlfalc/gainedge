import { useState } from "react";
import { C, CALENDAR_DATA, JOURNAL_ENTRIES } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, addDays, subDays } from "date-fns";

export default function JournalPage() {
  const [date, setDate] = useState(new Date(2026, 3, 5)); // Apr 5
  const [newNote, setNewNote] = useState("");
  const dateKey = format(date, "yyyy-MM-dd");
  const dayData = CALENDAR_DATA[dateKey];
  const journal = JOURNAL_ENTRIES[dateKey];

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Trade Journal</h1>

      {/* Date picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => setDate(d => subDays(d, 1))} style={navBtn}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono', monospace", minWidth: 160, textAlign: "center" }}>
          {format(date, "EEEE, MMM d, yyyy")}
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} style={navBtn}><ChevronRight size={16} /></button>
      </div>

      {/* Session Summary */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Session Summary</div>
        {journal ? (
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{journal.summary}</div>
        ) : (
          <div style={{ fontSize: 13, color: C.muted }}>No journal entry for this day.</div>
        )}
        {dayData && (
          <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
            <Stat label="P&L" value={`$${dayData.pnl.toLocaleString()}`} color={dayData.pnl >= 0 ? C.green : C.red} />
            <Stat label="Wins" value={String(dayData.wins)} color={C.green} />
            <Stat label="Losses" value={String(dayData.losses)} color={C.red} />
          </div>
        )}
      </div>

      {/* Trades */}
      {dayData && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Trades</div>
          {dayData.trades.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < dayData.trades.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.instrument}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.direction === "BUY" ? C.green : C.red, padding: "2px 6px", borderRadius: 4, background: (t.direction === "BUY" ? C.green : C.red) + "20" }}>{t.direction}</span>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: t.pnl >= 0 ? C.green : C.red }}>
                {t.pnl >= 0 ? "+" : ""}${t.pnl.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {journal?.tags && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {journal.tags.map(tag => (
            <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.jade + "18", color: C.jade }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Notes */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notes & Reflections</div>
        {journal?.notes ? (
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 16 }}>{journal.notes}</div>
        ) : null}
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note for this day..."
          style={{
            width: "100%", minHeight: 80, borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.bg, color: C.text, padding: 12, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
            resize: "vertical", outline: "none",
          }}
          onFocus={e => e.target.style.borderColor = C.jade + "60"}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        <button style={{
          marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
          borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
          background: C.jade, color: C.bg, fontFamily: "'DM Sans', sans-serif",
        }}>
          <Plus size={14} /> Save Note
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color }}>{value}</div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: 8, cursor: "pointer", color: C.sec, display: "flex",
};
