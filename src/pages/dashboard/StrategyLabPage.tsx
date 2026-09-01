import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

type Metrics = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netReturnPct: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPct: number;
  endingEquity: number;
};

type Candidate = {
  candidate: { id: string; family: string; rewardRisk: number; stopAtr: number };
  rank: number;
  validationScore: number;
  selected: boolean;
  promotionEligible: boolean;
  promotionReasons: string[];
  explanation: string;
  train: Metrics;
  validation: Metrics;
  holdout: Metrics;
};

type LabResponse = {
  error?: string;
  detail?: string;
  run_id?: string;
  status?: string;
  execution_allowed?: boolean;
  audit?: {
    candleCount: number;
    sourceGatePassed: boolean;
    recommendedSampleReached: boolean;
    duplicateTimestamps: number;
    invalidOhlcRows: number;
    largeTimeGaps: number;
    warnings: string[];
  };
  agents?: Array<{ agentId: string; status: string; detail: string }>;
  champion?: Candidate | null;
  candidates?: Candidate[];
  equity_curve?: Array<{ time: number; equity: number }>;
  disclosure?: string;
};

const oneYearAgo = () => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
};

export default function StrategyLabPage() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState("15m");
  const [start, setStart] = useState(oneYearAgo);
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [riskPercent, setRiskPercent] = useState(1);
  const [spreadBps, setSpreadBps] = useState(1.5);
  const [commissionBps, setCommissionBps] = useState(0.5);
  const [slippageBps, setSlippageBps] = useState(1);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabResponse | null>(null);

  const chartData = useMemo(() => (result?.equity_curve ?? []).map((point) => ({
    time: new Date(point.time).toLocaleDateString(), equity: point.equity,
  })), [result]);

  const runLab = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in before running Strategy Lab.");
      const { data, error } = await supabase.functions.invoke("strategy-lab-backtest", {
        body: {
          symbol, timeframe,
          period_start: new Date(`${start}T00:00:00Z`).toISOString(),
          period_end: new Date(`${end}T23:59:59Z`).toISOString(),
          initial_equity: 10_000,
          risk_percent: riskPercent,
          costs: {
            spread_bps: spreadBps,
            commission_bps: commissionBps,
            slippage_bps: slippageBps,
          },
        },
      });
      if (error) throw error;
      setResult(data as LabResponse);
    } catch (error) {
      setResult({ error: "strategy_lab_request_failed", detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(false);
    }
  };

  const champion = result?.champion ?? null;
  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.jade, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>Research only · execution locked off</div>
          <h1 style={{ fontSize: 28, margin: "6px 0 4px", fontWeight: 900 }}>GainEdge Strategy Lab</h1>
          <p style={{ color: C.sec, margin: 0, maxWidth: 760, lineHeight: 1.5 }}>
            Eight specialists test bounded long/short hypotheses on genuine stored candles. Ranking uses validation data; the untouched holdout only confirms the selected champion.
          </p>
        </div>
        <StatusPill label="LIVE TRADING" value="DISABLED" good />
      </div>

      <section style={{ ...panel, marginTop: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 12 }}>
          <Field label="Market">
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)} style={input}>
              {['XAUUSD', 'NAS100', 'HK50', 'GER40'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} style={input}>
              {['5m', '15m', '1h', '4h'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label="Start"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} style={input} /></Field>
          <Field label="End"><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} style={input} /></Field>
          <Field label="Risk %"><NumberInput value={riskPercent} set={setRiskPercent} step={0.1} /></Field>
          <Field label="Spread bps"><NumberInput value={spreadBps} set={setSpreadBps} step={0.1} /></Field>
          <Field label="Commission bps"><NumberInput value={commissionBps} set={setCommissionBps} step={0.1} /></Field>
          <Field label="Slippage bps"><NumberInput value={slippageBps} set={setSlippageBps} step={0.1} /></Field>
        </div>
        <button onClick={runLab} disabled={running} style={{
          marginTop: 16, padding: "11px 22px", borderRadius: 8, border: "none",
          background: running ? C.muted : C.jade, color: "#06120F", fontWeight: 900,
          cursor: running ? "wait" : "pointer", fontSize: 15,
        }}>
          {running ? "Eight agents are testing…" : "Run Strategy Lab"}
        </button>
      </section>

      {result?.error && (
        <div style={{ ...panel, marginTop: 18, borderColor: C.red, color: C.red }}>
          <strong>{result.error}</strong>{result.detail ? ` — ${result.detail}` : ""}
        </div>
      )}

      {result?.audit && (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 18 }}>
            <Kpi label="Candles" value={String(result.audit.candleCount)} />
            <Kpi label="Source gate" value={result.audit.sourceGatePassed ? "PASSED" : "BLOCKED"} good={result.audit.sourceGatePassed} />
            <Kpi label="20k sample" value={result.audit.recommendedSampleReached ? "REACHED" : "NOT REACHED"} good={result.audit.recommendedSampleReached} />
            <Kpi label="Duplicates" value={String(result.audit.duplicateTimestamps)} good={result.audit.duplicateTimestamps === 0} />
            <Kpi label="Invalid OHLC" value={String(result.audit.invalidOhlcRows)} good={result.audit.invalidOhlcRows === 0} />
            <Kpi label="Large gaps" value={String(result.audit.largeTimeGaps)} />
          </section>

          <h2 style={heading}>Eight-agent run</h2>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
            {(result.agents ?? []).map((agent) => (
              <div key={agent.agentId} style={panel}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ textTransform: "capitalize" }}>{agent.agentId.replaceAll("_", " ")}</strong>
                  <span style={{ color: agent.status === "complete" ? C.jade : agent.status === "blocked" ? C.red : "#F59E0B", fontSize: 11, fontWeight: 800 }}>{agent.status.toUpperCase()}</span>
                </div>
                <div style={{ color: C.sec, marginTop: 7, fontSize: 13, lineHeight: 1.45 }}>{agent.detail}</div>
              </div>
            ))}
          </section>
        </>
      )}

      {champion && (
        <>
          <h2 style={heading}>Validation-selected champion</h2>
          <section style={{ ...panel, borderColor: champion.promotionEligible ? C.jade : "#F59E0B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 900, textTransform: "capitalize" }}>{champion.candidate.family.replaceAll("_", " ")}</div>
                <div style={{ color: C.sec, marginTop: 5 }}>{champion.explanation}</div>
              </div>
              <StatusPill label="PAPER GATE" value={champion.promotionEligible ? "ELIGIBLE" : "NOT PASSED"} good={champion.promotionEligible} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 16 }}>
              <Kpi label="Holdout return" value={`${champion.holdout.netReturnPct.toFixed(2)}%`} good={champion.holdout.netReturnPct > 0} />
              <Kpi label="Profit factor" value={champion.holdout.profitFactor.toFixed(2)} good={champion.holdout.profitFactor >= 1.1} />
              <Kpi label="Wins / losses" value={`${champion.holdout.wins} / ${champion.holdout.losses}`} />
              <Kpi label="Win rate" value={`${champion.holdout.winRate.toFixed(1)}%`} />
              <Kpi label="Expectancy" value={`${champion.holdout.expectancyR.toFixed(3)}R`} good={champion.holdout.expectancyR > 0} />
              <Kpi label="Max drawdown" value={`${champion.holdout.maxDrawdownPct.toFixed(2)}%`} good={champion.holdout.maxDrawdownPct <= 20} />
            </div>
            {!champion.promotionEligible && champion.promotionReasons.length > 0 && (
              <div style={{ color: "#F59E0B", marginTop: 13, fontSize: 13 }}>
                Gate: {champion.promotionReasons.map((reason) => reason.replaceAll("_", " ")).join(" · ")}
              </div>
            )}
          </section>

          <section style={{ ...panel, height: 300, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="time" hide />
                <YAxis domain={["auto", "auto"]} tick={{ fill: C.sec, fontSize: 12 }} width={68} />
                <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.border}` }} />
                <Line dataKey="equity" type="monotone" stroke={C.jade} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      {(result?.candidates?.length ?? 0) > 0 && (
        <>
          <h2 style={heading}>Top validation candidates</h2>
          <section style={{ ...panel, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 13 }}>
              <thead><tr>
                {['Rank', 'Candidate', 'Validation score', 'Validation PF', 'Validation return', 'Holdout PF', 'Holdout return', 'Paper gate'].map((label) => <th key={label} style={th}>{label}</th>)}
              </tr></thead>
              <tbody>{result?.candidates?.map((candidate) => (
                <tr key={candidate.candidate.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>#{candidate.rank}</td>
                  <td style={{ ...td, textTransform: "capitalize", fontWeight: 700 }}>{candidate.candidate.family.replaceAll("_", " ")}</td>
                  <td style={td}>{candidate.validationScore.toFixed(1)}</td>
                  <td style={td}>{candidate.validation.profitFactor.toFixed(2)}</td>
                  <td style={td}>{candidate.validation.netReturnPct.toFixed(2)}%</td>
                  <td style={td}>{candidate.holdout.profitFactor.toFixed(2)}</td>
                  <td style={td}>{candidate.holdout.netReturnPct.toFixed(2)}%</td>
                  <td style={{ ...td, color: candidate.promotionEligible ? C.jade : "#F59E0B" }}>{candidate.promotionEligible ? "Eligible" : "Not passed"}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>
        </>
      )}

      {result?.disclosure && <p style={{ color: C.muted, fontSize: 12, marginTop: 16 }}>{result.disclosure}</p>}
    </div>
  );
}

const panel: React.CSSProperties = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 14 };
const heading: React.CSSProperties = { fontSize: 17, margin: "25px 0 10px", fontWeight: 800 };
const th: React.CSSProperties = { padding: "10px 12px", color: C.sec, textAlign: "left", fontWeight: 700 };
const td: React.CSSProperties = { padding: "11px 12px", color: C.text };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <span style={{ color: C.sec, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
    {children}
  </label>;
}

function NumberInput({ value, set, step }: { value: number; set: (value: number) => void; step: number }) {
  return <input type="number" min={0} step={step} value={value} onChange={(event) => set(Number(event.target.value))} style={input} />;
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div style={panel}>
    <div style={{ color: C.sec, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
    <div style={{ color: good === undefined ? C.text : good ? C.jade : "#F59E0B", fontSize: 19, fontWeight: 900, marginTop: 5 }}>{value}</div>
  </div>;
}

function StatusPill({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div style={{ border: `1px solid ${good ? C.jade : "#F59E0B"}`, borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
    <span style={{ color: C.sec, fontSize: 10, fontWeight: 800 }}>{label} </span>
    <span style={{ color: good ? C.jade : "#F59E0B", fontSize: 12, fontWeight: 900 }}>{value}</span>
  </div>;
}
