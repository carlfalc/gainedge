/**
 * RON_FALCONER_SIGNAL_SOURCE_IDENTITY_RECONCILIATION_AUDIT_V1 — PURE AUDIT.
 *
 * No runtime path, no specialist output and no strategy semantics are touched here.
 * This file exists to make the three historically-conflated Falconer identities
 * machine-checkable and permanently distinct:
 *
 *   1. STRATEGY IDENTITY (TypeScript port)  sha256(supabase/functions/_shared/falconer-strategy.ts)
 *      = 13736f1ed5dabd3f31a15b8db4179ed4e027950ed515034433ae6134a15581fc
 *   2. STRATEGY IDENTITY (canonical Pine)   sha256(strategy/falconer_v7_tp3.pine)
 *      = 76b242b4b4b2e1f2aa5bbb11a0a12ef9849ec40beda306fc5c5dd6899a8b9251
 *      -> this is the source of the historically-reported "76b242...9251" value.
 *   3. SIGNAL-SOURCE SPEC IDENTITY          falconerSignalSourceSpecHash()
 *      = 40a4b6f9d465ae0362e1a0ada43e3b699c2674efa30c5dbe9e5a934dcd1005f3
 *
 * (1)/(2) are STRATEGY hashes. (3) is a RON SPEC hash. They must never be swapped.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FALCONER_SIGNAL_SOURCE_SPEC_V1, falconerSignalSourceSpecHash,
  buildFalconerSignalSourceEvidenceV1,
} from "../../supabase/functions/_shared/ron-falconer-signal-source-spec.ts";
import { agentSpec, sealEvidence } from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  ORCHESTRATION_RUN_PLAN_V6, ORCHESTRATION_RUN_SPEC_V6,
} from "../../supabase/functions/_shared/ron-orchestration-run-v6.ts";

const STRATEGY_TS_SHA256 =
  "13736f1ed5dabd3f31a15b8db4179ed4e027950ed515034433ae6134a15581fc";
const STRATEGY_PINE_SHA256 =
  "76b242b4b4b2e1f2aa5bbb11a0a12ef9849ec40beda306fc5c5dd6899a8b9251";
const SIGNAL_SOURCE_SPEC_V1_HASH =
  "40a4b6f9d465ae0362e1a0ada43e3b699c2674efa30c5dbe9e5a934dcd1005f3";

/**
 * IMMUTABLE HISTORICAL AUDIT LEDGER (test-only, snapshot semantics).
 *
 * This is the conclusion the identity-reconciliation audit genuinely reached AT ITS
 * OWN SNAPSHOT, when the Falconer signal-source endpoint had NO explicit spec_version
 * selector. It must NEVER be rewritten to reflect later slices: the selector slice is
 * recorded separately in `ron-falconer-endpoint-version-selector-v1.test.ts`.
 * A later PASS there is intentional chronology, not a contradiction of this BLOCKED.
 */
const AUDIT_OUTCOME_V1 = {
  identity_reconciliation_a_to_e: "PASS",
  explicit_orchestration_pin_readiness_f: "BLOCKED",
  result: "RON_FALCONER_SIGNAL_SOURCE_IDENTITY_RECONCILIATION_AUDIT_V1_BLOCKED",
  blocker:
    "falconer_signal_source endpoint has no explicit spec_version selector; "
    + "V6 remains safely unpinned",
  safest_next_action:
    "a separate forward-only endpoint spec_version selector slice, and only then a "
    + "later Orchestration V7 slice pinning falconer_signal_source to spec_version 1",
  ledger_semantics: "historical_snapshot_immutable",
} as const;

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ANCHOR = Date.parse("2026-08-13T10:00:00Z");

describe("Falconer identity reconciliation V1 — A/B/C: three distinct identities", () => {
  it("A. the canonical Falconer v7 strategy port reproduces 13736f...", () => {
    expect(sha("supabase/functions/_shared/falconer-strategy.ts")).toBe(STRATEGY_TS_SHA256);
  });

  it("C. 76b242...9251 is the canonical Pine source of truth, NOT the TS port", () => {
    expect(sha("strategy/falconer_v7_tp3.pine")).toBe(STRATEGY_PINE_SHA256);
    expect(STRATEGY_PINE_SHA256).not.toBe(STRATEGY_TS_SHA256);
  });

  it("B. 40a4b6... is the RON SIGNAL-SOURCE SPEC hash and nothing else", async () => {
    const specHash = await falconerSignalSourceSpecHash();
    expect(specHash).toBe(SIGNAL_SOURCE_SPEC_V1_HASH);
    expect(specHash).toBe(await falconerSignalSourceSpecHash()); // deterministic
    expect(specHash).not.toBe(STRATEGY_TS_SHA256);
    expect(specHash).not.toBe(STRATEGY_PINE_SHA256);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_id).toBe("ron_falconer_signal_source");
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version).toBe(1);
  });

  it("the specialist never imports or re-evaluates the strategy module", () => {
    const c = FALCONER_SIGNAL_SOURCE_SPEC_V1.source_contract;
    expect(c.strategy_module_imported).toBe(false);
    expect(c.strategy_re_evaluated).toBe(false);
    const endpoint = readFileSync(
      "supabase/functions/ron-agent-falconer-signal-source/index.ts", "utf8");
    expect(endpoint).not.toContain("falconer-strategy");
  });

  it("canonical Falconer v7 semantics are untouched by this audit", () => {
    const pine = readFileSync("strategy/falconer_v7_tp3.pine", "utf8");

    // Identity/intent: TP3 33-33-34, long-only safety mode.
    expect(pine).toContain('strategy("Falconer v7 TP3 33-33-34"');
    expect(pine).toContain("Longs Only Safety Mode with 5R runner");

    // Sizing split: 33 / 33 / remainder (=34 under canonical inputs).
    expect(pine).toContain('pct1    = input.float(33,  "TP1 %"');
    expect(pine).toContain('pct2    = input.float(33,  "TP2 %"');
    expect(pine).toContain("qty1 = qty * pct1 / 100.0");
    expect(pine).toContain("qty2 = qty * pct2 / 100.0");
    expect(pine).toContain("qty3 = qty - qty1 - qty2");
    expect(pine).toContain("tp1size=33");
    expect(pine).toContain("tp2size=33");
    expect(pine).toContain("tp3size=34");

    // R-multiples, BE, risk and dollar-per-unit.
    expect(pine).toContain('input.float(1.5, "TP1 R"');
    expect(pine).toContain('input.float(3.0, "TP2 R"');
    expect(pine).toContain('input.float(5.0, "TP3 R (runner)"');
    expect(pine).toContain('input.float(1.0, "BE at R"');
    expect(pine).toContain('input.float(200.0, "Risk per Trade $"');
    expect(pine).toContain("dpu     = input.float(1.0)");

    // Long only.
    expect(pine).toContain("allowL = true");
    expect(pine).toContain('strategy.entry("L", strategy.long');
    expect(pine).not.toContain("strategy.short");
    expect(pine).not.toContain("allowS = true");

    // STANDARD OHLC chart + MANUAL Heiken Ashi computation (no HA feed).
    expect(pine).toContain("haC = (open + high + low + close) / 4.0");
    expect(pine).toContain(
      "haO := na(haO[1]) ? (open + close) / 2.0 : (nz(haO[1]) + nz(haC[1])) / 2.0");
    expect(pine).not.toContain("ticker.heikinashi");

    // Bar-close execution semantics.
    expect(pine).toContain("process_orders_on_close=true");
    expect(pine).toContain("calc_on_every_tick=false");
  });
});

describe("Falconer identity reconciliation V1 — D: sealed provenance identity coverage", () => {
  it("sealed evidence carries EXACT signal-source spec identity", async () => {
    const e = await sealEvidence(await buildFalconerSignalSourceEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, events: [],
      run_id: "audit_run", trace_id: "audit_trace",
    }));
    expect(e.provenance_refs).toContain(
      `spec:ron_falconer_signal_source:v1:${SIGNAL_SOURCE_SPEC_V1_HASH}`);
    expect(e.provenance_refs).toContain("source:falconer_engine_events");
  });

  it("D. sealed evidence deliberately carries NO strategy hash (documented gap)", async () => {
    const e = await sealEvidence(await buildFalconerSignalSourceEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, events: [],
      run_id: "audit_run", trace_id: "audit_trace",
    }));
    const text = JSON.stringify(e);
    // Correct by construction: the specialist replays runtime source rows and never
    // evaluates the strategy, so a strategy hash would be an unfounded identity claim.
    expect(text).not.toContain(STRATEGY_TS_SHA256);
    expect(text).not.toContain(STRATEGY_PINE_SHA256);
  });

  it("no expected-performance or parity claim is ever emitted", async () => {
    const e = await buildFalconerSignalSourceEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, events: [],
      run_id: "audit_run", trace_id: "audit_trace",
    });
    const a = FALCONER_SIGNAL_SOURCE_SPEC_V1.authority_contract;
    expect(a.tradingview_parity_claimed).toBe(false);
    expect(a.tradingview_parity_state).toBe("unresolved");
    expect(a.historical_performance_claimed).toBe(false);
    expect(JSON.stringify(e)).not.toContain("54.7");
  });
});

describe("Falconer identity reconciliation V1 — E/F: historical pin-readiness snapshot", () => {
  it("E (HISTORICAL DECLARATION). at audit time the endpoint had NO spec_version selector", () => {
    // Declaration, not a live source grep: the current endpoint has since gained a
    // selector (see ron-falconer-endpoint-version-selector-v1.test.ts). Asserting the
    // historical endpoint state against live source would rewrite audit history.
    expect(AUDIT_OUTCOME_V1.blocker).toBe(
      "falconer_signal_source endpoint has no explicit spec_version selector; "
      + "V6 remains safely unpinned");
    // Timeless identity check that held then and still holds now.
    expect(agentSpec("falconer_signal_source")!.agent_version).toBe(1);
  });

  it("F. Falconer is still UNPINNED in the frozen Orchestration V6 plan", () => {
    const entry = ORCHESTRATION_RUN_PLAN_V6
      .find((p) => p.agent_id === "falconer_signal_source")!;
    expect(entry).toBeDefined();
    // The real plan field is `spec_version_pin`; unpinned means explicit null.
    expect(entry.spec_version_pin).toBeNull();
    expect(Object.keys(ORCHESTRATION_RUN_SPEC_V6.spec_version_pins))
      .not.toContain("falconer_signal_source");
    expect(ORCHESTRATION_RUN_SPEC_V6.unpinned_agents_use_endpoint_defaults)
      .toContain("falconer_signal_source");
    expect(entry.function_name).toBe("ron-agent-falconer-signal-source");
  });

  it("F. identity is unambiguous: exact spec ref string is stable", async () => {
    expect(`spec:${FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_id}:v${FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version}:${await falconerSignalSourceSpecHash()}`)
      .toBe(`spec:ron_falconer_signal_source:v1:${SIGNAL_SOURCE_SPEC_V1_HASH}`);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority).toBe("strategy_context_only");
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.non_authoritative).toBe(true);
  });

  it("F (HISTORICAL). explicit orchestration pin readiness was BLOCKED at this snapshot", () => {
    // A replay-safe explicit pin requires the specialist endpoint to explicitly
    // select/replay the requested version. No such selector existed at audit time.
    expect(AUDIT_OUTCOME_V1.identity_reconciliation_a_to_e).toBe("PASS");
    expect(AUDIT_OUTCOME_V1.explicit_orchestration_pin_readiness_f).toBe("BLOCKED");
    expect(AUDIT_OUTCOME_V1.result)
      .toBe("RON_FALCONER_SIGNAL_SOURCE_IDENTITY_RECONCILIATION_AUDIT_V1_BLOCKED");
    expect(AUDIT_OUTCOME_V1.ledger_semantics).toBe("historical_snapshot_immutable");
    expect(AUDIT_OUTCOME_V1.safest_next_action).toContain("selector slice");
    expect(AUDIT_OUTCOME_V1.safest_next_action).toContain("Orchestration V7");
  });
});
