/**
 * Phase 2D.2h — MACRO / NEWS / GEOPOLITICS SPECIALIST V1 adversarial + hash-pinned tests.
 *
 * Deterministic synthetic fixtures only. Nothing is persisted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MACRO_NEWS_SPEC_V1, MACRO_NEWS_WINDOW_MINUTES, MACRO_NEWS_MAX_ROWS,
  MACRO_TOPIC_CATEGORIES, MACRO_TOPIC_KEYWORDS_V1,
  buildMacroNewsEvidenceV1, macroNewsSpecHash, classifyHeadline, canonicalNewsRows,
  MacroNewsSourceConflictError, type MacroNewsRow, type MacroTopicCategory,
} from "../../supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts";
import {
  sealEvidence, validateEvidence, scanDenylist, evidenceTtlMinutes, agentSpec,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { sessionStructureSpecHashV2 } from "../../supabase/functions/_shared/ron-session-structure-spec-v2.ts";
import { calibrationValidationSpecHash } from "../../supabase/functions/_shared/ron-calibration-validation-spec.ts";
import {
  patternContextSpecHash, PATTERN_DETECTOR_SOURCE_SHA256,
} from "../../supabase/functions/_shared/ron-pattern-context-spec.ts";
import { crossAssetSpecHash } from "../../supabase/functions/_shared/ron-cross-asset-spec.ts";
import { PROMOTED_STATE_VARIABLES } from "../../supabase/functions/_shared/ron-agentic-architecture.ts";

/** EXACT frozen full hash of Macro / News / Geopolitics Spec V1. */
const MACRO_SPEC_V1_HASH_PINNED =
  "0a4c5bf46babd273beb163f3cbc17888ae5dcd2ec0ab13f1cde60660ec73233f";

const ANCHOR = Date.parse("2026-08-13T10:00:00Z");
const MIN = 60_000;

const row = (over: Partial<MacroNewsRow> & { id: string }): MacroNewsRow => ({
  headline: "Gold steady ahead of data",
  source: "FixtureWire",
  published_at: ANCHOR - 30 * MIN,
  instruments_affected: ["XAUUSD"],
  impact: "medium",
  ...over,
});

const build = (items: MacroNewsRow[], anchor = ANCHOR) => buildMacroNewsEvidenceV1({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor, items,
  run_id: "fixture_run", trace_id: "fixture_trace",
});

const obs = (e: { observations: { key: string; value_num?: number; value_text?: string }[] }, key: string) =>
  e.observations.find((o) => o.key === key);

describe("2D.2h — frozen spec identity", () => {
  it("pins the exact full Macro / News / Geopolitics Spec V1 hash", async () => {
    expect(await macroNewsSpecHash()).toBe(MACRO_SPEC_V1_HASH_PINNED);
  });

  it("hashing is stable across calls", async () => {
    expect(await macroNewsSpecHash()).toBe(await macroNewsSpecHash());
  });

  it("registry identity matches the pre-registered agent row and is unaltered", () => {
    const spec = agentSpec("macro_news_geopolitics")!;
    expect(spec.agent_version).toBe(1);
    expect(spec.authority_class).toBe("contextual");
    expect(spec.source_health_authoritative).toBe(false);
    expect(spec.ttl_multiplier).toBe(4);
    expect(evidenceTtlMinutes("macro_news_geopolitics", "15m")).toBe(240);
    expect(MACRO_NEWS_SPEC_V1.authority_rank).toBe(4);
  });

  it("all accepted upstream hashes remain unchanged", async () => {
    expect(await sessionStructureSpecHashV2())
      .toBe("9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b");
    expect(await calibrationValidationSpecHash())
      .toBe("e0543a887aa1784ac083cf4761f6f6a42470a95aeb5b678c8f98e0e099ac5b3c");
    expect(await patternContextSpecHash())
      .toBe("9983d79b80e691655bfdd9179c2dabab14ec41494fa7e738cc540b1727de663d");
    expect(PATTERN_DETECTOR_SOURCE_SHA256)
      .toBe("2086613c1cc164c9c057e26d14272332444268918d8805b663c14e3a3efaf756");
    expect(await crossAssetSpecHash())
      .toBe("8056d67030cfb005acdcac89f37de1761da14092de17638b967cefeaadcccd44");
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
  });

  it("freezes the source, window, safety and taxonomy contract", () => {
    expect(MACRO_NEWS_SPEC_V1.source_contract.table).toBe("news_items");
    expect(MACRO_NEWS_SPEC_V1.source_contract.forbidden_fields)
      .toEqual(["ai_reason_short", "sentiment_direction"]);
    expect(MACRO_NEWS_SPEC_V1.source_contract.forbidden_tables).toEqual(["news_impact_results"]);
    expect(MACRO_NEWS_WINDOW_MINUTES).toBe(720);
    expect(MACRO_NEWS_MAX_ROWS).toBe(100);
    expect(MACRO_NEWS_SPEC_V1.taxonomy_contract.llm_used).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.taxonomy_contract.embedding_used).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.predictive).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.causal).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.sentiment_emitted).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.importance_score_emitted).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.source_credibility_score_emitted).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.persistence_in_phase_2d2h).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.execution_allowed).toBe(false);
    expect(MACRO_NEWS_SPEC_V1.safety_contract.execution_path).toBe("signal_only");
    expect(MACRO_NEWS_SPEC_V1.clustering_contract.cross_publisher_event_clustering_allowed).toBe(false);
    for (const c of [
      "central_bank_rates", "inflation_prices", "labor_employment", "fiscal_trade_tariffs",
      "geopolitics_conflict_sanctions", "energy_supply", "commodity_supply_demand",
      "yields_usd", "risk_markets", "other_macro",
    ]) {
      expect(MACRO_TOPIC_CATEGORIES).toContain(c as MacroTopicCategory);
    }
  });
});

describe("2D.2h — deterministic headline taxonomy", () => {
  const fixtures: Record<Exclude<MacroTopicCategory, "other_macro">, string> = {
    central_bank_rates: "Fed officials weigh a rate cut before Jackson Hole",
    inflation_prices: "US CPI inflation nudges higher in July",
    labor_employment: "Weekly jobless claims fall as payroll growth steadies",
    fiscal_trade_tariffs: "New tariff schedule published for imported steel",
    geopolitics_conflict_sanctions: "Fresh sanctions announced amid the ongoing conflict",
    energy_supply: "Crude slips as OPEC signals more barrels",
    commodity_supply_demand: "Bullion demand climbs as mining output slows",
    yields_usd: "Treasury yield curve steepens",
    risk_markets: "Wall Street equities extend a broad selloff",
  };

  for (const [cat, headline] of Object.entries(fixtures)) {
    it(`classifies the ${cat} fixture deterministically`, () => {
      expect(classifyHeadline(headline)).toContain(cat as MacroTopicCategory);
      expect(classifyHeadline(headline)).toEqual(classifyHeadline(headline));
    });
  }

  it("falls back to other_macro with no keyword match", () => {
    expect(classifyHeadline("Local museum announces summer opening hours"))
      .toEqual(["other_macro"]);
  });

  it("allows multi-category tagging in a stable frozen category order", () => {
    const tags = classifyHeadline("Fed rate cut bets lift gold as treasury yields slide");
    expect(tags).toEqual(["central_bank_rates", "commodity_supply_demand", "yields_usd"]);
  });

  it("other_macro has no keywords and is fallback-only by construction", () => {
    expect(MACRO_TOPIC_KEYWORDS_V1.other_macro).toEqual([]);
  });

  it("taxonomy consumes the headline only — model columns are not part of the input type", async () => {
    const withModelCols = {
      ...row({ id: "a", headline: "Local museum announces summer opening hours" }),
      ai_reason_short: "bullish for gold",
      sentiment_direction: "bullish",
    } as unknown as MacroNewsRow;
    const e = await build([withModelCols]);
    const text = JSON.stringify(e).toLowerCase();
    expect(text).not.toContain("bullish");
    expect(text).not.toContain("ai_reason_short");
    expect(text).not.toContain("sentiment_direction");
    expect(obs(e, "topic_other_macro_items")!.value_num).toBe(1);
  });
});

describe("2D.2h — window, ordering and duplicate policy", () => {
  it("ignores publications AFTER the anchor, including in the hash", async () => {
    const base = [row({ id: "a" })];
    const withFuture = [...base, row({ id: "z", published_at: ANCHOR + 5 * MIN })];
    const a = await sealEvidence(await build(base));
    const b = await sealEvidence(await build(withFuture));
    expect(b.evidence_hash).toBe(a.evidence_hash);
  });

  it("includes a publication exactly AT the anchor", async () => {
    const e = await build([row({ id: "a", published_at: ANCHOR })]);
    expect(obs(e, "total_items_in_window")!.value_num).toBe(1);
    expect(obs(e, "latest_item_age_minutes")!.value_num).toBe(0);
    expect(e.as_of).toBe(new Date(ANCHOR).toISOString());
  });

  it("includes the exact 12h lower boundary and excludes one millisecond earlier", async () => {
    const onEdge = await build([row({ id: "a", published_at: ANCHOR - MACRO_NEWS_WINDOW_MINUTES * MIN })]);
    expect(onEdge.status).toBe("supported");
    expect(obs(onEdge, "total_items_in_window")!.value_num).toBe(1);
    const outside = await build([row({ id: "a", published_at: ANCHOR - MACRO_NEWS_WINDOW_MINUTES * MIN - 1 })]);
    expect(outside.status).toBe("insufficient_data");
  });

  it("is independent of input row order", async () => {
    const items = [
      row({ id: "a", published_at: ANCHOR - 200 * MIN }),
      row({ id: "b", published_at: ANCHOR - 100 * MIN }),
      row({ id: "c", published_at: ANCHOR - 10 * MIN }),
    ];
    const a = await sealEvidence(await build(items));
    const b = await sealEvidence(await build([...items].reverse()));
    const c = await sealEvidence(await build([items[1], items[2], items[0]]));
    expect(b.evidence_hash).toBe(a.evidence_hash);
    expect(c.evidence_hash).toBe(a.evidence_hash);
  });

  it("dedupes IDENTICAL duplicate rows by stable identity", async () => {
    const r = row({ id: "dup" });
    const e = await build([r, { ...r }, { ...r }]);
    expect(obs(e, "total_items_in_window")!.value_num).toBe(1);
    expect(canonicalNewsRows([r, { ...r }]).rows).toHaveLength(1);
  });

  it("FAILS CLOSED on a contradictory duplicate id", async () => {
    const items = [row({ id: "dup" }), row({ id: "dup", headline: "A completely different headline" })];
    expect(() => canonicalNewsRows(items)).toThrow(MacroNewsSourceConflictError);
    const e = await build(items);
    expect(e.status).toBe("blocked");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.status).toBe("critical");
    expect(e.data_health.issues).toContain("conflicting_duplicate_source_row_id");
  });

  it("treats two DIFFERENT ids with identical wording as two source records", async () => {
    const e = await build([
      row({ id: "one", headline: "It is on to Jackson Hole next" }),
      row({ id: "two", headline: "It is on to Jackson Hole next", source: "OtherWire" }),
    ]);
    expect(obs(e, "total_items_in_window")!.value_num).toBe(2);
    expect(obs(e, "distinct_publishers")!.value_num).toBe(2);
  });

  it("excludes malformed rows and degrades rather than repairing them", async () => {
    const e = await build([
      row({ id: "ok" }),
      row({ id: "bad", published_at: Number.NaN }),
      { ...row({ id: "" }) },
    ]);
    expect(obs(e, "malformed_rows_excluded")!.value_num).toBe(2);
    expect(e.data_health.status).toBe("degraded");
    expect(obs(e, "total_items_in_window")!.value_num).toBe(1);
  });

  it("caps admission at 100 newest in-window rows and says so", async () => {
    const items = Array.from({ length: 130 }, (_, i) =>
      row({ id: `i${String(i).padStart(3, "0")}`, published_at: ANCHOR - (130 - i) * MIN }));
    const e = await build(items);
    expect(obs(e, "total_items_in_window")!.value_num).toBe(MACRO_NEWS_MAX_ROWS);
    expect(e.data_health.issues.some((i) => i.startsWith("source_rows_truncated_to_cap"))).toBe(true);
  });
});

describe("2D.2h — honest emptiness, grounding and safety surface", () => {
  it("reports insufficient_data with NO rows and never infers a calm market", async () => {
    const e = await build([]);
    expect(e.status).toBe("insufficient_data");
    expect(e.direction).toBe("unknown");
    expect(e.recommendation).toBe("no_action");
    expect(e.data_health.issues).toContain("no_source_rows_in_window");
    const assertive = JSON.stringify({
      observations: e.observations, status: e.status,
      direction: e.direction, recommendation: e.recommendation,
    }).toLowerCase();
    for (const t of ["calm", "quiet", "no news is", "risk-off", "risk-on"]) {
      expect(assertive).not.toContain(t);
    }
    expect(e.uncertainty.limitations.some((l) => l.includes("is not a claim that markets were quiet"))).toBe(true);
  });

  it("grounds as_of and source timestamps in exact DB publication instants", async () => {
    const newest = ANCHOR - 7 * MIN;
    const oldest = ANCHOR - 400 * MIN;
    const e = await build([row({ id: "a", published_at: oldest }), row({ id: "b", published_at: newest })]);
    expect(e.as_of).toBe(new Date(newest).toISOString());
    expect(e.source_timestamps.newest_included_publication).toBe(new Date(newest).toISOString());
    expect(e.source_timestamps.oldest_included_publication).toBe(new Date(oldest).toISOString());
    expect(e.source_timestamps.evaluation_anchor).toBe(new Date(ANCHOR).toISOString());
    expect(e.data_health.freshness_minutes).toBe(7);
  });

  it("XAU ingestion tagging is reported as metadata, never as directional/causal evidence", async () => {
    const e = await build([
      row({ id: "a", instruments_affected: ["XAUUSD", "NAS100"] }),
      row({ id: "b", instruments_affected: ["GBPUSD"] }),
    ]);
    expect(obs(e, "xau_ingestion_tagged_items")!.value_num).toBe(1);
    expect(e.direction).toBe("neutral");
    expect(e.provenance_refs).toContain("ingestion_tag:instruments_affected:XAUUSD");
    expect(e.uncertainty.limitations.some((l) => l.includes("RAW INGESTION METADATA"))).toBe(true);
  });

  it("surfaces impact only as an explicitly labelled raw ingestion tag", async () => {
    const e = await build([row({ id: "a", impact: "high" })]);
    expect(obs(e, "latest_item_1_ingest_impact_tag")!.value_text).toBe("high");
    expect(e.provenance_refs).toContain("ingestion_tag:ingest_impact_tag");
    expect(MACRO_NEWS_SPEC_V1.ingestion_metadata_contract.impact_is_weight_or_authority).toBe(false);
  });

  it("direction is never long/short/mixed and recommendation is context_only/no_action", async () => {
    const cases = [
      await build([]),
      await build([row({ id: "a" })]),
      await build([row({ id: "d" }), row({ id: "d", source: "Contradiction" })]),
    ];
    for (const e of cases) {
      expect(["neutral", "unknown"]).toContain(e.direction);
      expect(["context_only", "no_action"]).toContain(e.recommendation);
    }
  });

  it("the assertive surface carries no predictive, causal, sentiment or scoring semantics", async () => {
    const e = await build([
      row({ id: "a", headline: "Fed rate cut bets lift gold" }),
      row({ id: "b", headline: "Sanctions widen as conflict escalates", source: "GeoWire" }),
    ]);
    const assertive = JSON.stringify({
      observations: e.observations.filter((o) => !o.key.includes("headline")),
      provenance_refs: e.provenance_refs,
      status: e.status, direction: e.direction, recommendation: e.recommendation,
    }).toLowerCase();
    for (const t of [
      "probability", "confidence", "likelihood", "expected_value", "forecast", "predict",
      "target", "sentiment", "bullish", "bearish", "caused", "because of", "due to",
      "importance", "credibility", "significance", "p_value", "p-value", "score", "rating",
      "surprise", "impact_score", "weight",
    ]) {
      expect(assertive).not.toContain(t);
    }
    expect(scanDenylist(e)).toEqual([]);
    expect(validateEvidence(e)).toEqual([]);
  });

  it("no observation key carries a numeric probability-like measurement", async () => {
    const e = await build([row({ id: "a" })]);
    for (const o of e.observations) {
      expect(o.key).not.toMatch(/probability|confidence|likelihood|score|rating|sentiment|forecast|target|significance/i);
    }
  });

  it("carries the mandated source-coverage and causation limitations", async () => {
    const e = await build([row({ id: "a" })]);
    const l = e.uncertainty.limitations.join(" | ");
    expect(l).toContain("absence of an article is NOT proof");
    expect(l).toContain("no causal conclusion");
    expect(l).toContain("frozen deterministic headline keyword taxonomy");
    expect(l).toContain("not de-duplicated unique real-world events");
  });
});

describe("2D.2h — purity and endpoint safety", () => {
  const specSrc = readFileSync("supabase/functions/_shared/ron-macro-news-geopolitics-spec.ts", "utf8");
  const fnSrcRaw = readFileSync("supabase/functions/ron-agent-macro-news-geopolitics/index.ts", "utf8");
  /** Executable endpoint code with block comments stripped. */
  const fnSrc = fnSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the producer performs no I/O, reads no clock and never touches Falconer", () => {
    for (const forbidden of [
      "Date.now(", "createClient", "fetch(", "Deno.env", "falconer", "supabase",
      "performance.now(",
    ]) {
      expect(specSrc.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("the producer never references forbidden model columns or the legacy table", () => {
    for (const forbidden of ["ai_reason_short", "sentiment_direction", "news_impact_results"]) {
      // the spec names them ONLY inside the frozen forbidden lists / doc header
      const assertive = specSrc.split("export async function buildMacroNewsEvidenceV1")[1] ?? "";
      expect(assertive).not.toContain(forbidden);
    }
  });

  it("the endpoint never selects a forbidden column and never queries the legacy table", () => {
    expect(fnSrc).not.toContain("ai_reason_short");
    expect(fnSrc).not.toContain("sentiment_direction");
    expect(fnSrc).not.toContain("news_impact_results");
    expect(fnSrc).toContain('.select("id, headline, source, published_at, instruments_affected, impact")');
  });

  it("the endpoint has no write, persist, orchestrator, LLM or external-fetch path", () => {
    for (const forbidden of [
      ".insert(", ".upsert(", ".update(", ".delete(", ".rpc(",
      "functions.invoke", "openai", "lovable.dev/api", "https://api.",
    ]) {
      expect(fnSrc).not.toContain(forbidden);
    }
    expect(fnSrc).toContain("persisted: false");
    expect(fnSrc).toContain("execution_path: \"signal_only\"");
  });

  it("the endpoint enforces its own fail-closed internal auth with verify_jwt pinned false", () => {
    expect(fnSrc).toContain("unauthorized: internal service-role endpoint");
    expect(fnSrc).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnSrcRaw).toContain("NO persistence branch");
    const cfg = readFileSync("supabase/config.toml", "utf8");
    expect(cfg).toContain("[functions.ron-agent-macro-news-geopolitics]");
  });

  it("the endpoint derives its anchor from source bars, never from a wall clock", () => {
    expect(fnSrc).not.toContain("Date.now(");
    expect(fnSrc).not.toContain("new Date()");
  });
});
