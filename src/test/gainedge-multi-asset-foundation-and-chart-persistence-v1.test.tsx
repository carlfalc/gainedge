/**
 * GAINEDGE_MULTI_ASSET_FOUNDATION_AND_CHART_PERSISTENCE_V1
 *
 * Guards for:
 *  A. multi-asset unattended ingestion targets + shared broker aliases + isolation
 *  B. deliberate TradingView mappings for HK50 / WTI / Brent (never FX fallbacks)
 *  C. session-scoped Charts route preservation and explicit polling gating
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TV_SYMBOL_MAP, getTvSymbol } from "@/components/dashboard/TradingViewWidget";
import { CHARTS_PERSISTENCE_NOTE } from "@/components/dashboard/PersistentChartsHost";

const read = (p: string) => readFileSync(p, "utf8");
const ingest = read("supabase/functions/ingest-candles/index.ts");
const aliases = read("supabase/functions/_shared/broker-symbol-variants.ts");
const pane = read("src/components/dashboard/ChartTabPane.tsx");
const panel = read("src/components/dashboard/TradeExecutionPanel.tsx");
const page = read("src/pages/dashboard/TradingViewChartPage.tsx");
const layout = read("src/components/dashboard/DashboardLayout.tsx");
const host = read("src/components/dashboard/PersistentChartsHost.tsx");
const app = read("src/App.tsx");

describe("A — multi-asset ingestion foundation", () => {
  it("targets the five pilot symbols plus oil on 15m", () => {
    for (const sym of ["XAUUSD", "NAS100", "HK50", "NZDUSD", "USDCAD", "USOUSD", "UKOUSD"]) {
      expect(ingest).toContain(`{ symbol: "${sym}", timeframe: "15m" }`);
    }
  });

  it("reuses the shared provider alias table instead of one-off maps", () => {
    expect(ingest).toContain('from "../_shared/broker-symbol-variants.ts"');
    expect(ingest).not.toContain("const BROKER_SYMBOL: Record<string, string>");
    expect(aliases).toContain('HK50: ["HK50", "HK50.i"]');
    expect(aliases).toContain('USDCAD: ["USDCAD.i", "USDCAD"]');
    expect(aliases).toContain('USOUSD: ["XTIUSD", "USOUSD", "XTIUSD.i", "WTI"]');
    expect(aliases).toContain('UKOUSD: ["XBRUSD", "UKOUSD", "XBRUSD.i", "BRENT"]');
    expect(aliases).toContain('NAS100: ["NDX100", "NAS100", "USTEC", "NAS100.i"]');
  });

  it("isolates per-symbol failures and bounds recovery", () => {
    expect(ingest).toContain("isolated: true");
    expect(ingest).toContain("MAX_RECOVERY_PAGES");
    expect(ingest).toContain("MAX_RECOVERY_LOOKBACK_DAYS");
  });

  it("introduces no synthetic-candle path", () => {
    expect(ingest).toContain("No synthesis, interpolation or forward fill.");
    expect(ingest).not.toMatch(/Math\.random|fabricat|placeholder candle/i);
    expect(ingest).toContain('c.state === "complete"');
  });

  it("enables no trade execution", () => {
    expect(ingest).not.toMatch(/metaapi-trade|"order"|createOrder|trade_execute/i);
  });
});

describe("B — chart symbol coverage", () => {
  it("maps HK50 and oil deliberately, never as FX pairs", () => {
    for (const sym of ["HK50", "USOUSD", "UKOUSD"]) {
      expect(TV_SYMBOL_MAP[sym]).toBeDefined();
      for (const broker of ["", "Pepperstone", "Eightcap", "IC Markets", "OANDA"]) {
        expect(getTvSymbol(sym, broker)).not.toBe(`FX:${sym}`);
        expect(getTvSymbol(sym, broker)).not.toMatch(/^FX:/);
      }
    }
    expect(getTvSymbol("HK50", "")).toBe("TVC:HSI");
    expect(getTvSymbol("USOUSD", "")).toBe("TVC:USOIL");
    expect(getTvSymbol("UKOUSD", "")).toBe("TVC:UKOIL");
  });

  it("keeps existing mappings intact", () => {
    expect(getTvSymbol("XAUUSD", "")).toBe("OANDA:XAUUSD");
    expect(getTvSymbol("NAS100", "")).toBe("PEPPERSTONE:NAS100");
    expect(getTvSymbol("NZDUSD", "")).toBe("FX:NZDUSD");
    expect(getTvSymbol("USDCAD", "")).toBe("FX:USDCAD");
  });

  it("falls back conservatively for unknown symbols", () => {
    expect(TV_SYMBOL_MAP["ZZZFAKE"]).toBeUndefined();
    expect(getTvSymbol("ZZZFAKE", "")).toBe("FX:ZZZFAKE");
    expect(getTvSymbol("ZZZFAKE", "Pepperstone")).toBe("PEPPERSTONE:ZZZFAKE");
  });
});

describe("C — session-scoped chart persistence", () => {
  it("hosts Charts at shell level so navigation hides instead of unmounting", () => {
    expect(layout).toContain("PersistentChartsHost");
    expect(layout).toContain("chartsActive");
    expect(host).toContain('display: visible ? "block" : "none"');
    expect(app).toContain("ChartsRoutePlaceholder");
    expect(app).not.toContain("<TradingViewChartPage />");
  });

  it("passes an explicit chartsVisible signal down to polling children", () => {
    expect(page).toContain("chartsVisible={chartsVisible}");
    expect(pane).toContain("chartsVisible?: boolean");
    expect(pane).toContain("if (!chartsVisible) return;");
    expect(pane).toContain("polling={chartsVisible}");
    expect(panel).toContain("if (!isLive || !polling) return;");
  });

  it("resumes polling exactly once via interval cleanup on the visibility dep", () => {
    expect(pane).toContain("[isLive, accountId, symbol, chartsVisible]");
    expect(panel).toContain("[symbol, accountId, isLive, polling]");
    expect(panel).toContain("[isLive, accountId, onPositionsChange, polling]");
  });

  it("bounds resident TradingView panes without deleting user tabs", () => {
    expect(page).toContain("MAX_RESIDENT_CHART_PANES");
    expect(page).toContain("residentIds.includes(tab.id)");
    expect(page).toContain("localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))");
    expect(page).toContain("localStorage.setItem(ACTIVE_KEY, activeId)");
  });

  it("states the session-scoped truth boundary without promising durability", () => {
    expect(CHARTS_PERSISTENCE_NOTE).toBe(
      "Chart indicators and drawings are preserved while this GainEdge session stays open. Full saved layouts are planned for Advanced Charts.",
    );
    expect(page).toContain("session stays open");
    expect(CHARTS_PERSISTENCE_NOTE).not.toMatch(/forever|permanent|always saved|across devices/i);
  });

  it("introduces no hidden MetaAPI order/trading calls", () => {
    for (const src of [host, page, pane]) {
      expect(src).not.toMatch(/action: "(buy|sell|order)"/);
    }
  });
});

describe("D — RON runtime untouched", () => {
  it("does not reference RON specialist/orchestration/calibration files", () => {
    for (const src of [host, layout, app]) {
      expect(src).not.toMatch(/ron-(orchestrat|opportunity-risk|calibration)/i);
    }
  });
});
