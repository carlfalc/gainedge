/**
 * RON_OPPORTUNITY_RISK_EVIDENCE_COMPATIBILITY_V2 — Opportunity/Risk V2 tests.
 *
 * V2 preserves V1 readiness semantics exactly and adds ONLY an accepted-lineage
 * evidence compatibility contract. These tests are adversarial about geometry,
 * probability, Falconer authority and V1 isolation.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, sealEvidence, validateEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";
import {
  buildOpportunityRiskEvidenceV1, opportunityRiskSpecHash,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec.ts";
import {
  buildOpportunityRiskEvidenceV2, opportunityRiskSpecHashV2, OPPORTUNITY_RISK_SPEC_V2,
  OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED, checkAcceptedLineage,
  ACCEPTED_SESSION_STRUCTURE_V2_HASH, ACCEPTED_CALIBRATION_V2_HASH,
  ACCEPTED_CALIBRATION_V1_BASE_HASH, ACCEPTED_PATTERN_V2_HASH,
  ACCEPTED_CROSS_ASSET_V2_HASH, ACCEPTED_CROSS_ASSET_V1_BASE_HASH,
  ACCEPTED_MACRO_V2_HASH, ACCEPTED_MACRO_V1_HASH,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec-v2.ts";
import { calibrationDiagnosticContextSpecHashV2 } from "../../supabase/functions/_shared/ron-calibration-diagnostic-context-v2.ts";
import { patternContextSpecHashV2 } from "../../supabase/functions/_shared/ron-pattern-structure-context-v2.ts";
import { crossAssetRelationshipSpecHashV2 } from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v2.ts";
import { macroNewsSpecHashV2 } from "../../supabase/functions/_shared/ron-macro-temporal-context-v2.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";

const TRACE = "ron-opp-v2-fixture";
const ANCHOR = "2026-08-13T10:00:00Z";
const anchorMs = Date.parse(ANCHOR);
const minus = (m: number) => new Date(anchorMs - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

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
    recommendation: "context_only",
    ...over,
  };
}

const calObs = (promoted = 0, publication = "locked_not_calibrated_for_production", validation = "accepted_research_only") => [
  { key: "validation_state", kind: "state" as const, value_text: validation },
  { key: "publication_state", kind: "state" as const, value_text: publication },
  { key: "promoted_state_variable_count", kind: "measurement" as const, value_num: promoted },
];

const session = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("session_market_structure", 15, {
    direction: "short", provenance_refs: [SESSION_V2_REF, "quality_version:2"], ...over,
  }));
const calibration = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("calibration_model_validation", 271, {
    direction: "neutral", recommendation: "research_only",
    observations: calObs(),
    provenance_refs: [CAL_V2_REF, CAL_BASE_REF],
    ...over,
  }));
const pattern = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("pattern_context", 15, {
    direction: "neutral", provenance_refs: [PATTERN_V2_REF, PATTERN_SEG_REF], ...over,
  }));
const crossAsset = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("cross_asset_correlation", 15, {
    direction: "neutral", provenance_refs: [CROSS_V2_REF, CROSS_BASE_REF], ...over,
  }));
const macro = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("macro_news_geopolitics", 41, {
    direction: "neutral", provenance_refs: [MACRO_V2_REF, MACRO_CLASS_REF, MACRO_V1_REF], ...over,
  }));
const falconer = (over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("falconer_signal_source", 15, { direction: "neutral", ...over }));

const build = (evidence: EvidenceEnvelopeV1[]) =>
  buildOpportunityRiskEvidenceV2({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
    evidence, promoted_state_variables: PROMOTED_STATE_VARIABLES,
    run_id: "run_opp_v2", trace_id: TRACE,
  });

const readiness = (e: EvidenceEnvelopeV1) =>
  e.observations.find((o) => o.key === "readiness_state")?.value_text;
const reasons = (e: EvidenceEnvelopeV1) =>
  e.observations.filter((o) => o.key === "blocking_reason").map((o) => String(o.value_text));
const obs = (e: EvidenceEnvelopeV1, key: string) =>
  e.observations.filter((o) => o.key === key);

describe("Opportunity/Risk V2 — identity and V1 isolation", () => {
  it("keeps V1 spec hash frozen and pins it as the V2 base", async () => {
    expect(await opportunityRiskSpecHash()).toBe(OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED);
    expect(OPPORTUNITY_RISK_SPEC_V2.base_spec_hash).toBe(OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED);
    expect(OPPORTUNITY_RISK_SPEC_V2.supersedes_spec_version).toBe(1);
    expect(OPPORTUNITY_RISK_SPEC_V2.spec_version).toBe(2);
    expect(OPPORTUNITY_RISK_SPEC_V2.spec_id).toBe("ron_opportunity_risk_foundation");
    expect(OPPORTUNITY_RISK_SPEC_V2.agent_id).toBe("opportunity_risk");
    expect(OPPORTUNITY_RISK_SPEC_V2.agent_version).toBe(1);
  });

  it("produces a deterministic, version-distinct V2 spec hash", async () => {
    const a = await opportunityRiskSpecHashV2();
    const b = await opportunityRiskSpecHashV2();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(await opportunityRiskSpecHash());
  });

  it("pins the accepted specialist lineage hashes actually emitted by the frozen producers", async () => {
    expect(await sessionStructureSpecHashV2()).toBe(ACCEPTED_SESSION_STRUCTURE_V2_HASH);
    expect(await calibrationDiagnosticContextSpecHashV2()).toBe(ACCEPTED_CALIBRATION_V2_HASH);
    expect(await patternContextSpecHashV2()).toBe(ACCEPTED_PATTERN_V2_HASH);
    expect(await crossAssetRelationshipSpecHashV2()).toBe(ACCEPTED_CROSS_ASSET_V2_HASH);
    expect(await macroNewsSpecHashV2()).toBe(ACCEPTED_MACRO_V2_HASH);
  });

  it("leaves V1 output byte-identical for the same input", async () => {
    const evidence = [await session(), await calibration()];
    const input = {
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      evidence, promoted_state_variables: PROMOTED_STATE_VARIABLES,
      run_id: "run_iso", trace_id: TRACE,
    };
    const a = await buildOpportunityRiskEvidenceV1(input);
    const b = await buildOpportunityRiskEvidenceV1(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.provenance_refs.some((p) => p.startsWith("spec:ron_opportunity_risk_foundation:v1:"))).toBe(true);
    expect(a.provenance_refs.some((p) => p.startsWith("base_spec:"))).toBe(false);
    expect(a.observations.some((o) => o.key === "evidence_compatibility_contract")).toBe(false);
  });
});

describe("Opportunity/Risk V2 — inherited readiness under accepted lineages", () => {
  it("passes compatibility and still blocks on zero promotions", async () => {
    const e = await build([await session(), await calibration()]);
    expect(readiness(e)).toBe("blocked_not_calibrated");
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    expect(obs(e, "accepted_required_lineages")[0].value_num).toBe(2);
    expect(obs(e, "accepted_optional_lineages")[0].value_num).toBe(0);
    expect(obs(e, "evidence_compatibility_contract")[0].value_text)
      .toBe("accepted_specialist_lineages_v2");
    expect(validateEvidence(e)).toEqual([]);
  });

  it("emits V2 spec provenance plus a V1 base-spec reference", async () => {
    const e = await build([await session(), await calibration()]);
    const v2 = await opportunityRiskSpecHashV2();
    expect(e.provenance_refs).toContain(
      `spec:ron_opportunity_risk_foundation:v2:${v2}`);
    expect(e.provenance_refs).toContain(
      `base_spec:ron_opportunity_risk_foundation:v1:${OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED}`);
    expect(e.provenance_refs.some((p) => p.startsWith("spec:ron_opportunity_risk_foundation:v1:"))).toBe(false);
    expect(e.provenance_refs.some((p) => p.startsWith("evidence:session_market_structure:"))).toBe(true);
  });

  it("is unaffected by Calibration V2 diagnostic observations", async () => {
    const plain = await build([await session(), await calibration()]);
    const withDiag = await build([await session(), await calibration({
      observations: [
        ...calObs(),
        { key: "baseline_relation", kind: "state", value_text: "better_than_naive_on_artifact" },
        { key: "ece_ordering", kind: "state", value_text: "long_ece_lower_on_artifact" },
      ],
    })]);
    expect(readiness(withDiag)).toBe(readiness(plain));
    expect(reasons(withDiag)).toEqual(reasons(plain));
  });

  it("accepts each optional specialist lineage when present", async () => {
    const e = await build([
      await session(), await calibration(), await pattern(), await crossAsset(), await macro(),
    ]);
    expect(readiness(e)).toBe("blocked_not_calibrated");
    expect(obs(e, "accepted_optional_lineages")[0].value_num).toBe(3);
    expect(obs(e, "accepted_specialist_lineage").map((o) => o.value_text)).toEqual([
      "calibration_model_validation", "session_market_structure",
      "cross_asset_correlation", "macro_news_geopolitics", "pattern_context",
    ]);
  });

  it("allows missing optional specialists exactly as V1", async () => {
    const e = await build([await session(), await calibration()]);
    expect(reasons(e).some((r) => r.startsWith("incompatible_specialist_lineage"))).toBe(false);
  });

  it("is input-order independent and replay-deterministic", async () => {
    const list = [await session(), await calibration(), await macro(), await pattern()];
    const a = await build(list);
    const b = await build([...list].reverse());
    const c = await build(list);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
});

describe("Opportunity/Risk V2 — fail-closed compatibility", () => {
  const mismatch = async (evidence: EvidenceEnvelopeV1[], agent: string) => {
    const e = await build(evidence);
    expect(readiness(e)).toBe("blocked_contract_mismatch");
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.status).toBe("critical");
    expect(reasons(e).some((r) => r.startsWith(`incompatible_specialist_lineage:${agent}:`))).toBe(true);
    return e;
  };

  it("rejects a Session V1 lineage envelope", async () => {
    await mismatch([
      await session({ provenance_refs: ["spec:ron_session_market_structure:v1:" + "0".repeat(64)] }),
      await calibration(),
    ], "session_market_structure");
  });

  it("rejects a missing or duplicate ambiguous Session lineage", async () => {
    await mismatch([await session({ provenance_refs: ["quality_version:2"] }), await calibration()],
      "session_market_structure");
    await mismatch([
      await session({ provenance_refs: [SESSION_V2_REF, "spec:ron_session_market_structure:v2:" + "1".repeat(64)] }),
      await calibration(),
    ], "session_market_structure");
  });

  it("rejects Calibration V1-only, wrong V2 hash, and wrong/missing base_spec", async () => {
    await mismatch([await session(), await calibration({
      provenance_refs: ["spec:ron_calibration_model_validation:v1:" + ACCEPTED_CALIBRATION_V1_BASE_HASH],
    })], "calibration_model_validation");
    await mismatch([await session(), await calibration({
      provenance_refs: ["spec:ron_calibration_model_validation:v2:" + "2".repeat(64), CAL_BASE_REF],
    })], "calibration_model_validation");
    await mismatch([await session(), await calibration({ provenance_refs: [CAL_V2_REF] })],
      "calibration_model_validation");
    await mismatch([await session(), await calibration({
      provenance_refs: [CAL_V2_REF, CAL_BASE_REF, "base_spec:ron_calibration_model_validation:v1:" + "3".repeat(64)],
    })], "calibration_model_validation");
  });

  it("rejects a wrong, missing or duplicated Pattern V2 lineage", async () => {
    await mismatch([await session(), await calibration(), await pattern({
      provenance_refs: ["spec:ron_pattern_context:v1:" + "4".repeat(64), PATTERN_SEG_REF],
    })], "pattern_context");
    await mismatch([await session(), await calibration(), await pattern({
      provenance_refs: [PATTERN_V2_REF],
    })], "pattern_context");
    await mismatch([await session(), await calibration(), await pattern({
      provenance_refs: [PATTERN_V2_REF, PATTERN_SEG_REF, "segmentation:ron_session_market_structure:v2:" + "5".repeat(64)],
    })], "pattern_context");
  });

  it("rejects a wrong, missing or duplicated Cross-Asset V2 lineage", async () => {
    await mismatch([await session(), await calibration(), await crossAsset({
      provenance_refs: ["spec:ron_cross_asset_correlation:v1:" + ACCEPTED_CROSS_ASSET_V1_BASE_HASH],
    })], "cross_asset_correlation");
    await mismatch([await session(), await calibration(), await crossAsset({
      provenance_refs: [CROSS_V2_REF],
    })], "cross_asset_correlation");
    await mismatch([await session(), await calibration(), await crossAsset({
      provenance_refs: [CROSS_V2_REF, CROSS_BASE_REF, "base_spec:ron_cross_asset_correlation:v1:" + "6".repeat(64)],
    })], "cross_asset_correlation");
  });

  it("requires the exact Macro two-ref lineage and Session V2 classification ref", async () => {
    await mismatch([await session(), await calibration(), await macro({
      provenance_refs: [MACRO_V2_REF, MACRO_CLASS_REF],
    })], "macro_news_geopolitics");
    await mismatch([await session(), await calibration(), await macro({
      provenance_refs: [MACRO_V1_REF, MACRO_CLASS_REF],
    })], "macro_news_geopolitics");
    await mismatch([await session(), await calibration(), await macro({
      provenance_refs: [MACRO_V2_REF, MACRO_V1_REF],
    })], "macro_news_geopolitics");
    await mismatch([await session(), await calibration(), await macro({
      provenance_refs: [MACRO_V2_REF, MACRO_V1_REF, MACRO_CLASS_REF,
        "spec:ron_macro_news_geopolitics:v2:" + "7".repeat(64)],
    })], "macro_news_geopolitics");
  });
});

describe("Opportunity/Risk V2 — precedence, Falconer and safety", () => {
  it("preserves missing-required precedence instead of reclassifying it", async () => {
    const e = await build([await calibration(), await pattern({
      provenance_refs: ["spec:ron_pattern_context:v1:" + "8".repeat(64)],
    })]);
    expect(readiness(e)).toBe("blocked_missing_required_evidence");
    expect(reasons(e)).toContain("missing_required_evidence:session_market_structure");
    expect(obs(e, "evidence_compatibility_state")[0].value_text)
      .toBe("not_assessed_precedence_preserved");
  });

  it("preserves V1 conflicting-duplicate precedence", async () => {
    const a = await session();
    const b = await session({ direction: "long" });
    const e = await build([a, b, await calibration()]);
    expect(readiness(e)).toBe("blocked_conflicting_evidence");
  });

  it("preserves V1 scope and future-dated precedence", async () => {
    const future = await session({ as_of: new Date(anchorMs + 60_000).toISOString() });
    const e = await build([future, await calibration()]);
    expect(readiness(e)).toBe("blocked_future_dated_evidence");
  });

  it("never grants Falconer authority or gates on it", async () => {
    const withF = await build([await session(), await calibration(), await falconer()]);
    const withoutF = await build([await session(), await calibration()]);
    expect(readiness(withF)).toBe("blocked_not_calibrated");
    expect(obs(withF, "accepted_required_lineages")[0].value_num).toBe(2);
    expect(obs(withF, "accepted_optional_lineages")[0].value_num).toBe(0);
    expect(readiness(withoutF)).toBe(readiness(withF));
  });

  it("emits no geometry, probability, confidence, score or execution key", async () => {
    const e = await build([await session(), await calibration(), await pattern(), await crossAsset(), await macro()]);
    const blob = JSON.stringify(e).toLowerCase();
    for (const banned of [
      "entry", "stop_loss", "take_profit", "\"target", "risk_reward", "\"lot",
      "position_size", "probability", "confidence", "\"score", "expected_value",
      "edge\"", "trailing", "break_even", "buy", "sell",
    ]) {
      expect(blob.includes(banned)).toBe(false);
    }
    expect(["neutral", "unknown"]).toContain(e.direction);
  });

  it("exposes a pure lineage helper with deterministic reasons", async () => {
    expect(checkAcceptedLineage(await session()).ok).toBe(true);
    const bad = checkAcceptedLineage(await session({ provenance_refs: [] }));
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toEqual(["missing_session_structure_v2_spec_ref"]);
    expect(checkAcceptedLineage(await falconer()).ok).toBe(true);
  });
});
