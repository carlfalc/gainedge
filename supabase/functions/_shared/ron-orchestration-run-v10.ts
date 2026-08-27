/**
 * RON orchestration run — Coordination Plan V10 (implementation marker
 * `GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V9 plan. V1-V9 are imported,
 * never mutated: their plan arrays, spec objects, hashes, run-id derivations and
 * acceptance gates are untouched and stay explicitly replayable.
 *
 * THE ONLY SEMANTIC DELTA from V9:
 *   multi_market_scope_version -> 1
 *
 * That single delta means each specialist call carries the explicit, audited forward
 * instrument binding, so a NON-XAUUSD pilot instrument is ADMITTED by the frozen
 * producers instead of being rejected as out of scope. Every gate, pin, anchor rule,
 * seal proof, authority hierarchy and persistence path is inherited from V9 verbatim.
 *
 * What this does NOT do:
 *   • It does not supply data. A specialist with no genuine source data for the requested
 *     instrument still fails closed or reports a truthful settled state — XAUUSD data is
 *     never substituted for another market.
 *   • It does not create calibration authority. Instruments with no accepted calibration
 *     artifact remain uncalibrated and can never carry a base rate.
 *   • No probability, no trade geometry, no execution, no promotion.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import { hashCanonical, type RonAgentId } from "./ron-agent-contracts.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import {
  ORCHESTRATION_RUN_PLAN_V9, ORCHESTRATION_RUN_SPEC_V9, RON_ORCHESTRATION_RUN_VERSION_V9,
} from "./ron-orchestration-run-v9.ts";
import {
  RON_MULTI_MARKET_SCOPE_VERSION, multiMarketScopePayload,
} from "./ron-multi-market-scope-v1.ts";
import { FORWARD_CONTEXT_INSTRUMENTS } from "./ron-forward-instrument-binding-v1.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V10 = 10;

/** Identical seven-agent plan and canonical order. No pin differs from V9. */
export const ORCHESTRATION_RUN_PLAN_V10: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V9.map((p) => ({ ...p }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V10: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V10.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V10 = {
  ...ORCHESTRATION_RUN_SPEC_V9,
  run_version: RON_ORCHESTRATION_RUN_VERSION_V10,
  supersedes_run_version: RON_ORCHESTRATION_RUN_VERSION_V9,
  purpose:
    "unattended seven-agent collection identical to Orchestration Run V9 except that every "
    + "specialist call carries the audited forward instrument binding, so the declared pilot "
    + "instruments are admitted by the frozen producers; no data is substituted, no gate is "
    + "relaxed and no calibration authority is created",
  run_id_domain: "ron_orch_run_v10",

  multi_market_contract: {
    multi_market_scope_version: RON_MULTI_MARKET_SCOPE_VERSION,
    admitted_instruments: [...FORWARD_CONTEXT_INSTRUMENTS].sort(),
    data_substitution_permitted: false,
    frozen_spec_objects_mutated: false,
    gates_relaxed: false,
    calibration_authority_created: false,
    scope_payload: multiMarketScopePayload(),
  },
} as const;

export const orchestrationRunPlanHashV10 = (): Promise<string> =>
  hashCanonical({ spec: ORCHESTRATION_RUN_SPEC_V10, plan: ORCHESTRATION_RUN_PLAN_V10 });

/* ------------------------------------------------------------- run ids */

export async function deriveRunIdV10(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const h = await hashCanonical({
    domain: ORCHESTRATION_RUN_SPEC_V10.run_id_domain, trace_id, anchor_iso, agent_id,
  });
  return `${ORCHESTRATION_RUN_SPEC_V10.run_id_domain}_${h.slice(0, 32)}`;
}

export async function deriveRunIdsV10(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V10) {
    out[p.agent_id] = await deriveRunIdV10(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}
