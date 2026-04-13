import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

function fireBrowserNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch (_) { /* mobile browsers may throw */ }
  }
}

interface Notification {
  id: string;
  type: "signal" | "live_trade";
  symbol: string;
  direction: string;
  confidence: number;
  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;
  timestamp: string;
}

export default function TradeNotificationPopup() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const pushEnabledRef = useRef(false);

  // Load user's push notification preference
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("profiles").select("push_notifications").eq("id", session.user.id).single().then(({ data }) => {
        if (data) pushEnabledRef.current = data.push_notifications;
      });
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setTimeout(() => {
      setNotifications((prev) => prev.slice(1));
    }, 15000);
    return () => clearTimeout(timer);
  }, [notifications]);

  useEffect(() => {
    let userId: string | null = null;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      userId = session.user.id;
    };

    init();

    // Listen for new high-confidence scan results (live trades)
    const scanChannel = supabase
      .channel("trade-popup-scans")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scan_results" },
        (payload: any) => {
          const row = payload.new;
          if (row.confidence >= 7) {
            const notif: Notification = {
              id: row.id || crypto.randomUUID(),
              type: "live_trade",
              symbol: row.symbol,
              direction: row.direction,
              confidence: row.confidence,
              entry_price: row.entry_price,
              take_profit: row.take_profit,
              stop_loss: row.stop_loss,
              timestamp: row.scanned_at,
            };
            setNotifications((prev) => [notif, ...prev].slice(0, 5));
            if (pushEnabledRef.current) {
              fireBrowserNotification(
                `🔴 LIVE TRADE: ${row.symbol} ${row.direction}`,
                `Confidence: ${row.confidence}/10${row.entry_price ? ` | Entry: ${row.entry_price}` : ""}`
              );
            }
          }
        }
      )
      .subscribe();

    // Listen for new signals
    const signalChannel = supabase
      .channel("trade-popup-signals")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        (payload: any) => {
          const row = payload.new;
          const notif: Notification = {
            id: row.id || crypto.randomUUID(),
            type: "signal",
            symbol: row.symbol,
            direction: row.direction,
            confidence: row.confidence,
            entry_price: row.entry_price,
            take_profit: row.take_profit,
            stop_loss: row.stop_loss,
            timestamp: row.created_at,
          };
          setNotifications((prev) => [notif, ...prev].slice(0, 5));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(scanChannel);
      supabase.removeChannel(signalChannel);
    };
  }, []);

  if (notifications.length === 0) return null;

  const isBuy = (d: string) => d === "BUY";

  return (
    <div style={{
      position: "fixed",
      top: 70,
      right: 24,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      maxWidth: 380,
      width: "100%",
      pointerEvents: "none",
    }}>
      {notifications.map((n, i) => {
        const buy = isBuy(n.direction);
        const accent = buy ? C.jade : C.red;
        const label = n.type === "signal" ? "⚡ NEW SIGNAL" : "🔴 LIVE TRADE";
        const time = new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return (
          <div
            key={n.id}
            style={{
              pointerEvents: "auto",
              background: C.card,
              border: `1px solid ${accent}50`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${accent}15`,
              animation: "slideInRight 0.3s ease-out",
              position: "relative",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => dismiss(n.id)}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: 6,
                padding: 4,
                cursor: "pointer",
                color: C.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.text; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            >
              <X size={14} />
            </button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                color: accent,
                textTransform: "uppercase",
              }}>
                {label}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>{time}</span>
              {/* Pulsing dot */}
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: accent,
                animation: "popupPulse 1.5s ease-in-out infinite",
              }} />
            </div>

            {/* Body */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
            }}>
              <span style={{ color: accent, fontWeight: 700, fontSize: 14 }}>
                {n.symbol}
              </span>
              <span style={{
                background: `${accent}20`,
                color: accent,
                padding: "2px 8px",
                borderRadius: 4,
                fontWeight: 700,
                fontSize: 11,
              }}>
                {n.direction}
              </span>
              <span style={{ color: C.muted, fontSize: 11 }}>
                Conf: <span style={{ color: C.text, fontWeight: 600 }}>{n.confidence}/10</span>
              </span>
            </div>

            {/* Trade details */}
            {(n.entry_price || n.take_profit || n.stop_loss) && (
              <div style={{
                display: "flex",
                gap: 12,
                marginTop: 8,
                fontSize: 11,
                color: C.sec,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {n.entry_price && (
                  <span>Entry: <span style={{ color: C.text }}>{n.entry_price}</span></span>
                )}
                {n.take_profit && (
                  <span>TP: <span style={{ color: C.jade }}>{n.take_profit}</span></span>
                )}
                {n.stop_loss && (
                  <span>SL: <span style={{ color: C.red }}>{n.stop_loss}</span></span>
                )}
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes popupPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
