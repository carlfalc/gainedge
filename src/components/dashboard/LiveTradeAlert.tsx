import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";

interface LiveScan {
  symbol: string;
  direction: string;
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  scanned_at: string;
}

export function LiveTradeAlert() {
  const [trade, setTrade] = useState<LiveScan | null>(null);
  const [pulse, setPulse] = useState(false);

  const loadLatest = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("scan_results")
      .select("symbol, direction, confidence, entry_price, take_profit, stop_loss, scanned_at")
      .eq("user_id", session.user.id)
      .gte("confidence", 7)
      .order("scanned_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setTrade(data[0] as LiveScan);
      triggerPulse();
    } else {
      setTrade(null);
    }
  };

  const triggerPulse = () => {
    setPulse(true);
    setTimeout(() => setPulse(false), 3000);
  };

  useEffect(() => {
    loadLatest();
    const channel = supabase.channel("live-trade-alert")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_results" }, (payload: any) => {
        if (payload.new.confidence >= 7) {
          setTrade(payload.new as LiveScan);
          triggerPulse();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const isBuy = trade?.direction === "BUY";
  const accentColor = trade ? (isBuy ? C.jade : C.red) : C.red;
  const time = trade ? new Date(trade.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${accentColor}40`,
      borderRadius: 14,
      padding: "14px 20px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: trade ? `0 0 30px ${accentColor}15, inset 0 0 60px ${accentColor}05` : "none",
      transition: "all 0.4s ease",
    }}>
      {/* Pulsing dot */}
      <div style={{ position: "relative", width: 14, height: 14, flexShrink: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%", background: C.red,
          position: "absolute", top: 2, left: 2,
        }} />
        {(pulse || trade) && (
          <div style={{
            width: 14, height: 14, borderRadius: "50%", background: `${C.red}40`,
            position: "absolute", top: 0, left: 0,
            animation: "livePulse 2s ease-in-out infinite",
          }} />
        )}
      </div>

      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>Live Trade</span>
      <span style={{ color: C.border, fontSize: 13 }}>|</span>

      {trade ? (
        <div style={{ fontSize: 12, color: C.sec, fontFamily: "'JetBrains Mono', monospace", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ color: C.muted }}>{time}</span>
          <span style={{ color: C.border }}>|</span>
          <span style={{ color: isBuy ? C.jade : C.red, fontWeight: 700 }}>{trade.symbol} {trade.direction}</span>
          <span style={{ color: C.border }}>|</span>
          <span>Entry: <span style={{ color: C.text }}>{trade.entry_price ?? "—"}</span></span>
          <span style={{ color: C.border }}>|</span>
          <span>TP: <span style={{ color: C.jade }}>{trade.take_profit ?? "—"}</span></span>
          <span style={{ color: C.border }}>|</span>
          <span>SL: <span style={{ color: C.red }}>{trade.stop_loss ?? "—"}</span></span>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
          Monitoring... waiting for high-conviction setup
        </span>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
