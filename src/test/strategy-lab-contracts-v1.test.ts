import { describe, expect, it } from "vitest";
import { RON_AGENT_IDS } from "../../supabase/functions/_shared/ron-agent-contracts";
import {
  STRATEGY_LAB_AGENTS,
  STRATEGY_LAB_AGENT_IDS,
  STRATEGY_LAB_CORE_MARKETS,
  strategyLabRegistryPayload,
} from "../../supabase/functions/_shared/strategy-lab-contracts";

describe("Strategy Lab V1 isolated contracts", () => {
  it("registers exactly eight real specialists without changing RON's seven-agent registry", () => {
    expect(STRATEGY_LAB_AGENTS).toHaveLength(8);
    expect(new Set(STRATEGY_LAB_AGENT_IDS).size).toBe(8);
    expect(RON_AGENT_IDS).toHaveLength(7);
    expect(STRATEGY_LAB_AGENT_IDS.some((id) => RON_AGENT_IDS.includes(id as never))).toBe(false);
  });

  it("starts with the four approved Eightcap markets", () => {
    expect(STRATEGY_LAB_CORE_MARKETS).toEqual(["XAUUSD", "NAS100", "HK50", "GER40"]);
  });

  it("keeps execution disabled in the hashable registry payload", () => {
    const payload = strategyLabRegistryPayload();
    expect(payload).toContain("execution_allowed");
    expect(payload).toContain(false);
    expect(payload).toContain(8);
  });
});
