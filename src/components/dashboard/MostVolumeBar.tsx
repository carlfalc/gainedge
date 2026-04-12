import { useState, useEffect } from "react";
import { BarChart3, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { SESSIONS, getActiveSessions, getCurrentSession, formatLocalHour, type SessionDef } from "@/lib/session-colors";
import { VolumeHistoryModal } from "./VolumeHistoryModal";

interface SessionRow {
  session: SessionDef;
  topSymbol: string | null;
  peakHourLabel: string | null;
  volume: number;
  status: "completed" | "active" | "upcoming";
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

function getSessionStatus(sess: SessionDef): "completed" | "active" | "upcoming" {
  const h = new Date().getUTCHours();
  if (h >= sess.endUtcHour) return "completed";
  if (h >= sess.startUtcHour && h < sess.endUtcHour) return "active";
  return "upcoming";
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
    const today = new Date().toISOString().split("T")[0];

    const [{ data: summaries }, { data: liveRows }] = await Promise.all([
      supabase.from("session_volume_summary").select("*").eq("date", today).order("total_volume", { ascending: false }),
      supabase.from("live_market_data").select("symbol, volume_today, sparkline_data").eq("user_id", uid),
    ]);

    const result: SessionRow[] = [];

    for (const sess of SESSIONS) {
      const status = getSessionStatus(sess);

      if (status === "completed") {
        const sessSum = (summaries || []).filter((s: any) => s.session === sess.key);
        if (sessSum.length > 0) {
          const top = sessSum[0];
          let peakLabel: string | null = null;
          if (top.peak_hour_start) {
            const startH = new Date(top.peak_hour_start).getUTCHours();
            peakLabel = `${formatLocalHour(startH)} – ${formatLocalHour((startH + 1) % 24)}`;
          }
          result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: Number(top.total_volume) || 0, status });
        } else {
          result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status });
        }
      } else if (status === "active") {
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
          result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: top.volume, status });
        } else {
          result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status });
        }
      } else {
        result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status });
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
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <BarChart3 size={16} color="#34D399" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>
              Most Volume Today
              {currentSession && (
                <span style={{ color: currentSession.color, marginLeft: 6 }}>— {currentSession.label} Session</span>
              )}
            </span>
            <button
              onClick={() => setHistoryOpen(true)}
              style={{
                background: "#34D39915", border: `1px solid #34D39940`, cursor: "pointer",
                fontSize: 10, fontWeight: 700, color: "#34D399",
                padding: "3px 12px", borderRadius: 20,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#34D39930")}
              onMouseLeave={e => (e.currentTarget.style.background = "#34D39915")}
            >
              History
            </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row) => {
            const color = row.session.color;
            const hasData = row.topSymbol != null;

            return (
              <div
                key={row.session.key}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "6px 10px", borderRadius: 8,
                  background: row.status === "active" ? color + "10" : "transparent",
                  borderLeft: `3px solid ${color}${hasData || row.status === "active" ? "" : "40"}`,
                  opacity: row.status === "upcoming" ? 0.4 : 1,
                }}
              >
                <span className="text-sm font-medium" style={{ fontSize: 11, fontWeight: 700, color, minWidth: 70, whiteSpace: "nowrap" }}>
                  {row.session.label}
                </span>

                {row.status === "active" && !hasData ? (
                  <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>In progress...</span>
                ) : row.status === "completed" && !hasData ? (
                  <span style={{ fontSize: 11, color: "#F59E0B", fontStyle: "italic" }}>No data recorded</span>
                ) : row.status === "active" && hasData ? (
                  <>
                    <span style={{ padding: "2px 10px", borderRadius: 14, border: `1.5px solid ${color}`, color: C.text, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                      {row.topSymbol}
                    </span>
                    {row.peakHourLabel && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={9} />{row.peakHourLabel}
                      </span>
                    )}
                    {row.volume > 0 && (
                      <span style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
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
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={9} />{row.peakHourLabel}
                      </span>
                    )}
                    {row.volume > 0 && (
                      <span style={{ fontSize: 10, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
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
