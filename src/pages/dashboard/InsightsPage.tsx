import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, CalendarDays, Clock, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface Trade {
  id: string;
  symbol: string;
  trigger_type: string;
  status: string;
  pnl_usd: number | null;
  setup_score: number | null;
  features: { session?: string; day_of_week?: number } | null;
  opened_at: string;
}

interface Bucket {
  key: string;
  trades: number;
  wins: number;
  pnl: number;
  avgScore: number | null;
}

interface EngineEvent {
  id: string;
  symbol: string | null;
  event_type: string;
  severity: string;
  message: string;
  context: unknown;
  created_at: string;
}

const CLOSED = ["closed_tp3", "closed_sl", "closed_ha_flip"];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function group(trades: Trade[], keyOf: (trade: Trade) => string): Bucket[] {
  const buckets = new Map<string, { trades: number; wins: number; pnl: number; scoreTotal: number; scoreN: number }>();
  for (const trade of trades) {
    const key = keyOf(trade) || "Unknown";
    const row = buckets.get(key) ?? { trades: 0, wins: 0, pnl: 0, scoreTotal: 0, scoreN: 0 };
    row.trades += 1;
    row.pnl += Number(trade.pnl_usd ?? 0);
    if (Number(trade.pnl_usd ?? 0) > 0) row.wins += 1;
    if (trade.setup_score != null) {
      row.scoreTotal += Number(trade.setup_score);
      row.scoreN += 1;
    }
    buckets.set(key, row);
  }
  return [...buckets.entries()].map(([key, value]) => ({
    key,
    trades: value.trades,
    wins: value.wins,
    pnl: value.pnl,
    avgScore: value.scoreN ? value.scoreTotal / value.scoreN : null,
  })).sort((a, b) => b.trades - a.trades);
}

export default function InsightsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const [{ data: tradeRows }, { data: eventRows }] = await Promise.all([
        supabase.from("falconer_trades")
          .select("id,symbol,trigger_type,status,pnl_usd,setup_score,features,opened_at")
          .eq("user_id", session.user.id)
          .in("status", CLOSED)
          .order("opened_at", { ascending: false })
          .limit(3000),
        supabase.from("falconer_engine_events")
          .select("id,symbol,event_type,severity,message,context,created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      setTrades((tradeRows as unknown as Trade[]) ?? []);
      setEvents((eventRows as EngineEvent[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const insights = useMemo(() => ({
    bySymbol: group(trades, trade => trade.symbol),
    byTrigger: group(trades, trade => trade.trigger_type),
    bySession: group(trades, trade => String(trade.features?.session ?? "Unknown")),
    byDay: group(trades, trade => dayNames[Number(trade.features?.day_of_week)] ?? "Unknown"),
  }), [trades]);

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <Brain size={25} style={{ color: C.jade }} />
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Falconer Intelligence</h1>
      </div>
      <p style={{ color: C.sec, fontSize: 13, marginBottom: 20 }}>
        Calculated from your completed Falconer trades. No demo win rates or invented recommendations.
      </p>

      {loading ? <div style={{ color: C.sec }}>Loading evidence…</div> : trades.length === 0 ? (
        <div style={card}>No completed trades yet. Insights will appear after Falconer has measurable outcomes.</div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 16, borderColor: trades.length < 30 ? `${C.amber}55` : `${C.jade}55` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: trades.length < 30 ? C.amber : C.jade, fontWeight: 800, fontSize: 13 }}>
              {trades.length < 30 ? <AlertTriangle size={16} /> : <Target size={16} />}
              {trades.length} completed trades
            </div>
            <p style={{ color: C.sec, fontSize: 12, marginTop: 7 }}>
              {trades.length < 30
                ? "Results are preliminary. GainEdge will avoid treating small samples as a proven edge."
                : "The sample is large enough for initial comparisons, but walk-forward validation is still required."}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 16 }}>
            <Breakdown title="By instrument" icon={Target} rows={insights.bySymbol} />
            <Breakdown title="By trigger" icon={Brain} rows={insights.byTrigger} />
            <Breakdown title="By session" icon={Clock} rows={insights.bySession} />
            <Breakdown title="By weekday (UTC)" icon={CalendarDays} rows={insights.byDay} />
          </div>
        </>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 800, margin: "24px 0 10px" }}>Engine observations</h2>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
        {events.length === 0 ? <span style={{ color: C.sec, fontSize: 12 }}>No engine observations yet.</span> : events.map(event => (
          <div key={event.id} style={{ padding: 9, borderRadius: 7, background: C.bg2, fontSize: 12 }}>
            <span style={{ color: event.severity === "error" ? C.red : event.severity === "warning" ? C.amber : C.jade, fontWeight: 700 }}>
              {event.symbol ? `${event.symbol} · ` : ""}{event.event_type}
            </span>
            <span style={{ color: C.sec }}> — {event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Breakdown({ title, icon: Icon, rows }: { title: string; icon: import("lucide-react").LucideIcon; rows: Bucket[] }) {
  return <div style={card}>
    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 12 }}>
      <Icon size={15} style={{ color: C.jade }} /><strong style={{ fontSize: 13 }}>{title}</strong>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map(row => {
        const winRate = row.trades ? row.wins / row.trades * 100 : 0;
        return <div key={row.key} style={{ padding: 9, borderRadius: 7, background: C.bg2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <strong>{row.key}</strong>
            <span style={{ color: C.sec }}>{row.trades} trades · {winRate.toFixed(0)}% wins</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 5 }}>
            <span style={{ color: row.pnl >= 0 ? C.green : C.red }}>${row.pnl.toFixed(2)}</span>
            <span style={{ color: C.muted }}>{row.avgScore == null ? "No setup score" : `Avg score ${row.avgScore.toFixed(0)}`}</span>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

const card: React.CSSProperties = { padding: 16, borderRadius: 10, background: C.card, border: `1px solid ${C.border}` };
