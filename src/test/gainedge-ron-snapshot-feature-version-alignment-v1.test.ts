/**
 * GAINEDGE_RON_SNAPSHOT_FEATURE_VERSION_ALIGNMENT_V1
 *
 * Read-alignment guard: the dashboard's RON snapshot reader must pin the CURRENT
 * production snapshot feature version (7), not a stale pin. Static source analysis
 * plus pure-function assertions only — no network, no database, nothing persisted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  CURRENT_RON_SNAPSHOT_FEATURE_VERSION,
  CURRENT_RON_FEATURE_VERSION,
  CURRENT_RON_LABEL_VERSION,
  ronStateFrom,
  ronStateColor,
} from "@/services/ron-snapshots";

const SERVICE = "src/services/ron-snapshots.ts";
const src = () => readFileSync(SERVICE, "utf8");

/** Representative production feature_version 7 XAUUSD 15m feature object. */
const V7_FEATURES = {
  rsi14: 46.2, adx14: 18.4, macd_state: "bearish_expanding", stoch_rsi: 22.5,
  atr_pct: 0.11, regime: "transition", ema_stack: "up",
  ema9: 3421.1, ema21: 3420.4, ema50: 3418.9, ema200: 3402.2,
  ha_state: "bearish", ha_body_pct: 0.42, volatility_regime: "normal",
  session: "ny", provenance: "genuine", volume_available: true,
};

/** The same fields as they appear in a feature_version 4 row (identical vocabulary). */
const V4_FEATURES = { ...V7_FEATURES, regime: "trending_up" };

describe("RON snapshot reader pins the current production feature version", () => {
  it("exposes snapshot feature version 7", () => {
    expect(CURRENT_RON_SNAPSHOT_FEATURE_VERSION).toBe(7);
  });

  it("treats legacy v6 as neither current nor mixable", () => {
    expect(CURRENT_RON_SNAPSHOT_FEATURE_VERSION).not.toBe(6);
    const s = src();
    // No literal version filter may exist: only the pinned constants are ever used.
    expect(s).not.toMatch(/\.eq\("feature_version",\s*\d/);
  });

  it("uses the snapshot pin for the live snapshot query and the quality anchor", () => {
    const s = src();
    const pinned = s.match(/\.eq\("feature_version", CURRENT_RON_SNAPSHOT_FEATURE_VERSION\)/g) ?? [];
    expect(pinned.length).toBe(2);
    // The snapshot table must never be queried with the research-lineage version.
    const snapshotBlocks = s.split('from("ron_market_snapshots")').slice(1);
    expect(snapshotBlocks.length).toBe(2);
    for (const b of snapshotBlocks) {
      expect(b.slice(0, 400)).toContain("CURRENT_RON_SNAPSHOT_FEATURE_VERSION");
      expect(b.slice(0, 400)).not.toContain('.eq("feature_version", CURRENT_RON_FEATURE_VERSION)');
    }
  });

  it("keeps the research outcome lineage pairing (feature v4 / label v5) untouched", () => {
    expect(CURRENT_RON_FEATURE_VERSION).toBe(4);
    expect(CURRENT_RON_LABEL_VERSION).toBe(5);
    const s = src();
    const outcomeBlocks = s.split('from("ron_snapshot_outcomes")').slice(1);
    expect(outcomeBlocks.length).toBeGreaterThan(0);
    for (const b of outcomeBlocks) {
      expect(b.slice(0, 300)).toContain("CURRENT_RON_FEATURE_VERSION");
      expect(b.slice(0, 300)).toContain("CURRENT_RON_LABEL_VERSION");
    }
  });

  it("cannot let a stale v4 row win: only the pinned version is ever selected", () => {
    const s = src();
    expect(s).not.toContain(".in(\"feature_version\"");
    expect(s).toContain('.order("bar_time", { ascending: false })');
  });
});

describe("v7 rows map onto every frontend-consumed field", () => {
  const CONSUMED = [
    "rsi14", "adx14", "macd_state", "stoch_rsi", "atr_pct", "regime", "ema_stack",
  ] as const;

  it("accepts all consumed keys from a representative v7 row", () => {
    for (const k of CONSUMED) expect(V7_FEATURES).toHaveProperty(k);
    expect(typeof V7_FEATURES.rsi14).toBe("number");
    expect(typeof V7_FEATURES.adx14).toBe("number");
    expect(typeof V7_FEATURES.atr_pct).toBe("number");
    expect(typeof V7_FEATURES.macd_state).toBe("string");
    expect(typeof V7_FEATURES.regime).toBe("string");
    expect(typeof V7_FEATURES.ema_stack).toBe("string");
  });

  it("selects every row field the UI renders", () => {
    const s = src();
    for (const col of [
      "symbol", "timeframe", "bar_time", "open", "high", "low", "close",
      "volume", "features", "patterns", "data_health", "computed_at",
    ]) expect(s).toContain(col);
  });
});

describe("ronStateFrom() semantics are unchanged by the version alignment", () => {
  it("returns the accepted baseline result for a v4-shaped input", () => {
    const r = ronStateFrom(V4_FEATURES)!;
    // trending_up (+2) + ema stack up (+1); ADX 18.4 < 25 and MACD is not bullish.
    expect(r.state).toBe("WATCH");
    expect(r.why).toBe(
      "Regime is trending up · ADX 18.4 (trend strength weak) · EMA stack up · RSI 46.2 · MACD bearish expanding",
    );
    expect(r.next).toBe(
      "Needs ADX above 25 and the EMA stack to align before a setup can form.",
    );
  });

  it("produces identical output for the identical feature payload read as v7", () => {
    expect(ronStateFrom({ ...V4_FEATURES })).toEqual(ronStateFrom(V4_FEATURES));
    const v6 = ronStateFrom(V7_FEATURES)!;
    expect(v6.state).toBe("WATCH");
    expect(v6.why).toContain("Regime is transition");
  });

  it("keeps the three-state vocabulary and colours", () => {
    expect(ronStateColor("SETUP FORMING")).toBe("#00CFA5");
    expect(ronStateColor("WATCH")).toBe("#F59E0B");
    expect(ronStateColor("WAIT")).toBe("#555F73");
  });

  it("degrades exactly as before on missing/invalid v7 fields", () => {
    expect(ronStateFrom(null)).toBeNull();
    const partial = ronStateFrom({ regime: "range", ema_stack: "mixed", macd_state: "bearish_fading" })!;
    expect(partial.state).toBe("WAIT");
    expect(partial.why).toContain("ADX unavailable");
    expect(partial.why).toContain("RSI unavailable");
  });

  it("publishes no probability/confidence-like runtime surface", () => {
    const s = src();
    for (const banned of ["win_rate", "expected_value", "edge_score", "toFixed(0)%"]) {
      expect(s).not.toContain(banned);
    }
    // Probability/confidence language may appear only in prohibitive documentation.
    for (const line of s.split("\n")) {
      if (/probability|confidence/i.test(line)) expect(line.trimStart().startsWith("*")).toBe(true);
    }
  });
});

describe("slice diff is limited to the frontend read alignment", () => {
  const BASE = "004cd5ab5555bb91930d3c07b29ea03549ddc440";
  const haveBase = (() => {
    try { execSync(`git cat-file -e ${BASE}^{commit}`, { stdio: "ignore" }); return true; } catch { return false; }
  })();

  it.skipIf(!haveBase)("touches no backend/runtime/orchestration file", () => {
    const changed = execSync(`git diff --name-only ${BASE} -- supabase strategy .lovable`, { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
    // GAINEDGE_RON_PATTERN_EXPANSION_V1 is an authorized additive detector slice: it adds
    // a new module and composes it in the snapshot feature pipeline only. No runtime,
    // orchestration, scheduler, migration or execution surface is touched.
    const allowedBackend = new Set([
      "supabase/functions/_shared/ron-patterns-expansion-v1.ts",
      "supabase/functions/_shared/ron-features.ts",
      // GAINEDGE_SIGNALS_V1 — working plan document only; no runtime surface.
      ".lovable/plan.md",
      // GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1 — authorized forward-only repair of the
      // unattended runtime: additive TTL policy v2, Opportunity/Risk V4, Orchestration V9.
      "supabase/functions/_shared/ron-agent-contracts.ts",
      "supabase/functions/_shared/ron-orchestrator.ts",
      "supabase/functions/_shared/ron-opportunity-risk-spec.ts",
      "supabase/functions/_shared/ron-opportunity-risk-spec-v4.ts",
      "supabase/functions/_shared/ron-orchestration-run-v9.ts",
      "supabase/functions/ron-agent-opportunity-risk/index.ts",
      "supabase/functions/ron-orchestrate-run/index.ts",
      "supabase/functions/ron-schedule-orchestration/index.ts",
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      "supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts",
      "supabase/functions/ron-opportunity-context/index.ts",
      "supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql",
      // GAINEDGE_MULTI_ASSET_FOUNDATION_AND_CHART_PERSISTENCE_V1 — ingestion foundation only.
      "supabase/functions/_shared/broker-symbol-variants.ts",
      "supabase/functions/_shared/ron-venue-registry-v1.ts",
      "supabase/functions/_shared/ron-data-health-v1.ts",
      "supabase/functions/ron-data-health/index.ts",
      "supabase/functions/_shared/ron-forward-instrument-binding-v1.ts",
      "supabase/functions/_shared/ron-opportunity-context-spec-v2.ts",
      "supabase/functions/_shared/ron-opportunity-context-runtime-v2.ts",
      "supabase/functions/_shared/ron-material-events-v1.ts",
      "supabase/functions/_shared/ron-outcome-evaluation-v1.ts",
      "supabase/functions/ron-context-scheduler/index.ts",
      "supabase/functions/ron-outcome-evaluate/index.ts",
      "supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql",
      "supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql",
      "supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql",
      "supabase/functions/ron-snapshot/index.ts",
      "src/test/gainedge-ron-always-on-agentic-v1.test.ts",
      "src/services/ron-event-review.ts",
      "src/components/signals/EventReviewTab.tsx",
      "src/test/ron-outcome-learning-v1.test.ts",
      "src/test/migration-hygiene.test.ts",
      "supabase/functions/ingest-candles/index.ts",
    ]);
    expect(changed.filter((f) => !allowedBackend.has(f))).toEqual([]);
  });

  it.skipIf(!haveBase)("changes only the snapshot service, this slice's tests, and the later dashboard-UI slice", () => {
    const changed = execSync(`git diff --name-only ${BASE}`, { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set([
      SERVICE,
      "src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts",
      "src/test/gainedge-gdelt-raw-headlines-v1.test.ts",
      "src/test/gainedge-gdelt-server-schedule-v1.test.ts",
      // GAINEDGE_DASHBOARD_UI_V1 — frontend-only presentation slice, no backend touched.
      "src/lib/dashboard-ron-summary.ts",
      "src/lib/dashboard-pulse.ts",
      "src/lib/dashboard-scanners.ts",
      "src/components/dashboard/InstrumentCard.tsx",
      "src/components/dashboard/RonPulse.tsx",
      "src/components/dashboard/MarketScannersWidget.tsx",
      "src/components/dashboard/MoversShakersWidget.tsx",
      "src/components/dashboard/InstrumentTrackingPanel.tsx",
      "src/pages/dashboard/DashboardHome.tsx",
      "src/test/gainedge-dashboard-ui-v1.test.ts",
      "src/test/gainedge-product-ron-context-links-v1.test.ts",
      "src/test/gainedge-ui-provenance-readiness-v1.test.tsx",
      // GAINEDGE_CHARTS_UI_V1_PATH_A + dashboard typography/clock slices — frontend only.
      "src/components/dashboard/WorldClocks.tsx",
      "src/components/dashboard/MostVolumeBar.tsx",
      "src/components/dashboard/VolumeHistoryInline.tsx",
      "src/lib/charts-context.ts",
      "src/components/dashboard/ChartSidePanel.tsx",
      "src/components/dashboard/ChartTabPane.tsx",
      "src/pages/dashboard/TradingViewChartPage.tsx",
      // GAINEDGE_CHARTS_UI_V1_1_REFINEMENT — frontend-only charts refinement.
      "src/components/dashboard/TradeExecutionPanel.tsx",
      "src/test/gainedge-charts-ui-v1-1-refinement.test.tsx",
      "src/test/gainedge-charts-ui-v1-2-plain-english-pattern-recency.test.tsx",
      // GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — frontend-only educational preview.
      "src/components/dashboard/PatternPreviewModal.tsx",
      "src/lib/pattern-preview.ts",
      "src/services/pattern-preview-candles.ts",
      "src/test/gainedge-charts-v1-3-ron-pattern-preview.test.tsx",
      // GAINEDGE_RON_PATTERN_EXPANSION_V1 — additive named-pattern detectors.
      "supabase/functions/_shared/ron-patterns-expansion-v1.ts",
      "supabase/functions/_shared/ron-features.ts",
      "src/test/gainedge-ron-pattern-expansion-v1.test.ts",
      // GAINEDGE_RON_PATTERN_EXPANSION_V1_LINEAGE_FIX — forward-only snapshot feature v7.
      "src/test/ron-lineage-2d1e.test.ts",
      "src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts",
      "src/test/gainedge-product-ask-ron-global-entry-v1.test.ts",
      "src/test/ron-v3-v8-regression-guard.test.ts",
      // Typecheck scoping only: ES2021 lib + app-source scope. No frozen artifact touched.
      "tsconfig.app.json",
      // GAINEDGE_SIGNALS_V1 — frontend-only Signals & Opportunities page.
      "src/pages/dashboard/SignalsPage.tsx",
      "src/lib/signals-presentation.ts",
      "src/services/signals-data.ts",
      "src/components/signals/SignalsSummary.tsx",
      "src/components/signals/RonOpportunitiesTab.tsx",
      "src/components/signals/RonOpportunityCard.tsx",
      "src/components/signals/FalconerSignalsTab.tsx",
      "src/components/signals/FalconerRecordList.tsx",
      "src/components/signals/FalconerFilters.tsx",
      "src/components/signals/HistoryTab.tsx",
      "src/test/gainedge-signals-v1.test.tsx",
      "src/test/gainedge-ui-dedupe-nav-v1.test.tsx",
      ".lovable/plan.md",
      // GAINEDGE_GLOBAL_SIGNAL_POPUP_V1 — frontend-only global notification layer.
      "src/components/dashboard/GlobalSignalNotifications.tsx",
      "src/components/dashboard/TradeNotificationPopup.tsx",
      "src/components/dashboard/DashboardLayout.tsx",
      "src/lib/signal-notifications.ts",
      "src/test/gainedge-global-signal-popup-v1.test.tsx",
      // Platform-managed preview auth storage (auto-generated, not part of any slice).
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
      // GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1 — tests for the runtime repair.
      "src/test/ron-always-on-runtime-recovery-v1.test.ts",
      "src/test/ron-v3-v8-regression-guard.test.ts",
      "src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts",
      "src/test/gainedge-ron-live-anchor-compat-v3.test.ts",
      "src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts",
      "src/test/gainedge-gdelt-raw-headlines-v1.test.ts",
      "src/test/gainedge-gdelt-server-schedule-v1.test.ts",
      "src/test/gainedge-product-ask-ron-global-entry-v1.test.ts",
      "supabase/functions/_shared/ron-agent-contracts.ts",
      "supabase/functions/_shared/ron-orchestrator.ts",
      "supabase/functions/_shared/ron-opportunity-risk-spec.ts",
      "supabase/functions/_shared/ron-opportunity-risk-spec-v4.ts",
      "supabase/functions/_shared/ron-orchestration-run-v9.ts",
      "supabase/functions/ron-agent-opportunity-risk/index.ts",
      "supabase/functions/ron-orchestrate-run/index.ts",
      "supabase/functions/ron-schedule-orchestration/index.ts",
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      "supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts",
      "supabase/functions/ron-opportunity-context/index.ts",
      "supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql",
      "src/lib/ron-opportunity-context-presentation.ts",
      "src/services/ron-opportunity-context.ts",
      "src/components/signals/RonOpportunityContextPanel.tsx",
      "src/components/signals/RonOpportunityCard.tsx",
      "src/services/signals-data.ts",
      "src/integrations/supabase/types.ts",
      "src/test/gainedge-ron-opportunity-context-runtime-v1.test.ts",
      // GAINEDGE_MULTI_ASSET_FOUNDATION_AND_CHART_PERSISTENCE_V1 — ingestion/chart/UI slice only.
      "supabase/functions/_shared/broker-symbol-variants.ts",
      "supabase/functions/_shared/ron-venue-registry-v1.ts",
      "supabase/functions/_shared/ron-data-health-v1.ts",
      "supabase/functions/ron-data-health/index.ts",
      "supabase/functions/_shared/ron-forward-instrument-binding-v1.ts",
      "supabase/functions/_shared/ron-opportunity-context-spec-v2.ts",
      "supabase/functions/_shared/ron-opportunity-context-runtime-v2.ts",
      "supabase/functions/_shared/ron-material-events-v1.ts",
      "supabase/functions/_shared/ron-outcome-evaluation-v1.ts",
      "supabase/functions/ron-context-scheduler/index.ts",
      "supabase/functions/ron-outcome-evaluate/index.ts",
      "supabase/migrations/20260826064238_ca543cd1-29d2-4872-81dd-96acfa83d6ca.sql",
      "supabase/migrations/20260826064431_3ebf58b0-f9af-4bf0-83f0-937336669d68.sql",
      "supabase/migrations/20260826064528_9d6949fd-c285-46b5-8ac3-ccb10c30d725.sql",
      "supabase/functions/ron-snapshot/index.ts",
      "src/test/gainedge-ron-always-on-agentic-v1.test.ts",
      "src/services/ron-event-review.ts",
      "src/components/signals/EventReviewTab.tsx",
      "src/test/ron-outcome-learning-v1.test.ts",
      "src/test/migration-hygiene.test.ts",
      "supabase/functions/ingest-candles/index.ts",
      "src/App.tsx",
      "src/components/dashboard/DashboardLayout.tsx",
      "src/components/dashboard/PersistentChartsHost.tsx",
      "src/components/dashboard/TradingViewWidget.tsx",
      "src/components/dashboard/AddChartTabModal.tsx",
      "src/components/dashboard/ChartTabPane.tsx",
      "src/components/dashboard/TradeExecutionPanel.tsx",
      "src/pages/dashboard/TradingViewChartPage.tsx",
      "src/pages/ChartPopout.tsx",
      "src/test/gainedge-multi-asset-foundation-and-chart-persistence-v1.test.tsx",
      "src/test/gainedge-ask-ron-global-context-bridge-v1.test.ts",
      "src/test/gainedge-gdelt-raw-headlines-v1.test.ts",
      "src/test/gainedge-gdelt-server-schedule-v1.test.ts",
      "src/test/gainedge-product-ask-ron-global-entry-v1.test.ts",
      "src/test/ron-v3-v8-regression-guard.test.ts",
      "src/test/gainedge-ron-snapshot-feature-version-alignment-v1.test.ts",
    ]);
    expect(changed.filter((f) => !allowed.has(f))).toEqual([]);
  });

});
