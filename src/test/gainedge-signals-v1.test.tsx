/**
 * GAINEDGE_SIGNALS_V1 — truthfulness and separation guards for the
 * Signals & Opportunities page.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  FALCONER_CLOSED_STATUSES, FALCONER_MANAGED_STATUSES, HISTORY_MODE_LABELS, PAGE_SUBTITLE,
  STORED_PNL_LABEL, STORED_PNL_NOTE, chartsHref, countToday, filterOptions, formatPrice,
  formatStoredPnl, isManagedStatus, latestInstant, matchesSearch, presentFalconerStatus,
  presentFalconerTrigger, prettifyToken, priceDecimals, relativeAge,
} from "@/lib/signals-presentation";
import { buildSummaryMetrics } from "@/components/signals/SignalsSummary";
import FalconerRecordList from "@/components/signals/FalconerRecordList";
import RonOpportunityCard from "@/components/signals/RonOpportunityCard";
import HistoryTab from "@/components/signals/HistoryTab";
import type { FalconerFeed, FalconerRecord } from "@/services/signals-data";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const SRC = {
  page: read("src/pages/dashboard/SignalsPage.tsx"),
  data: read("src/services/signals-data.ts"),
  presentation: read("src/lib/signals-presentation.ts"),
  ronTab: read("src/components/signals/RonOpportunitiesTab.tsx"),
  falconerTab: read("src/components/signals/FalconerSignalsTab.tsx"),
  historyTab: read("src/components/signals/HistoryTab.tsx"),
  card: read("src/components/signals/RonOpportunityCard.tsx"),
  list: read("src/components/signals/FalconerRecordList.tsx"),
};
const ALL = Object.values(SRC).join("\n");
/** Executable code only — provenance comments are allowed to name upstream sources. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CODE = Object.values(SRC).map(stripComments).join("\n");

const record = (over: Partial<FalconerRecord> = {}): FalconerRecord => ({
  id: "r1", symbol: "XAUUSD", timeframe: "15m", mode: "live", direction: "long",
  trigger_type: "tpLong", status: "be_active", entry_price: 4192.7312345,
  sl_price: 4180.123456, tp1_price: 4200.5, tp2_price: 4210.5, tp3_price: 4220.5,
  qty: 0.1, pnl_usd: 12.3456, commission_usd: 0, swap_usd: 0,
  opened_at: new Date().toISOString(), closed_at: null, ...over,
});

const feed = (records: FalconerRecord[], over: Partial<FalconerFeed> = {}): FalconerFeed => ({
  records, loading: false, error: null, signedIn: true, reload: vi.fn(), ...over,
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Signals V1 — status/trigger vocabulary", () => {
  it("maps only confirmed Falconer status tokens", () => {
    expect(presentFalconerStatus("be_active")).toEqual({ label: "Break-even active", unknown: false });
    expect(presentFalconerStatus("closed_ha_flip").label).toBe("Closed · Heikin Ashi flip");
    expect(presentFalconerStatus("closed_sl").label).toBe("Closed · stop loss");
    expect(presentFalconerStatus("closed_tp3").label).toBe("Closed · TP3");
    expect(presentFalconerStatus("tp1_hit").label).toBe("TP1 hit");
    expect(presentFalconerStatus("open").label).toBe("Open");
  });

  it("prettifies unknown tokens mechanically without inventing meaning", () => {
    const s = presentFalconerStatus("closed_future_thing");
    expect(s.unknown).toBe(true);
    expect(s.label).toBe("Closed future thing");
    expect(s.label).not.toMatch(/win|loss|profit|success|fail/i);
    expect(prettifyToken("someWeirdToken")).toBe("Some Weird Token");
    expect(prettifyToken(null)).toBe("—");
  });

  it("maps confirmed triggers and keeps unknown ones descriptive-free", () => {
    expect(presentFalconerTrigger("tpLong").label).toBe("Trend pullback");
    expect(presentFalconerTrigger("swAL").detail).toMatch(/Asian-session low/);
    const u = presentFalconerTrigger("zzTop");
    expect(u.unknown).toBe(true);
    expect(u.detail).toBeUndefined();
  });

  it("mirrors the engine's managed/closed status sets", () => {
    expect(FALCONER_MANAGED_STATUSES).toEqual(["open", "tp1_hit", "tp2_hit", "be_active"]);
    expect(FALCONER_CLOSED_STATUSES).toEqual(["closed_sl", "closed_tp3", "closed_ha_flip"]);
    expect(isManagedStatus("be_active")).toBe(true);
    expect(isManagedStatus("closed_sl")).toBe(false);
  });
});

describe("Signals V1 — number formatting and P&L provenance", () => {
  it("uses sensible magnitude-based precision, never raw float dumps", () => {
    expect(priceDecimals(4192.7312345)).toBe(2);
    expect(formatPrice(4192.7312345)).toBe("4192.73");
    expect(formatPrice(1.234567)).toBe("1.2346");
    expect(formatPrice(0.123456789)).toBe("0.12346");
    expect(formatPrice(null)).toBe("—");
  });

  it("qualifies stored P&L and never claims a broker statement", () => {
    expect(STORED_PNL_LABEL).toBe("Stored strategy P&L (USD)");
    expect(STORED_PNL_NOTE).toMatch(/not a broker statement/i);
    expect(formatStoredPnl(-12.3)).toBe("-$12.30");
    expect(formatStoredPnl(null)).toBe("—");
  });
});

describe("Signals V1 — pure helpers", () => {
  it("relativeAge and latestInstant are deterministic", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    expect(relativeAge("2026-08-23T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeAge(null, now)).toBe("unknown age");
    expect(latestInstant([null, "2026-08-01T00:00:00Z", "2026-08-20T00:00:00Z"]))
      .toBe("2026-08-20T00:00:00Z");
    expect(latestInstant([null, undefined])).toBeNull();
  });

  it("countToday, matchesSearch and filterOptions behave", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    expect(countToday([now.toISOString(), "2026-01-01T00:00:00Z"], now)).toBe(1);
    expect(matchesSearch("xau", ["XAUUSD", null])).toBe(true);
    expect(matchesSearch("eur", ["XAUUSD"])).toBe(false);
    expect(filterOptions(["b", "a", "a", "", null])).toEqual(["a", "b"]);
  });

  it("omits summary metrics that cannot be sourced truthfully", () => {
    const metrics = buildSummaryMetrics({
      ronRecordCount: null, ronLatestAsOf: null, liveRecordCount: null,
      liveLatestOpenedAt: null, liveRecordsToday: null,
    });
    expect(metrics).toEqual([]);
    const some = buildSummaryMetrics({
      ronRecordCount: 1, ronLatestAsOf: "2026-08-21T11:45:00Z", liveRecordCount: 1,
      liveLatestOpenedAt: "2026-08-10T01:45:00Z", liveRecordsToday: 0,
    });
    expect(some.map((m) => m.label)).toContain("Stored RON decisions");
    expect(some.map((m) => m.label)).toContain("Live records today");
  });
});

describe("Signals V1 — RON lane truthfulness", () => {
  it("shows an honest empty state when no decision is stored", () => {
    wrap(<RonOpportunityCard item={{ pair: { symbol: "EURUSD", timeframe: "15m" }, view: null, error: null }} />);
    expect(screen.getByText("No stored RON decision yet")).toBeTruthy();
    expect(screen.getByTestId("signals-link-decision-EURUSD-15m")).toBeTruthy();
    expect(screen.getByTestId("signals-link-ask-EURUSD-15m")).toBeTruthy();
  });

  it("renders the stored state token via the existing conservative glossary", () => {
    const view: any = {
      decision: {
        instrument: "XAUUSD", timeframe: "15m", state: "OPPORTUNITY_INCOMPLETE",
        as_of: "2026-08-21T11:45:00Z", recommendation: "none", direction: "none",
      },
      explanation: { why: ["Readiness checks were not all satisfied."], what_would_change: [] },
      evidence_count: 7,
    };
    wrap(<RonOpportunityCard item={{ pair: { symbol: "XAUUSD", timeframe: "15m" }, view, error: null }} />);
    expect(screen.getByTestId("ron-opportunity-state").textContent).toBe("Opportunity checks incomplete");
    expect(screen.getByTestId("ron-opportunity-asof").textContent).toMatch(/Evaluated as of/);
    expect(screen.getByText(/Probability: Not calibrated yet/)).toBeTruthy();
  });

  it("never manufactures the Opportunity Context lifecycle vocabulary", () => {
    for (const token of ["forming", "strengthening", "weakening", "invalidated", "confirmed"]) {
      expect(new RegExp(`["'\`]${token}`, "i").test(ALL)).toBe(false);
    }
  });
});

describe("Signals V1 — Falconer / History separation", () => {
  it("live tab queries live mode only and history switches modes explicitly", () => {
    expect(SRC.page).toMatch(/useFalconerRecords\("live"\)/);
    expect(SRC.page).toMatch(/useFalconerRecords\("backtest"\)/);
    expect(HISTORY_MODE_LABELS).toEqual({ backtest: "Backtest", live_history: "Live history" });
  });

  it("history renders backtest records with a visible mode chip and can switch to live history", () => {
    const bt = feed([record({ id: "b1", mode: "backtest", status: "closed_sl" })]);
    const lv = feed([record({ id: "l1", status: "closed_tp3", closed_at: new Date().toISOString() })]);
    wrap(<HistoryTab liveFeed={lv} backtestFeed={bt} />);
    expect(screen.getByTestId("falconer-mode-b1").textContent).toBe("Backtest");
    fireEvent.click(screen.getByTestId("history-mode-live_history"));
    expect(screen.getByTestId("falconer-mode-l1").textContent).toBe("Live history");
    expect(screen.queryByTestId("falconer-record-b1")).toBeNull();
  });

  it("live history excludes still-managed live records", () => {
    const lv = feed([record({ id: "open1", status: "be_active" })]);
    wrap(<HistoryTab liveFeed={lv} backtestFeed={feed([])} />);
    fireEvent.click(screen.getByTestId("history-mode-live_history"));
    expect(screen.queryByTestId("falconer-record-open1")).toBeNull();
    expect(screen.getByTestId("history-empty")).toBeTruthy();
  });

  it("record rows show mapped tokens and formatted prices, not raw dumps", () => {
    wrap(<FalconerRecordList records={[record()]} modeLabel="Live" />);
    expect(screen.getByTestId("falconer-status-r1").textContent).toBe("Break-even active");
    fireEvent.click(screen.getByTestId("falconer-record-r1").querySelector("button")!);
    expect(screen.getByText("4192.73")).toBeTruthy();
    expect(screen.queryByText("4192.7312345")).toBeNull();
    expect(screen.getByTestId("falconer-pnl-r1").textContent).toBe("$12.35");
    expect(screen.getByTestId("falconer-decision-link-r1")).toBeTruthy();
  });
});

describe("Signals V1 — scope and language guards", () => {
  it("does not read market snapshots or any v6 fallback", () => {
    expect(CODE).not.toMatch(/ron_market_snapshots/);
    expect(CODE).not.toMatch(/feature_version/);
    expect(CODE).not.toMatch(/useRonSnapshots|ronStateFrom/);
  });

  it("scopes the falconer realtime subscription to the signed-in user", () => {
    expect(SRC.data).toMatch(/filter: `user_id=eq\.\$\{userId\}`/);
    expect(SRC.data).toMatch(/\.eq\("user_id", session\.user\.id\)/);
  });

  it("introduces no BUY/SELL board or probability language", () => {
    expect(/\bBUY\b|\bSELL\b|win rate|confidence score|% probability/i.test(ALL)).toBe(false);
    expect(PAGE_SUBTITLE).toMatch(/No broker orders are placed/i);
  });

  it("performs no writes and touches no frozen runtime surface", () => {
    expect(CODE).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(CODE).not.toMatch(/metaapi|falconer-engine|ron-orchestrate|cron/i);
  });

  it("uses only deep-link routes the target pages accept", () => {
    expect(chartsHref("XAU USD")).toBe("/dashboard/charts?symbol=XAU%20USD");
    expect(SRC.card).toMatch(/ronDecisionRecordHref/);
    expect(SRC.card).toMatch(/askRonContextHref/);
  });
});
