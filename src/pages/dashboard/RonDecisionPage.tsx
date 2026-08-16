/**
 * Read-only RON decision surface (2D.2m) presented plainly — GAINEDGE_UI_RON_DECISION_CARD_V1.
 * Renders ONLY persisted seven-agent audit rows. No probability is ever displayed:
 * the surface states "not calibrated" until a qualified methodology promotes one.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { C } from "@/lib/mock-data";
import RonDecisionCard from "@/components/ron/RonDecisionCard";
import RonEvidenceList from "@/components/ron/RonEvidenceList";
import RonExplanationPanels from "@/components/ron/RonExplanationPanels";
import RonRecordIntegrity from "@/components/ron/RonRecordIntegrity";
import { fetchLatestRonDecision, type RonDecisionReadResult } from "@/services/ron-decisions";

export default function RonDecisionPage() {
  const [result, setResult] = useState<RonDecisionReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchLatestRonDecision({ instrument: "XAUUSD", timeframe: "15m" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read the RON decision record");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const view = result?.view ?? null;

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: C.text }}>
            RON Stored Decision Record
          </h1>
          <p className="text-sm" style={{ color: C.sec }}>
            Stored audit record of a past multi-agent evaluation — not a live RON decision and not
            current market state. Nothing here is executable.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
          style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </header>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl p-4"
          style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: C.sec }} />
          <p className="text-sm" style={{ color: C.sec }}>Reading the stored RON decision record…</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.red}40` }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.red }} />
            <p className="break-words text-sm" style={{ color: C.text }}>{error}</p>
          </div>
          <button
            onClick={() => void load()}
            className="mt-3 rounded-lg px-3 py-2 text-xs uppercase tracking-widest"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
          >
            Try again
          </button>
        </div>
      )}

      {!error && !loading && !view && (
        <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <h2 className="mb-2 text-xs uppercase tracking-widest" style={{ color: C.sec }}>No decision record</h2>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            There is no stored RON decision for XAUUSD 15m yet. Nothing is inferred in its absence —
            this page will show a record as soon as one has been evaluated and stored.
          </p>
        </section>
      )}

      {view && !loading && (
        <>
          <RonDecisionCard view={view} />
          <RonExplanationPanels view={view} />
          <RonEvidenceList evidence={view.evidence ?? []} />
          <RonRecordIntegrity view={view} />
        </>
      )}
    </div>
  );
}
