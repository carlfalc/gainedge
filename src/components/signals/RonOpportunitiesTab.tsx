/**
 * GAINEDGE_SIGNALS_V1 — RON Opportunities lane.
 * Source: stored RON decision records only (`ron-decision-read`). No snapshot read,
 * no v6 fallback, no client-derived lifecycle state.
 */
import { Loader2 } from "lucide-react";
import { C } from "@/lib/mock-data";
import RonOpportunityCard from "@/components/signals/RonOpportunityCard";
import {
  NO_ACTIVE_OPPORTUNITY_LINE, isActiveOpportunityLifecycle,
} from "@/lib/ron-opportunity-context-presentation";
import type { RonOpportunityFeed } from "@/services/signals-data";

export const RON_LANE_NOTE =
  "Active RON opportunity context, read from stored evaluations of completed candles. "
  + "These are audit records for review — not live market state, not a trade instruction, "
  + "and no probability is published until calibration gates are met.";

export default function RonOpportunitiesTab({ feed, now }: { feed: RonOpportunityFeed; now?: Date }) {
  // Context-primary: only a stored opportunity-context record with an active stored
  // lifecycle produces a card. Nothing is manufactured from the readiness decision.
  const active = feed.opportunities.filter(
    (o) => o.context && isActiveOpportunityLifecycle(o.context.lifecycle),
  );

  return (
    <div className="space-y-3" data-testid="signals-tab-ron">
      <p className="text-xs leading-relaxed" style={{ color: C.sec }}>{RON_LANE_NOTE}</p>

      {feed.trackedWarning && (
        <p className="text-xs" style={{ color: C.amber }} data-testid="ron-tracked-warning">
          {feed.trackedWarning}
        </p>
      )}

      {feed.loading && (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse rounded-xl p-4"
              style={{ background: C.card, border: `1px solid ${C.border}`, minHeight: 148 }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: C.sec }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading stored RON records…
              </div>
            </div>
          ))}
        </div>
      )}

      {!feed.loading && active.length === 0 && (
        <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}
          data-testid="ron-lane-empty">
          <p className="text-sm" style={{ color: C.text }}>{NO_ACTIVE_OPPORTUNITY_LINE}</p>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>
            Nothing is inferred in the absence of a stored contextual record. A card appears here
            as soon as an opportunity context is stored for one of your tracked instruments.
          </p>
        </section>
      )}

      {!feed.loading && active.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((o) => (
            <RonOpportunityCard key={`${o.pair.symbol}|${o.pair.timeframe}`} item={o} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

