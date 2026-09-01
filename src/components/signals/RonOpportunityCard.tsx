/**
 * GAINEDGE_SIGNALS_V1 — one card per tracked instrument+timeframe, sourced ONLY from
 * the stored RON decision record read through `ron-decision-read`.
 *
 * There is no client-side lifecycle inference here: the card shows the stored state
 * token mapped through the existing conservative glossary, or an honest
 * "No stored RON decision yet" when the read contract returned nothing.
 */
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/mock-data";
import {
  EXECUTION_LINE, PROBABILITY_LINE, formatAge, presentState, summaryParagraph,
} from "@/lib/ron-decision-presentation";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { askRonContextHref } from "@/lib/ask-ron-context";
import { chartsHref, formatLocalDateTime } from "@/lib/signals-presentation";
import {
  OPPORTUNITY_SOURCE_LINE, isActiveOpportunityLifecycle, opportunityTone,
  presentDirection, presentLifecycle,
} from "@/lib/ron-opportunity-context-presentation";
import RonOpportunityContextPanel from "@/components/signals/RonOpportunityContextPanel";

import type { RonOpportunity } from "@/services/signals-data";


const TONE_COLOR: Record<string, string> = {
  blocked: C.red, caution: C.amber, supported: C.jade, neutral: C.sec,
};

function LinkRow({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const navigate = useNavigate();
  const btn = {
    background: C.cardH, border: `1px solid ${C.border}`, color: C.sec,
  } as const;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => navigate(chartsHref(symbol))}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={btn}
        data-testid={`signals-link-chart-${symbol}-${timeframe}`}
      >
        View chart
      </button>
      <button
        type="button"
        onClick={() => navigate(ronDecisionRecordHref(symbol, timeframe))}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={btn}
        data-testid={`signals-link-decision-${symbol}-${timeframe}`}
      >
        RON decision record
      </button>
      <button
        type="button"
        onClick={() => navigate(askRonContextHref(symbol, timeframe))}
        className="rounded-lg px-2.5 py-1.5 text-sm"
        style={btn}
        data-testid={`signals-link-ask-${symbol}-${timeframe}`}
      >
        Ask RON
      </button>
    </div>
  );
}

export default function RonOpportunityCard({ item, now }: { item: RonOpportunity; now?: Date }) {
  const { pair, view } = item;

  // GAINEDGE_RON_SIGNALS_CONTEXT_PRIMARY_V1 — when a stored contextual opportunity
  // record exists and its stored lifecycle is active, THAT record is the headline.
  // The orchestrator decision stays available strictly as secondary audit context.
  if (item.context && isActiveOpportunityLifecycle(item.context.lifecycle)) {
    const ctx = item.context;
    const lifecycle = presentLifecycle(ctx.lifecycle);
    const direction = presentDirection(ctx.direction_context);
    const ctxTone = TONE_COLOR[opportunityTone(ctx.lifecycle, ctx.data_state)] ?? C.sec;
    return (
      <section
        className="rounded-xl p-4"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
        data-testid={`ron-opportunity-${pair.symbol}-${pair.timeframe}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-semibold" style={{ color: C.text }}>
            {ctx.instrument} · {ctx.timeframe}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-sm"
            style={{ background: `${ctxTone}1A`, color: ctxTone }}
            data-testid="ron-opportunity-lifecycle"
          >
            {lifecycle.label}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-sm"
            style={{ background: `${C.muted}22`, color: C.sec }}
            data-testid="ron-opportunity-direction"
          >
            {direction.label}
          </span>
          <span className="text-[13px] uppercase tracking-widest" style={{ color: C.muted }}>
            {OPPORTUNITY_SOURCE_LINE}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: C.sec }}>
          <span data-testid="ron-opportunity-context-asof">
            Evaluated as of {formatLocalDateTime(ctx.evaluation_anchor)} · {formatAge(ctx.evaluation_anchor, now)}
          </span>
          <span>{PROBABILITY_LINE}</span>
          <span>{EXECUTION_LINE}</span>
        </div>

        <RonOpportunityContextPanel record={ctx} />

        {ctx.specialist_commentary_v1 && ctx.specialist_commentary_v1.length > 0 && (
          <section
            className="mt-3 rounded-lg p-3"
            style={{ background: C.bg2, border: `1px solid ${C.border}` }}
            data-testid="ron-specialist-historical-commentary"
          >
            <p className="text-[13px] uppercase tracking-widest" style={{ color: C.sec }}>
              Agent historical findings
            </p>
            <div className="mt-2 space-y-2">
              {ctx.specialist_commentary_v1.slice(0, 5).map((item) => (
                <article key={`${item.source_agent}|${item.setup_id}`}>
                  <p className="text-[13px] font-semibold" style={{ color: C.jade }}>
                    {item.source_agent.replace(/_/g, " ")} · {item.setup_id.replace(/_/g, " ")}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed" style={{ color: C.text }}>
                    {item.commentary}
                  </p>
                </article>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: C.muted }}>
              Historical observed outcomes and potential excursion only — not realised profit or a prediction for this bar.
            </p>
          </section>
        )}

        {ctx.limitations && ctx.limitations.length > 0 && (
          <ul className="mt-2 space-y-1" data-testid="ron-opportunity-limitations">
            {ctx.limitations.filter((s) => s?.trim()).slice(0, 4).map((s) => (
              <li key={s} className="break-words text-[13px] leading-relaxed" style={{ color: C.muted }}>— {s}</li>
            ))}
          </ul>
        )}

        {view && (
          <p className="mt-3 text-[13px]" style={{ color: C.muted }} data-testid="ron-opportunity-audit-note">
            Audit detail only — the separate readiness/calibration record for this pair is
            “{presentState(view.decision.state).label}”, evaluated {formatLocalDateTime(view.decision.as_of)}.
            It is not the opportunity state shown above.
          </p>
        )}

        <LinkRow symbol={pair.symbol} timeframe={pair.timeframe} />
      </section>
    );
  }

  if (!view) {

    return (
      <section
        className="rounded-xl p-4"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
        data-testid={`ron-opportunity-${pair.symbol}-${pair.timeframe}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm font-semibold" style={{ color: C.text }}>
            {pair.symbol} · {pair.timeframe}
          </span>
          <span className="rounded-md px-2 py-0.5 text-sm" style={{ background: `${C.muted}22`, color: C.sec }}>
            No stored RON decision yet
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: C.muted }}>
          {item.error
            ? item.error
            : "Nothing is inferred in the absence of a record. A card will appear here as soon as an evaluation has been stored for this pair."}
        </p>
        <LinkRow symbol={pair.symbol} timeframe={pair.timeframe} />

      </section>
    );
  }

  const state = presentState(view.decision.state);
  const tone = TONE_COLOR[state.tone] ?? C.sec;
  const summary = summaryParagraph(view);
  const asOf = view.decision.as_of;
  const changes = (view.explanation?.what_would_change ?? []).filter((s) => s?.trim());
  const missing = (view.explanation?.missing_or_conflicting ?? []).filter((s) => s?.trim());

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
      data-testid={`ron-opportunity-${pair.symbol}-${pair.timeframe}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm font-semibold" style={{ color: C.text }}>
          {view.decision.instrument} · {view.decision.timeframe}
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-sm"
          style={{ background: `${tone}1A`, color: tone }}
          data-testid="ron-opportunity-state"
        >
          {state.label}
        </span>
        <span className="text-[13px] uppercase tracking-widest" style={{ color: C.muted }}>
          RON stored decision
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed" style={{ color: C.text }}>{summary.text}</p>
      {summary.source === "state_glossary" && (
        <p className="mt-1 text-[13px]" style={{ color: C.muted }}>
          No stored rationale text — this describes what the stored state means, not the market.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: C.sec }}>
        <span data-testid="ron-opportunity-asof">
          Evaluated as of {formatLocalDateTime(asOf)} · {formatAge(asOf, now)}
        </span>
        <span>{PROBABILITY_LINE}</span>
        <span>{EXECUTION_LINE}</span>
      </div>

      {(changes.length > 0 || missing.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {changes.length > 0 && (
            <div className="rounded-lg p-2.5" style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
              <p className="text-[13px] uppercase tracking-widest" style={{ color: C.sec }}>
                What would change it
              </p>
              <ul className="mt-1 space-y-1">
                {changes.slice(0, 3).map((s) => (
                  <li key={s} className="break-words text-sm leading-relaxed" style={{ color: C.text }}>— {s}</li>
                ))}
              </ul>
            </div>
          )}
          {missing.length > 0 && (
            <div className="rounded-lg p-2.5" style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
              <p className="text-[13px] uppercase tracking-widest" style={{ color: C.sec }}>
                Missing or conflicting
              </p>
              <ul className="mt-1 space-y-1">
                {missing.slice(0, 3).map((s) => (
                  <li key={s} className="break-words text-sm leading-relaxed" style={{ color: C.text }}>— {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[13px]" style={{ color: C.muted }}>
        {view.evidence_count} specialist evidence records stored · open the decision record for full evidence.
      </p>

      <LinkRow symbol={pair.symbol} timeframe={pair.timeframe} />

    </section>
  );
}
