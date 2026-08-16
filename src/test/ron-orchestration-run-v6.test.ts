/**
 * RON_ORCHESTRATION_OPPORTUNITY_RISK_COMPATIBILITY_V6 — pure-module tests.
 *
 * Proves: V1-V5 plan hashes, plans and run identities are unchanged; V6 is deterministic
 * and version-distinct; the ONLY V6 plan delta from V5 is the opportunity_risk spec pin 2;
 * only V6 acquires that pin; the Opportunity V2 spec + V1 base lineage is enforced
 * exactly; the anchor binding is exact; the readiness contract is validated GENERALLY
 * (no single admissible state is hardcoded); the genuine current-state batch yields
 * `blocked_not_calibrated` with zero promotions and does not change orchestrator
 * direction; Falconer never becomes a compatibility gate or authority; the earlier gates
 * are untouched; the final collection is exactly seven sealed envelopes with the
 * Opportunity hash bound once; and nothing about probability, geometry, execution or
 * persistence expands. No network, no database, no probability, no execution.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, sealEvidence, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  canonicalOrder, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";
import {
  ORCHESTRATION_RUN_PLAN_V1, OrchestrationRunError,
  assertCollectionComplete, deriveRunIds, orchestrationRunPlanHash,
} from "../../supabase/functions/_shared/ron-orchestration-run.ts";
import {
  ORCHESTRATION_RUN_PLAN_V2, deriveRunIdsV2, orchestrationRunPlanHashV2,
} from "../../supabase/functions/_shared/ron-orchestration-run-v2.ts";
import {
  ORCHESTRATION_RUN_PLAN_V3, deriveRunIdsV3, orchestrationRunPlanHashV3,
} from "../../supabase/functions/_shared/ron-orchestration-run-v3.ts";
import {
  ORCHESTRATION_RUN_PLAN_V4, deriveRunIdsV4, orchestrationRunPlanHashV4,
} from "../../supabase/functions/_shared/ron-orchestration-run-v4.ts";
import {
  ORCHESTRATION_RUN_PLAN_V5, ORCHESTRATION_RUN_SPEC_V5, deriveRunIdsV5,
  orchestrationRunPlanHashV5,
} from "../../supabase/functions/_shared/ron-orchestration-run-v5.ts";
import {
  OPPORTUNITY_RISK_AGENT, OPPORTUNITY_RISK_SPEC_VERSION_V6,
  OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED, OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED,
  ORCHESTRATION_RUN_PLAN_AGENTS_V6, ORCHESTRATION_RUN_PLAN_V6, ORCHESTRATION_RUN_SPEC_V6,
  RON_ORCHESTRATION_RUN_VERSION_V6, assertOpportunityRiskBinding,
  assertOpportunityRiskV2Sealed, deriveRunIdV6, deriveRunIdsV6,
  opportunityRiskBaseSpecRefV1, opportunityRiskSpecRefV2, orchestrationRunPlanHashV6,
} from "../../supabase/functions/_shared/ron-orchestration-run-v6.ts";
import {
  OPPORTUNITY_READINESS_STATES, buildOpportunityRiskEvidenceV1, opportunityRiskSpecHash,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec.ts";
import {
  buildOpportunityRiskEvidenceV2, opportunityRiskSpecHashV2,
  ACCEPTED_SESSION_STRUCTURE_V2_HASH, ACCEPTED_CALIBRATION_V2_HASH,
  ACCEPTED_CALIBRATION_V1_BASE_HASH, ACCEPTED_PATTERN_V2_HASH,
  ACCEPTED_CROSS_ASSET_V2_HASH, ACCEPTED_CROSS_ASSET_V1_BASE_HASH,
  ACCEPTED_MACRO_V2_HASH, ACCEPTED_MACRO_V1_HASH,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec-v2.ts";

const TRACE = "ron_run_v6_fixture_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const ANCHOR_MS = Date.parse(AS_OF);
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };
const minus = (m: number) => new Date(ANCHOR_MS - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Frozen plan-hash expectations captured BEFORE this slice. */
const FROZEN_V1_PLAN_HASH = await orchestrationRunPlanHash();
const FROZEN_V2_PLAN_HASH = await orchestrationRunPlanHashV2();
const FROZEN_V3_PLAN_HASH = await orchestrationRunPlanHashV3();
const FROZEN_V4_PLAN_HASH = await orchestrationRunPlanHashV4();
const FROZEN_V5_PLAN_HASH = await orchestrationRunPlanHashV5();

const SESSION_V2_REF = `spec:ron_session_market_structure:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`;
const CAL_V2_REF = `spec:ron_calibration_model_validation:v2:${ACCEPTED_CALIBRATION_V2_HASH}`;
const CAL_BASE_REF = `base_spec:ron_calibration_model_validation:v1:${ACCEPTED_CALIBRATION_V1_BASE_HASH}`;
const PATTERN_V2_REF = `spec:ron_pattern_context:v2:${ACCEPTED_PATTERN_V2_HASH}`;
const PATTERN_SEG_REF = `segmentation:ron_session_market_structure:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`;
const CROSS_V2_REF = `spec:ron_cross_asset_correlation:v2:${ACCEPTED_CROSS_ASSET_V2_HASH}`;
const CROSS_BASE_REF = `base_spec:ron_cross_asset_correlation:v1:${ACCEPTED_CROSS_ASSET_V1_BASE_HASH}`;
const MACRO_V2_REF = `spec:ron_macro_news_geopolitics:v2:${ACCEPTED_MACRO_V2_HASH}`;
const MACRO_V1_REF = `spec:ron_macro_news_geopolitics:v1:${ACCEPTED_MACRO_V1_HASH}`;
const MACRO_CLASS_REF = `classification:ron_session_market_structure:v2:${ACCEPTED_SESSION_STRUCTURE_V2_HASH}`;

function raw(agent_id: RonAgentId, ageMinutes: number, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  const at = minus(ageMinutes);
  return {
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id,
    agent_version: agentSpec(agent_id)!.agent_version,
    run_id: `fixture_${agent_id}`,
    trace_id: TRACE,
    instrument: "XAUUSD",
    timeframe: "15m",
    as_of: at,
    source_timestamps: { reference_instant: at },
    observations: [{ key: "fixture_marker", kind: "state", value_text: agent_id, at }],
    provenance_refs: [`fixture:${agent_id}`],
    data_health: { status: "healthy", freshness_minutes: ageMinutes, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["synthetic deterministic fixture"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    direction: "neutral",
    recommendation: "context_only",
    ...over,
  };
}

/** Accepted, current-state specialist batch exactly as Orchestration V5 collects it. */
const session = () => sealEvidence(raw("session_market_structure", 15, {
  direction: "short", provenance_refs: [SESSION_V2_REF, "quality_version:2"],
}));
const calibration = () => sealEvidence(raw("calibration_model_validation", 271, {
  recommendation: "research_only",
  observations: [
    { key: "validation_state", kind: "state", value_text: "accepted_research_only", at: minus(271) },
    { key: "publication_state", kind: "state", value_text: "locked_not_calibrated_for_production", at: minus(271) },
    { key: "promoted_state_variable_count", kind: "measurement", value_num: 0, at: minus(271) },
  ],
  provenance_refs: [CAL_V2_REF, CAL_BASE_REF],
}));
const pattern = () => sealEvidence(raw("pattern_context", 15, {
  provenance_refs: [PATTERN_V2_REF, PATTERN_SEG_REF],
}));
const crossAsset = () => sealEvidence(raw("cross_asset_correlation", 15, {
  provenance_refs: [CROSS_V2_REF, CROSS_BASE_REF],
}));
const macro = () => sealEvidence(raw("macro_news_geopolitics", 41, {
  provenance_refs: [MACRO_V2_REF, MACRO_CLASS_REF, MACRO_V1_REF],
}));
const falconer = () => sealEvidence(raw("falconer_signal_source", 15, {
  provenance_refs: ["fixture:falconer_signal_source"],
}));

/** The six sealed envelopes phase 2 hands to Opportunity/Risk in a real V6 run. */
async function preOpportunityBatch(): Promise<EvidenceEnvelopeV1[]> {
  return canonicalOrder([
    await session(), await calibration(), await pattern(),
    await crossAsset(), await macro(), await falconer(),
  ]);
}

async function genuineOpportunityV2(
  evidence?: EvidenceEnvelopeV1[],
): Promise<EvidenceEnvelopeV1> {
  return sealEvidence(await buildOpportunityRiskEvidenceV2({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: AS_OF,
    evidence: evidence ?? await preOpportunityBatch(),
    promoted_state_variables: PROMOTED_STATE_VARIABLES,
    run_id: await deriveRunIdV6(TRACE, AS_OF, OPPORTUNITY_RISK_AGENT),
    trace_id: TRACE,
  }));
}

const readiness = (e: EvidenceEnvelopeV1) =>
  e.observations.find((o) => o.key === "readiness_state")?.value_text;

async function reject(candidate: EvidenceEnvelopeV1, match: RegExp): Promise<void> {
  await expect(assertOpportunityRiskV2Sealed(candidate, CTX)).rejects.toThrow(OrchestrationRunError);
  await expect(assertOpportunityRiskV2Sealed(candidate, CTX)).rejects.toThrow(match);
}

/* -------------------------------------------------- frozen V1..V5 invariants */

describe("frozen orchestration V1-V5 invariants", () => {
  it("plan hashes are unchanged by the V6 slice", async () => {
    expect(await orchestrationRunPlanHash()).toBe(FROZEN_V1_PLAN_HASH);
    expect(await orchestrationRunPlanHashV2()).toBe(FROZEN_V2_PLAN_HASH);
    expect(await orchestrationRunPlanHashV3()).toBe(FROZEN_V3_PLAN_HASH);
    expect(await orchestrationRunPlanHashV4()).toBe(FROZEN_V4_PLAN_HASH);
    expect(await orchestrationRunPlanHashV5()).toBe(FROZEN_V5_PLAN_HASH);
    expect(FROZEN_V4_PLAN_HASH)
      .toBe("6046729887d33cdcc7360cb1e770232d8884f396bda49c30635b73fb2b7473f1");
    expect(FROZEN_V5_PLAN_HASH)
      .toBe("d343f7660487c955fa28a198efe11662d77fb036b704c4a4fa2d61d26ac77242");
  });

  it("V1-V5 run identities are unchanged and V6 is domain-distinct", async () => {
    const rs = await Promise.all([
      deriveRunIds(TRACE, AS_OF), deriveRunIdsV2(TRACE, AS_OF), deriveRunIdsV3(TRACE, AS_OF),
      deriveRunIdsV4(TRACE, AS_OF), deriveRunIdsV5(TRACE, AS_OF), deriveRunIdsV6(TRACE, AS_OF),
    ]);
    expect(new Set(rs.map((r) => r[OPPORTUNITY_RISK_AGENT])).size).toBe(6);
    expect(rs[0]).toEqual(await deriveRunIds(TRACE, AS_OF));
    expect(rs[4]).toEqual(await deriveRunIdsV5(TRACE, AS_OF));
    expect(rs[5][OPPORTUNITY_RISK_AGENT])
      .toBe(await deriveRunIdV6(TRACE, AS_OF, OPPORTUNITY_RISK_AGENT));
    expect(ORCHESTRATION_RUN_SPEC_V6.run_id_domain).toBe("ron_orch_run_v6");
    expect(ORCHESTRATION_RUN_SPEC_V5.run_id_domain).toBe("ron_orch_run_v5");
  });

  it("V5 spec object is not mutated by V6", () => {
    expect(ORCHESTRATION_RUN_SPEC_V5.spec_version_pins).not.toHaveProperty("opportunity_risk");
    for (const plan of [ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_PLAN_V3,
      ORCHESTRATION_RUN_PLAN_V4, ORCHESTRATION_RUN_PLAN_V5]) {
      expect(plan.find((p) => p.agent_id === OPPORTUNITY_RISK_AGENT)!.spec_version_pin).toBeNull();
    }
  });
});

/* ------------------------------------------------------------ the V6 plan */

describe("orchestration run V6 plan", () => {
  it("is deterministic and version-distinct", async () => {
    const h = await orchestrationRunPlanHashV6();
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await orchestrationRunPlanHashV6());
    expect(h).not.toBe(FROZEN_V5_PLAN_HASH);
    expect(RON_ORCHESTRATION_RUN_VERSION_V6).toBe(6);
    expect(ORCHESTRATION_RUN_SPEC_V6.supersedes_run_version).toBe(5);
  });

  it("keeps the same seven agents, order, phases, authority and subject scope", () => {
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V6).toEqual(ORCHESTRATION_RUN_PLAN_V5.map((p) => p.agent_id));
    expect(ORCHESTRATION_RUN_PLAN_V6).toHaveLength(7);
    ORCHESTRATION_RUN_PLAN_V6.forEach((p, i) => {
      const q = ORCHESTRATION_RUN_PLAN_V5[i];
      expect(p.function_name).toBe(q.function_name);
      expect(p.phase).toBe(q.phase);
      expect(p.anchor_param).toBe(q.anchor_param);
      expect(p.subject_scope).toBe(q.subject_scope);
      expect(p.requires_evidence_batch).toBe(q.requires_evidence_batch);
      expect(p.depends_on_sealed_evidence).toEqual(q.depends_on_sealed_evidence);
      expect(p.dependency_param).toBe(q.dependency_param);
    });
  });

  it("the ONLY plan delta from V5 is the opportunity_risk spec pin 2", () => {
    const deltas = ORCHESTRATION_RUN_PLAN_V6
      .filter((p, i) => p.spec_version_pin !== ORCHESTRATION_RUN_PLAN_V5[i].spec_version_pin)
      .map((p) => [p.agent_id, p.spec_version_pin]);
    expect(deltas).toEqual([[OPPORTUNITY_RISK_AGENT, 2]]);
    expect(ORCHESTRATION_RUN_SPEC_V6.spec_version_pins).toEqual({
      ...ORCHESTRATION_RUN_SPEC_V5.spec_version_pins, opportunity_risk: 2,
    });
    expect(OPPORTUNITY_RISK_SPEC_VERSION_V6).toBe(2);
    expect(ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context.requested_exactly_once).toBe(true);
  });

  it("preserves every V5 pin and never pins Falconer", () => {
    expect(ORCHESTRATION_RUN_SPEC_V6.spec_version_pins).toMatchObject({
      session_market_structure: 2, pattern_context: 2, calibration_model_validation: 2,
      cross_asset_correlation: 2, macro_news_geopolitics: 2,
    });
    expect(ORCHESTRATION_RUN_PLAN_V6.find((p) => p.agent_id === "falconer_signal_source")!
      .spec_version_pin).toBeNull();
  });

  it("adds no probability, execution, promotion or persistence authority", () => {
    expect(ORCHESTRATION_RUN_SPEC_V6.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V6.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V6.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V6.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V6.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V6.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V6.dashboard_wiring).toBe(false);
    const o = ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context;
    expect(o.readiness_gate_only).toBe(true);
    expect(o.specialists_rerun).toBe(false);
    expect(o.database_queried_by_orchestration).toBe(false);
    expect(o.authority_model_changed).toBe(false);
    expect(o.falconer_is_compatibility_gate).toBe(false);
    expect(o.falconer_is_authority).toBe(false);
    expect(o.optional_lineage_confers_authority).toBe(false);
    expect(o.probability_published).toBe(false);
    expect(o.trade_geometry_emitted).toBe(false);
    expect(o.promotion_conferred).toBe(false);
  });

  it("declares admissible readiness states generally, not a single hardcoded state", () => {
    expect(ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context.admissible_readiness_states)
      .toEqual(OPPORTUNITY_READINESS_STATES);
    expect(ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context.admissible_readiness_states.length)
      .toBeGreaterThan(1);
  });
});

/* -------------------------------------------------- pinned opportunity hashes */

describe("opportunity/risk spec hashes", () => {
  it("pins the exact frozen V2 and V1 hashes", async () => {
    expect(await opportunityRiskSpecHashV2()).toBe(OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED);
    expect(OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED)
      .toBe("66065e535c2b3580f346858684ba0f2fa2e4729d2b37f8c96235b9d37cc55656");
    expect(await opportunityRiskSpecHash()).toBe(OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED);
    expect(OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED)
      .toBe("cb547444826d7a49479d869ad558ee7344733140f0ad0ae0a4d3c8f71461173a");
    expect(opportunityRiskSpecRefV2())
      .toBe(`spec:ron_opportunity_risk_foundation:v2:${OPPORTUNITY_RISK_SPEC_V2_HASH_PINNED}`);
    expect(opportunityRiskBaseSpecRefV1())
      .toBe(`base_spec:ron_opportunity_risk_foundation:v1:${OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED}`);
  });
});

/* ------------------------------------------------------------- the V6 gate */

describe("opportunity/risk V2 acceptance gate", () => {
  it("accepts the genuine sealed V2 readiness envelope", async () => {
    const s = await genuineOpportunityV2();
    expect(await assertOpportunityRiskV2Sealed(s, CTX)).toBe(s.evidence_hash);
  });

  it("rejects absence, malformed input and the wrong agent", async () => {
    await expect(assertOpportunityRiskV2Sealed(null, CTX)).rejects.toThrow(/absent_or_malformed/);
    await expect(assertOpportunityRiskV2Sealed([], CTX)).rejects.toThrow(/absent_or_malformed/);
    const s = await genuineOpportunityV2();
    await reject({ ...s, agent_id: "pattern_context", evidence_hash: s.evidence_hash }, /wrong_agent/);
    await reject({ ...s, agent_version: 9 }, /wrong_agent_version/);
  });

  it("rejects an unsealed or hash-inconsistent envelope", async () => {
    const s = await genuineOpportunityV2();
    await reject({ ...s, evidence_hash: undefined } as EvidenceEnvelopeV1, /unsealed/);
    await reject({ ...s, evidence_hash: "0".repeat(64) }, /hash_mismatch/);
  });

  it("rejects scope mismatch", async () => {
    const s = await genuineOpportunityV2();
    await reject({ ...s, trace_id: "other" }, /trace_mismatch/);
    await reject({ ...s, instrument: "NAS100" }, /instrument_mismatch/);
    await reject({ ...s, timeframe: "1h" }, /timeframe_mismatch/);
  });

  it("binds the anchor exactly: earlier, later and invalid as_of all fail", async () => {
    const s = await genuineOpportunityV2();
    expect(Date.parse(s.as_of)).toBe(ANCHOR_MS);
    await reject({ ...s, as_of: minus(15) }, /as_of_not_evaluation_anchor/);
    await reject(
      { ...s, as_of: new Date(ANCHOR_MS + 60_000).toISOString() },
      /as_of_after_evaluation_anchor/,
    );
    await reject({ ...s, as_of: "not-a-date" }, /as_of_unparseable|invalid_envelope/);
  });

  it("enforces exactly one accepted V2 spec ref and one V1 base ref", async () => {
    const s = await genuineOpportunityV2();
    const base = s.provenance_refs;
    const without = (r: string) => base.filter((p) => p !== r);
    const re = async (refs: string[]) =>
      sealEvidence({ ...s, evidence_hash: undefined, provenance_refs: refs } as EvidenceEnvelopeV1);

    await reject(await re(without(opportunityRiskSpecRefV2())), /spec_v2_ref_missing/);
    await reject(await re(without(opportunityRiskBaseSpecRefV1())), /base_spec_v1_ref_missing/);
    // V1-only lineage (an unpinned V1 response) fails closed.
    await reject(
      await re([`spec:ron_opportunity_risk_foundation:v1:${OPPORTUNITY_RISK_BASE_SPEC_V1_HASH_PINNED}`]),
      /spec_v2_ref_invalid|base_spec_v1_ref_missing/,
    );
    // Wrong hash.
    await reject(
      await re([...without(opportunityRiskSpecRefV2()),
        `spec:ron_opportunity_risk_foundation:v2:${"a".repeat(64)}`]),
      /spec_v2_ref_invalid/,
    );
    await reject(
      await re([...without(opportunityRiskBaseSpecRefV1()),
        `base_spec:ron_opportunity_risk_foundation:v1:${"b".repeat(64)}`]),
      /base_spec_v1_ref_invalid/,
    );
    // Duplicate and extra lineage refs.
    await reject(await re([...base, opportunityRiskSpecRefV2()]), /spec_ref_count:2/);
    await reject(await re([...base, opportunityRiskBaseSpecRefV1()]), /base_spec_ref_count:2/);
    await reject(
      await re([...base, `spec:ron_opportunity_risk_foundation:v3:${"c".repeat(64)}`]),
      /spec_ref_count:2/,
    );
  });

  it("rejects non-contextual direction or recommendation", async () => {
    const s = await genuineOpportunityV2();
    await reject({ ...s, direction: "bullish" }, /direction_not_contextual/);
    await reject({ ...s, recommendation: "execute" as never }, /recommendation_not_contextual/);
  });

  it("validates readiness GENERALLY and rejects an unknown state", async () => {
    const s = await genuineOpportunityV2();
    const swap = (value_text: string) => ({
      ...s,
      observations: s.observations.map((o) => o.key === "readiness_state"
        ? { ...o, value_text } : o),
    });
    // Every frozen admissible state is accepted by the gate's state check.
    for (const st of OPPORTUNITY_READINESS_STATES) {
      const cand = await sealEvidence({
        ...swap(st), evidence_hash: undefined,
      } as EvidenceEnvelopeV1);
      await expect(assertOpportunityRiskV2Sealed(cand, CTX)).resolves.toBe(cand.evidence_hash);
    }
    await reject(
      await sealEvidence({ ...swap("ready_to_trade"), evidence_hash: undefined } as EvidenceEnvelopeV1),
      /readiness_state_unknown/,
    );
  });

  it("rejects a construction claim without the ready state", async () => {
    const s = await genuineOpportunityV2();
    const cand = await sealEvidence({
      ...s,
      evidence_hash: undefined,
      observations: s.observations.map((o) => o.key === "construction_allowed"
        ? { ...o, value_text: "true" } : o),
    } as EvidenceEnvelopeV1);
    await reject(cand, /construction_claimed_without_ready_state/);
  });

  it("rejects probability, geometry and execution surfaces", async () => {
    const s = await genuineOpportunityV2();
    await reject(
      { ...s, numeric_probability: 0.61 } as unknown as EvidenceEnvelopeV1,
      /unexpected_field:numeric_probability/,
    );
    await reject(
      { ...s, execution_allowed: true } as unknown as EvidenceEnvelopeV1,
      /unexpected_field:execution_allowed/,
    );
    for (const key of ["entry_price", "stop_loss", "take_profit_target", "risk_reward",
      "lot_size", "confidence", "edge_score"]) {
      const draft = {
        ...s, evidence_hash: undefined,
        observations: [...s.observations, { key, kind: "measurement", value_num: 1, at: AS_OF }],
      } as EvidenceEnvelopeV1;
      // Some keys are already refused by the base Evidence V1 contract itself; the rest
      // must be refused by the V6 gate. Either way the surface never reaches the run.
      if (validateEvidence(draft).length) continue;
      await reject(await sealEvidence(draft), /forbidden_observation/);
    }
  });
});

/* ---------------------------------------- genuine current-state regression */

describe("genuine V6 opportunity/risk path under the current accepted state", () => {
  it("passes compatibility yet still returns blocked_not_calibrated with zero promotions", async () => {
    const batch = await preOpportunityBatch();
    expect(batch).toHaveLength(6);
    const s = await genuineOpportunityV2(batch);
    expect(await assertOpportunityRiskV2Sealed(s, CTX)).toBe(s.evidence_hash);
    expect(readiness(s)).toBe("blocked_not_calibrated");
    expect(s.observations.find((o) => o.key === "construction_allowed")?.value_text).toBe("false");
    expect(PROMOTED_STATE_VARIABLES).toHaveLength(0);
    expect(s.observations.find((o) => o.key === "promoted_state_variable_count")?.value_num).toBe(0);
    expect(s.observations.find((o) => o.key === "evidence_compatibility_contract")?.value_text)
      .toBe("accepted_specialist_lineages_v2");
    // Every present compatibility-gated specialist lineage is accepted, none incompatible.
    expect(s.observations.filter((o) => o.key === "incompatible_specialist_lineage")).toHaveLength(0);
    expect(s.observations.find((o) => o.key === "accepted_required_lineages")?.value_num).toBe(2);
    expect(s.observations.find((o) => o.key === "accepted_optional_lineages")?.value_num).toBe(3);
    expect(validateEvidence(s)).toEqual([]);
  });

  it("Falconer is neither a compatibility gate nor an authority", async () => {
    const withF = await preOpportunityBatch();
    const withoutF = withF.filter((e) => e.agent_id !== "falconer_signal_source");
    const a = await genuineOpportunityV2(withF);
    const b = await genuineOpportunityV2(withoutF);
    expect(readiness(a)).toBe(readiness(b));
    expect(a.observations.filter((o) => o.key === "accepted_specialist_lineage")
      .map((o) => o.value_text)).not.toContain("falconer_signal_source");
    // A Falconer envelope with NO accepted lineage refs never blocks compatibility.
    expect(a.status).toBe("supported");
  });

  it("does not change the deterministic orchestrator direction", async () => {
    const batch = await preOpportunityBatch();
    const v1Opp = await sealEvidence(await buildOpportunityRiskEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: AS_OF, evidence: batch,
      promoted_state_variables: PROMOTED_STATE_VARIABLES,
      run_id: "run_v1_compare", trace_id: TRACE,
    }));
    const v2Opp = await genuineOpportunityV2(batch);
    const withV1 = canonicalOrder([...batch, v1Opp]);
    const withV2 = canonicalOrder([...batch, v2Opp]);
    const a = await synthesizeDecision(withV1, CTX);
    const b = await synthesizeDecision(withV2, CTX);
    expect(b.decision.direction).toBe(a.decision.direction);
    expect(b.decision.numeric_probability ?? null).toBeNull();
    expect(b.decision.execution_path).toBe("signal_only");
  });

  it("replays deterministically", async () => {
    const batch = await preOpportunityBatch();
    const a = await genuineOpportunityV2(batch);
    const b = await genuineOpportunityV2(batch);
    expect(a.evidence_hash).toBe(b.evidence_hash);
  });
});

/* ------------------------------------------------- final-batch binding */

describe("final seven-agent collection", () => {
  it("binds the accepted opportunity hash to exactly one final envelope", async () => {
    const batch = await preOpportunityBatch();
    const opp = await genuineOpportunityV2(batch);
    const sealed = canonicalOrder([...batch, opp]);
    assertCollectionComplete(sealed, CTX);
    expect(sealed).toHaveLength(7);
    expect(sealed.map((e) => e.agent_id).sort())
      .toEqual([...ORCHESTRATION_RUN_PLAN_V1.map((p) => p.agent_id)].sort());
    const accepted = opp.evidence_hash!;
    expect(() => assertOpportunityRiskBinding(sealed, accepted)).not.toThrow();
    expect(() => assertOpportunityRiskBinding(sealed, "0".repeat(64)))
      .toThrow(/binding_hash_mismatch/);
    expect(() => assertOpportunityRiskBinding(batch, accepted)).toThrow(/binding_count:0/);
    expect(() => assertOpportunityRiskBinding([...sealed, opp], accepted))
      .toThrow(/binding_count:2/);
  });
});

/* -------------------------------------------------------- endpoint wiring */

const ENDPOINT = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");

describe("orchestration endpoint wiring", () => {
  it("accepts explicit version 6 while the DEFAULT stays version 2", () => {
    expect(ENDPOINT).toMatch(/\[1, 2, 3, 4, 5, 6\]\.includes\(requestedRunVersion\)/);
    expect(ENDPOINT).toMatch(/body\.orchestration_run_version == null\s*\n?\s*\?\s*RON_ORCHESTRATION_RUN_VERSION_V2/);
    expect(ENDPOINT).toContain("const isV6 = requestedRunVersion === 6;");
    expect(ENDPOINT).toContain("const isV5 = requestedRunVersion === 5 || isV6;");
  });

  it("requests the Opportunity V2 pin through the single generic pin send", () => {
    const pinSends = ENDPOINT.match(/payload\.spec_version = v2entry\.spec_version_pin/g) ?? [];
    expect(pinSends).toHaveLength(1);
    const gateCalls = ENDPOINT.match(/assertOpportunityRiskV2Sealed\(/g) ?? [];
    expect(gateCalls).toHaveLength(1);
  });

  it("keeps V6-only summary fields and every earlier gate intact", () => {
    expect(ENDPOINT).toContain("opportunity_risk_spec_version: 2");
    expect(ENDPOINT).toContain("assertOpportunityRiskBinding(sealed, opportunityRiskHash)");
    expect(ENDPOINT).toContain("assertMacroContextBinding(sealed, macroContextHash)");
    expect(ENDPOINT).toContain("assertCrossAssetContextBinding(sealed, crossAssetContextHash)");
    expect(ENDPOINT).toContain("assertCalibrationContextBinding(sealed, calibrationContextHash)");
    expect(ENDPOINT).toContain("assertPatternDependencyBinding(sealed, sessionDependencyHash)");
    expect(ENDPOINT).toContain("numeric_probability: null");
    expect(ENDPOINT).toContain("execution_allowed: false");
  });
});
