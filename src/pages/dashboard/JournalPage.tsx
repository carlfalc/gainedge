import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JournalEntry {
  id: string; entry_date: string; session_summary: string | null;
  notes: string | null; tags: string[]; mood: string | null;
}

interface DaySignals {
  pnl: number; wins: number; losses: number;
  trades: { symbol: string; pnl: number; direction: string }[];
}

export default function JournalPage() {
  const [date, setDate] = useState(new Date());
  const [newNote, setNewNote] = useState("");
  const [summary, setSummary] = useState("");
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [dayData, setDayData] = useState<DaySignals | null>(null);
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (userId) loadDay();
  }, [date, userId]);

  const loadDay = async () => {
    if (!userId) return;
    const dateKey = format(date, "yyyy-MM-dd");

    // Load journal entry
    const { data: jData } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", dateKey)
      .maybeSingle();
    setJournal(jData as JournalEntry | null);
    if (jData) {
      setNewNote(jData.notes || "");
      setSummary(jData.session_summary || "");
    } else {
      setNewNote("");
      setSummary("");
    }

    // Load signals for this day
    const startOfDay = `${dateKey}T00:00:00Z`;
    const endOfDay = `${dateKey}T23:59:59Z`;
    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("user_id", userId)
      .gte("closed_at", startOfDay)
      .lte("closed_at", endOfDay);

    if (signals && signals.length > 0) {
      const wins = signals.filter((s: any) => s.result === "win").length;
      const losses = signals.filter((s: any) => s.result === "loss").length;
      const pnl = signals.reduce((sum: number, s: any) => sum + (s.pnl || 0), 0);
      setDayData({
        pnl, wins, losses,
        trades: signals.map((s: any) => ({ symbol: s.symbol, pnl: s.pnl || 0, direction: s.direction })),
      });
    } else {
      setDayData(null);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    const dateKey = format(date, "yyyy-MM-dd");

    if (journal) {
      await supabase.from("journal_entries").update({
        notes: newNote,
        session_summary: summary,
      }).eq("id", journal.id);
    } else {
      await supabase.from("journal_entries").insert({
        user_id: userId,
        entry_date: dateKey,
        notes: newNote,
        session_summary: summary,
        tags: [],
      });
    }
    toast.success("Journal saved");
    loadDay();
  };

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Trade Journal</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => setDate(d => subDays(d, 1))} style={navBtn}><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono', monospace", minWidth: 160, textAlign: "center" }}>
          {format(date, "EEEE, MMM d, yyyy")}
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} style={navBtn}><ChevronRight size={16} /></button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Session Summary</div>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Summarize your trading session..."
          style={{ ...textareaStyle, minHeight: 40, marginBottom: 8 }}
        />
        {dayData && (
          <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
            <Stat label="P&L" value={`$${dayData.pnl.toLocaleString()}`} color={dayData.pnl >= 0 ? C.green : C.red} />
            <Stat label="Wins" value={String(dayData.wins)} color={C.green} />
            <Stat label="Losses" value={String(dayData.losses)} color={C.red} />
          </div>
        )}
      </div>

      {dayData && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Trades</div>
          {dayData.trades.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < dayData.trades.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{t.symbol}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.direction === "BUY" ? C.green : C.red, padding: "2px 6px", borderRadius: 4, background: (t.direction === "BUY" ? C.green : C.red) + "20" }}>{t.direction}</span>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: t.pnl >= 0 ? C.green : C.red }}>
                {t.pnl >= 0 ? "+" : ""}${t.pnl.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {journal?.tags && journal.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {journal.tags.map(tag => (
            <span key={tag} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.jade + "18", color: C.jade }}>{tag}</span>
          ))}
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 12, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notes & Reflections</div>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note for this day..."
          style={textareaStyle}
        />
        <button onClick={handleSave} style={{
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

const textareaStyle: React.CSSProperties = {
  width: "100%", minHeight: 80, borderRadius: 10, border: `1px solid ${C.border}`,
  background: C.bg, color: C.text, padding: 12, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  resize: "vertical", outline: "none",
};
