/**
 * Read-only RON decision surface (implementation marker 2D.2m).
 * Renders ONLY persisted seven-agent audit rows. No probability is ever displayed:
 * the surface states "not calibrated" until a qualified methodology promotes one.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { C } from "@/lib/mock-data";
import { fetchLatestRonDecision, type RonDecisionReadResult } from "@/services/ron-decisions";

const STATE_COLOR: Record<string, string> = {
  DATA_BLOCKED: C.red,
  INSUFFICIENT_EVIDENCE: C.amber,
  CONFLICTING_CONTEXT: C.orange,
  OPPORTUNITY_INCOMPLETE: C.amber,
  CONTEXT_SUPPORTED: C.jade,
  RESEARCH_ONLY: C.blue,
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <h2 className="text-xs uppercase tracking-widest mb-3" style={{ color: C.sec }}>{title}</h2>
      {children}
    </section>
  );
}

function List({ items, empty }: { items?: string[]; empty: string }) {
  if (!items?.length) return <p className="text-sm" style={{ color: C.muted }}>{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="text-sm leading-relaxed" style={{ color: C.text }}>— {item}</li>
      ))}
    </ul>
  );
}

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
  const state = view?.decision.state ?? "";

  return (
    <div className="p-5 space-y-4">
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
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs uppercase tracking-widest disabled:opacity-50"
          style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.red}40` }}>
          <AlertTriangle className="mt-0.5 h-4 w-4" style={{ color: C.red }} />
          <p className="text-sm" style={{ color: C.text }}>{error}</p>
        </div>
      )}

      {!error && !loading && !view && (
        <Panel title="No decision record">
          <p className="text-sm" style={{ color: C.muted }}>
            No persisted RON decision exists for XAUUSD 15m yet. Nothing is inferred in its absence.
          </p>
        </Panel>
      )}

      {view && (
        <>
          <Panel title="Decision">
            <div className="flex flex-wrap items-center gap-4">
              <span className="rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
                style={{ background: `${C.sec}1A`, color: C.sec, border: `1px solid ${C.border}` }}>
                STORED / HISTORICAL
              </span>
              <span className="rounded-md px-2.5 py-1 font-mono text-sm"
                style={{ background: `${STATE_COLOR[state] ?? C.sec}1A`, color: STATE_COLOR[state] ?? C.sec }}>
                {state}
              </span>
              <span className="text-sm" style={{ color: C.sec }}>
                {view.decision.instrument} · {view.decision.timeframe} · stored evaluation anchor{" "}
                <span className="font-mono" style={{ color: C.text }}>{view.decision.as_of}</span>
              </span>
              <span className="text-sm" style={{ color: C.sec }}>
                Recommendation <span style={{ color: C.text }}>{view.decision.recommendation}</span>
              </span>
              <span className="text-sm" style={{ color: C.sec }}>
                Direction <span style={{ color: C.text }}>{view.decision.direction}</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" style={{ color: C.muted }}>
              <span className="flex items-center gap-1.5" style={{ color: C.jade }}>
                <ShieldCheck className="h-3.5 w-3.5" /> signal only · execution disabled
              </span>
              <span>Probability: not calibrated</span>
              <span className="font-mono">decision {String(view.decision.decision_hash).slice(0, 12)}…</span>
              <span className="font-mono">trace {view.decision.trace_id}</span>
              <span>{view.evidence_count} evidence records linked</span>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Why (stored explanation)">
              <List items={view.explanation.why} empty="No stored rationale lines." />
            </Panel>
            <Panel title="What would change this">
              <List items={view.explanation.what_would_change} empty="No stored change conditions." />
            </Panel>
            <Panel title="Blocking reasons">
              <List items={view.decision_detail.blocking_reasons} empty="No blocking reasons recorded." />
            </Panel>
            <Panel title="Missing or conflicting">
              <List items={view.explanation.missing_or_conflicting} empty="None recorded." />
            </Panel>
          </div>

          <Panel title="Agent evidence">
            <div className="space-y-2">
              {view.evidence.map((e) => (
                <div key={e.evidence_hash} className="rounded-lg p-3"
                  style={{ background: C.bg2, border: `1px solid ${C.border}` }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium" style={{ color: C.text }}>{e.agent_id}</span>
                    <span className="text-xs" style={{ color: C.sec }}>v{e.agent_version} · rank {e.authority_rank}</span>
                    <span className="text-xs font-mono" style={{ color: C.sec }}>{e.status}</span>
                    <span className="text-xs" style={{ color: e.data_health?.status === "healthy" ? C.jade : C.amber }}>
                      health {e.data_health?.status} · source freshness at decision:{" "}
                      {e.data_health?.freshness_minutes}m
                    </span>
                    <span className="text-xs" style={{ color: C.muted }}>uncertainty {e.uncertainty?.level}</span>
                  </div>
                  {e.observations?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {e.observations.map((o) => (
                        <span key={`${e.evidence_hash}-${o.key}`} className="text-xs font-mono" style={{ color: C.sec }}>
                          {o.key}: <span style={{ color: C.text }}>
                            {o.value_num ?? o.value_text ?? "—"}{o.unit ? ` ${o.unit}` : ""}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
