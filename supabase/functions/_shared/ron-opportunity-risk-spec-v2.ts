/**
 * RON — Opportunity / Risk FOUNDATION spec V2: EVIDENCE COMPATIBILITY ONLY.
 *
 * V2 is forward-only and inherits V1's readiness semantics BYTE-FOR-BYTE by delegating
 * every readiness decision to the frozen V1 producer. The ONLY semantic delta is an
 * explicit EVIDENCE COMPATIBILITY CONTRACT: each PRESENT required/optional specialist
 * envelope must carry the exact accepted specialist spec lineage now used by
 * Orchestration V5, proven from its own frozen `provenance_refs` shape.
 *
 * This remains a READINESS GATE, never opportunity construction:
 *   - no direction other than `neutral` / `unknown`,
 *   - no entry/stop/target/R:R/lot/order/geometry, not even as nulls,
 *   - no probability, confidence, score, edge, expected value or forecast,
 *   - no causal claim, no execution intent, no persistence.
 *
 * V2 adds NO new temporal methodology: freshness, TTL, anchor and future-dating rules
 * remain exactly V1's. Orchestration keeps ownership of the temporal gate stack.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type Observation, type RonAgentId,
} from "./ron-agent-contracts.ts";
import {
  buildOpportunityRiskEvidenceV1, OpportunityRiskContractError,
  OPPORTUNITY_OPTIONAL_AGENTS, OPPORTUNITY_REQUIRED_AGENTS, OPPORTUNITY_RISK_SPEC_V1,
  opportunityRiskSpecHash,
  type OpportunityReadinessState, type OpportunityRiskInputV1,
} from "./ron-opportunity-risk-spec.ts";

export { OpportunityRiskContractError };

/** FULL accepted Opportunity/Risk Foundation Spec V1 hash (inherited, never re-derived). */
export const OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED =
  "cb547444826d7a49479d869ad558ee7344733140f0ad0ae0a4d3c8f71461173a";

/* --------------------------------------------- accepted specialist lineage pins */

export const ACCEPTED_SESSION_STRUCTURE_SPEC_ID = "ron_session_market_structure";
export const ACCEPTED_SESSION_STRUCTURE_V2_HASH =
  "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b";

export const ACCEPTED_CALIBRATION_SPEC_ID = "ron_calibration_model_validation";
export const ACCEPTED_CALIBRATION_V2_HASH =
  "f2d41d336fe706099d0269e8c23f0ce46717bf2eced696c2f51459a27876543a";
export const ACCEPTED_CALIBRATION_V1_BASE_HASH =
  "e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c";

export const ACCEPTED_PATTERN_SPEC_ID = "ron_pattern_context";
export const ACCEPTED_PATTERN_V2_HASH =
  "0c29c45b8d2bb9d24f096697ce3d64ed630fa8f8124d8de09043aa72f7448a14";

export const ACCEPTED_CROSS_ASSET_SPEC_ID = "ron_cross_asset_correlation";
export const ACCEPTED_CROSS_ASSET_V2_HASH =
  "032ac31b53b187b135e1f9fedadbfd213102d4a475a83248c123c99e30639682";
export const ACCEPTED_CROSS_ASSET_V1_BASE_HASH =
  "8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44";

export const ACCEPTED_MACRO_SPEC_ID = "ron_macro_news_geopolitics";
export const ACCEPTED_MACRO_V2_HASH =
  "4869ef0103396ae3ca49416b1d20bd70cc057f58cd668f338612e9bc885481fd";
export const ACCEPTED_MACRO_V1_HASH =
  "0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f";

/**
 * Readiness states V2 can return, IDENTICAL to V1. V2 never invents a state: a
 * compatibility failure is reported as the existing `blocked_contract_mismatch`.
 */
export const OPPORTUNITY_COMPATIBILITY_CONTRACT_ID = "accepted_specialist_lineages_v2";

export const OPPORTUNITY_RISK_SPEC_V2 = {
  ...OPPORTUNITY_RISK_SPEC_V1,
  spec_version: 2,
  supersedes_spec_version: 1,
  base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
  base_spec_version: OPPORTUNITY_RISK_SPEC_V1.spec_version,
  base_spec_hash: OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED,

  readiness_logic: "inherited_unchanged_from_v1",

  evidence_compatibility_contract: {
    contract_id: OPPORTUNITY_COMPATIBILITY_CONTRACT_ID,
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
        spec_version: 2,
        spec_hash: ACCEPTED_SESSION_STRUCTURE_V2_HASH,
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
        spec_version: 2,
        spec_hash: ACCEPTED_PATTERN_V2_HASH,
        required_segmentation_ref: true,
      },
      cross_asset_correlation: {
        spec_id: ACCEPTED_CROSS_ASSET_SPEC_ID,
        spec_version: 2,
        spec_hash: ACCEPTED_CROSS_ASSET_V2_HASH,
        base_spec_version: 1,
        base_spec_hash: ACCEPTED_CROSS_ASSET_V1_BASE_HASH,
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

export function opportunityRiskSpecHashV2(): Promise<string> {
  return hashCanonical(OPPORTUNITY_RISK_SPEC_V2);
}

/* --------------------------------------------------------- pure lineage helpers */

const refs = (e: EvidenceEnvelopeV1): string[] =>
  Array.isArray(e.provenance_refs) ? e.provenance_refs.filter((r) => typeof r === "string") : [];

/** Refs with a given `<kind>:<spec_id>:` prefix, deduped exactly as emitted. */
const scoped = (e: EvidenceEnvelopeV1, kind: string, specId: string): string[] =>
  refs(e).filter((r) => r.startsWith(`${kind}:${specId}:`));

/**
 * Exactly one RAW ref of the family, and it is exactly the accepted one.
 * Raw cardinality is enforced BEFORE any dedupe: two identical copies of the
 * accepted ref are an ambiguous duplicate lineage and fail closed.
 */
function exactlyOne(
  list: readonly string[], expected: string, label: string,
): string | null {
  if (list.length === 0) return `missing_${label}`;
  if (list.length !== 1) return `ambiguous_${label}`;
  return list[0] === expected ? null : `unexpected_${label}`;
}

export interface LineageCheck {
  agent_id: RonAgentId;
  ok: boolean;
  reasons: string[];
}

export function checkAcceptedLineage(e: EvidenceEnvelopeV1): LineageCheck {
  const out: string[] = [];
  const add = (r: string | null) => { if (r) out.push(r); };

  switch (e.agent_id) {
    case "session_market_structure":
      add(exactlyOne(
        scoped(e, "spec", ACCEPTED_SESSION_STRUCTURE_SPEC_ID),
        `spec:${ACCEPTED_SESSION_STRUCTURE_SPEC_ID}:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`,
        "session_structure_v2_spec_ref",
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
        `spec:${ACCEPTED_PATTERN_SPEC_ID}:v2:${ACCEPTED_PATTERN_V2_HASH}`,
        "pattern_context_v2_spec_ref",
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
        `spec:${ACCEPTED_CROSS_ASSET_SPEC_ID}:v2:${ACCEPTED_CROSS_ASSET_V2_HASH}`,
        "cross_asset_v2_spec_ref",
      ));
      add(exactlyOne(
        scoped(e, "base_spec", ACCEPTED_CROSS_ASSET_SPEC_ID),
        `base_spec:${ACCEPTED_CROSS_ASSET_SPEC_ID}:v1:${ACCEPTED_CROSS_ASSET_V1_BASE_HASH}`,
        "cross_asset_v1_base_spec_ref",
      ));
      break;

    case "macro_news_geopolitics": {
      // The frozen Macro V2 producer emits BOTH lineage refs under `spec:` (V2 first,
      // then the inherited V1 ref carried through from the V1 base envelope).
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
      // RAW cardinality: exactly two refs total, exactly one accepted V2 and one
      // accepted V1. Identical duplicates, extras or wrong same-lineage refs fail.
      if (specRefs.length !== 2 || v2Count !== 1 || v1Count !== 1) {
        out.push("ambiguous_macro_spec_lineage");
      }
      add(exactlyOne(
        scoped(e, "classification", ACCEPTED_SESSION_STRUCTURE_SPEC_ID),
        `classification:${ACCEPTED_SESSION_STRUCTURE_SPEC_ID}:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`,
        "macro_classification_session_v2_ref",
      ));
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

export type OpportunityRiskInputV2 = OpportunityRiskInputV1;

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

export async function buildOpportunityRiskEvidenceV2(
  input: OpportunityRiskInputV2,
): Promise<EvidenceEnvelopeV1> {
  const base = await buildOpportunityRiskEvidenceV1(input);
  const at = base.as_of;
  const specHashV2 = await opportunityRiskSpecHashV2();

  const provenance_refs = [
    `spec:${OPPORTUNITY_RISK_SPEC_V2.spec_id}:v${OPPORTUNITY_RISK_SPEC_V2.spec_version}:${specHashV2}`,
    `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v${OPPORTUNITY_RISK_SPEC_V1.spec_version}:${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`,
    ...base.provenance_refs.filter(
      (p) => !p.startsWith(`spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:`),
    ),
  ];

  const baseState = base.observations.find((o) => o.key === "readiness_state")?.value_text ?? "";
  const limitations = [
    ...base.uncertainty.limitations,
    "V2 adds an evidence COMPATIBILITY contract only: readiness logic, thresholds, TTLs " +
    "and the zero-geometry safety contract are inherited unchanged from V1",
  ];

  // Precedence guard: states decided before compatibility is assessable are returned
  // exactly as V1 decided them, so a missing required agent is never reclassified.
  if (PRE_COMPATIBILITY_STATES.includes(baseState as OpportunityReadinessState)) {
    return {
      ...base,
      provenance_refs,
      uncertainty: { level: "unquantified", limitations },
      observations: [
        ...base.observations,
        state("evidence_compatibility_contract", OPPORTUNITY_COMPATIBILITY_CONTRACT_ID, at),
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
    state("evidence_compatibility_contract", OPPORTUNITY_COMPATIBILITY_CONTRACT_ID, at),
  ];
  const failures: string[] = [];
  let acceptedRequired = 0;
  let acceptedOptional = 0;

  for (const id of gated) {
    const env = [...present.values()].find((e) => e.agent_id === id);
    if (!env) continue;
    const check = checkAcceptedLineage(env);
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
