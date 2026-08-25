/**
 * RON — Opportunity / Risk FOUNDATION spec V4: ARTIFACT-CLOCK TTL CORRECTION.
 *
 * Implementation marker `GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1`.
 *
 * V4 is forward-only. V1, V2 and V3 stay BYTE-IDENTICAL and fully replayable: their spec
 * objects, hashes and producers are imported, never mutated.
 *
 * THE ONLY DELTA from V3: the required-evidence freshness gate is evaluated under the
 * registered TTL policy v2 instead of v1. Policy v2 changes no market-freshness budget; it
 * exempts ARTIFACT-CLOCK agents only. `calibration_model_validation` reports the validity
 * of a SEALED accepted calibration artifact whose `as_of` is the artifact's immutable
 * source instant and can never advance with market time, so a market-clock TTL was a
 * category error that permanently blockaded the readiness gate.
 *
 * Nothing else moves:
 *   - the accepted specialist lineage table is inherited from V3 unchanged,
 *   - readiness logic, precedence, thresholds and the calibration promotion gate are
 *     inherited from the frozen V1 producer unchanged,
 *   - the artifact's own `status` / `data_health` still bind exactly as before, so an
 *     unhealthy or blocked calibration envelope still fails closed,
 *   - still a READINESS GATE: no direction beyond neutral/unknown, no geometry, no
 *     probability, no execution, no persistence.
 */
import {
  EVIDENCE_TTL_POLICY_V2, hashCanonical, type EvidenceEnvelopeV1,
} from "./ron-agent-contracts.ts";
import {
  OpportunityRiskContractError, OPPORTUNITY_RISK_SPEC_V1,
} from "./ron-opportunity-risk-spec.ts";
import { OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED } from "./ron-opportunity-risk-spec-v2.ts";
import {
  buildOpportunityRiskEvidenceV3, OPPORTUNITY_RISK_SPEC_V3,
  type OpportunityRiskInputV3,
} from "./ron-opportunity-risk-spec-v3.ts";

export { OpportunityRiskContractError };

/** FULL accepted Opportunity/Risk Compatibility Spec V3 hash (never re-derived here). */
export const OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED =
  "15273f91d04b597f1cd03bd169ae784a1b58b3470f394a74aec8d174455fc8f9";

export const OPPORTUNITY_RISK_SPEC_V4 = {
  ...OPPORTUNITY_RISK_SPEC_V3,
  spec_version: 4,
  supersedes_spec_version: OPPORTUNITY_RISK_SPEC_V3.spec_version,
  base_spec_id: OPPORTUNITY_RISK_SPEC_V1.spec_id,
  base_spec_version: OPPORTUNITY_RISK_SPEC_V1.spec_version,
  base_spec_hash: OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED,
  inherited_compatibility_spec_version: OPPORTUNITY_RISK_SPEC_V3.spec_version,
  inherited_compatibility_spec_hash: OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED,

  readiness_logic: "inherited_unchanged_from_v1",

  ttl_contract: {
    ttl_policy_version: EVIDENCE_TTL_POLICY_V2.policy_version,
    supersedes_ttl_policy_version: EVIDENCE_TTL_POLICY_V2.supersedes_policy_version,
    market_clock_budgets_changed: false,
    artifact_clock_agents: EVIDENCE_TTL_POLICY_V2.artifact_clock_agents,
    artifact_clock_exempt_from_market_ttl: true,
    rationale:
      "a sealed calibration artifact's as_of is an immutable artifact instant, not a "
      + "market observation; market-clock staleness is not a meaningful statement about it",
    health_and_status_gates_unchanged: true,
    future_dated_evidence_gate_unchanged: true,
    anchor_rules_unchanged: true,
  },
} as const;

export function opportunityRiskSpecHashV4(): Promise<string> {
  return hashCanonical(OPPORTUNITY_RISK_SPEC_V4);
}

export type OpportunityRiskInputV4 = OpportunityRiskInputV3;

/**
 * V4 producer: the frozen V3 producer evaluated under TTL policy v2, re-sealed with the
 * V4 spec lineage ref. The V1 base ref is preserved so replay lineage stays intact.
 */
export async function buildOpportunityRiskEvidenceV4(
  input: OpportunityRiskInputV4,
): Promise<EvidenceEnvelopeV1> {
  const base = await buildOpportunityRiskEvidenceV3({
    ...input,
    ttl_policy_version: EVIDENCE_TTL_POLICY_V2.policy_version,
  });
  const specHashV4 = await opportunityRiskSpecHashV4();
  const at = base.as_of;

  const provenance_refs = [
    `spec:${OPPORTUNITY_RISK_SPEC_V4.spec_id}:v4:${specHashV4}`,
    `base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`,
    `inherited_spec:${OPPORTUNITY_RISK_SPEC_V3.spec_id}:v3:${OPPORTUNITY_RISK_SPEC_V3_HASH_PINNED}`,
    ...base.provenance_refs.filter(
      (p) => !p.startsWith(`spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v3:`)
        && !p.startsWith(`base_spec:${OPPORTUNITY_RISK_SPEC_V1.spec_id}:v1:`),
    ),
  ];

  return {
    ...base,
    provenance_refs,
    observations: [
      ...base.observations,
      {
        key: "ttl_policy_version", kind: "state",
        value_text: String(EVIDENCE_TTL_POLICY_V2.policy_version), at,
      },
      {
        key: "artifact_clock_ttl_exemption", kind: "state",
        value_text: EVIDENCE_TTL_POLICY_V2.artifact_clock_agents.join(","), at,
      },
    ],
    uncertainty: {
      level: base.uncertainty.level,
      limitations: [
        ...base.uncertainty.limitations,
        "V4 changes ONLY the TTL policy version: artifact-clock evidence "
        + "(calibration_model_validation) is exempt from the market-freshness budget "
        + "because its as_of is a sealed artifact instant; every market-clock budget, "
        + "health gate, future-dating gate and readiness rule is inherited unchanged",
      ],
    },
  };
}
