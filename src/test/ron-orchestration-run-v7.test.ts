/**
 * RON_ORCHESTRATION_FALCONER_SIGNAL_SOURCE_PIN_V7 — pure-module tests.
 *
 * Proves: V1-V6 plan hashes, plans and run identities are unchanged; V7 is deterministic
 * and version-distinct; the ONLY V7 plan delta from V6 is the falconer_signal_source spec
 * pin 1; only V7 acquires that pin; the accepted Falconer V1 spec lineage is enforced
 * exactly (missing / wrong / duplicate / extra same-lineage refs all fail closed); neither
 * canonical strategy SHA may enter Evidence V1; the ORIGINAL specialist seal is required
 * (no local reseal); Falconer stays non-authoritative and cannot change the orchestrator
 * decision; the final collection is exactly seven sealed envelopes with the Falconer hash
 * bound once; and nothing about probability, geometry, execution or persistence expands.
 * No network, no database, no probability, no execution.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, sealEvidence, evidenceHash,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  canonicalOrder, synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
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
  ORCHESTRATION_RUN_PLAN_V5, deriveRunIdsV5, orchestrationRunPlanHashV5,
} from "../../supabase/functions/_shared/ron-orchestration-run-v5.ts";
import {
  ORCHESTRATION_RUN_PLAN_V6, ORCHESTRATION_RUN_SPEC_V6, deriveRunIdsV6,
  orchestrationRunPlanHashV6,
} from "../../supabase/functions/_shared/ron-orchestration-run-v6.ts";
import {
  FALCONER_SIGNAL_SOURCE_AGENT, FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7,
  FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED,
  FALCONER_STRATEGY_PINE_SHA_FORBIDDEN, FALCONER_STRATEGY_TS_PORT_SHA_FORBIDDEN,
  ORCHESTRATION_RUN_PLAN_AGENTS_V7, ORCHESTRATION_RUN_PLAN_V7, ORCHESTRATION_RUN_SPEC_V7,
  RON_ORCHESTRATION_RUN_VERSION_V7, assertFalconerSignalSourceBinding,
  assertFalconerSignalSourceV1Sealed, deriveRunIdV7, deriveRunIdsV7,
  falconerSignalSourceSpecRefV1, orchestrationRunPlanHashV7,
} from "../../supabase/functions/_shared/ron-orchestration-run-v7.ts";
import {
  FALCONER_SIGNAL_SOURCE_SPEC_V1, buildFalconerSignalSourceEvidenceV1,
  falconerSignalSourceSpecHash,
} from "../../supabase/functions/_shared/ron-falconer-signal-source-spec.ts";

const TRACE = "ron_run_v7_fixture_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const ANCHOR_MS = Date.parse(AS_OF);
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };
const minus = (m: number) => new Date(ANCHOR_MS - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

const FROZEN_V1_PLAN_HASH = await orchestrationRunPlanHash();
const FROZEN_V2_PLAN_HASH = await orchestrationRunPlanHashV2();
const FROZEN_V3_PLAN_HASH = await orchestrationRunPlanHashV3();
const FROZEN_V4_PLAN_HASH = await orchestrationRunPlanHashV4();
const FROZEN_V5_PLAN_HASH = await orchestrationRunPlanHashV5();
const FROZEN_V6_PLAN_HASH = await orchestrationRunPlanHashV6();

/** GENUINE Falconer Evidence V1, produced by the frozen specialist producer. */
async function realFalconer(over: Partial<EvidenceEnvelopeV1> = {}): Promise<EvidenceEnvelopeV1> {
  const env = await buildFalconerSignalSourceEvidenceV1({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS,
    events: [{
      id: "evt_fixture_1", symbol: "XAUUSD", event_type: "stale_market_data",
      severity: "warning", created_at: ANCHOR_MS - 10 * 60_000,
    }],
    run_id: "fixture_falconer", trace_id: TRACE, signal_state_rows: null,
  });
  return await sealEvidence({ ...env, ...over } as EvidenceEnvelopeV1);
}

/** Reseal after mutating, so only the tested defect (never the seal) is under test. */
const reseal = async (e: EvidenceEnvelopeV1, over: Partial<EvidenceEnvelopeV1>) => {
  const { evidence_hash: _drop, ...rest } = { ...e, ...over } as EvidenceEnvelopeV1 & { evidence_hash?: string };
  return await sealEvidence(rest as EvidenceEnvelopeV1);
};

/** Hash WITHOUT validating, for defects the Evidence V1 validator itself already blocks. */
const unvalidated = async (e: EvidenceEnvelopeV1, over: Partial<EvidenceEnvelopeV1>) => {
  const { evidence_hash: _drop, ...rest } = { ...e, ...over } as EvidenceEnvelopeV1 & { evidence_hash?: string };
  return { ...rest, evidence_hash: await evidenceHash(rest as EvidenceEnvelopeV1) } as EvidenceEnvelopeV1;
};

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

async function sevenAgentBatch(falconer: EvidenceEnvelopeV1): Promise<EvidenceEnvelopeV1[]> {
  const others = await Promise.all([
    sealEvidence(raw("session_market_structure", 15, { direction: "short" })),
    sealEvidence(raw("calibration_model_validation", 271, { recommendation: "research_only" })),
    sealEvidence(raw("pattern_context", 15)),
    sealEvidence(raw("cross_asset_correlation", 15)),
    sealEvidence(raw("macro_news_geopolitics", 41)),
    sealEvidence(raw("opportunity_risk", 0, {
      as_of: AS_OF,
      observations: [
        { key: "readiness_state", kind: "state", value_text: "blocked_not_calibrated", at: AS_OF },
        { key: "construction_allowed", kind: "state", value_text: "false", at: AS_OF },
      ],
    })),
  ]);
  return canonicalOrder([...others, falconer]);
}

describe("V1-V6 remain frozen", () => {
  it("plan hashes are unchanged", async () => {
    expect(await orchestrationRunPlanHash()).toBe(FROZEN_V1_PLAN_HASH);
    expect(await orchestrationRunPlanHashV2()).toBe(FROZEN_V2_PLAN_HASH);
    expect(await orchestrationRunPlanHashV3()).toBe(FROZEN_V3_PLAN_HASH);
    expect(await orchestrationRunPlanHashV4()).toBe(FROZEN_V4_PLAN_HASH);
    expect(await orchestrationRunPlanHashV5()).toBe(FROZEN_V5_PLAN_HASH);
    expect(await orchestrationRunPlanHashV6()).toBe(FROZEN_V6_PLAN_HASH);
    expect(FROZEN_V6_PLAN_HASH).toBe(
      "b63797aed1b3d811cb9fd49f3f30572d0f0015d9020b38af9c06267735b722b0");
  });

  it("run identities for V1-V6 are unchanged and V7 is domain-separated", async () => {
    const ids = await Promise.all([
      deriveRunIds(TRACE, AS_OF), deriveRunIdsV2(TRACE, AS_OF), deriveRunIdsV3(TRACE, AS_OF),
      deriveRunIdsV4(TRACE, AS_OF), deriveRunIdsV5(TRACE, AS_OF), deriveRunIdsV6(TRACE, AS_OF),
    ]);
    const v7 = await deriveRunIdsV7(TRACE, AS_OF);
    for (const set of ids) {
      for (const agent of Object.keys(v7)) expect(v7[agent]).not.toBe(set[agent]);
    }
    expect(ORCHESTRATION_RUN_SPEC_V7.run_id_domain).toBe("ron_orch_run_v7");
    expect(await deriveRunIdV7(TRACE, AS_OF, "falconer_signal_source"))
      .toBe(v7.falconer_signal_source);
  });

  it("V6 keeps falconer unpinned; earlier plans are untouched", () => {
    for (const plan of [ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_PLAN_V3,
      ORCHESTRATION_RUN_PLAN_V4, ORCHESTRATION_RUN_PLAN_V5, ORCHESTRATION_RUN_PLAN_V6]) {
      const f = plan.find((p) => p.agent_id === "falconer_signal_source")!;
      expect(f.spec_version_pin).toBeNull();
    }
    expect(ORCHESTRATION_RUN_PLAN_V1.length).toBe(7);
  });
});

describe("V7 plan shape", () => {
  it("is deterministic and reproducible", async () => {
    expect(await orchestrationRunPlanHashV7()).toBe(await orchestrationRunPlanHashV7());
    expect(await orchestrationRunPlanHashV7()).not.toBe(FROZEN_V6_PLAN_HASH);
    expect(RON_ORCHESTRATION_RUN_VERSION_V7).toBe(7);
    expect(ORCHESTRATION_RUN_SPEC_V7.supersedes_run_version).toBe(6);
  });

  it("keeps exactly seven agents in the V6 order with identical phases/scope", () => {
    expect(ORCHESTRATION_RUN_PLAN_V7.length).toBe(7);
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V7)
      .toEqual(ORCHESTRATION_RUN_PLAN_V6.map((p) => p.agent_id));
    for (const [i, p] of ORCHESTRATION_RUN_PLAN_V7.entries()) {
      const v6 = ORCHESTRATION_RUN_PLAN_V6[i];
      const { spec_version_pin: _a, ...restV7 } = p;
      const { spec_version_pin: _b, ...restV6 } = v6;
      expect(restV7).toEqual(restV6);
    }
  });

  it("differs from V6 ONLY by the falconer spec_version_pin", () => {
    const diffs = ORCHESTRATION_RUN_PLAN_V7
      .filter((p, i) => p.spec_version_pin !== ORCHESTRATION_RUN_PLAN_V6[i].spec_version_pin)
      .map((p) => p.agent_id);
    expect(diffs).toEqual(["falconer_signal_source"]);
    expect(ORCHESTRATION_RUN_SPEC_V7.spec_version_pins).toEqual({
      ...ORCHESTRATION_RUN_SPEC_V6.spec_version_pins,
      falconer_signal_source: 1,
    });
    expect(FALCONER_SIGNAL_SOURCE_SPEC_VERSION_V7).toBe(1);
  });

  it("sends spec_version 1 to Falconer exactly once and pins no other agent anew", () => {
    const falconerEntries = ORCHESTRATION_RUN_PLAN_V7
      .filter((p) => p.agent_id === FALCONER_SIGNAL_SOURCE_AGENT);
    expect(falconerEntries.length).toBe(1);
    expect(falconerEntries[0].spec_version_pin).toBe(1);
    expect(falconerEntries[0].function_name).toBe("ron-agent-falconer-signal-source");
  });

  it("preserves the Session -> Pattern dependency and earlier gates verbatim", () => {
    const pattern = ORCHESTRATION_RUN_PLAN_V7.find((p) => p.agent_id === "pattern_context")!;
    expect(pattern.depends_on_sealed_evidence).toEqual(["session_market_structure"]);
    expect(pattern.dependency_param).toBe("session_evidence");
    expect(ORCHESTRATION_RUN_SPEC_V7.session_dependency_acceptance)
      .toEqual(ORCHESTRATION_RUN_SPEC_V6.session_dependency_acceptance);
    expect(ORCHESTRATION_RUN_SPEC_V7.calibration_context)
      .toEqual(ORCHESTRATION_RUN_SPEC_V6.calibration_context);
    expect(ORCHESTRATION_RUN_SPEC_V7.cross_asset_context)
      .toEqual(ORCHESTRATION_RUN_SPEC_V6.cross_asset_context);
    expect(ORCHESTRATION_RUN_SPEC_V7.macro_context)
      .toEqual(ORCHESTRATION_RUN_SPEC_V6.macro_context);
    expect(ORCHESTRATION_RUN_SPEC_V7.opportunity_risk_context)
      .toEqual(ORCHESTRATION_RUN_SPEC_V6.opportunity_risk_context);
  });

  it("expands no probability, geometry, execution or persistence surface", () => {
    expect(ORCHESTRATION_RUN_SPEC_V7.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V7.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V7.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V7.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V7.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V7.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V7.dashboard_wiring).toBe(false);
    const f = ORCHESTRATION_RUN_SPEC_V7.falconer_signal_source_context;
    expect(f.non_authoritative).toBe(true);
    expect(f.falconer_authority).toBe("strategy_context_only");
    expect(f.falconer_v2_created).toBe(false);
    expect(f.strategy_reevaluated).toBe(false);
    expect(f.strategy_hashes_admitted_to_evidence).toBe(false);
    expect(f.directional_weighting_conferred).toBe(false);
    expect(f.promotion_conferred).toBe(false);
    expect(f.accepted_spec_hash).toBe(FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED);
  });

  it("the pinned spec hash equals the live Falconer V1 spec hash", async () => {
    expect(await falconerSignalSourceSpecHash())
      .toBe(FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED);
    expect(falconerSignalSourceSpecRefV1())
      .toBe(`spec:ron_falconer_signal_source:v1:${FALCONER_SIGNAL_SOURCE_SPEC_V1_HASH_PINNED}`);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.agent_version).toBe(1);
  });
});

describe("V7 Falconer acceptance gate", () => {
  it("accepts the genuine sealed specialist envelope and returns its own hash", async () => {
    const e = await realFalconer();
    const accepted = await assertFalconerSignalSourceV1Sealed(e, CTX);
    expect(accepted).toBe(e.evidence_hash);
    expect(accepted).toBe(await evidenceHash(e));
    expect(e.provenance_refs).toContain(falconerSignalSourceSpecRefV1());
  });

  const reject = async (e: unknown, token: string) => {
    await expect(assertFalconerSignalSourceV1Sealed(e, CTX)).rejects.toThrow();
    try { await assertFalconerSignalSourceV1Sealed(e, CTX); } catch (err) {
      expect((err as OrchestrationRunError).reasons.join("|")).toContain(token);
    }
  };

  it("rejects absence and malformed input", async () => {
    await reject(null, "specialist_absent_or_malformed");
    await reject([], "specialist_absent_or_malformed");
  });

  it("rejects a MISSING falconer spec lineage ref", async () => {
    const base = await realFalconer();
    const e = await reseal(base, {
      provenance_refs: (base.provenance_refs ?? [])
        .filter((p) => !p.startsWith("spec:ron_falconer_signal_source:")),
    });
    await reject(e, "falconer_signal_source_spec_ref_count:0");
  });

  it("rejects a WRONG-hash falconer spec lineage ref", async () => {
    const base = await realFalconer();
    const e = await reseal(base, {
      provenance_refs: (base.provenance_refs ?? []).map((p) =>
        p.startsWith("spec:ron_falconer_signal_source:")
          ? `spec:ron_falconer_signal_source:v1:${"0".repeat(64)}` : p),
    });
    await reject(e, "falconer_signal_source_spec_v1_ref_invalid");
  });

  it("rejects an IDENTICAL duplicate accepted ref", async () => {
    const base = await realFalconer();
    const e = await reseal(base, {
      provenance_refs: [...(base.provenance_refs ?? []), falconerSignalSourceSpecRefV1()],
    });
    await reject(e, "falconer_signal_source_spec_ref_count:2");
  });

  it("rejects an EXTRA same-lineage ref at another version", async () => {
    const base = await realFalconer();
    const e = await reseal(base, {
      provenance_refs: [...(base.provenance_refs ?? []),
        `spec:ron_falconer_signal_source:v2:${"a".repeat(64)}`],
    });
    await reject(e, "falconer_signal_source_spec_ref_count:2");
  });

  it("rejects either canonical strategy SHA in provenance or body", async () => {
    const base = await realFalconer();
    const tsRef = await reseal(base, {
      provenance_refs: [...(base.provenance_refs ?? []),
        `strategy:${FALCONER_STRATEGY_TS_PORT_SHA_FORBIDDEN}`],
    });
    await reject(tsRef, "falconer_signal_source_strategy_ts_sha_present");
    const pineObs = await reseal(base, {
      observations: [...base.observations, {
        key: "falconer_strategy_identity", kind: "state",
        value_text: FALCONER_STRATEGY_PINE_SHA_FORBIDDEN, at: minus(10),
      }],
    });
    await reject(pineObs, "falconer_signal_source_strategy_pine_sha_present");
  });

  it("rejects an UNSEALED or TAMPERED envelope using the ORIGINAL specialist envelope", async () => {
    const base = await realFalconer();
    const { evidence_hash: _h, ...unsealed } = base as EvidenceEnvelopeV1 & { evidence_hash?: string };
    await reject(unsealed, "specialist_unsealed");
    await reject({ ...base, as_of: minus(5) }, "specialist_hash_mismatch");
    await reject({ ...base, evidence_hash: "f".repeat(64) }, "specialist_hash_mismatch");
  });

  it("rejects scope / trace / lookahead violations via the inherited V6 gate", async () => {
    const base = await realFalconer();
    await reject(await reseal(base, { trace_id: "other" }), "specialist_trace_mismatch");
    await reject(await reseal(base, { instrument: "NAS100" }), "specialist_instrument_mismatch");
    await reject(await reseal(base, { timeframe: "1h" }), "specialist_timeframe_mismatch");
    await reject(
      await reseal(base, { as_of: new Date(ANCHOR_MS + 60_000).toISOString() }),
      "specialist_as_of_after_evaluation_anchor");
  });

  it("rejects a wrong agent_version and a wrong agent", async () => {
    const base = await realFalconer();
    // agent_version 2 is unregistered, so the envelope cannot be validly sealed at all:
    // hash it directly to prove BOTH the inherited validator and the V7 version rule fire.
    await reject(await unvalidated(base, { agent_version: 2 }),
      "falconer_signal_source_wrong_agent_version");
    await reject(await reseal(base, { agent_id: "pattern_context" }),
      "specialist_wrong_agent");
  });

  it("rejects a non-contextual direction or recommendation", async () => {
    const base = await realFalconer();
    await reject(await reseal(base, { direction: "long" }),
      "falconer_signal_source_direction_not_contextual");
    await reject(await reseal(base, { recommendation: "research_only" }),
      "falconer_signal_source_recommendation_not_contextual");
  });

  it("rejects probability / geometry / execution observation keys and extra fields", async () => {
    const base = await realFalconer();
    // `falconer_confidence` is already blocked one layer down by the Evidence V1 validator
    // itself, so it can only be constructed unvalidated; V7 rejects it independently too.
    await reject(await unvalidated(base, {
      observations: [...base.observations,
        { key: "falconer_confidence", kind: "measurement", value_num: 0.9, at: minus(10) }],
    }), "falconer_signal_source_forbidden_observation:falconer_confidence");
    // A geometry key the base validator does NOT block: V7 is the gate that rejects it.
    await reject(await reseal(base, {
      observations: [...base.observations,
        { key: "falconer_target_price", kind: "measurement", value_num: 2400, at: minus(10) }],
    }), "falconer_signal_source_forbidden_observation:falconer_target_price");
    await reject({ ...base, allow_live_execution: false } as unknown,
      "falconer_signal_source_unexpected_field:allow_live_execution");
  });
});

describe("V7 batch binding and non-authority", () => {
  it("binds the accepted Falconer hash exactly once in a seven-agent batch", async () => {
    const f = await realFalconer();
    const accepted = await assertFalconerSignalSourceV1Sealed(f, CTX);
    const batch = await sevenAgentBatch(f);
    expect(batch.length).toBe(7);
    expect(batch.filter((e) => e.agent_id === FALCONER_SIGNAL_SOURCE_AGENT).length).toBe(1);
    assertCollectionComplete(batch, CTX);
    assertFalconerSignalSourceBinding(batch, accepted);
  });

  it("fails closed on a missing, duplicated or divergent Falconer envelope", async () => {
    const f = await realFalconer();
    const accepted = await assertFalconerSignalSourceV1Sealed(f, CTX);
    const batch = await sevenAgentBatch(f);
    expect(() => assertFalconerSignalSourceBinding(
      batch.filter((e) => e.agent_id !== FALCONER_SIGNAL_SOURCE_AGENT), accepted))
      .toThrow(OrchestrationRunError);
    expect(() => assertFalconerSignalSourceBinding([...batch, f], accepted))
      .toThrow(OrchestrationRunError);
    expect(() => assertFalconerSignalSourceBinding(batch, "0".repeat(64)))
      .toThrow(OrchestrationRunError);
  });

  it("Falconer stays non-authoritative: the pin cannot change the decision", async () => {
    const f = await realFalconer();
    const batch = await sevenAgentBatch(f);
    const withFalconer = await synthesizeDecision(batch, CTX);
    const withoutFalconer = await synthesizeDecision(
      canonicalOrder(batch.filter((e) => e.agent_id !== FALCONER_SIGNAL_SOURCE_AGENT)), CTX);
    expect(withFalconer.decision.direction).toBe(withoutFalconer.decision.direction);
    expect(withFalconer.decision.execution_path).toBe("signal_only");
    expect(withFalconer.decision.numeric_probability ?? null).toBeNull();
    expect(agentSpec(FALCONER_SIGNAL_SOURCE_AGENT)!.source_health_authoritative).toBe(false);
  });

  it("current accepted readiness state remains blocked_not_calibrated in the batch", async () => {
    const f = await realFalconer();
    const batch = await sevenAgentBatch(f);
    const opp = batch.find((e) => e.agent_id === "opportunity_risk")!;
    expect(opp.observations.find((o) => o.key === "readiness_state")?.value_text)
      .toBe("blocked_not_calibrated");
  });
});
