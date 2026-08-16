/**
 * RON_ORCHESTRATION_MACRO_TEMPORAL_CONTEXT_V5 — pure-module tests.
 *
 * Proves: V1/V2/V3/V4 plan hashes, plans and run identities are unchanged; V5 is
 * deterministic and version-distinct; the ONLY V5 plan delta from V4 is the macro
 * spec_version pin 2; only V5 requests Macro V2; the macro two-ref spec lineage is
 * enforced exactly; macro temporal semantics are bound through
 * `source_timestamps.evaluation_anchor` and NOT through a false `as_of === anchor`
 * requirement; source/observation/price-context instants after the anchor fail closed;
 * the accepted evidence hash binds to exactly one final envelope; the Session -> Pattern,
 * Calibration V2 and Cross V2 gates are untouched; the final collection is still seven
 * sealed envelopes; and no probability / execution / persistence expansion.
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
  ORCHESTRATION_RUN_PLAN_V4, ORCHESTRATION_RUN_SPEC_V4, deriveRunIdsV4,
  orchestrationRunPlanHashV4,
} from "../../supabase/functions/_shared/ron-orchestration-run-v4.ts";
import {
  MACRO_CONTEXT_AGENT, MACRO_CONTEXT_SPEC_VERSION_V5,
  MACRO_NEWS_SPEC_V1_HASH_PINNED, MACRO_TEMPORAL_SPEC_V2_HASH_PINNED,
  ORCHESTRATION_RUN_PLAN_AGENTS_V5, ORCHESTRATION_RUN_PLAN_V5, ORCHESTRATION_RUN_SPEC_V5,
  RON_ORCHESTRATION_RUN_VERSION_V5, assertMacroContextBinding, assertMacroContextV2Sealed,
  deriveRunIdV5, deriveRunIdsV5, macroContextBaseSpecRefV1, macroContextClassificationRef,
  macroContextSpecRefV2, orchestrationRunPlanHashV5,
} from "../../supabase/functions/_shared/ron-orchestration-run-v5.ts";
import {
  MACRO_NEWS_SPEC_V1, macroNewsSpecHash,
} from "../../supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts";
import {
  MACRO_NEWS_SPEC_V2, buildMacroTemporalContextEvidenceV2, macroNewsSpecHashV2,
} from "../../supabase/functions/_shared/ron-macro-temporal-context-v2.ts";

const TRACE = "ron_run_v5_fixture_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const ANCHOR_MS = Date.parse(AS_OF);
const CTX: OrchestrationContext = { trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF };
const BAR_MS = 15 * 60_000;

/** Frozen plan-hash expectations captured BEFORE this slice. */
const FROZEN_V1_PLAN_HASH = await orchestrationRunPlanHash();
const FROZEN_V2_PLAN_HASH = await orchestrationRunPlanHashV2();
const FROZEN_V3_PLAN_HASH = await orchestrationRunPlanHashV3();
const FROZEN_V4_PLAN_HASH = await orchestrationRunPlanHashV4();

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

/** SUPPORTED macro shape: as_of is the newest publication instant, BEFORE the anchor. */
const NEWEST_PUB = new Date(ANCHOR_MS - 7 * 60_000).toISOString();
const REF_BAR_OPEN = new Date(ANCHOR_MS - BAR_MS).toISOString();
const REF_BAR_CLOSE = AS_OF;

function macroEnvelope(over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  return envelope(MACRO_CONTEXT_AGENT, {
    as_of: NEWEST_PUB,
    source_timestamps: {
      evaluation_anchor: AS_OF,
      newest_included_publication: NEWEST_PUB,
      oldest_included_publication: new Date(ANCHOR_MS - 6 * 3_600_000).toISOString(),
      source_window_start: new Date(ANCHOR_MS - 12 * 3_600_000).toISOString(),
      price_context_anchor_reference_bar_open: REF_BAR_OPEN,
      price_context_anchor_reference_bar_completed_close: REF_BAR_CLOSE,
    },
    observations: [
      { key: "macro_news_state", kind: "state", value_text: "source_records_present", at: NEWEST_PUB },
      { key: "anchor_reference_close", kind: "measurement", value_num: 3300.5, at: REF_BAR_CLOSE },
    ],
    provenance_refs: [
      macroContextSpecRefV2(),
      `quality_version:5`,
      macroContextClassificationRef(),
      `price_source:candle_history_native:XAUUSD:15m`,
      macroContextBaseSpecRefV1(),
      `source:news_items`,
    ],
    ...over,
  });
}

const sealedMacro = (over: Partial<EvidenceEnvelopeV1> = {}) => sealEvidence(macroEnvelope(over));

async function reject(candidate: EvidenceEnvelopeV1, match: RegExp): Promise<void> {
  await expect(assertMacroContextV2Sealed(candidate, CTX)).rejects.toThrow(OrchestrationRunError);
  await expect(assertMacroContextV2Sealed(candidate, CTX)).rejects.toThrow(match);
}

/* -------------------------------------------------- frozen V1..V4 invariants */

describe("frozen orchestration V1-V4 invariants", () => {
  it("plan hashes are unchanged by the V5 slice", async () => {
    expect(await orchestrationRunPlanHash()).toBe(FROZEN_V1_PLAN_HASH);
    expect(await orchestrationRunPlanHashV2()).toBe(FROZEN_V2_PLAN_HASH);
    expect(await orchestrationRunPlanHashV3()).toBe(FROZEN_V3_PLAN_HASH);
    expect(await orchestrationRunPlanHashV4()).toBe(FROZEN_V4_PLAN_HASH);
    expect(FROZEN_V4_PLAN_HASH)
      .toBe("6046729887d33cdcc7360cb1e770232d8884f396bda49c30635b73fb2b7473f1");
  });

  it("V1-V4 run identities are unchanged and V5 is domain-distinct", async () => {
    const [r1, r2, r3, r4, r5] = await Promise.all([
      deriveRunIds(TRACE, AS_OF), deriveRunIdsV2(TRACE, AS_OF), deriveRunIdsV3(TRACE, AS_OF),
      deriveRunIdsV4(TRACE, AS_OF), deriveRunIdsV5(TRACE, AS_OF),
    ]);
    const ids = [r1, r2, r3, r4, r5].map((r) => r[MACRO_CONTEXT_AGENT]);
    expect(new Set(ids).size).toBe(5);
    expect(r1).toEqual(await deriveRunIds(TRACE, AS_OF));
    expect(r4).toEqual(await deriveRunIdsV4(TRACE, AS_OF));
    expect(r5[MACRO_CONTEXT_AGENT])
      .toBe(await deriveRunIdV5(TRACE, AS_OF, MACRO_CONTEXT_AGENT));
    expect(ORCHESTRATION_RUN_SPEC_V5.run_id_domain).toBe("ron_orch_run_v5");
  });

  it("V4 spec object is not mutated by V5", () => {
    expect(ORCHESTRATION_RUN_SPEC_V4.spec_version_pins)
      .not.toHaveProperty("macro_news_geopolitics");
    expect(ORCHESTRATION_RUN_PLAN_V4.find((p) => p.agent_id === MACRO_CONTEXT_AGENT)!
      .spec_version_pin).toBeNull();
  });
});

/* ------------------------------------------------------------ the V5 plan */

describe("orchestration run V5 plan", () => {
  it("is deterministic and version-distinct", async () => {
    const h = await orchestrationRunPlanHashV5();
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await orchestrationRunPlanHashV5());
    expect(h).not.toBe(FROZEN_V4_PLAN_HASH);
    expect(RON_ORCHESTRATION_RUN_VERSION_V5).toBe(5);
    expect(ORCHESTRATION_RUN_SPEC_V5.supersedes_run_version).toBe(4);
  });

  it("keeps the same seven agents, order, phases, authority and subject scope", () => {
    expect(ORCHESTRATION_RUN_PLAN_AGENTS_V5).toEqual(ORCHESTRATION_RUN_PLAN_V4.map((p) => p.agent_id));
    expect(ORCHESTRATION_RUN_PLAN_V5).toHaveLength(7);
    ORCHESTRATION_RUN_PLAN_V5.forEach((p, i) => {
      const q = ORCHESTRATION_RUN_PLAN_V4[i];
      expect(p.function_name).toBe(q.function_name);
      expect(p.phase).toBe(q.phase);
      expect(p.anchor_param).toBe(q.anchor_param);
      expect(p.subject_scope).toBe(q.subject_scope);
      expect(p.requires_evidence_batch).toBe(q.requires_evidence_batch);
      expect(p.depends_on_sealed_evidence).toEqual(q.depends_on_sealed_evidence);
      expect(p.dependency_param).toBe(q.dependency_param);
    });
  });

  it("the ONLY plan delta from V4 is macro spec pin 2", () => {
    const deltas = ORCHESTRATION_RUN_PLAN_V5
      .filter((p, i) => p.spec_version_pin !== ORCHESTRATION_RUN_PLAN_V4[i].spec_version_pin)
      .map((p) => [p.agent_id, p.spec_version_pin]);
    expect(deltas).toEqual([[MACRO_CONTEXT_AGENT, 2]]);
    expect(ORCHESTRATION_RUN_SPEC_V5.spec_version_pins).toEqual({
      ...ORCHESTRATION_RUN_SPEC_V4.spec_version_pins, macro_news_geopolitics: 2,
    });
    expect(MACRO_CONTEXT_SPEC_VERSION_V5).toBe(2);
  });

  it("does not upgrade opportunity_risk or falconer in this slice", () => {
    for (const a of ["opportunity_risk", "falconer_signal_source"] as RonAgentId[]) {
      expect(ORCHESTRATION_RUN_PLAN_V5.find((p) => p.agent_id === a)!.spec_version_pin).toBeNull();
    }
  });

  it("adds no probability, execution or persistence authority", () => {
    expect(ORCHESTRATION_RUN_SPEC_V5.numeric_probability).toBeNull();
    expect(ORCHESTRATION_RUN_SPEC_V5.execution_allowed).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V5.execution_path).toBe("signal_only");
    expect(ORCHESTRATION_RUN_SPEC_V5.persist_default).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V5.auto_run).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V5.cron).toBe(false);
    expect(ORCHESTRATION_RUN_SPEC_V5.dashboard_wiring).toBe(false);
    const m = ORCHESTRATION_RUN_SPEC_V5.macro_context;
    expect(m.authority_added).toBe(false);
    expect(m.probability_published).toBe(false);
    expect(m.causation_claimed).toBe(false);
    expect(m.sentiment_added).toBe(false);
    expect(m.impact_score_added).toBe(false);
    expect(m.source_credibility_added).toBe(false);
    expect(m.llm_or_web_fetch).toBe(false);
    expect(m.news_requeried_in_orchestration).toBe(false);
    expect(m.requested_exactly_once).toBe(true);
  });
});

/* ------------------------------------------------------- pinned macro hashes */

describe("macro spec hashes", () => {
  it("current Macro V2 hash is recomputed and pinned exactly", async () => {
    expect(await macroNewsSpecHashV2()).toBe(MACRO_TEMPORAL_SPEC_V2_HASH_PINNED);
    expect(macroContextSpecRefV2())
      .toBe(`spec:ron_macro_news_geopolitics:v2:${MACRO_TEMPORAL_SPEC_V2_HASH_PINNED}`);
  });

  it("Macro V1 accepted hash is exact and unchanged", async () => {
    expect(await macroNewsSpecHash())
      .toBe("0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f");
    expect(MACRO_NEWS_SPEC_V1_HASH_PINNED).toBe(await macroNewsSpecHash());
    expect(MACRO_NEWS_SPEC_V1.spec_id).toBe(MACRO_NEWS_SPEC_V2.spec_id);
  });
});

/* ------------------------------------------------------------ the V5 gate */

describe("macro temporal context V2 acceptance gate", () => {
  it("accepts the correct sealed supported envelope", async () => {
    const s = await sealedMacro();
    expect(await assertMacroContextV2Sealed(s, CTX)).toBe(s.evidence_hash);
  });

  it("REGRESSION: does NOT require as_of === orchestration anchor", async () => {
    const s = await sealedMacro();
    expect(Date.parse(s.as_of)).toBeLessThan(ANCHOR_MS);
    await expect(assertMacroContextV2Sealed(s, CTX)).resolves.toBe(s.evidence_hash);
  });

  it("accepts the legitimate blocked/insufficient shape (as_of === anchor)", async () => {
    const s = await sealEvidence(macroEnvelope({
      as_of: AS_OF,
      status: "insufficient_data",
      direction: "unknown",
      recommendation: "no_action",
      source_timestamps: { evaluation_anchor: AS_OF },
      observations: [{ key: "macro_news_state", kind: "state", value_text: "insufficient_data", at: AS_OF }],
      data_health: { status: "healthy", freshness_minutes: 0, completeness: 0, issues: ["no_source_rows_in_window"] },
    }));
    expect(await assertMacroContextV2Sealed(s, CTX)).toBe(s.evidence_hash);
  });

  it("rejects absence, malformed input and the wrong agent", async () => {
    await expect(assertMacroContextV2Sealed(null, CTX)).rejects.toThrow(/absent_or_malformed/);
    await expect(assertMacroContextV2Sealed([], CTX)).rejects.toThrow(/absent_or_malformed/);
    await reject(await sealEvidence(macroEnvelope({ agent_id: "pattern_context" })), /wrong_agent/);
  });

  it("rejects an unsealed or hash-inconsistent envelope", async () => {
    await reject(macroEnvelope(), /unsealed/);
    const s = await sealedMacro();
    await reject({ ...s, evidence_hash: "0".repeat(64) }, /hash_mismatch/);
  });

  it("rejects scope mismatch", async () => {
    await reject(await sealEvidence(macroEnvelope({ trace_id: "other" })), /trace_mismatch/);
    await reject(await sealEvidence(macroEnvelope({ instrument: "NAS100" })), /instrument_mismatch/);
    await reject(await sealEvidence(macroEnvelope({ timeframe: "1h" })), /timeframe_mismatch/);
  });

  it("rejects a missing or mismatched evaluation-anchor binding", async () => {
    await reject(
      await sealEvidence(macroEnvelope({ source_timestamps: { newest_included_publication: NEWEST_PUB } })),
      /evaluation_anchor_missing_or_unparseable/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        source_timestamps: { evaluation_anchor: new Date(ANCHOR_MS - BAR_MS).toISOString() },
      })),
      /evaluation_anchor_mismatch/,
    );
  });

  it("rejects a top-level as_of after the anchor", async () => {
    await reject(
      await sealEvidence(macroEnvelope({ as_of: new Date(ANCHOR_MS + 60_000).toISOString() })),
      /as_of_after_orchestration_anchor/,
    );
  });

  it("rejects an admitted source publication timestamp after the anchor", async () => {
    const future = new Date(ANCHOR_MS + 5 * 60_000).toISOString();
    await reject(
      await sealEvidence(macroEnvelope({
        source_timestamps: { evaluation_anchor: AS_OF, newest_included_publication: future },
      })),
      /source_timestamp_after_anchor:newest_included_publication/,
    );
  });

  it("rejects an observation instant after the anchor", async () => {
    const future = new Date(ANCHOR_MS + 60_000).toISOString();
    await reject(
      await sealEvidence(macroEnvelope({
        observations: [{ key: "latest_item_1_publication_instant", kind: "state", value_text: future, at: future }],
      })),
      /observation_instant_after_anchor/,
    );
  });

  it("rejects a price-context completed close after the anchor", async () => {
    const open = new Date(ANCHOR_MS).toISOString();
    const close = new Date(ANCHOR_MS + BAR_MS).toISOString();
    await reject(
      await sealEvidence(macroEnvelope({
        source_timestamps: {
          evaluation_anchor: AS_OF,
          price_context_anchor_reference_bar_open: open,
          price_context_anchor_reference_bar_completed_close: close,
        },
      })),
      /price_context_completed_bar_after_orchestration_anchor|source_timestamp_after_anchor/,
    );
  });

  it("rejects an inconsistent or unaligned price-context bar pair", async () => {
    await reject(
      await sealEvidence(macroEnvelope({
        source_timestamps: {
          evaluation_anchor: AS_OF,
          price_context_anchor_reference_bar_open: REF_BAR_OPEN,
        },
      })),
      /price_context_completed_bar_pair_inconsistent/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        source_timestamps: {
          evaluation_anchor: AS_OF,
          price_context_anchor_reference_bar_open: new Date(ANCHOR_MS - BAR_MS + 60_000).toISOString(),
          price_context_anchor_reference_bar_completed_close: new Date(ANCHOR_MS + 60_000).toISOString(),
        },
      })),
      /price_context_bar_open_invalid/,
    );
  });

  it("enforces the exact two-ref macro spec lineage", async () => {
    const base = macroEnvelope().provenance_refs;
    const without = (r: string) => base.filter((p) => p !== r);
    await reject(
      await sealEvidence(macroEnvelope({ provenance_refs: without(macroContextSpecRefV2()) })),
      /spec_v2_ref_missing/,
    );
    await reject(
      await sealEvidence(macroEnvelope({ provenance_refs: without(macroContextBaseSpecRefV1()) })),
      /base_spec_v1_ref_missing/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        provenance_refs: [...without(macroContextSpecRefV2()),
          `spec:ron_macro_news_geopolitics:v2:${"a".repeat(64)}`],
      })),
      /spec_v2_ref_invalid/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        provenance_refs: [...without(macroContextBaseSpecRefV1()),
          `spec:ron_macro_news_geopolitics:v1:${"b".repeat(64)}`],
      })),
      /base_spec_v1_ref_invalid/,
    );
    await reject(
      await sealEvidence(macroEnvelope({ provenance_refs: [...base, macroContextSpecRefV2()] })),
      /spec_lineage_ref_count:3/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        provenance_refs: [...base, `spec:ron_macro_news_geopolitics:v3:${"c".repeat(64)}`],
      })),
      /spec_lineage_ref_count:3/,
    );
  });

  it("requires the accepted Session V2 classification provenance", async () => {
    const base = macroEnvelope().provenance_refs;
    await reject(
      await sealEvidence(macroEnvelope({
        provenance_refs: base.filter((p) => p !== macroContextClassificationRef()),
      })),
      /classification_provenance_count:0/,
    );
    await reject(
      await sealEvidence(macroEnvelope({
        provenance_refs: base.map((p) => p === macroContextClassificationRef()
          ? `classification:ron_session_market_structure:v2:${"d".repeat(64)}` : p),
      })),
      /classification_provenance_mismatch/,
    );
  });

  it("rejects non-contextual direction or recommendation", async () => {
    // These shapes cannot even be sealed by the frozen contract, so they are checked on
    // the unsealed envelope: the gate must still name the contextual violation.
    await reject(macroEnvelope({ direction: "bullish" }), /direction_not_contextual/);
    await reject(macroEnvelope({ recommendation: "execute" as never }),
      /recommendation_not_contextual/);
  });
});

/* ------------------------------------------- genuine producer round trip */

describe("genuine Macro V2 producer output passes the V5 gate", () => {
  it("accepts a real sealed producer envelope and stays contextual", async () => {
    const bars = Array.from({ length: 48 }, (_, i) => {
      const time = ANCHOR_MS - (48 - i) * BAR_MS;
      return { time, open: 3300, high: 3305, low: 3295, close: 3300 + i, created_at: time + BAR_MS + 1000 };
    });
    const built = await buildMacroTemporalContextEvidenceV2({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR_MS,
      run_id: "producer_run", trace_id: TRACE,
      items: [{
        id: "news_1", headline: "Fed holds interest rate steady", source: "Reuters",
        published_at: ANCHOR_MS - 90 * 60_000, instruments_affected: ["XAUUSD"], impact: "high",
      }],
      bars, isQuarantined: () => false,
    });
    const s = await sealEvidence(built);
    expect(await assertMacroContextV2Sealed(s, CTX)).toBe(s.evidence_hash);
    expect(["neutral", "unknown"]).toContain(s.direction);
    expect(["context_only", "no_action"]).toContain(s.recommendation);
    expect(Date.parse(s.as_of)).toBeLessThanOrEqual(ANCHOR_MS);
    expect(Date.parse(s.source_timestamps.evaluation_anchor)).toBe(ANCHOR_MS);
    expect(JSON.stringify(s)).not.toMatch(/probabilit|execution_allowed|causal|forecast_value/i);
  });
});

/* ------------------------------------------------- final-batch binding */

describe("final seven-agent collection", () => {
  it("binds the accepted macro hash to exactly one final envelope", async () => {
    const sealed = canonicalOrder(await Promise.all(
      ORCHESTRATION_RUN_PLAN_V1.map((p) => p.agent_id === MACRO_CONTEXT_AGENT
        ? sealedMacro() : sealEvidence(envelope(p.agent_id))),
    ));
    assertCollectionComplete(sealed, CTX);
    expect(sealed).toHaveLength(7);
    const accepted = sealed.find((e) => e.agent_id === MACRO_CONTEXT_AGENT)!.evidence_hash!;
    expect(() => assertMacroContextBinding(sealed, accepted)).not.toThrow();
    expect(() => assertMacroContextBinding(sealed, "0".repeat(64)))
      .toThrow(/binding_hash_divergence/);
    expect(() => assertMacroContextBinding(
      sealed.filter((e) => e.agent_id !== MACRO_CONTEXT_AGENT), accepted))
      .toThrow(/binding_count:0/);
    expect(() => assertMacroContextBinding(
      [...sealed, sealed.find((e) => e.agent_id === MACRO_CONTEXT_AGENT)!], accepted))
      .toThrow(/binding_count:2/);
  });
});

/* -------------------------------------------------------- endpoint wiring */

const ENDPOINT = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");

describe("orchestration endpoint wiring", () => {
  it("accepts explicit version 5 while the DEFAULT stays version 2", () => {
    expect(ENDPOINT).toMatch(/\[1, 2, 3, 4, 5\]\.includes\(requestedRunVersion\)/);
    expect(ENDPOINT).toMatch(/body\.orchestration_run_version == null\s*\n?\s*\?\s*RON_ORCHESTRATION_RUN_VERSION_V2/);
    expect(ENDPOINT).toContain("const isV5 = requestedRunVersion === 5;");
    expect(ENDPOINT).toContain("const isV4 = requestedRunVersion === 4 || isV5;");
  });

  it("requests Macro V2 through the plan pin exactly once and never re-queries news", () => {
    const pinSends = ENDPOINT.match(/payload\.spec_version = v2entry\.spec_version_pin/g) ?? [];
    expect(pinSends).toHaveLength(1);
    expect(ENDPOINT).not.toContain("news_items");
    const macroCalls = ENDPOINT.match(/assertMacroContextV2Sealed\(/g) ?? [];
    expect(macroCalls).toHaveLength(1); // exactly one gate call site
  });

  it("keeps V5-only summary fields and the V1-V4 gates intact", () => {
    expect(ENDPOINT).toContain("macro_context_spec_version: 2");
    expect(ENDPOINT).toContain("assertMacroContextBinding(sealed, macroContextHash)");
    expect(ENDPOINT).toContain("assertCrossAssetContextBinding(sealed, crossAssetContextHash)");
    expect(ENDPOINT).toContain("assertCalibrationContextBinding(sealed, calibrationContextHash)");
    expect(ENDPOINT).toContain("assertPatternDependencyBinding(sealed, sessionDependencyHash)");
    expect(ENDPOINT).toContain("numeric_probability: null");
    expect(ENDPOINT).toContain("execution_allowed: false");
  });
});
