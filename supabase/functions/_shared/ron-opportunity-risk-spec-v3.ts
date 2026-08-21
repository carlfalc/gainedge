/**
 * RON — Opportunity / Risk FOUNDATION spec V3: EVIDENCE COMPATIBILITY FOR THE
 * SINGLE-EVALUATION-ANCHOR SPECIALIST LINEAGES.
 *
 * Implementation marker `GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3`.
 *
 * V3 is forward-only and inherits V1's readiness semantics BYTE-FOR-BYTE by delegating
 * every readiness decision to the frozen V1 producer, exactly as V2 does. V1 and V2 stay
 * BYTE-IDENTICAL and fully replayable.
 *
 * THE ONLY DELTA from V2: the accepted specialist lineage table names the Session V3,
 * Pattern V3 and Cross-Asset V3 anchor-convention specs (the ones used by a run where
 * every specialist shares ONE completed-bar-close evaluation anchor). Calibration V2 and
 * Macro V2 lineages are inherited unchanged because their frozen contracts are already
 * anchor-convention neutral.
 *
 * This remains a READINESS GATE, never opportunity construction:
 *   - no direction other than `neutral` / `unknown`,
 *   - no entry/stop/target/R:R/lot/order/geometry, not even as nulls,
 *   - no probability, confidence, score, edge, expected value or forecast,
 *   - no causal claim, no execution intent, no persistence.
 *
 * V3 adds NO new temporal methodology: freshness, TTL, anchor and future-dating rules
 * remain exactly V1's. Orchestration keeps ownership of the temporal gate stack.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation, type RonAgentId,
} from "./ron-agent-contracts.ts";
import {
  buildOpportunityRiskEvidenceV1, OpportunityRiskContractError,
  OPPORTUNITY_OPTIONAL_AGENTS, OPPORTUNITY_REQUIRED_AGENTS, OPPORTUNITY_RISK_SPEC_V1,
  type OpportunityReadinessState, type OpportunityRiskInputV1,
} from "./ron-opportunity-risk-spec.ts";
import {
  ACCEPTED_CALIBRATION_SPEC_ID, ACCEPTED_CALIBRATION_V1_BASE_HASH,
  ACCEPTED_CALIBRATION_V2_HASH, ACCEPTED_CROSS_ASSET_SPEC_ID,
  ACCEPTED_CROSS_ASSET_V1_BASE_HASH, ACCEPTED_CROSS_ASSET_V2_HASH,
  ACCEPTED_MACRO_SPEC_ID, ACCEPTED_MACRO_V1_HASH, ACCEPTED_MACRO_V2_HASH,
  ACCEPTED_PATTERN_SPEC_ID, ACCEPTED_PATTERN_V2_HASH,
  ACCEPTED_SESSION_STRUCTURE_SPEC_ID, ACCEPTED_SESSION_STRUCTURE_V2_HASH,
  OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED, OPPORTUNITY_RISK_SPEC_V2,
} from "./ron-opportunity-risk-spec-v2.ts";

export { OpportunityRiskContractError };

/** FULL accepted Opportunity/Risk Compatibility Spec V2 hash (never re-derived here). */
export const OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED =
  "66065e535c2b3580f346858684ba0f2fa2e4729d2b37f8c96235b9d37cc55656";

/* --------------------------------- accepted single-anchor specialist lineages */

export const ACCEPTED_SESSION_STRUCTURE_V3_HASH =
  "0ea4ecd19d22d4a013f63f4fd44b4a6e89b47fe13be4cf6deed785c99252bc80";
export const ACCEPTED_PATTERN_V3_HASH =
  "fb337fb1f544f656621350355d792d587405b8995064e1550b5053f9f37205c3";
export const ACCEPTED_PATTERN_V2_BASE_HASH = ACCEPTED_PATTERN_V2_HASH;
export const ACCEPTED_CROSS_ASSET_V3_HASH =
  "013e0bbd6a839f064d7d9124ff24ac164419a6af156bf3c027b63f8d62069a25";
export const ACCEPTED_CROSS_ASSET_V2_BASE_HASH = ACCEPTED_CROSS_ASSET_V2_HASH;

export const OPPORTUNITY_COMPATIBILITY_CONTRACT_ID_V3 =
  "accepted_specialist_lineages_v3_single_evaluation_anchor";

export const OPPORTUNITY_RISK_SPEC_V3 = {
  ...OPPORTUNITY_RISK_SPEC_V1,
  spec_version: 3,
  supersedes_spec_version: OPPORTUNITY_RISK_SPEC_V2.spec_version,
  base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
  base_spec_version: OPPORTUNITY_RISK_SPEC_V1.spec_version,
  base_spec_hash: OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED,

  readiness_logic: "inherited_unchanged_from_v1",

  anchor_contract: {
    evaluation_anchor_means: "completed_bar_close",
    same_anchor_for_every_specialist_in_the_run: true,
    per_agent_anchor_convention: false,
    new_temporal_methodology: false,
    ttl_or_freshness_changed: false,
  },

  evidence_compatibility_contract: {
    contract_id: OPPORTUNITY_COMPATIBILITY_CONTRACT_ID_V3,
    applies_to: "present_required_and_optional_specialist_envelopes_only",
    proof_source: "sealed_envelope_provenance_refs_only",
    ambiguous_duplicate_lineage_policy: "fail_closed",
    missing_optional_agent_policy: "allowed_exactly_as_v1",
    missing_required_agent_policy: "v1_precedence_preserved_never_reclassified",
    unknown_extra_agent_policy: "v1_semantics_unchanged_no_new_authority",
    falconer_policy: "not_required_not_optional_not_an_authority_no_signal_read",
    failure_state: "blocked_contract_mismatch",
    new_temporal_methodology: false,
    accepted_lineages: {
      session_market_structure: {
        spec_id: ACCEPTED_SESSION_STRUCTURE_SPEC_ID,
        spec_version: 3,
        spec_hash: ACCEPTED_SESSION_STRUCTURE_V3_HASH,
        base_spec_version: 2,
        base_spec_hash: ACCEPTED_SESSION_STRUCTURE_V2_HASH,
      },
      calibration_model_validation: {
        spec_id: ACCEPTED_CALIBRATION_SPEC_ID,
        spec_version: 2,
        spec_hash: ACCEPTED_CALIBRATION_V2_HASH,
        base_spec_version: 1,
        base_spec_hash: ACCEPTED_CALIBRATION_V1_BASE_HASH,
        observations_read: OPPORTUNITY_RISK_SPEC_V1.calibration_contract.fields_read,
        diagnostic_context_alters_readiness: false,
      },
      pattern_context: {
        spec_id: ACCEPTED_PATTERN_SPEC_ID,
        spec_version: 3,
        spec_hash: ACCEPTED_PATTERN_V3_HASH,
        base_spec_version: 2,
        base_spec_hash: ACCEPTED_PATTERN_V2_BASE_HASH,
        required_segmentation_ref: true,
      },
      cross_asset_correlation: {
        spec_id: ACCEPTED_CROSS_ASSET_SPEC_ID,
        spec_version: 3,
        spec_hash: ACCEPTED_CROSS_ASSET_V3_HASH,
        base_spec_version: 2,
        base_spec_hash: ACCEPTED_CROSS_ASSET_V2_BASE_HASH,
        inherited_base_spec_version: 1,
        inherited_base_spec_hash: ACCEPTED_CROSS_ASSET_V1_BASE_HASH,
      },
      macro_news_geopolitics: {
        spec_id: ACCEPTED_MACRO_SPEC_ID,
        spec_version: 2,
        spec_hash: ACCEPTED_MACRO_V2_HASH,
        inherited_spec_version: 1,
        inherited_spec_hash: ACCEPTED_MACRO_V1_HASH,
        required_classification_ref: true,
      },
    },
  },
} as const;

export function opportunityRiskSpecHashV3(): Promise<string> {
  return hashCanonical(OPPORTUNITY_RISK_SPEC_V3);
}

/* --------------------------------------------------------- pure lineage helpers */

const allRefs = (e: EvidenceEnvelopeV1): string[] =>
  Array.isArray(e.provenance_refs) ? e.provenance_refs.filter((r) => typeof r === "string") : [];

const scoped = (e: EvidenceEnvelopeV1, kind: string, specId: string): string[] =>
  allRefs(e).filter((r) => r.startsWith(`${kind}:${specId}:`));

/**
 * Exactly one RAW ref of the family, and it is exactly the accepted one. Raw cardinality
 * is enforced BEFORE any dedupe: two identical copies are ambiguous and fail closed.
 */
function exactlyOne(
  list: readonly string[], expected: string, label: string,
): string | null {
  if (list.length === 0) return `missing_${label}`;
  if (list.length !== 1) return `ambiguous_${label}`;
  return list[0] === expected ? null : `unexpected_${label}`;
}

/** Exactly the given accepted refs, in any order, with no extra and no duplicate. */
function exactlyThese(
  list: readonly string[], expected: readonly string[], label: string,
): string | null {
  if (list.length !== expected.length) return `ambiguous_${label}`;
  for (const want of expected) {
    if (list.filter((r) => r === want).length !== 1) return `unexpected_${label}`;
  }
  return null;
}

export interface LineageCheckV3 {
  agent_id: RonAgentId;
  ok: boolean;
  reasons: string[];
}

export function checkAcceptedLineageV3(e: EvidenceEnvelopeV1): LineageCheckV3 {
  const out: string[] = [];
  const add = (r: string | null) => { if (r) out.push(r); };

  switch (e.agent_id) {
    case "session_market_structure":
      add(exactlyOne(
        scoped(e, "spec", ACCEPTED_SESSION_STRUCTURE_SPEC_ID),
        `spec:${ACCEPTED_SESSION_STRUCTURE_SPEC_ID}:v3:${ACCEPTED_SESSION_STRUCTURE_V3_HASH}`,
        "session_structure_v3_spec_ref",
      ));
      add(exactlyOne(
        scoped(e, "base_spec", ACCEPTED_SESSION_STRUCTURE_SPEC_ID),
        `base_spec:${ACCEPTED_SESSION_STRUCTURE_SPEC_ID}:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`,
        "session_structure_v2_base_spec_ref",
      ));
      break;

    case "calibration_model_validation":
      add(exactlyOne(
        scoped(e, "spec", ACCEPTED_CALIBRATION_SPEC_ID),
        `spec:${ACCEPTED_CALIBRATION_SPEC_ID}:v2:${ACCEPTED_CALIBRATION_V2_HASH}`,
        "calibration_context_v2_spec_ref",
      ));
      add(exactlyOne(
        scoped(e, "base_spec", ACCEPTED_CALIBRATION_SPEC_ID),
        `base_spec:${ACCEPTED_CALIBRATION_SPEC_ID}:v1:${ACCEPTED_CALIBRATION_V1_BASE_HASH}`,
        "calibration_v1_base_spec_ref",
      ));
      break;

    case "pattern_context":
      add(exactlyOne(
        scoped(e, "spec", ACCEPTED_PATTERN_SPEC_ID),
        `spec:${ACCEPTED_PATTERN_SPEC_ID}:v3:${ACCEPTED_PATTERN_V3_HASH}`,
        "pattern_context_v3_spec_ref",
      ));
      add(exactlyOne(
        scoped(e, "base_spec", ACCEPTED_PATTERN_SPEC_ID),
        `base_spec:${ACCEPTED_PATTERN_SPEC_ID}:v2:${ACCEPTED_PATTERN_V2_BASE_HASH}`,
        "pattern_context_v2_base_spec_ref",
      ));
      add(exactlyOne(
        scoped(e, "segmentation", ACCEPTED_SESSION_STRUCTURE_SPEC_ID),
        `segmentation:${ACCEPTED_SESSION_STRUCTURE_SPEC_ID}:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`,
        "pattern_segmentation_session_v2_ref",
      ));
      break;

    case "cross_asset_correlation":
      add(exactlyOne(
        scoped(e, "spec", ACCEPTED_CROSS_ASSET_SPEC_ID),
        `spec:${ACCEPTED_CROSS_ASSET_SPEC_ID}:v3:${ACCEPTED_CROSS_ASSET_V3_HASH}`,
        "cross_asset_v3_spec_ref",
      ));
      // The V3 producer carries BOTH inherited base identities: V2 (its direct base) and
      // the V1 base ref the frozen V2 producer always emits.
      add(exactlyThese(
        scoped(e, "base_spec", ACCEPTED_CROSS_ASSET_SPEC_ID),
        [
          `base_spec:${ACCEPTED_CROSS_ASSET_SPEC_ID}:v2:${ACCEPTED_CROSS_ASSET_V2_BASE_HASH}`,
          `base_spec:${ACCEPTED_CROSS_ASSET_SPEC_ID}:v1:${ACCEPTED_CROSS_ASSET_V1_BASE_HASH}`,
        ],
        "cross_asset_base_spec_refs",
      ));
      break;

    case "macro_news_geopolitics": {
      // Inherited VERBATIM from the frozen V2 contract: the Macro V2 producer emits BOTH
      // lineage refs under `spec:` (V2 first, then the inherited V1 ref).
      const specRefs = scoped(e, "spec", ACCEPTED_MACRO_SPEC_ID);
      const v2 = `spec:${ACCEPTED_MACRO_SPEC_ID}:v2:${ACCEPTED_MACRO_V2_HASH}`;
      const v1 = `spec:${ACCEPTED_MACRO_SPEC_ID}:v1:${ACCEPTED_MACRO_V1_HASH}`;
      const v2Count = specRefs.filter((r) => r === v2).length;
      const v1Count = specRefs.filter((r) => r === v1).length;
      if (v2Count === 0) {
        out.push(specRefs.some((r) => r.startsWith(`spec:${ACCEPTED_MACRO_SPEC_ID}:v2:`))
          ? "unexpected_macro_v2_spec_ref" : "missing_macro_v2_spec_ref");
      }
      if (v1Count === 0) {
        out.push(specRefs.some((r) => r.startsWith(`spec:${ACCEPTED_MACRO_SPEC_ID}:v1:`))
          ? "unexpected_macro_v1_spec_ref" : "missing_macro_v1_spec_ref");
      }
      if (specRefs.length !== 2 || v2Count !== 1 || v1Count !== 1) {
        out.push("ambiguous_macro_spec_lineage");
      }
      break;
    }

    // Falconer and any unknown extra agent are NOT compatibility-gated here: they are
    // neither required nor optional, carry no authority and are never read.
    default:
      break;
  }

  return { agent_id: e.agent_id, ok: out.length === 0, reasons: out };
}

/* ------------------------------------------------------------------- producer */

export type OpportunityRiskInputV3 = OpportunityRiskInputV1;

const state = (key: string, value: string, at: string): Observation =>
  ({ key, kind: "state", value_text: value, at });
const num = (key: string, value: number, at: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), at });

const READINESS_KEYS = new Set(["readiness_state", "construction_allowed", "blocking_reason"]);

/** States decided BEFORE compatibility can be assessed. Their precedence is preserved. */
const PRE_COMPATIBILITY_STATES: readonly OpportunityReadinessState[] = [
  "blocked_contract_mismatch",
  "blocked_conflicting_evidence",
  "blocked_future_dated_evidence",
  "blocked_missing_required_evidence",
] as const;

export async function buildOpportunityRiskEvidenceV3(
  input: OpportunityRiskInputV3,
): Promise<EvidenceEnvelopeV1> {
  const base = await buildOpportunityRiskEvidenceV1(input);
  const at = base.as_of;
  const specHashV3 = await opportunityRiskSpecHashV3();

  const provenance_refs = [
    `spec:${OPPORTUNITY_RISK_SPEC_V3.spec_id}:v${OPPORTUNITY_RISK_SPEC_V3.spec_version}:${specHashV3}`,
    `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v${OPPORTUNITY_RISK_SPEC_V1.spec_version}:${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`,
    ...base.provenance_refs.filter(
      (p) => !p.startsWith(`spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:`),
    ),
  ];

  const baseState = base.observations.find((o) => o.key === "readiness_state")?.value_text ?? "";
  const limitations = [
    ...base.uncertainty.limitations,
    "V3 adds an evidence COMPATIBILITY contract only: readiness logic, thresholds, TTLs " +
    "and the zero-geometry safety contract are inherited unchanged from V1",
    "the evaluation anchor is a COMPLETED bar close shared by every specialist in the run; " +
    "no per-agent anchor convention exists and no temporal rule was relaxed",
  ];

  if (PRE_COMPATIBILITY_STATES.includes(baseState as OpportunityReadinessState)) {
    return {
      ...base,
      provenance_refs,
      uncertainty: { level: "unquantified", limitations },
      observations: [
        ...base.observations,
        state("evidence_compatibility_contract", OPPORTUNITY_COMPATIBILITY_CONTRACT_ID_V3, at),
        state("evidence_compatibility_state", "not_assessed_precedence_preserved", at),
      ],
    };
  }

  const present = new Map<string, EvidenceEnvelopeV1>();
  for (const e of input.evidence ?? []) {
    const key = `${e.agent_id}@${e.agent_version}`;
    if (!present.has(key)) present.set(key, e);
  }
  const gated: RonAgentId[] = [
    ...OPPORTUNITY_REQUIRED_AGENTS, ...OPPORTUNITY_OPTIONAL_AGENTS,
  ];

  const compatObs: Observation[] = [
    state("evidence_compatibility_contract", OPPORTUNITY_COMPATIBILITY_CONTRACT_ID_V3, at),
  ];
  const failures: string[] = [];
  let acceptedRequired = 0;
  let acceptedOptional = 0;

  for (const id of gated) {
    const env = [...present.values()].find((e) => e.agent_id === id);
    if (!env) continue;
    const check = checkAcceptedLineageV3(env);
    if (check.ok) {
      if ((OPPORTUNITY_REQUIRED_AGENTS as readonly string[]).includes(id)) acceptedRequired++;
      else acceptedOptional++;
      compatObs.push(state("accepted_specialist_lineage", id, at));
    } else {
      for (const r of check.reasons) failures.push(`incompatible_specialist_lineage:${id}:${r}`);
      compatObs.push(state("incompatible_specialist_lineage", id, at));
    }
  }

  compatObs.push(
    num("accepted_required_lineages", acceptedRequired, at, "agents"),
    num("accepted_optional_lineages", acceptedOptional, at, "agents"),
  );

  if (!failures.length) {
    return {
      ...base,
      provenance_refs,
      uncertainty: { level: "unquantified", limitations },
      observations: [...base.observations, ...compatObs],
    };
  }

  const kept = base.observations.filter((o) => !READINESS_KEYS.has(o.key));
  const observations: Observation[] = [
    state("readiness_state", "blocked_contract_mismatch", at),
    state("construction_allowed", "false", at),
    ...kept,
    ...compatObs,
    ...failures.map((f) => state("blocking_reason", f, at)),
  ];

  return {
    ...base,
    provenance_refs,
    observations,
    uncertainty: {
      level: "unquantified",
      limitations: [
        ...limitations,
        "at least one present specialist envelope did not prove the accepted spec lineage; " +
        "compatibility fails closed and no construction of any kind is permitted",
      ],
    },
    data_health: {
      ...base.data_health,
      status: "critical",
      issues: [...base.data_health.issues, ...failures],
    },
    conflicts: base.conflicts,
    status: "blocked",
    direction: "unknown",
    recommendation: "no_action",
  };
}
