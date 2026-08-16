/** Reproducibility footer: hashes and identifiers, out of the primary reading flow. */
import { Copy } from "lucide-react";
import { C } from "@/lib/mock-data";
import { orchestrationRunVersion } from "@/lib/ron-decision-presentation";
import type { RonDecisionView } from "@/services/ron-decisions";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs" style={{ color: C.sec }}>{label}</span>
      <span className="min-w-0 break-all font-mono text-[11px]" style={{ color: C.text }}>{value}</span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => void navigator.clipboard?.writeText(value)}
        className="shrink-0 rounded p-1"
        style={{ color: C.muted }}
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function RonRecordIntegrity({ view }: { view: RonDecisionView }) {
  const runVersion = orchestrationRunVersion(view);
  return (
    <details className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <summary className="cursor-pointer text-xs uppercase tracking-widest" style={{ color: C.sec }}>
        Record integrity & reproducibility
      </summary>
      <div className="mt-3 space-y-2">
        <Row label="Decision hash" value={String(view.decision.decision_hash)} />
        <Row label="Trace id" value={String(view.decision.trace_id)} />
        {typeof view.decision.decision_id === "string" && (
          <Row label="Decision id" value={view.decision.decision_id} />
        )}
        {runVersion !== null && (
          <p className="text-xs" style={{ color: C.sec }}>Orchestration run version {runVersion}</p>
        )}
        <p className="text-xs" style={{ color: C.muted }}>
          {view.evidence_count} evidence records linked · reconstructable:{" "}
          {view.reconstructable ? "yes" : "no"}
        </p>
        <div className="space-y-1.5">
          {view.evidence.map((e) => (
            <Row key={e.evidence_hash} label={`${e.agent_id} v${e.agent_version}`} value={e.evidence_hash} />
          ))}
        </div>
      </div>
    </details>
  );
}