import { useState, useEffect, useMemo } from "react";
import { C } from "@/lib/mock-data";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Play, Loader2, Lock, Settings2, X, ShieldCheck, Database, AlertTriangle, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type RunType = "options" | "v3";

interface BacktestRun {
  id: string;
  run_type: RunType | null;
  run_label: string | null;
  symbol: string;
  timeframe: string;
  htf_timeframe: string;
  period_start: string;
  period_end: string;
  config: Record<string, unknown> | null;
  in_sample: BacktestMetrics | null;
  out_of_sample: BacktestMetrics | null;
  combined: BacktestMetrics | null;
  equity_curve: number[] | { v: number }[] | null;
  verdict: string | null;
  created_at: string;
}
interface BacktestMetrics {
  trades?: number; win_rate?: number; profit_factor?: number;
  net_pnl?: number; max_drawdown?: number; sharpe?: number;
  expectancy?: number; avg_rr?: number;
}

const SYMBOLS = ["XAUUSD", "NAS100", "US30", "AUDUSD", "NZDUSD", "EURUSD", "GBPUSD", "USDJPY"];
const DUKASCOPY_SYMBOLS = new Set([
  "XAUUSD","XAUAUD","XAGUSD","EURUSD","GBPUSD","USDJPY","AUDUSD","NZDUSD",
  "USDCAD","EURJPY","GBPJPY","AUDJPY","EURGBP","EURNZD","GBPCAD","AUDCAD","AUDNZD","NZDCAD",
]);

interface Coverage {
  earliest: string | null;
  latest:   string | null;
  count:    number;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export default function BacktestingPage() {
  // Options-mode state
  const [instrument, setInstrument] = useState("XAUUSD");
  const [tf, setTf] = useState("15m");
  const [candleType, setCandleType] = useState<"heiken_ashi" | "standard">("heiken_ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [emaFilter, setEmaFilter] = useState(false);
  const [startDate, setStartDate] = useState("2016-01-01");
  const [endDate, setEndDate] = useState("2016-01-31");

  // V3-mode state
  const [v3Open, setV3Open] = useState(false);
  const [v3Symbol, setV3Symbol] = useState("XAUUSD");
  const [v3Start, setV3Start] = useState("2024-01-01");
  const [v3End, setV3End] = useState("2025-01-01");

  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<{ msg: string; hint?: string } | null>(null);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Data coverage + Dukascopy backfill
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [bfStart, setBfStart] = useState(isoDaysAgo(180));
  const [bfEnd, setBfEnd]   = useState(isoDaysAgo(0));
  const [bfRunning, setBfRunning] = useState(false);
  const [bfProgress, setBfProgress] = useState<{ chunk: number; total: number; stored: number } | null>(null);

  useEffect(() => { void loadRuns(); }, []);
  useEffect(() => { void loadCoverage(instrument); }, [instrument]);

  const loadCoverage = async (symbol: string) => {
    setCoverageLoading(true);
    try {
      const [{ data: minRow }, { data: maxRow }, { count }] = await Promise.all([
        supabase.from("candle_history").select("timestamp")
          .eq("symbol", symbol).eq("timeframe", "1m")
          .order("timestamp", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("candle_history").select("timestamp")
          .eq("symbol", symbol).eq("timeframe", "1m")
          .order("timestamp", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("candle_history").select("*", { count: "exact", head: true })
          .eq("symbol", symbol).eq("timeframe", "1m"),
      ]);
      setCoverage({
        earliest: (minRow?.timestamp as string) ?? null,
        latest:   (maxRow?.timestamp as string) ?? null,
        count:    count ?? 0,
      });
    } catch (e) {
      console.error("coverage load failed", e);
      setCoverage({ earliest: null, latest: null, count: 0 });
    } finally {
      setCoverageLoading(false);
    }
  };

  const runBackfill = async () => {
    const start = new Date(bfStart);
    const end   = new Date(bfEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      toast.error("Invalid backfill date range"); return;
    }
    if (!DUKASCOPY_SYMBOLS.has(instrument)) {
      toast.error(`${instrument} is not supported by Dukascopy direct ingest`); return;
    }

    // Build 14-day chunks
    const CHUNK_DAYS = 14;
    const chunks: { start: string; end: string }[] = [];
    let cursor = new Date(start);
    while (cursor < end) {
      const next = new Date(Math.min(cursor.getTime() + CHUNK_DAYS * 86400_000, end.getTime()));
      chunks.push({
        start: cursor.toISOString().slice(0, 10),
        end:   next.toISOString().slice(0, 10),
      });
      cursor = next;
    }

    setBfRunning(true);
    setBfProgress({ chunk: 0, total: chunks.length, stored: 0 });
    let totalStored = 0;
    let failures = 0;

    try {
      await supabase.auth.refreshSession();
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        setBfProgress({ chunk: i + 1, total: chunks.length, stored: totalStored });
        try {
          const { data, error } = await supabase.functions.invoke("ron-ingest-dukascopy", {
            body: { symbol: instrument, start: c.start, end: c.end, max_days: 31 },
          });
          if (error) throw new Error(error.message);
          const stored = Number((data as { candles_stored?: number })?.candles_stored ?? 0);
          totalStored += stored;
          setBfProgress({ chunk: i + 1, total: chunks.length, stored: totalStored });
        } catch (e) {
          failures++;
          console.error(`chunk ${i + 1} failed`, e);
        }
      }
      toast.success(`Backfill complete — ${totalStored.toLocaleString()} candles added${failures ? ` (${failures} chunk${failures > 1 ? "s" : ""} failed)` : ""}`);
      setLastError(null);
      await loadCoverage(instrument);
      setBackfillOpen(false);
    } finally {
      setBfRunning(false);
      setBfProgress(null);
    }
  };

  const loadRuns = async () => {
    const { data, error } = await supabase
      .from("ron_backtest_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { toast.error(`Failed to load runs: ${error.message}`); return; }
    if (data) {
      setRuns(data as unknown as BacktestRun[]);
      if (!selectedId && data.length > 0) setSelectedId((data[0] as BacktestRun).id);
    }
  };

  const runBacktest = async (mode: RunType) => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not signed in"); setRunning(false); return; }
      await supabase.auth.refreshSession();

      const isV3 = mode === "v3";
      const symbol = isV3 ? v3Symbol : instrument;
      const start  = new Date(isV3 ? v3Start : startDate);
      const end    = new Date(isV3 ? v3End   : endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        toast.error("Invalid date range"); setRunning(false); return;
      }

      const body: Record<string, unknown> = {
        symbol,
        start: start.toISOString(),
        end:   end.toISOString(),
        run_type: mode,
        run_label: isV3 ? "v3-production" : `options-${candleType}-${emaFast}/${emaSlow}${emaFilter ? "-filt" : ""}`,
      };

      if (!isV3) {
        body.timeframe = tf;
        body.config = {
          ema_fast:    parseInt(emaFast),
          ema_slow:    parseInt(emaSlow),
          candle_type: candleType === "heiken_ashi" ? "HA" : "standard",
          ema_filter:  emaFilter,
        };
      }
      // V3: no config overrides — Render uses locked defaults

      const { data, error } = await supabase.functions.invoke("ron-backtest", { body });
      if (error) {
        // Try to extract upstream JSON ({error, body, hint, ...}) for a clearer message
        const ctx = (error as { context?: Response }).context;
        let upstreamMsg = error.message;
        let hint: string | undefined;
        try {
          if (ctx) {
            const txt = await ctx.text();
            const j = JSON.parse(txt);
            const inner = typeof j.body === "string" ? safeJson(j.body) : null;
            upstreamMsg = inner?.error ?? j.error ?? upstreamMsg;
            hint = inner?.hint ?? j.hint;
          }
        } catch { /* ignore */ }
        setLastError({ msg: upstreamMsg, hint });
        throw new Error(upstreamMsg);
      }
      setLastError(null);
      toast.success(`${isV3 ? "V3" : "Options"} backtest complete`);
      const newId = (data as { run_id?: string })?.run_id ?? null;
      await loadRuns();
      await loadCoverage(symbol);
      if (newId) setSelectedId(newId);
      if (isV3) setV3Open(false);
    } catch (e) {
      toast.error(`Backtest failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const selected = useMemo(
    () => runs.find(r => r.id === selectedId) ?? runs[0] ?? null,
    [runs, selectedId],
  );

  const equityValues: number[] = useMemo(() => {
    const ec = selected?.equity_curve as unknown;
    if (!Array.isArray(ec) || ec.length === 0) return [];
    if (typeof ec[0] === "number") return ec as number[];
    if (typeof ec[0] === "object" && ec[0] && "v" in (ec[0] as object)) {
      return (ec as { v: number }[]).map(p => p.v);
    }
    return [];
  }, [selected]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>Backtesting Options</h1>
          <div style={{ fontSize: 12, color: C.sec, marginTop: 4 }}>
            Tune EMA periods, candle type, and EMA filter to research strategy variations
          </div>
        </div>
        <button
          onClick={() => setV3Open(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 10, cursor: "pointer",
            background: `linear-gradient(135deg, ${C.green}, ${C.jade})`,
            color: C.bg, fontSize: 12, fontWeight: 800, border: "none",
            fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.3,
          }}
        >
          <ShieldCheck size={14} /> Backtesting V3 (Production)
        </button>
      </div>

      {/* Upstream error / hint banner */}
      {lastError && (
        <div style={{
          background: `${C.red}15`, border: `1px solid ${C.red}55`, borderRadius: 12,
          padding: 14, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <AlertTriangle size={16} color={C.red} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 12, color: C.text }}>
            <div style={{ fontWeight: 700, color: C.red, marginBottom: 4 }}>
              Backtest failed: {lastError.msg}
            </div>
            {lastError.hint && (
              <div style={{ color: C.sec }}>
                Hint: <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{lastError.hint}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setBackfillOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.card, color: C.text, fontSize: 11, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <Download size={12} /> Backfill from Dukascopy
          </button>
        </div>
      )}

      {/* Data Coverage */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={14} color={C.jade} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              Data Coverage — {instrument} (1m)
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => void loadCoverage(instrument)}
              disabled={coverageLoading}
              style={iconBtn}
              title="Refresh coverage"
            >
              <RefreshCw size={13} className={coverageLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setBackfillOpen(true)}
              disabled={!DUKASCOPY_SYMBOLS.has(instrument)}
              title={DUKASCOPY_SYMBOLS.has(instrument) ? "" : `${instrument} not available on Dukascopy`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
                color: C.bg, fontSize: 12, fontWeight: 800,
                cursor: DUKASCOPY_SYMBOLS.has(instrument) ? "pointer" : "not-allowed",
                opacity: DUKASCOPY_SYMBOLS.has(instrument) ? 1 : 0.5,
              }}
            >
              <Download size={12} /> Backfill from Dukascopy
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <CoverageStat label="Earliest" value={coverage?.earliest ? new Date(coverage.earliest).toLocaleString() : "—"} />
          <CoverageStat label="Latest"   value={coverage?.latest   ? new Date(coverage.latest).toLocaleString()   : "—"} />
          <CoverageStat label="Total candles" value={coverage ? coverage.count.toLocaleString() : "—"} highlight />
        </div>
      </div>

      {/* Options config */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Settings2 size={14} color={C.blue} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Configuration</div>
          <BadgePill kind="options" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Field label="Instrument">
            <select value={instrument} onChange={e => setInstrument(e.target.value)} style={inputStyle}>
              {SYMBOLS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={tf} onChange={e => setTf(e.target.value)} style={inputStyle}>
              {["5m", "15m", "30m", "1h", "4h"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Candle Type">
            <select value={candleType} onChange={e => setCandleType(e.target.value as "heiken_ashi" | "standard")} style={inputStyle}>
              <option value="heiken_ashi">Heiken Ashi</option>
              <option value="standard">Standard</option>
            </select>
          </Field>
          <Field label="EMA Fast">
            <input value={emaFast} onChange={e => setEmaFast(e.target.value)} style={inputStyle} type="number" />
          </Field>
          <Field label="EMA Slow">
            <input value={emaSlow} onChange={e => setEmaSlow(e.target.value)} style={inputStyle} type="number" />
          </Field>
          <Field
            label="EMA Filter"
            hint="When ON, signals only fire when fast EMA / slow EMA align with trade direction"
          >
            <button
              type="button"
              onClick={() => setEmaFilter(v => !v)}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                border: `1px solid ${emaFilter ? C.jade : C.border}`,
                background: emaFilter ? `${C.jade}22` : C.bg,
                color: emaFilter ? C.jade : C.sec,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", textAlign: "left",
              }}
            >
              {emaFilter ? "ON — direction-aligned only" : "OFF — all signals"}
            </button>
          </Field>
          <Field label="Start date">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <button onClick={() => void runBacktest("options")} disabled={running} style={runBtn(running)}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? "Running backtest…" : "Run Backtest"}
        </button>
      </div>

      {/* Recent runs */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Recent runs</div>
        {runs.length === 0 ? (
          <div style={{ color: C.sec, fontSize: 13 }}>No backtests yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.sec, textAlign: "left" }}>
                  <Th>Date</Th><Th>Type</Th><Th>Label</Th><Th>Symbol</Th><Th>TF</Th>
                  <Th>WR (IS / OOS)</Th><Th>PF (IS / OOS)</Th><Th>Trades</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const isSel = selected?.id === r.id;
                  const kind: RunType = (r.run_type as RunType) ?? "options";
                  return (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)}
                      style={{ cursor: "pointer", background: isSel ? C.cardH : "transparent", borderTop: `1px solid ${C.border}` }}>
                      <Td>{new Date(r.created_at).toLocaleString()}</Td>
                      <Td><BadgePill kind={kind} /></Td>
                      <Td style={{ color: C.text }}>{r.run_label ?? "—"}</Td>
                      <Td>{r.symbol}</Td>
                      <Td>{r.timeframe}/{r.htf_timeframe}</Td>
                      <Td>{fmtPct(r.in_sample?.win_rate)} / {fmtPct(r.out_of_sample?.win_rate)}</Td>
                      <Td>{fmtNum(r.in_sample?.profit_factor)} / {fmtNum(r.out_of_sample?.profit_factor)}</Td>
                      <Td>{(r.in_sample?.trades ?? 0) + (r.out_of_sample?.trades ?? 0)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected run metrics */}
      {selected && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
            <MetricsCard title="In-Sample"     m={selected.in_sample} />
            <MetricsCard title="Out-of-Sample" m={selected.out_of_sample} />
            <MetricsCard title="Combined"      m={selected.combined} />
          </div>

          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Equity curve {selected.run_label ? `— ${selected.run_label}` : ""}
              </div>
              <BadgePill kind={(selected.run_type as RunType) ?? "options"} />
            </div>
            {equityValues.length > 1 ? (
              <Sparkline data={equityValues} color={C.jade} w={1100} h={220} />
            ) : (
              <div style={{ color: C.sec, fontSize: 13 }}>No equity curve data on this run.</div>
            )}
          </div>
        </>
      )}

      {/* V3 modal */}
      {v3Open && (
        <V3Modal
          symbol={v3Symbol} setSymbol={setV3Symbol}
          start={v3Start} setStart={setV3Start}
          end={v3End} setEnd={setV3End}
          running={running}
          onClose={() => setV3Open(false)}
          onRun={() => void runBacktest("v3")}
        />
      )}

      {/* Backfill modal */}
      {backfillOpen && (
        <BackfillModal
          symbol={instrument}
          start={bfStart} setStart={setBfStart}
          end={bfEnd} setEnd={setBfEnd}
          running={bfRunning}
          progress={bfProgress}
          onClose={() => { if (!bfRunning) setBackfillOpen(false); }}
          onRun={() => void runBackfill()}
        />
      )}
    </div>
  );
}

function BackfillModal(props: {
  symbol: string;
  start: string; setStart: (s: string) => void;
  end: string;   setEnd:   (s: string) => void;
  running: boolean;
  progress: { chunk: number; total: number; stored: number } | null;
  onClose: () => void; onRun: () => void;
}) {
  const pct = props.progress ? Math.round((props.progress.chunk / props.progress.total) * 100) : 0;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={props.onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(560px, 100%)", background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 16, padding: 24,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Download size={18} color={C.jade} />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>
                Backfill from Dukascopy
              </h2>
            </div>
            <div style={{ fontSize: 12, color: C.sec, marginTop: 4 }}>
              Direct 1m candle download for <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{props.symbol}</span>
              . Ranges are split into 14-day chunks and ingested sequentially.
            </div>
          </div>
          <button onClick={props.onClose} disabled={props.running} style={iconBtn}><X size={16} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Field label="Start date">
            <input type="date" value={props.start} disabled={props.running}
              onChange={e => props.setStart(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date">
            <input type="date" value={props.end} disabled={props.running}
              onChange={e => props.setEnd(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        {props.progress && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sec, marginBottom: 6 }}>
              <span>Downloading chunk {props.progress.chunk} of {props.progress.total}…</span>
              <span style={{ color: C.jade, fontFamily: "'JetBrains Mono', monospace" }}>
                {props.progress.stored.toLocaleString()} candles stored
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: C.bg, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: `linear-gradient(90deg, ${C.jade}, ${C.teal})`,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}

        <button onClick={props.onRun} disabled={props.running} style={runBtn(props.running)}>
          {props.running ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {props.running ? "Backfilling…" : "Start Backfill"}
        </button>
      </div>
    </div>
  );
}

function CoverageStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
    }}>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 700, marginTop: 4,
        color: highlight ? C.jade : C.text,
        fontFamily: "'JetBrains Mono', monospace",
      }}>{value}</div>
    </div>
  );
}

function V3Modal(props: {
  symbol: string; setSymbol: (s: string) => void;
  start: string;  setStart:  (s: string) => void;
  end: string;    setEnd:    (s: string) => void;
  running: boolean; onClose: () => void; onRun: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={props.onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(680px, 100%)", background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 16, padding: 24,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} color={C.green} />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>
                Backtesting V3 — Production Strategy
              </h2>
              <BadgePill kind="v3" />
            </div>
            <div style={{ fontSize: 12, color: C.sec, marginTop: 4 }}>
              Validates the live RON V3 signal engine with locked parameters
            </div>
          </div>
          <button onClick={props.onClose} style={iconBtn}><X size={16} /></button>
        </div>

        <div style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Lock size={13} color={C.amber} />
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>
              Strategy Specification (locked)
            </div>
          </div>
          <SpecRow label="Timeframe"  value="15m + 1H HTF bias" />
          <SpecRow label="Candle"     value="Heikin Ashi" />
          <SpecRow label="EMA"        value="12 / 69 (informational, no filter)" />
          <SpecRow label="Signal"     value="DLO + Squeeze Momentum + HA confirmation" />
          <SpecRow label="Tiers"      value="A (high conviction) and B (moderate)" />
          <SpecRow label="SL/TP"      value="ATR 1.5× / 2.5×" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Instrument">
            <select value={props.symbol} onChange={e => props.setSymbol(e.target.value)} style={inputStyle}>
              {SYMBOLS.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" value={props.start} onChange={e => props.setStart(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date">
            <input type="date" value={props.end} onChange={e => props.setEnd(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <button onClick={props.onRun} disabled={props.running} style={runBtn(props.running)}>
          {props.running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {props.running ? "Running V3 backtest…" : "Run V3 Backtest"}
        </button>
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${C.border}`, fontSize: 12 }}>
      <span style={{ color: C.sec, fontWeight: 600 }}>{label}</span>
      <span style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function BadgePill({ kind }: { kind: RunType }) {
  const isV3 = kind === "v3";
  const color = isV3 ? C.green : C.blue;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      textTransform: "uppercase", letterSpacing: 0.7,
    }}>
      {isV3 ? "V3" : "Options"}
    </span>
  );
}

function MetricsCard({ title, m }: { title: string; m: BacktestMetrics | null }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Trades"        value={m?.trades != null ? String(m.trades) : "—"} color={C.text} />
        <Stat label="Win Rate"      value={fmtPct(m?.win_rate)}                        color={C.jade} />
        <Stat label="Profit Factor" value={fmtNum(m?.profit_factor)}                   color={C.blue} />
        <Stat label="Net P&L"       value={m?.net_pnl != null ? `$${m.net_pnl.toFixed(0)}` : "—"} color={C.green} />
        <Stat label="Max DD"        value={m?.max_drawdown != null ? `$${m.max_drawdown.toFixed(0)}` : "—"} color={C.red} />
        <Stat label="Sharpe"        value={fmtNum(m?.sharpe)}                          color={C.orange} />
        <Stat label="Avg R:R"       value={m?.avg_rr != null ? `${m.avg_rr.toFixed(2)}:1` : "—"} color={C.purple} />
        <Stat label="Expectancy"    value={m?.expectancy != null ? `$${m.expectancy.toFixed(1)}` : "—"} color={C.jade} />
      </div>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.sec, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 4 }} title={hint}>
        {label}{hint ? " ⓘ" : ""}
      </div>
      {children}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px", color: C.text, fontFamily: "'JetBrains Mono', monospace", ...style }}>{children}</td>;
}
function fmtPct(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}
function fmtNum(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

function safeJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
};
const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, borderRadius: 8, cursor: "pointer",
  background: "transparent", color: C.sec, border: `1px solid ${C.border}`,
};
const runBtn = (running: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 10, padding: "12px 28px",
  borderRadius: 10, border: "none", cursor: running ? "wait" : "pointer",
  background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
  color: C.bg, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
  marginTop: 16, opacity: running ? 0.7 : 1,
});
