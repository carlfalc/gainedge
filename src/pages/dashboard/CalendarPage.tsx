import { useState } from "react";
import { C, CALENDAR_DATA } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date(2026, 3, 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start); // 0=Sun

  // Monthly stats
  let totalPnl = 0, totalWins = 0, totalLosses = 0;
  days.forEach(d => {
    const key = format(d, "yyyy-MM-dd");
    const data = CALENDAR_DATA[key];
    if (data) {
      totalPnl += data.pnl;
      totalWins += data.wins;
      totalLosses += data.losses;
    }
  });
  const winRate = totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;

  const selectedData = selectedDay ? CALENDAR_DATA[selectedDay] : null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>P&L Calendar</h1>

      {/* Month Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => setMonth(m => subMonths(m, 1))} style={navBtn}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{format(month, "MMMM yyyy")}</div>
        <button onClick={() => setMonth(m => addMonths(m, 1))} style={navBtn}><ChevronRight size={16} /></button>
      </div>

      {/* Monthly Stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <MiniStat label="Net P&L" value={`$${totalPnl.toLocaleString()}`} color={totalPnl >= 0 ? C.green : C.red} />
        <MiniStat label="Wins" value={String(totalWins)} color={C.green} />
        <MiniStat label="Losses" value={String(totalLosses)} color={C.red} />
        <MiniStat label="Win Rate" value={`${winRate}%`} color={C.jade} />
      </div>

      {/* Calendar Grid */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ fontSize: 10, fontWeight: 600, color: C.muted, textAlign: "center", padding: 6 }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map(d => {
            const key = format(d, "yyyy-MM-dd");
            const data = CALENDAR_DATA[key];
            const isSelected = selectedDay === key;
            return (
              <div
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                style={{
                  aspectRatio: "1", borderRadius: 10, cursor: data ? "pointer" : "default",
                  background: data ? (data.pnl >= 0 ? C.green + "14" : C.red + "14") : "rgba(255,255,255,0.02)",
                  border: isSelected ? `2px solid ${C.jade}` : `1px solid ${C.border}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{format(d, "d")}</div>
                {data && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    color: data.pnl >= 0 ? C.green : C.red, marginTop: 2,
                  }}>
                    {data.pnl >= 0 ? "+" : ""}${Math.abs(data.pnl)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedData && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
            {selectedDay && format(new Date(selectedDay + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          </div>
          {selectedData.trades.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < selectedData.trades.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.instrument}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.direction === "BUY" ? C.green : C.red }}>{t.direction}</span>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: t.pnl >= 0 ? C.green : C.red }}>
                {t.pnl >= 0 ? "+" : ""}${t.pnl.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", flex: 1 }}>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: 8, cursor: "pointer", color: C.sec, display: "flex",
};
