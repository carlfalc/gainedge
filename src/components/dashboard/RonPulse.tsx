/**
 * GAINEDGE_DASHBOARD_UI_V1 — "RON Pulse": what matters now, at the top of the dashboard.
 *
 * Honesty constraints:
 * - There is no persisted last-login marker, so this is "Latest market update",
 *   never "since you were last here".
 * - No Opportunity Context lifecycle is persisted yet, so no forming/confirmed
 *   opportunity language appears. The RON row is watch context only.
 * - Every row shows the source instant it is about and its age.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, Newspaper, Clock } from "lucide-react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { formatAge } from "@/lib/expiry";
import { formatPrintedLocal } from "@/lib/signal-time";
import { classifyRonSession } from "@/lib/ron-sessions";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { useRonSnapshots, ronStateFrom, ronBiasFrom } from "@/services/ron-snapshots";
import {
  buildPulseItems, pulseLatestTimestamp, PULSE_TITLE, PULSE_SUBTITLE, PULSE_EMPTY_TEXT,
  type PulseItem, type PulseNews, type PulseSnapshot,
} from "@/lib/dashboard-pulse";

const TONE: Record<string, string> = { jade: C.jade, amber: C.amber, red: C.red, neutral: C.sec };

const ICON = {
  ron_state: Activity,
  data_health: AlertTriangle,
  news: Newspaper,
  session: Clock,
} as const;

export default function RonPulse() {
  const navigate = useNavigate();
  const { snapshots, loading } = useRonSnapshots();
  const [news, setNews] = useState<PulseNews[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("news_items")
      .select("headline, published_at, instruments_affected")
      .order("published_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNews((data as any[]).map((n) => ({
          headline: n.headline,
          published_at: n.published_at,
          instruments: n.instruments_affected ?? [],
        })));
      });
    return () => { cancelled = true; };
  }, []);

  // Minute tick so ages stay honest without hammering the network.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const items: PulseItem[] = useMemo(() => {
    const now = new Date();
    const sess = classifyRonSession(now.toISOString());
    const snaps: PulseSnapshot[] = [...snapshots.values()].map((s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      bar_time: s.bar_time,
      data_health: s.data_health,
      features: s.features,
      state: ronStateFrom(s.features)?.state ?? null,
      bias: ronBiasFrom(s.features),
    }));
    return buildPulseItems({
      snapshots: snaps,
      news,
      sessionLabel: sess.label,
      sessionInstant: now.toISOString(),
      marketOpen: sess.market_open,
    });
  }, [snapshots, news]);

  const latest = pulseLatestTimestamp(items);

  return (
    <section
      data-testid="ron-pulse"
      style={{
        background: C.card, border: `1px solid ${C.jade}25`, borderRadius: 14,
        padding: "16px 20px", marginBottom: 20,
        boxShadow: `0 0 30px ${C.jade}08`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 12, color: C.jade, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" }}>
            {PULSE_TITLE}
          </span>
          <span style={{ fontSize: 11, color: C.sec, marginLeft: 8 }}>{PULSE_SUBTITLE}</span>
        </div>
        <span style={{ fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
          {latest ? `Newest source instant ${formatPrintedLocal(latest)} local · ${formatAge(latest)}` : "No dated source yet"}
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.sec }}>Loading stored records…</div>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.sec }} data-testid="ron-pulse-empty">{PULSE_EMPTY_TEXT}</div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {items.map((item) => {
            const Icon = ICON[item.kind];
            const tone = TONE[item.tone] ?? C.sec;
            const clickable = item.kind === "ron_state" || item.kind === "data_health";
            const symbol = item.id.startsWith("ron-state-") ? item.id.replace("ron-state-", "") : null;
            return (
              <div
                key={item.id}
                data-testid={`pulse-${item.kind}`}
                onClick={symbol ? () => navigate(ronDecisionRecordHref(symbol, "15m")) : undefined}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "8px 10px", borderRadius: 10,
                  background: C.bg2, border: `1px solid ${C.border}`,
                  cursor: clickable && symbol ? "pointer" : "default",
                }}
              >
                <Icon size={14} color={tone} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: tone }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5, overflowWrap: "anywhere" }}>{item.detail}</div>
                  <div style={{ fontSize: 9, color: C.sec, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {item.timestamp
                      ? `${item.timestampLabel} ${formatPrintedLocal(item.timestamp)} local · ${formatAge(item.timestamp)}`
                      : `${item.timestampLabel} — no source instant`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
