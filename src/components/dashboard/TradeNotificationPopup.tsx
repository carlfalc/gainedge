import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface Notification {
  id: string;
  symbol: string;
  trigger_type: string;
  entry_price: number;
  sl_price: number;
  tp1_price: number;
  timestamp: string;
}

export default function TradeNotificationPopup() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const dismiss = useCallback((id: string) => setNotes(p => p.filter(n => n.id !== id)), []);

  useEffect(() => {
    const ch = supabase
      .channel("falconer-trade-popup")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "falconer_trades" },
        (payload: any) => {
          const row = payload.new;
          if (row.mode !== "live") return;
          setNotes(prev => [{
            id: row.id,
            symbol: row.symbol,
            trigger_type: row.trigger_type,
            entry_price: Number(row.entry_price),
            sl_price: Number(row.sl_price),
            tp1_price: Number(row.tp1_price),
            timestamp: row.opened_at,
          }, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (notes.length === 0) return null;

  return (
    <div style={{ position: "fixed", top: 70, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
      {notes.map(n => (
        <div key={n.id} style={{
          background: C.card, border: `1px solid ${C.jade}50`, borderLeft: `3px solid ${C.jade}`,
          borderRadius: 12, padding: "14px 16px", boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
          position: "relative", fontFamily: "'DM Sans', sans-serif",
        }}>
          <button onClick={() => dismiss(n.id)} style={{
            position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 6, padding: 4, cursor: "pointer", color: C.muted,
          }}><X size={14} /></button>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.jade, letterSpacing: 1, marginBottom: 6 }}>
            ⚡ FALCONER ENTRY · {n.trigger_type}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.jade }}>{n.symbol} BUY</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
            <span>Entry: <span style={{ color: C.text }}>{n.entry_price}</span></span>
            <span>TP1: <span style={{ color: C.jade }}>{n.tp1_price}</span></span>
            <span>SL: <span style={{ color: C.red }}>{n.sl_price}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}