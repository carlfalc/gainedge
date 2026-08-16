/**
 * Specialist evidence with progressive disclosure. Rows are collapsed by default;
 * raw observation keys and provenance live behind an explicit technical disclosure.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { C } from "@/lib/mock-data";
import { summariseEvidence } from "@/lib/ron-decision-presentation";
import type { RonEvidenceView } from "@/services/ron-decisions";

function EvidenceRow({ evidence }: { evidence: RonEvidenceView }) {
  const [open, setOpen] = useState(false);
  const [technical, setTechnical] = useState(false);
  const s = summariseEvidence(evidence);

  return (
    <div className="rounded-lg" style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: C.sec }} />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: C.sec }} />}
        <span className="text-sm font-medium" style={{ color: C.text }}>{s.label}</span>
        {s.status && <span className="text-xs" style={{ color: C.sec }}>{s.status}</span>}
        {s.direction && <span className="text-xs" style={{ color: C.sec }}>{s.direction}</span>}
        {s.recommendation && <span className="text-xs" style={{ color: C.sec }}>{s.recommendation}</span>}
        {s.freshnessAtDecision && (
          <span className="text-xs" style={{ color: C.muted }}>
            source freshness {s.freshnessAtDecision}
          </span>
        )}
        {s.health !== "healthy" && (
          <span className="flex items-center gap-1 text-xs" style={{ color: C.amber }}>
            <AlertTriangle className="h-3 w-3" /> needs attention
          </span>
        )}
      </button>

      {s.warnings.length > 0 && (
        <ul className="space-y-1 px-3 pb-3" data-testid={`ron-warnings-${s.agent_id}`}>
          {s.warnings.map((w) => (
            <li key={w} className="break-words text-xs leading-relaxed" style={{ color: C.amber }}>• {w}</li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-3 border-t px-3 py-3" style={{ borderColor: C.border }}>
          <button
            type="button"
            onClick={() => setTechnical((v) => !v)}
            aria-expanded={technical}
            className="text-xs uppercase tracking-widest"
            style={{ color: C.sec }}
          >
            Technical details
          </button>
          {technical && (
            <div className="space-y-2" data-testid={`ron-technical-${s.agent_id}`}>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(evidence.observations ?? []).map((o) => (
                  <span key={`${s.evidence_hash}-${o.key}`} className="break-all font-mono text-xs"
                    style={{ color: C.sec }}>
                    {o.key}: <span style={{ color: C.text }}>
                      {o.value_num ?? o.value_text ?? "—"}{o.unit ? ` ${o.unit}` : ""}
                    </span>
                  </span>
                ))}
              </div>
              {(evidence.provenance_refs ?? []).length > 0 && (
                <div className="space-y-1">
                  {evidence.provenance_refs.map((p) => (
                    <p key={p} className="break-all font-mono text-[11px]" style={{ color: C.muted }}>{p}</p>
                  ))}
                </div>
              )}
              <p className="break-all font-mono text-[11px]" style={{ color: C.muted }}>
                evidence {s.evidence_hash}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RonEvidenceList({ evidence }: { evidence: RonEvidenceView[] }) {
  return (
    <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <h2 className="mb-3 text-xs uppercase tracking-widest" style={{ color: C.sec }}>
        Specialist evidence ({evidence.length})
      </h2>
      <div className="space-y-2">
        {evidence.map((e) => <EvidenceRow key={e.evidence_hash} evidence={e} />)}
      </div>
    </section>
  );
}