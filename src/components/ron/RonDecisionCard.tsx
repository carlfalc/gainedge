/**
 * Primary plain-English RON decision card. Presentation only — every value comes
 * from the stored decision record via the pure presentation layer.
 */
import { ShieldCheck } from "lucide-react";
import { C } from "@/lib/mock-data";
import { formatPrintedLocal } from "@/lib/signal-time";
import {
  EXECUTION_LINE, EXECUTION_NOTE, PROBABILITY_LINE, PROBABILITY_NOTE,
  formatAge, presentState, summaryParagraph, titleCaseToken,
} from "@/lib/ron-decision-presentation";
import type { RonDecisionView } from "@/services/ron-decisions";

const TONE_COLOR: Record<string, string> = {
  blocked: C.red, caution: C.amber, supported: C.jade, neutral: C.sec,
};

export default function RonDecisionCard({ view, now }: { view: RonDecisionView; now?: Date }) {
  const state = presentState(view.decision.state);
  const tone = TONE_COLOR[state.tone] ?? C.sec;
  const summary = summaryParagraph(view);
  const asOf = view.decision.as_of;

  return (
    <section
      className="rounded-xl p-4 sm:p-5"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
      data-testid="ron-decision-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-base font-semibold" style={{ color: C.text }}>
          {view.decision.instrument} · {view.decision.timeframe}
        </span>
        <span
          className="rounded-md px-2.5 py-1 text-sm"
          style={{ background: `${tone}1A`, color: tone }}
          data-testid="ron-state-label"
        >
          {state.label}
        </span>
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>
          stored record
        </span>
      </div>

      <h2 className="mt-4 text-xs uppercase tracking-widest" style={{ color: C.sec }}>
        What RON is saying
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.text }} data-testid="ron-summary">
        {summary.text}
      </p>
      {summary.source === "state_glossary" && (
        <p className="mt-1 text-xs" style={{ color: C.muted }}>
          No stored rationale text — showing what this state means, not an analysis of the market.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg p-3" style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: C.text }} data-testid="ron-probability-line">
            {PROBABILITY_LINE}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: C.muted }}>{PROBABILITY_NOTE}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
          <p className="flex items-center gap-1.5 text-sm" style={{ color: C.jade }} data-testid="ron-execution-line">
            <ShieldCheck className="h-3.5 w-3.5" /> {EXECUTION_LINE}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: C.muted }}>{EXECUTION_NOTE}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs" style={{ color: C.sec }}>
        <span data-testid="ron-decision-time">
          Evaluated {formatPrintedLocal(asOf)} local · {formatAge(asOf, now)}
        </span>
        <span>Recorded reading: {titleCaseToken(view.decision.direction ?? "")|| "—"}</span>
        <span>Recorded recommendation: {titleCaseToken(view.decision.recommendation ?? "") || "—"}</span>
      </div>
      {state.unknown && (
        <p className="mt-2 text-xs font-mono" style={{ color: C.muted }}>
          raw state token: {view.decision.state}
        </p>
      )}
    </section>
  );
}