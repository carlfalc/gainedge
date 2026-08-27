/**
 * GAINEDGE_GDELT_SERVER_SCHEDULE_V1 — server-side pg_cron schedule for the internal
 * `ingest-macro-headlines` GDELT raw ingestion function. Code + tests only; the
 * migration is staged, never applied by this slice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = "563e97b4155a2f8f850a055a9e92619153fad304";
const FILE = "supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql";
const SQL = readFileSync(FILE, "utf8");
const JOB = "ingest-macro-headlines-2m";
/** Executable SQL only (comments stripped), with the shared Vault secret name removed so
 *  prose and the accepted credential source cannot satisfy scope assertions. */
const CODE = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .toLowerCase().replaceAll("falconer_service_role_key", "<vault_secret>");

describe("schedule contract", () => {
  it("adds exactly one new migration file for this slice", () => {
    const added = execSync(
      `git diff --name-status ${BASE} -- supabase/migrations`, { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean);
    // Later authorized slices may add their own migrations; this slice adds exactly one
    // and modifies or deletes none.
    expect(added.filter((l) => !l.startsWith("A\t"))).toEqual([]);
    expect(added.filter((l) => l.includes("ingest_macro_headlines_cron"))).toEqual([`A\t${FILE}`]);
  });


  it("uses the exact schedule name and cadence", () => {
    expect(SQL).toContain(`cron.schedule(\n  '${JOB}',\n  '*/2 * * * *',`);
    expect(SQL.match(/cron\.schedule\(/g)).toHaveLength(1);
    const crons = [...SQL.matchAll(/'(\S+ \S+ \S+ \S+ \S+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(["*/2 * * * *"]);
  });

  it("posts an empty JSON body to the exact function path with JSON content type", () => {
    expect(SQL).toContain("net.http_post(");
    expect(SQL).toContain("/functions/v1/ingest-macro-headlines'");
    expect(SQL).toContain("body := '{}'::jsonb");
    expect(SQL).toContain("'Content-Type', 'application/json'");
    for (const banned of ["symbol", "instrument", "timeframe", "user_id", "probability",
      "execution", "strategy"]) expect(CODE).not.toContain(banned);
  });

  it("sources auth through Vault, with no literal key or token value", () => {
    expect(SQL).toContain("vault.decrypted_secrets");
    expect(SQL).toContain("'Bearer ' || coalesce(");
    expect(SQL).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(SQL).not.toMatch(/sb_(secret|publishable)_/);
    expect(SQL).not.toMatch(/service_role_key['"]?\s*(:=|=)\s*'[^']+'/);
  });

  it("is idempotent for that schedule name", () => {
    expect(SQL).toContain(`perform cron.unschedule('${JOB}')`);
    expect(SQL.indexOf("cron.unschedule")).toBeLessThan(SQL.indexOf("cron.schedule("));
    expect(SQL).toContain("exception when others then");
  });

  it("schedules nothing else", () => {
    for (const banned of ["ron-", "falconer", "research", "orchestrat", "fetch-news",
      "metaapi", "calibrat"]) expect(CODE).not.toContain(banned);
    const posts = [...SQL.matchAll(/\/functions\/v1\/([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(posts).toEqual(["ingest-macro-headlines"]);
  });
});

describe("frozen surfaces untouched", () => {
  it("leaves the GDELT function, RON, strategy, UI, CI and existing migrations byte-identical", () => {
    const diff = execSync(
      `git diff ${BASE} -- src supabase strategy .lovable .github`
      + ` ':(exclude)${FILE}'`
      + ` ':(exclude)src/test/gainedge-gdelt-server-schedule-v1.test.ts'`
      // Migration-hygiene allowlist entry for this slice's schedule-definition migration.
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // Older freeze guards narrowed to exclude this slice's new, additive migration.
      + ` ':(exclude)src/test/gainedge-gdelt-raw-headlines-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-product-ask-ron-global-entry-v1.test.ts'`
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
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-opportunity-context/index.ts'`
      + ` ':(exclude)supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql'`
      + ` ':(exclude)src/lib/ron-opportunity-context-presentation.ts'`
      + ` ':(exclude)src/services/ron-opportunity-context.ts'`
      + ` ':(exclude)src/components/signals/RonOpportunityContextPanel.tsx'`
      + ` ':(exclude)src/components/signals/RonOpportunityCard.tsx'`
      + ` ':(exclude)src/services/signals-data.ts'`
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      + ` ':(exclude)src/test/gainedge-ron-opportunity-context-runtime-v1.test.ts'`
      // GAINEDGE_MULTI_ASSET_FOUNDATION_AND_CHART_PERSISTENCE_V1 — ingestion targets/aliases,
      // chart symbol coverage and session-scoped Charts hosting. No RON runtime touched.
      + ` ':(exclude)supabase/functions/_shared/broker-symbol-variants.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-venue-registry-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-data-health-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-data-health/index.ts'`
      + ` ':(exclude)supabase/migrations/20260826072435_e8e96e54-da28-4533-bd4c-c424a69de51f.sql'`
      + ` ':(exclude)supabase/functions/_shared/ron-forward-instrument-binding-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-spec-v2.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v2.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-material-events-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-outcome-evaluation-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-context-scheduler/index.ts'`
      + ` ':(exclude)supabase/functions/ron-outcome-evaluate/index.ts'`
      + ` ':(exclude)supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql'`
      + ` ':(exclude)supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql'`
      + ` ':(exclude)supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql'`
      + ` ':(exclude)supabase/functions/ron-snapshot/index.ts'`
      + ` ':(exclude)src/test/gainedge-ron-always-on-agentic-v1.test.ts'`
      + ` ':(exclude)src/services/ron-event-review.ts'`
      + ` ':(exclude)src/components/signals/EventReviewTab.tsx'`
      + ` ':(exclude)src/test/ron-outcome-learning-v1.test.ts'`
      + ` ':(exclude)supabase/functions/ingest-candles/index.ts'`
      + ` ':(exclude)src/App.tsx'`
      + ` ':(exclude)src/components/dashboard/DashboardLayout.tsx'`
      + ` ':(exclude)src/components/dashboard/PersistentChartsHost.tsx'`
      + ` ':(exclude)src/components/dashboard/TradingViewWidget.tsx'`
      + ` ':(exclude)src/components/dashboard/AddChartTabModal.tsx'`
      + ` ':(exclude)src/components/dashboard/ChartTabPane.tsx'`
      + ` ':(exclude)src/components/dashboard/TradeExecutionPanel.tsx'`
      + ` ':(exclude)src/pages/dashboard/TradingViewChartPage.tsx'`
      + ` ':(exclude)src/pages/ChartPopout.tsx'`
      + ` ':(exclude)src/test/gainedge-multi-asset-foundation-and-chart-persistence-v1.test.tsx'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts'`
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
      + ` ':(exclude)supabase/functions/_shared/ron-native-roster-v1.ts'`
      + ` ':(exclude)supabase/migrations/20260827090023_6a8b1ce6-e212-4753-967d-45095d3f572b.sql'`
      + ` ':(exclude)src/lib/ron-lifecycle-since.ts'`
      + ` ':(exclude)src/services/ron-opportunity-context.ts'`
      + ` ':(exclude)supabase/functions/ron-context-scheduler/index.ts'`
      + ` ':(exclude)src/test/gainedge-ron-always-on-runtime-completion-v1.test.ts'`
      + ` ':(exclude).lovable/memory/features/intelligence/ron-outcome-learning.md'`
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
      // GAINEDGE_GLOBAL_SIGNAL_POPUP_V1 — frontend-only global notification layer.
      + ` ':(exclude)src/components/dashboard/GlobalSignalNotifications.tsx'`
      + ` ':(exclude)src/components/dashboard/TradeNotificationPopup.tsx'`
      + ` ':(exclude)src/components/dashboard/DashboardLayout.tsx'`
      + ` ':(exclude)src/lib/signal-notifications.ts'`
      + ` ':(exclude)src/test/gainedge-global-signal-popup-v1.test.tsx'`
      // Platform-managed preview auth storage (auto-generated, not part of any slice).
      + ` ':(exclude)src/integrations/supabase/client.ts'`
      // GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1: forward-only artifact-clock TTL repair.
      + ` ':(exclude)supabase/functions/_shared/ron-agent-contracts.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestrator.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec-v4.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestration-run-v9.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-opportunity-risk/index.ts'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)src/test/ron-always-on-runtime-recovery-v1.test.ts'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ron-live-anchor-compat-v3.test.ts'`
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-opportunity-context/index.ts'`
      + ` ':(exclude)supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql'`
      + ` ':(exclude)src/lib/ron-opportunity-context-presentation.ts'`
      + ` ':(exclude)src/services/ron-opportunity-context.ts'`
      + ` ':(exclude)src/components/signals/RonOpportunityContextPanel.tsx'`
      + ` ':(exclude)src/components/signals/RonOpportunityCard.tsx'`
      + ` ':(exclude)src/services/signals-data.ts'`
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      + ` ':(exclude)src/test/gainedge-ron-opportunity-context-runtime-v1.test.ts'`
      // GAINEDGE_MULTI_ASSET_FOUNDATION_AND_CHART_PERSISTENCE_V1 — ingestion targets/aliases,
      // chart symbol coverage and session-scoped Charts hosting. No RON runtime touched.
      + ` ':(exclude)supabase/functions/_shared/broker-symbol-variants.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-venue-registry-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-data-health-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-data-health/index.ts'`
      + ` ':(exclude)supabase/migrations/20260826072435_e8e96e54-da28-4533-bd4c-c424a69de51f.sql'`
      + ` ':(exclude)supabase/functions/_shared/ron-forward-instrument-binding-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-spec-v2.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v2.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-material-events-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-outcome-evaluation-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-context-scheduler/index.ts'`
      + ` ':(exclude)supabase/functions/ron-outcome-evaluate/index.ts'`
      + ` ':(exclude)supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql'`
      + ` ':(exclude)supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql'`
      + ` ':(exclude)supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql'`
      + ` ':(exclude)supabase/functions/ron-snapshot/index.ts'`
      + ` ':(exclude)src/test/gainedge-ron-always-on-agentic-v1.test.ts'`
      + ` ':(exclude)src/services/ron-event-review.ts'`
      + ` ':(exclude)src/components/signals/EventReviewTab.tsx'`
      + ` ':(exclude)src/test/ron-outcome-learning-v1.test.ts'`
      + ` ':(exclude)supabase/functions/ingest-candles/index.ts'`
      + ` ':(exclude)src/App.tsx'`
      + ` ':(exclude)src/components/dashboard/DashboardLayout.tsx'`
      + ` ':(exclude)src/components/dashboard/PersistentChartsHost.tsx'`
      + ` ':(exclude)src/components/dashboard/TradingViewWidget.tsx'`
      + ` ':(exclude)src/components/dashboard/AddChartTabModal.tsx'`
      + ` ':(exclude)src/components/dashboard/ChartTabPane.tsx'`
      + ` ':(exclude)src/components/dashboard/TradeExecutionPanel.tsx'`
      + ` ':(exclude)src/pages/dashboard/TradingViewChartPage.tsx'`
      + ` ':(exclude)src/pages/ChartPopout.tsx'`
      + ` ':(exclude)src/test/gainedge-multi-asset-foundation-and-chart-persistence-v1.test.tsx'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts'`
      + ` ':(exclude)src/integrations/supabase/previewAuthStorage.ts'`
      ,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
    const ron = execSync(
      "git diff ed8c9773b29a1748f8173551241e898e11b2c314 --"
      + " src/test/ron-orchestration-run-v5.test.ts src/test/ron-orchestration-run-v6.test.ts",
      { encoding: "utf8" },
    );
    expect(ron.trim()).toBe("");
  });

  it("adds no browser or dashboard invocation of the ingestion function", () => {
    const hits = execSync(
      "git grep -l ingest-macro-headlines -- src ':(exclude)src/test' || true",
      { encoding: "utf8" },
    ).trim().split("\n").filter(Boolean);
    expect(hits).toEqual([]);
  });

  it("keeps the migration directory otherwise untouched", () => {
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    expect(files).toContain("20260817110900_ingest_macro_headlines_cron.sql");
  });
});
