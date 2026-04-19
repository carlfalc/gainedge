import { useState, useEffect, useRef } from "react";
import { Calendar, Clock, ChevronDown, ChevronRight, ChevronUp, TrendingUp, TrendingDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { formatLocalHour, SESSIONS } from "@/lib/session-colors";
import { provisionAccount, fetchCandles } from "@/services/metaapi-client";
import {
  buildInstrumentAnalytics,
  formatLocalHourMinute,
  type InstrumentAnalytics,
} from "@/lib/session-volume-analytics";

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

type PeriodCache = Record<number, InstrumentAnalytics[] | null>;

interface BestPick {
  symbol: string;
  sessionLabel: string;
  sessionColor: string;
  hourLabel: string;
  pct: number;
}

function pickBest(
  analytics: InstrumentAnalytics[],
  side: "buy" | "sell"
): BestPick | null {
  let best: BestPick | null = null;
  for (const inst of analytics) {
    for (const sp of inst.sessions) {
      const pct = side === "buy" ? sp.bestBuyPct : sp.bestSellPct;
      const hourUtc = side === "buy" ? sp.bestBuyHourUtc : sp.bestSellHourUtc;
      const minute = side === "buy" ? sp.bestBuyMinute : sp.bestSellMinute;
      if (pct == null || hourUtc == null) continue;
      if (!best || pct > best.pct) {
        best = {
          symbol: inst.symbol,
          sessionLabel: sp.session.label,
          sessionColor: sp.session.color,
          hourLabel: formatLocalHourMinute(hourUtc, minute ?? 0),
          pct,
        };
      }
    }
  }
  return best;
}

function pickMostActiveSession(analytics: InstrumentAnalytics[]): { label: string; color: string; symbol: string; hourLabel: string } | null {
  let best: { label: string; color: string; symbol: string; hourLabel: string; vol: number } | null = null;
  for (const inst of analytics) {
    for (const sp of inst.sessions) {
      if (sp.dataPoints === 0 || sp.peakAvgVolume <= 0) continue;
      if (!best || sp.peakAvgVolume > best.vol) {
        best = {
          label: sp.session.label,
          color: sp.session.color,
          symbol: inst.symbol,
          hourLabel: sp.peakHourUtc !== null
            ? `${formatLocalHour(sp.peakHourUtc)} – ${formatLocalHour((sp.peakHourUtc + 1) % 24)}`
            : "—",
          vol: sp.peakAvgVolume,
        };
      }
    }
  }
  return best ? { label: best.label, color: best.color, symbol: best.symbol, hourLabel: best.hourLabel } : null;
}

export function VolumeHistoryInline() {
  const [open, setOpen] = useState(false);
  const [activePeriod, setActivePeriod] = useState<14 | 30>(14);
  const [cache, setCache] = useState<PeriodCache>({ 14: null, 30: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (cache[activePeriod] != null) return;
    cancelRef.current = false;
    void load(activePeriod);
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activePeriod]);

  const load = async (period: 14 | 30) => {
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
      if (symbols.length === 0) {
        setCache(prev => ({ ...prev, [period]: [] }));
        setLoading(false);
        return;
      }

      let accountId: string | null = null;
      try {
        const acc = await provisionAccount();
        accountId = acc.accountId;
      } catch { /* fallback */ }

      const results: InstrumentAnalytics[] = [];
      for (const symbol of symbols) {
        if (cancelRef.current) return;
        let candles: Awaited<ReturnType<typeof fetchCandles>> = [];
        if (accountId) {
          const variants = SYMBOL_VARIANTS[symbol] || [symbol];
          for (const variant of variants) {
            try {
              candles = await fetchCandles(accountId, variant, "1H", 800, period);
              if (candles.length > 0) break;
            } catch { /* try next */ }
          }
        }
        results.push(buildInstrumentAnalytics(symbol, candles, period));
      }

      if (cancelRef.current) return;
      setCache(prev => ({ ...prev, [period]: results }));
    } catch (e: any) {
      setError(e?.message || "Failed to load history");
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  };

  const data = cache[activePeriod];
  const bestBuy = data ? pickBest(data, "buy") : null;
  const bestSell = data ? pickBest(data, "sell") : null;
  const mostActive = data ? pickMostActiveSession(data) : null;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: open ? "12px 16px 14px" : "10px 16px",
      marginTop: -8,
      marginBottom: 16,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          width: "100%", display: "flex", alignItems: "center", gap: 8,
        }}
      >
        {open ? <ChevronDown size={14} color="#34D399" /> : <ChevronRight size={14} color="#34D399" />}
        <Calendar size={13} color="#34D399" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "#34D399" }}>
          Historical Volume Patterns — Last 14 & 30 Days
        </span>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 500, marginLeft: "auto" }}>
          {open ? "Hide" : "Show"} optimum sessions, timeframes & best buy/sell windows
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Period tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {([14, 30] as const).map(p => {
              const active = activePeriod === p;
              return (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  style={{
                    padding: "4px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    border: active ? "1.5px solid #34D399" : `1px solid ${C.border}`,
                    background: active ? "#34D39920" : "transparent",
                    color: active ? "#34D399" : C.sec,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Last {p}d
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingRow period={activePeriod} />
          ) : error ? (
            <div style={{ fontSize: 11, color: "#EF4444", padding: 10 }}>{error}</div>
          ) : !data || data.length === 0 ? (
            <div style={{ fontSize: 11, color: C.muted, padding: 10, fontStyle: "italic" }}>
              No history available — connect your broker in Settings to start collecting data.
            </div>
          ) : (
            <>
              {/* Top-level summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                <SummaryCard
                  icon={<Clock size={11} />}
                  label="Most Active Session"
                  value={mostActive ? mostActive.label : "—"}
                  sub={mostActive ? `${mostActive.symbol} • ${mostActive.hourLabel}` : "No data"}
                  color={mostActive?.color || C.muted}
                />
                <SummaryCard
                  icon={<TrendingUp size={11} />}
                  label="Best Buy Window"
                  value={bestBuy ? `${bestBuy.symbol} ${bestBuy.pct}%` : "—"}
                  sub={bestBuy ? `${bestBuy.sessionLabel} • ${bestBuy.hourLabel}` : "Insufficient data"}
                  color="#22C55E"
                />
                <SummaryCard
                  icon={<TrendingDown size={11} />}
                  label="Best Short Window"
                  value={bestSell ? `${bestSell.symbol} ${bestSell.pct}%` : "—"}
                  sub={bestSell ? `${bestSell.sessionLabel} • ${bestSell.hourLabel}` : "Insufficient data"}
                  color="#EF4444"
                />
              </div>

              {/* Per-instrument breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.map(inst => (
                  <InstrumentRow key={inst.symbol} inst={inst} />
                ))}
              </div>

              <div style={{ fontSize: 9, color: C.muted, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                <Info size={9} /> Pattern strength improves with more days of data. Times shown in your local timezone.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: color + "10",
      border: `1px solid ${color}30`,
      borderRadius: 8,
      padding: "8px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, color, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
        {sub}
      </div>
    </div>
  );
}

function InstrumentRow({ inst }: { inst: InstrumentAnalytics }) {
  const [expanded, setExpanded] = useState(false);
  const hasAnyData = inst.sessions.some(s => s.dataPoints > 0);

  // Pick the strongest session for the headline
  const strongest = [...inst.sessions]
    .filter(s => s.dataPoints > 0)
    .sort((a, b) => b.peakAvgVolume - a.peakAvgVolume)[0];

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          width: "100%", display: "flex", alignItems: "center", gap: 8,
        }}
      >
        {expanded ? <ChevronDown size={11} color={C.muted} /> : <ChevronRight size={11} color={C.muted} />}
        <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace", minWidth: 80, textAlign: "left" }}>
          {inst.symbol}
        </span>
        {hasAnyData && strongest ? (
          <span style={{ fontSize: 10, color: C.sec, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: strongest.session.color, fontWeight: 700 }}>{strongest.session.label}</span>
            <span>peak {strongest.peakHourUtc !== null ? `${formatLocalHour(strongest.peakHourUtc)}` : "—"}</span>
            <span style={{ color: "#22C55E", fontWeight: 700 }}>BUY {strongest.buyPct}%</span>
            <span style={{ color: C.muted }}>|</span>
            <span style={{ color: "#EF4444", fontWeight: 700 }}>SELL {strongest.sellPct}%</span>
          </span>
        ) : (
          <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>No data in selected period</span>
        )}
        <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>
          {inst.totalDays}d
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {SESSIONS.map(sess => {
            const sp = inst.sessions.find(s => s.session.key === sess.key);
            if (!sp) return null;
            return (
              <div key={sess.key} style={{ paddingLeft: 8, borderLeft: `2px solid ${sess.color}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: sess.color, marginBottom: 2 }}>
                  {sess.label}
                </div>
                {sp.dataPoints === 0 ? (
                  <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>No candle data</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {sp.peakHourUtc !== null && (
                      <div style={{ fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
                        Peak: {formatLocalHour(sp.peakHourUtc)} – {formatLocalHour((sp.peakHourUtc + 1) % 24)} ({sp.peakAvgVolume.toLocaleString()} avg vol)
                      </div>
                    )}
                    {sp.bestBuyHourUtc !== null && sp.bestBuyPct > 50 && (
                      <div style={{ fontSize: 10, color: "#22C55E", fontFamily: "'JetBrains Mono', monospace" }}>
                        ▲ Best buy @ {formatLocalHourMinute(sp.bestBuyHourUtc, sp.bestBuyMinute ?? 0)} ({sp.bestBuyPct}%)
                      </div>
                    )}
                    {sp.bestSellHourUtc !== null && sp.bestSellPct > 50 && (
                      <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "'JetBrains Mono', monospace" }}>
                        ▼ Best short @ {formatLocalHourMinute(sp.bestSellHourUtc, sp.bestSellMinute ?? 0)} ({sp.bestSellPct}%)
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.sec }}>
                      Bias: <span style={{ color: "#22C55E", fontWeight: 700 }}>BUY {sp.buyPct}%</span>
                      {" "}<span style={{ color: C.muted }}>|</span>{" "}
                      <span style={{ color: "#EF4444", fontWeight: 700 }}>SELL {sp.sellPct}%</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: "#34D399", fontWeight: 600, marginTop: 4 }}>
            {inst.overallNote}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingRow({ period }: { period: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, color: C.muted, fontSize: 11 }}>
      <div style={{
        width: 14, height: 14, border: `2px solid ${C.border}`,
        borderTop: "2px solid #34D399", borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span>Fetching {period}d history… {elapsed > 0 && `(${elapsed}s)`}</span>
    </div>
  );
}
