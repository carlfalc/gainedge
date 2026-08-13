/**
 * Phase 2D.2a — RON Agentic Core v1 acceptance tests.
 * Contract, authority, determinism, safety and grounding invariants.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EVIDENCE_TTL_POLICY_V1, FALCONER_AUTHORITY, RON_AGENT_IDS, RON_AGENT_REGISTRY,
  RON_EVIDENCE_SCHEMA_VERSION, agentSpec, canonicalize, scanDenylist, sealEvidence,
  validateEvidence, type EvidenceEnvelopeV1, type RonAgentId,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  RON_ORCHESTRATOR_VERSION, assertGrounded, canonicalOrder, reconstructDecision,
  synthesizeDecision, type OrchestrationContext,
} from "../../supabase/functions/_shared/ron-orchestrator.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const CTX: OrchestrationContext = {
  trace_id: "trace_2d2a", instrument: "XAUUSD", timeframe: "15m",
  as_of: "2026-08-13T04:00:00Z",
};

function env(agent_id: RonAgentId, over: Partial<EvidenceEnvelopeV1> = {}): EvidenceEnvelopeV1 {
  return {
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id,
    agent_version: agentSpec(agent_id)!.agent_version,
    run_id: `run_${agent_id}`,
    trace_id: CTX.trace_id,
    instrument: "XAUUSD",
    timeframe: "15m",
    as_of: "2026-08-13T03:45:00Z",
    source_timestamps: { bar_time: "2026-08-13T03:45:00Z" },
    observations: [{ key: "bar_close", kind: "measurement", value_num: 2411.5, unit: "usd" }],
    provenance_refs: ["lineage_2d1g"],
    data_health: { status: "healthy", freshness_minutes: 15, completeness: 1, issues: [] },
    uncertainty: { level: "unquantified", limitations: ["no promoted state variables"] },
    conflicts: [],
    dependencies: [],
    status: "supported",
    recommendation: "context_only",
    ...over,
  };
}

const base = () => [env("session_market_structure"), env("calibration_model_validation")];

describe("2D.2a A — registry", () => {
  it("declares exactly the seven specialist ids at version 1", () => {
    expect([...RON_AGENT_IDS].sort()).toEqual([
      "calibration_model_validation", "cross_asset_correlation", "falconer_signal_source",
      "macro_news_geopolitics", "opportunity_risk", "pattern_context",
      "session_market_structure",
    ]);
    for (const a of RON_AGENT_REGISTRY) expect(a.agent_version).toBe(1);
  });

  it("makes Falconer strategy-context-only and lowest authority", () => {
    const f = agentSpec("falconer_signal_source")!;
    expect(FALCONER_AUTHORITY).toBe("strategy_context_only");
    expect(f.non_authoritative).toBe(true);
    expect(f.authority_class).toBe("strategy_context");
    expect(f.source_health_authoritative).toBe(false);
  });
});

describe("2D.2a B — evidence contract", () => {
  it("accepts a well-formed envelope and seals it with a content hash", async () => {
    const sealed = await sealEvidence(env("pattern_context"));
    expect(sealed.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed on unknown schema version, agent id and agent version", () => {
    expect(validateEvidence({ ...env("pattern_context"), schema_version: 2 }))
      .toContain("unknown_schema_version: 2");
    expect(validateEvidence({ ...env("pattern_context"), agent_id: "oracle" })
      .join(" ")).toContain("unknown_agent_id: oracle");
    expect(validateEvidence({ ...env("pattern_context"), agent_version: 9 })
      .join(" ")).toContain("unknown_agent_version");
  });

  it("rejects malformed structure and non-UTC timestamps", () => {
    expect(validateEvidence(null)).toEqual(["envelope_not_an_object"]);
    expect(validateEvidence({ ...env("pattern_context"), as_of: "13/08/2026" }))
      .toContain("as_of_not_utc_iso");
    expect(validateEvidence({
      ...env("pattern_context"), source_timestamps: { bar: "2026-08-13 03:45" },
    })).toContain("source_timestamp_not_utc_iso: bar");
    expect(validateEvidence({
      ...env("pattern_context"), observations: [{ key: "x", kind: "vibes" }],
    }).join(" ")).toContain("observation_unknown_kind");
  });

  it("rejects numeric probability fields recursively", () => {
    const reasons = validateEvidence({
      ...env("pattern_context"),
      uncertainty: { level: "low", limitations: [], confidence_pct: 71 },
    } as unknown);
    expect(reasons.join(" ")).toContain("probability_key_forbidden");
    expect(validateEvidence({
      ...env("pattern_context"),
      observations: [{ key: "win_probability", kind: "measurement", value_num: 0.6 }],
    }).join(" ")).toContain("probability_key_forbidden");
  });

  it("rejects secret / private-account shaped keys and values recursively", () => {
    const hits = scanDenylist({ a: { b: [{ metaapi_account_id: "x", balance: 1 }] } });
    expect(hits.map((h) => h.rule)).toContain("secret_or_private_account_key_forbidden");
    expect(scanDenylist({ note: "Bearer abcdefghijklmnopqrstuv" })[0].rule)
      .toBe("secret_value_shape");
    expect(validateEvidence({
      ...env("pattern_context"), dependencies: [], api_key: "sk-abcdefghijklmnopqrst",
    } as unknown).join(" ")).toContain("secret_or_private_account_key_forbidden");
  });

  it("rejects free-form causal claim keys", () => {
    expect(validateEvidence({ ...env("macro_news_geopolitics"), caused_by: "cpi" } as unknown)
      .join(" ")).toContain("causal_claim_key_forbidden");
  });
});

describe("2D.2a C — deterministic synthesis", () => {
  it("is order independent and hash stable", async () => {
    const a = await synthesizeDecision(base(), CTX);
    const b = await synthesizeDecision([...base()].reverse(), CTX);
    expect(a.decision.decision_hash).toBe(b.decision.decision_hash);
    expect(a.explanation.explanation_hash).toBe(b.explanation.explanation_hash);
    expect(a.decision.decision_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canonically serializes independent of key order", () => {
    expect(canonicalize({ b: 1, a: [2, { d: 4, c: 3 }] }))
      .toBe(canonicalize({ a: [2, { c: 3, d: 4 }], b: 1 }));
  });

  it("orders inputs by authority rank", async () => {
    const ordered = canonicalOrder([env("falconer_signal_source"), ...base()]);
    expect(ordered.map((e) => e.agent_id)).toEqual([
      "calibration_model_validation", "session_market_structure", "falconer_signal_source",
    ]);
  });

  it("rejects an unvalidated or mismatched batch", async () => {
    await expect(synthesizeDecision([], CTX)).rejects.toThrow(/empty_evidence_batch/);
    await expect(synthesizeDecision(
      [env("session_market_structure", { instrument: "NAS100" })], CTX,
    )).rejects.toThrow(/instrument_mismatch/);
    await expect(synthesizeDecision(
      [env("session_market_structure"), env("session_market_structure")], CTX,
    )).rejects.toThrow(/duplicate_agent_evidence/);
  });
});

describe("2D.2a D — state machine", () => {
  it("degrades to INSUFFICIENT_EVIDENCE when an expected specialist is missing", async () => {
    const { decision } = await synthesizeDecision([env("session_market_structure")], CTX);
    expect(decision.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.coverage.missing_expected_agents).toEqual(["calibration_model_validation"]);
    expect(decision.recommendation).toBe("wait");
  });

  it("DATA_BLOCKED on critical authoritative data health", async () => {
    const { decision } = await synthesizeDecision([
      env("session_market_structure", {
        data_health: { status: "critical", freshness_minutes: 15, completeness: 0.2, issues: ["gap"] },
      }),
      env("calibration_model_validation"),
    ], CTX);
    expect(decision.state).toBe("DATA_BLOCKED");
    expect(decision.blocking_reasons).toContain("critical_data_health: session_market_structure");
    expect(decision.direction).toBe("unknown");
  });

  it("DATA_BLOCKED when authoritative evidence is stale beyond TTL policy", async () => {
    const ttl = EVIDENCE_TTL_POLICY_V1.base_minutes_by_timeframe["15m"];
    expect(ttl).toBe(60);
    const { decision } = await synthesizeDecision([
      env("session_market_structure", { as_of: "2026-08-13T02:00:00Z" }),
      env("calibration_model_validation"),
    ], CTX);
    expect(decision.state).toBe("DATA_BLOCKED");
    expect(decision.data_health.stale_agents).toContain("session_market_structure");
  });

  it("records directional disagreement instead of fabricating consensus", async () => {
    const { decision } = await synthesizeDecision([
      env("session_market_structure", { direction: "long" }),
      env("calibration_model_validation"),
      env("pattern_context", { direction: "short" }),
    ], CTX);
    expect(decision.state).toBe("CONFLICTING_CONTEXT");
    expect(decision.direction).toBe("mixed");
    expect(decision.disagreements.some((d) => d.kind === "directional" && !d.non_binding)).toBe(true);
    expect(decision.agreements).toEqual([]);
  });

  it("Falconer can never override higher-authority facts", async () => {
    const { decision, explanation } = await synthesizeDecision([
      env("session_market_structure", { direction: "long" }),
      env("calibration_model_validation", { direction: "long" }),
      env("falconer_signal_source", { direction: "short" }),
    ], CTX);
    expect(decision.state).not.toBe("CONFLICTING_CONTEXT");
    expect(decision.direction).toBe("long");
    const strat = decision.disagreements.find((d) => d.kind === "strategy")!;
    expect(strat.non_binding).toBe(true);
    expect(explanation.missing_or_conflicting.join(" ")).toContain("non-binding");
    expect(explanation.why.join(" ")).toContain("strategy context only, not ground truth");
  });

  it("Falconer critical health cannot blockade RON", async () => {
    const { decision } = await synthesizeDecision([
      ...base(),
      env("falconer_signal_source", {
        data_health: { status: "critical", freshness_minutes: 1, completeness: 0, issues: ["offline"] },
      }),
    ], CTX);
    expect(decision.state).not.toBe("DATA_BLOCKED");
    expect(decision.data_health.authoritative_worst_status).toBe("healthy");
  });

  it("opportunity stays incomplete while zero state variables are promoted", async () => {
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    const { decision } = await synthesizeDecision([...base(), env("opportunity_risk")], CTX);
    expect(decision.state).toBe("OPPORTUNITY_INCOMPLETE");
    expect(decision.recommendation).toBe("opportunity_incomplete");
    expect(decision.promoted_state_variables).toEqual([]);
  });
});

describe("2D.2a E — safety invariants", () => {
  it("never emits a probability and never allows execution", async () => {
    for (const batch of [base(), [...base(), env("opportunity_risk")], [env("pattern_context")]]) {
      const { decision } = await synthesizeDecision(batch, CTX);
      expect(decision.numeric_probability).toBeNull();
      expect(decision.execution_allowed).toBe(false);
      expect(decision.execution_path).toBe("signal_only");
      expect(decision.orchestrator_version).toBe(RON_ORCHESTRATOR_VERSION);
    }
  });
});

describe("2D.2a F — Ask RON explanation grounding", () => {
  it("cites only evidence-backed content and never hides disagreement", async () => {
    const { decision, explanation } = await synthesizeDecision(base(), CTX);
    expect(explanation.source_refs).toContain("lineage_2d1g");
    expect(explanation.why.join(" ")).toContain("zero promoted state variables");
    expect(assertGrounded(explanation as unknown as Record<string, unknown>, base(), decision)).toEqual([]);
  });

  it("rejects invented prices, timestamps, directions, probabilities and causation", () => {
    const { as_of, timeframe } = CTX;
    const d = { as_of, timeframe, direction: "neutral" };
    const bad = (why: string[]) => assertGrounded({ why }, base(), d).join(" ");
    expect(bad(["price 9999.99 was tagged"])).toContain("ungrounded_number");
    expect(bad(["at 2026-01-01T00:00:00Z"])).toContain("ungrounded_timestamp");
    expect(bad(["direction is long"])).toContain("ungrounded_direction");
    expect(bad(["the setup has a 70% edge"])).toContain("probability_language");
    expect(bad(["gold rose because of the CPI print"])).toContain("causal_overclaim");
  });
});

describe("2D.2a G — reconstruction / replay", () => {
  it("replays stored evidence to the identical decision and explanation hash", async () => {
    const stored = await Promise.all(base().map(sealEvidence));
    const first = await synthesizeDecision(stored, CTX);
    const roundTripped = JSON.parse(JSON.stringify(stored)) as EvidenceEnvelopeV1[];
    const replay = await reconstructDecision(roundTripped.reverse(), CTX);
    expect(replay.decision.decision_hash).toBe(first.decision.decision_hash);
    expect(replay.explanation.explanation_hash).toBe(first.explanation.explanation_hash);
    expect(replay.decision.decision_id).toBe(first.decision.decision_id);
  });
});

describe("2D.2a H — persistence privileges", () => {
  const DIR = path.resolve(__dirname, "../../supabase/migrations");
  const sql = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => fs.readFileSync(path.join(DIR, f), "utf8")).join("\n").toLowerCase();
  const TABLES = [
    "ron_agent_registry", "ron_agent_runs", "ron_agent_evidence",
    "ron_orchestrator_decisions", "ron_decision_evidence",
  ];

  it("grants agentic-core tables to service_role only and never to anon/authenticated", () => {
    for (const t of TABLES) {
      expect(sql).toContain(`grant select, insert on public.${t} to service_role`);
      expect(sql).toContain(`revoke all on public.${t} from public, anon, authenticated`);
      expect(sql).toContain(`revoke update, delete, truncate on public.${t} from service_role`);
      expect(sql).not.toMatch(new RegExp(`grant[^;]*on public\\.${t} to [^;]*(anon|authenticated)`));
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
  });

  it("hard-constrains decisions to non-executable, probability-free rows", () => {
    expect(sql).toContain("check (numeric_probability is null)");
    expect(sql).toContain("check (execution_allowed = false)");
    expect(sql).toContain("check (execution_path = 'signal_only')");
  });
});