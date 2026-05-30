import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, TrendingUp, Target, Layers } from "lucide-react";

interface TradeRow {
  id: string;
  symbol: string;
  status: string;
  trigger_type: string | null;
  entry_price: number | null;
  exit_price: number | null;
  pnl_usd: number | null;
  features: any;
  opened_at: string | null;
  closed_at: string | null;
}

const CLOSED = ["closed_tp3", "closed_sl", "closed_ha_flip"];

const cardStyle: React.CSSProperties = {
  background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20,
};
const labelStyle: React.CSSProperties = {
  color: C.text, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
};

// A Falconer trade is long-only: a win is an exit above entry. Fall back to pnl sign.
function isWin(t: TradeRow): boolean {
  if (t.exit_price != null && t.entry_price != null) return Number(t.exit_price) > Number(t.entry_price);
  if (t.pnl_usd != null) return Number(t.pnl_usd) > 0;
  return t.status === "closed_tp3";
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase
        .from("falconer_trades")
        .select("id, symbol, status, trigger_type, entry_price, exit_price, pnl_usd, features, opened_at, closed_at")
        .eq("user_id", session.user.id)
        .in("status", CLOSED)
        .order("closed_at", { ascending: false })
        .limit(2000);
      setTrades((data as TradeRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter(isWin).length;
    const losses = total - wins;
    const pnlTrades = trades.filter(t => t.pnl_usd != null && Number(t.pnl_usd) !== 0);
    const netPnl = pnlTrades.reduce((a, t) => a + Number(t.pnl_usd), 0);
    const grossWin = pnlTrades.filter(t => Number(t.pnl_usd) > 0).reduce((a, t) => a + Number(t.pnl_usd), 0);
    const grossLoss = Math.abs(pnlTrades.filter(t => Number(t.pnl_usd) < 0).reduce((a, t) => a + Number(t.pnl_usd), 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : 0;

    // Breakdowns
    const by = (key: (t: TradeRow) => string | null | undefined) => {
      const m = new Map<string, { n: number; w: number }>();
      for (const t of trades) {
        const k = key(t) || "—";
        const e = m.get(k) || { n: 0, w: 0 };
        e.n++; if (isWin(t)) e.w++;
        m.set(k, e);
      }
      return Array.from(m.entries())
        .map(([k, v]) => ({ key: k, n: v.n, w: v.w, rate: v.n ? v.w / v.n : 0 }))
        .sort((a, b) => b.n - a.n);
    };

    return {
      total, wins, losses, netPnl, profitFactor, hasPnl: pnlTrades.length > 0,
      byTrigger: by(t => t.trigger_type),
      bySymbol: by(t => t.symbol),
      bySession: by(t => t.features?.session),
    };
  }, [trades]);

  const Kpi = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: color || C.text }}>{value}</div>
    </div>
  );

  const Breakdown = ({ title, icon, rows }: { title: string; icon: any; rows: { key: string; n: number; w: number; rate: number }[] }) => {
    const Icon = icon;
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Icon size={16} style={{ color: C.jade }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ color: C.sec, fontSize: 13 }}>No closed trades yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(r => (
              <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{r.key}</span>
                  <span style={{ color: C.sec }}>{r.n} trades · <span style={{ color: r.rate >= 0.5 ? C.green : C.red }}>{pct(r.w, r.n)} win</span></span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(r.rate * 100)}%`, height: "100%", background: r.rate >= 0.5 ? C.green : C.red }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <BarChart3 size={26} style={{ color: C.jade }} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Analytics</h1>
          <p style={{ color: C.sec, fontSize: 13 }}>Performance across your closed Falconer trades</p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: C.sec, fontSize: 13 }}>Loading…</div>
      ) : stats.total === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No closed trades yet</div>
          <div style={{ color: C.sec, fontSize: 13 }}>Analytics populate automatically as the Falconer strategy closes trades.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
            <Kpi label="Total Trades" value={String(stats.total)} />
            <Kpi label="Win Rate" value={pct(stats.wins, stats.total)} color={stats.wins / stats.total >= 0.5 ? C.green : C.amber} />
            <Kpi label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
            {stats.hasPnl && <Kpi label="Net P&L (USD)" value={`$${stats.netPnl.toFixed(0)}`} color={stats.netPnl >= 0 ? C.green : C.red} />}
            {stats.hasPnl && <Kpi label="Profit Factor" value={stats.profitFactor ? stats.profitFactor.toFixed(2) : "—"} />}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <Breakdown title="By Trigger" icon={Target} rows={stats.byTrigger} />
            <Breakdown title="By Instrument" icon={Layers} rows={stats.bySymbol} />
            <Breakdown title="By Session" icon={TrendingUp} rows={stats.bySession} />
          </div>
        </>
      )}
    </div>
  );
}
