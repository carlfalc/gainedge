/**
 * GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1 — artifact-clock TTL correction.
 *
 * Proves TTL policy v2 exempts ONLY artifact-clock evidence, that policy v1 stays the
 * default everywhere, that Opportunity/Risk V4 and Orchestration Run V9 are forward-only,
 * and that no execution surface was introduced.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ARTIFACT_CLOCK_AGENTS, ARTIFACT_CLOCK_TTL_SENTINEL_MINUTES, EVIDENCE_TTL_POLICY_V1,
  EVIDENCE_TTL_POLICY_V2, evidenceTtlMinutes, evidenceTtlMinutesV2, isArtifactClockAgent,
  resolveEvidenceTtlMinutes,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  OPPORTUNITY_RISK_SPEC_V4, opportunityRiskSpecHashV4,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec-v4.ts";
import {
  ORCHESTRATION_RUN_PLAN_V9, ORCHESTRATION_RUN_SPEC_V9, deriveRunIdsV9,
  OPPORTUNITY_RISK_SPEC_VERSION_V9, RON_ORCHESTRATION_RUN_VERSION_V9, TTL_POLICY_VERSION_V9,
} from "../../supabase/functions/_shared/ron-orchestration-run-v9.ts";
import {
  ORCHESTRATION_RUN_PLAN_V8, RON_ORCHESTRATION_RUN_VERSION_V8,
} from "../../supabase/functions/_shared/ron-orchestration-run-v8.ts";

const schedulerSrc = readFileSync("supabase/functions/ron-schedule-orchestration/index.ts", "utf8");
const runSrc = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");
const v9Src = readFileSync("supabase/functions/_shared/ron-orchestration-run-v9.ts", "utf8");

describe("TTL policy v2 — artifact clock exemption", () => {
  it("names calibration as the only artifact-clock agent", () => {
    expect([...ARTIFACT_CLOCK_AGENTS]).toEqual(["calibration_model_validation"]);
    expect(isArtifactClockAgent("calibration_model_validation")).toBe(true);
    expect(isArtifactClockAgent("session_market_structure")).toBe(false);
  });

  it("changes no market-clock budget for any other agent", () => {
    for (const id of ["session_market_structure", "pattern_context", "cross_asset_correlation",
      "macro_news_geopolitics", "opportunity_risk", "falconer_signal_source"] as const) {
      expect(evidenceTtlMinutesV2(id, "15m")).toBe(evidenceTtlMinutes(id, "15m"));
    }
    expect(EVIDENCE_TTL_POLICY_V2.base_minutes_by_timeframe)
      .toBe(EVIDENCE_TTL_POLICY_V1.base_minutes_by_timeframe);
  });

  it("exempts the artifact clock with a finite, JSON-safe sentinel", () => {
    const ttl = evidenceTtlMinutesV2("calibration_model_validation", "15m");
    expect(ttl).toBe(ARTIFACT_CLOCK_TTL_SENTINEL_MINUTES);
    expect(Number.isFinite(ttl)).toBe(true);
    expect(JSON.parse(JSON.stringify({ ttl })).ttl).toBe(ttl);
    expect(ttl).toBeGreaterThan(evidenceTtlMinutes("calibration_model_validation", "15m"));
  });

  it("keeps policy v1 as the default resolution", () => {
    expect(resolveEvidenceTtlMinutes(1, "calibration_model_validation", "15m")).toBe(480);
    expect(resolveEvidenceTtlMinutes(99, "calibration_model_validation", "15m")).toBe(480);
    expect(resolveEvidenceTtlMinutes(2, "calibration_model_validation", "15m"))
      .toBe(ARTIFACT_CLOCK_TTL_SENTINEL_MINUTES);
  });
});

describe("Opportunity / Risk spec V4 — forward only", () => {
  it("is version 4 over the frozen V1 base and V3 compatibility lineage", () => {
    expect(OPPORTUNITY_RISK_SPEC_V4.spec_version).toBe(4);
    expect(OPPORTUNITY_RISK_SPEC_V4.supersedes_spec_version).toBe(3);
    expect(OPPORTUNITY_RISK_SPEC_V4.readiness_logic).toBe("inherited_unchanged_from_v1");
    expect(OPPORTUNITY_RISK_SPEC_V4.ttl_contract.market_clock_budgets_changed).toBe(false);
    expect(OPPORTUNITY_RISK_SPEC_V4.ttl_contract.health_and_status_gates_unchanged).toBe(true);
    expect(OPPORTUNITY_RISK_SPEC_V4.ttl_contract.ttl_policy_version).toBe(2);
  });

  it("has a stable spec hash", async () => {
    expect(await opportunityRiskSpecHashV4()).toBe(await opportunityRiskSpecHashV4());
  });
});

describe("Orchestration Run V9 — forward only", () => {
  it("supersedes V8 and repins only opportunity_risk", () => {
    expect(RON_ORCHESTRATION_RUN_VERSION_V9).toBe(9);
    expect(ORCHESTRATION_RUN_SPEC_V9.supersedes_run_version).toBe(RON_ORCHESTRATION_RUN_VERSION_V8);
    expect(OPPORTUNITY_RISK_SPEC_VERSION_V9).toBe(4);
    expect(TTL_POLICY_VERSION_V9).toBe(2);
    expect(ORCHESTRATION_RUN_PLAN_V9.map((p) => p.agent_id))
      .toEqual(ORCHESTRATION_RUN_PLAN_V8.map((p) => p.agent_id));
    for (const [i, p] of ORCHESTRATION_RUN_PLAN_V9.entries()) {
      const v8 = ORCHESTRATION_RUN_PLAN_V8[i];
      if (p.agent_id === "opportunity_risk") expect(p.spec_version_pin).toBe(4);
      else expect(p.spec_version_pin).toBe(v8.spec_version_pin);
    }
  });

  it("derives its own run-id domain, distinct from V8", async () => {
    const ids = await deriveRunIdsV9("t", "2026-08-25T05:45:00.000Z");
    expect(Object.keys(ids)).toHaveLength(7);
    for (const v of Object.values(ids)) expect(v.startsWith("ron_orch_run_v9_")).toBe(true);
  });

  it("declares no execution surface and no probability", () => {
    expect(ORCHESTRATION_RUN_SPEC_V9.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V9.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V9.numeric_probability).toBeNull();
    for (const b of ["metaapi", "place_order", "createOrder", "broker"]) {
      expect(v9Src.toLowerCase().includes(b)).toBe(b === "broker");
    }
  });
});

describe("runtime wiring", () => {
  it("the coordinator accepts run version 9 and keeps 1-8 reachable", () => {
    expect(runSrc).toContain("requestedRunVersion === 9");
    expect(runSrc).toContain("[1, 2, 3, 4, 5, 6, 7].includes(requestedRunVersion)");
    expect(runSrc).toContain("assertOpportunityRiskV4Sealed");
    expect(runSrc).toContain("ttl_policy_version: TTL_POLICY_VERSION_V9");
  });

  it("the unattended scheduler now pins V9", () => {
    expect(schedulerSrc).toContain("const ORCHESTRATION_RUN_VERSION = 9");
    expect(schedulerSrc).toContain("execution_allowed: false");
    expect(schedulerSrc).toContain("numeric_probability: null");
  });
});
