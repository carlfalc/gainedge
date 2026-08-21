/**
 * RON orchestration run — Coordination Plan V8 (implementation marker
 * `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V2`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V7 plan. V1-V7 are imported and
 * never mutated: their plan arrays, spec objects, hashes, gates and run-id derivations are
 * byte-identical and stay explicitly replayable.
 *
 * ------------------------------------------------------------------ the ONE delta
 * V4-V7 carry a MUTUALLY CONTRADICTORY anchor convention that makes a live completed-bar
 * run impossible:
 *
 *   - `session_market_structure` V2 and `pattern_context` V2 anchor their envelope on the
 *     BAR OPEN of the completed analytical bar, and the pre-Pattern dependency gate
 *     demands `session.as_of === orchestration_anchor` EXACTLY.
 *   - the V4 cross-asset gate demands `as_of_bar_completed_close <= orchestration_anchor`,
 *     i.e. the anchor must be at or after the analytical bar's CLOSE.
 *
 * Both can only hold at once if the completed bar has zero length. That is why a live
 * scheduler run fails closed at either the session dependency gate (bar-close anchor) or
 * the cross-asset lookahead gate (bar-open anchor).
 *
 * V8 resolves it WITHOUT inventing a new specialist truth and WITHOUT a new specialist
 * spec: the orchestration `evaluation_anchor` becomes the COMPLETED BAR CLOSE (a real,
 * unambiguous instant), and the plan declares, per agent, which anchor instant that agent
 * is called with:
 *
 *   - `analytical_bar_open` agents (session, pattern, cross-asset) are called at
 *     `evaluation_anchor - one bar` — the OPEN of the completed analytical bar, exactly the
 *     convention their frozen specs already require.
 *   - `evaluation_anchor` agents (calibration, macro, falconer, opportunity) are called at
 *     the anchor itself, exactly as V7 does today.
 *
 * Every frozen acceptance gate is then satisfiable simultaneously and NONE is relaxed:
 * session/pattern/cross evidence is strictly BEFORE the anchor (never lookahead), the
 * cross-asset completed close lands exactly ON the anchor, macro stays anchor-bound and
 * opportunity still requires `as_of === evaluation_anchor`.
 *
 * No specialist spec, spec hash, producer or endpoint semantic changes in V8. No new
 * probability, direction, confidence, geometry, execution path or promotion is introduced.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import { hashCanonical, type EvidenceEnvelopeV1, type RonAgentId } from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import { acceptSessionStructureContext } from "./ron-pattern-structure-context-v2.ts";
import { evidenceHash, validateEvidence } from "./ron-agent-contracts.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import {
  PATTERN_SESSION_DEPENDENCY_AGENT, type AgentCallPlanEntryV2,
} from "./ron-orchestration-run-v2.ts";
import {
  ORCHESTRATION_RUN_PLAN_V7, ORCHESTRATION_RUN_SPEC_V7,
} from "./ron-orchestration-run-v7.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V8 = 8;

/** Bar length is DERIVED from the frozen Session V2 contract, never redeclared. */
export const V8_BAR_MINUTES = SESSION_STRUCTURE_SPEC_V2.bar_minutes;
const BAR_MS = V8_BAR_MINUTES * 60_000;

export type AnchorConvention = "evaluation_anchor" | "analytical_bar_open";

/**
 * The agents whose FROZEN specs anchor their envelope on the completed analytical bar's
 * OPEN. They are called one bar before the evaluation anchor. Nothing else changes.
 */
export const ANALYTICAL_BAR_OPEN_AGENTS: readonly RonAgentId[] = [
  "session_market_structure", "pattern_context", "cross_asset_correlation",
] as const;

export interface AgentCallPlanEntryV8 extends AgentCallPlanEntryV2 {
  anchor_convention: AnchorConvention;
}

export const ORCHESTRATION_RUN_PLAN_V8: readonly AgentCallPlanEntryV8[] =
  ORCHESTRATION_RUN_PLAN_V7.map((p) => ({
    ...p,
    anchor_convention: ANALYTICAL_BAR_OPEN_AGENTS.includes(p.agent_id)
      ? "analytical_bar_open"
      : "evaluation_anchor",
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V8: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V8.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V8 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V8,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V7.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V7 except "
    + "that the evaluation anchor is the COMPLETED BAR CLOSE and the plan declares, per "
    + "agent, whether that agent is called at the anchor or at the analytical bar open "
    + "one bar earlier; this removes the V4-V7 mutual anchor contradiction without "
    + "relaxing any frozen gate, changing any specialist spec or adding any authority",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v8",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V7.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  calibration_context: ORCHESTRATION_RUN_SPEC_V7.calibration_context,
  cross_asset_context: ORCHESTRATION_RUN_SPEC_V7.cross_asset_context,
  macro_context: ORCHESTRATION_RUN_SPEC_V7.macro_context,
  opportunity_risk_context: ORCHESTRATION_RUN_SPEC_V7.opportunity_risk_context,
  falconer_signal_source_context: ORCHESTRATION_RUN_SPEC_V7.falconer_signal_source_context,
  /** New in V8, and the ONLY semantic delta from V7. */
  live_anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    evaluation_anchor_must_be_bar_grid_aligned: true,
    bar_minutes: V8_BAR_MINUTES,
    analytical_bar_open_equals: "evaluation_anchor_minus_one_bar_exactly",
    analytical_bar_open_agents: ANALYTICAL_BAR_OPEN_AGENTS,
    evaluation_anchor_agents: ORCHESTRATION_RUN_PLAN_V8
      .filter((p) => p.anchor_convention === "evaluation_anchor").map((p) => p.agent_id),
    session_dependency_anchor: "analytical_bar_open",
    forming_bar_consumed: false,
    wall_clock_read: false,
    specialist_spec_changed: false,
    specialist_spec_hashes_changed: false,
    frozen_gate_relaxed: false,
    frozen_gate_added: false,
    lookahead_permitted: false,
    authority_model_changed: false,
    probability_published: false,
    trade_geometry_emitted: false,
    promotion_conferred: false,
    execution_allowed: false,
    rejections: [
      "evaluation_anchor_not_bar_close_aligned",
      "session_dependency_anchor_mismatch",
    ],
  },
  spec_version_pins: ORCHESTRATION_RUN_SPEC_V7.spec_version_pins,
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V8
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V8,
} as const;

export const orchestrationRunPlanHashV8 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V8 as unknown as Record<string, unknown>);

/* ----------------------------------------------------------- anchor helpers */

/** True only for an instant lying exactly on the completed-bar grid. */
export function isBarCloseAligned(anchor_iso: string): boolean {
  const ms = Date.parse(anchor_iso);
  return Number.isFinite(ms) && ms % BAR_MS === 0;
}

/**
 * The OPEN of the completed analytical bar for a V8 evaluation anchor. Fails closed on a
 * non-finite or non-grid-aligned anchor: no instant is ever rounded, floored or invented.
 */
export function analyticalBarOpenIso(anchor_iso: string): string {
  const ms = Date.parse(anchor_iso);
  if (!Number.isFinite(ms) || ms % BAR_MS !== 0) {
    throw new OrchestrationRunError(["evaluation_anchor_not_bar_close_aligned"]);
  }
  return new Date(ms - BAR_MS).toISOString();
}

/** The instant a given planned agent is actually called at, under the V8 convention. */
export function agentAnchorIsoV8(entry: AgentCallPlanEntryV8, anchor_iso: string): string {
  return entry.anchor_convention === "analytical_bar_open"
    ? analyticalBarOpenIso(anchor_iso)
    : anchor_iso;
}

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V8 run identity, domain-separated from the v1..v7 run-id domains. */
export async function deriveRunIdV8(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V8.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV8(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V8) {
    out[p.agent_id] = await deriveRunIdV8(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------------ V8 sealed session dependency gate */

/**
 * V8 pre-Pattern gate. IDENTICAL to the frozen V2 gate in every respect except the anchor
 * the Session envelope is required to carry: under the V8 convention Session is called at
 * the analytical bar open, so its envelope `as_of` must equal `evaluation_anchor - one bar`
 * exactly. The FROZEN Pattern V2 acceptance contract is reused verbatim — no second
 * acceptance truth is invented, and no rejection reason is weakened.
 *
 * Returns the verified sealed evidence hash.
 */
export async function assertSessionDependencySealedV8(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["session_dependency_absent_or_malformed"]);
  }
  const anchorMs = Date.parse(ctx.as_of);
  if (!Number.isFinite(anchorMs)) {
    throw new OrchestrationRunError(["session_dependency_anchor_unparseable"]);
  }
  if (anchorMs % BAR_MS !== 0) {
    throw new OrchestrationRunError(["evaluation_anchor_not_bar_close_aligned"]);
  }
  const accepted = await acceptSessionStructureContext(candidate, {
    trace_id: ctx.trace_id, instrument: ctx.instrument,
    timeframe: ctx.timeframe, as_of: anchorMs - BAR_MS,
  });
  if (accepted.ok === false) {
    throw new OrchestrationRunError([
      accepted.reason.replace(/^session_context_/, "session_dependency_"),
    ]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  if (e.agent_id !== PATTERN_SESSION_DEPENDENCY_AGENT) {
    throw new OrchestrationRunError(["session_dependency_wrong_agent"]);
  }
  if (validateEvidence(e).length) {
    throw new OrchestrationRunError(["session_dependency_invalid_envelope"]);
  }
  if (await evidenceHash(e) !== accepted.evidence_hash) {
    throw new OrchestrationRunError(["session_dependency_hash_mismatch"]);
  }
  return accepted.evidence_hash;
}
