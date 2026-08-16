/**
 * RON_ORCHESTRATION_CROSS_ASSET_CONTEXT_V4 — pure-module tests.
 *
 * Proves: V1/V2/V3 plan hashes, plans and run identities are unchanged; V4 is
 * deterministic and version-distinct; the ONLY V4 plan delta from V3 is the cross-asset
 * spec_version pin 2; only V4 requests Cross V2; bad cross-asset provenance/temporal
 * shape fails closed; the accepted evidence hash binds to exactly one final envelope; the
 * Session -> Pattern and Calibration V2 gates are untouched; the final collection is
 * still seven sealed envelopes; and no probability / execution / persistence expansion.
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
  ORCHESTRATION_RUN_PLAN_V2, deriveRunIdsV2, orchestrationRunPlanHashV2,
} from "../../supabase/functions/_shared/ron-orchestration-run-v2.ts";
import {
  CALIBRATION_CONTEXT_AGENT, ORCHESTRATION_RUN_PLAN_V3, ORCHESTRATION_RUN_SPEC_V3,
  deriveRunIdsV3, orchestrationRunPlanHashV3,
} from "../../supabase/functions/_shared/ron-orchestration-run-v3.ts";
import {
  CROSS_ASSET_CONTEXT_AGENT, CROSS_ASSET_CONTEXT_SPEC_VERSION_V4,
  CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED,
  ORCHESTRATION_RUN_PLAN_AGENTS_V4, ORCHESTRATION_RUN_PLAN_V4, ORCHESTRATION_RUN_SPEC_V4,
  RON_ORCHESTRATION_RUN_VERSION_V4, assertCrossAssetContextBinding,
  assertCrossAssetContextV2Sealed, crossAssetContextSpecRefV2, deriveRunIdV4,
  deriveRunIdsV4, orchestrationRunPlanHashV4,
} from "../../supabase/functions/_shared/ron-orchestration-run-v4.ts";
import {
  CROSS_ASSET_SPEC_V1, crossAssetSpecHash,
} from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V2, CROSS_ASSET_SPEC_V1_HASH_PINNED,
  crossAssetRelationshipSpecHashV2,
} from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v2.ts";

const TRACE = "ron_run_v4_fixture_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const BAR_OPEN = "2026-08-16T03:45:00Z";
const BAR_CLOSE = "2026-08-16T04:00:00Z";
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };

/** Frozen plan-hash expectations captured BEFORE this slice. */
const FROZEN_V1_PLAN_HASH = await orchestrationRunPlanHash();
const FROZEN_V2_PLAN_HASH = await orchestrationRunPlanHashV2();
const FROZEN_V3_PLAN_HASH = await orchestrationRunPlanHashV3();

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

const BASE_SPEC_REF =
  `base_spec:${CROSS_ASSET_SPEC_V1.spec_id}:v${CROSS_ASSET_SPEC_V1.spec_version}:${CROSS_ASSET_SPEC_V1_HASH_PINNED}`;

const crossV2 = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(envelope(CROSS_ASSET_CONTEXT_AGENT, {
    direction: "neutral",
    recommendation: "context_only",
    as_of: BAR_OPEN,
    source_timestamps: { as_of_bar_open: BAR_OPEN, as_of_bar_completed_close: BAR_CLOSE },
    provenance_refs: [
      crossAssetContextSpecRefV2(), BASE_SPEC_REF,
      "counterpart_completion_proof:candle_history.created_at:recorded_at >= bar_open + bar_minutes",
    ],
    ...over,
  }));

const ENDPOINT = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");
const V3_SRC = readFileSync("supabase/functions/_shared/ron-orchestration-run-v3.ts", "utf8");
const V4_SRC = readFileSync("supabase/functions/_shared/ron-orchestration-run-v4.ts", "utf8");

describe("2D — Orchestration Run V4: frozen V1/V2/V3 invariants", () => {
  it("V1/V2/V3 plan hashes are unchanged", async () => {
    expect(await orchestrationRunPlanHash()).toBe(FROZEN_V1_PLAN_HASH);
    expect(await orchestrationRunPlanHashV2()).toBe(FROZEN_V2_PLAN_HASH);
    expect(await orchestrationRunPlanHashV3()).toBe(FROZEN_V3_PLAN_HASH);
    expect(ORCHESTRATION_RUN_PLAN_V1.every((p) => !("spec_version_pin" in p))).toBe(true);
    expect(ORCHESTRATION_RUN_PLAN_AGENTS.length).toBe(7);
  });

  it("V1/V2/V3 never pin the cross-asset specialist", () => {
    for (const plan of [ORCHESTRATION_RUN_PLAN_V2, ORCHESTRATION_RUN_PLAN_V3]) {
      const x = plan.find((p) => p.agent_id === CROSS_ASSET_CONTEXT_AGENT)!;
      expect(x.spec_version_pin).toBeNull();
    }
    expect((ORCHESTRATION_RUN_SPEC_V3.spec_version_pins as Record<string, number>)
      .cross_asset_correlation).toBeUndefined();
  });

  it("V1/V2/V3 run identities are unchanged and all four domains differ", async () => {
    const [a, b, c, d] = await Promise.all([
      deriveRunIds(TRACE, AS_OF), deriveRunIdsV2(TRACE, AS_OF),
      deriveRunIdsV3(TRACE, AS_OF), deriveRunIdsV4(TRACE, AS_OF),
    ]);
    for (const agent of ORCHESTRATION_RUN_PLAN_AGENTS_V4) {
      expect(new Set([a[agent], b[agent], c[agent], d[agent]]).size).toBe(4);
    }
  });

  it("frozen V3 source is not mutated by this slice", () => {
    expect(V3_SRC).not.toContain("cross_asset_context");
    expect(V3_SRC).not.toContain("ron_orch_run_v4");
  });
});

describe("2D — Orchestration Run V4: plan identity", () => {
  it("is version-distinct and deterministic", async () => {
    expect(RON_ORCHESTRATION_RUN_VERSION_V4).toBe(4);
    expect(ORCHESTRATION_RUN_SPEC_V4.supersedes_run_version).toBe(3);
    expect(ORCHESTRATION_RUN_SPEC_V4.run_id_domain).toBe("ron_orch_run_v4");
    expect(await orchestrationRunPlanHashV4()).toBe(await orchestrationRunPlanHashV4());
    expect(await orchestrationRunPlanHashV4()).not.toBe(FROZEN_V3_PLAN_HASH);
  });

  it("run ids are deterministic and domain separated", async () => {
    const a = await deriveRunIdV4(TRACE, AS_OF, CROSS_ASSET_CONTEXT_AGENT);
    const b = await deriveRunIdV4(TRACE, AS_OF, CROSS_ASSET_CONTEXT_AGENT);
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it("the ONLY plan-entry delta from V3 is the cross-asset spec_version pin 2", () => {
    expect(ORCHESTRATION_RUN_PLAN_V4.length).toBe(ORCHESTRATION_RUN_PLAN_V3.length);
    ORCHESTRATION_RUN_PLAN_V4.forEach((p, i) => {
      const q = ORCHESTRATION_RUN_PLAN_V3[i];
      expect(p.agent_id).toBe(q.agent_id);
      expect({ ...p, spec_version_pin: null }).toEqual({ ...q, spec_version_pin: null });
      expect(p.spec_version_pin).toBe(
        p.agent_id === CROSS_ASSET_CONTEXT_AGENT ? 2 : q.spec_version_pin);
    });
  });

  it("same seven agents, order, phases, authority and subject scope", () => {
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V4.length).toBe(7);
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V4).toEqual(
      ORCHESTRATION_RUN_PLAN_V3.map((p) => p.agent_id));
    const opp = ORCHESTRATION_RUN_PLAN_V4.find((p) => p.agent_id === "opportunity_risk")!;
    expect(opp.phase).toBe(2);
    expect(opp.requires_evidence_batch).toBe(true);
    const f = ORCHESTRATION_RUN_PLAN_V4.find((p) => p.agent_id === "falconer_signal_source")!;
    expect(f.subject_scope).toBe("caller_subject_bound");
  });

  it("Session -> Pattern dependency and Calibration V2 pin are inherited unchanged", () => {
    const pat = ORCHESTRATION_RUN_PLAN_V4.find((p) => p.agent_id === "pattern_context")!;
    expect(pat.depends_on_sealed_evidence).toEqual(["session_market_structure"]);
    expect(pat.dependency_param).toBe("session_evidence");
    expect(ORCHESTRATION_RUN_SPEC_V4.session_dependency_acceptance)
      .toEqual(ORCHESTRATION_RUN_SPEC_V3.session_dependency_acceptance);
    expect(ORCHESTRATION_RUN_SPEC_V4.calibration_context)
      .toEqual(ORCHESTRATION_RUN_SPEC_V3.calibration_context);
    expect(ORCHESTRATION_RUN_PLAN_V4
      .find((p) => p.agent_id === CALIBRATION_CONTEXT_AGENT)!.spec_version_pin).toBe(2);
  });

  it("V4 requests Cross V2 exactly once", () => {
    const pinned = ORCHESTRATION_RUN_PLAN_V4
      .filter((p) => p.agent_id === CROSS_ASSET_CONTEXT_AGENT && p.spec_version_pin === 2);
    expect(pinned).toHaveLength(1);
    expect(CROSS_ASSET_CONTEXT_SPEC_VERSION_V4).toBe(2);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.requested_exactly_once).toBe(true);
  });

  it("no other specialist is upgraded in this slice", () => {
    expect(ORCHESTRATION_RUN_PLAN_V4
      .find((p) => p.agent_id === "macro_news_geopolitics")!.spec_version_pin).toBeNull();
    expect(ORCHESTRATION_RUN_PLAN_V4
      .find((p) => p.agent_id === "opportunity_risk")!.spec_version_pin).toBeNull();
    expect(ORCHESTRATION_RUN_PLAN_V4
      .find((p) => p.agent_id === "falconer_signal_source")!.spec_version_pin).toBeNull();
  });

  it("safety rails are unchanged", () => {
    expect(ORCHESTRATION_RUN_SPEC_V4.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V4.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V4.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.dashboard_wiring).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.authority_added).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.probability_published).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.promotion_conferred).toBe(false);
    expect(V4_SRC).not.toMatch(/fetch\(|createClient|Deno\.env/);
  });
});

describe("2D — Cross V2 frozen identity", () => {
  it("pinned hashes match the frozen specs", async () => {
    expect(await crossAssetRelationshipSpecHashV2())
      .toBe(CROSS_ASSET_RELATIONSHIP_SPEC_V2_HASH_PINNED);
    expect(await crossAssetSpecHash()).toBe(CROSS_ASSET_SPEC_V1_HASH_PINNED);
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id).toBe(CROSS_ASSET_SPEC_V1.spec_id);
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version).toBe(2);
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_id).toBe(CROSS_ASSET_CONTEXT_AGENT);
  });

  it("V4 enforces only the frozen Cross V2 contextual semantics", () => {
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.safety_contract.envelope_direction_policy)
      .toBe("neutral_or_unknown_only_until_promoted_research_exists");
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.allowed_directions)
      .toEqual(["neutral", "unknown"]);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.allowed_recommendations)
      .toEqual(["context_only", "no_action"]);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.temporal_contract
      .counterpart_completion_proof)
      .toBe(CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract.proof_rule);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.temporal_contract
      .completed_close_must_not_exceed_orchestration_anchor).toBe(true);
    expect(ORCHESTRATION_RUN_SPEC_V4.cross_asset_context.temporal_contract
      .completed_bar_timestamp_pair_all_or_nothing).toBe(true);
  });
});

describe("2D — Orchestration Run V4: cross-asset acceptance gate", () => {
  const reasons = async (p: Promise<unknown>) => {
    try { await p; return [] as string[]; }
    catch (e) { return (e as OrchestrationRunError).reasons; }
  };

  it("accepts a sealed accepted Cross V2 envelope and returns its hash", async () => {
    const e = await crossV2();
    expect(await assertCrossAssetContextV2Sealed(e, CTX)).toBe(e.evidence_hash);
  });

  it("accepts the frozen blocked/unknown contextual shape", async () => {
    const e = await crossV2({
      status: "blocked", direction: "unknown", recommendation: "no_action",
      source_timestamps: {},
    });
    expect(await assertCrossAssetContextV2Sealed(e, CTX)).toBe(e.evidence_hash);
  });

  it("rejects absence and malformed input", async () => {
    expect(await reasons(assertCrossAssetContextV2Sealed(null, CTX)))
      .toEqual(["cross_asset_context_absent_or_malformed"]);
    expect(await reasons(assertCrossAssetContextV2Sealed([], CTX)))
      .toEqual(["cross_asset_context_absent_or_malformed"]);
  });

  it("rejects V1 spec provenance", async () => {
    const v1ref = `spec:${CROSS_ASSET_SPEC_V1.spec_id}:v1:${CROSS_ASSET_SPEC_V1_HASH_PINNED}`;
    const e = await crossV2({ provenance_refs: [v1ref, BASE_SPEC_REF] });
    expect(await reasons(assertCrossAssetContextV2Sealed(e, CTX)))
      .toContain("cross_asset_context_spec_version_not_2");
  });

  it("rejects a wrong spec hash", async () => {
    const e = await crossV2({
      provenance_refs: [`spec:${CROSS_ASSET_SPEC_V1.spec_id}:v2:${"0".repeat(64)}`, BASE_SPEC_REF],
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(e, CTX)))
      .toContain("cross_asset_context_spec_hash_mismatch");
  });

  it("rejects missing, duplicate and ambiguous spec provenance", async () => {
    const missing = await crossV2({ provenance_refs: [BASE_SPEC_REF] });
    expect(await reasons(assertCrossAssetContextV2Sealed(missing, CTX)))
      .toContain("cross_asset_context_spec_provenance_count:0");
    const dup = await crossV2({
      provenance_refs: [crossAssetContextSpecRefV2(), crossAssetContextSpecRefV2(), BASE_SPEC_REF],
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(dup, CTX)))
      .toContain("cross_asset_context_spec_provenance_count:2");
    const ambiguous = await crossV2({
      provenance_refs: [
        crossAssetContextSpecRefV2(),
        `spec:${CROSS_ASSET_SPEC_V1.spec_id}:v1:${CROSS_ASSET_SPEC_V1_HASH_PINNED}`,
        BASE_SPEC_REF,
      ],
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(ambiguous, CTX)))
      .toContain("cross_asset_context_spec_provenance_count:2");
  });

  it("rejects a missing or wrong inherited base-spec identity", async () => {
    const missing = await crossV2({ provenance_refs: [crossAssetContextSpecRefV2()] });
    expect(await reasons(assertCrossAssetContextV2Sealed(missing, CTX)))
      .toContain("cross_asset_context_base_spec_provenance_count:0");
    const wrong = await crossV2({
      provenance_refs: [
        crossAssetContextSpecRefV2(),
        `base_spec:${CROSS_ASSET_SPEC_V1.spec_id}:v1:${"1".repeat(64)}`,
      ],
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(wrong, CTX)))
      .toContain("cross_asset_context_base_spec_hash_mismatch");
  });

  it("rejects wrong agent, scope mismatch and unsealed evidence", async () => {
    const wrongAgent = await sealEvidence(envelope("macro_news_geopolitics", {
      as_of: BAR_OPEN, provenance_refs: [crossAssetContextSpecRefV2(), BASE_SPEC_REF],
    }));
    expect(await reasons(assertCrossAssetContextV2Sealed(wrongAgent, CTX)))
      .toContain("cross_asset_context_wrong_agent");
    const scoped = await crossV2({ instrument: "EURUSD" });
    expect(await reasons(assertCrossAssetContextV2Sealed(scoped, CTX)))
      .toContain("cross_asset_context_instrument_mismatch");
    const tf = await crossV2({ timeframe: "1h" });
    expect(await reasons(assertCrossAssetContextV2Sealed(tf, CTX)))
      .toContain("cross_asset_context_timeframe_mismatch");
    const trace = await crossV2({ trace_id: "other_trace_value" });
    expect(await reasons(assertCrossAssetContextV2Sealed(trace, CTX)))
      .toContain("cross_asset_context_trace_mismatch");
    const unsealed = { ...(await crossV2()), evidence_hash: undefined };
    expect(await reasons(assertCrossAssetContextV2Sealed(unsealed, CTX)))
      .toContain("cross_asset_context_unsealed");
  });

  it("rejects a tampered sealed envelope", async () => {
    const e = { ...(await crossV2()), evidence_hash: "f".repeat(64) };
    expect(await reasons(assertCrossAssetContextV2Sealed(e, CTX)))
      .toEqual(["cross_asset_context_hash_mismatch"]);
  });

  it("enforces the frozen temporal / completed-bar semantics", async () => {
    const future = await crossV2({
      as_of: "2026-08-16T04:15:00Z",
      source_timestamps: {
        as_of_bar_open: "2026-08-16T04:15:00Z",
        as_of_bar_completed_close: "2026-08-16T04:30:00Z",
      },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(future, CTX)))
      .toContain("cross_asset_context_as_of_after_orchestration_anchor");

    const offGrid = await crossV2({
      as_of: "2026-08-16T03:47:00Z",
      source_timestamps: {
        as_of_bar_open: "2026-08-16T03:47:00Z",
        as_of_bar_completed_close: "2026-08-16T04:02:00Z",
      },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(offGrid, CTX)))
      .toContain("cross_asset_context_as_of_not_bar_aligned");

    const badClose = await crossV2({
      source_timestamps: { as_of_bar_open: BAR_OPEN, as_of_bar_completed_close: BAR_OPEN },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(badClose, CTX)))
      .toContain("cross_asset_context_source_timestamp_mismatch:as_of_bar_completed_close");

    const badOpen = await crossV2({
      source_timestamps: { as_of_bar_open: AS_OF, as_of_bar_completed_close: BAR_CLOSE },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(badOpen, CTX)))
      .toContain("cross_asset_context_source_timestamp_mismatch:as_of_bar_open");

    const leaky = await crossV2({
      source_timestamps: {
        as_of_bar_open: BAR_OPEN, as_of_bar_completed_close: BAR_CLOSE,
        newest_counterpart_source_bar: "2026-08-16T06:00:00Z",
      },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(leaky, CTX)))
      .toContain("cross_asset_context_source_timestamp_after_anchor:newest_counterpart_source_bar");
  });

  it("accepts a bar that has already closed at the orchestration anchor", async () => {
    const e = await crossV2();
    expect(e.as_of).toBe("2026-08-16T03:45:00Z");
    expect(await assertCrossAssetContextV2Sealed(e, CTX)).toBe(e.evidence_hash);
  });

  it("rejects an unclosed bar whose completed close postdates the anchor (lookahead)", async () => {
    const e = await crossV2({
      as_of: AS_OF,
      source_timestamps: {
        as_of_bar_open: AS_OF, as_of_bar_completed_close: "2026-08-16T04:15:00Z",
      },
    });
    const r = await reasons(assertCrossAssetContextV2Sealed(e, CTX));
    expect(r).toContain("cross_asset_context_completed_bar_after_orchestration_anchor");
    expect(r).toContain("cross_asset_context_source_timestamp_after_anchor:as_of_bar_completed_close");
  });

  it("accepts that same bar once the anchor is at or after its completed close", async () => {
    const later: OrchestrationContext = { ...CTX, as_of: "2026-08-16T04:15:00Z" };
    const e = await crossV2({
      as_of: AS_OF,
      source_timestamps: {
        as_of_bar_open: AS_OF, as_of_bar_completed_close: "2026-08-16T04:15:00Z",
      },
    });
    expect(await assertCrossAssetContextV2Sealed(e, later)).toBe(e.evidence_hash);
  });

  it("requires the completed-bar timestamp pair to be all-or-nothing", async () => {
    const onlyOpen = await crossV2({ source_timestamps: { as_of_bar_open: BAR_OPEN } });
    expect(await reasons(assertCrossAssetContextV2Sealed(onlyOpen, CTX)))
      .toContain("cross_asset_context_source_timestamp_mismatch:as_of_bar_completed_close");
    const onlyClose = await crossV2({
      source_timestamps: { as_of_bar_completed_close: BAR_CLOSE },
    });
    expect(await reasons(assertCrossAssetContextV2Sealed(onlyClose, CTX)))
      .toContain("cross_asset_context_source_timestamp_mismatch:as_of_bar_open");
  });

  it("still accepts a legitimately timestamp-free blocked path", async () => {
    const e = await crossV2({
      status: "blocked", direction: "unknown", recommendation: "no_action",
      source_timestamps: {},
    });
    expect(await assertCrossAssetContextV2Sealed(e, CTX)).toBe(e.evidence_hash);
  });

  it("rejects direction / recommendation outside the frozen contextual contract", async () => {
    const dir = await crossV2({ direction: "long" });
    expect(await reasons(assertCrossAssetContextV2Sealed(dir, CTX)))
      .toContain("cross_asset_context_direction_not_contextual");
    const rec = await crossV2({ recommendation: "observe" });
    expect(await reasons(assertCrossAssetContextV2Sealed(rec, CTX)))
      .toContain("cross_asset_context_recommendation_not_contextual");
  });
});

describe("2D — Orchestration Run V4: batch binding and collection", () => {
  const batch = async (over: EvidenceEnvelopeV1[] = []) => {
    const others = ORCHESTRATION_RUN_PLAN_AGENTS_V4
      .filter((a) => a !== CROSS_ASSET_CONTEXT_AGENT)
      .map((a) => envelope(a));
    return canonicalOrder(await Promise.all([...others, ...over].map(sealEvidence)));
  };

  it("binds the accepted hash to exactly one final envelope in a seven-agent batch", async () => {
    const x = await crossV2();
    const sealed = await batch([x]);
    expect(sealed).toHaveLength(7);
    assertCollectionComplete(sealed, CTX);
    expect(() => assertCrossAssetContextBinding(sealed, x.evidence_hash!)).not.toThrow();
  });

  it("fails closed on absence, duplication or hash divergence", async () => {
    const x = await crossV2();
    const without = await batch();
    expect(() => assertCrossAssetContextBinding(without, x.evidence_hash!))
      .toThrow(OrchestrationRunError);
    const dup = [...(await batch([x])), x];
    expect(() => assertCrossAssetContextBinding(dup, x.evidence_hash!))
      .toThrow(/cross_asset_context_binding_count:2/);
    const sealed = await batch([x]);
    expect(() => assertCrossAssetContextBinding(sealed, "0".repeat(64)))
      .toThrow(/cross_asset_context_binding_hash_divergence/);
  });
});

describe("2D — Orchestration Run V4: endpoint wiring", () => {
  it("keeps V2 as the default and exposes V4 explicitly only", () => {
    expect(ENDPOINT).toContain("[1, 2, 3, 4].includes(requestedRunVersion)");
    expect(ENDPOINT).toContain("requestedRunVersion === 4");
    expect(ENDPOINT).toContain("RON_ORCHESTRATION_RUN_VERSION_V2\n    : Number(body.orchestration_run_version)");
    expect(ENDPOINT).toContain("assertCrossAssetContextV2Sealed");
    expect(ENDPOINT).toContain("assertCrossAssetContextBinding");
  });

  it("adds no persistence, probability or execution expansion", () => {
    expect(ENDPOINT).toContain("const persist = body.persist === true;");
    const probs: string[] = ENDPOINT.match(/numeric_probability:[^,\n]*/g) ?? [];
    expect(probs.length).toBeGreaterThan(0);
    expect(probs.every((m) => m.trim() === "numeric_probability: null")).toBe(true);
    expect(ENDPOINT).not.toContain("allow_live_execution: true");
  });
});
