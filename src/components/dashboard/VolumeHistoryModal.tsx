import { useState, useEffect } from "react";
import { X, BarChart3, TrendingUp, TrendingDown, Clock, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { SESSIONS, SESSION_COLORS, formatLocalHour, type SessionDef } from "@/lib/session-colors";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface SessionPattern {
  session: SessionDef;
  peakHourUtc: number | null;
  peakAvgVolume: number;
  lowestHourUtc: number | null;
  lowestAvgVolume: number;
  buyPct: number;
  sellPct: number;
  tip: string;
  dataPoints: number;
}

interface InstrumentAnalytics {
  symbol: string;
  sessions: SessionPattern[];
  overallNote: string;
  totalDays: number;
}

export function VolumeHistoryModal({ open, onClose }: Props) {
  const [analytics, setAnalytics] = useState<InstrumentAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    loadAnalytics();
  }, [open]);

  const loadAnalytics = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const uid = session.user.id;

    const [{ data: instruments }, { data: summaries }, { data: scanResults }] = await Promise.all([
      supabase.from("user_instruments").select("symbol").eq("user_id", uid),
      supabase.from("session_volume_summary").select("*").order("date", { ascending: false }).limit(500),
      supabase.from("scan_results").select("symbol, direction, session, scanned_at").eq("user_id", uid).order("scanned_at", { ascending: false }).limit(1000),
    ]);

    const symbols = (instruments || []).map(i => i.symbol);
    const allDates = new Set((summaries || []).map((s: any) => s.date));
    const totalDays = allDates.size || 1;

    const results: InstrumentAnalytics[] = symbols.map(symbol => {
      const symSummaries = (summaries || []).filter((s: any) => s.symbol === symbol);
      const symScans = (scanResults || []).filter((s: any) => s.symbol === symbol);

      const sessionPatterns: SessionPattern[] = SESSIONS.map(sess => {
        const sessSums = symSummaries.filter((s: any) => s.session === sess.key);
        const sessScans = symScans.filter((s: any) => s.session === sess.key);

        // Find peak hour from summaries
        let peakHourUtc: number | null = null;
        let peakAvgVolume = 0;
        let lowestHourUtc: number | null = null;
        let lowestAvgVolume = 0;

        if (sessSums.length > 0) {
          // Group by peak_hour_start to find most common peak hour
          const hourCounts = new Map<number, { count: number; totalVol: number }>();
          for (const s of sessSums) {
            if (s.peak_hour_start) {
              const h = new Date(s.peak_hour_start).getUTCHours();
              const existing = hourCounts.get(h) || { count: 0, totalVol: 0 };
              hourCounts.set(h, { count: existing.count + 1, totalVol: existing.totalVol + (Number(s.total_volume) || 0) });
            }
          }
          
          let maxCount = 0;
          for (const [h, data] of hourCounts) {
            if (data.count > maxCount) {
              maxCount = data.count;
              peakHourUtc = h;
              peakAvgVolume = Math.round(data.totalVol / data.count);
            }
          }

          // Lowest = first/last hour of session typically
          const lowestH = sess.startUtcHour === 0 ? 6 : sess.endUtcHour - 2;
          lowestHourUtc = lowestH;
          const lowestData = hourCounts.get(lowestH);
          lowestAvgVolume = lowestData ? Math.round(lowestData.totalVol / lowestData.count) : 0;
        }

        // Direction bias from scan_results
        const buys = sessScans.filter((s: any) => s.direction === "BUY").length;
        const sells = sessScans.filter((s: any) => s.direction === "SELL").length;
        const total = buys + sells || 1;
        const buyPct = Math.round((buys / total) * 100);
        const sellPct = 100 - buyPct;

        // Generate tip
        const tips = [
          buyPct > 60 ? `Strong BUY bias during ${sess.label} — trend-following setups favored` : "",
          sellPct > 60 ? `Strong SELL bias during ${sess.label} — reversal/short setups favored` : "",
          peakHourUtc !== null ? `Volume spike at session ${peakHourUtc === sess.startUtcHour ? "open" : "mid-session"} often precedes breakout` : "",
          "Watch for reversal patterns at session boundaries",
        ].filter(Boolean);

        return {
          session: sess,
          peakHourUtc,
          peakAvgVolume,
          lowestHourUtc,
          lowestAvgVolume,
          buyPct,
          sellPct,
          tip: tips[0] || "Insufficient data for pattern detection",
          dataPoints: sessSums.length,
        };
      });

      // Overall note
      const sessionVols = sessionPatterns.map(sp => ({ label: sp.session.label, vol: sp.peakAvgVolume }));
      const maxSess = sessionVols.reduce((a, b) => a.vol > b.vol ? a : b, sessionVols[0]);
      const minSess = sessionVols.reduce((a, b) => a.vol < b.vol ? a : b, sessionVols[0]);
      const ratio = minSess.vol > 0 ? (maxSess.vol / minSess.vol).toFixed(1) : "N/A";

      return {
        symbol,
        sessions: sessionPatterns,
        overallNote: `${symbol} is most traded during ${maxSess.label} session with ${ratio}x ${minSess.label} volume.`,
        totalDays,
      };
    });

    setAnalytics(results);
    setLoading(false);

    // Store patterns as insights for AI brain
    storeInsights(uid, results);
  };

  const storeInsights = async (userId: string, data: InstrumentAnalytics[]) => {
    const weekStart = getWeekStart();
    for (const inst of data) {
      const insightData = {
        sessions: inst.sessions.map(sp => ({
          session: sp.session.key,
          peakHourUtc: sp.peakHourUtc,
          peakAvgVolume: sp.peakAvgVolume,
          buyPct: sp.buyPct,
          sellPct: sp.sellPct,
        })),
        overallNote: inst.overallNote,
        totalDays: inst.totalDays,
      };

      await supabase.from("insights").upsert({
        user_id: userId,
        insight_type: "session_volume_pattern",
        symbol: inst.symbol,
        title: `Volume pattern: ${inst.symbol}`,
        description: inst.overallNote,
        data: insightData,
        severity: "info",
        week_start: weekStart,
      }, { onConflict: "id" }).select();
    }
  };

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split("T")[0];
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
          maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto",
          padding: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={20} color="#34D399" />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Volume Analytics — Session Patterns</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={C.muted} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading analytics...</div>
        ) : analytics.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted }}>No instruments found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {analytics.map(inst => (
              <div key={inst.symbol} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                  INSTRUMENT: {inst.symbol}
                </div>

                {inst.sessions.map(sp => (
                  <div key={sp.session.key} style={{ marginBottom: 14, paddingLeft: 12, borderLeft: `3px solid ${sp.session.color}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: sp.session.color, marginBottom: 6 }}>
                      {sp.session.label} Session
                    </div>

                    {sp.dataPoints === 0 ? (
                      <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>No data yet for this session</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {sp.peakHourUtc !== null && (
                          <Row label="Most active hour" value={`${formatLocalHour(sp.peakHourUtc)} – ${formatLocalHour((sp.peakHourUtc + 1) % 24)}`} sub={`${sp.peakAvgVolume.toLocaleString()} avg vol`} />
                        )}
                        {sp.lowestHourUtc !== null && sp.lowestAvgVolume > 0 && (
                          <Row label="Lowest volume hour" value={`${formatLocalHour(sp.lowestHourUtc)} – ${formatLocalHour((sp.lowestHourUtc + 1) % 24)}`} sub={`${sp.lowestAvgVolume.toLocaleString()} avg vol`} />
                        )}
                        <div style={{ fontSize: 11, color: C.sec, display: "flex", gap: 8, alignItems: "center" }}>
                          <span>Direction bias:</span>
                          <span style={{ color: "#22C55E", fontWeight: 700 }}>BUY {sp.buyPct}%</span>
                          <span style={{ color: C.muted }}>|</span>
                          <span style={{ color: "#EF4444", fontWeight: 700 }}>SELL {sp.sellPct}%</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", display: "flex", alignItems: "center", gap: 4 }}>
                          <Info size={9} /> {sp.tip}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ fontSize: 11, color: "#34D399", fontWeight: 600, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  {inst.overallNote}
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={8} /> Based on {inst.totalDays} day{inst.totalDays !== 1 ? "s" : ""} of data — patterns improve with more history
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                  30-day backtest data will accumulate automatically as the platform collects more session data
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ fontSize: 11, color: C.sec, display: "flex", gap: 6, alignItems: "baseline" }}>
      <span style={{ color: C.muted, minWidth: 120 }}>{label}:</span>
      <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      <span style={{ color: C.muted, fontSize: 10 }}>| {sub}</span>
    </div>
  );
}
