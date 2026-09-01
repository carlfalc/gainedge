/**
 * Compact stored-decision summary for the top of the dashboard.
 *
 * Honesty constraints:
 * - There is no persisted last-login marker, so this is the latest stored
 *   evaluation, never "since you were last here".
 * - No Opportunity Context lifecycle is persisted yet, so no forming/confirmed
 *   opportunity language appears. The RON row is watch context only.
 * - Every row shows the source instant it is about and its age.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight } from "lucide-react";
import { C } from "@/lib/mock-data";
import { formatAge } from "@/lib/expiry";
import { formatPrintedLocal } from "@/lib/signal-time";
import { classifyRonSession } from "@/lib/ron-sessions";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { useRonSnapshots, ronStateFrom, ronBiasFrom, ronBiasColor, ronBiasFromLabel } from "@/services/ron-snapshots";
import {
  buildPulseItems, pulseLatestTimestamp, PULSE_EMPTY_TEXT,
  type PulseItem, type PulseSnapshot,
} from "@/lib/dashboard-pulse";

const TONE: Record<string, string> = { jade: C.jade, amber: C.amber, red: C.red, neutral: C.sec };

export default function RonPulse() {
  const navigate = useNavigate();
  const { snapshots, loading } = useRonSnapshots();
  const [, setTick] = useState(0);

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
      news: [],
      sessionLabel: sess.label,
      sessionInstant: now.toISOString(),
      marketOpen: sess.market_open,
    });
  }, [snapshots]);

  // The dashboard hero is for stored decision context only. News and session
  // context have dedicated surfaces and must not crowd this record summary.
  const visibleItems = items.filter((item) => item.kind === "ron_state" || item.kind === "data_health").slice(0, 1);
  const latest = pulseLatestTimestamp(visibleItems);

  return (
    <section
      data-testid="ron-pulse"
      style={{
        background: C.card, border: `1px solid ${C.jade}25`, borderRadius: 14,
        padding: "14px 16px", marginBottom: 20,
        boxShadow: `0 0 30px ${C.jade}08`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 12, color: C.jade, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Latest stored evaluation
          </span>
          <span style={{ fontSize: 11, color: C.sec, marginLeft: 8 }}>Completed 15-minute evidence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
            {latest ? `${formatPrintedLocal(latest)} local · ${formatAge(latest)}` : "No dated record yet"}
          </span>
          <button
            type="button"
            onClick={() => navigate("/dashboard/ron-decision")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px",
              borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg2,
              color: C.sec, cursor: "pointer", fontSize: 10, fontWeight: 700,
            }}
          >
            View records <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {loading && visibleItems.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.sec }}>Loading stored records…</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.sec }} data-testid="ron-pulse-empty">{PULSE_EMPTY_TEXT}</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {visibleItems.map((item) => {
            const Icon = item.kind === "data_health" ? AlertTriangle : Activity;
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
                  padding: "10px 12px", borderRadius: 10,
                  background: C.bg2, border: `1px solid ${C.border}`,
                  cursor: clickable && symbol ? "pointer" : "default",
                }}
              >
                <Icon size={14} color={tone} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ronBiasColor(ronBiasFromLabel(item.title)) ?? tone }}>{item.title}</div>
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
