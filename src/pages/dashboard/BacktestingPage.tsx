/**
 * `/dashboard/backtesting` — Strategy Lab V2 is the surface. The legacy Falconer v7
 * backtest UI (endpoint `falconer-backtest`, history table `falconer_backtest_runs`) is
 * retained behind a secondary toggle so no stored research is orphaned.
 *
 * Strategy Lab V1 was removed here: it was a thin wrapper over `strategy-lab-backtest`
 * with no logic V2 does not supersede. The V1 endpoint and its tables remain untouched.
 */
import { useState } from "react";
import { C } from "@/lib/mock-data";
import FalconerBacktestPanel from "@/components/backtesting/FalconerBacktestPanel";
import StrategyLabV2Page from "./StrategyLabV2Page";

type Workspace = "strategy_lab_v2" | "falconer";

export default function BacktestingPage() {
  const [workspace, setWorkspace] = useState<Workspace>("strategy_lab_v2");

  return <div>
    <div style={{ display: "flex", gap: 8, padding: "16px 24px 0" }}>
      {([
        ["strategy_lab_v2", "V2 Deep Discovery · 7 agents"],
        ["falconer", "Legacy Falconer v7 backtest"],
      ] as const).map(([value, label]) => (
        <button key={value} onClick={() => setWorkspace(value)} style={{
          border: `1px solid ${workspace === value ? C.jade : C.border}`,
          background: workspace === value ? `${C.jade}18` : C.bg2,
          color: workspace === value ? C.jade : C.sec,
          borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 800,
        }}>{label}</button>
      ))}
    </div>
    {workspace === "strategy_lab_v2" ? <StrategyLabV2Page /> : <FalconerBacktestPanel />}
  </div>;
}
