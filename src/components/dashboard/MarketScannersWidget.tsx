/**
 * GAINEDGE_DASHBOARD_UI_V1 — market scanners.
 *
 * Replaces the fabricated "Movers & Shakers" list. Every row here comes from a
 * stored RON snapshot for one of the user's tracked instruments and is stamped
 * with the completed bar it was measured on.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from "lucide-react";
import { C } from "@/lib/mock-data";
import { formatAge } from "@/lib/expiry";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { useRonSnapshots, ronStateFrom, ronStateColor, ronBiasFrom, type RonState } from "@/services/ron-snapshots";
import {
  topMovers, ronWatchList, dataHealthIssues, SCANNER_LIMIT, type ScannerSnapshotInput,
} from "@/lib/dashboard-scanners";

type Tab = "gainers" | "losers" | "watch" | "health";

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "gainers", label: "Gainers", icon: TrendingUp },
  { id: "losers", label: "Losers", icon: TrendingDown },
  { id: "watch", label: "RON watch", icon: Activity },
  { id: "health", label: "Data health", icon: AlertTriangle },
];

const mono = "'JetBrains Mono', monospace";

export default function MarketScannersWidget() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("watch");
  const { snapshots } = useRonSnapshots();

  const rows: ScannerSnapshotInput[] = useMemo(
    () => [...snapshots.values()].map((s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      bar_time: s.bar_time,
      open: Number(s.open),
      close: Number(s.close),
      data_health: s.data_health,
      state: ronStateFrom(s.features)?.state ?? null,
      bias: ronBiasFrom(s.features),
    })),
    [snapshots],
  );

  const gainers = useMemo(() => topMovers(rows, "up"), [rows]);
  const losers = useMemo(() => topMovers(rows, "down"), [rows]);
  const watch = useMemo(() => ronWatchList(rows), [rows]);
  const health = useMemo(() => dataHealthIssues(rows), [rows]);

  const open = (symbol: string, timeframe: string) => navigate(ronDecisionRecordHref(symbol, timeframe));

  const rowStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
    padding: "8px 20px", borderTop: `1px solid ${C.border}`, cursor: "pointer",
    background: "transparent", width: "100%", textAlign: "left" as const,
  };

  const emptyLine = (text: string) => (
    <div style={{ padding: "14px 20px", fontSize: 11, color: C.sec, fontStyle: "italic" }}>{text}</div>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 20 }}
         data-testid="market-scanners">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ color: C.jade, fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Market scanners
          </span>
          <div style={{ fontSize: 10, color: C.sec, marginTop: 2 }}>
            Top {SCANNER_LIMIT} from your tracked markets · measured on the last completed bar, not a live tick
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const activeTab = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={activeTab}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                  color: activeTab ? C.jade : C.sec,
                  background: activeTab ? C.jade + "18" : "transparent",
                  border: `1px solid ${activeTab ? C.jade + "40" : C.border}`,
                  cursor: "pointer",
                }}
              >
                <Icon size={11} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {(tab === "gainers" || tab === "losers") && (
        (tab === "gainers" ? gainers : losers).length === 0
          ? emptyLine("No completed-bar move recorded in this direction for your tracked markets yet.")
          : (tab === "gainers" ? gainers : losers).map((m) => (
            <button key={m.symbol} style={rowStyle} onClick={() => open(m.symbol, m.timeframe)}
                    title={`Open the stored ${m.symbol} ${m.timeframe} RON record`}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{m.symbol}</span>
              <span style={{ fontSize: 10, color: C.sec, fontFamily: mono }}>
                {m.timeframe} bar · {formatAge(m.bar_time)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: mono, color: m.changePct >= 0 ? C.green : C.red }}>
                {m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(2)}%
              </span>
            </button>
          ))
      )}

      {tab === "watch" && (
        watch.length === 0
          ? emptyLine("No RON snapshot for your tracked markets yet.")
          : watch.map((w) => (
            <button key={w.symbol} style={rowStyle} onClick={() => open(w.symbol, w.timeframe)}
                    title={`Open the stored ${w.symbol} ${w.timeframe} RON record`}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{w.symbol}</span>
              <span style={{ fontSize: 10, color: C.sec, fontFamily: mono }}>
                {w.timeframe} bar · {formatAge(w.bar_time)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: mono, color: ronStateColor(w.state as RonState) }}>
                {w.state}{w.bias ? ` ${w.bias}` : ""}
              </span>
            </button>
          ))
      )}

      {tab === "health" && (
        health.length === 0
          ? emptyLine("Every tracked market reports healthy source data on its latest stored bar.")
          : health.map((h) => (
            <button key={h.symbol} style={rowStyle} onClick={() => open(h.symbol, h.timeframe)}
                    title={`Open the stored ${h.symbol} ${h.timeframe} RON record`}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{h.symbol}</span>
              <span style={{ fontSize: 10, color: C.sec, fontFamily: mono }}>
                {h.timeframe} bar · {formatAge(h.bar_time)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: mono, color: C.amber }}>{h.data_health}</span>
            </button>
          ))
      )}
    </div>
  );
}
