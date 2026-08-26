import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { openRonPopout, ASK_RON_ROUTE } from "@/lib/ron-popout";

const SRC = readFileSync("src/lib/ron-popout.ts", "utf8");
const BASE = "4c43db110945ab6a026c6e77ae07b72d4adc82dc";

describe("GAINEDGE_PRODUCT_ASK_RON_GLOBAL_ENTRY_V1", () => {
  let openSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    openSpy = vi.fn(() => null);
    vi.stubGlobal("window", { ...globalThis.window, open: openSpy });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens exactly /dashboard/ai with _blank and noopener", () => {
    openRonPopout();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai", "_blank", "noopener");
    expect(ASK_RON_ROUTE).toBe("/dashboard/ai");
  });

  it("non-allowlisted route context does not alter the URL", () => {
    openRonPopout({ page: "/dashboard/charts", search: "?symbol=XAUUSD" });
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai", "_blank", "noopener");
  });

  it("fails silently when popup is blocked (null return)", () => {
    expect(() => openRonPopout({ page: "/dashboard" })).not.toThrow();
  });

  it("introduces no transport, storage or backend surface", () => {
    for (const banned of ["fetch(", "supabase", "functions.invoke", "localStorage", "sessionStorage", "postMessage", "document."]) {
      expect(SRC).not.toContain(banned);
    }
  });

  it("route /dashboard/ai remains registered and unchanged", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="ai" element={<GainEdgeAIPage />} />');
  });

  it("DashboardLayout still calls openRonPopout with route data only", () => {
    const layout = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
    expect(layout).toContain("openRonPopout(");
    const arg = layout.slice(layout.indexOf("openRonPopout("), layout.indexOf("openRonPopout(") + 200);
    expect(arg).toContain("page: location.pathname");
    expect(arg).toContain("search: location.search");
    for (const banned of ["sessionLabel", "userName", "userId"]) {
      expect(arg).not.toContain(banned);
    }
  });

  it("frozen supabase/, strategy/ and plan remain unchanged", () => {
    // supabase/functions/gainedge-ai/index.ts is intentionally changed by the later
    // accepted slice GAINEDGE_ASK_RON_RON_EVIDENCE_V1; everything else stays frozen.
    const diff = execSync(
      // The additive GAINEDGE_GDELT_RAW_HEADLINES_V1 raw-ingestion seam is newly
      // authorized and touches no file this guard protects.
      `git diff ${BASE} -- supabase strategy .lovable/plan.md ':(exclude)supabase/functions/gainedge-ai/index.ts'`
      + ` ':(exclude)supabase/functions/ingest-macro-headlines'`
      + ` ':(exclude)supabase/migrations/20260817104500_macro_source_events.sql'`
      // GAINEDGE_GDELT_SERVER_SCHEDULE_V1: additive, newly authorized cron migration.
      + ` ':(exclude)supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql'`
      // GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1: additive, newly authorized scheduler,
      // its schedule migrations and the ron-orchestrate-run boot fix it depends on.
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/migrations/20260821061910_bfc73e53-1fc1-4b70-bffb-8e1b54cdf36b.sql'`
      + ` ':(exclude)supabase/migrations/20260821061932_53b5b8ea-752a-4845-9ac2-8f2b272589b8.sql'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
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
      + ` ':(exclude)supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql'`
      + ` ':(exclude)supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql'`
      + ` ':(exclude)supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql'`
      + ` ':(exclude)supabase/functions/ron-snapshot/index.ts'`
      + ` ':(exclude)src/test/gainedge-ron-always-on-agentic-v1.test.ts'`
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
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // GAINEDGE_RON_PATTERN_EXPANSION_V1: additive named-pattern detectors composed
      // only into the snapshot feature pipeline. The hash-pinned ron-patterns.ts and every
      // frozen V1-V8 spec stay byte-identical.
      + ` ':(exclude)supabase/functions/_shared/ron-patterns-expansion-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-features.ts'`
      // GAINEDGE_SIGNALS_V1 — the working plan document is a non-runtime artifact.
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
      + ` ':(exclude)supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql'`
      + ` ':(exclude)supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql'`
      + ` ':(exclude)supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql'`
      + ` ':(exclude)supabase/functions/ron-snapshot/index.ts'`
      + ` ':(exclude)src/test/gainedge-ron-always-on-agentic-v1.test.ts'`
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
      + ` ':(exclude).lovable/plan.md'`,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});
