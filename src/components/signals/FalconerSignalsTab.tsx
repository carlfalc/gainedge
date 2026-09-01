/**
 * GAINEDGE_SIGNALS_V1 — live Falconer strategy records.
 * Source: `falconer_trades` where `mode = 'live'`, scoped to the signed-in user.
 * Backtest records never appear here.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/mock-data";
import FalconerFilters, { EMPTY_FILTER, type FalconerFilterValue } from "@/components/signals/FalconerFilters";
import FalconerRecordList from "@/components/signals/FalconerRecordList";
import {
  FALCONER_RECORD_BANNER, STORED_PNL_NOTE, filterOptions, matchesSearch, presentFalconerStatus,
} from "@/lib/signals-presentation";
import type { FalconerFeed } from "@/services/signals-data";

export default function FalconerSignalsTab(
  { feed, initialSymbol = "" }: { feed: FalconerFeed; initialSymbol?: string },
) {
  const navigate = useNavigate();
  // Deep links may prefilter by symbol; manual filter interaction stays fully in control.
  const [filter, setFilter] = useState<FalconerFilterValue>(
    initialSymbol ? { ...EMPTY_FILTER, symbol: initialSymbol } : EMPTY_FILTER,
  );

  const rows = useMemo(() => feed.records.filter((r) =>
    (!filter.symbol || r.symbol === filter.symbol)
    && (!filter.status || r.status === filter.status)
    && (!filter.trigger || r.trigger_type === filter.trigger)
    && matchesSearch(filter.search, [r.symbol, r.status, r.trigger_type, r.timeframe, r.direction])
  ), [feed.records, filter]);

  return (
    <div className="space-y-3" data-testid="signals-tab-falconer">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-sm"
        style={{ background: `${C.amber}0F`, border: `1px solid ${C.border}`, color: C.amber }}
        data-testid="falconer-record-banner">
        {FALCONER_RECORD_BANNER}
        <span style={{ color: C.muted }}>Live-mode records only. {STORED_PNL_NOTE}</span>
      </div>

      {feed.error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-sm"
          style={{ background: `${C.red}12`, border: `1px solid ${C.red}55`, color: C.red }}>
          Couldn’t load Falconer records. <span style={{ color: C.sec }}>{feed.error}</span>
        </div>
      )}

      {!feed.signedIn && !feed.loading && (
        <p className="text-sm" style={{ color: C.sec }} data-testid="falconer-signed-out">
          You need to be signed in to view your Falconer strategy records.
        </p>
      )}

      {feed.loading && (
        <div className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live Falconer records…
        </div>
      )}

      {!feed.loading && feed.signedIn && feed.records.length === 0 && !feed.error && (
        <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}
          data-testid="falconer-empty">
          <p className="text-sm" style={{ color: C.text }}>No live Falconer records yet.</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>
            Live records are written only when the Falconer engine fires on a completed candle in live
            mode. Historical and simulated records are kept separately under History.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate("/dashboard/strategy")}
              className="rounded-lg px-2.5 py-1.5 text-sm"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.jade }}>
              Open Strategy settings
            </button>
            <button type="button" onClick={() => navigate("/dashboard/charts")}
              className="rounded-lg px-2.5 py-1.5 text-sm"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}>
              Go to Charts
            </button>
          </div>
        </section>
      )}

      {feed.records.length > 0 && (
        <>
          <FalconerFilters
            value={filter}
            onChange={setFilter}
            symbols={filterOptions(feed.records.map((r) => r.symbol))}
            statuses={filterOptions(feed.records.map((r) => r.status))}
            triggers={filterOptions(feed.records.map((r) => r.trigger_type))}
            statusLabel={(t) => presentFalconerStatus(t).label}
          />
          <p className="text-[13px]" style={{ color: C.muted }} data-testid="falconer-count">
            Showing {rows.length} of {feed.records.length} live records
          </p>
          <FalconerRecordList records={rows} modeLabel="Live" />
        </>
      )}
    </div>
  );
}
