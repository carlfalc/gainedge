import { useEffect, useMemo, useState } from "react";
import { BookOpen, Save } from "lucide-react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Trade {
  id: string;
  symbol: string;
  mode: string;
  trigger_type: string;
  status: string;
  setup_score: number | null;
  entry_price: number;
  exit_price: number | null;
  pnl_usd: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  tags: string[];
}

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [mode, setMode] = useState("all");

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("falconer_trades")
      .select("id,symbol,mode,trigger_type,status,setup_score,entry_price,exit_price,pnl_usd,opened_at,closed_at,notes,tags")
      .eq("user_id", session.user.id)
      .order("opened_at", { ascending: false })
      .limit(500);
    setTrades((data as unknown as Trade[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => mode === "all" ? trades : trades.filter(trade => trade.mode === mode), [trades, mode]);

  const choose = (trade: Trade) => {
    setSelected(trade);
    setNotes(trade.notes ?? "");
    setTags((trade.tags ?? []).join(", "));
  };

  const save = async () => {
    if (!selected) return;
    const nextTags = tags.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 12);
    const { error } = await supabase.from("falconer_trades")
      .update({ notes: notes.trim() || null, tags: nextTags })
      .eq("id", selected.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Journal updated");
      await load();
    }
  };

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <BookOpen size={24} style={{ color: C.jade }} />
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Falconer Journal</h1>
      </div>
      <p style={{ color: C.sec, fontSize: 13, marginBottom: 18 }}>Every live, dry-run and backtest trade in one reviewable record.</p>

      <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        {["all", "live", "dry_run", "backtest"].map(value => (
          <button key={value} onClick={() => setMode(value)} style={{
            ...filterButton,
            background: mode === value ? C.jade : C.bg2,
            color: mode === value ? "#020617" : C.sec,
          }}>{value.replace("_", " ")}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(300px,1fr)", gap: 16 }}>
        <div style={card}>
          {filtered.length === 0 ? <div style={{ color: C.sec }}>No Falconer trades yet.</div> : (
            <div style={{ overflowX: "auto", maxHeight: 670, overflowY: "auto" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Opened</th><th style={th}>Symbol</th><th style={th}>Mode</th>
                  <th style={th}>Trigger</th><th style={th}>Score</th><th style={th}>Status</th><th style={th}>P&L</th>
                </tr></thead>
                <tbody>{filtered.map(trade => (
                  <tr key={trade.id} onClick={() => choose(trade)} style={{
                    borderTop: `1px solid ${C.border}`,
                    background: selected?.id === trade.id ? `${C.jade}12` : "transparent",
                    cursor: "pointer",
                  }}>
                    <td style={td}>{new Date(trade.opened_at).toLocaleString()}</td>
                    <td style={{ ...td, color: C.jade, fontWeight: 700 }}>{trade.symbol}</td>
                    <td style={td}>{trade.mode}</td><td style={td}>{trade.trigger_type}</td>
                    <td style={td}>{trade.setup_score == null ? "—" : `${trade.setup_score}/100`}</td>
                    <td style={td}>{trade.status}</td>
                    <td style={{ ...td, color: Number(trade.pnl_usd ?? 0) >= 0 ? C.green : C.red }}>
                      {trade.pnl_usd == null ? "—" : `$${Number(trade.pnl_usd).toFixed(2)}`}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        <div style={card}>
          <h2 style={{ color: C.jade, fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Trade review</h2>
          {!selected ? <p style={{ color: C.sec, fontSize: 12 }}>Select a trade to add notes and tags.</p> : (
            <>
              <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
                <strong>{selected.symbol}</strong> · {selected.trigger_type}<br />
                Entry {selected.entry_price} · Exit {selected.exit_price ?? "open"}<br />
                {new Date(selected.opened_at).toLocaleString()}
              </div>
              <label style={label}>Notes</label>
              <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={10}
                placeholder="What happened? What did Falconer identify? What should be reviewed?"
                style={input} />
              <label style={label}>Tags</label>
              <input value={tags} onChange={event => setTags(event.target.value)}
                placeholder="clean setup, news risk, slippage" style={input} />
              <button onClick={save} style={saveButton}><Save size={14} /> Save review</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 };
const th: React.CSSProperties = { textAlign: "left", padding: 9, color: C.sec, position: "sticky", top: 0, background: C.card };
const td: React.CSSProperties = { padding: 9 };
const filterButton: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 11, cursor: "pointer", textTransform: "capitalize" };
const label: React.CSSProperties = { display: "block", color: C.sec, fontSize: 10, textTransform: "uppercase", margin: "10px 0 5px" };
const input: React.CSSProperties = { width: "100%", padding: 9, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, resize: "vertical" };
const saveButton: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginTop: 12, padding: "8px 12px", border: "none", borderRadius: 7, background: C.jade, color: "#020617", fontWeight: 800, cursor: "pointer" };
