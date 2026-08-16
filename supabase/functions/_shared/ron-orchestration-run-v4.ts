/**
 * RON orchestration run — Coordination Plan V4 (implementation marker
 * `RON_ORCHESTRATION_CROSS_ASSET_CONTEXT_V4`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V3 plan. V1, V2 and V3 are
 * imported, never mutated: their plan arrays, spec objects, hashes and run-id derivations
 * are untouched and stay explicitly replayable.
 *
 * The ONLY semantic difference in V4 is that `cross_asset_correlation` is invoked with an
 * EXPLICIT `spec_version: 2` pin, so RON receives the audited descriptive Cross-Asset
 * Relationship Context V2 evidence instead of relying on the endpoint's mutable default.
 * The seven agents, canonical order, authority model, phases, subject scope, the
 * Session -> sealed evidence -> Pattern V2 handoff, the Calibration V2 temporal/provenance
 * binding and the Opportunity/Risk evidence batch are inherited verbatim from V3.
 *
 * Cross-Asset V2 remains NON-AUTHORITATIVE contextual evidence: its frozen contract emits
 * `direction` in {neutral, unknown} and `recommendation` in {context_only, no_action}
 * only — no probability, confidence, significance, magnitude label, trade geometry or
 * execution authority. The gate below enforces exactly that frozen contract; it invents no
 * new restriction and weakens none.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { CROSS_ASSET_SPEC_V1 } from "./ron-cross-asset-spec.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V2, CROSS_ASSET_SPEC_V1_HASH_PINNED,
} from "./ron-cross-asset-relationship-context-v2.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import { ORCHESTRATION_RUN_PLAN_V3, ORCHESTRATION_RUN_SPEC_V3 } from "./ron-orchestration-run-v3.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V4 = 4;

/** The one agent whose specialist spec version V4 additionally pins. */
export const CROSS_ASSET_CONTEXT_AGENT: RonAgentId = "cross_asset_correlation";

/** Exactly one spec_version value may ever be sent for cross-asset in a V4 run. */
export const CROSS_ASSET_CONTEXT_SPEC_VERSION_V4 = 2;

/**
 * FULL accepted Cross-Asset Relationship Context Spec V2 hash (inherited, never
 * re-derived here). Any other value in returned provenance is rejected.
 */
export const CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED =
  "032ac31b53b187b135e1f9fedadbfd213102d4a475a83248c123c99e30639682";

const X_SPEC_ID = CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id;

/** `spec:<spec_id>:v...` refs are the ONLY accepted spec-identity statements. */
const X_SPEC_PREFIX = `spec:${X_SPEC_ID}:`;
const X_SPEC_V2_PREFIX = `${X_SPEC_PREFIX}v${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version}:`;

export const crossAssetContextSpecRefV2 = (): string =>
  `${X_SPEC_V2_PREFIX}${CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED}`;

/** Inherited base-spec identity ref the frozen V2 producer always emits alongside. */
const X_BASE_SPEC_PREFIX = `base_spec:${CROSS_ASSET_SPEC_V1.spec_id}:`;
const X_BASE_SPEC_V1_REF =
  `${X_BASE_SPEC_PREFIX}v${CROSS_ASSET_SPEC_V1.spec_version}:${CROSS_ASSET_SPEC_V1_HASH_PINNED}`;

/** Inherited bar length: DERIVED from the frozen V1 contract, never redeclared. */
const BAR_MS = CROSS_ASSET_SPEC_V1.bar_minutes * 60_000;

/**
 * The frozen Cross V2 envelope-direction policy is
 * `neutral_or_unknown_only_until_promoted_research_exists`, with `context_only` /
 * `no_action` recommendations. These sets are the accepted contract, not a new rule.
 */
export const CROSS_ASSET_CONTEXT_ALLOWED_DIRECTIONS = ["neutral", "unknown"] as const;
export const CROSS_ASSET_CONTEXT_ALLOWED_RECOMMENDATIONS = ["context_only", "no_action"] as const;

/** V4 pins Session V2, Pattern V2, Calibration V2 (inherited) AND Cross-Asset V2 (new). */
const PIN_V4: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V3.spec_version_pins,
  cross_asset_correlation: CROSS_ASSET_CONTEXT_SPEC_VERSION_V4,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V3. Only `spec_version_pin` for cross-asset differs.
 */
export const ORCHESTRATION_RUN_PLAN_V4: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V3.map((p) => ({
    ...p,
    spec_version_pin: PIN_V4[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V4: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V4.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V4 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V4,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V3.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V3 except "
    + "that cross_asset_correlation is pinned to spec_version 2 so RON receives the "
    + "audited descriptive XAU/NAS relationship context as non-authoritative evidence",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v4",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V3.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  calibration_context: ORCHESTRATION_RUN_SPEC_V3.calibration_context,
  /** New in V4, and the ONLY semantic delta from V3. */
  cross_asset_context: {
    agent_id: CROSS_ASSET_CONTEXT_AGENT,
    requested_spec_version: CROSS_ASSET_CONTEXT_SPEC_VERSION_V4,
    requested_exactly_once: true,
    base_spec_id: CROSS_ASSET_SPEC_V1.spec_id,
    base_spec_hash: CROSS_ASSET_SPEC_V1_HASH_PINNED,
    accepted_spec_hash: CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED,
    same_spec_lineage_as_v1: true,
    authority_added: false,
    direction_weighting_added: false,
    probability_published: false,
    promotion_conferred: false,
    allowed_directions: CROSS_ASSET_CONTEXT_ALLOWED_DIRECTIONS,
    allowed_recommendations: CROSS_ASSET_CONTEXT_ALLOWED_RECOMMENDATIONS,
    /** Frozen Cross V2 temporal contract, enforced as-is (never reinterpreted). */
    temporal_contract: {
      as_of_is_completed_bar_open: true,
      as_of_must_not_exceed_orchestration_anchor: true,
      as_of_bar_grid_minutes: CROSS_ASSET_SPEC_V1.bar_minutes,
      bound_source_timestamp_keys: ["as_of_bar_open", "as_of_bar_completed_close"],
      source_timestamps_present_only_when_v1_reached_the_admissible_path: true,
      counterpart_completion_proof:
        CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract.proof_rule,
      counterpart_completion_proof_required: true,
      anchor_bound_source_metadata: true,
    },
  },
  spec_version_pins: {
    ...ORCHESTRATION_RUN_SPEC_V3.spec_version_pins,
    cross_asset_correlation: CROSS_ASSET_CONTEXT_SPEC_VERSION_V4,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V4
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V4,
} as const;

export const orchestrationRunPlanHashV4 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V4 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V4 run identity, domain-separated from the v1/v2/v3 run-id domains. */
export async function deriveRunIdV4(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V4.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV4(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V4) {
    out[p.agent_id] = await deriveRunIdV4(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* -------------------------------------- cross-asset V2 context acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY a sealed Cross-Asset Relationship Context V2
 * envelope for this run.
 *
 * Rejects: absence, malformed input, the wrong agent, an unsealed envelope, a hash that
 * does not match its own content, scope mismatch, an anchor violation, a bar-grid
 * violation, inconsistent completed-bar source timestamps, missing cross-asset spec
 * provenance, V1 spec provenance, a wrong spec hash, duplicated or ambiguous spec
 * provenance, a missing/duplicated inherited base-spec identity, and any direction or
 * recommendation outside the frozen Cross V2 contextual contract.
 *
 * Returns the verified sealed evidence hash.
 */
export async function assertCrossAssetContextV2Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["cross_asset_context_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];

  if (e.agent_id !== CROSS_ASSET_CONTEXT_AGENT) reasons.push("cross_asset_context_wrong_agent");
  if (validateEvidence(e).length) reasons.push("cross_asset_context_invalid_envelope");
  if (!e.evidence_hash) reasons.push("cross_asset_context_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("cross_asset_context_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("cross_asset_context_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("cross_asset_context_timeframe_mismatch");

  // TEMPORAL: the frozen Cross V2 as_of is the OPEN of a completed bar at or before the
  // evaluation anchor. Nothing here relaxes or re-derives that rule.
  const anchorMs = Date.parse(ctx.as_of);
  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(anchorMs)) reasons.push("cross_asset_context_anchor_unparseable");
  if (!Number.isFinite(atMs)) reasons.push("cross_asset_context_as_of_unparseable");
  else {
    if (Number.isFinite(anchorMs) && atMs > anchorMs) {
      reasons.push("cross_asset_context_as_of_after_orchestration_anchor");
    }
    if (atMs % BAR_MS !== 0) reasons.push("cross_asset_context_as_of_not_bar_aligned");
  }

  // Completed-bar source timestamps exist only on the frozen V1 admissible path; when
  // present they must bind exactly to this envelope's own completed bar.
  const st = (e.source_timestamps ?? {}) as Record<string, unknown>;
  const openRaw = st.as_of_bar_open;
  const closeRaw = st.as_of_bar_completed_close;
  if (openRaw != null || closeRaw != null) {
    if (typeof openRaw !== "string" || Date.parse(openRaw) !== atMs) {
      reasons.push("cross_asset_context_source_timestamp_mismatch:as_of_bar_open");
    }
    if (typeof closeRaw !== "string" || Date.parse(closeRaw) !== atMs + BAR_MS) {
      reasons.push("cross_asset_context_source_timestamp_mismatch:as_of_bar_completed_close");
    }
  }
  // Anchor-bound provenance: no source metadata instant may postdate the anchor.
  for (const [k, v] of Object.entries(st)) {
    if (typeof v !== "string") continue;
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && Number.isFinite(anchorMs) && ms > anchorMs
      && k !== "as_of_bar_completed_close") {
      reasons.push(`cross_asset_context_source_timestamp_after_anchor:${k}`);
    }
  }

  const refs = (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");
  const specRefs = refs.filter((p) => p.startsWith(X_SPEC_PREFIX));
  if (specRefs.length !== 1) {
    reasons.push(`cross_asset_context_spec_provenance_count:${specRefs.length}`);
  } else if (!specRefs[0].startsWith(X_SPEC_V2_PREFIX)) {
    reasons.push("cross_asset_context_spec_version_not_2");
  } else if (specRefs[0] !== crossAssetContextSpecRefV2()) {
    reasons.push("cross_asset_context_spec_hash_mismatch");
  }

  // The frozen V2 producer always cites the inherited accepted V1 base spec exactly once.
  const baseRefs = refs.filter((p) => p.startsWith(X_BASE_SPEC_PREFIX));
  if (baseRefs.length !== 1) {
    reasons.push(`cross_asset_context_base_spec_provenance_count:${baseRefs.length}`);
  } else if (baseRefs[0] !== X_BASE_SPEC_V1_REF) {
    reasons.push("cross_asset_context_base_spec_hash_mismatch");
  }

  // Contextual-only semantics exactly as the frozen Cross V2 contract emits them.
  if (!(CROSS_ASSET_CONTEXT_ALLOWED_DIRECTIONS as readonly string[])
    .includes(String(e.direction))) {
    reasons.push("cross_asset_context_direction_not_contextual");
  }
  if (!(CROSS_ASSET_CONTEXT_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("cross_asset_context_recommendation_not_contextual");
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());

  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["cross_asset_context_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/**
 * Prove the accepted cross-asset envelope is the single cross-asset envelope present in
 * the final collected seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertCrossAssetContextBinding(
  batch: EvidenceEnvelopeV1[], accepted_hash: string,
): void {
  const xs = batch.filter((e) => e?.agent_id === CROSS_ASSET_CONTEXT_AGENT);
  if (xs.length !== 1) {
    throw new OrchestrationRunError([`cross_asset_context_binding_count:${xs.length}`]);
  }
  if (xs[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError(["cross_asset_context_binding_hash_divergence"]);
  }
}
