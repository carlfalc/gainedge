import { useEffect, useState } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Loader2 } from "lucide-react";

interface SessionRow {
  session: string;
  total: number;
  filled: number;
  failed: number;
  win_rate_label: string;
}

const SESSION_LABELS: Record<string, { label: string; color: string }> = {
  asian: { label: "🌏 Asian", color: "#34D399" },
  london: { label: "🇬🇧 London", color: "#3B82F6" },
  ny: { label: "🇺🇸 New York", color: "#FDE047" },
  "london+ny": { label: "🇬🇧🇺🇸 London / NY Overlap", color: "#A78BFA" },
};

export default function AdminSessionPerformance() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    // Pull executions tagged with session over the last 30 days
    const { data: execs } = await supabase
      .from("auto_trade_executions")
      .select("session, status, signal_id")
      .gte("created_at", since)
      .not("session", "is", null);

    if (!execs) { setRows([]); setLoading(false); return; }

    // Resolve outcomes for the linked signals (WIN/LOSS) — joined manually
    const signalIds = Array.from(new Set(execs.map(e => e.signal_id).filter(Boolean))) as string[];
    let outcomesById: Record<string, string> = {};
    if (signalIds.length > 0) {
      const { data: outs } = await supabase
        .from("signal_outcomes")
        .select("signal_id, result")
        .in("signal_id", signalIds);
      for (const o of outs ?? []) {
        if (o.signal_id) outcomesById[o.signal_id as string] = (o.result as string) || "";
      }
    }

    const buckets = new Map<string, { total: number; wins: number; losses: number; filled: number; failed: number }>();
    for (const e of execs) {
      const key = (e.session || "off-hours").toLowerCase();
      const b = buckets.get(key) ?? { total: 0, wins: 0, losses: 0, filled: 0, failed: 0 };
      b.total++;
      if (e.status === "filled") b.filled++;
      if (e.status === "failed") b.failed++;
      const outcome = e.signal_id ? outcomesById[e.signal_id as string] : null;
      if (outcome === "WIN") b.wins++;
      else if (outcome === "LOSS") b.losses++;
      buckets.set(key, b);
    }

    const list: SessionRow[] = Array.from(buckets.entries()).map(([session, b]) => {
      const resolved = b.wins + b.losses;
      const wr = resolved > 0 ? Math.round((b.wins / resolved) * 100) : null;
      return {
        session,
        total: b.total,
        filled: b.filled,
        failed: b.failed,
        win_rate_label: wr !== null ? `${wr}% (${b.wins}W / ${b.losses}L)` : "—",
      };
    }).sort((a, b) => b.total - a.total);

    setRows(list);
    setLoading(false);
  };

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 20, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <BarChart3 size={16} color={C.amber} />
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Session Performance (last 30 days)</div>
        <div style={{ fontSize: 11, color: C.sec, marginLeft: "auto" }}>auto-trade executions tagged by session</div>
      </div>

      {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.sec }}><Loader2 size={14} className="animate-spin" /> Loading…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ fontSize: 12, color: C.sec }}>No tagged executions yet — sessions are recorded on every new auto-trade.</div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", rowGap: 8, columnGap: 16, fontSize: 12 }}>
          <div style={{ color: C.sec, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Session</div>
          <div style={{ color: C.sec, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Total</div>
          <div style={{ color: C.sec, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Filled</div>
          <div style={{ color: C.sec, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Failed</div>
          <div style={{ color: C.sec, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Win Rate</div>

          {rows.map(r => {
            const meta = SESSION_LABELS[r.session] ?? { label: r.session, color: C.sec };
            return (
              <>
                <div key={r.session + "-l"} style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</div>
                <div key={r.session + "-t"} style={{ color: C.text, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{r.total}</div>
                <div key={r.session + "-f"} style={{ color: C.jade, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{r.filled}</div>
                <div key={r.session + "-x"} style={{ color: C.red, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{r.failed}</div>
                <div key={r.session + "-w"} style={{ color: C.text, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{r.win_rate_label}</div>
              </>
            );
          })}
        </div>
      )}
    </div>
  );
}
