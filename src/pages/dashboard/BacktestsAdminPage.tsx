import { useState, useEffect, useMemo } from "react";
import { C } from "@/lib/mock-data";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Play, Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BacktestRun {
  id: string;
  run_label: string | null;
  symbol: string;
  timeframe: string;
  htf_timeframe: string;
  period_start: string;
  period_end: string;
  in_sample_split: string | null;
  config: Record<string, unknown> | null;
  data_window: Record<string, unknown> | null;
  in_sample: BacktestMetrics | null;
  out_of_sample: BacktestMetrics | null;
  combined: BacktestMetrics | null;
  trades: unknown[] | null;
  equity_curve: number[] | { t: string; v: number }[] | null;
  verdict: string | null;
  issues: string[] | null;
  ron_ml_version: string | null;
  created_at: string;
}

interface BacktestMetrics {
  trades?: number;
  win_rate?: number;
  profit_factor?: number;
  net_pnl?: number;
  max_drawdown?: number;
  sharpe?: number;
  expectancy?: number;
  avg_rr?: number;
}

const DEFAULT_CONFIG = {
  starting_balance: 10000,
  risk_per_trade_pct: 1.0,
  atr_sl_mult: 1.5,
  atr_tp_mult: 2.5,
  min_tier: "B",
  spread_usd: 0.30,
  max_open_per_symbol: 1,
  max_hold_bars: 96,
  entry_mode: "next_open",
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export default function BacktestsAdminPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Form state
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("15m");
  const [htfTimeframe, setHtfTimeframe] = useState("1h");
  const [start, setStart] = useState(isoDaysAgo(730));
  const [end, setEnd] = useState(isoDaysAgo(0));
  const [splitDate, setSplitDate] = useState(isoDaysAgo(365));
  const [runLabel, setRunLabel] = useState("");
  const [configText, setConfigText] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));

  useEffect(() => {
    void loadRuns();
  }, []);

  const loadRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ron_backtest_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Failed to load runs: ${error.message}`);
    } else if (data) {
      setRuns(data as unknown as BacktestRun[]);
      if (data.length > 0 && !selectedId) setSelectedId((data[0] as BacktestRun).id);
    }
    setLoading(false);
  };

  const handleRun = async () => {
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = configText.trim() ? JSON.parse(configText) : {};
    } catch (e) {
      toast.error(`Invalid config JSON: ${(e as Error).message}`);
      return;
    }
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not signed in"); setRunning(false); return; }
      await supabase.auth.refreshSession();

      const { data, error } = await supabase.functions.invoke("ron-backtest", {
        body: {
          symbol,
          timeframe,
          htf_timeframe: htfTimeframe,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          in_sample_split: new Date(splitDate).toISOString(),
          run_label: runLabel || null,
          config: parsedConfig,
        },
      });
      if (error) throw new Error(error.message);
      toast.success("Backtest complete");
      const newId = (data as { run_id?: string })?.run_id;
      await loadRuns();
      if (newId) setSelectedId(newId);
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
    if (!selected?.equity_curve) return [];
    const ec = selected.equity_curve as unknown;
    if (Array.isArray(ec) && ec.length > 0) {
      if (typeof ec[0] === "number") return ec as number[];
      if (typeof ec[0] === "object" && ec[0] !== null && "v" in (ec[0] as object)) {
        return (ec as { v: number }[]).map(p => p.v);
      }
    }
    return [];
  }, [selected]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0 }}>RON v3 Backtests</h1>
          <div style={{ fontSize: 12, color: C.sec, marginTop: 4 }}>
            DLO + Squeeze + Heikin Ashi + EMA 12/69 — runs server-side via Render
          </div>
        </div>
        <button onClick={() => void loadRuns()} disabled={loading} style={iconBtnStyle}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Run form */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Run new backtest</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Field label="Symbol">
            <select value={symbol} onChange={e => setSymbol(e.target.value)} style={inputStyle}>
              {["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "NAS100", "US30", "AUDUSD", "NZDUSD"].map(s =>
                <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inputStyle}>
              {["5m", "15m", "30m", "1h", "4h"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="HTF (bias)">
            <select value={htfTimeframe} onChange={e => setHtfTimeframe(e.target.value)} style={inputStyle}>
              {["1h", "4h", "1d"].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Run label (optional)">
            <input value={runLabel} onChange={e => setRunLabel(e.target.value)} style={inputStyle} placeholder="e.g. v3-baseline" />
          </Field>
          <Field label="Start date">
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="In-sample / OOS split">
            <input type="date" value={splitDate} onChange={e => setSplitDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="End date">
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </Field>
          <Field label=" ">
            <button onClick={() => void handleRun()} disabled={running} style={runBtnStyle(running)}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {running ? "Running…" : "Run Backtest"}
            </button>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Config overrides (JSON, merged with defaults)">
            <textarea
              value={configText}
              onChange={e => setConfigText(e.target.value)}
              rows={8}
              style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, resize: "vertical" }}
            />
          </Field>
        </div>
      </div>

      {/* Recent runs */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={sectionTitleStyle}>Recent runs</div>
        {loading && runs.length === 0 ? (
          <div style={{ color: C.sec, fontSize: 13 }}>Loading…</div>
        ) : runs.length === 0 ? (
          <div style={{ color: C.sec, fontSize: 13 }}>No backtests yet. Trigger one above.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.sec, textAlign: "left" }}>
                  <Th>Date</Th><Th>Label</Th><Th>Symbol</Th><Th>TF</Th>
                  <Th>Verdict</Th>
                  <Th>IS WR</Th><Th>OOS WR</Th>
                  <Th>IS PF</Th><Th>OOS PF</Th>
                  <Th>Trades</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const isSel = selected?.id === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        cursor: "pointer",
                        background: isSel ? C.cardH : "transparent",
                        borderTop: `1px solid ${C.border}`,
                      }}
                    >
                      <Td>{new Date(r.created_at).toLocaleString()}</Td>
                      <Td style={{ color: C.text }}>{r.run_label ?? "—"}</Td>
                      <Td>{r.symbol}</Td>
                      <Td>{r.timeframe}/{r.htf_timeframe}</Td>
                      <Td><VerdictPill verdict={r.verdict} /></Td>
                      <Td>{fmtPct(r.in_sample?.win_rate)}</Td>
                      <Td>{fmtPct(r.out_of_sample?.win_rate)}</Td>
                      <Td>{fmtNum(r.in_sample?.profit_factor)}</Td>
                      <Td>{fmtNum(r.out_of_sample?.profit_factor)}</Td>
                      <Td>{(r.in_sample?.trades ?? 0) + (r.out_of_sample?.trades ?? 0)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected run detail */}
      {selected && (
        <>
          {/* Verdict */}
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <VerdictPill verdict={selected.verdict} large />
              <div style={{ fontSize: 12, color: C.sec }}>
                {selected.symbol} • {selected.timeframe} (HTF {selected.htf_timeframe}) •
                {" "}{new Date(selected.period_start).toLocaleDateString()} → {new Date(selected.period_end).toLocaleDateString()}
                {selected.ron_ml_version ? ` • ron-ml ${selected.ron_ml_version}` : ""}
              </div>
            </div>
            {selected.issues && selected.issues.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selected.issues.map((iss, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.text }}>
                    <AlertTriangle size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{iss}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.sec }}>
                <CheckCircle2 size={14} color={C.jade} /> No issues flagged.
              </div>
            )}
          </div>

          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
            <MetricsCard title="In-Sample" m={selected.in_sample} />
            <MetricsCard title="Out-of-Sample" m={selected.out_of_sample} />
            <MetricsCard title="Combined" m={selected.combined} />
          </div>

          {/* Equity curve */}
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={sectionTitleStyle}>
              Equity curve {selected.run_label ? `— ${selected.run_label}` : ""}
            </div>
            {equityValues.length > 1 ? (
              <Sparkline data={equityValues} color={C.jade} w={1100} h={220} />
            ) : (
              <div style={{ color: C.sec, fontSize: 13 }}>No equity curve data on this run.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function VerdictPill({ verdict, large }: { verdict: string | null; large?: boolean }) {
  const v = (verdict ?? "unknown").toLowerCase();
  const positive = /production|ready|pass|good/.test(v);
  const negative = /fail|reject|bad|not.?ready/.test(v);
  const color = positive ? C.jade : negative ? C.red : C.amber;
  const Icon = positive ? CheckCircle2 : negative ? XCircle : AlertTriangle;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: large ? "6px 12px" : "3px 8px",
      borderRadius: 999, fontSize: large ? 13 : 11, fontWeight: 700,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      <Icon size={large ? 14 : 11} /> {verdict ?? "unknown"}
    </span>
  );
}

function MetricsCard({ title, m }: { title: string; m: BacktestMetrics | null }) {
  return (
    <div style={cardStyle}>
      <div style={{ ...sectionTitleStyle, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Stat label="Trades" value={m?.trades != null ? String(m.trades) : "—"} color={C.text} />
        <Stat label="Win Rate" value={fmtPct(m?.win_rate)} color={C.jade} />
        <Stat label="Profit Factor" value={fmtNum(m?.profit_factor)} color={C.blue} />
        <Stat label="Net P&L" value={m?.net_pnl != null ? `$${m.net_pnl.toFixed(0)}` : "—"} color={C.green} />
        <Stat label="Max DD" value={m?.max_drawdown != null ? `$${m.max_drawdown.toFixed(0)}` : "—"} color={C.red} />
        <Stat label="Sharpe" value={fmtNum(m?.sharpe)} color={C.orange} />
        <Stat label="Avg R:R" value={m?.avg_rr != null ? `${m.avg_rr.toFixed(2)}:1` : "—"} color={C.purple} />
        <Stat label="Expectancy" value={m?.expectancy != null ? `$${m.expectancy.toFixed(1)}` : "—"} color={C.jade} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 4 }}>{label}</div>
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
  // Accept either 0–1 or 0–100
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}
function fmtNum(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

const cardStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
};
const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 8,
  background: C.card, color: C.text, border: `1px solid ${C.border}`,
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const runBtnStyle = (running: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: "9px 18px", borderRadius: 8, border: "none",
  cursor: running ? "wait" : "pointer", width: "100%",
  background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`,
  color: C.bg, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
  opacity: running ? 0.7 : 1,
});