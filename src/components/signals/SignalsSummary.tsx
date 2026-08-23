/**
 * GAINEDGE_SIGNALS_V1 — page context strip + summary cards.
 * Every metric is either sourced from a loaded record or omitted entirely.
 * No fake zeros, no fabricated feed/quote freshness (this page has no quote source).
 */
import { C } from "@/lib/mock-data";
import { isMarketClosed } from "@/lib/expiry";
import { formatLocalDateTime, relativeAge } from "@/lib/signals-presentation";

export interface SummaryMetric {
  label: string;
  value: string;
  hint?: string;
}

/** Builds only the metrics that can be sourced truthfully. */
export function buildSummaryMetrics(input: {
  ronRecordCount: number | null;
  ronLatestAsOf: string | null;
  liveRecordCount: number | null;
  liveLatestOpenedAt: string | null;
  liveRecordsToday: number | null;
  now?: Date;
}): SummaryMetric[] {
  const now = input.now ?? new Date();
  const out: SummaryMetric[] = [];
  if (input.ronRecordCount !== null) {
    out.push({
      label: "Stored RON decisions",
      value: String(input.ronRecordCount),
      hint: "Tracked pairs with a stored decision record",
    });
  }
  if (input.ronLatestAsOf) {
    out.push({
      label: "Latest RON evaluation",
      value: relativeAge(input.ronLatestAsOf, now),
      hint: formatLocalDateTime(input.ronLatestAsOf),
    });
  }
  if (input.liveRecordCount !== null) {
    out.push({
      label: "Live Falconer records",
      value: String(input.liveRecordCount),
      hint: input.liveLatestOpenedAt
        ? `Latest ${relativeAge(input.liveLatestOpenedAt, now)}`
        : undefined,
    });
  }
  if (input.liveRecordsToday !== null) {
    out.push({ label: "Live records today", value: String(input.liveRecordsToday) });
  }
  return out;
}

export default function SignalsSummary({ metrics, now }: { metrics: SummaryMetric[]; now?: Date }) {
  const closed = isMarketClosed(now);
  return (
    <div className="space-y-3" data-testid="signals-summary">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-xs"
        style={{ background: C.bg2, border: `1px solid ${C.border}` }}
        data-testid="signals-market-strip"
      >
        <span
          className="rounded-md px-2 py-0.5"
          style={{
            background: closed ? `${C.muted}22` : `${C.jade}1A`,
            color: closed ? C.sec : C.jade,
          }}
        >
          {closed ? "Market closed (weekend)" : "Market open"}
        </span>
        <span style={{ color: C.muted }}>
          {closed
            ? "No new records are expected until the session reopens — this is not a data fault."
            : "New records appear as the engines evaluate completed candles."}
        </span>
      </div>

      {metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-3"
              style={{ background: C.card, border: `1px solid ${C.border}` }}
              data-testid={`signals-metric-${m.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <p className="text-[11px] uppercase tracking-widest" style={{ color: C.sec }}>{m.label}</p>
              <p className="mt-1 text-lg font-semibold" style={{ color: C.text }}>{m.value}</p>
              {m.hint && <p className="mt-0.5 text-[11px]" style={{ color: C.muted }}>{m.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
