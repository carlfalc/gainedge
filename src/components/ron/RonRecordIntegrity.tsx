/** Reproducibility footer: hashes and identifiers, out of the primary reading flow. */
import { Copy } from "lucide-react";
import { C } from "@/lib/mock-data";
import { orchestratorVersion, storedString } from "@/lib/ron-decision-presentation";
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

export default function RonRecordIntegrity(
  { view, viewHash, specHash }: { view: RonDecisionView; viewHash?: string; specHash?: string },
) {
  const orchestrator = orchestratorVersion(view);
  const explanationHash = storedString(view, "explanation_hash");
  const registryHash = storedString(view, "registry_hash");
  const decisionSchema = storedString(view, "decision_schema_version");
  const evidenceSchema = storedString(view, "evidence_schema_version");
  const ttlPolicy = storedString(view, "ttl_policy_version");
  return (
    <details className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <summary className="cursor-pointer text-xs uppercase tracking-widest" style={{ color: C.sec }}>
        Record integrity & reproducibility
      </summary>
      <div className="mt-3 space-y-2">
        <Row label="Decision hash" value={String(view.decision.decision_hash)} />
        {explanationHash && <Row label="Explanation hash" value={explanationHash} />}
        {viewHash && <Row label="View hash" value={viewHash} />}
        {specHash && <Row label="Read spec hash" value={specHash} />}
        <Row label="Trace id" value={String(view.decision.trace_id)} />
        {typeof view.decision.decision_id === "string" && (
          <Row label="Decision id" value={view.decision.decision_id} />
        )}
        {orchestrator && (
          <p className="text-xs" style={{ color: C.sec }} data-testid="ron-orchestrator-version">
            Orchestrator version {orchestrator}
          </p>
        )}
        {registryHash && <Row label="Registry hash" value={registryHash} />}
        {(decisionSchema || evidenceSchema || ttlPolicy) && (
          <p className="text-xs" style={{ color: C.sec }} data-testid="ron-schema-versions">
            {[
              decisionSchema && `Decision schema ${decisionSchema}`,
              evidenceSchema && `Evidence schema ${evidenceSchema}`,
              ttlPolicy && `TTL policy ${ttlPolicy}`,
            ].filter(Boolean).join(" · ")}
          </p>
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