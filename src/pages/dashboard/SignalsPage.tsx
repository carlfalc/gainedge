/**
 * GAINEDGE_SIGNALS_V1 — Signals & Opportunities.
 *
 * Thin composition over two clearly separated sources:
 *   • RON Opportunities  → stored RON decision records (`ron-decision-read`)
 *   • Falconer Signals   → `falconer_trades` live mode, user-scoped
 *   • History            → backtest OR finished live records, never blended
 *
 * Nothing on this page places, mirrors or implies a broker order, and no lifecycle
 * state, probability or freshness value is invented client-side.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { C } from "@/lib/mock-data";
import SignalsSummary, { buildSummaryMetrics } from "@/components/signals/SignalsSummary";
import RonOpportunitiesTab from "@/components/signals/RonOpportunitiesTab";
import FalconerSignalsTab from "@/components/signals/FalconerSignalsTab";
import HistoryTab from "@/components/signals/HistoryTab";
import { PAGE_SUBTITLE, countToday, latestInstant } from "@/lib/signals-presentation";
import { useFalconerRecords, useRonOpportunities } from "@/services/signals-data";

/** Plain-English governance qualifier — records only, never order placement. */
export const SIGNAL_RECORDS_QUALIFIER = PAGE_SUBTITLE;

type TabId = "ron" | "falconer" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "ron", label: "RON Opportunities" },
  { id: "falconer", label: "Falconer Signals" },
  { id: "history", label: "History" },
];

/** Safe, minimal query-param reader: `?tab=falconer&symbol=XAUUSD`. */
function readTabParam(raw: string | null): TabId | null {
  return raw === "ron" || raw === "falconer" || raw === "history" ? raw : null;
}

export default function SignalsPage() {
  const [params] = useSearchParams();
  const initialTab = readTabParam(params.get("tab"));
  const initialSymbol = (params.get("symbol") ?? "").trim();
  const [tab, setTab] = useState<TabId>(initialTab ?? "ron");
  const ron = useRonOpportunities();
  const live = useFalconerRecords("live");
  const backtest = useFalconerRecords("backtest");

  const metrics = useMemo(() => buildSummaryMetrics({
    ronRecordCount: ron.loading ? null : ron.opportunities.filter((o) => o.view).length,
    ronLatestAsOf: ron.loading
      ? null
      : latestInstant(ron.opportunities.map((o) => o.view?.decision.as_of ?? null)),
    liveRecordCount: live.loading || !live.signedIn ? null : live.records.length,
    liveLatestOpenedAt: live.loading ? null : latestInstant(live.records.map((r) => r.opened_at)),
    liveRecordsToday: live.loading || !live.signedIn ? null : countToday(live.records.map((r) => r.opened_at)),
  }), [ron.loading, ron.opportunities, live.loading, live.signedIn, live.records]);

  const refreshAll = () => { ron.reload(); live.reload(); backtest.reload(); };

  return (
    <div className="space-y-4 p-4 sm:p-5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: C.text }}>Signals &amp; Opportunities</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: C.sec }}>
            {PAGE_SUBTITLE}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs uppercase tracking-widest"
          style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <SignalsSummary metrics={metrics} />

      <div role="tablist" aria-label="Signals sections" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`signals-tab-btn-${t.id}`}
            onClick={() => setTab(t.id)}
            className="rounded-lg px-3 py-1.5 text-xs"
            style={{
              background: tab === t.id ? C.cardH : "transparent",
              border: `1px solid ${C.border}`,
              color: tab === t.id ? C.text : C.sec,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ron" && <RonOpportunitiesTab feed={ron} />}
      {tab === "falconer" && <FalconerSignalsTab feed={live} initialSymbol={initialSymbol} />}
      {tab === "history" && <HistoryTab liveFeed={live} backtestFeed={backtest} />}
    </div>
  );
}
