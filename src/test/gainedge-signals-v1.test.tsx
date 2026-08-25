/**
 * GAINEDGE_SIGNALS_V1 — truthfulness and separation guards for the
 * Signals & Opportunities page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, renderHook, waitFor } from "@testing-library/react";
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
import RonOpportunitiesTab from "@/components/signals/RonOpportunitiesTab";
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
    expect(some.map((m) => m.label)).toContain("Tracked pairs with RON records");
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

// ---------------------------------------------------------- tracked-pair truth
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: trackedState.user } }),
      getSession: async () => ({ data: { session: null } }),
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: trackedState.rows, error: trackedState.error }),
        // ron_opportunity_context read path: no stored context in these tests.
        in: () => ({
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
      }),
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));

vi.mock("@/services/ron-decisions", () => ({
  fetchLatestRonDecision: async () => null,
}));

const trackedState: {
  user: { id: string } | null;
  rows: { symbol: string; timeframe: string }[] | null;
  error: { message: string } | null;
} = { user: { id: "u1" }, rows: [], error: null };

describe("Signals V1 — tracked instrument truth", () => {
  beforeEach(() => {
    trackedState.user = { id: "u1" };
    trackedState.rows = [];
    trackedState.error = null;
  });

  it("returns zero opportunities (never a fallback pair) when the user tracks nothing", async () => {
    const { useRonOpportunities } = await import("@/services/signals-data");
    const { result } = renderHook(() => useRonOpportunities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.opportunities).toEqual([]);
    expect(result.current.trackedWarning).toBeNull();
  });

  it("warns and substitutes no monitored default when the tracked read fails", async () => {
    trackedState.error = { message: "permission denied" };
    const { useRonOpportunities } = await import("@/services/signals-data");
    const { result } = renderHook(() => useRonOpportunities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.opportunities).toEqual([]);
    expect(result.current.trackedWarning).toMatch(/Could not load your tracked instruments/i);
    expect(JSON.stringify(result.current.opportunities)).not.toMatch(/XAUUSD/);
  });

  it("does not truncate a long tracked list with a plan-shaped cap", async () => {
    trackedState.rows = Array.from({ length: 14 }, (_, i) => ({ symbol: `SYM${i}`, timeframe: "15m" }));
    const { useRonOpportunities, RON_OPPORTUNITY_REQUEST_CONCURRENCY_CEILING } =
      await import("@/services/signals-data");
    expect(RON_OPPORTUNITY_REQUEST_CONCURRENCY_CEILING).toBeGreaterThanOrEqual(50);
    const { result } = renderHook(() => useRonOpportunities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.opportunities).toHaveLength(14);
  });

  it("imports no FALLBACK_PAIR into the Signals data layer", () => {
    expect(SRC.data).not.toMatch(/FALLBACK_PAIR/);
    expect(SRC.data).not.toMatch(/MAX_RON_OPPORTUNITY_PAIRS/);
  });
});

describe("Signals V1 — weekend-helper wording is not overstated", () => {
  it("never claims the market is open, only that weekend closure is inactive", () => {
    const summary = read("src/components/signals/SignalsSummary.tsx");
    expect(summary).toMatch(/Weekend closure inactive/);
    expect(summary).not.toMatch(/"Market open"/);
    expect(summary).toMatch(/Weekend closure active/);
  });
});

// -------------------------------------------- GAINEDGE_RON_SIGNALS_CONTEXT_PRIMARY_V1
const ctxRecord = (over: Record<string, unknown> = {}) => ({
  id: "c1", instrument: "XAUUSD", timeframe: "15m",
  evaluation_anchor: "2026-08-25T06:45:00Z", analytical_bar_open: "2026-08-25T06:30:00Z",
  spec_version: 1, runtime_version: 1, decision_id: "d1",
  direction_context: "bullish", direction_authority: "session_aligned",
  setup_family: "ha_trend_continuation", lifecycle: "forming",
  material_change_type: "new_forming", data_state: "healthy", data_blocked: false,
  pattern_context_state: "supportive", cross_asset_context_state: "neutral",
  macro_context_state: "neutral", ha_states: null, limitations: [],
  created_at: "2026-08-25T06:45:10Z", ...over,
} as never);

const incompleteView: any = {
  decision: {
    instrument: "XAUUSD", timeframe: "15m", state: "OPPORTUNITY_INCOMPLETE",
    as_of: "2026-08-25T06:45:00Z", recommendation: "none", direction: "none",
  },
  explanation: { why: [], what_would_change: [] },
  evidence_count: 7,
};

const ctxFeed = (opps: unknown[]) => ({
  opportunities: opps as never, loading: false, trackedWarning: null, reload: vi.fn(),
});

describe("Signals V1 — context-primary RON opportunities", () => {
  it("suppresses lifecycle none from the active lane", () => {
    wrap(<RonOpportunitiesTab feed={ctxFeed([{
      pair: { symbol: "XAUUSD", timeframe: "15m" }, view: incompleteView,
      context: ctxRecord({ lifecycle: "none", setup_family: "mixed_or_none", direction_context: "neutral" }),
      error: null,
    }])} />);
    expect(screen.queryByTestId("ron-opportunity-XAUUSD-15m")).toBeNull();
    expect(screen.getByTestId("ron-lane-empty").textContent)
      .toMatch(/No current RON opportunity context/);
  });

  it("headlines a forming bullish contextual opportunity", () => {
    wrap(<RonOpportunitiesTab feed={ctxFeed([{
      pair: { symbol: "XAUUSD", timeframe: "15m" }, view: incompleteView,
      context: ctxRecord(), error: null,
    }])} />);
    expect(screen.getByTestId("ron-opportunity-lifecycle").textContent).toBe("Forming");
    expect(screen.getByTestId("ron-opportunity-direction").textContent).toBe("Bullish context");
    expect(screen.getByText(/RON contextual opportunity · signal-only/)).toBeTruthy();
  });

  it("headlines a strengthening contextual opportunity", () => {
    wrap(<RonOpportunityCard item={{
      pair: { symbol: "XAUUSD", timeframe: "15m" }, view: incompleteView,
      context: ctxRecord({ lifecycle: "strengthening", material_change_type: "strengthened" }),
      error: null,
    } as never} />);
    expect(screen.getByTestId("ron-opportunity-lifecycle").textContent).toBe("Strengthening");
    expect(screen.getByTestId("ron-opportunity-context-XAUUSD-15m")).toBeTruthy();
  });

  it("never lets OPPORTUNITY_INCOMPLETE replace the contextual lifecycle", () => {
    wrap(<RonOpportunityCard item={{
      pair: { symbol: "XAUUSD", timeframe: "15m" }, view: incompleteView,
      context: ctxRecord(), error: null,
    } as never} />);
    expect(screen.queryByTestId("ron-opportunity-state")).toBeNull();
    expect(screen.getByTestId("ron-opportunity-audit-note").textContent)
      .toMatch(/Audit detail only/);
    expect(screen.getByTestId("signals-link-decision-XAUUSD-15m")).toBeTruthy();
    expect(screen.getByTestId("signals-link-ask-XAUUSD-15m")).toBeTruthy();
    expect(screen.getByTestId("signals-link-chart-XAUUSD-15m")).toBeTruthy();
  });

  it("introduces no probability, confidence or execution language", () => {
    expect(/probability of|confidence score|entry at|place (a )?trade|lot size/i.test(ALL)).toBe(false);
  });

  it("leaves the Falconer lane untouched", () => {
    expect(SRC.falconerTab).not.toMatch(/lifecycle|opportunity_context/i);
  });
});
