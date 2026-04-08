import { useState, useEffect, useMemo } from "react";
import { BarChart3, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface TopInstrument {
  symbol: string;
  score: number;
  peakHourLabel: string | null;
}

type TradingSession = "asian" | "london" | "new_york" | "closed";

interface SessionInfo {
  name: string;
  key: TradingSession;
  startUtcHour: number;
  endUtcHour: number;
}

const SESSIONS: SessionInfo[] = [
  { name: "Asian Session", key: "asian", startUtcHour: 0, endUtcHour: 9 },
  { name: "London Session", key: "london", startUtcHour: 7, endUtcHour: 16 },
  { name: "New York Session", key: "new_york", startUtcHour: 13, endUtcHour: 22 },
];

function detectCurrentSession(): { session: SessionInfo; overlap: boolean } | null {
  const utcHour = new Date().getUTCHours();
  const active = SESSIONS.filter(s => {
    if (s.startUtcHour < s.endUtcHour) return utcHour >= s.startUtcHour && utcHour < s.endUtcHour;
    return utcHour >= s.startUtcHour || utcHour < s.endUtcHour;
  });
  if (active.length === 0) return null;
  // If multiple sessions overlap, pick the one that started most recently
  const primary = active.length > 1
    ? active.reduce((a, b) => {
        const aDist = (utcHour - a.startUtcHour + 24) % 24;
        const bDist = (utcHour - b.startUtcHour + 24) % 24;
        return aDist < bDist ? a : b;
      })
    : active[0];
  return { session: primary, overlap: active.length > 1 };
}

function formatLocalHour(utcHour: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0));
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function peakHourFromSparkline(sparkline: number[] | null | undefined): { peakUtcHour: number } | null {
  if (!sparkline || sparkline.length < 4) return null;
  // Sparkline has ~20 data points representing recent candles (15m each = ~5 hours)
  // Group into ~1-hour buckets (4 candles per hour) and find highest activity bucket
  const bucketSize = 4;
  const buckets: { sum: number; idx: number }[] = [];
  for (let i = 0; i <= sparkline.length - bucketSize; i += bucketSize) {
    const slice = sparkline.slice(i, i + bucketSize);
    // Use range (max-min) as a proxy for volume/activity
    const range = Math.max(...slice) - Math.min(...slice);
    buckets.push({ sum: range, idx: i });
  }
  if (buckets.length === 0) return null;
  const peak = buckets.reduce((a, b) => a.sum > b.sum ? a : b);
  // Map bucket index back to approximate UTC hour
  const candlesFromEnd = sparkline.length - peak.idx;
  const hoursAgo = Math.floor(candlesFromEnd / 4);
  const peakUtcHour = (new Date().getUTCHours() - hoursAgo + 24) % 24;
  return { peakUtcHour };
}

export function MostVolumeBar() {
  const [top, setTop] = useState<TopInstrument[]>([]);
  const [metric, setMetric] = useState<"volume" | "confidence">("confidence");
  const [sessionInfo, setSessionInfo] = useState(detectCurrentSession());

  // Update session every minute
  useEffect(() => {
    const interval = setInterval(() => setSessionInfo(detectCurrentSession()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("most-volume")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_market_data" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_results" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const { data: instruments } = await supabase
      .from("user_instruments")
      .select("symbol")
      .eq("user_id", uid);

    if (!instruments || instruments.length === 0) return;
    const symbols = instruments.map((i) => i.symbol);

    // Try live_market_data first for real volume + sparkline
    const { data: liveRows } = await supabase
      .from("live_market_data")
      .select("symbol, volume_today, sparkline_data")
      .eq("user_id", uid)
      .in("symbol", symbols);

    const hasLiveVolume = liveRows && liveRows.some(r => r.volume_today != null && Number(r.volume_today) > 0);

    if (hasLiveVolume && liveRows) {
      setMetric("volume");
      const sorted = [...liveRows]
        .map(r => {
          const spark = Array.isArray(r.sparkline_data) ? (r.sparkline_data as number[]) : null;
          const peak = peakHourFromSparkline(spark);
          let peakLabel: string | null = null;
          if (peak) {
            const start = formatLocalHour(peak.peakUtcHour);
            const end = formatLocalHour((peak.peakUtcHour + 1) % 24);
            peakLabel = `${start} – ${end}`;
          }
          return { symbol: r.symbol, score: Number(r.volume_today) || 0, peakHourLabel: peakLabel };
        })
        .sort((a, b) => b.score - a.score);
      const result = [sorted[0]];
      if (sorted.length > 1 && sorted[1].score >= sorted[0].score * 0.85) {
        result.push(sorted[1]);
      }
      setTop(result);
      return;
    }

    // Fallback to scan_results confidence
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let { data: scans } = await supabase
      .from("scan_results")
      .select("symbol, volume, confidence, scanned_at")
      .eq("user_id", uid)
      .in("symbol", symbols)
      .gte("scanned_at", todayStart.toISOString())
      .order("scanned_at", { ascending: false })
      .limit(100);

    if (!scans || scans.length === 0) {
      const { data: recentScans } = await supabase
        .from("scan_results")
        .select("symbol, volume, confidence, scanned_at")
        .eq("user_id", uid)
        .in("symbol", symbols)
        .order("scanned_at", { ascending: false })
        .limit(100);
      scans = recentScans;
    }

    if (!scans || scans.length === 0) return;

    const hasVolume = scans.some(s => s.volume != null && Number(s.volume) > 0);
    const latest = new Map<string, TopInstrument>();
    for (const s of scans) {
      if (!latest.has(s.symbol)) {
        latest.set(s.symbol, {
          symbol: s.symbol,
          score: hasVolume ? (Number(s.volume) || 0) : (s.confidence ?? 0),
          peakHourLabel: null,
        });
      }
    }

    setMetric(hasVolume ? "volume" : "confidence");
    const sorted = Array.from(latest.values()).sort((a, b) => b.score - a.score);
    const result = [sorted[0]];
    if (sorted.length > 1 && sorted[1].score >= sorted[0].score * 0.85) {
      result.push(sorted[1]);
    }
    setTop(result);
  };

  if (top.length === 0) return null;

  const sessionLabel = sessionInfo ? sessionInfo.session.name : "Markets Closed";

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 18px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <BarChart3 size={16} color={C.text} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
        Most Volume Today
      </span>
      <span style={{ fontSize: 10, color: C.jade, fontWeight: 600, whiteSpace: "nowrap" }}>
        — {sessionLabel}
      </span>

      <div style={{ width: 1, height: 16, background: C.border, flexShrink: 0 }} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {top.map((t) => (
          <div key={t.symbol} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                padding: "4px 14px",
                borderRadius: 20,
                border: "1.5px solid #EAB308",
                color: C.text,
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: 0.5,
                transition: "all 0.4s ease",
              }}
            >
              {t.symbol}
            </span>
            {t.peakHourLabel && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
                <Clock size={9} />
                {t.peakHourLabel}
              </span>
            )}
          </div>
        ))}
        <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>
          by {metric}
        </span>
      </div>
    </div>
  );
}
