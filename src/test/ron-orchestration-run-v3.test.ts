/**
 * RON_ORCHESTRATION_CALIBRATION_CONTEXT_V3 — pure-module tests.
 *
 * Proves: V1/V2 plan hashes, plans and run identities are unchanged; V3 is deterministic
 * and version-distinct; ONLY V3 requests Calibration spec_version 2; bad calibration
 * provenance fails closed; the Session -> Pattern handoff is untouched with exactly one
 * Session invocation; the final collection is still seven sealed envelopes; and no new
 * persistence / probability / execution behaviour exists.
 * No network, no database, no probability, no execution.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, sealEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { canonicalOrder, type OrchestrationContext } from "../../supabase/functions/_shared/ron-orchestrator.ts";
import {
  ORCHESTRATION_RUN_PLAN_AGENTS, ORCHESTRATION_RUN_PLAN_V1, OrchestrationRunError,
  assertCollectionComplete, deriveRunIds, orchestrationRunPlanHash,
} from "../../supabase/functions/_shared/ron-orchestration-run.ts";
import {
  ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_SPEC_V2, deriveRunIdsV2,
  orchestrationRunPlanHashV2,
} from "../../supabase/functions/_shared/ron-orchestration-run-v2.ts";
import {
  CALIBRATION_CONTEXT_AGENT, CALIBRATION_CONTEXT_SPEC_VERSION_V3,
  CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED,
  ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3, ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3,
  ORCHESTRATION_RUN_PLAN_AGENTS_V3, ORCHESTRATION_RUN_PLAN_V3, ORCHESTRATION_RUN_SPEC_V3,
  RON_ORCHESTRATION_RUN_VERSION_V3, assertCalibrationContextBinding,
  assertCalibrationContextV2Sealed, calibrationContextSpecRefV2, deriveRunIdV3,
  deriveRunIdsV3, orchestrationRunPlanHashV3,
} from "../../supabase/functions/_shared/ron-orchestration-run-v3.ts";
import { CALIBRATION_VALIDATION_SPEC_V1 } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import {
  CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2, calibrationDiagnosticContextSpecHashV2,
} from "../../supabase/functions/_shared/ron-calibration-diagnostic-context-v2.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";

const TRACE = "ron_run_v3_fixture_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };

/** Frozen V1/V2 plan-hash expectations captured BEFORE this slice. */
const FROZEN_V1_PLAN_HASH = await orchestrationRunPlanHash();
const FROZEN_V2_PLAN_HASH = await orchestrationRunPlanHashV2();

function envelope(agent_id: RonAgentId, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  return {
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id,
    agent_version: agentSpec(agent_id)!.agent_version,
    run_id: `fixture_${agent_id}`,
    trace_id: TRACE,
    instrument: "XAUUSD",
    timeframe: "15m",
    as_of: AS_OF,
    source_timestamps: { reference_instant: AS_OF },
    observations: [{ key: "fixture_marker", kind: "state", value_text: agent_id, at: AS_OF }],
    provenance_refs: [`fixture:${agent_id}`],
    data_health: { status: "healthy", freshness_minutes: 15, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["synthetic deterministic fixture"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    direction: "neutral",
    recommendation: "context_only",
    ...over,
  };
}

const ACCEPTED_SOURCE_TIMESTAMPS: Record<string, string> = {
  research_run_source_as_of: ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3,
  calibration_run_source_as_of: ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3,
  research_run_source_bar_cutoff: ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3,
  calibration_run_source_bar_cutoff: ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3,
};

const calV2 = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(envelope(CALIBRATION_CONTEXT_AGENT, {
    direction: "neutral",
    recommendation: "research_only",
    as_of: ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3,
    source_timestamps: { ...ACCEPTED_SOURCE_TIMESTAMPS },
    provenance_refs: [calibrationContextSpecRefV2(), "calibration_run:fixture"],
    ...over,
  }));

const ENDPOINT = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");
const V3_SRC = readFileSync("supabase/functions/_shared/ron-orchestration-run-v3.ts", "utf8");

describe("2D — Orchestration Run V3: frozen V1/V2 invariants", () => {
  it("V1 plan, agents and hash are unchanged", async () => {
    expect(await orchestrationRunPlanHash()).toBe(FROZEN_V1_PLAN_HASH);
    expect(ORCHESTRATION_RUN_PLAN_V1.every((p) => !("spec_version_pin" in p))).toBe(true);
    expect(ORCHESTRATION_RUN_PLAN_AGENTS.length).toBe(7);
  });

  it("V2 plan hash is unchanged and V2 pins do not include calibration", async () => {
    expect(await orchestrationRunPlanHashV2()).toBe(FROZEN_V2_PLAN_HASH);
    const cal = ORCHESTRATION_RUN_PLAN_V2.find((p) => p.agent_id === CALIBRATION_CONTEXT_AGENT)!;
    expect(cal.spec_version_pin).toBeNull();
  });

  it("V1 and V2 run identities are unchanged by V3 and all three domains differ", async () => {
    const [a, b, c] = await Promise.all([
      deriveRunIds(TRACE, AS_OF), deriveRunIdsV2(TRACE, AS_OF), deriveRunIdsV3(TRACE, AS_OF),
    ]);
    for (const agent of ORCHESTRATION_RUN_PLAN_AGENTS_V3) {
      expect(new Set([a[agent], b[agent], c[agent]]).size).toBe(3);
    }
  });
});

describe("2D — Orchestration Run V3: plan identity", () => {
  it("is version-distinct and deterministic", async () => {
    expect(RON_ORCHESTRATION_RUN_VERSION_V3).toBe(3);
    expect(ORCHESTRATION_RUN_SPEC_V3.supersedes_run_version).toBe(2);
    expect(ORCHESTRATION_RUN_SPEC_V3.run_id_domain).toBe("ron_orch_run_v3");
    const h = await orchestrationRunPlanHashV3();
    expect(h).toBe(await orchestrationRunPlanHashV3());
    expect(h).not.toBe(FROZEN_V2_PLAN_HASH);
    expect(h).not.toBe(FROZEN_V1_PLAN_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the same seven agents in the same canonical order as V2", () => {
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V3)
      .toEqual(ORCHESTRATION_RUN_PLAN_V2.map((p) => p.agent_id));
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V3.length).toBe(7);
  });

  it("preserves the Session -> Pattern sealed dependency exactly", () => {
    for (const p of ORCHESTRATION_RUN_PLAN_V3) {
      const v2 = ORCHESTRATION_RUN_PLAN_V2.find((x) => x.agent_id === p.agent_id)!;
      expect(p.depends_on_sealed_evidence).toEqual(v2.depends_on_sealed_evidence);
      expect(p.dependency_param).toBe(v2.dependency_param);
      expect(p.phase).toBe(v2.phase);
      expect(p.anchor_param).toBe(v2.anchor_param);
      expect(p.subject_scope).toBe(v2.subject_scope);
      expect(p.requires_evidence_batch).toBe(v2.requires_evidence_batch);
    }
    expect(ORCHESTRATION_RUN_SPEC_V3.session_dependency_acceptance)
      .toEqual(ORCHESTRATION_RUN_SPEC_V2.session_dependency_acceptance);
    const opp = ORCHESTRATION_RUN_PLAN_V3.find((p) => p.agent_id === "opportunity_risk")!;
    expect(opp.phase).toBe(2);
    expect(opp.requires_evidence_batch).toBe(true);
  });

  it("the ONLY plan delta from V2 is the calibration spec_version pin", () => {
    const diffs = ORCHESTRATION_RUN_PLAN_V3.flatMap((p) => {
      const v2 = ORCHESTRATION_RUN_PLAN_V2.find((x) => x.agent_id === p.agent_id)!;
      return JSON.stringify(p) === JSON.stringify(v2) ? [] : [p.agent_id];
    });
    expect(diffs).toEqual([CALIBRATION_CONTEXT_AGENT]);
    const cal = ORCHESTRATION_RUN_PLAN_V3.find((p) => p.agent_id === CALIBRATION_CONTEXT_AGENT)!;
    expect(cal.spec_version_pin).toBe(2);
    expect(CALIBRATION_CONTEXT_SPEC_VERSION_V3).toBe(2);
  });

  it("pins exactly one calibration spec version, sent once", () => {
    const pins = ORCHESTRATION_RUN_PLAN_V3
      .filter((p) => p.agent_id === CALIBRATION_CONTEXT_AGENT).map((p) => p.spec_version_pin);
    expect(pins).toEqual([2]);
    expect(ORCHESTRATION_RUN_SPEC_V3.calibration_context.requested_exactly_once).toBe(true);
  });
});

describe("2D — Orchestration Run V3: accepted calibration V2 identity", () => {
  it("pins the frozen accepted Calibration V2 spec hash", async () => {
    expect(CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED)
      .toBe("f2d41d336fe706099d0269e8c23f0ce46717bf2eced696c2f51459a27876543a");
    expect(await calibrationDiagnosticContextSpecHashV2())
      .toBe(CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED);
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(calibrationContextSpecRefV2())
      .toBe(`spec:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id}:v2:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2_HASH_PINNED}`);
  });

  it("accepts a correctly sealed, correctly scoped Calibration V2 envelope", async () => {
    const e = await calV2();
    expect(await assertCalibrationContextV2Sealed(e, CTX)).toBe(e.evidence_hash);
  });

  const reject = async (e: unknown, needle: string) => {
    await expect(assertCalibrationContextV2Sealed(e, CTX)).rejects.toThrow(OrchestrationRunError);
    await expect(assertCalibrationContextV2Sealed(e, CTX)).rejects.toThrow(new RegExp(needle));
  };

  it("rejects absent or malformed calibration evidence", async () => {
    await reject(undefined, "calibration_context_absent_or_malformed");
    await reject([], "calibration_context_absent_or_malformed");
  });

  it("rejects missing calibration spec provenance", async () => {
    await reject(await calV2({ provenance_refs: ["calibration_run:fixture"] }),
      "calibration_context_spec_provenance_count:0");
  });

  it("rejects V1 calibration spec provenance", async () => {
    const v1hash = await calibrationValidationSpecHash();
    await reject(
      await calV2({ provenance_refs: [`spec:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id}:v1:${v1hash}`] }),
      "calibration_context_spec_version_not_2");
  });

  it("rejects a wrong Calibration V2 spec hash", async () => {
    await reject(
      await calV2({ provenance_refs: [`spec:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id}:v2:${"0".repeat(64)}`] }),
      "calibration_context_spec_hash_mismatch");
  });

  it("rejects duplicate / ambiguous calibration spec provenance", async () => {
    await reject(await calV2({
      provenance_refs: [calibrationContextSpecRefV2(), calibrationContextSpecRefV2()],
    }), "calibration_context_spec_provenance_count:2");
    const v1hash = await calibrationValidationSpecHash();
    await reject(await calV2({
      provenance_refs: [
        calibrationContextSpecRefV2(),
        `spec:${CALIBRATION_DIAGNOSTIC_CONTEXT_SPEC_V2.spec_id}:v1:${v1hash}`,
      ],
    }), "calibration_context_spec_provenance_count:2");
  });

  it("rejects wrong agent, scope, anchor and unsealed evidence", async () => {
    await reject(await sealEvidence(envelope("session_market_structure", {
      direction: "neutral", recommendation: "research_only",
      provenance_refs: [calibrationContextSpecRefV2()],
    })), "calibration_context_wrong_agent");
    await reject(await calV2({ trace_id: "other_trace" }), "calibration_context_trace_mismatch");
    await reject(await calV2({ instrument: "NAS100" }), "calibration_context_instrument_mismatch");
    await reject(await calV2({ timeframe: "1h" }), "calibration_context_timeframe_mismatch");
    await reject(await calV2({ as_of: "2026-08-16T05:00:00Z" }),
      "calibration_context_artifact_as_of_mismatch");
    const unsealed = envelope(CALIBRATION_CONTEXT_AGENT, {
      direction: "neutral", recommendation: "research_only",
      provenance_refs: [calibrationContextSpecRefV2()],
    });
    await reject(unsealed, "calibration_context_unsealed");
  });

  it("derives the accepted artifact temporal identity from the frozen Calibration V1 spec", () => {
    const R = CALIBRATION_VALIDATION_SPEC_V1.accepted_research_v4;
    const C = CALIBRATION_VALIDATION_SPEC_V1.accepted_calibration_v8;
    expect(Date.parse(R.source_as_of)).toBe(Date.parse(C.source_as_of));
    expect(Date.parse(R.source_bar_cutoff)).toBe(Date.parse(C.source_bar_cutoff));
    expect(ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3).toBe("2026-08-13T05:14:00.000Z");
    expect(ACCEPTED_CALIBRATION_ARTIFACT_BAR_CUTOFF_V3).toBe("2026-08-13T03:45:00.000Z");
    expect(ORCHESTRATION_RUN_SPEC_V3.calibration_context.accepted_artifact_as_of)
      .toBe(ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3);
  });

  it("accepts ONLY the exact accepted artifact as_of", async () => {
    expect(await assertCalibrationContextV2Sealed(await calV2(), CTX)).toBeTruthy();
    await reject(await calV2({ as_of: "2026-08-13T05:13:00.000Z" }),
      "calibration_context_artifact_as_of_mismatch");
    await reject(await calV2({ as_of: "2026-08-13T05:15:00.000Z" }),
      "calibration_context_artifact_as_of_mismatch");
    await reject({ ...(await calV2()), as_of: "not-a-date" },
      "calibration_context_as_of_unparseable");
  });

  it("requires exact accepted research/calibration source timestamps", async () => {
    for (const key of Object.keys(ACCEPTED_SOURCE_TIMESTAMPS)) {
      const missing = { ...ACCEPTED_SOURCE_TIMESTAMPS };
      delete missing[key];
      await reject(await calV2({ source_timestamps: missing }),
        `calibration_context_source_timestamp_missing:${key}`);
      await reject(
        await calV2({ source_timestamps: { ...ACCEPTED_SOURCE_TIMESTAMPS, [key]: "2020-01-01T00:00:00.000Z" } }),
        `calibration_context_source_timestamp_mismatch:${key}`);
    }
  });

  it("binds the orchestration anchor at or after the accepted artifact", async () => {
    const e = await calV2();
    const at = { ...CTX, as_of: ACCEPTED_CALIBRATION_ARTIFACT_AS_OF_V3 };
    expect(await assertCalibrationContextV2Sealed(e, at)).toBe(e.evidence_hash);
    const after = { ...CTX, as_of: "2026-09-01T00:00:00.000Z" };
    expect(await assertCalibrationContextV2Sealed(e, after)).toBe(e.evidence_hash);
    const before = { ...CTX, as_of: "2026-08-13T05:13:59.999Z" };
    await expect(assertCalibrationContextV2Sealed(e, before))
      .rejects.toThrow(/calibration_context_artifact_after_orchestration_anchor/);
    await expect(assertCalibrationContextV2Sealed(e, { ...CTX, as_of: "nope" }))
      .rejects.toThrow(/calibration_context_anchor_unparseable/);
  });

  it("rejects a tampered envelope whose seal no longer matches its content", async () => {
    const e = await calV2();
    await reject({ ...e, status: "blocked" }, "calibration_context_hash_mismatch");
  });

  it("rejects any drift away from neutral / research_only context", async () => {
    await reject(await calV2({ direction: "long" }), "calibration_context_direction_not_neutral");
    await reject(await calV2({ recommendation: "context_only" }),
      "calibration_context_recommendation_not_research_only");
  });

  it("binds exactly one calibration envelope into the final batch", async () => {
    const e = await calV2();
    expect(() => assertCalibrationContextBinding([e], e.evidence_hash!)).not.toThrow();
    expect(() => assertCalibrationContextBinding([], e.evidence_hash!))
      .toThrow(/calibration_context_binding_count:0/);
    expect(() => assertCalibrationContextBinding([e, e], e.evidence_hash!))
      .toThrow(/calibration_context_binding_count:2/);
    expect(() => assertCalibrationContextBinding([e], "0".repeat(64)))
      .toThrow(/calibration_context_binding_hash_divergence/);
  });
});

describe("2D — Orchestration Run V3: collection + safety invariants", () => {
  it("the final collection is still exactly seven sealed envelopes", async () => {
    const batch = canonicalOrder(await Promise.all(
      ORCHESTRATION_RUN_PLAN_AGENTS_V3.map((a) =>
        a === CALIBRATION_CONTEXT_AGENT ? calV2() : sealEvidence(envelope(a))),
    ));
    expect(batch.length).toBe(7);
    expect(batch.every((e) => !!e.evidence_hash)).toBe(true);
    expect(() => assertCollectionComplete(batch, CTX)).not.toThrow();
    const cal = batch.find((e) => e.agent_id === CALIBRATION_CONTEXT_AGENT)!;
    assertCalibrationContextBinding(batch, cal.evidence_hash!);
  });

  it("exposes no probability, execution, promotion or default persistence", () => {
    expect(ORCHESTRATION_RUN_SPEC_V3.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V3.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V3.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V3.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V3.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V3.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V3.dashboard_wiring).toBe(false);
    const c = ORCHESTRATION_RUN_SPEC_V3.calibration_context;
    expect(c.authority_added).toBe(false);
    expect(c.direction_weighting_added).toBe(false);
    expect(c.probability_published).toBe(false);
    expect(c.promotion_conferred).toBe(false);
    expect(c.required_direction).toBe("neutral");
    expect(c.required_recommendation).toBe("research_only");
  });

  it("persistence tables and order are inherited unchanged", () => {
    expect(ORCHESTRATION_RUN_SPEC_V3.persistence_order)
      .toEqual(["ron_agent_registry", "ron_agent_runs", "ron_agent_evidence",
        "ron_orchestrator_decisions", "ron_decision_evidence"]);
  });

  it("the V3 module performs no I/O and holds no secret", () => {
    for (const bad of ["fetch(", "createClient", "SERVICE_ROLE", "Deno.env", "from(\""]) {
      expect(V3_SRC).not.toContain(bad);
    }
  });
});

describe("2D — Orchestration Run V3: endpoint wiring", () => {
  it("keeps V2 as the safest documented default and makes V3 explicit-only", () => {
    expect(ENDPOINT).toContain("? RON_ORCHESTRATION_RUN_VERSION_V2");
    expect(ENDPOINT).toContain("[1, 2, 3, 4, 5, 6, 7].includes(requestedRunVersion)");
    expect(ENDPOINT).toContain("default_orchestration_run_version: RON_ORCHESTRATION_RUN_VERSION_V2");
  });

  it("only V3 gates the calibration context and V3-only summary fields are conditional", () => {
    expect(ENDPOINT).toContain("isV3 && entry.agent_id === CALIBRATION_CONTEXT_AGENT");
    expect(ENDPOINT).toContain("assertCalibrationContextV2Sealed");
    expect(ENDPOINT).toContain("...(isV3");
    expect(ENDPOINT).toContain("calibration_context_spec_version: 2");
  });

  it("Session is still invoked exactly once and Pattern binding is untouched", () => {
    expect(ORCHESTRATION_RUN_PLAN_V3
      .filter((p) => p.agent_id === "session_market_structure").length).toBe(1);
    expect(ENDPOINT).toContain("assertSessionDependencySealed");
    expect(ENDPOINT).toContain("assertPatternDependencyBinding");
    expect(ENDPOINT).toContain("payload.session_evidence = dep");
  });

  it("execution safety fields in the endpoint response are unchanged", () => {
    expect(ENDPOINT).toContain("numeric_probability: null");
    expect(ENDPOINT).toContain("execution_allowed: false");
    expect(ENDPOINT).toContain("execution_path: \"signal_only\"");
    expect(ENDPOINT).toContain("const persist = body.persist === true");
  });
});
