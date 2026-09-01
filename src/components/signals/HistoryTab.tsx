/**
 * GAINEDGE_SIGNALS_V1 — historical strategy review.
 * Explicit mode switch: Backtest records and finished live records are never blended.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { C } from "@/lib/mock-data";
import FalconerFilters, { EMPTY_FILTER, type FalconerFilterValue } from "@/components/signals/FalconerFilters";
import FalconerRecordList from "@/components/signals/FalconerRecordList";
import {
  FALCONER_CLOSED_STATUSES, HISTORY_MODE_LABELS, HISTORY_MODE_NOTES, STORED_PNL_NOTE,
  filterOptions, matchesSearch, presentFalconerStatus, type HistoryMode,
} from "@/lib/signals-presentation";
import type { FalconerFeed } from "@/services/signals-data";

export default function HistoryTab({ liveFeed, backtestFeed }: {
  liveFeed: FalconerFeed; backtestFeed: FalconerFeed;
}) {
  const [mode, setMode] = useState<HistoryMode>("backtest");
  const [filter, setFilter] = useState<FalconerFilterValue>(EMPTY_FILTER);

  const feed = mode === "backtest" ? backtestFeed : liveFeed;
  const source = useMemo(
    () => (mode === "backtest"
      ? feed.records
      : feed.records.filter((r) => FALCONER_CLOSED_STATUSES.includes(r.status))),
    [feed.records, mode],
  );

  const rows = useMemo(() => source.filter((r) =>
    (!filter.symbol || r.symbol === filter.symbol)
    && (!filter.status || r.status === filter.status)
    && (!filter.trigger || r.trigger_type === filter.trigger)
    && matchesSearch(filter.search, [r.symbol, r.status, r.trigger_type, r.timeframe, r.direction])
  ), [source, filter]);

  const switchBtn = (active: boolean) => ({
    background: active ? C.cardH : "transparent",
    border: `1px solid ${C.border}`,
    color: active ? C.text : C.sec,
  });

  return (
    <div className="space-y-3" data-testid="signals-tab-history">
      <div className="flex flex-wrap items-center gap-2">
        {(["backtest", "live_history"] as HistoryMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setFilter(EMPTY_FILTER); }}
            aria-pressed={mode === m}
            data-testid={`history-mode-${m}`}
            className="rounded-lg px-2.5 py-1.5 text-sm"
            style={switchBtn(mode === m)}
          >
            {HISTORY_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <p className="text-sm leading-relaxed" style={{ color: C.sec }} data-testid="history-mode-note">
        {HISTORY_MODE_NOTES[mode]} {STORED_PNL_NOTE}
      </p>

      {feed.error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-sm"
          style={{ background: `${C.red}12`, border: `1px solid ${C.red}55`, color: C.red }}>
          Couldn’t load history records. <span style={{ color: C.sec }}>{feed.error}</span>
        </div>
      )}

      {feed.loading && (
        <div className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {HISTORY_MODE_LABELS[mode].toLowerCase()} records…
        </div>
      )}

      {!feed.loading && source.length === 0 && !feed.error && (
        <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}
          data-testid="history-empty">
          <p className="text-sm" style={{ color: C.text }}>
            No {HISTORY_MODE_LABELS[mode].toLowerCase()} records stored for your account.
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>
            {mode === "backtest"
              ? "Backtest records appear here after a Falconer backtest run has been stored."
              : "Finished live records appear here once the engine has closed a live signal."}
          </p>
        </section>
      )}

      {source.length > 0 && (
        <>
          <FalconerFilters
            value={filter}
            onChange={setFilter}
            symbols={filterOptions(source.map((r) => r.symbol))}
            statuses={filterOptions(source.map((r) => r.status))}
            triggers={filterOptions(source.map((r) => r.trigger_type))}
            statusLabel={(t) => presentFalconerStatus(t).label}
          />
          <p className="text-[13px]" style={{ color: C.muted }} data-testid="history-count">
            Showing {rows.length} of {source.length} {HISTORY_MODE_LABELS[mode].toLowerCase()} records
          </p>
          <FalconerRecordList records={rows} modeLabel={HISTORY_MODE_LABELS[mode]} />
        </>
      )}
    </div>
  );
}
