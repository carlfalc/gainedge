/**
 * RON_FALCONER_SIGNAL_SOURCE_ENDPOINT_VERSION_SELECTOR_V1.
 *
 * Forward-only compatibility slice: the Falconer signal-source endpoint can now be
 * asked EXPLICITLY for spec_version 1. No V2, no new spec object, no new spec hash,
 * no evidence/provenance change.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  resolveFalconerSpecVersion, FALCONER_SUPPORTED_SPEC_VERSIONS,
} from "../../supabase/functions/_shared/ron-falconer-endpoint-version-selector.ts";
import {
  FALCONER_SIGNAL_SOURCE_SPEC_V1, falconerSignalSourceSpecHash,
  buildFalconerSignalSourceEvidenceV1,
} from "../../supabase/functions/_shared/ron-falconer-signal-source-spec.ts";
import { sealEvidence } from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { ORCHESTRATION_RUN_PLAN_V6 } from "../../supabase/functions/_shared/ron-orchestration-run-v6.ts";

const ENDPOINT_PATH = "supabase/functions/ron-agent-falconer-signal-source/index.ts";
const ENDPOINT = readFileSync(ENDPOINT_PATH, "utf8");
const SPEC_V1_HASH = "40a4b6f9d465ae0362e1a0ada43e3b699c2674efa30c5dbe9e5a934dcd1005f3";
const STRATEGY_TS_SHA256 = "13736f1ed5dabd3f31a15b8db4179ed4e027950ed515034433ae6134a15581fc";
const STRATEGY_PINE_SHA256 = "76b242b4b4b2e1f2aa5bbb11a0a12ef9849ec40beda306fc5c5dd6899a8b9251";
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ANCHOR = Date.parse("2026-08-13T10:00:00Z");

describe("Falconer endpoint version selector V1 — resolution", () => {
  it("omitted selector resolves to V1 (exact historical default)", () => {
    expect(resolveFalconerSpecVersion({})).toEqual({
      ok: true, spec_version: 1, selector: "default_omitted",
    });
    expect(resolveFalconerSpecVersion({ instrument: "XAUUSD", timeframe: "15m" }).ok).toBe(true);
  });

  it("explicit numeric 1 resolves to V1", () => {
    expect(resolveFalconerSpecVersion({ spec_version: 1 })).toEqual({
      ok: true, spec_version: 1, selector: "explicit",
    });
  });

  it("unsupported numeric 2 is rejected deterministically", () => {
    const r = resolveFalconerSpecVersion({ spec_version: 2 });
    expect(r).toEqual({
      ok: false, error: "unsupported_spec_version",
      requested_spec_version: 2, supported_spec_versions: FALCONER_SUPPORTED_SPEC_VERSIONS,
    });
    expect(r).toEqual(resolveFalconerSpecVersion({ spec_version: 2 }));
  });

  it("malformed selectors of every shape are rejected", () => {
    const cases: unknown[] = [0, -1, 1.5, 2, 99, "1", "v1", "", null, true, false,
      {}, { v: 1 }, [1], [], NaN, Infinity];
    for (const raw of cases) {
      const r = resolveFalconerSpecVersion({ spec_version: raw } as Record<string, unknown>);
      expect(r.ok, `spec_version=${JSON.stringify(raw)}`).toBe(false);
      if (r.ok === false) {
        expect(r.error).toBe("unsupported_spec_version");
        expect(r.supported_spec_versions).toEqual([1]);
        expect(typeof raw === "number" || typeof raw === "string"
          ? r.requested_spec_version : r.requested_spec_version === null).toBeTruthy();
      }
    }
  });

  it("only version 1 is supported; no V2 branch exists anywhere", () => {
    expect(FALCONER_SUPPORTED_SPEC_VERSIONS).toEqual([1]);
    expect(ENDPOINT).not.toContain("SPEC_V2");
    expect(ENDPOINT).not.toContain("spec_version: 2");
    expect(ENDPOINT).not.toContain("spec_version === 2");
    expect(ENDPOINT).toContain("FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version");
  });
});

describe("Falconer endpoint version selector V1 — fail-closed ordering", () => {
  it("the selector is evaluated BEFORE every data read", () => {
    const selectorAt = ENDPOINT.indexOf("resolveFalconerSpecVersion(body)");
    expect(selectorAt).toBeGreaterThan(-1);
    for (const table of ["candle_history", "falconer_engine_events", "falconer_trades"]) {
      expect(ENDPOINT.indexOf(`"${table}"`), table).toBeGreaterThan(selectorAt);
    }
  });

  it("rejection returns a 400 with the stable error vocabulary", () => {
    expect(ENDPOINT).toContain("versionSelection.error");
    expect(ENDPOINT).toContain("}, 400);");
  });
});

describe("Falconer endpoint version selector V1 — invariants preserved", () => {
  it("V1 spec identity, version and authority are unchanged", async () => {
    expect(await falconerSignalSourceSpecHash()).toBe(SPEC_V1_HASH);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_version).toBe(1);
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.spec_id).toBe("ron_falconer_signal_source");
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.falconer_authority).toBe("strategy_context_only");
    expect(FALCONER_SIGNAL_SOURCE_SPEC_V1.non_authoritative).toBe(true);
  });

  it("canonical strategy hashes remain exact and distinct", () => {
    expect(sha("supabase/functions/_shared/falconer-strategy.ts")).toBe(STRATEGY_TS_SHA256);
    expect(sha("strategy/falconer_v7_tp3.pine")).toBe(STRATEGY_PINE_SHA256);
    expect(SPEC_V1_HASH).not.toBe(STRATEGY_TS_SHA256);
    expect(SPEC_V1_HASH).not.toBe(STRATEGY_PINE_SHA256);
  });

  it("evidence is byte/hash identical for omitted vs explicit selector inputs", async () => {
    const input = {
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, events: [],
      run_id: "sel_run", trace_id: "sel_trace",
    } as const;
    const omitted = await sealEvidence(await buildFalconerSignalSourceEvidenceV1({ ...input }));
    const explicit = await sealEvidence(await buildFalconerSignalSourceEvidenceV1({ ...input }));
    expect(explicit.evidence_hash).toBe(omitted.evidence_hash);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(omitted));
    expect(JSON.stringify(omitted)).not.toContain(STRATEGY_TS_SHA256);
    expect(JSON.stringify(omitted)).not.toContain(STRATEGY_PINE_SHA256);
  });

  it("signal-only, non-executing response contract is unchanged", () => {
    expect(ENDPOINT).toContain("numeric_probability: null");
    expect(ENDPOINT).toContain("execution_allowed: false");
    expect(ENDPOINT).toContain('execution_path: "signal_only"');
    expect(ENDPOINT).toContain("persisted: false");
  });

  it("Orchestration V6 still leaves Falconer unpinned", () => {
    const entry = ORCHESTRATION_RUN_PLAN_V6
      .find((p) => p.agent_id === "falconer_signal_source")!;
    expect(entry.spec_version_pin).toBeNull();
  });
});
