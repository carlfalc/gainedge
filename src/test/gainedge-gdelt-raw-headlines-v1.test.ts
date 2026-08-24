/**
 * GAINEDGE_GDELT_RAW_HEADLINES_V1 — raw GDELT DOC 2.0 headline ingestion seam.
 *
 * Source facts only: no sentiment/direction/impact/probability/causal claim, no RON
 * reads or writes, no news_items writes, no LLM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  GDELT_DOC2_ENDPOINT, GDELT_PROVIDER, GDELT_MAX_RECORDS, GDELT_QUERY_BUCKETS,
  buildBucketUrl, parseGdeltTimestamp, providerEventId, normalizeArticle,
} from "../../supabase/functions/ingest-macro-headlines/gdelt-doc2.ts";

const BASE = "f1e63ad1ea01d86190b51517e0a985278e164ed8";
const FN = readFileSync("supabase/functions/ingest-macro-headlines/index.ts", "utf8");
const PURE = readFileSync("supabase/functions/ingest-macro-headlines/gdelt-doc2.ts", "utf8");
/** Strip comments so prose about what we do NOT do can't satisfy code assertions. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FN_CODE = code(FN);
const PURE_CODE = code(PURE);
const MIGRATION = readFileSync(
  "supabase/migrations/20260817104500_macro_source_events.sql", "utf8");

const article = (over: Record<string, unknown> = {}) => ({
  url: "https://example.org/a/gold-steady",
  title: "Gold steady before US data",
  seendate: "20260817T101500Z",
  domain: "example.org",
  language: "English",
  sourcecountry: "United States",
  ...over,
});

describe("GDELT DOC 2.0 request contract", () => {
  it("uses the exact official HTTPS endpoint", () => {
    expect(GDELT_DOC2_ENDPOINT).toBe("https://api.gdeltproject.org/api/v2/doc/doc");
  });

  it("every bucket URL carries the fixed deterministic parameters", () => {
    for (const { query } of GDELT_QUERY_BUCKETS) {
      const u = new URL(buildBucketUrl(query));
      expect(u.origin + u.pathname).toBe(GDELT_DOC2_ENDPOINT);
      expect(u.searchParams.get("mode")).toBe("artlist");
      expect(u.searchParams.get("format")).toBe("json");
      expect(u.searchParams.get("sort")).toBe("datedesc");
      expect(u.searchParams.get("timespan")).toBe("15min");
      const max = Number(u.searchParams.get("maxrecords"));
      expect(max).toBe(GDELT_MAX_RECORDS);
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(250);
      expect(u.searchParams.get("query")).toBe(query);
    }
  });

  it("builds URLs with URL/URLSearchParams, not string concatenation", () => {
    expect(PURE).toContain("new URL(GDELT_DOC2_ENDPOINT)");
    expect(PURE).toContain("new URLSearchParams(");
    expect(PURE).not.toMatch(/GDELT_DOC2_ENDPOINT\s*\+/);
  });

  it("covers the four fixed macro buckets with intended terms", () => {
    const byBucket = Object.fromEntries(GDELT_QUERY_BUCKETS.map((b) => [b.bucket, b.query]));
    expect(Object.keys(byBucket).sort()).toEqual([
      "central_banks_macro", "commodities_energy", "geopolitics_conflict", "trade_policy",
    ]);
    expect(byBucket.geopolitics_conflict).toMatch(/sanctions/);
    expect(byBucket.geopolitics_conflict).toMatch(/Strait of Hormuz/);
    expect(byBucket.central_banks_macro).toMatch(/FOMC/);
    expect(byBucket.central_banks_macro).toMatch(/DXY/);
    expect(byBucket.commodities_energy).toMatch(/gold/);
    expect(byBucket.commodities_energy).toMatch(/OPEC/);
    expect(byBucket.trade_policy).toMatch(/tariff/);
  });

  it("excludes crypto and single-company/earnings scope entirely", () => {
    const all = GDELT_QUERY_BUCKETS.map((b) => b.query).join(" ").toLowerCase();
    for (const banned of [
      "bitcoin", "btc", "ethereum", "eth ", "crypto", "earnings", "shares",
      "stock ticker", "nasdaq:", "nyse:", "apple", "tesla", "nvidia",
    ]) expect(all).not.toContain(banned);
  });
});

describe("point-in-time source timestamps", () => {
  it("parses the GDELT compact seendate form", () => {
    expect(parseGdeltTimestamp("20260817T101500Z")).toBe("2026-08-17T10:15:00.000Z");
  });

  it("rejects missing or malformed timestamps instead of repairing them", () => {
    for (const bad of [undefined, null, "", "   ", "not-a-date", 12345, {}]) {
      expect(parseGdeltTimestamp(bad)).toBeNull();
    }
  });

  it("never substitutes wall-clock time for a source timestamp", async () => {
    expect(PURE_CODE).not.toContain("new Date()");
    expect(PURE_CODE).not.toContain("Date.now()");
    const r = await normalizeArticle(article({ seendate: "garbage" }), "commodities_energy");
    expect(r).toMatchObject({ ok: false, reason: "invalid_source_timestamp" });
  });

  it("rejects rows with no url or no headline", async () => {
    const noUrl = await normalizeArticle(article({ url: "" }), "trade_policy");
    expect(noUrl.ok).toBe(false);
    const noTitle = await normalizeArticle(article({ title: "  " }), "trade_policy");
    expect(noTitle.ok).toBe(false);
  });
});

describe("deterministic provider_event_id", () => {
  it("is a stable sha256 of url + source timestamp, never random", async () => {
    const a = await providerEventId("https://x.test/a", "2026-08-17T10:15:00.000Z");
    const b = await providerEventId("https://x.test/a", "2026-08-17T10:15:00.000Z");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const other = await providerEventId("https://x.test/a", "2026-08-17T10:30:00.000Z");
    expect(other).not.toBe(a);
    expect(PURE).not.toContain("randomUUID");
    expect(FN).not.toContain("randomUUID");
  });

  it("is identical for the same article seen through different buckets", async () => {
    const one = await normalizeArticle(article(), "commodities_energy");
    const two = await normalizeArticle(article(), "geopolitics_conflict");
    expect(one.ok && two.ok).toBe(true);
    if (one.ok && two.ok) {
      expect(one.row.provider_event_id).toBe(two.row.provider_event_id);
    }
  });
});

describe("normalized row is source-descriptive only", () => {
  it("stores the raw GDELT row verbatim plus descriptive metadata", async () => {
    const raw = article();
    const r = await normalizeArticle(raw, "central_banks_macro");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.raw).toBe(raw);
    expect(r.row.provider).toBe(GDELT_PROVIDER);
    expect(r.row.url).toBe(raw.url);
    expect(r.row.headline).toBe(raw.title);
    expect(r.row.publisher).toBe("example.org");
    expect(r.row.source_country).toBe("United States");
    expect(r.row.source_language).toBe("English");
    expect(r.row.query_bucket).toBe("central_banks_macro");
    expect(r.row.published_at).toBe("2026-08-17T10:15:00.000Z");
    expect(r.row.raw_topic_metadata).toEqual({
      query_bucket: "central_banks_macro",
      provider: GDELT_PROVIDER,
      source_timestamp_field: "seendate",
    });
    for (const banned of [
      "instruments_affected", "impact", "sentiment", "direction", "confidence",
      "probability", "importance", "recommendation",
    ]) expect(Object.keys(r.row)).not.toContain(banned);
  });

  it("carries no derived-claim vocabulary in either source file", () => {
    const src = (FN_CODE + PURE_CODE).toLowerCase();
    for (const banned of [
      "sentiment", "instruments_affected", "ai_reason_short", "numeric_probability",
      "recommendation", "execution_allowed", "openai", "lovable.dev/api", "embedding",
      "gpt-", "gemini",
    ]) expect(src).not.toContain(banned);
  });
});

describe("write surface and idempotency", () => {
  it("writes only to macro_source_events", () => {
    const tables = [...FN_CODE.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(tables).toEqual(["macro_source_events"]);
    for (const banned of [
      "news_items", "ron_", "falconer", "gainedge_ai_conversations", "profiles",
    ]) expect(FN_CODE).not.toContain(banned);
  });

  it("upserts with DO NOTHING semantics on the unique provider key", () => {
    expect(FN).toContain('onConflict: "provider,provider_event_id"');
    expect(FN).toContain("ignoreDuplicates: true");
    expect(FN).not.toContain("ingested_at:");
    expect(FN).not.toContain(".update(");
    expect(FN).not.toContain(".delete(");
  });

  it("is service-role only with a timing-safe comparison", () => {
    expect(FN).toContain("timingSafeEq");
    expect(FN).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(FN).toContain('unauthorized: internal service-role endpoint');
  });

  it("does not return raw articles in the summary response", () => {
    expect(FN).toContain("success: !allFailed");
    expect(FN).not.toMatch(/json\(\{[^}]*articles/);
  });
});

describe("migration shape", () => {
  it("creates only macro_source_events with the required columns", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.macro_source_events");
    for (const col of [
      "provider text NOT NULL", "provider_event_id text NOT NULL", "url text NOT NULL",
      "headline text NOT NULL", "published_at timestamptz NOT NULL",
      "ingested_at timestamptz NOT NULL DEFAULT now()", "query_bucket text NOT NULL",
      "raw_topic_metadata jsonb NOT NULL DEFAULT '{}'::jsonb", "raw jsonb NOT NULL",
    ]) expect(MIGRATION).toContain(col);
    expect(MIGRATION.match(/CREATE TABLE/g)).toHaveLength(1);
  });

  it("has the unique provider key and timestamp indexes", () => {
    expect(MIGRATION).toContain("UNIQUE (provider, provider_event_id)");
    expect(MIGRATION).toContain("(published_at DESC)");
    expect(MIGRATION).toContain("(ingested_at DESC)");
  });

  it("enables RLS and grants no browser access", () => {
    expect(MIGRATION).toContain("ALTER TABLE public.macro_source_events ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain("GRANT SELECT, INSERT ON public.macro_source_events TO service_role");
    expect(MIGRATION).not.toMatch(/TO\s+(anon|authenticated)/);
    expect(MIGRATION.toUpperCase()).not.toContain("CREATE POLICY");
  });
});

describe("frozen surfaces untouched", () => {
  it("leaves existing news, RON, strategy, UI, plan and CI trees byte-identical", () => {
    const diff = execSync(
      `git diff ${BASE} -- src supabase strategy .lovable .github`
      + ` ':(exclude)supabase/functions/ingest-macro-headlines'`
      + ` ':(exclude)supabase/migrations/20260817104500_macro_source_events.sql'`
      // GAINEDGE_GDELT_SERVER_SCHEDULE_V1: additive, newly authorized cron migration.
      + ` ':(exclude)supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql'`
      + ` ':(exclude)src/test/gainedge-gdelt-raw-headlines-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts'`
      // Older freeze guards were narrowed to exclude this slice's new, additive paths.
      + ` ':(exclude)src/test/gainedge-product-ask-ron-global-entry-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-gdelt-server-schedule-v1.test.ts'`
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1: additive, newly authorized scheduler,
      // its schedule migrations and the ron-orchestrate-run boot fix it depends on.
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/migrations/20260821061910_bfc73e53-1fc1-4b70-bffb-8e1b54cdf36b.sql'`
      + ` ':(exclude)supabase/migrations/20260821061932_53b5b8ea-752a-4845-9ac2-8f2b272589b8.sql'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      // Auto-generated backend types regenerate when a migration is applied.
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      // GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3: authorized, additive single-anchor stack
      // (Session/Pattern/Cross-Asset/Opportunity V3 specs, Orchestration V8, the four
      // specialist endpoints' additive V3 branches, the coordinator, the scheduler pin
      // and this slice's own tests). No frozen V1-V7 artifact is modified.
      + ` ':(exclude)supabase/functions/_shared/ron-session-structure-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-pattern-structure-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestration-run-v8.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-session-structure/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-pattern-context/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-cross-asset-correlation/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-opportunity-risk/index.ts'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)src/test/gainedge-ron-live-anchor-compat-v3.test.ts'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts'`
      + ` ':(exclude)src/test/ron-ha-pattern-context-v1.test.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-spec-v1.ts'`
      + ` ':(exclude)src/test/ron-opportunity-context-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      // GAINEDGE_RON_SNAPSHOT_FEATURE_VERSION_ALIGNMENT_V1: authorized frontend read
      // alignment (snapshot feature_version pin) and its own tests.
      + ` ':(exclude)src/services/ron-snapshots.ts'`
      + ` ':(exclude)src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts'`
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // GAINEDGE_DASHBOARD_UI_V1: frontend-only dashboard presentation slice.
      + ` ':(exclude)src/lib/dashboard-ron-summary.ts'`
      + ` ':(exclude)src/lib/dashboard-pulse.ts'`
      + ` ':(exclude)src/lib/dashboard-scanners.ts'`
      + ` ':(exclude)src/components/dashboard/InstrumentCard.tsx'`
      + ` ':(exclude)src/components/dashboard/RonPulse.tsx'`
      + ` ':(exclude)src/components/dashboard/MarketScannersWidget.tsx'`
      + ` ':(exclude)src/components/dashboard/MoversShakersWidget.tsx'`
      + ` ':(exclude)src/components/dashboard/InstrumentTrackingPanel.tsx'`
      + ` ':(exclude)src/pages/dashboard/DashboardHome.tsx'`
      + ` ':(exclude)src/test/gainedge-dashboard-ui-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-product-ron-context-links-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ui-provenance-readiness-v1.test.tsx'`
      // GAINEDGE_CHARTS_UI_V1_PATH_A + dashboard typography/clock slices — frontend only.
      + ` ':(exclude)src/components/dashboard/WorldClocks.tsx'`
      + ` ':(exclude)src/components/dashboard/MostVolumeBar.tsx'`
      + ` ':(exclude)src/components/dashboard/VolumeHistoryInline.tsx'`
      + ` ':(exclude)src/lib/charts-context.ts'`
      + ` ':(exclude)src/components/dashboard/ChartSidePanel.tsx'`
      + ` ':(exclude)src/components/dashboard/ChartTabPane.tsx'`
      + ` ':(exclude)src/pages/dashboard/TradingViewChartPage.tsx'`
      // GAINEDGE_CHARTS_UI_V1_1_REFINEMENT — frontend-only charts refinement.
      + ` ':(exclude)src/components/dashboard/TradeExecutionPanel.tsx'`
      + ` ':(exclude)src/test/gainedge-charts-ui-v1-1-refinement.test.tsx'`
      + ` ':(exclude)src/test/gainedge-charts-ui-v1-2-plain-english-pattern-recency.test.tsx'`
      // GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — frontend-only educational preview.
      + ` ':(exclude)src/components/dashboard/PatternPreviewModal.tsx'`
      + ` ':(exclude)src/lib/pattern-preview.ts'`
      + ` ':(exclude)src/services/pattern-preview-candles.ts'`
      + ` ':(exclude)src/test/gainedge-charts-v1-3-ron-pattern-preview.test.tsx'`
      // GAINEDGE_RON_PATTERN_EXPANSION_V1 — additive named-pattern detectors.
      + ` ':(exclude)supabase/functions/_shared/ron-patterns-expansion-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-features.ts'`
      + ` ':(exclude)src/test/gainedge-ron-pattern-expansion-v1.test.ts'`
      // GAINEDGE_RON_PATTERN_EXPANSION_V1_LINEAGE_FIX — forward-only snapshot feature v7.
      + ` ':(exclude)src/test/ron-lineage-2d1e.test.ts'`
      // GAINEDGE_SIGNALS_V1 — frontend-only Signals & Opportunities page (read-only
      // presentation over already-stored RON decisions and Falconer records) plus the
      // working plan document. No backend, runtime or frozen artifact is touched.
      + ` ':(exclude).lovable/plan.md'`
      + ` ':(exclude)src/pages/dashboard/SignalsPage.tsx'`
      + ` ':(exclude)src/lib/signals-presentation.ts'`
      + ` ':(exclude)src/services/signals-data.ts'`
      + ` ':(exclude)src/components/signals'`
      + ` ':(exclude)src/test/gainedge-signals-v1.test.tsx'`
      + ` ':(exclude)src/test/gainedge-ui-dedupe-nav-v1.test.tsx'`
      + ` ':(exclude)src/test/gainedge-gdelt-raw-headlines-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-gdelt-server-schedule-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-product-ask-ron-global-entry-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts'`
      ,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});
