import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";

const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text };

export default function AnalyticsPage() {
  const [byInstrument, setByInstrument] = useState<any[]>([]);
  const [byDay, setByDay] = useState<any[]>([]);
  const [stats, setStats] = useState<{ label: string; value: string; color: string }[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("user_id", session.user.id);
    if (!signals) return;

    const closed = signals.filter((s: any) => s.result !== "pending");

    // By instrument
    const instMap = new Map<string, { pnl: number; wins: number; losses: number }>();
    closed.forEach((s: any) => {
      const cur = instMap.get(s.symbol) || { pnl: 0, wins: 0, losses: 0 };
      cur.pnl += s.pnl || 0;
      if (s.result === "win") cur.wins++;
      else if (s.result === "loss") cur.losses++;
      instMap.set(s.symbol, cur);
    });
    setByInstrument(Array.from(instMap.entries()).map(([name, d]) => ({ name, ...d })));

    // By day of week
    const dayMap = new Map<string, number>();
    ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach(d => dayMap.set(d, 0));
    closed.forEach((s: any) => {
      if (s.closed_at) {
        const day = new Date(s.closed_at).toLocaleDateString("en-US", { weekday: "short" });
        dayMap.set(day, (dayMap.get(day) || 0) + (s.pnl || 0));
      }
    });
    setByDay(Array.from(dayMap.entries()).map(([name, pnl]) => ({ name, pnl })));

    // Stats
    const wins = closed.filter((s: any) => s.result === "win");
    const losses = closed.filter((s: any) => s.result === "loss");
    const totalPnl = closed.reduce((sum: number, s: any) => sum + (s.pnl || 0), 0);
    const avgWin = wins.length ? wins.reduce((s: number, w: any) => s + (w.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s: number, l: any) => s + (l.pnl || 0), 0) / losses.length) : 1;

    setStats([
      { label: "Total Trades", value: String(closed.length), color: C.purple },
      { label: "Win Rate", value: `${closed.length ? Math.round((wins.length / closed.length) * 100) : 0}%`, color: C.jade },
      { label: "Profit Factor", value: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "—", color: C.blue },
      { label: "Net P&L", value: `$${totalPnl.toLocaleString()}`, color: totalPnl >= 0 ? C.green : C.red },
      { label: "Avg Win", value: `$${Math.round(avgWin).toLocaleString()}`, color: C.green },
      { label: "Avg Loss", value: `-$${Math.round(avgLoss).toLocaleString()}`, color: C.red },
      { label: "Max Win Streak", value: String(getMaxStreak(closed, "win")), color: C.green },
      { label: "Expectancy", value: `$${closed.length ? Math.round(totalPnl / closed.length) : 0}/trade`, color: C.jade },
    ]);
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Analytics</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <ChartCard title="P&L by Instrument">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byInstrument}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                {byInstrument.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? C.jade : C.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="P&L by Day of Week">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                {byDay.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? C.jade : C.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {stats.map(s => (
          <StatBox key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>
    </div>
  );
}

function getMaxStreak(signals: any[], type: string): number {
  let max = 0, cur = 0;
  const sorted = [...signals].sort((a, b) => new Date(a.closed_at || a.created_at).getTime() - new Date(b.closed_at || b.created_at).getTime());
  sorted.forEach(s => {
    if (s.result === type) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  });
  return max;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
