/**
 * GAINEDGE_WHAT_TO_DO_NOW_V1 — on-demand "What to do now?" briefing for one instrument.
 *
 * On open it asks the server runtime to evaluate the latest completed bar RIGHT NOW
 * (idempotent `ron-snapshot` live tick) instead of waiting for the scheduled cron, then
 * re-reads the freshest stored snapshot + opportunity-context rows and renders a plain
 * English briefing built purely from those stored fields.
 */
import { useEffect, useState, useCallback } from "react";
import { X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C as CBase } from "@/lib/mock-data";
import { buildWhatToDoNow, type WhatToDoNowBriefing } from "@/lib/what-to-do-now";
import { CURRENT_RON_SNAPSHOT_FEATURE_VERSION } from "@/services/ron-snapshots";

const C = { ...CBase, text: "#FFFFFF", sec: "#FFFFFF" };

interface Props {
  symbol: string;
  timeframe: string;
  quoteFresh?: boolean;
  marketOpen?: boolean;
  onClose: () => void;
}

export default function WhatToDoNowModal({ symbol, timeframe, quoteFresh, marketOpen, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<WhatToDoNowBriefing | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setNote(null);
    // 1) Ask the server runtime to evaluate the latest completed bar now (idempotent).
    try {
      await supabase.auth.refreshSession();
      await supabase.functions.invoke("ron-snapshot", { body: { mode: "live", symbol, timeframe } });
    } catch {
      setNote("Live re-evaluation could not run just now — showing the latest stored evidence instead.");
    }

    // 2) Read back the freshest stored evidence.
    const [{ data: snapRows }, { data: ctxRows }] = await Promise.all([
      supabase
        .from("ron_market_snapshots")
        .select("bar_time, features, patterns")
        .eq("feature_version", CURRENT_RON_SNAPSHOT_FEATURE_VERSION)
        .eq("symbol", symbol)
        .eq("timeframe", timeframe)
        .order("bar_time", { ascending: false })
        .limit(1),
      supabase
        .from("ron_opportunity_context")
        .select("lifecycle, execution_allowed, execution_path, direction_context, setup_family, data_state, data_blocked, evaluation_anchor, reason_tokens")
        .eq("instrument", symbol)
        .eq("timeframe", timeframe)
        .order("evaluation_anchor", { ascending: false })
        .limit(1),
    ]);

    const snap: any = (snapRows as any[])?.[0] ?? null;
    const ctx: any = (ctxRows as any[])?.[0] ?? null;

    setBriefing(buildWhatToDoNow({
      symbol,
      timeframe,
      features: snap?.features ?? null,
      patterns: Array.isArray(snap?.patterns) ? snap.patterns : [],
      barTime: snap?.bar_time ?? null,
      context: ctx,
      quoteFresh,
      marketOpen,
    }));
    setRanAt(new Date().toLocaleTimeString());
    setLoading(false);
  }, [symbol, timeframe, quoteFresh, marketOpen]);

  useEffect(() => { void run(); }, [run]);

  const actionColor =
    briefing?.action === "PREPARE" ? C.jade : briefing?.action === "MONITOR" ? C.amber : C.text;

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`What to do now — ${symbol} ${timeframe}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 100%)", maxHeight: "86vh", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18,
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>What to do now?</span>
          <span style={{ fontSize: 13, color: C.text, opacity: 0.75, fontFamily: "'JetBrains Mono', monospace" }}>
            {symbol} · {timeframe}
          </span>
          <button
            onClick={() => void run()} disabled={loading}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12,
              color: C.jade, background: "transparent", border: `1px solid ${C.jade}40`, borderRadius: 6,
              padding: "3px 8px", cursor: loading ? "default" : "pointer",
            }}
            title="Re-run RON on the latest completed bar now"
          >
            <RefreshCw size={12} /> Re-run
          </button>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: C.text, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: 14, color: C.text, opacity: 0.85 }}>
            Running RON on the latest completed bar…
          </div>
        )}

        {!loading && briefing && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, letterSpacing: 1, color: actionColor,
                border: `1px solid ${actionColor}55`, borderRadius: 6, padding: "2px 8px",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {briefing.action}
              </span>
              {briefing.bias && (
                <span style={{ fontSize: 13, fontWeight: 700, color: briefing.bias === "LONG" ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace" }}>
                  {briefing.bias}
                </span>
              )}
            </div>

            <p style={{ fontSize: 16, lineHeight: 1.45, color: C.text, margin: 0 }}>{briefing.headline}</p>

            {note && <p style={{ fontSize: 13, color: C.amber, margin: 0 }}>{note}</p>}

            <Section title="What RON sees right now" items={briefing.whatRonSees} color={C.text} />
            <Section title="What to do" items={briefing.whatToDo} color={C.text} />
            {briefing.invalidations.length > 0 && (
              <Section title="What would change this" items={briefing.invalidations} color={C.text} />
            )}
            <Section title="Caveats" items={briefing.caveats} color={C.text} muted />

            {ranAt && (
              <div style={{ fontSize: 12, color: C.text, opacity: 0.6, fontFamily: "'JetBrains Mono', monospace" }}>
                Generated on demand at {ranAt} local — not a scheduled cron result.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, color, muted = false }: { title: string; items: string[]; color: string; muted?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color, opacity: 0.7, marginBottom: 5 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((t, i) => (
          <li key={i} style={{ fontSize: muted ? 13 : 14, lineHeight: 1.45, color, opacity: muted ? 0.75 : 1 }}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
