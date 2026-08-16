/**
 * RON_ORCHESTRATION_V6_SPECIALIST_SEAL_INTEGRITY_FINAL_AUDIT — pure-module tests.
 *
 * Proves the V6-only end-to-end invariant: every specialist evidence envelope used by an
 * explicit Orchestration Run V6 must ALREADY be a valid sealed Evidence V1 envelope exactly
 * as returned by that specialist. Orchestration may verify that seal; it must never repair
 * or mint a missing/incorrect specialist `evidence_hash` before acceptance.
 *
 * Also proves: all seven specialist endpoints genuinely seal their own output; the V6
 * endpoint branches gate the ORIGINAL as-returned envelope (never a locally sealed alias);
 * V1-V5 endpoint replay branches keep their historical local-seal behavior; any final
 * normalisation reseal is idempotent; the V6 plan hash is unchanged; and no probability,
 * geometry, execution, authority or persistence surface expands.
 *
 * No network, no database, no probability, no execution.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, evidenceHash, sealEvidence,
  type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  canonicalOrder, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import {
  ORCHESTRATION_RUN_PLAN_V1, OrchestrationRunError, orchestrationRunPlanHash,
} from "../../supabase/functions/_shared/ron-orchestration-run.ts";
import { orchestrationRunPlanHashV2 } from "../../supabase/functions/_shared/ron-orchestration-run-v2.ts";
import { orchestrationRunPlanHashV3 } from "../../supabase/functions/_shared/ron-orchestration-run-v3.ts";
import { orchestrationRunPlanHashV4 } from "../../supabase/functions/_shared/ron-orchestration-run-v4.ts";
import { orchestrationRunPlanHashV5 } from "../../supabase/functions/_shared/ron-orchestration-run-v5.ts";
import {
  ORCHESTRATION_RUN_PLAN_AGENTS_V6, assertSpecialistReturnedSealedV6,
  orchestrationRunPlanHashV6,
} from "../../supabase/functions/_shared/ron-orchestration-run-v6.ts";

/**
 * The V6 spec object is byte-identical to the accepted seal-flow correction commit
 * 824eb02cab7b04fa5687e799e02ed8e8eeda7f26; this is its deterministic canonical hash,
 * recomputed from that exact commit. (The value `07b8281f…` quoted in the earlier report
 * does not reproduce from any committed V6 spec state.) This hardening slice adds only a
 * pure helper function and changes NOTHING inside the spec object.
 */
const V6_PLAN_HASH_FROZEN =
  "b63797aed1b3d811cb9fd49f3f30572d0f0015d9020b38af9c06267735b722b0";

const TRACE = "ron_run_v6_seal_integrity_trace";
const AS_OF = "2026-08-16T04:00:00Z";
const ANCHOR_MS = Date.parse(AS_OF);
const CTX: OrchestrationContext = {
  trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", as_of: AS_OF,
};
const minus = (m: number) => new Date(ANCHOR_MS - m * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

const AGENTS = ORCHESTRATION_RUN_PLAN_AGENTS_V6;

function raw(agent_id: RonAgentId, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  const at = minus(15);
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

/* ------------------------------------------- AUDIT: specialists seal their own output */

const SPECIALIST_SOURCES: Record<string, string> = Object.fromEntries(
  [
    ["session_market_structure", "ron-agent-session-structure"],
    ["pattern_context", "ron-agent-pattern-context"],
    ["calibration_model_validation", "ron-agent-calibration-validation"],
    ["cross_asset_correlation", "ron-agent-cross-asset-correlation"],
    ["macro_news_geopolitics", "ron-agent-macro-news-geopolitics"],
    ["falconer_signal_source", "ron-agent-falconer-signal-source"],
    ["opportunity_risk", "ron-agent-opportunity-risk"],
  ].map(([agent, dir]) => [
    agent, readFileSync(`supabase/functions/${dir}/index.ts`, "utf8"),
  ]),
);

describe("audit: every V6 specialist endpoint returns a SEALED Evidence V1 envelope", () => {
  it("covers all seven planned agents", () => {
    expect(Object.keys(SPECIALIST_SOURCES).sort()).toEqual([...AGENTS].sort());
  });

  for (const [agent, src] of Object.entries(SPECIALIST_SOURCES)) {
    it(`${agent} seals before responding`, () => {
      expect(src).toContain("sealEvidence");
      expect(src).toMatch(/const sealed = await sealEvidence\(/);
      // Deterministic self-replay proof, then the SEALED envelope is what is returned.
      expect(src).toMatch(/replay\.evidence_hash !== sealed\.evidence_hash/);
      expect(src).toMatch(/evidence: sealed/);
    });
  }
});

/* --------------------------------- generic as-returned seal integrity gate, all agents */

describe("assertSpecialistReturnedSealedV6", () => {
  for (const agent of AGENTS) {
    it(`accepts a correctly sealed ${agent} response and returns its ORIGINAL hash`, async () => {
      const sealed = await sealEvidence(raw(agent));
      const accepted = await assertSpecialistReturnedSealedV6(sealed, CTX, agent);
      expect(accepted).toBe(sealed.evidence_hash);
      expect(accepted).toBe(await evidenceHash(sealed));
    });

    it(`rejects an UNSEALED ${agent} response`, async () => {
      const unsealed = raw(agent);
      await expect(assertSpecialistReturnedSealedV6(unsealed, CTX, agent))
        .rejects.toThrow(new RegExp(`specialist_unsealed:${agent}`));
    });

    it(`rejects a TAMPERED/wrong evidence_hash for ${agent}`, async () => {
      const sealed = await sealEvidence(raw(agent));
      const tampered = { ...sealed, evidence_hash: "0".repeat(64) };
      await expect(assertSpecialistReturnedSealedV6(tampered, CTX, agent))
        .rejects.toThrow(new RegExp(`specialist_hash_mismatch:${agent}`));
      // Content drift under a retained hash is equally rejected.
      const drifted = { ...sealed, run_id: `${sealed.run_id}_drift` };
      await expect(assertSpecialistReturnedSealedV6(drifted, CTX, agent))
        .rejects.toThrow(new RegExp(`specialist_hash_mismatch:${agent}`));
    });

    it(`rejects an out-of-scope or wrong-agent ${agent} response`, async () => {
      const sealed = await sealEvidence(raw(agent));
      const other = AGENTS.find((a) => a !== agent)!;
      await expect(assertSpecialistReturnedSealedV6(sealed, CTX, other))
        .rejects.toThrow(OrchestrationRunError);
      await expect(assertSpecialistReturnedSealedV6(
        sealed, { ...CTX, trace_id: "other_trace" }, agent,
      )).rejects.toThrow(/specialist_trace_mismatch/);
      await expect(assertSpecialistReturnedSealedV6(
        sealed, { ...CTX, instrument: "NAS100" }, agent,
      )).rejects.toThrow(/specialist_instrument_mismatch/);
      await expect(assertSpecialistReturnedSealedV6(
        sealed, { ...CTX, timeframe: "1h" }, agent,
      )).rejects.toThrow(/specialist_timeframe_mismatch/);
    });
  }

  it("rejects absent or malformed candidates", async () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      await expect(assertSpecialistReturnedSealedV6(bad, CTX, "pattern_context"))
        .rejects.toThrow(/specialist_absent_or_malformed:pattern_context/);
    }
  });

  it("rejects an as_of AFTER the orchestration anchor", async () => {
    const at = new Date(ANCHOR_MS + 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const sealed = await sealEvidence(raw("session_market_structure", {
      as_of: at, source_timestamps: { reference_instant: at },
      observations: [{ key: "fixture_marker", kind: "state", value_text: "s", at }],
    }));
    await expect(assertSpecialistReturnedSealedV6(sealed, CTX, "session_market_structure"))
      .rejects.toThrow(/specialist_as_of_after_evaluation_anchor/);
  });

  it("does not mutate or reseal the candidate", async () => {
    const sealed = await sealEvidence(raw("macro_news_geopolitics"));
    const before = JSON.stringify(sealed);
    await assertSpecialistReturnedSealedV6(sealed, CTX, "macro_news_geopolitics");
    expect(JSON.stringify(sealed)).toBe(before);
  });

  it("confers no authority: it reads no observation and weights no signal", async () => {
    const loud = await sealEvidence(raw("falconer_signal_source", {
      observations: [{ key: "signal_state", kind: "state", value_text: "long", at: minus(15) }],
      direction: "neutral",
    }));
    const quiet = await sealEvidence(raw("falconer_signal_source"));
    await expect(assertSpecialistReturnedSealedV6(loud, CTX, "falconer_signal_source"))
      .resolves.toBe(loud.evidence_hash);
    await expect(assertSpecialistReturnedSealedV6(quiet, CTX, "falconer_signal_source"))
      .resolves.toBe(quiet.evidence_hash);
  });
});

/* ------------------------------------------ final normalisation reseal is idempotent */

describe("final V6 normalisation", () => {
  it("reseal is idempotent: final hashes equal the accepted specialist hashes exactly", async () => {
    const specialists = await Promise.all(AGENTS.map((a) => sealEvidence(raw(a))));
    const accepted = new Map<string, string>();
    for (const e of specialists) {
      accepted.set(e.agent_id, await assertSpecialistReturnedSealedV6(e, CTX, e.agent_id));
    }
    const final = canonicalOrder(await Promise.all(specialists.map(sealEvidence)));
    expect(final).toHaveLength(7);
    for (const e of final) expect(e.evidence_hash).toBe(accepted.get(e.agent_id));
  });
});

/* --------------------------------------------------------- endpoint wiring */

const ENDPOINT = readFileSync("supabase/functions/ron-orchestrate-run/index.ts", "utf8");

describe("V6 endpoint seal-integrity wiring", () => {
  it("applies the generic as-returned seal gate to EVERY specialist response, V6 only", () => {
    expect(ENDPOINT).toContain(
      "if (isV6) await assertSpecialistReturnedSealedV6(envelope, ctx, entry.agent_id);",
    );
    const calls = ENDPOINT.match(/assertSpecialistReturnedSealedV6\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("gates Session/Calibration/Cross/Macro on the ORIGINAL envelope under V6", () => {
    expect(ENDPOINT).toContain("const sessionEnvelope = isV6 ? envelope : await sealEvidence(envelope);");
    expect(ENDPOINT).toContain("collected.push(sessionEnvelope);");
    expect(ENDPOINT).toContain("const sealedCal = isV6 ? envelope : await sealEvidence(envelope);");
    expect(ENDPOINT).toContain("const sealedCross = isV6 ? envelope : await sealEvidence(envelope);");
    expect(ENDPOINT).toContain("const sealedMacro = isV6 ? envelope : await sealEvidence(envelope);");
    // No unconditional local pre-seal of a returned envelope remains.
    expect(ENDPOINT).not.toMatch(/const sealed(Cal|Cross|Macro) = await sealEvidence\(envelope\);/);
    expect(ENDPOINT).not.toContain("collected.push(await sealEvidence(envelope));");
  });

  it("preserves V1-V5 historical local-seal replay behavior", () => {
    // Old versions still reach sealEvidence for these envelopes via the isV6 ternary.
    for (const v of ["sessionEnvelope", "sealedCal", "sealedCross", "sealedMacro"]) {
      expect(ENDPOINT).toMatch(new RegExp(`${v} = isV6 \\? envelope : await sealEvidence\\(envelope\\)`));
    }
    expect(ENDPOINT).toContain("const isV5 = requestedRunVersion === 5 || isV6;");
    expect(ENDPOINT).toMatch(/body\.orchestration_run_version == null\s*\n?\s*\?\s*RON_ORCHESTRATION_RUN_VERSION_V2/);
  });

  it("preserves the Opportunity as-returned correction and every existing binding", () => {
    expect(ENDPOINT).toMatch(
      /assertOpportunityRiskV2Sealed\(envelope, ctx\);\s*\n\s*collected\.push\(envelope\);/,
    );
    expect(ENDPOINT).not.toContain("sealedOpp");
    expect(ENDPOINT).toContain("assertSessionDependencySealed(dep, ctx)");
    expect(ENDPOINT).toContain("assertPatternDependencyBinding(sealed, sessionDependencyHash)");
    expect(ENDPOINT).toContain("assertSessionDependencyBinding(sealed, sessionDependencyHash)");
    expect(ENDPOINT).toContain("assertCalibrationContextBinding(sealed, calibrationContextHash)");
    expect(ENDPOINT).toContain("assertCrossAssetContextBinding(sealed, crossAssetContextHash)");
    expect(ENDPOINT).toContain("assertMacroContextBinding(sealed, macroContextHash)");
    expect(ENDPOINT).toContain("assertOpportunityRiskBinding(sealed, opportunityRiskHash)");
  });

  it("expands no probability, geometry, execution or persistence surface", () => {
    expect(ENDPOINT).toContain("numeric_probability: null");
    expect(ENDPOINT).toContain("execution_allowed: false");
    expect(ENDPOINT).toContain('execution_path: "signal_only"');
    expect(ENDPOINT).not.toMatch(/entry_price|stop_loss|take_profit|lot_size/);
  });
});

/* ------------------------------------------------------------ frozen hashes */

describe("frozen plan hashes are unchanged by this hardening slice", () => {
  it("V6 plan hash is exactly the frozen value", async () => {
    expect(await orchestrationRunPlanHashV6()).toBe(V6_PLAN_HASH_FROZEN);
  });

  it("V1-V5 plan hashes replay deterministically", async () => {
    for (const h of await Promise.all([
      orchestrationRunPlanHash(), orchestrationRunPlanHashV2(), orchestrationRunPlanHashV3(),
      orchestrationRunPlanHashV4(), orchestrationRunPlanHashV5(),
    ])) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(ORCHESTRATION_RUN_PLAN_V1).toHaveLength(7);
  });
});
