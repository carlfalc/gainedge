/**
 * GAINEDGE_GLOBAL_SIGNAL_POPUP_V1 — global in-app popup layer for genuine Falconer
 * signal events. Mounted once in `DashboardLayout`, so it works on every dashboard route.
 *
 * Scope guarantees:
 *   • The realtime subscription is filtered to `user_id=eq.<signed-in uid>` — never the
 *     whole table — and the baseline query is filtered to the same user and `mode='live'`.
 *   • Rows that already existed when the baseline was taken never produce a popup.
 *   • Dedupe keys survive toast auto-dismiss, route changes and channel reconnects.
 *   • On sign-out / user change, the channel, visible stack and dedupe state are cleared.
 *
 * RON popups are intentionally NOT delivered here: there is no persisted realtime event
 * path for RON decisions yet, and a polling workaround would fabricate delivery semantics.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { askRonContextHref } from "@/lib/ask-ron-context";
import {
  NOTIFICATION_AUTO_DISMISS_MS, NOTIFICATION_SOURCE_QUALIFIER, applyBaseline,
  createSignalNotificationState, deriveNotification, pushVisible,
  resetSignalNotificationState, viewSignalHref,
  type FalconerNotificationRow, type SignalNotification,
} from "@/lib/signal-notifications";

const BASELINE_COLUMNS = "id,symbol,timeframe,mode,direction,trigger_type,status,opened_at";
const BASELINE_LIMIT = 200;

export default function GlobalSignalNotifications() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState<SignalNotification[]>([]);
  const stateRef = useRef(createSignalNotificationState());

  const dismiss = useCallback((key: string) => {
    setNotes((prev) => prev.filter((n) => n.key !== key));
  }, []);

  // Track the signed-in user; clear everything on sign-out or user change.
  useEffect(() => {
    let mounted = true;
    const apply = (nextId: string | null) => {
      if (!mounted) return;
      setUserId((prev) => {
        if (prev === nextId) return prev;
        resetSignalNotificationState(stateRef.current);
        setNotes([]);
        return nextId;
      });
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      apply(session?.user?.id ?? null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Baseline + user-scoped realtime subscription.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const state = stateRef.current;

    const start = async () => {
      const { data } = await supabase
        .from("falconer_trades")
        .select(BASELINE_COLUMNS)
        .eq("user_id", userId)
        .eq("mode", "live")
        .order("opened_at", { ascending: false })
        .limit(BASELINE_LIMIT);
      if (cancelled) return;
      applyBaseline(state, (data ?? []) as unknown as FalconerNotificationRow[]);
    };
    void start();

    const handle = (eventType: "INSERT" | "UPDATE") => (payload: { new?: unknown }) => {
      const row = payload.new as FalconerNotificationRow | undefined;
      if (!row) return;
      const note = deriveNotification(state, row, eventType);
      if (!note) return;
      setNotes((prev) => pushVisible(prev, note));
    };

    const channel = supabase
      .channel(`global-signal-popup-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "falconer_trades", filter: `user_id=eq.${userId}` },
        handle("INSERT"),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "falconer_trades", filter: `user_id=eq.${userId}` },
        handle("UPDATE"),
      )
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [userId]);

  // Auto-dismiss. Dedupe history is kept in stateRef, so ageing out never re-alerts.
  useEffect(() => {
    if (notes.length === 0) return;
    const timers = notes.map((n) =>
      setTimeout(() => dismiss(n.key), Math.max(0, n.createdAt + NOTIFICATION_AUTO_DISMISS_MS - Date.now())));
    return () => { timers.forEach(clearTimeout); };
  }, [notes, dismiss]);

  if (notes.length === 0) return null;

  return (
    <div
      data-testid="global-signal-notifications"
      aria-live="polite"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 10, maxWidth: 340,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {notes.map((n) => (
        <article
          key={n.key}
          data-testid="signal-notification"
          style={{
            background: C.card, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.jade}`,
            borderRadius: 12, padding: "12px 14px", boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => dismiss(n.key)}
            aria-label={`Dismiss ${n.symbol} notification`}
            style={{
              position: "absolute", top: 8, right: 8, background: "transparent",
              border: "none", borderRadius: 6, padding: 4, cursor: "pointer", color: C.muted,
            }}
          >
            <X size={13} />
          </button>

          <div style={{ display: "flex", alignItems: "baseline", gap: 6, paddingRight: 18 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{n.symbol}</span>
            <span style={{ fontSize: 11, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
              {n.timeframe}
            </span>
            {n.direction && (
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: 0.6 }}>{n.direction}</span>
            )}
          </div>

          <div style={{ marginTop: 4, fontSize: 12, color: C.text }}>
            {n.kind === "new" ? "New record · " : "Status update · "}{n.statusLabel}
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: C.sec }}>
            {n.triggerLabel}
            {n.openedAt ? <span style={{ color: C.muted }}> · opened {n.ageLabel}</span> : null}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => { dismiss(n.key); navigate(viewSignalHref(n.symbol)); }}
              style={{
                background: C.cardH, border: `1px solid ${C.border}`, color: C.jade,
                borderRadius: 8, padding: "4px 9px", fontSize: 11, cursor: "pointer",
              }}
            >
              View signal
            </button>
            <button
              type="button"
              onClick={() => { dismiss(n.key); navigate(askRonContextHref(n.symbol, n.timeframe)); }}
              style={{
                background: "transparent", border: `1px solid ${C.border}`, color: C.sec,
                borderRadius: 8, padding: "4px 9px", fontSize: 11, cursor: "pointer",
              }}
            >
              Ask RON
            </button>
          </div>

          <div style={{ marginTop: 7, fontSize: 9.5, color: C.muted }}>
            {NOTIFICATION_SOURCE_QUALIFIER}
          </div>
        </article>
      ))}
    </div>
  );
}
