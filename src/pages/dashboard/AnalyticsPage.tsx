import { C } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";

const byInstrument = [
  { name: "NAS100", pnl: 2580, wins: 8, losses: 2 },
  { name: "US30", pnl: 1100, wins: 5, losses: 2 },
  { name: "AUDUSD", pnl: 700, wins: 4, losses: 1 },
  { name: "NZDUSD", pnl: 275, wins: 2, losses: 2 },
  { name: "XAUUSD", pnl: 505, wins: 3, losses: 3 },
];

const bySession = [
  { name: "London", pnl: 2800, winRate: 78 },
  { name: "New York", pnl: 1600, winRate: 65 },
  { name: "London/NY", pnl: 560, winRate: 80 },
  { name: "Asian", pnl: 200, winRate: 50 },
];

const byDay = [
  { name: "Mon", pnl: 1200 }, { name: "Tue", pnl: 800 }, { name: "Wed", pnl: -200 },
  { name: "Thu", pnl: 1400 }, { name: "Fri", pnl: 1960 },
];

const winRateOverTime = [
  { week: "W1", rate: 65 }, { week: "W2", rate: 72 }, { week: "W3", rate: 68 },
  { week: "W4", rate: 75 }, { week: "W5", rate: 70 },
];

const tooltipStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text };

export default function AnalyticsPage() {
  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 20 }}>Analytics</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* By Instrument */}
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

        {/* By Session */}
        <ChartCard title="P&L by Session">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bySession}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pnl" fill={C.blue} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* By Day */}
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

        {/* Win Rate Over Time */}
        <ChartCard title="Win Rate Over Time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={winRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="week" tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: C.sec, fontSize: 11 }} axisLine={false} domain={[50, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="rate" stroke={C.jade} strokeWidth={2} dot={{ fill: C.jade, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatBox label="Best Setup" value="EMA Cross + London" color={C.jade} />
        <StatBox label="Worst Setup" value="Counter-trend Asian" color={C.red} />
        <StatBox label="Avg Hold Time" value="47 min" color={C.blue} />
        <StatBox label="Max Win Streak" value="5 trades" color={C.green} />
        <StatBox label="Max Loss Streak" value="2 trades" color={C.red} />
        <StatBox label="Total Trades" value="30" color={C.purple} />
        <StatBox label="Avg R-Multiple" value="1.6R" color={C.orange} />
        <StatBox label="Expectancy" value="$172/trade" color={C.jade} />
      </div>
    </div>
  );
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
