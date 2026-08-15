/**
 * Macro / News / Geopolitics V2 — observed temporal XAU price context tests.
 * Deterministic synthetic fixtures only. Nothing is persisted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MACRO_NEWS_SPEC_V2, macroNewsSpecHashV2, buildMacroTemporalContextEvidenceV2,
  resolvePriceContext, lastCompletedBarOpen,
} from "../../supabase/functions/_shared/ron-macro-temporal-context-v2.ts";
import {
  macroNewsSpecHash, buildMacroNewsEvidenceV1, MACRO_NEWS_LATEST_SUMMARY_COUNT,
  type MacroNewsRow,
} from "../../supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts";
import {
  sealEvidence, validateEvidence, scanDenylist, evidenceTtlMinutes, agentSpec,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { classifySlots } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import type { StructureBar } from "../../supabase/functions/_shared/ron-session-structure-spec.ts";

const MACRO_SPEC_V1_HASH_PINNED =
  "0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f";

const BAR = 15 * 60_000;
const MIN = 60_000;
/** Wednesday 2026-08-12, London/NY hours — venue is open. */
const ANCHOR = Date.parse("2026-08-12T15:00:00Z");

const bar = (time: number, close: number): StructureBar =>
  ({ time, open: close, high: close, low: close, close, created_at: time + BAR });

/** contiguous admissible bars for the 8 hours before the anchor. */
const series = (n = 32, from = ANCHOR - BAR): StructureBar[] =>
  Array.from({ length: n }, (_, i) => bar(from - i * BAR, 2000 + (n - i))).reverse();

const row = (over: Partial<MacroNewsRow> & { id: string }): MacroNewsRow => ({
  headline: "Fed rate decision lands",
  source: "FixtureWire",
  published_at: ANCHOR - 60 * MIN,
  instruments_affected: ["XAUUSD"],
  impact: "medium",
  ...over,
});

const never = () => false;

const buildV2 = (
  items: MacroNewsRow[], bars: StructureBar[], anchor = ANCHOR,
  isQuarantined: (b: { time: number }, m: number) => boolean = never,
) => buildMacroTemporalContextEvidenceV2({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor, items,
  run_id: "fixture_run", trace_id: "fixture_trace", bars, isQuarantined,
});

const obs = (e: { observations: { key: string; value_num?: number; value_text?: string }[] }, k: string) =>
  e.observations.find((o) => o.key === k);

describe("V2 identity and V1 preservation", () => {
  it("leaves the frozen V1 spec hash untouched", async () => {
    expect(await macroNewsSpecHash()).toBe(MACRO_SPEC_V1_HASH_PINNED);
  });

  it("V1 evidence remains byte-identical/replayable under spec_version 1", async () => {
    const items = [row({ id: "a" }), row({ id: "b", published_at: ANCHOR - 20 * MIN })];
    const one = await buildMacroNewsEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, items,
      run_id: "r", trace_id: "t",
    });
    const two = await buildMacroNewsEvidenceV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR, items,
      run_id: "r", trace_id: "t",
    });
    expect((await sealEvidence(one)).evidence_hash).toBe((await sealEvidence(two)).evidence_hash);
    expect(one.provenance_refs.some((p) => p.includes(MACRO_SPEC_V1_HASH_PINNED))).toBe(true);
  });

  it("V2 has its own spec hash, distinct from V1", async () => {
    const v2 = await macroNewsSpecHashV2();
    expect(v2).toHaveLength(64);
    expect(v2).not.toBe(MACRO_SPEC_V1_HASH_PINNED);
    expect(await macroNewsSpecHashV2()).toBe(v2);
  });

  it("keeps the orchestration contract identical (same agent id/version/ttl)", () => {
    expect(MACRO_NEWS_SPEC_V2.agent_id).toBe("macro_news_geopolitics");
    expect(MACRO_NEWS_SPEC_V2.agent_version).toBe(1);
    expect(MACRO_NEWS_SPEC_V2.authority_class).toBe("contextual");
    expect(MACRO_NEWS_SPEC_V2.authority_rank).toBe(4);
    expect(MACRO_NEWS_SPEC_V2.source_health_authoritative).toBe(false);
    expect(agentSpec("macro_news_geopolitics")!.ttl_multiplier).toBe(4);
    expect(evidenceTtlMinutes("macro_news_geopolitics", "15m")).toBe(240);
  });

  it("freezes the fail-closed data contract", () => {
    const c = MACRO_NEWS_SPEC_V2.price_context_contract;
    expect(c.completed_bars_only).toBe(true);
    expect(c.incomplete_current_bar_admitted).toBe(false);
    expect(c.lookahead).toBe("none");
    expect(c.interpolation_allowed).toBe(false);
    expect(c.nearest_match_allowed).toBe(false);
    expect(c.resampling_allowed).toBe(false);
    expect(c.forward_fill_allowed).toBe(false);
    expect(c.synthetic_bars_allowed).toBe(false);
    expect(c.quality_critical_defect_bridging_allowed).toBe(false);
    expect(c.unexpected_missing_defect_bridging_allowed).toBe(false);
    expect(c.expected_closure_is_a_defect).toBe(false);
    expect(c.reaction_horizon_invented).toBe(false);
    expect(c.fabricated_zero_change_allowed).toBe(false);
    expect(MACRO_NEWS_SPEC_V2.semantics_contract.temporal_adjacency_is_causation).toBe(false);
    expect(MACRO_NEWS_SPEC_V2.semantics_contract.impact_emitted).toBe(false);
    expect(MACRO_NEWS_SPEC_V2.safety_contract.execution_allowed).toBe(false);
    expect(MACRO_NEWS_SPEC_V2.safety_contract.execution_path).toBe("signal_only");
    expect(MACRO_NEWS_SPEC_V2.safety_contract.persistence_in_this_phase).toBe(false);
  });
});

describe("V2 determinism and observed context", () => {
  it("emits observed change from completed-bar references and replays identically", async () => {
    const items = [row({ id: "a", published_at: ANCHOR - 60 * MIN })];
    const bars = series();
    const a = await buildV2(items, bars);
    const b = await buildV2(items, bars);
    expect(validateEvidence(a)).toEqual([]);
    expect((await sealEvidence(a)).evidence_hash).toBe((await sealEvidence(b)).evidence_hash);
    expect(obs(a, "latest_item_1_price_context_status")!.value_text).toBe("available");
    const pre = obs(a, "latest_item_1_pre_publication_reference_close")!.value_num!;
    const post = obs(a, "latest_item_1_first_post_publication_close")!.value_num!;
    expect(obs(a, "latest_item_1_observed_change_to_first_post_publication_close")!.value_num)
      .toBe(post - pre);
    expect(obs(a, "macro_temporal_context_state")!.value_text).toBe("observed_price_context_present");
  });

  it("input order does not change canonical output", async () => {
    const items = [
      row({ id: "a", published_at: ANCHOR - 90 * MIN }),
      row({ id: "b", published_at: ANCHOR - 40 * MIN, headline: "CPI inflation prints" }),
      row({ id: "c", published_at: ANCHOR - 200 * MIN, headline: "OPEC crude supply" }),
    ];
    const bars = series();
    const h1 = (await sealEvidence(await buildV2(items, bars))).evidence_hash;
    const h2 = (await sealEvidence(await buildV2([...items].reverse(), bars))).evidence_hash;
    expect(h1).toBe(h2);
  });

  it("an article inside a bar uses only completed-bar references", async () => {
    const pub = ANCHOR - 60 * MIN + 7 * MIN;      // mid-bar publication
    const bars = series();
    const e = await buildV2([row({ id: "a", published_at: pub })], bars);
    const preAt = e.observations.find((o) => o.key === "latest_item_1_pre_publication_reference_close")!.at!;
    const postAt = e.observations.find((o) => o.key === "latest_item_1_first_post_publication_close")!.at!;
    expect(Date.parse(preAt)).toBeLessThanOrEqual(pub);
    expect(Date.parse(postAt)).toBeGreaterThan(pub);
    expect(Date.parse(postAt)).toBeLessThanOrEqual(ANCHOR);
  });

  it("never leaks a bar completed after the evaluation anchor", async () => {
    const bars = [...series(), bar(ANCHOR, 9999), bar(ANCHOR + BAR, 12345)];
    const e = await buildV2([row({ id: "a", published_at: ANCHOR - 60 * MIN })], bars);
    for (const o of e.observations) {
      if (o.at) expect(Date.parse(o.at)).toBeLessThanOrEqual(ANCHOR);
      if (o.value_num != null) expect([9999, 12345]).not.toContain(o.value_num);
    }
    expect(obs(e, "anchor_reference_close")!.value_num).toBe(series().at(-1)!.close);
  });

  it("absent post-publication bar gives unavailable, not a fabricated zero", async () => {
    const bars = series(4, ANCHOR - 40 * BAR);   // all bars far before publication
    const e = await buildV2([row({ id: "a", published_at: ANCHOR - 10 * MIN })], bars);
    expect(obs(e, "latest_item_1_price_context_status")!.value_text)
      .toBe("unavailable_no_post_publication_admissible_bar_at_anchor");
    expect(obs(e, "latest_item_1_observed_change_to_first_post_publication_close")).toBeUndefined();
  });

  it("absent pre-publication bar gives unavailable, not a fabricated zero", async () => {
    const bars = series(3, ANCHOR - BAR);         // only bars after publication
    const e = await buildV2([row({ id: "a", published_at: ANCHOR - 300 * MIN })], bars);
    expect(obs(e, "latest_item_1_price_context_status")!.value_text)
      .toBe("unavailable_no_pre_publication_admissible_bar");
    expect(obs(e, "latest_item_1_pre_publication_reference_close")).toBeUndefined();
  });

  it("quality-critical defects are never bridged", async () => {
    const bars = series();
    const bad = bars[bars.length - 2].time;
    const e = await buildV2([row({ id: "a", published_at: ANCHOR - 120 * MIN })], bars,
      ANCHOR, (b) => b.time === bad);
    expect(obs(e, "latest_item_1_price_context_status")!.value_text)
      .toBe("unavailable_source_defect_between_references");
    expect(obs(e, "price_context_quality_critical_slots")!.value_num).toBe(1);
    expect(e.data_health.status).toBe("degraded");
  });

  it("unexpected-missing defects are never bridged", async () => {
    const bars = series().filter((_, i) => i !== 28);
    const e = await buildV2([row({ id: "a", published_at: ANCHOR - 120 * MIN })], bars);
    expect(obs(e, "price_context_unexpected_missing_slots")!.value_num).toBeGreaterThan(0);
    expect(obs(e, "latest_item_1_price_context_status")!.value_text)
      .toBe("unavailable_source_defect_between_references");
  });

  it("expected venue closures are truthful and are not defects", async () => {
    // Saturday: XAU venue closed, so absent bars must classify as expected_closed.
    const sat = Date.parse("2026-08-15T12:00:00Z");
    const slots = classifySlots(sat - 8 * BAR, lastCompletedBarOpen(sat), [], never);
    expect(slots.every((s) => s.cls === "expected_closed")).toBe(true);
    const e = await buildV2([row({ id: "a", published_at: sat - 30 * MIN })], [], sat);
    expect(obs(e, "price_context_unexpected_missing_slots")!.value_num).toBe(0);
    expect(obs(e, "price_context_expected_closed_slots")!.value_num).toBeGreaterThan(0);
    expect(obs(e, "macro_temporal_context_state")!.value_text)
      .toBe("unavailable_no_admissible_completed_bars");
    expect(e.data_health.status).not.toBe("degraded");
  });

  it("no source items yields the V1 insufficient state, with no invented context", async () => {
    const e = await buildV2([], series());
    expect(e.status).toBe("insufficient_data");
    expect(obs(e, "macro_temporal_context_state")!.value_text)
      .toBe("unavailable_no_admitted_source_items");
  });

  it("bounds the summarised items to the inherited V1 latest-item count", async () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      row({ id: `i${i}`, published_at: ANCHOR - (10 + i) * MIN }));
    const e = await buildV2(items, series());
    expect(obs(e, `latest_item_${MACRO_NEWS_LATEST_SUMMARY_COUNT}_price_context_status`)).toBeDefined();
    expect(obs(e, `latest_item_${MACRO_NEWS_LATEST_SUMMARY_COUNT + 1}_price_context_status`)).toBeUndefined();
  });

  it("resolvePriceContext is pure and rejects post-anchor slots", () => {
    const bars = series();
    const slots = classifySlots(bars[0].time, ANCHOR + 4 * BAR, [...bars, bar(ANCHOR, 5)], never);
    const r = resolvePriceContext(slots, ANCHOR - 60 * MIN, ANCHOR);
    expect(r.status).toBe("available");
    expect(r.anchorRef!.time + BAR).toBeLessThanOrEqual(ANCHOR);
  });
});

describe("V2 safety surface", () => {
  it("stays neutral/unknown, contextual and non-executable", async () => {
    const e = await buildV2([row({ id: "a" })], series());
    expect(["neutral", "unknown"]).toContain(e.direction);
    expect(["context_only", "no_action"]).toContain(e.recommendation);
    expect(e.agent_id).toBe("macro_news_geopolitics");
    expect(e.agent_version).toBe(1);
    expect(e.uncertainty.level).toBe("unquantified");
  });

  it("emits no probability, secret or causal keys", async () => {
    const e = await sealEvidence(await buildV2([row({ id: "a" })], series()));
    expect(scanDenylist(e)).toEqual([]);
  });

  it("uses no causal/impact/predictive language in observation keys", async () => {
    const e = await buildV2([row({ id: "a" })], series());
    const banned = ["impact_of", "caused", "reaction", "forecast", "predict", "expected_value",
      "signal_strength", "edge", "p_value", "significan", "entry", "stop_loss", "take_profit"];
    for (const o of e.observations) {
      for (const b of banned) expect(o.key).not.toContain(b);
    }
  });

  it("source module reads no forbidden model columns, table, LLM or web fetch", () => {
    const src = readFileSync(
      "supabase/functions/_shared/ron-macro-temporal-context-v2.ts", "utf8");
    for (const forbidden of ["openai", "gateway", "fetch("]) {
      expect(src.toLowerCase()).not.toContain(forbidden);
    }
    expect(src).not.toMatch(/from\(\s*["'`]news_impact_results/);
    expect(src).not.toMatch(/ai_reason_short|sentiment_direction/);
    expect(src).not.toMatch(/select\([^)]*ai_reason_short/);
  });

  it("endpoint remains read-only with no persistence branch for V2", () => {
    const src = readFileSync(
      "supabase/functions/ron-agent-macro-news-geopolitics/index.ts", "utf8");
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(src).toContain("persisted: false");
    expect(src).toContain('execution_path: "signal_only"');
    expect(src).toContain("execution_allowed: false");
  });
});
