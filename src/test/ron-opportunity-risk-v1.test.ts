/**
 * Phase 2D.2i — Opportunity / Risk FOUNDATION V1 tests.
 *
 * This agent is a READINESS GATE. These tests assert, adversarially, that it can never
 * emit trade geometry, probability, confidence, EV or a directional trade claim, and that
 * every prerequisite failure fails CLOSED with a deterministic state.
 */
import { describe, it, expect } from "vitest";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, evidenceTtlMinutes, sealEvidence,
  validateEvidence, type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";
import {
  buildOpportunityRiskEvidenceV1, opportunityRiskSpecHash, OPPORTUNITY_RISK_SPEC_V1,
  OPPORTUNITY_REQUIRED_AGENTS, OPPORTUNITY_OPTIONAL_AGENTS,
} from "../../supabase/functions/_shared/ron-opportunity-risk-spec.ts";
import { SESSION_STRUCTURE_SPEC_V2_HASH_PINNED } from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import { crossAssetSpecHash } from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import { macroNewsSpecHash } from "../../supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts";
import { patternContextSpecHash } from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";

const OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED = "cb547444826d7a49479d869ad558ee7344733140f0ad0ae0a4d3c8f71461173a";

const TRACE = "ron-2d2i-fixture";
const ANCHOR = "2026-08-13T10:00:00Z";
const anchorMs = Date.parse(ANCHOR);
const minus = (m: number) => new Date(anchorMs - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

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

const calObs = (promoted: number, publication: string, validation = "accepted_research_only") => [
  { key: "validation_state", kind: "state" as const, value_text: validation },
  { key: "publication_state", kind: "state" as const, value_text: publication },
  { key: "promoted_state_variable_count", kind: "measurement" as const, value_num: promoted },
];

const session = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("session_market_structure", age, { direction: "short", ...over }));
const calibration = (age = 271, over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("calibration_model_validation", age, {
    direction: "neutral", recommendation: "research_only",
    observations: calObs(0, "locked_not_calibrated_for_production"),
    ...over,
  }));
const pattern = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("pattern_context", age, { direction: "neutral", ...over }));
const crossAsset = (age = 15, over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("cross_asset_correlation", age, { direction: "neutral", ...over }));
const macro = (age = 41, over: Partial<EvidenceEnvelopeV1> = {}) =>
  sealEvidence(raw("macro_news_geopolitics", age, { direction: "neutral", ...over }));

const build = (evidence: EvidenceEnvelopeV1[], over: Partial<Parameters<typeof buildOpportunityRiskEvidenceV1>[0]> = {}) =>
  buildOpportunityRiskEvidenceV1({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
    evidence, promoted_state_variables: PROMOTED_STATE_VARIABLES,
    run_id: "run_2d2i", trace_id: TRACE, ...over,
  });

const readiness = (e: EvidenceEnvelopeV1) =>
  e.observations.find((o) => o.key === "readiness_state")?.value_text;
const reasons = (e: EvidenceEnvelopeV1) =>
  e.observations.filter((o) => o.key === "blocking_reason").map((o) => o.value_text);

describe("2D.2i — Opportunity/Risk Foundation spec identity", () => {
  it("pins the exact full spec hash", async () => {
    expect(await opportunityRiskSpecHash()).toBe(OPPORTUNITY_RISK_SPEC_V1_HASH_PINNED);
  });

  it("leaves every accepted upstream hash and the promoted-state contract untouched", async () => {
    expect(SESSION_STRUCTURE_SPEC_V2_HASH_PINNED)
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(await patternContextSpecHash())
      .toBe("9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d");
    expect(await crossAssetSpecHash())
      .toBe("8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44");
    expect(await macroNewsSpecHash())
      .toBe("0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f");
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("keeps the pre-registered agent identity, authority and TTL exactly", () => {
    const spec = agentSpec("opportunity_risk")!;
    expect(spec.agent_version).toBe(1);
    expect(spec.authority_class).toBe("opportunity_construction");
    expect(spec.source_health_authoritative).toBe(false);
    expect(spec.ttl_multiplier).toBe(1);
    expect(evidenceTtlMinutes("opportunity_risk", "15m")).toBe(60);
    expect(OPPORTUNITY_RISK_SPEC_V1.authority_rank).toBe(5);
  });

  it("requires only Session + Calibration and never Falconer", () => {
    expect([...OPPORTUNITY_REQUIRED_AGENTS])
      .toEqual(["calibration_model_validation", "session_market_structure"]);
    expect([...OPPORTUNITY_OPTIONAL_AGENTS])
      .toEqual(["cross_asset_correlation", "macro_news_geopolitics", "pattern_context"]);
    const text = JSON.stringify(OPPORTUNITY_RISK_SPEC_V1).toLowerCase();
    expect(text).not.toContain("falconer_signal_source");
    expect(OPPORTUNITY_RISK_SPEC_V1.input_contract.falconer_is_authority).toBe(false);
  });

  it("the pure producer performs no I/O, wall-clock, broker or Falconer access", async () => {
    const src = await import("node:fs/promises")
      .then((fs) => fs.readFile("supabase/functions/_shared/ron-opportunity-risk-spec.ts", "utf8"));
    for (const t of ["Date.now(", "createClient", "fetch(", "Deno.env", "supabase", "falconer", "metaapi"]) {
      expect(src.toLowerCase()).not.toContain(t.toLowerCase());
    }
  });
});

describe("2D.2i — deterministic readiness gate", () => {
  it("current production shape: promoted=[] => blocked_not_calibrated, construction not allowed", async () => {
    const e = await build([await session(), await calibration()]);
    expect(readiness(e)).toBe("blocked_not_calibrated");
    expect(e.observations.find((o) => o.key === "construction_allowed")!.value_text).toBe("false");
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    expect(reasons(e)).toContain("no_promoted_state_variables");
    expect(validateEvidence(e)).toEqual([]);
  });

  it("missing calibration or missing session => blocked_missing_required_evidence", async () => {
    const a = await build([await session()]);
    expect(readiness(a)).toBe("blocked_missing_required_evidence");
    expect(reasons(a)).toContain("missing_required_evidence:calibration_model_validation");
    const b = await build([await calibration()]);
    expect(readiness(b)).toBe("blocked_missing_required_evidence");
    expect(reasons(b)).toContain("missing_required_evidence:session_market_structure");
    for (const e of [a, b]) {
      expect(e.status).toBe("blocked");
      expect(e.direction).toBe("unknown");
      expect(e.recommendation).toBe("no_action");
    }
  });

  it("stale calibration and stale session both block on the registered TTL", async () => {
    const a = await build([await session(), await calibration(481)]);
    expect(readiness(a)).toBe("blocked_stale_required_evidence");
    expect(reasons(a)).toContain("stale_required_evidence:calibration_model_validation");
    const b = await build([await session(61), await calibration()]);
    expect(readiness(b)).toBe("blocked_stale_required_evidence");
    expect(reasons(b)).toContain("stale_required_evidence:session_market_structure");
  });

  it("critical/blocked required evidence fails closed", async () => {
    const e = await build([
      await session(15, {
        status: "blocked", direction: "unknown", recommendation: "no_action",
        data_health: { status: "critical", freshness_minutes: 15, completeness: 0, issues: ["x"] },
      }),
      await calibration(),
    ]);
    expect(readiness(e)).toBe("blocked_required_health");
    expect(e.status).toBe("blocked");
  });

  it("optional context cannot satisfy required gates nor act as source-health authority", async () => {
    const onlyOptional = await build([await pattern(), await crossAsset(), await macro()]);
    expect(readiness(onlyOptional)).toBe("blocked_missing_required_evidence");

    const withBlockedOptional = await build([
      await session(), await calibration(),
      await macro(41, {
        status: "blocked", direction: "unknown", recommendation: "no_action",
        data_health: { status: "critical", freshness_minutes: 41, completeness: 0, issues: ["y"] },
      }),
    ]);
    expect(readiness(withBlockedOptional)).toBe("blocked_not_calibrated");
    expect(withBlockedOptional.status).toBe("supported");
    expect(withBlockedOptional.data_health.status).toBe("healthy");
  });

  it("instrument / timeframe / trace mismatch => blocked_contract_mismatch", async () => {
    const e = await build([
      await session(), await calibration(271, { trace_id: "other-trace" }),
    ]);
    expect(readiness(e)).toBe("blocked_contract_mismatch");
    const f = await build([await session(15, { instrument: "EURUSD" }), await calibration()]);
    expect(readiness(f)).toBe("blocked_contract_mismatch");
  });

  it("future-dated evidence is rejected and never spoofed to a negative age", async () => {
    const e = await build([await session(-30), await calibration()]);
    expect(readiness(e)).toBe("blocked_future_dated_evidence");
    expect(e.observations.every((o) => (o.value_num ?? 0) >= 0 || !/age_minutes/.test(o.key))).toBe(true);
  });

  it("is order independent and dedupes identical duplicates; conflicting duplicates fail closed", async () => {
    const s = await session(), c = await calibration(), p = await pattern();
    const a = await build([s, c, p]);
    const b = await build([p, c, s]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));

    const dup = await build([s, c, { ...s }]);
    expect(readiness(dup)).toBe("blocked_not_calibrated");

    const conflicting = await build([s, c, await session(16)]);
    expect(readiness(conflicting)).toBe("blocked_conflicting_evidence");
  });

  it("recomputes the evidence hash and catches tampering or unsealed input", async () => {
    const s = await session();
    const tampered = { ...s, observations: [...s.observations, { key: "extra", kind: "state" as const, value_text: "x" }] };
    const e = await build([tampered, await calibration()]);
    expect(readiness(e)).toBe("blocked_contract_mismatch");
    expect(reasons(e).join(" ")).toContain("evidence_hash_mismatch_or_unsealed");

    const unsealed = { ...s, evidence_hash: undefined };
    expect(readiness(await build([unsealed, await calibration()]))).toBe("blocked_contract_mismatch");
  });

  it("a synthetic future-ready fixture reports readiness ONLY — never geometry or action", async () => {
    const e = await buildOpportunityRiskEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      evidence: [
        await session(),
        await calibration(271, { observations: calObs(2, "approved_for_production") }),
      ],
      promoted_state_variables: ["synthetic_future_variable_a", "synthetic_future_variable_b"],
      run_id: "run_ready", trace_id: TRACE,
    });
    expect(readiness(e)).toBe("ready_for_future_construction");
    expect(e.observations.find((o) => o.key === "construction_allowed")!.value_text)
      .toBe("prerequisites_satisfied_for_future_module_only");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    expect(JSON.stringify(e.uncertainty.limitations)).toContain("NOT a trade authorization");
    const keys = e.observations.map((o) => o.key).join(" ");
    for (const t of ["entry", "stop", "target", "size", "order"]) expect(keys).not.toContain(t);
  });
});

describe("2D.2i — truthfulness invariants", () => {
  const geometry = [
    "entry", "zone", "stop", "sl", "invalidation_price", "target", "tp", "rr",
    "reward", "risk_reward", "lot", "position", "order", "buy", "sell",
    "break_even", "breakeven", "trailing", "partial",
  ];
  const forecast = [
    "probability", "confidence", "likelihood", "expected_value", "forecast",
    "score", "rating", "edge_pct", "odds", "win_rate",
  ];

  it("emits no trade geometry, no probability/EV, no causal key and never long/short/mixed", async () => {
    const envelopes = [
      await build([await session(), await calibration()]),
      await build([await session()]),
      await build([await session(61), await calibration()]),
    ];
    for (const e of envelopes) {
      expect(["neutral", "unknown"]).toContain(e.direction);
      const keys = e.observations.map((o) => o.key.toLowerCase());
      for (const k of keys) {
        for (const t of [...geometry, ...forecast, "causal", "because"]) {
          expect(k.includes(t)).toBe(false);
        }
      }
      const body = JSON.stringify(e).toLowerCase();
      for (const t of ["probability of", "expected value", "take profit", "stop loss", "risk:reward"]) {
        expect(body).not.toContain(t);
      }
      expect(validateEvidence(e)).toEqual([]);
    }
  });

  it("cites only its own spec and consumed evidence hashes, never Falconer or fake calibration", async () => {
    const e = await build([await session(), await calibration(), await macro()]);
    expect(e.provenance_refs[0]).toMatch(/^spec:ron_opportunity_risk_foundation:v1:[0-9a-f]{64}$/);
    for (const r of e.provenance_refs.slice(1)) expect(r).toMatch(/^evidence:[a-z_]+:v1:[0-9a-f]{64}$/);
    expect(e.provenance_refs.join(" ")).not.toContain("falconer");
  });
});
