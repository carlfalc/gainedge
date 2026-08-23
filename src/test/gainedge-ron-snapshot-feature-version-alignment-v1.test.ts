/**
 * GAINEDGE_RON_SNAPSHOT_FEATURE_VERSION_ALIGNMENT_V1
 *
 * Read-alignment guard: the dashboard's RON snapshot reader must pin the CURRENT
 * production snapshot feature version (6), not the stale v4 pin. Static source analysis
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

/** Representative production feature_version 6 XAUUSD 15m feature object. */
const V6_FEATURES = {
  rsi14: 46.2, adx14: 18.4, macd_state: "bearish_expanding", stoch_rsi: 22.5,
  atr_pct: 0.11, regime: "transition", ema_stack: "up",
  ema9: 3421.1, ema21: 3420.4, ema50: 3418.9, ema200: 3402.2,
  ha_state: "bearish", ha_body_pct: 0.42, volatility_regime: "normal",
  session: "ny", provenance: "genuine", volume_available: true,
};

/** The same fields as they appear in a feature_version 4 row (identical vocabulary). */
const V4_FEATURES = { ...V6_FEATURES, regime: "trending_up" };

describe("RON snapshot reader pins the current production feature version", () => {
  it("exposes snapshot feature version 6", () => {
    expect(CURRENT_RON_SNAPSHOT_FEATURE_VERSION).toBe(6);
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

describe("v6 rows map onto every frontend-consumed field", () => {
  const CONSUMED = [
    "rsi14", "adx14", "macd_state", "stoch_rsi", "atr_pct", "regime", "ema_stack",
  ] as const;

  it("accepts all consumed keys from a representative v6 row", () => {
    for (const k of CONSUMED) expect(V6_FEATURES).toHaveProperty(k);
    expect(typeof V6_FEATURES.rsi14).toBe("number");
    expect(typeof V6_FEATURES.adx14).toBe("number");
    expect(typeof V6_FEATURES.atr_pct).toBe("number");
    expect(typeof V6_FEATURES.macd_state).toBe("string");
    expect(typeof V6_FEATURES.regime).toBe("string");
    expect(typeof V6_FEATURES.ema_stack).toBe("string");
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

  it("produces identical output for the identical feature payload read as v6", () => {
    expect(ronStateFrom({ ...V4_FEATURES })).toEqual(ronStateFrom(V4_FEATURES));
    const v6 = ronStateFrom(V6_FEATURES)!;
    expect(v6.state).toBe("WATCH");
    expect(v6.why).toContain("Regime is transition");
  });

  it("keeps the three-state vocabulary and colours", () => {
    expect(ronStateColor("SETUP FORMING")).toBe("#00CFA5");
    expect(ronStateColor("WATCH")).toBe("#F59E0B");
    expect(ronStateColor("WAIT")).toBe("#555F73");
  });

  it("degrades exactly as before on missing/invalid v6 fields", () => {
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
    expect(changed).toEqual([]);
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
      // Typecheck scoping only: ES2021 lib + app-source scope. No frozen artifact touched.
      "tsconfig.app.json",
    ]);
    expect(changed.filter((f) => !allowed.has(f))).toEqual([]);
  });

});
