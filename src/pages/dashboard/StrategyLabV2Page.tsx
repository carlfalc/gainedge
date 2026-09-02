import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

type Agent = {
  agent_id: string; status: string; generated: number; tested: number; rejected: number;
  generations: number; budget?: number;
  artifact?: {
    families?: string[]; best_score?: number; best_metrics?: Metrics; last_error?: string;
    checkpoint?: {
      budget?: number; chunk_size?: number; planned_generations?: number; completed_generations?: number;
      generated?: number; tested?: number; rejected?: number;
    };
  };
};
type Metrics = {
  trades: number; wins: number; losses: number; win_rate: number; win_rate_lower_95: number;
  profit_factor: number; expectancy_r: number; net_return_pct: number; max_drawdown_pct: number;
  average_win_r: number; average_loss_r: number; longest_losing_streak: number;
};
type Leader = {
  candidate_hash: string; family: string; score: number; positive_fold_ratio: number;
  development_metrics: Metrics; genome: Record<string, unknown>; disqualified: boolean;
};
type FinalResult = {
  verdict: "VIABLE_STRATEGY_FOUND" | "NO_VIABLE_STRATEGY_FOUND" | "INCONCLUSIVE_INSUFFICIENT_DATA";
  reasons: string[];
  selected: null | { candidate_hash: string; score: number; genome: Record<string, unknown>; metrics: Metrics; positive_fold_ratio: number };
  holdout_metrics: Metrics | null;
  stress_metrics: Array<{ scenario: string; metrics: Metrics }>;
  probability_pf_above_one: number;
  probability_expectancy_above_zero: number;
  exact_rules: string[];
  tested_universe?: { agents: number; unique_candidates: number; walk_forward_folds: number; stress_scenarios: number; bootstrap_runs: number };
};
type Progress = {
  percent?: number; generated?: number; tested?: number; rejected?: number; total_budget?: number;
  agents_completed?: number; agents_total?: number; phase?: string; current_agent?: string;
};
type Run = {
  id: string; status: string; verdict: FinalResult["verdict"] | null; symbol: string; timeframe: string;
  candle_count: number; search_depth: string; random_seed: number; dataset_audit: Record<string, unknown>;
  progress: Progress;
  candidates_generated: number; candidates_tested: number; candidates_rejected: number;
  final_result: FinalResult | null; execution_allowed: false; error_message?: string | null;
};
/** One `run_agent` invocation = one bounded generation. `state` says whether to call again. */
type ChunkResponse = {
  agent?: {
    agent_id: string; state: "partial" | "complete"; generated: number; tested: number;
    rejected: number; generations: number; planned_generations: number; budget: number; chunk_size: number;
  };
  progress?: Progress;
  next_action?: { action: "run_agent" | "finalise"; agent_id?: string };
  skipped?: boolean;
};


const AGENT_LABELS: Record<string, string> = {
  trend_structure: "Trend & Structure Search",
  breakout_volatility: "Breakout & Volatility Search",
  mean_reversion: "Mean-Reversion Search",
  momentum: "Momentum Search",
  price_action: "Price Action & Liquidity Search",
  volume_liquidity: "Volume & Liquidity Search",
  strategy_composer: "Hybrid Strategy Evolution",
};
const AGENT_ORDER = Object.keys(AGENT_LABELS);
const DEPTHS = {
  standard: { candidates: 672, bootstrap: 200, label: "Standard · 672 candidates" },
  deep: { candidates: 1792, bootstrap: 500, label: "Deep · 1,792 candidates" },
  maximum: { candidates: 3584, bootstrap: 1000, label: "Maximum · 3,584 candidates" },
} as const;
/**
 * Safety valve for the drive loop. Every invocation evaluates one bounded generation, so a
 * healthy agent finishes in `planned_generations` calls; this only stops a pathological loop.
 */
const MAX_INVOCATIONS_PER_AGENT = 40;
const TERMINAL = ["viable_strategy_found", "no_viable_strategy", "inconclusive", "failed", "cancelled"];

const oneYearAgo = () => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - 1); return date.toISOString().slice(0, 10); };

export default function StrategyLabV2Page() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("15m");
  const [start, setStart] = useState(oneYearAgo);
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [depth, setDepth] = useState<keyof typeof DEPTHS>("deep");
  const [spread, setSpread] = useState(1.5);
  const [commission, setCommission] = useState(0.5);
  const [slippage, setSlippage] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("strategy-lab-v2-discover", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.detail ?? data.error);
    return data;
  };

  const refresh = async (runId: string) => {
    const data = await invoke({ action: "status", run_id: runId });
    setRun(data.run as Run);
    setAgents((data.agents ?? []) as Agent[]);
    setLeaders((data.leaders ?? []) as Leader[]);
    return data as { run: Run; agents: Agent[]; leaders: Leader[] };
  };

  useEffect(() => {
    let mounted = true;
    const restoreRun = async () => {
      const saved = localStorage.getItem("strategy_lab_v2_run_id");
      if (saved) {
        try {
          await refresh(saved);
          return;
        } catch {
          localStorage.removeItem("strategy_lab_v2_run_id");
        }
      }

      // A run may have started on the preview or custom domain, or survived a browser reset.
      // RLS limits this lookup to the signed-in user's own runs.
      const { data, error } = await supabase.from("strategy_lab_v2_runs")
        .select("id")
        .eq("status", "searching")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!mounted || !data?.id) return;
      localStorage.setItem("strategy_lab_v2_run_id", data.id);
      await refresh(data.id);
    };
    restoreRun().catch((error) => {
      if (mounted) setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => { mounted = false; };
  }, []);

  /** Merges one chunk response into local state so partial progress is visible immediately. */
  const applyChunk = (chunk: ChunkResponse) => {
    if (chunk.progress) setRun((current) => current ? { ...current, progress: chunk.progress! } : current);
    const detail = chunk.agent;
    if (!detail) return;
    setAgents((current) => current.map((agent) => agent.agent_id === detail.agent_id
      ? {
        ...agent,
        status: detail.state === "complete" ? "complete" : "running",
        generated: detail.generated, tested: detail.tested, rejected: detail.rejected,
        generations: detail.generations, budget: detail.budget,
        artifact: {
          ...agent.artifact,
          checkpoint: {
            ...agent.artifact?.checkpoint,
            budget: detail.budget, chunk_size: detail.chunk_size,
            planned_generations: detail.planned_generations, completed_generations: detail.generations,
            generated: detail.generated, tested: detail.tested, rejected: detail.rejected,
          },
        },
      }
      : agent));
  };

  /**
   * One invocation evaluates a single bounded generation, so each agent is invoked
   * repeatedly until the server reports it complete before the next agent starts. All
   * counters come from the server's persisted state, so a refresh mid-run resumes cleanly.
   */
  const executeRemaining = async (runId: string, initialAgents?: string[]) => {
    setWorking(true);
    try {
      const status = await refresh(runId);
      const completed = new Set(status.agents.filter((agent) => agent.status === "complete").map((agent) => agent.agent_id));
      const ordered = initialAgents ?? (status.agents.length ? AGENT_ORDER.filter((id) => status.agents.some((agent) => agent.agent_id === id)) : AGENT_ORDER);
      const pending = ordered.filter((agentId) => !completed.has(agentId));
      for (const agentId of pending) {
        const label = AGENT_LABELS[agentId] ?? agentId;
        for (let invocation = 1; ; invocation += 1) {
          if (invocation > MAX_INVOCATIONS_PER_AGENT) throw new Error(`agent_did_not_complete:${agentId}`);
          setMessage(`${label} — evolving generation ${invocation}…`);
          const chunk = await invoke({ action: "run_agent", run_id: runId, agent_id: agentId }) as ChunkResponse;
          applyChunk(chunk);
          if (chunk.skipped || chunk.agent?.state === "complete") break;
          if (!chunk.agent) throw new Error(`agent_response_missing_state:${agentId}`);
          setMessage(`${label} — ${chunk.agent.tested}/${chunk.agent.budget} tested · generation ${chunk.agent.generations}/${chunk.agent.planned_generations}`);
        }
        await refresh(runId);
      }
      setMessage("Stress testing finalists and opening the sealed holdout once…");
      const final = await invoke({ action: "finalise", run_id: runId });
      setRun(final.run as Run);
      await refresh(runId);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };


  const startRun = async () => {
    setWorking(true); setMessage("Auditing candles and sealing the holdout…"); setRun(null); setAgents([]); setLeaders([]);
    try {
      const data = await invoke({
        action: "start", symbol, timeframe, search_depth: depth,
        period_start: new Date(`${start}T00:00:00Z`).toISOString(),
        period_end: new Date(`${end}T23:59:59Z`).toISOString(),
        risk_percent: 1, costs: { spread_bps: spread, commission_bps: commission, slippage_bps: slippage },
      });
      const created = data.run as Run;
      setRun(created); localStorage.setItem("strategy_lab_v2_run_id", created.id);
      if (data.next_agents?.length) await executeRemaining(created.id, data.next_agents);
      else { await refresh(created.id); setWorking(false); setMessage(""); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error)); setWorking(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    await invoke({ action: "cancel", run_id: run.id });
    await refresh(run.id);
  };

  const result = run?.final_result;
  const verdictStyle = result?.verdict === "VIABLE_STRATEGY_FOUND"
    ? { color: C.jade, border: C.jade, headline: "VIABLE STRATEGY FOUND" }
    : result?.verdict === "NO_VIABLE_STRATEGY_FOUND"
    ? { color: "#F59E0B", border: "#F59E0B", headline: "NO VIABLE STRATEGY FOUND" }
    : { color: C.red, border: C.red, headline: "INCONCLUSIVE — INSUFFICIENT DATA" };

  const progress = run?.progress?.percent ?? 0;
  const availableNote = useMemo(() => timeframe === "15m"
    ? "Best current coverage across all four markets."
    : timeframe === "1m" && symbol === "XAUUSD"
    ? "Large XAUUSD dataset; the engine caps a run at 120,000 candles and reports truncation."
    : "Coverage may be insufficient. The data audit will refuse to fabricate a result.", [symbol, timeframe]);

  return <div style={{ padding: 24, color: C.text, maxWidth: 1500, margin: "0 auto", fontFamily: "'DM Sans',sans-serif" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: C.jade, fontSize: 12, fontWeight: 900, letterSpacing: 1.3 }}>V2 DEEP DISCOVERY · RESEARCH ONLY</div>
        <h1 style={{ fontSize: 30, margin: "7px 0" }}>GainEdge Strategy Discovery Engine</h1>
        <p style={{ color: C.sec, maxWidth: 900, lineHeight: 1.5, margin: 0 }}>
          Seven search agents evolve independently parameterised strategies. Five chronological walk-forward folds prune them; cost, delay and parameter stresses rank finalists; one frozen finalist alone sees the sealed holdout.
        </p>
      </div>
      <Pill label="BROKER EXECUTION" value="LOCKED OFF" color={C.jade} />
    </div>

    <section style={{ ...panel, marginTop: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Field label="Market"><select value={symbol} onChange={(event) => setSymbol(event.target.value)} style={input}>
          {["XAUUSD", "NAS100", "HK50", "GER40"].map((value) => <option key={value}>{value}</option>)}
        </select></Field>
        <Field label="Timeframe"><select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} style={input}>
          {["1m", "5m", "15m", "1h", "4h"].map((value) => <option key={value}>{value}</option>)}
        </select></Field>
        <Field label="Search depth"><select value={depth} onChange={(event) => setDepth(event.target.value as keyof typeof DEPTHS)} style={input}>
          {Object.entries(DEPTHS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select></Field>
        <Field label="Start"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} style={input} /></Field>
        <Field label="End"><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} style={input} /></Field>
        <Field label="Spread bps"><Num value={spread} set={setSpread} /></Field>
        <Field label="Commission bps"><Num value={commission} set={setCommission} /></Field>
        <Field label="Slippage bps"><Num value={slippage} set={setSlippage} /></Field>
      </div>
      <div style={{ color: C.sec, fontSize: 12, marginTop: 10 }}>{availableNote}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button disabled={working} onClick={startRun} style={primaryButton}>
          {working ? "Discovery running…" : `Start ${DEPTHS[depth].label}`}
        </button>
        {run && !TERMINAL.includes(run.status) && !working && <button onClick={() => executeRemaining(run.id)} style={secondaryButton}>Resume run</button>}
        {run && !TERMINAL.includes(run.status) && <button onClick={cancel} style={{ ...secondaryButton, color: C.red }}>Cancel</button>}
      </div>
    </section>

    {message && !run && <div style={{ ...panel, marginTop: 16, color: C.red }}>{message}</div>}

    {run && <>
      <section style={{ ...panel, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <strong>{message || String(run.progress?.phase ?? run.status).replaceAll("_", " ").toUpperCase()}</strong>
          <span style={{ color: C.jade, fontWeight: 900 }}>{progress}%</span>
        </div>
        <div style={{ height: 9, background: C.bg, borderRadius: 10, overflow: "hidden", marginTop: 10 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: C.jade, transition: "width .3s" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9, marginTop: 14 }}>
          <Kpi label="Candles" value={String(run.candle_count)} />
          <Kpi label="Generated" value={String(run.progress.generated ?? run.candidates_generated)} />
          <Kpi label="Tested" value={String(run.progress.tested ?? run.candidates_tested)} />
          <Kpi label="Rejected" value={String(run.progress.rejected ?? run.candidates_rejected)} />
          <Kpi label="Agents" value={`${run.progress.agents_completed ?? 0}/${run.progress.agents_total ?? 7}`} />
          <Kpi label="Walk-forward" value="5 folds" />
        </div>
      </section>

      <h2 style={heading}>Actual search-agent work</h2>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 10 }}>
        {agents.map((agent) => {
          const budget = agent.budget ?? agent.artifact?.checkpoint?.budget ?? 0;
          const tested = agent.tested ?? agent.artifact?.checkpoint?.tested ?? 0;
          const agentPercent = budget > 0 ? Math.min(100, Math.round((tested / budget) * 100)) : 0;
          const planned = agent.artifact?.checkpoint?.planned_generations;
          const statusText = agent.status === "complete"
            ? `${tested}/${budget || tested} tested · ${agent.rejected} rejected · ${agent.generations}${planned ? `/${planned}` : ""} generations`
            : tested > 0 || agent.status === "running"
            ? `${tested}/${budget || "—"} tested · generation ${agent.generations}${planned ? `/${planned}` : ""}`
            : "Waiting for deterministic search";
          return <div key={agent.agent_id} style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{AGENT_LABELS[agent.agent_id] ?? agent.agent_id}</strong>
            <span style={{ color: agent.status === "complete" ? C.jade : "#F59E0B", fontSize: 11, fontWeight: 900 }}>{agent.status.toUpperCase()}</span>
          </div>
          <div style={{ color: C.sec, marginTop: 8, fontSize: 13 }}>
            {statusText}
          </div>
          <div style={{ height: 6, background: C.bg, borderRadius: 8, overflow: "hidden", marginTop: 9 }}>
            <div style={{ width: `${agentPercent}%`, height: "100%", background: agent.status === "complete" ? C.jade : "#F59E0B", transition: "width .3s" }} />
          </div>
          {agent.artifact?.families && <div style={{ color: C.muted, marginTop: 5, fontSize: 11 }}>{agent.artifact.families.join(" · ").replaceAll("_", " ")}</div>}
          {agent.artifact?.last_error && <div style={{ color: C.red, marginTop: 6, fontSize: 11 }}>Last retry: {agent.artifact.last_error.replaceAll("_", " ")}</div>}
        </div>;
        })}
      </section>
    </>}

    {result && <>
      <section style={{ ...panel, marginTop: 24, borderColor: verdictStyle.border, borderWidth: 2 }}>
        <div style={{ color: verdictStyle.color, fontWeight: 1000, letterSpacing: 1.3, fontSize: 13 }}>{verdictStyle.headline}</div>
        <h2 style={{ fontSize: 26, margin: "8px 0" }}>
          {result.selected ? String(result.selected.genome.family).replaceAll("_", " ") : "No strategy promoted"}
        </h2>
        {result.reasons.length > 0 && <div style={{ color: "#F59E0B", lineHeight: 1.6 }}>
          {result.reasons.map((reason) => reason.replaceAll("_", " ")).join(" · ")}
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 16 }}>
          <Kpi label="OOS profit factor" value={result.selected?.metrics.profit_factor.toFixed(2) ?? "—"} />
          <Kpi label="OOS win rate" value={result.selected ? `${result.selected.metrics.win_rate.toFixed(1)}%` : "—"} />
          <Kpi label="Win-rate lower 95%" value={result.selected ? `${result.selected.metrics.win_rate_lower_95.toFixed(1)}%` : "—"} />
          <Kpi label="Holdout PF" value={result.holdout_metrics?.profit_factor.toFixed(2) ?? "—"} />
          <Kpi label="Holdout return" value={result.holdout_metrics ? `${result.holdout_metrics.net_return_pct.toFixed(2)}%` : "—"} />
          <Kpi label="P(PF > 1)" value={`${(result.probability_pf_above_one * 100).toFixed(1)}%`} />
          <Kpi label="P(expectancy > 0)" value={`${(result.probability_expectancy_above_zero * 100).toFixed(1)}%`} />
        </div>
      </section>

      {result.exact_rules.length > 0 && <>
        <h2 style={heading}>Exact reproducible strategy</h2>
        <section style={panel}><ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          {result.exact_rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ol><pre style={{ background: C.bg, padding: 12, borderRadius: 8, overflowX: "auto", color: C.sec, marginTop: 14 }}>
          {JSON.stringify(result.selected?.genome, null, 2)}
        </pre></section>
      </>}

      {result.stress_metrics.length > 0 && <>
        <h2 style={heading}>Robustness stress tests</h2>
        <section style={{ ...panel, overflowX: "auto" }}><table style={table}>
          <thead><tr>{["Scenario", "Trades", "PF", "Win rate", "Expectancy", "Return", "Drawdown"].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead>
          <tbody>{result.stress_metrics.map((item) => <tr key={item.scenario} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={td}>{item.scenario.replaceAll("_", " ")}</td><td style={td}>{item.metrics.trades}</td>
            <td style={td}>{item.metrics.profit_factor.toFixed(2)}</td><td style={td}>{item.metrics.win_rate.toFixed(1)}%</td>
            <td style={td}>{item.metrics.expectancy_r.toFixed(3)}R</td><td style={td}>{item.metrics.net_return_pct.toFixed(2)}%</td>
            <td style={td}>{item.metrics.max_drawdown_pct.toFixed(2)}%</td>
          </tr>)}</tbody>
        </table></section>
      </>}
    </>}

    {leaders.length > 0 && <>
      <h2 style={heading}>Development leaders — holdout hidden</h2>
      <section style={{ ...panel, overflowX: "auto" }}><table style={table}>
        <thead><tr>{["Rank", "Family", "Score", "Trades", "PF", "Win rate", "PF folds", "Status"].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead>
        <tbody>{leaders.map((leader, index) => <tr key={leader.candidate_hash} style={{ borderTop: `1px solid ${C.border}` }}>
          <td style={td}>#{index + 1}</td><td style={{ ...td, textTransform: "capitalize" }}>{leader.family.replaceAll("_", " ")}</td>
          <td style={td}>{Number(leader.score).toFixed(1)}</td><td style={td}>{leader.development_metrics.trades}</td>
          <td style={td}>{leader.development_metrics.profit_factor.toFixed(2)}</td><td style={td}>{leader.development_metrics.win_rate.toFixed(1)}%</td>
          <td style={td}>{(Number(leader.positive_fold_ratio) * 100).toFixed(0)}%</td>
          <td style={{ ...td, color: leader.disqualified ? "#F59E0B" : C.jade }}>{leader.disqualified ? "Pruned" : "Advanced"}</td>
        </tr>)}</tbody>
      </table></section>
    </>}

    <p style={{ color: C.muted, fontSize: 12, marginTop: 18 }}>
      Historical research can identify robust past behaviour, not guarantee future profit. Win rate is reported with its confidence bound and cannot override negative expectancy or failed holdout evidence.
    </p>
  </div>;
}

const panel: React.CSSProperties = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: 17 };
const input: React.CSSProperties = { width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 11px", fontSize: 14 };
const heading: React.CSSProperties = { fontSize: 18, margin: "26px 0 11px", fontWeight: 900 };
const primaryButton: React.CSSProperties = { border: 0, borderRadius: 8, padding: "12px 20px", background: C.jade, color: "#04110e", fontWeight: 1000, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 17px", background: C.bg, color: C.text, fontWeight: 800, cursor: "pointer" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 880, fontSize: 13 };
const th: React.CSSProperties = { padding: "10px 12px", color: C.sec, textAlign: "left" };
const td: React.CSSProperties = { padding: "11px 12px" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={{ color: C.sec, fontSize: 11, fontWeight: 900 }}>{label.toUpperCase()}</span>{children}</label>;
}
function Num({ value, set }: { value: number; set: (value: number) => void }) {
  return <input type="number" min={0} step={0.1} value={value} onChange={(event) => set(Number(event.target.value))} style={input} />;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: 12 }}>
    <div style={{ color: C.sec, fontSize: 10, fontWeight: 900 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 18, fontWeight: 1000, marginTop: 5 }}>{value}</div>
  </div>;
}
function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return <div style={{ border: `1px solid ${color}`, borderRadius: 8, padding: "9px 12px", height: "fit-content" }}>
    <span style={{ color: C.sec, fontSize: 10, fontWeight: 900 }}>{label} </span><span style={{ color, fontWeight: 1000, fontSize: 12 }}>{value}</span>
  </div>;
}
