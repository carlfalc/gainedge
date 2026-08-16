/**
 * RON orchestration run — Coordination Plan V7 (implementation marker
 * `RON_ORCHESTRATION_FALCONER_SIGNAL_SOURCE_PIN_V7`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V6 plan. V1-V6 are imported,
 * never mutated: their plan arrays, spec objects, hashes and run-id derivations are
 * untouched and stay explicitly replayable.
 *
 * The ONLY semantic difference in V7 is that `falconer_signal_source` is invoked with an
 * EXPLICIT `spec_version: 1` pin — now that the Falconer endpoint exposes a replay-safe
 * V1-only selector — instead of relying on the endpoint's mutable default. There is NO
 * Falconer V2, NO strategy re-evaluation and NO change to Falconer semantics.
 *
 * Falconer remains STRATEGY CONTEXT ONLY: non-authoritative, `signal_only`, live execution
 * false. Pinning its spec version confers no authority, no directional weighting and no
 * promotion. The canonical strategy identities (the TypeScript port SHA and the canonical
 * Pine SHA) are deliberately NOT admitted into Evidence V1 — V1 neither imports nor
 * evaluates the strategy, so citing them would be unfounded provenance and is rejected.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import { hashCanonical } from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import {
  ORCHESTRATION_RUN_PLAN_V6, ORCHESTRATION_RUN_SPEC_V6,
  assertSpecialistReturnedSealedV6,
} from "./ron-orchestration-run-v6.ts";
import { FALCONER_SIGNAL_SOURCE_SPEC_V1 } from "./ron-falconer-signal-source-spec.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V7 = 7;

/** The one agent whose specialist spec version V7 additionally pins. */
export const FALCONER_SIGNAL_SOURCE_AGENT: RonAgentId = "falconer_signal_source";

/** Exactly one spec_version value may ever be sent for Falconer in a V7 run. */
export const FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7 = 1;

/** FULL accepted Falconer Signal Source Spec V1 hash (frozen after the K1 audit). */
export const FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED =
  "40a4b6f9d465ae0362e1a0ada43e3b699c2674efa30c5dbe9e5a934dcd1005f3";

/**
 * Canonical Falconer STRATEGY identities. They are reconciled elsewhere and are FORBIDDEN
 * inside Falconer Evidence V1: the signal-source specialist never imports, re-implements
 * or evaluates the strategy, so an evidence envelope citing them would be claiming
 * provenance it does not have.
 */
export const FALCONER_STRATEGY_TS_PORT_SHA_FORBIDDEN =
  "13736f1ed5dabd3f31a15b8db4179ed4e027950ed515034433ae6134a15581fc";
export const FALCONER_STRATEGY_PINE_SHA_FORBIDDEN =
  "76b242b4b4b2e1f2aa5bbb11a0a12ef9849ec40beda306fc5c5dd6899a8b9251";

const F_SPEC_ID = FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_id;
const F_SPEC_PREFIX = `spec:${F_SPEC_ID}:`;

export const falconerSignalSourceSpecRefV1 = (): string =>
  `${F_SPEC_PREFIX}v${FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version}:${FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED}`;

/**
 * The frozen Falconer contract emits `direction` in {neutral, unknown} and
 * `recommendation` in {context_only, no_action} only. These sets are the accepted
 * contract, not a new rule invented here.
 */
export const FALCONER_ALLOWED_DIRECTIONS = ["neutral", "unknown"] as const;
export const FALCONER_ALLOWED_RECOMMENDATIONS = ["context_only", "no_action"] as const;

/**
 * Observation-key tokens that would indicate the strategy-context reporter had silently
 * become a probability/geometry/execution surface. Checked against observation KEYS and
 * top-level envelope keys only — never against declared prose limitations, which
 * legitimately mention the words.
 */
export const FALCONER_FORBIDDEN_KEY_TOKENS = [
  "probability", "confidence", "likelihood", "score", "rating", "edge",
  "expected_value", "expectancy", "forecast", "win_rate", "profit_factor",
  "entry_price", "stop_loss", "take_profit", "invalidation", "target",
  "risk_reward", "rr_", "lot", "position_size", "qty", "execution_path",
  "broker", "order_", "payload",
] as const;

/** Exact Evidence V1 top-level surface. Anything else is contract expansion. */
const ALLOWED_ENVELOPE_KEYS = new Set([
  "schema_version", "agent_id", "agent_version", "run_id", "trace_id", "instrument",
  "timeframe", "as_of", "source_timestamps", "observations", "provenance_refs",
  "data_health", "uncertainty", "conflicts", "dependencies", "status", "direction",
  "recommendation", "evidence_hash",
]);

/** V7 pins every V6 agent identically AND adds the Falconer V1 pin. */
const PIN_V7: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V6.spec_version_pins,
  falconer_signal_source: FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V6. Only `spec_version_pin` for falconer_signal_source differs.
 */
export const ORCHESTRATION_RUN_PLAN_V7: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V6.map((p) => ({
    ...p,
    spec_version_pin: PIN_V7[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V7: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V7.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V7 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V7,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V6.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V6 except "
    + "that falconer_signal_source is pinned to spec_version 1 through its replay-safe "
    + "endpoint selector instead of the endpoint default; Falconer stays strategy context "
    + "only, non-authoritative, signal_only and confers no direction or promotion",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v7",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V6.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  calibration_context: ORCHESTRATION_RUN_SPEC_V6.calibration_context,
  cross_asset_context: ORCHESTRATION_RUN_SPEC_V6.cross_asset_context,
  macro_context: ORCHESTRATION_RUN_SPEC_V6.macro_context,
  opportunity_risk_context: ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context,
  /** New in V7, and the ONLY semantic delta from V6. */
  falconer_signal_source_context: {
    agent_id: FALCONER_SIGNAL_SOURCE_AGENT,
    requested_spec_version: FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7,
    requested_exactly_once: true,
    spec_id: F_SPEC_ID,
    accepted_spec_hash: FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED,
    falconer_v2_created: false,
    strategy_reevaluated: false,
    strategy_hashes_admitted_to_evidence: false,
    falconer_authority: FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority,
    non_authoritative: true,
    authority_model_changed: false,
    directional_weighting_conferred: false,
    evidence_batch_semantics_unchanged: true,
    specialists_rerun: false,
    database_queried_by_orchestration: false,
    probability_published: false,
    trade_geometry_emitted: false,
    promotion_conferred: false,
    execution_allowed: false,
    temporal_contract: {
      as_of_after_evaluation_anchor_rejected: true,
      as_of_equals_anchor_required: false,
      inherited_from_generic_v6_gate: true,
    },
    allowed_directions: FALCONER_ALLOWED_DIRECTIONS,
    allowed_recommendations: FALCONER_ALLOWED_RECOMMENDATIONS,
  },
  spec_version_pins: {
    ...ORCHESTRATION_RUN_SPEC_V6.spec_version_pins,
    falconer_signal_source: FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V7
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V7,
} as const;

export const orchestrationRunPlanHashV7 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V7 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V7 run identity, domain-separated from the v1..v6 run-id domains. */
export async function deriveRunIdV7(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V7.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV7(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V7) {
    out[p.agent_id] = await deriveRunIdV7(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------- falconer signal source V1 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY the sealed Falconer Signal Source Evidence V1
 * envelope for this run, as returned by the specialist.
 *
 * Seal / self-hash / agent / trace / instrument / timeframe and the `as_of <= anchor`
 * temporal rule are proved by the INHERITED V6 generic gate — no stricter temporal
 * semantics are invented here, because the Falconer contract legitimately anchors its
 * envelope on the newest admissible SOURCE instant, not on the orchestration anchor.
 *
 * V7 additionally rejects: a wrong agent_version, a missing/wrong/duplicated/extra
 * Falconer spec-lineage ref, any appearance of either canonical strategy SHA anywhere in
 * the envelope, a direction or recommendation outside the frozen Falconer contract, and
 * any probability / score / geometry / execution key on the envelope or its observations.
 *
 * Returns the ORIGINAL specialist-provided evidence hash.
 */
export async function assertFalconerSignalSourceV1Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  // Inherited V6 generic integrity gate, unchanged and applied first.
  const hash = await assertSpecialistReturnedSealedV6(
    candidate, ctx, FALCONER_SIGNAL_SOURCE_AGENT);

  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];

  if (e.agent_version !== FALCONER_SIGNAL_SOURCE_SPEC_V1.agent_version) {
    reasons.push("falconer_signal_source_wrong_agent_version");
  }

  // SPEC LINEAGE: exactly one accepted V1 `spec:` ref and nothing else in that namespace.
  const refs = (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");
  const specRefs = refs.filter((p) => p.startsWith(F_SPEC_PREFIX));
  const okRefs = specRefs.filter((p) => p === falconerSignalSourceSpecRefV1());
  if (specRefs.length !== 1) {
    reasons.push(`falconer_signal_source_spec_ref_count:${specRefs.length}`);
  }
  if (okRefs.length !== 1) {
    reasons.push(specRefs.length === 0
      ? "falconer_signal_source_spec_v1_ref_missing"
      : `falconer_signal_source_spec_v1_ref_invalid:${okRefs.length}`);
  }

  // UNFOUNDED STRATEGY PROVENANCE: neither canonical strategy identity may appear.
  const serialized = JSON.stringify(e ?? {});
  if (serialized.includes(FALCONER_STRATEGY_TS_PORT_SHA_FORBIDDEN)) {
    reasons.push("falconer_signal_source_strategy_ts_sha_present");
  }
  if (serialized.includes(FALCONER_STRATEGY_PINE_SHA_FORBIDDEN)) {
    reasons.push("falconer_signal_source_strategy_pine_sha_present");
  }

  // Contextual-only semantics exactly as the frozen Falconer contract emits them.
  if (!(FALCONER_ALLOWED_DIRECTIONS as readonly string[]).includes(String(e.direction))) {
    reasons.push("falconer_signal_source_direction_not_contextual");
  }
  if (!(FALCONER_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("falconer_signal_source_recommendation_not_contextual");
  }

  // NO construction surface on the envelope or any observation key.
  for (const k of Object.keys(e as unknown as Record<string, unknown>)) {
    if (!ALLOWED_ENVELOPE_KEYS.has(k)) {
      reasons.push(`falconer_signal_source_unexpected_field:${k}`);
    }
  }
  const observations = Array.isArray(e.observations) ? e.observations : [];
  for (const o of observations) {
    const key = String(o?.key ?? "").toLowerCase();
    for (const tok of FALCONER_FORBIDDEN_KEY_TOKENS) {
      if (key.includes(tok)) {
        reasons.push(`falconer_signal_source_forbidden_observation:${key}`);
      }
    }
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());
  return hash;
}

/**
 * Prove the accepted Falconer envelope is the single one present in the final collected
 * seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertFalconerSignalSourceBinding(
  batch: EvidenceEnvelopeV1[], accepted_hash: string,
): void {
  const fs = batch.filter((e) => e?.agent_id === FALCONER_SIGNAL_SOURCE_AGENT);
  if (fs.length !== 1) {
    throw new OrchestrationRunError([`falconer_signal_source_binding_count:${fs.length}`]);
  }
  if (fs[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError(["falconer_signal_source_binding_hash_mismatch"]);
  }
}
