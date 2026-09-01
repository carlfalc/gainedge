/**
 * GAINEDGE_DASHBOARD_UI_V1 — a single tracked-instrument tile.
 *
 * Extracted verbatim in substance from InstrumentTrackingPanel: every statement is
 * still sourced from a stored record (broker quote, RON snapshot, Falconer trade).
 * What changed is DENSITY, not truth:
 *   - a compact "at a glance" head that always fits without scrolling
 *   - all long-form evidence moved behind explicit disclosure sections
 *   - one calm empty state instead of repeated warning lines
 *   - an "Ask RON" deep link carrying the exact stored {symbol, timeframe} pair
 */
import { useState } from "react";
import { Clock, ArrowUp, ArrowDown, Circle, X, Eye, ExternalLink, LineChart, MessageSquare, GripVertical, HelpCircle } from "lucide-react";
import WhatToDoNowModal from "@/components/dashboard/WhatToDoNowModal";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { C as CBase } from "@/lib/mock-data";
import { formatAge, nextScanSeconds, formatCountdown, secondsUntilMarketOpen } from "@/lib/expiry";
import { formatPrintedLocal } from "@/lib/signal-time";
import { explainPatterns, summariseStructure, fmtLevel } from "@/lib/pattern-interpretation";
import { deriveFalconerSignalState } from "@/lib/falconer-signal-state";
import { ronDecisionRecordTitle } from "@/lib/ron-decision-explorer";
import { askRonContextTitle } from "@/lib/ask-ron-context";
import { isQuoteFresh, type BrokerQuote } from "@/services/live-quotes";
import type { LiveMarketRow } from "@/services/broker-data";
import PriceProvenanceBadge from "@/components/market/PriceProvenanceBadge";
import CalibrationScopeBadge from "@/components/market/CalibrationScopeBadge";
import {
  ronStateFrom, ronStateColor, ronBiasFrom, ronBiasColor, ronStateLabel, useRonSnapshotDay,
  CURRENT_RON_FEATURE_VERSION, CURRENT_RON_LABEL_VERSION, CURRENT_RON_QUALITY_VERSION,
  type RonSnapshotRow, type RonOutcomeStats, type RonDataQuality, type RonRebuildStatus,
} from "@/services/ron-snapshots";
import { assessDataHealth } from "@/lib/market-hours";
import { classifyRonSession } from "@/lib/ron-sessions";
import { summariseSessionsToday } from "@/lib/ron-session-day";
import { ronEvidenceChips, ronSummarySentence, ronEmptyState } from "@/lib/dashboard-ron-summary";

const C = { ...CBase, text: "#FFFFFF", sec: "#FFFFFF" };

export interface InstrumentScanRow {
  id: string; symbol: string;
  direction: string | null;
  entry_price: number | null; take_profit: number | null; stop_loss: number | null;
  risk_reward: string | null;
  reasoning: string;
  verdict: string;
  scanned_at: string | null;
  status: string | null;
  closed_at: string | null;
}

const adxLabel = (v: number) =>
  v < 20 ? "weak / no trend" : v < 25 ? "trend waking up" : v < 40 ? "stronger trend" : "very strong trend";
const rsiLabel = (v: number) =>
  v > 70 ? "overbought zone" : v < 30 ? "oversold zone" : v >= 45 && v <= 55 ? "neutral" : v < 45 ? "slightly weak" : "slightly strong";
const stochLabel = (v: number) =>
  v < 20 ? "near oversold zone" : v < 40 ? "low momentum zone" : v <= 60 ? "mid momentum" : v <= 80 ? "building upward momentum" : "near overbought zone";
const num = (v: unknown, dp = 1): string =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(dp);
const macdLabel = (s: unknown) => (!s ? "—" : String(s).replace(/_/g, " "));

const chipColor = (tone: string) => (tone === "up" ? C.green : tone === "down" ? C.red : C.text);

const iconBtn = {
  display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600,
  color: C.jade, background: "transparent", border: `1px solid ${C.jade}30`,
  borderRadius: 5, padding: "1px 6px", cursor: "pointer",
} as const;

const sectionLabel = {
  fontSize: 11, color: C.text, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4,
};

export interface InstrumentCardProps {
  inst: InstrumentScanRow;
  tf: string;
  snap: RonSnapshotRow | undefined;
  live: LiveMarketRow | undefined;
  quote: BrokerQuote | undefined;
  dataQuality: RonDataQuality | null;
  outcomeStats: RonOutcomeStats | null;
  rebuild: RonRebuildStatus | null;
  /** True when the user has expanded the full evidence for this tile. */
  expanded: boolean;
  onToggleExpanded: () => void;
  onHide: () => void;
  onOpenChart: () => void;
  onOpenRonRecord: () => void;
  onAskRon: () => void;
  isDragOver?: boolean;
  isDragging?: boolean;
  dragHandlers?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

export default function InstrumentCard({
  inst, tf, snap, live, quote, dataQuality, outcomeStats, rebuild,
  expanded, onToggleExpanded, onHide, onOpenChart, onOpenRonRecord, onAskRon,
  isDragOver = false, isDragging = false, dragHandlers,
}: InstrumentCardProps) {
  const [whatToDoOpen, setWhatToDoOpen] = useState(false);

  // ── Falconer signal history — explicitly NOT RON analysis. ──
  const sig = deriveFalconerSignalState(
    { direction: inst.direction, opened_at: inst.scanned_at, status: inst.status, closed_at: inst.closed_at },
    tf,
  );
  const hasSignal = sig.hasSignal;
  const active = sig.isActive;
  const sigDir = sig.direction;
  const badgeColor = sig.badgeTone === "active-long" ? C.green : sig.badgeTone === "active-short" ? C.red : C.muted;
  const countdown = nextScanSeconds(tf);

  const f = snap?.features ?? null;
  const ron = ronStateFrom(f);
  const health = assessDataHealth(snap?.bar_time ?? null, 15);
  const sess = snap ? classifyRonSession(snap.bar_time) : null;
  const quarantined = inst.symbol === "XAUUSD" && !!dataQuality?.currentSourceQuarantined;

  const patternExplanations = explainPatterns(snap?.patterns as any[] | undefined, 3);
  const structureSummary = summariseStructure((snap?.patterns as any[] | undefined)?.slice(0, 3) ?? []);

  const liveFresh = !!live && Date.now() - new Date(live.updated_at).getTime() < 10 * 60 * 1000;
  const sparkColor = live?.price_direction === "up" ? C.green : live?.price_direction === "down" ? C.red : C.amber;
  const sparkData = liveFresh && live?.sparkline_data?.length ? live.sparkline_data : null;
  const liveRsi = (liveFresh ? live?.rsi : null) ?? (f?.rsi14 ?? null);
  const liveAdx = (liveFresh ? live?.adx : null) ?? (f?.adx14 ?? null);
  const liveMacd = (liveFresh ? live?.macd_status : null) ?? (f?.macd_state ?? null);
  const liveStoch = (liveFresh ? live?.stoch_rsi : null) ?? (f?.stoch_rsi ?? null);

  const quoteFresh = isQuoteFresh(quote);
  const quoteInstant = quote?.broker_time ?? quote?.fetched_at ?? null;
  const quoteSourceLabel = quote?.broker_time ? "broker quote time" : "server fetch time";

  // Today's stored bars, fetched only while the detail disclosure is open.
  const { rows: dayRows, loading: dayLoading } = useRonSnapshotDay(inst.symbol, snap?.timeframe ?? tf, expanded);
  const sessionsToday = summariseSessionsToday(dayRows);

  const chips = ronEvidenceChips(f);
  const summary = ronSummarySentence(f);
  const empty = ronEmptyState({ hasQuote: !!quote?.bid, hasSignalHistory: hasSignal, symbol: inst.symbol });

  const stateText = quarantined
    ? "NO TRADABLE SETUP"
    : ron ? ronStateLabel(ron.state, ronBiasFrom(f)) : "DATA BUILDING";
  const stateColor = quarantined ? C.amber : ron ? (ronBiasColor(ronBiasFrom(f)) ?? ronStateColor(ron.state)) : C.muted;

  return (
    <div
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      onDragEnd={dragHandlers?.onDragEnd}
      data-testid={`instrument-card-${inst.symbol}`}
      style={{
        background: C.card,
        border: `1px solid ${isDragOver ? C.jade : C.border}`,
        borderRadius: 14, padding: 16,
        opacity: isDragging ? 0.5 : 1,
        transition: "opacity .3s, border-color .2s",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* ── Head: identity + actions ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {active && sigDir === "LONG" ? (
            <ArrowUp size={16} color={C.green} strokeWidth={3} />
          ) : active && sigDir === "SHORT" ? (
            <ArrowDown size={16} color={C.red} strokeWidth={3} />
          ) : (
            <Circle size={16} color={C.muted} fill={C.muted} />
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{inst.symbol}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.jade, background: C.jade + "18", padding: "1px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>
            {tf}
          </span>
          {quote && (
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: quoteFresh ? C.green : C.muted, display: "inline-block" }}
              title={quoteFresh ? "Live broker quote streaming" : "No fresh broker quote"}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenChart(); }}
            draggable={false}
            style={iconBtn}
            title={`Open the GainEdge chart for ${inst.symbol}`}
            aria-label={`Open ${inst.symbol} chart`}
            data-testid={`instrument-card-chart-top-${inst.symbol}`}
          >
            <LineChart size={10} /> Chart ↗
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            draggable={!!dragHandlers}
            onDragStart={dragHandlers?.onDragStart}
            data-testid={`instrument-card-drag-${inst.symbol}`}
            title="Drag here to move this tile"
            aria-label={`Move ${inst.symbol} card`}
            style={{ display: "flex", alignItems: "center", cursor: dragHandlers ? "grab" : "default", opacity: 0.5, padding: 2 }}
          >
            <GripVertical size={14} color={C.text} />
          </span>
          <div
            style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: badgeColor + "20", color: badgeColor }}
            title={hasSignal
              ? `Falconer signal history (not RON analysis) · printed ${formatPrintedLocal(inst.scanned_at!)} local time`
              : "No Falconer signal has been printed for this instrument"}
          >
            {sig.badgeText}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, opacity: 0.4, display: "flex" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
            title="Hide this card"
            aria-label={`Hide ${inst.symbol} card`}
          >
            <X size={14} color={C.text} />
          </button>
        </div>
      </div>

      {/* ── Price + RON state, side by side ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {quote && quote.bid != null ? (
            <>
              <div
                style={{
                  fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
                  color: !quoteFresh ? C.text : quote.direction === "up" ? C.green : quote.direction === "down" ? C.red : C.text,
                }}
                title={`${quote.symbol} → ${quote.broker_symbol ?? "—"} · bid ${quote.bid} / ask ${quote.ask ?? "—"} · ${quoteSourceLabel} ${quoteInstant}`}
              >
                {quote.bid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
              </div>
              <div style={{ fontSize: 11, marginTop: 2, color: quoteFresh ? C.text : C.amber, fontFamily: "'JetBrains Mono', monospace" }}>
                {quoteFresh
                  ? `Live broker bid · ask ${quote.ask ?? "—"} · ${formatAge(quoteInstant!)}`
                  : `Market closed / feed idle · last quote ${formatAge(quoteInstant!)}`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.amber, fontStyle: "italic" }}>No live price feed</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            <PriceProvenanceBadge kind="live_quote" timestamp={quoteInstant} />
            <CalibrationScopeBadge symbol={inst.symbol} timeframe={tf} compact />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={sectionLabel}>RON state</div>
          <div
            data-testid={`ron-state-${inst.symbol}`}
            style={{ fontSize: 15, fontWeight: 700, color: stateColor, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {stateText}
          </div>
          <div
            style={{
              fontSize: 11, marginTop: 2, fontWeight: 600,
              color: health.label === "LIVE" ? C.jade : health.label === "STALE / FEED BEHIND" ? C.red : C.amber,
            }}
            title={health.detail}
          >
            {health.label}{snap ? ` · ${formatAge(snap.bar_time)}` : ""}
          </div>
          {snap && (
            <div style={{ fontSize: 11, color: snap.data_health === "healthy" ? C.text : C.amber, fontFamily: "'JetBrains Mono', monospace" }}>
              {snap.timeframe} bar {new Date(snap.bar_time).toISOString().slice(5, 16).replace("T", " ")}Z
              {snap.data_health !== "healthy" ? ` · ${snap.data_health}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* ── One-line analyst summary, or one calm empty state ── */}
      {snap && f ? (
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }} data-testid={`ron-summary-${inst.symbol}`}>
          <span style={{ color: C.jade, fontWeight: 600 }}>RON: </span>{summary}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.amber, lineHeight: 1.5 }} data-testid={`ron-empty-${inst.symbol}`}>
          <span style={{ fontWeight: 700 }}>{empty.headline}</span> — {empty.note}
          <div style={{ color: C.text, opacity: 0.85, marginTop: 2 }}>
            Available: {empty.available.length ? empty.available.join(", ") : "nothing yet"} · Not available: {empty.unavailable.join(", ")}
          </div>
        </div>
      )}

      {/* ── Evidence chips + sparkline ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {chips.length > 0 ? chips.map((c) => (
            <span
              key={c.label}
              title={c.title}
              style={{
                fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 5,
                border: `1px solid ${C.border}`, color: chipColor(c.tone),
                fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
              }}
            >
              {c.label} {c.value}
            </span>
          )) : (
            <span style={{ fontSize: 11, color: C.text, opacity: 0.7, fontStyle: "italic" }}>No stored indicator evidence</span>
          )}
        </div>
        {sparkData ? (
          <Sparkline data={sparkData} color={sparkColor} w={96} h={28} />
        ) : (
          <span style={{ fontSize: 11, color: C.text, opacity: 0.6, fontStyle: "italic", whiteSpace: "nowrap" }}
                title="No genuine intraday series available; nothing is synthesised.">
            no series
          </span>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenChart(); }}
          onMouseDown={(e) => e.stopPropagation()} draggable={false}
          style={iconBtn} title={`Open the GainEdge chart for ${inst.symbol}`} aria-label={`Open ${inst.symbol} chart`}
        >
          <LineChart size={10} /> Chart ↗
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenRonRecord(); }}
          onMouseDown={(e) => e.stopPropagation()} draggable={false}
          style={iconBtn} title={ronDecisionRecordTitle(inst.symbol, tf)} aria-label={ronDecisionRecordTitle(inst.symbol, tf)}
        >
          <Eye size={10} /> RON record ↗
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAskRon(); }}
          onMouseDown={(e) => e.stopPropagation()} draggable={false}
          style={iconBtn} title={askRonContextTitle(inst.symbol, tf)} aria-label={askRonContextTitle(inst.symbol, tf)}
        >
          <MessageSquare size={10} /> Ask RON ↗
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
          onMouseDown={(e) => e.stopPropagation()} draggable={false}
          style={{ ...iconBtn, color: C.text, borderColor: C.border }}
          aria-expanded={expanded}
          title={expanded ? "Hide the full stored evidence" : "Show the full stored evidence"}
        >
          <ExternalLink size={10} /> {expanded ? "Less detail" : "More detail"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: countdown === -1 ? C.amber : C.text, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 3 }}>
          <Clock size={9} />
          {countdown === -1 ? `Closed · opens in ${formatCountdown(secondsUntilMarketOpen())}` : `Next scan ${formatCountdown(countdown)}`}
        </span>
      </div>

      {/* ── On-demand plain-English briefing ── */}
      <div>
        <button
          onClick={(e) => { e.stopPropagation(); setWhatToDoOpen(true); }}
          onMouseDown={(e) => e.stopPropagation()} draggable={false}
          data-testid={`what-to-do-now-${inst.symbol}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 700,
            color: C.jade, background: "transparent", border: `1px solid ${C.jade}55`,
            borderRadius: 7, padding: "5px 12px", cursor: "pointer",
          }}
          title={`Run RON now and get a plain-English briefing for ${inst.symbol} ${tf}`}
        >
          <HelpCircle size={14} /> What to do now?
        </button>
      </div>

      {whatToDoOpen && (
        <WhatToDoNowModal
          symbol={inst.symbol}
          timeframe={tf}
          quoteFresh={quote ? isQuoteFresh(quote) : undefined}
          marketOpen={countdown !== -1}
          onClose={() => setWhatToDoOpen(false)}
        />
      )}


      {/* ── Full evidence (disclosure) ── */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid={`instrument-detail-${inst.symbol}`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 13, color: C.text, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <span>ADX <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{num(liveAdx)}</span>{liveAdx != null && <span style={{ fontSize: 12 }}> - {adxLabel(Number(liveAdx))}</span>}</span>
            <span>RSI <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{num(liveRsi)}</span>{liveRsi != null && <span style={{ fontSize: 12 }}> - {rsiLabel(Number(liveRsi))}</span>}</span>
            <span>MACD <span style={{ color: String(liveMacd).startsWith("bullish") ? C.green : String(liveMacd).startsWith("bearish") ? C.red : C.text, fontWeight: 600 }}>{macdLabel(liveMacd)}</span></span>
            <span>StochRSI <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{num(liveStoch)}</span>{liveStoch != null && <span style={{ fontSize: 12 }}> - {stochLabel(Number(liveStoch))}</span>}</span>
          </div>

          {snap && f && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 13, color: C.text, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <span>Completed {snap.timeframe} close <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{snap.close}</span></span>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <PriceProvenanceBadge kind="completed_bar" timestamp={snap.bar_time} timeframe={snap.timeframe} />
              </span>
              <span>ATR% <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{num(f.atr_pct, 3)}</span></span>
              <span>Regime <span>{String(f.regime ?? "—").replace(/_/g, " ")}</span></span>
              <span>
                Context <span style={{ color: sess?.overlap ? C.jade : C.text, fontWeight: sess?.overlap ? 700 : 400 }}>{sess ? sess.label : "—"}</span>
              </span>
              <span style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                {sess
                  ? `${sess.active.length ? sess.active.join(" + ") : "no cash session"}` +
                    `${sess.minutes_into_session != null ? ` · ${sess.minutes_into_session}m in` : ""}` +
                    `${sess.in_asian_range_window ? " · inside Asian range window 22:00-06:00Z" : ""}`
                  : ""}
              </span>
              {inst.symbol === "XAUUSD" && dataQuality && (
                <span
                  style={{ gridColumn: "1 / -1", fontSize: 12, color: quarantined ? C.amber : C.text }}
                  title={`Deterministic source-data quality v${CURRENT_RON_QUALITY_VERSION} for source anchor ${dataQuality.currentBar ?? "unavailable"}. Historical detail: ${dataQuality.critical} critical, ${dataQuality.warning} warning flags across all stored history. Raw candle history is never modified.`}
                >
                  Current source: {!dataQuality.currentBar ? "Unavailable" : quarantined ? "Quarantined" : "Healthy"}
                </span>
              )}
              <span style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                Probability: {ron ? "Not calibrated yet · building evidence" : "Not calibrated yet"} · completed bar close, not a live tick quote.
              </span>
              <span style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                {rebuild && !rebuild.complete
                  ? `Historical evidence: rebuilding (clean lineage quality v${CURRENT_RON_QUALITY_VERSION} · feature v${CURRENT_RON_FEATURE_VERSION} · label v${CURRENT_RON_LABEL_VERSION}). Nothing on this dashboard is derived from it.`
                  : `Outcome labels (research only, label v${CURRENT_RON_LABEL_VERSION}, feature v${CURRENT_RON_FEATURE_VERSION}, XAUUSD 15m): ${outcomeStats
                    ? `${outcomeStats.labelled.toLocaleString()} labelled, ${outcomeStats.excluded.toLocaleString()} excluded (venue-closed minutes and/or missing 1m candles). Nothing shown on this dashboard is derived from them.`
                    : "loading"}`}
              </span>
            </div>
          )}

          {/* Sessions so far today — read straight from the stored bars of this UTC day. */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }} data-testid={`instrument-sessions-today-${inst.symbol}`}>
            <div style={sectionLabel}>Sessions today (so far)</div>
            {dayLoading && sessionsToday.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text, opacity: 0.7 }}>Loading stored bars for today…</div>
            ) : sessionsToday.length === 0 ? (
              <div style={{ fontSize: 12, color: C.text, opacity: 0.7 }}>No stored bars for this UTC day yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sessionsToday.map((s) => (
                  <div key={s.session} style={{ fontSize: 12, color: C.text, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    <span style={{ fontWeight: 700 }}>{s.label}</span>
                    <span style={{ opacity: 0.7 }}> · {s.bars} bar{s.bars === 1 ? "" : "s"} · </span>
                    <span style={{
                      fontWeight: 600,
                      color: s.structure === "trend_up" ? C.green : s.structure === "trend_down" ? C.red : s.structure === "ranging" ? C.amber : C.text,
                    }}>
                      {s.structureLabel}
                    </span>
                    <span> · {s.noFormedPatterns ? "No formed patterns" : `Patterns: ${s.patterns.join(", ")}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Patterns — dated, and clearly historical structure, never "current". */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={sectionLabel}>Pattern interpretation</div>
            {snap && patternExplanations.length > 0 ? (
              <>
                <div style={{ fontSize: 11, color: C.text, opacity: 0.85, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  Detected on the completed {snap.timeframe} bar {formatPrintedLocal(snap.bar_time)} local · {formatAge(snap.bar_time)}
                </div>
                {structureSummary && (
                  <div style={{ fontSize: 12, color: C.amber, marginBottom: 6, overflowWrap: "anywhere" }}>{structureSummary}</div>
                )}
                {patternExplanations.map((e, i) => {
                  const raw = (snap.patterns as any[] | undefined)?.[i] ?? {};
                  // Patterns are detected on a completed bar: use the pattern's own
                  // stored stamp when present, otherwise the snapshot's bar time.
                  const at: string = raw.detected_at ?? raw.bar_time ?? raw.timestamp ?? snap.bar_time;
                  const ptf: string = raw.timeframe ?? snap.timeframe;
                  return (
                  <details key={i} open={i === 0} style={{ marginBottom: 6 }}>
                    <summary style={{ cursor: "pointer", listStyle: "revert" }} title={`Show interpretation for ${e.title}`}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: e.direction === "bullish" ? C.green : e.direction === "bearish" ? C.red : C.text }}>
                        {e.title} ({ptf}) at {formatPrintedLocal(at)}
                      </span>
                    </summary>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                      <div style={{ fontSize: 11, opacity: 0.85, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>
                        RON read this on the {ptf} timeframe · completed bar {formatPrintedLocal(at)} local · {formatAge(at)}
                      </div>

                      <div>{e.meaning}</div>
                      <div style={{ marginTop: 2 }}><span style={{ color: C.green }}>Stronger if:</span> {e.strengthens}</div>
                      <div style={{ marginTop: 2 }}><span style={{ color: C.red }}>Weaker if:</span> {e.weakens}</div>
                      {e.levels.length > 0 && (
                        <div style={{ marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                          Detected levels: {e.levels.map((l) => `${l.label} ${fmtLevel(l.value)}`).join(" · ")}
                        </div>
                      )}
                    </div>
                  </details>
                  );
                })}
                <div style={{ fontSize: 11, color: C.text, opacity: 0.85, marginTop: 4, overflowWrap: "anywhere" }}>
                  Educational context on detected chart structure — not a trade recommendation, and not a RON opportunity.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.text, opacity: 0.85 }}>
                No pattern detected on the latest stored bar.
              </div>
            )}
          </div>

          {/* RON opportunity — truthful placeholder until calibration exists. */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ ...sectionLabel, color: C.jade }}>RON opportunity</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>No qualified RON opportunity yet</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 13, color: C.text }}>
              <div>Probability: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>Not calibrated yet</span></div>
              <div>Entry: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span></div>
              <div>Stop: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span></div>
              <div>Targets: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span></div>
              <div>R:R: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span></div>
            </div>
          </div>

          {/* Falconer signal history — clearly separate from RON. */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={sectionLabel}>Signal history</div>
            {hasSignal ? (
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: C.text, overflowWrap: "anywhere" }}
                         title="Historical Falconer signal — separate from RON analysis">
                  Falconer {sigDir} · printed {formatPrintedLocal(inst.scanned_at!)} · {formatAge(inst.scanned_at!)}
                  {!active ? (sig.isOpenFalconerSignal ? " · Expired / historical" : " · Closed") : ""}
                </summary>
                <div style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 1.5 }}>
                  {!active && (
                    <div style={{ color: C.amber, fontWeight: 600, marginBottom: 2 }}>
                      {sig.isOpenFalconerSignal ? "Expired / historical — not a current signal." : "Closed trade — not a current signal."}
                    </div>
                  )}
                  {sig.closedMeta && <div style={{ opacity: 0.85 }}>{sig.closedMeta}</div>}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Entry {inst.entry_price ?? "—"} · SL {inst.stop_loss ?? "—"} · TP {inst.take_profit ?? "—"} · R:R {inst.risk_reward ?? "—"}
                  </div>
                  <div style={{ opacity: 0.85 }}>Source: Falconer · status {sig.status ?? "—"}{inst.reasoning ? ` · ${inst.reasoning}` : ""}</div>
                </div>
              </details>
            ) : (
              <div style={{ fontSize: 12, color: C.text, fontStyle: "italic" }}>No signal history</div>
            )}
          </div>

          {/* Full stored reasoning line. */}
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.jade, fontWeight: 600 }}>Stored evidence: </span>
            {ron ? (
              <>
                {ron.why}
                <div style={{ marginTop: 4 }}>What would change it: {ron.next}</div>
              </>
            ) : (
              "DATA BUILDING — RON has not computed a snapshot for this instrument yet."
            )}
          </div>
        </div>
      )}
    </div>
  );
}
