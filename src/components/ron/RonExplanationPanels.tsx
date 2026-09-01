/** Stored-explanation panels. Renders stored strings only; never invents claims. */
import { C } from "@/lib/mock-data";
import { emptyListCopy } from "@/lib/ron-decision-presentation";
import type { RonDecisionView } from "@/services/ron-decisions";

function Panel({ title, items, empty, testId }: {
  title: string; items?: string[]; empty: string; testId: string;
}) {
  const rows = items?.filter((s) => typeof s === "string" && s.trim().length > 0) ?? [];
  return (
    <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}
      data-testid={testId}>
      <h2 className="mb-3 text-sm uppercase tracking-widest" style={{ color: C.sec }}>{title}</h2>
      {rows.length === 0
        ? <p className="text-sm leading-relaxed" style={{ color: C.muted }}>{empty}</p>
        : (
          <ul className="space-y-1.5">
            {rows.map((item) => (
              <li key={item} className="break-words text-sm leading-relaxed" style={{ color: C.text }}>
                — {item}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export default function RonExplanationPanels({ view }: { view: RonDecisionView }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="What strengthens this view" items={view.explanation?.why}
        empty={emptyListCopy("why")} testId="ron-strengthens" />
      <Panel title="What would change it" items={view.explanation?.what_would_change}
        empty={emptyListCopy("what_would_change")} testId="ron-what-changes" />
      <Panel title="Missing or conflicting" items={view.explanation?.missing_or_conflicting}
        empty={emptyListCopy("missing_or_conflicting")} testId="ron-missing" />
      <Panel title="Blocking reasons" items={view.decision_detail?.blocking_reasons}
        empty={emptyListCopy("blocking")} testId="ron-blocking" />
    </div>
  );
}