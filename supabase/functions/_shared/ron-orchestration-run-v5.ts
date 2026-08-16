/**
 * RON orchestration run — Coordination Plan V5 (implementation marker
 * `RON_ORCHESTRATION_MACRO_TEMPORAL_CONTEXT_V5`).
 *
 * FORWARD-ONLY extension of the frozen Orchestration Run V4 plan. V1, V2, V3 and V4 are
 * imported, never mutated: their plan arrays, spec objects, hashes and run-id derivations
 * are untouched and stay explicitly replayable.
 *
 * The ONLY semantic difference in V5 is that `macro_news_geopolitics` is invoked with an
 * EXPLICIT `spec_version: 2` pin, so RON receives the audited deterministic OBSERVED
 * TEMPORAL XAU PRICE CONTEXT around genuine source-news publication instants instead of
 * relying on the endpoint's mutable default. The seven agents, canonical order, authority
 * model, phases, subject scope, the Session -> sealed evidence -> Pattern V2 handoff, the
 * Calibration V2 temporal/provenance binding, the Cross-Asset V2 completed-bar gate and
 * the Opportunity/Risk evidence batch are inherited verbatim from V4.
 *
 * Macro Temporal Context V2 remains NON-AUTHORITATIVE CONTEXTUAL evidence: temporal
 * adjacency between an article timestamp and a completed-bar price change is explicitly
 * NOT causation, NOT impact, NOT a reaction and NOT a signal. No probability, confidence,
 * significance, sentiment, credibility score, trade geometry or execution authority is
 * introduced anywhere by this slice.
 *
 * TEMPORAL SEMANTICS NOTE (Macro differs from Session / Cross-Asset):
 * for a SUPPORTED macro envelope the top-level `as_of` is the NEWEST INCLUDED PUBLICATION
 * INSTANT, not the orchestration anchor. The orchestration anchor is carried in
 * `source_timestamps.evaluation_anchor`. This gate therefore binds the anchor through
 * `evaluation_anchor` and only requires `as_of <= anchor`; it never falsely demands
 * `as_of === anchor`. Blocked / insufficient envelopes legitimately carry
 * `as_of === evaluation_anchor` and stay admissible.
 *
 * PURE module: no I/O, no database client, no network call, no secret.
 */
import {
  evidenceHash, hashCanonical, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "./ron-agent-contracts.ts";
import type { OrchestrationContext } from "./ron-orchestrator.ts";
import { MACRO_NEWS_SPEC_V1 } from "./ron-macro-news-geopolitics-spec.ts";
import {
  MACRO_NEWS_SPEC_V2, MACRO_TEMPORAL_BAR_MINUTES, SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
} from "./ron-macro-temporal-context-v2.ts";
import { SESSION_STRUCTURE_SPEC_V2 } from "./ron-session-structure-spec-v2.ts";
import { ORCHESTRATION_RUN_SPEC_V1, OrchestrationRunError } from "./ron-orchestration-run.ts";
import { type AgentCallPlanEntryV2 } from "./ron-orchestration-run-v2.ts";
import { ORCHESTRATION_RUN_PLAN_V4, ORCHESTRATION_RUN_SPEC_V4 } from "./ron-orchestration-run-v4.ts";

export const RON_ORCHESTRATION_RUN_VERSION_V5 = 5;

/** The one agent whose specialist spec version V5 additionally pins. */
export const MACRO_CONTEXT_AGENT: RonAgentId = "macro_news_geopolitics";

/** Exactly one spec_version value may ever be sent for macro in a V5 run. */
export const MACRO_CONTEXT_SPEC_VERSION_V5 = 2;

/**
 * FULL accepted Macro Temporal Context Spec V2 hash, recomputed from the frozen producer
 * at the time of this slice and pinned here. Any other value in returned provenance is
 * rejected fail-closed.
 */
export const MACRO_TEMPORAL_SPEC_V2_HASH_PINNED =
  "4869ef0103396ae3ca49416b1d20bd70cc057f58cd668f338612e9bc885481fd";

/** FULL accepted Macro / News / Geopolitics Spec V1 hash (inherited base evidence). */
export const MACRO_NEWS_SPEC_V1_HASH_PINNED =
  "0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f";

const M_SPEC_ID = MACRO_NEWS_SPEC_V2.spec_id;

/**
 * Macro V2 and its inherited V1 base evidence share ONE spec lineage namespace, so the
 * frozen producer emits TWO refs under `spec:<spec_id>:`. That contract is enforced
 * exactly: one correct V2 ref, one correct inherited V1 ref, nothing else in the lineage.
 */
const M_SPEC_PREFIX = `spec:${M_SPEC_ID}:`;

export const macroContextSpecRefV2 = (): string =>
  `${M_SPEC_PREFIX}v${MACRO_NEWS_SPEC_V2.spec_version}:${MACRO_TEMPORAL_SPEC_V2_HASH_PINNED}`;

export const macroContextBaseSpecRefV1 = (): string =>
  `${M_SPEC_PREFIX}v${MACRO_NEWS_SPEC_V1.spec_version}:${MACRO_NEWS_SPEC_V1_HASH_PINNED}`;

/** Accepted Session V2 classification provenance Macro V2 depends on (never mutated). */
const M_CLASSIFICATION_PREFIX = `classification:${SESSION_STRUCTURE_SPEC_V2.spec_id}:`;
export const macroContextClassificationRef = (): string =>
  `${M_CLASSIFICATION_PREFIX}v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`;

/** Inherited bar length: DERIVED from the frozen Macro V2 contract, never redeclared. */
const BAR_MS = MACRO_TEMPORAL_BAR_MINUTES * 60_000;

/**
 * The frozen Macro contract emits `direction` in {neutral, unknown} and `recommendation`
 * in {context_only, no_action} only. These sets are the accepted contract, not new rules.
 */
export const MACRO_CONTEXT_ALLOWED_DIRECTIONS = ["neutral", "unknown"] as const;
export const MACRO_CONTEXT_ALLOWED_RECOMMENDATIONS = ["context_only", "no_action"] as const;

/** V5 pins Session V2, Pattern V2, Calibration V2, Cross-Asset V2 AND Macro V2 (new). */
const PIN_V5: Partial<Record<RonAgentId, number>> = {
  ...ORCHESTRATION_RUN_SPEC_V4.spec_version_pins,
  macro_news_geopolitics: MACRO_CONTEXT_SPEC_VERSION_V5,
};

/**
 * Same seven specialists, same canonical order, same authority hierarchy, same subject
 * scoping, same phase routing and the SAME single sealed Session -> Pattern dependency as
 * V4. Only `spec_version_pin` for macro differs.
 */
export const ORCHESTRATION_RUN_PLAN_V5: readonly AgentCallPlanEntryV2[] =
  ORCHESTRATION_RUN_PLAN_V4.map((p) => ({
    ...p,
    spec_version_pin: PIN_V5[p.agent_id] ?? null,
  }));

export const ORCHESTRATION_RUN_PLAN_AGENTS_V5: readonly RonAgentId[] =
  ORCHESTRATION_RUN_PLAN_V5.map((p) => p.agent_id);

export const ORCHESTRATION_RUN_SPEC_V5 = {
  run_version: RON_ORCHESTRATION_RUN_VERSION_V5,
  supersedes_run_version: ORCHESTRATION_RUN_SPEC_V4.run_version,
  purpose:
    "explicitly invoked seven-agent collection identical to Orchestration Run V4 except "
    + "that macro_news_geopolitics is pinned to spec_version 2 so RON receives the audited "
    + "deterministic observed temporal XAU price context around genuine source-news "
    + "publication instants as non-authoritative contextual evidence",
  auto_run: false,
  cron: false,
  dashboard_wiring: false,
  numeric_probability: null,
  execution_allowed: false,
  execution_path: "signal_only",
  persist_default: false,
  run_id_domain: "ron_orch_run_v5",
  session_dependency_acceptance: ORCHESTRATION_RUN_SPEC_V4.session_dependency_acceptance,
  pattern_dependency_binding_verified: true,
  calibration_context: ORCHESTRATION_RUN_SPEC_V4.calibration_context,
  cross_asset_context: ORCHESTRATION_RUN_SPEC_V4.cross_asset_context,
  /** New in V5, and the ONLY semantic delta from V4. */
  macro_context: {
    agent_id: MACRO_CONTEXT_AGENT,
    requested_spec_version: MACRO_CONTEXT_SPEC_VERSION_V5,
    requested_exactly_once: true,
    spec_id: M_SPEC_ID,
    accepted_spec_hash: MACRO_TEMPORAL_SPEC_V2_HASH_PINNED,
    inherited_base_spec_hash: MACRO_NEWS_SPEC_V1_HASH_PINNED,
    same_spec_lineage_as_v1: true,
    lineage_spec_ref_count_required: 2,
    classification_spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
    classification_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    authority_added: false,
    direction_weighting_added: false,
    probability_published: false,
    causation_claimed: false,
    sentiment_added: false,
    impact_score_added: false,
    source_credibility_added: false,
    llm_or_web_fetch: false,
    news_requeried_in_orchestration: false,
    promotion_conferred: false,
    allowed_directions: MACRO_CONTEXT_ALLOWED_DIRECTIONS,
    allowed_recommendations: MACRO_CONTEXT_ALLOWED_RECOMMENDATIONS,
    /** Frozen Macro temporal contract, enforced as-is (never reinterpreted). */
    temporal_contract: {
      anchor_carried_in_source_timestamp_key: "evaluation_anchor",
      evaluation_anchor_must_equal_orchestration_anchor: true,
      as_of_is_newest_included_publication_when_supported: true,
      as_of_equals_orchestration_anchor_required: false,
      as_of_must_not_exceed_orchestration_anchor: true,
      admitted_source_timestamp_must_not_exceed_anchor: true,
      price_context_completed_close_must_not_exceed_anchor: true,
      observation_instants_must_not_exceed_anchor: true,
      completed_bars_only: true,
      bar_grid_minutes: MACRO_TEMPORAL_BAR_MINUTES,
      bound_price_context_timestamp_keys: [
        "price_context_anchor_reference_bar_open",
        "price_context_anchor_reference_bar_completed_close",
      ],
      blocked_or_insufficient_may_use_anchor_as_of: true,
    },
  },
  spec_version_pins: {
    ...ORCHESTRATION_RUN_SPEC_V4.spec_version_pins,
    macro_news_geopolitics: MACRO_CONTEXT_SPEC_VERSION_V5,
  },
  unpinned_agents_use_endpoint_defaults: ORCHESTRATION_RUN_PLAN_V5
    .filter((p) => p.spec_version_pin === null).map((p) => p.agent_id),
  persistence_atomicity: ORCHESTRATION_RUN_SPEC_V1.persistence_atomicity,
  persistence_order: ORCHESTRATION_RUN_SPEC_V1.persistence_order,
  plan: ORCHESTRATION_RUN_PLAN_V5,
} as const;

export const orchestrationRunPlanHashV5 = (): Promise<string> =>
  hashCanonical(ORCHESTRATION_RUN_SPEC_V5 as unknown as Record<string, unknown>);

/* --------------------------------------------------------- run identities */

const HEX = (n: number) => n.toString(16).padStart(2, "0");

/** V5 run identity, domain-separated from the v1/v2/v3/v4 run-id domains. */
export async function deriveRunIdV5(
  trace_id: string, anchor_iso: string, agent_id: RonAgentId,
): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${ORCHESTRATION_RUN_SPEC_V5.run_id_domain}|${trace_id}|${anchor_iso}|${agent_id}`),
  ));
  return Array.from(bytes.slice(0, 16), HEX).join("");
}

export async function deriveRunIdsV5(
  trace_id: string, anchor_iso: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of ORCHESTRATION_RUN_PLAN_V5) {
    out[p.agent_id] = await deriveRunIdV5(trace_id, anchor_iso, p.agent_id);
  }
  return out;
}

/* ------------------------------------ macro temporal context V2 acceptance gate */

/**
 * Fail closed unless `candidate` is EXACTLY a sealed Macro Temporal Context V2 envelope
 * for this run.
 *
 * Rejects: absence, malformed input, the wrong agent or agent_version, an unsealed
 * envelope, a hash that does not match its own content, scope mismatch, a missing or
 * mismatched `evaluation_anchor` binding, a top-level `as_of` after the anchor, any
 * admitted source instant or observation instant after the anchor, an inconsistent or
 * future price-context completed-bar pair, a missing/wrong/duplicated V2 spec ref, a
 * missing/wrong/duplicated inherited V1 base ref, any extra lineage ref, a wrong Session
 * V2 classification provenance ref, and any direction or recommendation outside the
 * frozen Macro contextual contract.
 *
 * Returns the verified sealed evidence hash.
 */
export async function assertMacroContextV2Sealed(
  candidate: unknown, ctx: OrchestrationContext,
): Promise<string> {
  if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OrchestrationRunError(["macro_context_absent_or_malformed"]);
  }
  const e = candidate as EvidenceEnvelopeV1;
  const reasons: string[] = [];

  if (e.agent_id !== MACRO_CONTEXT_AGENT) reasons.push("macro_context_wrong_agent");
  if (e.agent_version !== MACRO_NEWS_SPEC_V2.agent_version) {
    reasons.push("macro_context_wrong_agent_version");
  }
  if (validateEvidence(e).length) reasons.push("macro_context_invalid_envelope");
  if (!e.evidence_hash) reasons.push("macro_context_unsealed");
  if (e.trace_id !== ctx.trace_id) reasons.push("macro_context_trace_mismatch");
  if (e.instrument !== ctx.instrument) reasons.push("macro_context_instrument_mismatch");
  if (e.timeframe !== ctx.timeframe) reasons.push("macro_context_timeframe_mismatch");

  const anchorMs = Date.parse(ctx.as_of);
  if (!Number.isFinite(anchorMs)) reasons.push("macro_context_anchor_unparseable");

  // TEMPORAL: the orchestration anchor is bound through `evaluation_anchor`, NOT through
  // the top-level `as_of` (which is the newest included publication instant when the
  // macro evidence is supported).
  const st = (e.source_timestamps ?? {}) as Record<string, unknown>;
  const evalRaw = st.evaluation_anchor;
  const evalMs = typeof evalRaw === "string" ? Date.parse(evalRaw) : NaN;
  if (typeof evalRaw !== "string" || !Number.isFinite(evalMs)) {
    reasons.push("macro_context_evaluation_anchor_missing_or_unparseable");
  } else if (Number.isFinite(anchorMs) && evalMs !== anchorMs) {
    reasons.push("macro_context_evaluation_anchor_mismatch");
  }

  const atMs = Date.parse(e.as_of ?? "");
  if (!Number.isFinite(atMs)) reasons.push("macro_context_as_of_unparseable");
  else if (Number.isFinite(anchorMs) && atMs > anchorMs) {
    reasons.push("macro_context_as_of_after_orchestration_anchor");
  }

  // Price-context completed-bar pair: present only on the admissible path, never
  // fabricated. When present it must be grid aligned, internally consistent and CLOSED at
  // or before the anchor — a bar that had not closed yet is future information.
  const pOpenRaw = st.price_context_anchor_reference_bar_open;
  const pCloseRaw = st.price_context_anchor_reference_bar_completed_close;
  if (pOpenRaw != null || pCloseRaw != null) {
    const openMs = typeof pOpenRaw === "string" ? Date.parse(pOpenRaw) : NaN;
    if (!Number.isFinite(openMs) || openMs % BAR_MS !== 0) {
      reasons.push("macro_context_price_context_bar_open_invalid");
    }
    const closeMs = typeof pCloseRaw === "string" ? Date.parse(pCloseRaw) : NaN;
    if (!Number.isFinite(closeMs) || !Number.isFinite(openMs) || closeMs !== openMs + BAR_MS) {
      reasons.push("macro_context_price_context_completed_bar_pair_inconsistent");
    } else if (Number.isFinite(anchorMs) && closeMs > anchorMs) {
      reasons.push("macro_context_price_context_completed_bar_after_orchestration_anchor");
    }
  }

  // Anchor-bound provenance: NO admitted source instant may postdate the anchor.
  for (const [k, v] of Object.entries(st)) {
    if (typeof v !== "string") continue;
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && Number.isFinite(anchorMs) && ms > anchorMs) {
      reasons.push(`macro_context_source_timestamp_after_anchor:${k}`);
    }
  }
  // ...and no observation instant (publication instant, completed-bar close) either.
  for (const o of e.observations ?? []) {
    const at = (o as { at?: unknown })?.at;
    if (typeof at !== "string") continue;
    const ms = Date.parse(at);
    if (Number.isFinite(ms) && Number.isFinite(anchorMs) && ms > anchorMs) {
      reasons.push(`macro_context_observation_instant_after_anchor:${String((o as { key?: string }).key)}`);
    }
  }

  // SPEC LINEAGE: exactly one correct V2 ref AND exactly one correct inherited V1 ref in
  // the shared `spec:ron_macro_news_geopolitics:` namespace, and nothing else.
  const refs = (e.provenance_refs ?? []).filter((p): p is string => typeof p === "string");
  const lineage = refs.filter((p) => p.startsWith(M_SPEC_PREFIX));
  const v2Refs = lineage.filter((p) => p === macroContextSpecRefV2());
  const v1Refs = lineage.filter((p) => p === macroContextBaseSpecRefV1());
  if (lineage.length !== 2) {
    reasons.push(`macro_context_spec_lineage_ref_count:${lineage.length}`);
  }
  if (v2Refs.length !== 1) {
    const anyV2 = lineage.filter((p) => p.startsWith(`${M_SPEC_PREFIX}v2:`));
    reasons.push(anyV2.length === 0 && v2Refs.length === 0
      ? "macro_context_spec_v2_ref_missing"
      : `macro_context_spec_v2_ref_invalid:${anyV2.length}`);
  }
  if (v1Refs.length !== 1) {
    const anyV1 = lineage.filter((p) => p.startsWith(`${M_SPEC_PREFIX}v1:`));
    reasons.push(anyV1.length === 0 && v1Refs.length === 0
      ? "macro_context_base_spec_v1_ref_missing"
      : `macro_context_base_spec_v1_ref_invalid:${anyV1.length}`);
  }
  if (lineage.length === 2 && v1Refs.length === 1 && v2Refs.length === 1
    && (v1Refs.length + v2Refs.length) !== lineage.length) {
    reasons.push("macro_context_spec_lineage_ambiguous");
  }

  // Accepted Session V2 classification provenance used by Macro V2, unmutated.
  const classRefs = refs.filter((p) => p.startsWith(M_CLASSIFICATION_PREFIX));
  if (classRefs.length !== 1) {
    reasons.push(`macro_context_classification_provenance_count:${classRefs.length}`);
  } else if (classRefs[0] !== macroContextClassificationRef()) {
    reasons.push("macro_context_classification_provenance_mismatch");
  }

  // Contextual-only semantics exactly as the frozen Macro contract emits them.
  if (!(MACRO_CONTEXT_ALLOWED_DIRECTIONS as readonly string[]).includes(String(e.direction))) {
    reasons.push("macro_context_direction_not_contextual");
  }
  if (!(MACRO_CONTEXT_ALLOWED_RECOMMENDATIONS as readonly string[])
    .includes(String(e.recommendation))) {
    reasons.push("macro_context_recommendation_not_contextual");
  }

  if (reasons.length) throw new OrchestrationRunError([...new Set(reasons)].sort());

  if (await evidenceHash(e) !== e.evidence_hash) {
    throw new OrchestrationRunError(["macro_context_hash_mismatch"]);
  }
  return e.evidence_hash as string;
}

/**
 * Prove the accepted macro envelope is the single macro envelope present in the final
 * collected seven-agent batch. Fails closed on absence, duplication or drift.
 */
export function assertMacroContextBinding(
  batch: EvidenceEnvelopeV1[], accepted_hash: string,
): void {
  const ms = batch.filter((e) => e?.agent_id === MACRO_CONTEXT_AGENT);
  if (ms.length !== 1) {
    throw new OrchestrationRunError([`macro_context_binding_count:${ms.length}`]);
  }
  if (ms[0].evidence_hash !== accepted_hash) {
    throw new OrchestrationRunError(["macro_context_binding_hash_divergence"]);
  }
}
