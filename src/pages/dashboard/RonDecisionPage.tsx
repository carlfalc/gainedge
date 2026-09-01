/**
 * Read-only RON decision surface (2D.2m) presented plainly — GAINEDGE_UI_RON_DECISION_CARD_V1.
 * Renders ONLY persisted seven-agent audit rows. No probability is ever displayed:
 * the surface states "not calibrated" until a qualified methodology promotes one.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  FALLBACK_PAIR, normaliseTracked, pairKey, pairLabel, resolveSelection, type TrackedPair,
} from "@/lib/ron-decision-explorer";
import { askRonContextHref, askRonContextTitle } from "@/lib/ask-ron-context";
import RonDecisionCard from "@/components/ron/RonDecisionCard";
import RonEvidenceList from "@/components/ron/RonEvidenceList";
import RonExplanationPanels from "@/components/ron/RonExplanationPanels";
import RonRecordIntegrity from "@/components/ron/RonRecordIntegrity";
import { fetchLatestRonDecision, type RonDecisionReadResult } from "@/services/ron-decisions";

export default function RonDecisionPage() {
  const [result, setResult] = useState<RonDecisionReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tracked, setTracked] = useState<TrackedPair[]>([]);
  const [trackedReady, setTrackedReady] = useState(false);
  const [trackedWarning, setTrackedWarning] = useState<string | null>(null);

  const requestedInstrument = searchParams.get("instrument");
  const requestedTimeframe = searchParams.get("timeframe");

  // Tracked-instrument list is advisory only: any failure leaves the safe
  // XAUUSD 15m fallback viewer fully functional.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (!cancelled) { setTracked([]); setTrackedReady(true); }
          return;
        }
        const { data, error: readError } = await supabase
          .from("user_instruments")
          .select("symbol, timeframe")
          .eq("user_id", uid);
        if (cancelled) return;
        if (readError) {
          setTrackedWarning("Could not load your tracked instruments. Showing the default record only.");
          setTracked([]);
        } else {
          setTracked(normaliseTracked(data ?? []));
        }
      } catch {
        if (!cancelled) {
          setTrackedWarning("Could not load your tracked instruments. Showing the default record only.");
          setTracked([]);
        }
      } finally {
        if (!cancelled) setTrackedReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selected = resolveSelection(tracked, {
    instrument: requestedInstrument, timeframe: requestedTimeframe,
  });
  const selectedKey = pairKey(selected);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchLatestRonDecision({
        instrument: selected.symbol, timeframe: selected.timeframe,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read the RON decision record");
      setResult(null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.symbol, selected.timeframe]);

  useEffect(() => { if (trackedReady) void load(); }, [trackedReady, load]);

  const onSelect = (key: string) => {
    const next = tracked.find((p) => pairKey(p) === key) ?? FALLBACK_PAIR;
    setSearchParams({ instrument: next.symbol, timeframe: next.timeframe }, { replace: false });
  };

  const options = tracked.length
    ? (tracked.some((p) => pairKey(p) === selectedKey) ? tracked : [selected, ...tracked])
    : [selected];

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
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="Tracked instrument"
            data-testid="ron-instrument-select"
            value={selectedKey}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.text }}
          >
            {options.map((p) => (
              <option key={pairKey(p)} value={pairKey(p)}>{pairLabel(p)}</option>
            ))}
          </select>
          <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm uppercase tracking-widest disabled:opacity-50"
          style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
          </button>
        </div>
      </header>

      {trackedWarning && (
        <p className="text-sm" data-testid="ron-tracked-warning" style={{ color: C.amber }}>
          {trackedWarning}
        </p>
      )}

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
            className="mt-3 rounded-lg px-3 py-2 text-sm uppercase tracking-widest"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
          >
            Try again
          </button>
        </div>
      )}

      {!error && !loading && !view && (
        <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <h2 className="mb-2 text-sm uppercase tracking-widest" style={{ color: C.sec }}>No decision record</h2>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }} data-testid="ron-empty-state">
            There is no stored RON decision for {selected.symbol} {selected.timeframe} yet. Nothing is inferred in its absence —
            this page will show a record as soon as one has been evaluated and stored.
          </p>
        </section>
      )}

      {view && !loading && (
        <>
          <div className="flex justify-end">
            <button
              data-testid="ron-ask-about-record"
              onClick={() => navigate(askRonContextHref(selected.symbol, selected.timeframe))}
              aria-label={askRonContextTitle(selected.symbol, selected.timeframe)}
              title={askRonContextTitle(selected.symbol, selected.timeframe)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
            >
              Ask RON about this record ↗
            </button>
          </div>
          <RonDecisionCard view={view} />
          <RonExplanationPanels view={view} />
          <RonEvidenceList evidence={view.evidence ?? []} />
          <RonRecordIntegrity view={view} viewHash={result?.view_hash} specHash={result?.spec_hash} />
        </>
      )}
    </div>
  );
}
