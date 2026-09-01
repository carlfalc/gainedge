import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Strategy Lab V1 regression isolation", () => {
  it("does not enter the frozen XAUUSD scheduler or Falconer source", () => {
    expect(read("supabase/functions/ron-schedule-orchestration/index.ts")).not.toContain("strategy-lab");
    expect(read("supabase/functions/_shared/falconer-strategy.ts")).not.toContain("strategy-lab");
  });

  it("does not alter RON's accepted evidence or agent registry", () => {
    expect(read("supabase/functions/_shared/ron-agent-contracts.ts")).not.toContain("strategy_lab");
    expect(read("supabase/functions/_shared/ron-agentic-architecture.ts")).not.toContain("strategy_lab");
  });

  it("contains no broker-order path in the Strategy Lab engine or endpoint", () => {
    const code = `${read("supabase/functions/_shared/strategy-lab-engine.ts")}\n${read("supabase/functions/strategy-lab-backtest/index.ts")}`;
    expect(code).not.toContain("metaapi-trade");
    expect(code).not.toContain("PINECONNECTOR");
    expect(code).not.toMatch(/allow_live_execution\s*:\s*true/);
  });
});
