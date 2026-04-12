import { useState, useEffect } from "react";
import { BarChart3, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { SESSIONS, getActiveSessions, getCurrentSession, formatLocalHour, type SessionDef } from "@/lib/session-colors";
import { formatLocalHourMinute } from "@/lib/session-volume-analytics";
import { VolumeHistoryModal } from "./VolumeHistoryModal";

interface SessionInsight {
  bestBuySymbol: string | null;
  bestBuyTime: string | null;
  bestBuyPct: number;
  bestSellSymbol: string | null;
  bestSellTime: string | null;
  bestSellPct: number;
}

interface SessionRow {
  session: SessionDef;
  topSymbol: string | null;
  peakHourLabel: string | null;
  volume: number;
  status: "completed" | "active" | "upcoming";
  insight: SessionInsight | null;
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

/**
 * Parse insight data from the insights table to extract the best buy/sell per session.
 */
function buildSessionInsights(
  insights: any[],
  sessionKey: string
): SessionInsight | null {
  let bestBuySymbol: string | null = null;
  let bestBuyTime: string | null = null;
  let bestBuyPct = 0;
  let bestSellSymbol: string | null = null;
  let bestSellTime: string | null = null;
  let bestSellPct = 0;

  for (const ins of insights) {
    const data = ins.data as any;
    if (!data?.sessions) continue;
    const sessData = (data.sessions as any[]).find((s: any) => s.session === sessionKey);
    if (!sessData) continue;

    // Check buy bias for this instrument in this session
    const sBuyPct = sessData.bestBuyPct ?? sessData.buyPct ?? 0;
    const sSellPct = sessData.bestSellPct ?? sessData.sellPct ?? 0;

    if (sBuyPct > bestBuyPct) {
      bestBuyPct = sBuyPct;
      bestBuySymbol = ins.symbol;
      if (sessData.bestBuyHourUtc != null) {
        bestBuyTime = formatLocalHourMinute(sessData.bestBuyHourUtc, sessData.bestBuyMinute ?? 0);
      } else if (sessData.peakHourUtc != null) {
        bestBuyTime = formatLocalHour(sessData.peakHourUtc);
      }
    }

    if (sSellPct > bestSellPct) {
      bestSellPct = sSellPct;
      bestSellSymbol = ins.symbol;
      if (sessData.bestSellHourUtc != null) {
        bestSellTime = formatLocalHourMinute(sessData.bestSellHourUtc, sessData.bestSellMinute ?? 0);
      } else if (sessData.peakHourUtc != null) {
        bestSellTime = formatLocalHour(sessData.peakHourUtc);
      }
    }
  }

  if (!bestBuySymbol && !bestSellSymbol) return null;

  return { bestBuySymbol, bestBuyTime, bestBuyPct, bestSellSymbol, bestSellTime, bestSellPct };
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
      .on("postgres_changes", { event: "*", schema: "public", table: "insights" }, () => load())
      .subscribe();
    const interval = setInterval(load, 60_000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;
    const today = new Date().toISOString().split("T")[0];

    const [{ data: summaries }, { data: liveRows }, { data: insightRows }] = await Promise.all([
      supabase.from("session_volume_summary").select("*").eq("date", today).order("total_volume", { ascending: false }),
      supabase.from("live_market_data").select("symbol, volume_today, sparkline_data").eq("user_id", uid),
      supabase.from("insights").select("symbol, data").eq("user_id", uid).eq("insight_type", "session_volume_pattern"),
    ]);

    const result: SessionRow[] = [];

    for (const sess of SESSIONS) {
      const status = getSessionStatus(sess);
      const insight = buildSessionInsights(insightRows || [], sess.key);

      if (status === "completed") {
        const sessSum = (summaries || []).filter((s: any) => s.session === sess.key);
        if (sessSum.length > 0) {
          const top = sessSum[0];
          let peakLabel: string | null = null;
          if (top.peak_hour_start) {
            const startH = new Date(top.peak_hour_start).getUTCHours();
            peakLabel = `${formatLocalHour(startH)} – ${formatLocalHour((startH + 1) % 24)}`;
          }
          result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: Number(top.total_volume) || 0, status, insight });
        } else {
          result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status, insight });
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
          result.push({ session: sess, topSymbol: top.symbol, peakHourLabel: peakLabel, volume: top.volume, status, insight });
        } else {
          result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status, insight });
        }
      } else {
        result.push({ session: sess, topSymbol: null, peakHourLabel: null, volume: 0, status, insight });
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
            const ins = row.insight;
            const showInsight = ins && row.status !== "upcoming";

            return (
              <div key={row.session.key}>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
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

                  {/* Inline Buy/Sell insights */}
                  {showInsight && ins.bestBuySymbol && ins.bestBuyPct > 50 && (
                    <span style={{ fontSize: 10, color: "#22C55E", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                      ▲ BUY: {ins.bestBuySymbol}
                      {ins.bestBuyTime && <> @ {ins.bestBuyTime}</>}
                      {" "}({ins.bestBuyPct}%)
                    </span>
                  )}
                  {showInsight && ins.bestSellSymbol && ins.bestSellPct > 50 && (
                    <span style={{ fontSize: 10, color: "#EF4444", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                      ▼ SHORT: {ins.bestSellSymbol}
                      {ins.bestSellTime && <> @ {ins.bestSellTime}</>}
                      {" "}({ins.bestSellPct}%)
                    </span>
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
