/**
 * GAINEDGE_SIGNALS_V1 — shared Falconer record list (live tab and history tab).
 *
 * Presentation only. Values come verbatim from `falconer_trades` rows; status and
 * trigger tokens are mapped through the confirmed vocabulary in
 * `signals-presentation.ts`, and unknown tokens are prettified without reinterpretation.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { C } from "@/lib/mock-data";
import {
  STORED_PNL_LABEL, chartsHref, formatLocalDateTime, formatPrice, formatStoredPnl,
  isManagedStatus, presentFalconerStatus, presentFalconerTrigger, relativeAge,
} from "@/lib/signals-presentation";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { askRonContextHref } from "@/lib/ask-ron-context";
import type { FalconerRecord } from "@/services/signals-data";

function Chip({ text, tone, testId }: { text: string; tone: "neutral" | "active"; testId?: string }) {
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px]"
      style={{
        background: tone === "active" ? `${C.jade}14` : `${C.muted}1F`,
        color: tone === "active" ? C.jade : C.sec,
        border: `1px solid ${C.border}`,
      }}
      data-testid={testId}
    >
      {text}
    </span>
  );
}

function RecordRow({ r, modeLabel }: { r: FalconerRecord; modeLabel: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const status = presentFalconerStatus(r.status);
  const trigger = presentFalconerTrigger(r.trigger_type);
  const managed = isManagedStatus(r.status);
  const direction = (r.direction || "").toUpperCase();

  return (
    <div
      className="rounded-lg"
      style={{ background: C.bg2, border: `1px solid ${C.border}` }}
      data-testid={`falconer-record-${r.id}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-left"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: C.sec }} />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: C.sec }} />}
        <span className="text-sm font-semibold" style={{ color: C.text }}>{r.symbol}</span>
        <span className="text-xs" style={{ color: C.sec }}>{r.timeframe}</span>
        <span className="text-xs" style={{ color: C.sec }}>{direction || "—"}</span>
        <Chip text={modeLabel} tone="neutral" testId={`falconer-mode-${r.id}`} />
        <Chip text={status.label} tone={managed ? "active" : "neutral"} testId={`falconer-status-${r.id}`} />
        <Chip text={trigger.label} tone="neutral" />
        <span className="ml-auto text-[11px]" style={{ color: C.muted }}>
          {formatLocalDateTime(r.opened_at)} · {relativeAge(r.opened_at)}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3 text-xs" style={{ borderColor: C.border }}>
          {trigger.detail && (
            <p className="leading-relaxed" style={{ color: C.sec }}>{trigger.detail}</p>
          )}
          {(trigger.unknown || status.unknown) && (
            <p className="leading-relaxed" style={{ color: C.muted }} data-testid={`falconer-unknown-${r.id}`}>
              Some stored tokens on this record are not in the confirmed vocabulary, so they are shown
              as stored without any assumed meaning.
            </p>
          )}
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <div><p style={{ color: C.sec }}>Entry</p><p style={{ color: C.text }}>{formatPrice(r.entry_price)}</p></div>
            <div><p style={{ color: C.sec }}>Stop loss</p><p style={{ color: C.red }}>{formatPrice(r.sl_price)}</p></div>
            <div><p style={{ color: C.sec }}>TP1 / TP2 / TP3</p>
              <p style={{ color: C.jade }}>
                {formatPrice(r.tp1_price)} / {formatPrice(r.tp2_price)} / {formatPrice(r.tp3_price)}
              </p>
            </div>
            <div><p style={{ color: C.sec }}>Size (stored qty)</p>
              <p style={{ color: C.text }}>{r.qty === null || r.qty === undefined ? "—" : r.qty}</p></div>
            <div><p style={{ color: C.sec }}>Opened</p>
              <p style={{ color: C.text }}>{formatLocalDateTime(r.opened_at)}</p></div>
            <div><p style={{ color: C.sec }}>Closed</p>
              <p style={{ color: C.text }}>{r.closed_at ? formatLocalDateTime(r.closed_at) : "—"}</p></div>
            <div><p style={{ color: C.sec }}>{STORED_PNL_LABEL}</p>
              <p style={{ color: (r.pnl_usd ?? 0) >= 0 ? C.jade : C.red }} data-testid={`falconer-pnl-${r.id}`}>
                {formatStoredPnl(r.pnl_usd)}
              </p></div>
            <div><p style={{ color: C.sec }}>Stored commission / swap</p>
              <p style={{ color: C.text }}>
                {formatStoredPnl(r.commission_usd)} / {formatStoredPnl(r.swap_usd)}
              </p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate(chartsHref(r.symbol))}
              className="rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}>
              View chart
            </button>
            <button type="button" onClick={() => navigate(ronDecisionRecordHref(r.symbol, r.timeframe))}
              className="rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
              data-testid={`falconer-decision-link-${r.id}`}>
              RON decision record
            </button>
            <button type="button" onClick={() => navigate(askRonContextHref(r.symbol, r.timeframe))}
              className="rounded-lg px-2.5 py-1.5 text-xs"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}>
              Ask RON
            </button>
          </div>
          <p className="leading-relaxed" style={{ color: C.muted }}>
            The linked RON decision is a separate stored record. This Falconer row does not contain a
            RON evidence snapshot of its own.
          </p>
        </div>
      )}
    </div>
  );
}

export default function FalconerRecordList({ records, modeLabel }: {
  records: FalconerRecord[]; modeLabel: string;
}) {
  return (
    <div className="space-y-2">
      {records.map((r) => <RecordRow key={r.id} r={r} modeLabel={modeLabel} />)}
    </div>
  );
}
