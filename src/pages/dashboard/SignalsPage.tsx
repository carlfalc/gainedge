import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface Trade {
  id: string; symbol: string; trigger_type: string; status: string;
  entry_price: number; sl_price: number; tp1_price: number; tp2_price: number; tp3_price: number;
  pnl_usd: number | null; opened_at: string; closed_at: string | null;
}

export default function SignalsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from("falconer_trades")
        .select("id,symbol,trigger_type,status,entry_price,sl_price,tp1_price,tp2_price,tp3_price,pnl_usd,opened_at,closed_at")
        .eq("user_id", session.user.id).eq("mode", "live")
        .order("opened_at", { ascending: false }).limit(100);
      setTrades((data ?? []) as unknown as Trade[]);
    };
    load();
    const ch = supabase.channel("falconer-trades-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "falconer_trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Falconer Trades · Live</h1>
      {trades.length === 0 ? (
        <p style={{ color: C.sec, fontSize: 13 }}>No live Falconer trades yet. Enable the engine on the Strategy page.</p>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <thead style={{ background: C.bg2, color: C.sec }}>
              <tr>
                <th style={th}>Opened</th><th style={th}>Symbol</th><th style={th}>Trigger</th>
                <th style={th}>Status</th><th style={th}>Entry</th><th style={th}>SL</th>
                <th style={th}>TP1/2/3</th><th style={th}>P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{new Date(t.opened_at).toLocaleString()}</td>
                  <td style={{ ...td, color: C.jade, fontWeight: 700 }}>{t.symbol}</td>
                  <td style={td}>{t.trigger_type}</td>
                  <td style={td}>{t.status}</td>
                  <td style={td}>{t.entry_price}</td>
                  <td style={{ ...td, color: C.red }}>{t.sl_price}</td>
                  <td style={{ ...td, color: C.jade }}>{t.tp1_price} / {t.tp2_price} / {t.tp3_price}</td>
                  <td style={{ ...td, color: (t.pnl_usd ?? 0) >= 0 ? C.jade : C.red }}>${(t.pnl_usd ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", color: "#E2E8F0" };
