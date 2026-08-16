/**
 * Specialist evidence with progressive disclosure. Rows are collapsed by default;
 * raw observation keys and provenance live behind an explicit technical disclosure.
 */
import { useEffect, useMemo, useState } from "react";
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

      {s.attentionSummary && (
        <p
          className="px-3 pb-3 text-xs"
          style={{ color: s.health === "healthy" ? C.sec : C.amber }}
          data-testid={`ron-attention-${s.agent_id}`}
        >
          {s.attentionSummary}
        </p>
      )}

      {open && (
        <div className="space-y-3 border-t px-3 py-3" style={{ borderColor: C.border }}>
          {s.hasWarnings && (
            <div className="space-y-1.5" data-testid={`ron-caveats-${s.agent_id}`}>
              <p className="text-xs uppercase tracking-widest" style={{ color: C.sec }}>
                Warnings &amp; caveats
              </p>
              <ul className="space-y-1">
                {[...s.issues, ...s.conflicts, ...s.limitations].map((w, i) => (
                  <li key={`${s.evidence_hash}-w-${i}`} className="break-words text-xs leading-relaxed"
                    style={{ color: C.text }}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
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
  // Deterministic frontend-only record identity: the ordered evidence hashes.
  const recordKey = evidence.map((e) => e.evidence_hash).join("|");
  const [mode, setMode] = useState<"all" | "attention">("all");

  // A different stored record must never inherit a previous filter.
  useEffect(() => { setMode("all"); }, [recordKey]);

  const attention = useMemo(
    () => evidence.filter((e) => {
      const s = summariseEvidence(e);
      return s.health !== "healthy" || s.hasWarnings;
    }),
    [evidence],
  );

  const rows = mode === "attention" ? attention : evidence;
  const btn = (active: boolean) => ({
    background: active ? C.cardH : "transparent",
    border: `1px solid ${C.border}`,
    color: active ? C.text : C.sec,
  });

  return (
    <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: C.sec }}>
          Specialist evidence ({evidence.length} stored)
        </h2>
        {mode === "attention" && (
          <span className="text-xs" style={{ color: C.muted }} data-testid="ron-evidence-showing">
            Showing {rows.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode("all")}
            aria-pressed={mode === "all"}
            data-testid="ron-evidence-filter-all"
            className="rounded-lg px-2.5 py-1 text-xs"
            style={btn(mode === "all")}
          >
            All ({evidence.length})
          </button>
          <button
            type="button"
            onClick={() => setMode("attention")}
            aria-pressed={mode === "attention"}
            data-testid="ron-evidence-filter-attention"
            className="rounded-lg px-2.5 py-1 text-xs"
            style={btn(mode === "attention")}
          >
            Needs attention ({attention.length})
          </button>
        </div>
      </div>
      {mode === "attention" && rows.length === 0 && (
        <p className="text-xs leading-relaxed" style={{ color: C.muted }} data-testid="ron-evidence-attention-empty">
          No specialist evidence in this stored record needs attention.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((e) => <EvidenceRow key={e.evidence_hash} evidence={e} />)}
      </div>
    </section>
  );
}