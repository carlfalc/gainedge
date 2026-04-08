import { useState, useEffect, useRef } from "react";
import { X, BarChart3, Clock, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { SESSIONS, formatLocalHour } from "@/lib/session-colors";
import { provisionAccount, fetchCandles } from "@/services/metaapi-client";
import {
  HISTORY_PERIOD_OPTIONS,
  buildInstrumentAnalytics,
  type InstrumentAnalytics,
} from "@/lib/session-volume-analytics";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SYMBOL_VARIANTS: Record<string, string[]> = {
  NAS100: ["NDX100", "NAS100", "USTEC"],
  US30: ["US30", "DJ30"],
  XAUUSD: ["XAUUSD", "GOLD"],
  NZDUSD: ["NZDUSD.i", "NZDUSD"],
  AUDUSD: ["AUDUSD.i", "AUDUSD"],
  EURUSD: ["EURUSD.i", "EURUSD"],
  GBPUSD: ["GBPUSD.i", "GBPUSD"],
  USDJPY: ["USDJPY.i", "USDJPY"],
};

export function VolumeHistoryModal({ open, onClose }: Props) {
  const [analytics, setAnalytics] = useState<InstrumentAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<number>(7);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    cancelRef.current = false;
    loadAnalytics();
    return () => { cancelRef.current = true; };
  }, [open, period]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = session.user.id;

      const { data: instruments } = await supabase
        .from("user_instruments")
        .select("symbol")
        .eq("user_id", uid);

      const symbols = (instruments || []).map(i => i.symbol);
      if (symbols.length === 0) { setAnalytics([]); setLoading(false); return; }

      // Provision MetaApi account
      let accountId: string | null = null;
      try {
        const acc = await provisionAccount();
        accountId = acc.accountId;
      } catch { /* will fallback to empty */ }

      const results: InstrumentAnalytics[] = [];

      for (const symbol of symbols) {
        if (cancelRef.current) return;

        let candles: Awaited<ReturnType<typeof fetchCandles>> = [];
        if (accountId) {
          const variants = SYMBOL_VARIANTS[symbol] || [symbol];
          for (const variant of variants) {
            try {
              candles = await fetchCandles(accountId, variant, "1H", 500, period);
              if (candles.length > 0) break;
            } catch { /* try next variant */ }
          }
        }

        results.push(buildInstrumentAnalytics(symbol, candles, period));
      }

      if (cancelRef.current) return;
      setAnalytics(results);

      // Store as insights for AI brain
      storeInsights(uid, results);
    } catch (e: any) {
      setError(e.message || "Failed to load analytics");
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  };

  const storeInsights = async (userId: string, data: InstrumentAnalytics[]) => {
    for (const inst of data) {
      if (inst.sessions.every(s => s.dataPoints === 0)) continue;
      // Delete existing then insert to avoid duplicates
      await supabase.from("insights")
        .delete()
        .eq("user_id", userId)
        .eq("insight_type", "session_volume_pattern")
        .eq("symbol", inst.symbol);

      await supabase.from("insights").insert({
        user_id: userId,
        insight_type: "session_volume_pattern",
        symbol: inst.symbol,
        title: `Volume pattern: ${inst.symbol}`,
        description: inst.overallNote,
        data: {
          sessions: inst.sessions.map(sp => ({
            session: sp.session.key,
            peakHourUtc: sp.peakHourUtc,
            peakAvgVolume: sp.peakAvgVolume,
            buyPct: sp.buyPct,
            sellPct: sp.sellPct,
          })),
          totalDays: inst.totalDays,
        },
        severity: "info",
      });
    }
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={20} color="#34D399" />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Volume Analytics — Session Patterns</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={C.muted} />
          </button>
        </div>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: C.muted, lineHeight: "26px" }}>Period:</span>
          {HISTORY_PERIOD_OPTIONS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "3px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: period === p ? "1.5px solid #34D399" : `1px solid ${C.border}`,
                background: period === p ? "#34D39920" : "transparent",
                color: period === p ? "#34D399" : C.sec,
              }}
            >
              {p} days
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
            Fetching broker candle data for {period} days...
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 40, color: "#EF4444" }}>
            {error}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              Make sure your broker account is connected in Settings.
            </div>
          </div>
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
                      <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>No candle data for this session in the selected period</div>
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
