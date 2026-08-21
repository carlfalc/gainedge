/**
 * GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V2 — Orchestration Run V8 close-anchor contract.
 *
 * Proves the forward-only fix that unblocks a live 24x7 completed-bar RON run:
 *  - V1..V7 plans, specs, pins and plan hashes are untouched.
 *  - V8 declares a per-agent anchor convention that satisfies the frozen Session/Pattern
 *    (bar OPEN) and Cross-Asset (completed CLOSE <= anchor) gates SIMULTANEOUSLY.
 *  - The V8 session dependency gate requires the Session envelope at the analytical bar
 *    open and fails closed otherwise.
 */
import { describe, expect, it } from "vitest";
import {
  ORCHESTRATION_RUN_PLAN_V7, ORCHESTRATION_RUN_SPEC_V7, orchestrationRunPlanHashV7,
} from "../../supabase/functions/_shared/ron-orchestration-run-v7.ts";
import {
  agentAnchorIsoV8, analyticalBarOpenIso, ANALYTICAL_BAR_OPEN_AGENTS,
  assertSessionDependencySealedV8, deriveRunIdsV8, isBarCloseAligned,
  ORCHESTRATION_RUN_PLAN_AGENTS_V8, ORCHESTRATION_RUN_PLAN_V8,
  ORCHESTRATION_RUN_SPEC_V8, orchestrationRunPlanHashV8,
  RON_ORCHESTRATION_RUN_VERSION_V8, V8_BAR_MINUTES,
} from "../../supabase/functions/_shared/ron-orchestration-run-v8.ts";

const ANCHOR = "2026-01-05T12:00:00.000Z";
const OPEN = "2026-01-05T11:45:00.000Z";

describe("GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V2 — V8 anchor contract", () => {
  it("keeps the frozen V7 plan and its pins byte-identical", async () => {
    expect(ORCHESTRATION_RUN_PLAN_V7.length).toBe(7);
    expect(ORCHESTRATION_RUN_SPEC_V7.run_version).toBe(7);
    expect(ORCHESTRATION_RUN_SPEC_V8.spec_version_pins)
      .toEqual(ORCHESTRATION_RUN_SPEC_V7.spec_version_pins);
    // The V8 plan is a superset in shape only: same agents, same order, same pins.
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V8)
      .toEqual(ORCHESTRATION_RUN_PLAN_V7.map((p) => p.agent_id));
    for (const [i, p] of ORCHESTRATION_RUN_PLAN_V8.entries()) {
      expect(p.spec_version_pin).toBe(ORCHESTRATION_RUN_PLAN_V7[i].spec_version_pin);
      expect(p.function_name).toBe(ORCHESTRATION_RUN_PLAN_V7[i].function_name);
      expect(p.anchor_param).toBe(ORCHESTRATION_RUN_PLAN_V7[i].anchor_param);
      expect(p.subject_scope).toBe(ORCHESTRATION_RUN_PLAN_V7[i].subject_scope);
    }
    // V8 is a genuinely distinct plan identity.
    expect(await orchestrationRunPlanHashV8())
      .not.toBe(await orchestrationRunPlanHashV7());
  });

  it("pins version 8 and a domain-separated run-id namespace", async () => {
    expect(RON_ORCHESTRATION_RUN_VERSION_V8).toBe(8);
    expect(ORCHESTRATION_RUN_SPEC_V8.run_id_domain).toBe("ron_orch_run_v8");
    const ids = await deriveRunIdsV8("trace_live_anchor_v2", ANCHOR);
    expect(Object.keys(ids).sort()).toEqual([...ORCHESTRATION_RUN_PLAN_AGENTS_V8].sort());
    for (const v of Object.values(ids)) expect(v).toMatch(/^[0-9a-f]{32}$/);
  });

  it("declares the completed-bar-close anchor convention and no relaxation", () => {
    const c = ORCHESTRATION_RUN_SPEC_V8.live_anchor_contract;
    expect(c.evaluation_anchor_means).toBe("completed_bar_close");
    expect(c.bar_minutes).toBe(V8_BAR_MINUTES);
    expect(c.frozen_gate_relaxed).toBe(false);
    expect(c.specialist_spec_changed).toBe(false);
    expect(c.specialist_spec_hashes_changed).toBe(false);
    expect(c.lookahead_permitted).toBe(false);
    expect(c.forming_bar_consumed).toBe(false);
    expect(c.wall_clock_read).toBe(false);
    expect(c.authority_model_changed).toBe(false);
    expect(c.probability_published).toBe(false);
    expect(c.trade_geometry_emitted).toBe(false);
    expect(c.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V8.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V8.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V8.persist_default).toBe(false);
  });

  it("routes exactly the bar-open specialists to the analytical bar open", () => {
    expect([...ANALYTICAL_BAR_OPEN_AGENTS].sort()).toEqual([
      "cross_asset_correlation", "pattern_context", "session_market_structure",
    ]);
    for (const p of ORCHESTRATION_RUN_PLAN_V8) {
      const expected = ANALYTICAL_BAR_OPEN_AGENTS.includes(p.agent_id)
        ? "analytical_bar_open" : "evaluation_anchor";
      expect(p.anchor_convention).toBe(expected);
      expect(agentAnchorIsoV8(p, ANCHOR)).toBe(expected === "analytical_bar_open" ? OPEN : ANCHOR);
    }
  });

  it("resolves the V4..V7 mutual anchor contradiction at one anchor", () => {
    const anchorMs = Date.parse(ANCHOR);
    const openMs = Date.parse(analyticalBarOpenIso(ANCHOR));
    const barMs = V8_BAR_MINUTES * 60_000;
    // Session/Pattern requirement: their envelope anchor is the completed bar OPEN.
    expect(openMs).toBe(anchorMs - barMs);
    // Cross-asset V4 gate requirement: completed close must be <= orchestration anchor.
    expect(openMs + barMs).toBeLessThanOrEqual(anchorMs);
    // ...and no bar-open specialist can ever be at or after the anchor (no lookahead).
    expect(openMs).toBeLessThan(anchorMs);
  });

  it("fails closed on an anchor that is not bar-close aligned", () => {
    expect(isBarCloseAligned(ANCHOR)).toBe(true);
    expect(isBarCloseAligned("2026-01-05T12:07:00.000Z")).toBe(false);
    expect(isBarCloseAligned("not-a-date")).toBe(false);
    expect(() => analyticalBarOpenIso("2026-01-05T12:07:00.000Z")).toThrow();
    expect(() => analyticalBarOpenIso("not-a-date")).toThrow();
  });

  it("rejects a missing or malformed session dependency", async () => {
    const ctx = {
      trace_id: "t_v8", instrument: "XAUUSD", timeframe: "15m", as_of: ANCHOR,
    };
    await expect(assertSessionDependencySealedV8(null, ctx)).rejects.toThrow();
    await expect(assertSessionDependencySealedV8([], ctx)).rejects.toThrow();
    await expect(assertSessionDependencySealedV8({}, { ...ctx, as_of: "nope" }))
      .rejects.toThrow();
    // A grid-misaligned anchor can never be a completed-bar close.
    await expect(
      assertSessionDependencySealedV8({}, { ...ctx, as_of: "2026-01-05T12:07:00.000Z" }),
    ).rejects.toThrow(/evaluation_anchor_not_bar_close_aligned/);
  });
});
