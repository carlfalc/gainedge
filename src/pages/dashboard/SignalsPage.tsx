import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface Trade {
  id: string; symbol: string; trigger_type: string; status: string;
  entry_price: number; sl_price: number; tp1_price: number; tp2_price: number; tp3_price: number;
  pnl_usd: number | null; opened_at: string; closed_at: string | null;
}

/** Plain-English governance qualifier — records only, never order placement. */
export const SIGNAL_RECORDS_QUALIFIER =
  "These are stored Falconer signal and history records for review only. They do not represent orders placed with your broker.";

export default function SignalsPage() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Distinguishes the first fetch from background realtime refreshes.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setTrades([]);
        setError("You need to be signed in to view signal records.");
        return;
      }
      const { data, error: qErr } = await supabase.from("falconer_trades")
        .select("id,symbol,trigger_type,status,entry_price,sl_price,tp1_price,tp2_price,tp3_price,pnl_usd,opened_at,closed_at")
        .eq("user_id", session.user.id).eq("mode", "live")
        .order("opened_at", { ascending: false }).limit(100);
      if (qErr) {
        setError(qErr.message || "Could not load signal records.");
        return;
      }
      setError(null);
      setTrades((data ?? []) as unknown as Trade[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load signal records.");
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("falconer-trades-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "falconer_trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Falconer Signal Records</h1>
      <p style={{ color: C.sec, fontSize: 12, marginBottom: 16, maxWidth: 720, lineHeight: 1.5 }}>
        {SIGNAL_RECORDS_QUALIFIER}
      </p>

      {error && (
        <div
          role="alert"
          style={{
            border: `1px solid ${C.red}55`, background: `${C.red}12`, color: C.red,
            borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 16,
          }}
        >
          <strong style={{ fontWeight: 700 }}>Couldn’t load signal records.</strong>{" "}
          <span style={{ color: C.sec }}>{error}</span>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.sec, fontSize: 13 }}>Loading signal records…</p>
      ) : trades.length === 0 && !error ? (
        <div style={{ color: C.sec, fontSize: 13 }}>
          <p style={{ marginBottom: 10 }}>No Falconer signal records yet.</p>
          <button
            onClick={() => navigate("/dashboard/strategy")}
            style={{
              background: "transparent", border: `1px solid ${C.border}`, color: C.jade,
              borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Open Strategy settings
          </button>
        </div>
      ) : trades.length > 0 ? (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflowX: "auto", maxWidth: "100%" }}>
          <table style={{ width: "100%", minWidth: 860, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
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
      ) : null}
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px", color: "#E2E8F0" };
