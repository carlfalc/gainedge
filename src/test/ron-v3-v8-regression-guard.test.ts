/**
 * GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3 — frozen-behaviour regression guard.
 *
 * The V3/V8 slice touches six already-accepted runtime files. Those files are excluded
 * from the byte-level tree freeze guards, so this suite replaces that protection with a
 * PRECISE one: for every touched runtime file it diffs the current source against the
 * last accepted baseline commit and asserts that the ONLY baseline lines that disappeared
 * are the explicitly enumerated, reviewed ones — every other pre-existing V1-V7 line must
 * still be present byte-for-byte. It additionally re-asserts the frozen regions (auth,
 * quality contract, persistence, default spec/run-version selection) verbatim.
 *
 * Static source analysis only. No network, no database, nothing persisted.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Last accepted pre-V3/V8 baseline. */
const BASELINE = "0b98dd1bf5eedddf8d0ee472a04d1a30c9c2a661";

function haveBaseline(): boolean {
  try {
    execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const BASELINE_AVAILABLE = haveBaseline();

function baselineSrc(path: string): string {
  return execSync(`git show ${BASELINE}:${path}`, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function currentSrc(path: string): string {
  return readFileSync(path, "utf8");
}

/** Baseline lines (trimmed, blank lines dropped) absent from the current source. */
function removedLines(base: string, cur: string): string[] {
  const remaining = new Map<string, number>();
  for (const raw of cur.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    remaining.set(t, (remaining.get(t) ?? 0) + 1);
  }
  const removed: string[] = [];
  for (const raw of base.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const n = remaining.get(t) ?? 0;
    if (n > 0) remaining.set(t, n - 1);
    else removed.push(t);
  }
  return removed;
}

/** Inclusive baseline slice between two unique markers, asserted present in current. */
function assertFrozenRegion(base: string, cur: string, start: string, end: string) {
  const s = base.indexOf(start);
  expect(s, `baseline marker missing: ${start}`).toBeGreaterThanOrEqual(0);
  const e = base.indexOf(end, s);
  expect(e, `baseline marker missing: ${end}`).toBeGreaterThan(s);
  const region = base.slice(s, e + end.length);
  expect(cur.includes(region), `frozen region changed near: ${start}`).toBe(true);
}

type Touched = {
  path: string;
  /** Exhaustive, reviewed list of baseline lines this slice was allowed to replace. */
  allowedRemovals: string[];
  /** Baseline regions that must survive byte-for-byte. */
  frozenRegions: [string, string][];
  /** Current-source invariants proving pre-existing defaults are unchanged. */
  invariants: string[];
};

const TOUCHED: Touched[] = [
  {
    path: "supabase/functions/ron-agent-session-structure/index.ts",
    allowedRemovals: [
      "const specVersion = body.spec_version === 1 ? 1 : 2;",
      "const spec = specVersion === 1 ? SESSION_STRUCTURE_SPEC_V1 : SESSION_STRUCTURE_SPEC_V2;",
      "spec_hash: specVersion === 1 ? await sessionStructureSpecHash() : await sessionStructureSpecHashV2(),",
    ],
    frozenRegions: [
      ["let authorized = !!serviceKey && timingSafeEq(token, serviceKey);", "authorized = !probeErr;"],
      ["const contract = await buildEligibilityContract(", "no_genuine_source_bars"],
      ["if (body.persist === true) {", "persisted = true;"],
    ],
    invariants: [
      // DEFAULT stays 2; V1 stays explicitly reachable.
      "body.spec_version === 3 ? 3 : body.spec_version === 1 ? 1 : 2",
      "buildSessionStructureEvidence({",
      "buildSessionStructureEvidenceV2({",
      "lineage_refs: [`feature_version:6`, `label_version:7`],",
    ],
  },
  {
    path: "supabase/functions/ron-agent-pattern-context/index.ts",
    allowedRemovals: [
      "if (specVersion !== 1 && specVersion !== 2) {",
      "const build = () => specVersion === 2",
      "spec_hash: specVersion === 2 ? await patternContextSpecHashV2() : await patternContextSpecHash(),",
      "agent_id: PATTERN_CONTEXT_SPEC_V2.agent_id,",
      "agent_version: PATTERN_CONTEXT_SPEC_V2.agent_version,",
    ],
    frozenRegions: [
      ["let authorized = !!serviceKey && timingSafeEq(token, serviceKey);", "authorized = !probeErr;"],
    ],
    invariants: [
      "const specVersion = body.spec_version == null ? 2 : Number(body.spec_version);",
      "buildPatternStructureContextEvidenceV2",
      "buildPatternContextEvidence",
    ],
  },
  {
    path: "supabase/functions/ron-agent-cross-asset-correlation/index.ts",
    allowedRemovals: [
      "if (specVersion !== 1 && specVersion !== 2) {",
      "const ns = specVersion === 2 ? await provenTimes(counterpart) : await times(counterpart);",
      "asOf = pick;",
      'const counterpartSelect = specVersion === 2 ? "timestamp, close, created_at" : "timestamp, close";',
      "const counterpart_bars_v2: CounterpartBarV2[] = specVersion === 2",
      "const build = () => (specVersion === 2",
      "const v2Fields = specVersion === 2",
      "? {",
      ": {};",
      "spec_hash: specVersion === 2",
      "anchor_bar_open: new Date(asOf).toISOString(),",
      "anchor_bar_completed_close: new Date(asOf + BAR_MS).toISOString(),",
    ],
    frozenRegions: [
      ["let authorized = !!serviceKey && timingSafeEq(token, serviceKey);", "authorized = !probeErr;"],
      ["const contract = await buildEligibilityContract(", "return out;"],
    ],
    invariants: [
      "const specVersion = body.spec_version == null ? 2 : Number(body.spec_version);",
      "buildCrossAssetRelationshipEvidenceV2({",
      "buildCrossAssetEvidenceV1({",
    ],
  },
  {
    path: "supabase/functions/ron-agent-opportunity-risk/index.ts",
    allowedRemovals: [
      "if (requested !== 1 && requested !== 2) {",
      'return json({ error: "unsupported_spec_version", supported: [1, 2] }, 400);',
      "const producer = useV2 ? buildOpportunityRiskEvidenceV2 : buildOpportunityRiskEvidenceV1;",
      "spec_version: useV2 ? OPPORTUNITY_RISK_SPEC_V2.spec_version : S.spec_version,",
      "spec_hash: useV2 ? await opportunityRiskSpecHashV2() : await opportunityRiskSpecHash(),",
    ],
    frozenRegions: [
      ["let authorized = !!serviceKey && timingSafeEq(token, serviceKey);", "authorized = !probeErr;"],
      ["const anchor = body.evaluation_anchor;", "missing_evidence_array"],
    ],
    invariants: [
      // DEFAULT stays 1.
      "const requested = body.spec_version === undefined ? 1 : body.spec_version;",
      "const useV2 = requested === 2;",
    ],
  },
  {
    path: "supabase/functions/ron-orchestrate-run/index.ts",
    allowedRemovals: [
      "if (![1, 2, 3, 4, 5, 6, 7].includes(requestedRunVersion)) {",
      "const isV7 = requestedRunVersion === 7;",
      "const runIds = isV7",
      "isV7 ? ORCHESTRATION_RUN_PLAN_V7",
      "sessionDependencyHash = await assertSessionDependencySealed(dep, ctx);",
      'if (v2entry && entry.agent_id === "session_market_structure") {',
      "if (isV2 && sessionDependencyHash) {",
      "if (isV4 && crossAssetContextHash) {",
      "if (isV6 && opportunityRiskHash) {",
      "orchestration_run_version: isV7",
      "orchestration_run_plan_hash: isV7",
    ],
    frozenRegions: [
      ["const isV6 = requestedRunVersion === 6 || isV7;", "const isV2 = requestedRunVersion === 2 || isV3;"],
    ],
    invariants: [
      // The frozen acceptance list is reused verbatim; V8 is a separate additive term.
      "[1, 2, 3, 4, 5, 6, 7].includes(requestedRunVersion)",
      "const isV8 = requestedRunVersion === 8;",
      "const isV7 = requestedRunVersion === 7 || isV8;",
      // Default run version is unchanged.
      "? RON_ORCHESTRATION_RUN_VERSION_V2",
      "await assertSessionDependencySealed(dep, ctx)",
      "assertSessionDependencyBinding(sealed, sessionDependencyHash);",
      "assertCrossAssetContextBinding(sealed, crossAssetContextHash);",
      "assertOpportunityRiskBinding(sealed, opportunityRiskHash);",
    ],
  },
  {
    path: "supabase/functions/ron-schedule-orchestration/index.ts",
    allowedRemovals: [
      "/** Frozen seven-agent orchestration run version. Pinned; never inferred from a request. */",
      "const ORCHESTRATION_RUN_VERSION = 7;",
      "trace_id: `ron_sched_v1_${gate.anchor}_${RUNTIME_INSTRUMENT}_${RUNTIME_TIMEFRAME}`,",
    ],
    frozenRegions: [
      ["let authorized = !!token && !!serviceKey && timingSafeEq(token, serviceKey);", "}, 401);"],
      ["const [snaps, candles, decisions, flags] = await Promise.all([", "]);"],
      ["const gate = selectAnchor({", "});"],
    ],
    invariants: [
      "const ORCHESTRATION_RUN_VERSION = 8;",
      "ron_verify_cron_token",
      "persist: true,",
    ],
  },
];

describe.skipIf(!BASELINE_AVAILABLE)("V3/V8 slice — touched runtime files keep frozen V1-V7 behaviour", () => {
  for (const t of TOUCHED) {
    describe(t.path, () => {
      it("removes ONLY the explicitly reviewed baseline lines", () => {
        const removed = removedLines(baselineSrc(t.path), currentSrc(t.path));
        expect([...removed].sort()).toEqual([...t.allowedRemovals].sort());
      });

      it("keeps the frozen baseline regions byte-for-byte", () => {
        const base = baselineSrc(t.path);
        const cur = currentSrc(t.path);
        for (const [start, end] of t.frozenRegions) assertFrozenRegion(base, cur, start, end);
      });

      it("keeps the pre-existing defaults and V1/V2 paths intact", () => {
        const cur = currentSrc(t.path);
        for (const inv of t.invariants) {
          expect(cur.includes(inv), `missing invariant: ${inv}`).toBe(true);
        }
      });
    });
  }
});

describe("V3/V8 slice — no frozen shared artifact was touched", () => {
  it.skipIf(!BASELINE_AVAILABLE)("leaves every frozen V1-V7 shared spec byte-identical", () => {
    const changed = execSync(
      `git diff --name-only ${BASELINE} -- supabase/functions/_shared`,
      { encoding: "utf8" },
    ).split("\n").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set([
      "supabase/functions/_shared/ron-session-structure-spec-v3.ts",
      "supabase/functions/_shared/ron-pattern-structure-context-v3.ts",
      "supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts",
      "supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts",
      "supabase/functions/_shared/ron-orchestration-run-v8.ts",
      // GAINEDGE_RON_HA_PATTERN_CONTEXT_V1: new, additive, not wired into any run plan.
      "supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts",
    ]);
    expect(changed.filter((f) => !allowed.has(f))).toEqual([]);
  });
});

describe("V8 evidence clock semantics — no forced false equality", () => {
  it("applies exact anchor equality ONLY to the four V3 specialists", async () => {
    const v7 = await import("../../supabase/functions/_shared/ron-orchestration-run-v7.ts");
    const v8 = await import("../../supabase/functions/_shared/ron-orchestration-run-v8.ts");
    const s7 = v7.ORCHESTRATION_RUN_SPEC_V7 as Record<string, unknown>;
    const s8 = v8.ORCHESTRATION_RUN_SPEC_V8 as Record<string, unknown>;
    // Anchor-convention-neutral specialists keep their FROZEN V7 acceptance contract:
    // they truthfully report their own `as_of` and are never forced to equal the anchor.
    for (const k of ["calibration_context", "macro_context", "falconer_signal_source_context"]) {
      expect(s8[k]).toBe(s7[k]);
      expect(JSON.stringify(s8[k])).not.toContain("as_of_equals_evaluation_anchor_required");
    }
    for (const k of [
      "session_dependency_acceptance", "pattern_context",
      "cross_asset_context", "opportunity_risk_context",
    ]) {
      expect(JSON.stringify(s8[k])).toContain('"as_of_equals_evaluation_anchor_required":true');
    }
  });
});
