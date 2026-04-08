import { useState, useEffect } from "react";
import { BarChart3, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { SESSIONS, SESSION_COLORS, getActiveSessions, getCompletedSessions, getCurrentSession, formatLocalHour, type SessionDef } from "@/lib/session-colors";
import { VolumeHistoryModal } from "./VolumeHistoryModal";

interface SessionRow {
  session: SessionDef;
  topSymbol: string | null;
  peakHourLabel: string | null;
  volume: number;
  inProgress: boolean;
}

function peakHourFromSparkline(sparkline: number[] | null): { peakUtcHour: number } | null {
  if (!sparkline || sparkline.length < 4) return null;
  const bucketSize = 4;
  const buckets: { range: number; idx: number }[] = [];
  for (let i = 0; i <= sparkline.length - bucketSize; i += bucketSize) {
    const slice = sparkline.slice(i, i + bucketSize);
    buckets.push({ range: Math.max(...slice) - Math.min(...slice), idx: i });
  }
  if (buckets.length === 0) return null;
  const peak = buckets.reduce((a, b) => a.range > b.range ? a : b);
  const candlesFromEnd = sparkline.length - peak.idx;
  const hoursAgo = Math.floor(candlesFromEnd / 4);
  return { peakUtcHour: (new Date().getUTCHours() - hoursAgo + 24) % 24 };
}

export function MostVolumeBar() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("most-volume-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_market_data" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "session_volume_summary" }, () => load())
      .subscribe();
    const interval = setInterval(load, 60_000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const completed = getCompletedSessions();
    const active = getActiveSessions();
    const today = new Date().toISOString().split("T")[0];

    const { data: summaries } = await supabase
      .from("session_volume_summary")
      .select("*")
      .eq("date", today)
      .order("total_volume", { ascending: false });

    const { data: liveRows } = await supabase
      .from("live_market_data")
      .select("symbol, volume_today, sparkline_data")
      .eq("user_id", uid);

    const result: SessionRow[] = [];

    // Completed sessions from stored summaries
    for (const sess of completed) {
      const sessSum = (summaries || []).filter((s: any) => s.session === sess.key);
      if (sessSum.length > 0) {
        const top = sessSum[0];
        let peakLabel: string | null = null;
        if (top.peak_hour_start) {
          const peakDate = new Date(top.peak_hour_start);
          const startH = peakDate.getUTCHours();
          const startLocal = formatLocalHour(startH);
          const endLocal = formatLocalHour((startH + 1) % 24);
          peakLabel = `${startLocal} – ${endLocal}`;
        }
        result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: Number(top.total_volume) || 0, inProgress: false });
      } else {
        result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, inProgress: false });
      }
    }

    // Active/in-progress sessions from live data
    for (const sess of active) {
      if (completed.some(c => c.key === sess.key)) continue;
      if (liveRows && liveRows.length > 0) {
        const sorted = [...liveRows]
          .map(r => ({ symbol: r.symbol, volume: Number(r.volume_today) || 0, sparkline: Array.isArray(r.sparkline_data) ? (r.sparkline_data as number[]) : null }))
          .sort((a, b) => b.volume - a.volume);
        const top = sorted[0];
        let peakLabel: string | null = null;
        const peak = peakHourFromSparkline(top.sparkline);
        if (peak) {
          peakLabel = `${formatLocalHour(peak.peakUtcHour)} – ${formatLocalHour((peak.peakUtcHour + 1) % 24)}`;
        }
        result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: top.volume, inProgress: true });
      } else {
        result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, inProgress: true });
      }
    }

    // Future sessions
    const allShown = new Set(result.map(r => r.session.key));
    for (const sess of SESSIONS) {
      if (!allShown.has(sess.key)) {
        result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, inProgress: false });
      }
    }

    // Sort by session order
    const order = SESSIONS.map(s => s.key);
    result.sort((a, b) => order.indexOf(a.session.key) - order.indexOf(b.session.key));
    setRows(result);
  };

  const currentSession = getCurrentSession();

  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart3 size={16} color={C.text} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              Most Volume Today
              {currentSession && (
                <span style={{ color: currentSession.color, marginLeft: 6 }}>— {currentSession.label} Session</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setHistoryOpen(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: "#34D399",
              padding: "2px 8px", borderRadius: 6,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#34D39920")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            History
          </button>
        </div>

        {/* Session rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row) => {
            const color = row.session.color;
            const hasData = row.topSymbol != null;
            const isActive = row.inProgress;
            const isFuture = !hasData && !isActive && !getCompletedSessions().some(c => c.key === row.session.key);

            return (
              <div
                key={row.session.key}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "6px 10px", borderRadius: 8,
                  background: isActive ? color + "10" : "transparent",
                  borderLeft: `3px solid ${color}${hasData || isActive ? "" : "40"}`,
                  opacity: isFuture ? 0.4 : 1,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 70, whiteSpace: "nowrap" }}>
                  {row.session.label}
                </span>

                {isActive && !hasData ? (
                  <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>In progress...</span>
                ) : isActive && hasData ? (
                  <>
                    <span style={{ padding: "2px 10px", borderRadius: 14, border: `1.5px solid ${color}`, color: C.text, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                      {row.topSymbol}
                    </span>
                    {row.peakHourLabel && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={9} />{row.peakHourLabel}
                      </span>
                    )}
                    {row.volume > 0 && (
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                        {row.volume.toLocaleString()} vol
                      </span>
                    )}
                    <span style={{ fontSize: 8, fontWeight: 700, color, background: color + "20", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      LIVE
                    </span>
                  </>
                ) : hasData ? (
                  <>
                    <span style={{ padding: "2px 10px", borderRadius: 14, border: `1.5px solid ${color}50`, color: C.sec, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                      {row.topSymbol}
                    </span>
                    {row.peakHourLabel && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={9} />{row.peakHourLabel}
                      </span>
                    )}
                    {row.volume > 0 && (
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                        {row.volume.toLocaleString()} vol
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>Upcoming</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <VolumeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
