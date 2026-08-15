/**
 * RON_CROSS_ASSET_RELATIONSHIP_CONTEXT_V2 — adversarial tests.
 *
 * All bars are DETERMINISTIC SYNTHETIC FIXTURES. Nothing here is persisted, deployed,
 * or reaches an LLM, broker, research or calibration surface.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  scanDenylist, sealEvidence, validateEvidence, canonicalize, agentSpec,
  evidenceTtlMinutes,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  buildCrossAssetEvidenceV1, crossAssetSpecHash,
  CROSS_ASSET_SPEC_V1, CROSS_ASSET_COUNTERPART_V1,
  CROSS_ASSET_MIN_COMMON_BARS, CROSS_ASSET_MAX_COMMON_BARS,
  CROSS_ASSET_MIN_PAIRED_RETURNS, CROSS_ASSET_RETURNS_WINDOW,
} from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import {
  buildCrossAssetRelationshipEvidenceV2, crossAssetRelationshipSpecHashV2,
  admitCounterpartBars, associationSign, returnDirection, pairDirectionRelation,
  pairRelationToAssociation, CrossAssetCounterpartConflictError,
  CROSS_ASSET_RELATIONSHIP_SPEC_V2, CROSS_ASSET_SPEC_V1_HASH_PINNED,
  type CounterpartBarV2,
} from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v2.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { patternContextSpecHash } from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { patternContextSpecHashV2 } from "../../supabase/functions/_shared/ron-pattern-structure-context-v2.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z"); // Wednesday, venue open
const TRACE = "ron-xarc-v2-fixture";

interface Bar { time: number; open: number; high: number; low: number; close: number; created_at?: number | null }

function xau(n: number, from = START): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 2400 + Math.sin(i / 3) * 12 + (i % 7) * 0.4;
    return {
      time: from + i * BAR,
      open: base, high: base + 2.5, low: base - 2.5, close: base + 0.5,
      created_at: from + i * BAR + BAR + 1_000,
    };
  });
}

/** Counterpart rows WITH a genuine completed-bar persistence instant. */
function nas(n: number, from = START, closes?: (i: number) => number): CounterpartBarV2[] {
  return Array.from({ length: n }, (_, i) => ({
    time: from + i * BAR,
    close: closes ? closes(i) : 18000 + Math.cos(i / 4) * 30 + (i % 5) * 1.1,
    created_at: from + i * BAR + BAR + 500,
  }));
}

const noQuarantine = () => false;

const buildV2 = (
  bars: Bar[], counterpart_bars: CounterpartBarV2[], asOf: number,
  isQuarantined: any = noQuarantine, run = "fixture-run",
) => buildCrossAssetRelationshipEvidenceV2({
  instrument: "XAUUSD", counterpart: CROSS_ASSET_COUNTERPART_V1, timeframe: "15m",
  as_of: asOf, bars, counterpart_bars, isQuarantined,
  run_id: run, trace_id: TRACE,
});

const keyOf = (e: any, k: string) => e.observations.find((o: any) => o.key === k);
const textOf = (e: any, k: string) => keyOf(e, k)?.value_text;

const N = 40;
const ANCHOR = START + (N - 1) * BAR;

describe("XARC V2 — frozen upstream identity", () => {
  it("preserves the Cross-Asset V1 spec hash byte-for-byte", async () => {
    expect(await crossAssetSpecHash()).toBe(CROSS_ASSET_SPEC_V1_HASH_PINNED);
    expect(await crossAssetSpecHash())
      .toBe("8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44");
  });

  it("leaves Session V2 and Pattern V1/V2 identities unchanged", async () => {
    expect(await sessionStructureSpecHashV2())
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await patternContextSpecHash())
      .toBe("9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d");
    expect(await patternContextSpecHashV2())
      .toBe("0c29c45b8d2bb9d24f096697ce3d64ed630fa8f8124d8de09043aa72f7448a14");
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("keeps the registered agent identity, authority and TTL", () => {
    const spec = agentSpec("cross_asset_correlation")!;
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_id).toBe("cross_asset_correlation");
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.agent_version).toBe(1);
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.authority_class).toBe("contextual");
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.authority_rank).toBe(4);
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.source_health_authoritative).toBe(false);
    expect(spec.ttl_multiplier).toBe(CROSS_ASSET_RELATIONSHIP_SPEC_V2.ttl_multiplier);
    expect(evidenceTtlMinutes("cross_asset_correlation", "15m")).toBe(120);
  });

  it("V1 producer output is unchanged when given V1-shaped counterpart rows", async () => {
    const bars = xau(N);
    const cp = nas(N).map(({ time, close }) => ({ time, close }));
    const a = await buildCrossAssetEvidenceV1({
      instrument: "XAUUSD", counterpart: CROSS_ASSET_COUNTERPART_V1, timeframe: "15m",
      as_of: ANCHOR, bars, counterpart_bars: cp, isQuarantined: noQuarantine,
      run_id: "r", trace_id: TRACE,
    });
    const b = await buildCrossAssetEvidenceV1({
      instrument: "XAUUSD", counterpart: CROSS_ASSET_COUNTERPART_V1, timeframe: "15m",
      as_of: ANCHOR, bars: [...bars].reverse(), counterpart_bars: [...cp].reverse(),
      isQuarantined: noQuarantine, run_id: "r", trace_id: TRACE,
    });
    expect((await sealEvidence(a)).evidence_hash).toBe((await sealEvidence(b)).evidence_hash);
    expect(a.status).toBe("supported");
  });
});

describe("XARC V2 — spec inheritance, no reinvention", () => {
  it("pins a stable V2 spec hash distinct from V1", async () => {
    const h = await crossAssetRelationshipSpecHashV2();
    expect(h).toBe(await crossAssetRelationshipSpecHashV2());
    expect(h).not.toBe(await crossAssetSpecHash());
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_version).toBe(2);
  });

  it("inherits the exact 32 / 24 / 25 / 33 window constants and estimator", () => {
    const inh = CROSS_ASSET_RELATIONSHIP_SPEC_V2.inherits;
    expect(inh.paired_returns_window).toBe(32);
    expect(inh.paired_returns_window).toBe(CROSS_ASSET_RETURNS_WINDOW);
    expect(inh.minimum_paired_returns).toBe(24);
    expect(inh.minimum_paired_returns).toBe(CROSS_ASSET_MIN_PAIRED_RETURNS);
    expect(inh.min_common_bars).toBe(25);
    expect(inh.min_common_bars).toBe(CROSS_ASSET_MIN_COMMON_BARS);
    expect(inh.max_common_bars).toBe(33);
    expect(inh.max_common_bars).toBe(CROSS_ASSET_MAX_COMMON_BARS);
    expect(inh.return_formula).toBe("(close_t / close_prev) - 1");
    expect(inh.estimator).toBe("pearson_r");
    expect(inh.alignment_method).toBe("exact_timestamp_intersection");
    expect(inh.bar_minutes).toBe(CROSS_ASSET_SPEC_V1.bar_minutes);
    expect(inh.quality_version).toBe(5);
    expect(inh.instrument_scope).toEqual(["XAUUSD"]);
    expect(inh.counterpart_scope).toEqual(["NAS100"]);
    expect(inh.timeframe_scope).toEqual(["15m"]);
    expect(inh.statistic_recomputed_in_v2).toBe(false);
    expect(inh.new_numeric_thresholds_introduced).toBe(0);
    expect(inh.base_spec_hash).toBe(CROSS_ASSET_SPEC_V1_HASH_PINNED);
  });

  it("declares only exact-sign comparison and no magnitude buckets", () => {
    const c = CROSS_ASSET_RELATIONSHIP_SPEC_V2.relationship_context_contract;
    expect(c.comparison_mode).toBe("exact_sign_only");
    expect(c.magnitude_buckets_emitted).toBe(false);
    expect(c.temporal_semantics.persistence_claimed).toBe(false);
    expect(c.temporal_semantics.predictive).toBe(false);
    const s = CROSS_ASSET_RELATIONSHIP_SPEC_V2.safety_contract;
    expect(s.execution_allowed).toBe(false);
    expect(s.execution_path).toBe("signal_only");
    expect(s.allow_live_execution).toBe(false);
    expect(s.persistence_in_this_phase).toBe(false);
    expect(s.llm_used).toBe(false);
    expect(s.external_fetch).toBe(false);
  });

  it("introduces no new numeric threshold in the module source", () => {
    const src = readFileSync(
      "supabase/functions/_shared/ron-cross-asset-relationship-context-v2.ts", "utf8");
    // no emitted magnitude bucket vocabulary and no emitted forbidden statistic keys
    expect(src).not.toMatch(/"[a-z_]*(strong|weak|moderate)[a-z_]*"/i);
    expect(src).not.toMatch(/"[a-z_]*(p_value|pvalue|significance|beta|regression|take_profit|stop_loss|risk_reward)[a-z_]*"/i);
  });
});

describe("XARC V2 — deterministic sign transforms", () => {
  it("maps association sign from the exact Pearson sign only", () => {
    expect(associationSign(0.0001)).toBe("positive_association");
    expect(associationSign(0.99)).toBe("positive_association");
    expect(associationSign(-0.0001)).toBe("negative_association");
    expect(associationSign(-0.99)).toBe("negative_association");
    expect(associationSign(0)).toBe("exact_zero_association");
    expect(associationSign(-0)).toBe("exact_zero_association");
  });

  it("maps latest return direction from the exact sign only", () => {
    expect(returnDirection(1e-12)).toBe("up");
    expect(returnDirection(-1e-12)).toBe("down");
    expect(returnDirection(0)).toBe("flat");
  });

  it("maps every latest pair direction relation including flat", () => {
    expect(pairDirectionRelation("up", "up")).toBe("same_sign");
    expect(pairDirectionRelation("down", "down")).toBe("same_sign");
    expect(pairDirectionRelation("up", "down")).toBe("opposite_sign");
    expect(pairDirectionRelation("down", "up")).toBe("opposite_sign");
    expect(pairDirectionRelation("flat", "up")).toBe("one_or_both_flat");
    expect(pairDirectionRelation("down", "flat")).toBe("one_or_both_flat");
    expect(pairDirectionRelation("flat", "flat")).toBe("one_or_both_flat");
  });

  it("maps pair-vs-association exactly as specified", () => {
    expect(pairRelationToAssociation("positive_association", "same_sign"))
      .toBe("consistent_with_recent_observed_association");
    expect(pairRelationToAssociation("positive_association", "opposite_sign"))
      .toBe("opposed_to_recent_observed_association");
    expect(pairRelationToAssociation("negative_association", "opposite_sign"))
      .toBe("consistent_with_recent_observed_association");
    expect(pairRelationToAssociation("negative_association", "same_sign"))
      .toBe("opposed_to_recent_observed_association");
    expect(pairRelationToAssociation("exact_zero_association", "same_sign"))
      .toBe("association_exact_zero");
    expect(pairRelationToAssociation("positive_association", "one_or_both_flat"))
      .toBe("flat_pair_uninformative");
    expect(pairRelationToAssociation("negative_association", "one_or_both_flat"))
      .toBe("flat_pair_uninformative");
    // pinned precedence: exact-zero association wins over a flat leg
    expect(pairRelationToAssociation("exact_zero_association", "one_or_both_flat"))
      .toBe("association_exact_zero");
    expect(CROSS_ASSET_RELATIONSHIP_SPEC_V2.relationship_context_contract.relation_precedence[0])
      .toBe("association_exact_zero");
  });
});

describe("XARC V2 — counterpart completed-bar proof", () => {
  it("admits only rows recorded no earlier than bar_open + one bar", () => {
    const t = START;
    const res = admitCounterpartBars([
      { time: t, close: 1, created_at: t + BAR },              // exactly at close → admitted
      { time: t + BAR, close: 2, created_at: t + BAR + BAR - 1 }, // premature
      { time: t + 2 * BAR, close: 3, created_at: null },           // no proof
      { time: t + 3 * BAR, close: 4, created_at: Number.NaN },     // malformed
      { time: t + 4 * BAR, close: 5, created_at: t + 6 * BAR },    // late → admitted
    ]);
    expect(res.admitted.map((b) => b.time)).toEqual([t, t + 4 * BAR]);
    expect(res.excluded.map((e) => e.reason)).toEqual([
      "counterpart_recorded_before_completed_close",
      "counterpart_completion_proof_absent",
      "counterpart_completion_proof_malformed",
    ]);
  });

  it("fails closed on conflicting duplicate counterpart rows", () => {
    expect(() => admitCounterpartBars([
      { time: START, close: 1, created_at: START + BAR },
      { time: START, close: 2, created_at: START + BAR },
    ])).toThrow(CrossAssetCounterpartConflictError);
    // identical duplicates collapse silently
    expect(admitCounterpartBars([
      { time: START, close: 1, created_at: START + BAR },
      { time: START, close: 1, created_at: START + BAR },
    ]).admitted).toHaveLength(1);
  });

  it("blocks the envelope on conflicting duplicate counterpart rows", async () => {
    const bars = xau(N);
    const cp = nas(N);
    cp.push({ time: cp[10].time, close: cp[10].close + 5, created_at: cp[10].created_at });
    const e = await buildV2(bars, cp, ANCHOR);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(textOf(e, "cross_asset_relationship_state")).toBe("blocked");
    expect(e.data_health.issues).toContain("conflicting_duplicate_counterpart_rows");
  });

  it("an unproven counterpart row breaks the common segment and is never bridged", async () => {
    const bars = xau(N);
    const cp = nas(N);
    // strip the proof from a recent row → excluded → contiguity break near the anchor
    cp[N - 5] = { ...cp[N - 5], created_at: null };
    const e = await buildV2(bars, cp, ANCHOR);
    expect(e.status).toBe("insufficient_data");
    expect(keyOf(e, "common_bars_available").value_num).toBe(4);
    expect(keyOf(e, "counterpart_rows_excluded_proof_absent").value_num).toBe(1);
    expect(textOf(e, "observed_association_sign")).toBeUndefined();
    expect(textOf(e, "cross_asset_relationship_state")).toBe("context_unavailable");
  });

  it("a premature counterpart row is excluded exactly like an absent row", async () => {
    const bars = xau(N);
    const cp = nas(N);
    cp[N - 5] = { ...cp[N - 5], created_at: cp[N - 5].time + BAR - 1 };
    const e = await buildV2(bars, cp, ANCHOR);
    expect(keyOf(e, "counterpart_rows_excluded_recorded_before_close").value_num).toBe(1);
    expect(keyOf(e, "common_bars_available").value_num).toBe(4);
    expect(e.status).toBe("insufficient_data");
  });

  it("pins the proof contract in the spec", () => {
    const c = CROSS_ASSET_RELATIONSHIP_SPEC_V2.counterpart_completion_contract;
    expect(c.proof_field).toBe("candle_history.created_at");
    expect(c.proof_rule).toBe("recorded_at >= bar_open + bar_minutes");
    expect(c.missing_proof_admissible).toBe(false);
    expect(c.premature_row_admissible).toBe(false);
    expect(c.excluded_row_bridging_allowed).toBe(false);
    expect(c.excluded_row_breaks_common_segment).toBe(true);
    expect(c.venue_calendar_inferred).toBe(false);
  });
});

describe("XARC V2 — envelope behaviour", () => {
  it("emits the descriptive relationship context when V1 is supported", async () => {
    const e = await buildV2(xau(N), nas(N), ANCHOR);
    expect(e.status).toBe("supported");
    expect(e.direction).toBe("neutral");
    expect(e.recommendation).toBe("context_only");
    const r = keyOf(e, "paired_return_correlation").value_num as number;
    const x = keyOf(e, "xau_last_return").value_num as number;
    const y = keyOf(e, "nas100_last_return").value_num as number;
    expect(textOf(e, "observed_association_sign")).toBe(associationSign(r));
    expect(textOf(e, "latest_xau_return_direction")).toBe(returnDirection(x));
    expect(textOf(e, "latest_nas100_return_direction")).toBe(returnDirection(y));
    const rel = pairDirectionRelation(returnDirection(x), returnDirection(y));
    expect(textOf(e, "latest_pair_direction_relation")).toBe(rel);
    expect(textOf(e, "latest_pair_relation_to_observed_association"))
      .toBe(pairRelationToAssociation(associationSign(r), rel));
    expect(textOf(e, "association_window_scope"))
      .toBe("inherited_v1_paired_return_window_ending_at_anchor");
    expect(textOf(e, "latest_pair_scope")).toBe("one_observed_pair_at_the_anchor");
    expect(textOf(e, "cross_asset_relationship_state")).toBe("evaluated");
  });

  it("reports a flat latest pair without inventing a direction", async () => {
    const bars = xau(N);
    const cp = nas(N);
    // make the NAS anchor close exactly equal to the previous close → flat leg
    cp[N - 1] = { ...cp[N - 1], close: cp[N - 2].close };
    const e = await buildV2(bars, cp, ANCHOR);
    expect(e.status).toBe("supported");
    expect(textOf(e, "latest_nas100_return_direction")).toBe("flat");
    expect(textOf(e, "latest_pair_direction_relation")).toBe("one_or_both_flat");
    expect(textOf(e, "latest_pair_relation_to_observed_association"))
      .toBe("flat_pair_uninformative");
  });

  it("is deterministic and input-order independent", async () => {
    const bars = xau(N), cp = nas(N);
    const a = await sealEvidence(await buildV2(bars, cp, ANCHOR));
    const b = await sealEvidence(await buildV2([...bars].reverse(), [...cp].reverse(), ANCHOR));
    expect(a.evidence_hash).toBe(b.evidence_hash);
    expect(canonicalize(a.observations)).toBe(canonicalize(b.observations));
  });

  it("never looks ahead of the anchor", async () => {
    const bars = xau(N + 8), cp = nas(N + 8);
    const withFuture = await sealEvidence(await buildV2(bars, cp, ANCHOR));
    const truncated = await sealEvidence(await buildV2(
      bars.filter((b) => b.time <= ANCHOR), cp.filter((b) => b.time <= ANCHOR), ANCHOR));
    expect(withFuture.evidence_hash).toBe(truncated.evidence_hash);
    for (const o of withFuture.observations) {
      if (o.at) expect(Date.parse(o.at)).toBeLessThanOrEqual(Date.parse(withFuture.as_of));
    }
  });

  it("never computes a return across a gap in the common series", async () => {
    const bars = xau(N);
    const cp = nas(N).filter((_, i) => i !== N - 6);
    const e = await buildV2(bars, cp, ANCHOR);
    expect(keyOf(e, "common_bars_available").value_num).toBe(5);
    expect(e.status).toBe("insufficient_data");
  });

  it("passes the Evidence V1 contract and denylist with no forbidden fields", async () => {
    const sealed = await sealEvidence(await buildV2(xau(N), nas(N), ANCHOR));
    expect(validateEvidence(sealed)).toEqual([]);
    expect(scanDenylist(sealed)).toEqual([]);
    // Scan EMITTED keys and categorical values only; the limitations block legitimately
    // uses negation prose ("is not a forecast") which must not be keyword-matched.
    const text = sealed.observations
      .map((o: any) => `${o.key} ${o.value_text ?? ""} ${o.unit ?? ""}`).join(" ").toLowerCase();
    for (const banned of [
      "probability", "confidence", "forecast", "predict", "significance", "p_value",
      "expected_value", "edge", "beta", "regression", "causal", "take_profit",
      "stop_loss", "entry_price", "risk_reward", "signal_strength", "strong", "weak",
      "moderate",
    ]) expect(text).not.toContain(banned);
    expect(sealed.agent_id).toBe("cross_asset_correlation");
    expect(sealed.agent_version).toBe(1);
    expect(["neutral", "unknown"]).toContain(sealed.direction);
    expect(["context_only", "no_action"]).toContain(sealed.recommendation);
  });

  it("cites both the V2 spec and the inherited V1 base spec in provenance", async () => {
    const e = await buildV2(xau(N), nas(N), ANCHOR);
    const v2 = await crossAssetRelationshipSpecHashV2();
    expect(e.provenance_refs).toContain(
      `spec:${CROSS_ASSET_RELATIONSHIP_SPEC_V2.spec_id}:v2:${v2}`);
    expect(e.provenance_refs).toContain(
      `base_spec:${CROSS_ASSET_SPEC_V1.spec_id}:v1:${CROSS_ASSET_SPEC_V1_HASH_PINNED}`);
    expect(e.provenance_refs.some((p) => p.startsWith("counterpart_completion_proof:"))).toBe(true);
  });
});

describe("XARC V2 — endpoint contract", () => {
  const src = readFileSync(
    "supabase/functions/ron-agent-cross-asset-correlation/index.ts", "utf8");

  it("defaults to V2 while keeping V1 replay reachable and isolated", () => {
    expect(src).toContain("body.spec_version == null ? 2");
    expect(src).toContain("buildCrossAssetEvidenceV1");
    expect(src).toContain("buildCrossAssetRelationshipEvidenceV2");
    expect(src).toContain("counterpart_bars_v1");
    expect(src).toContain("unsupported_spec_version");
  });

  it("stays service-only, read-only and non-persisting", () => {
    expect(src).toContain("unauthorized: internal service-role endpoint");
    expect(src).toContain("persisted: false");
    expect(src).toContain('execution_path: "signal_only"');
    expect(src).toContain("allow_live_execution: false");
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(src).not.toMatch(/openai|anthropic|lovable-api|fetch\(/i);
  });
});
