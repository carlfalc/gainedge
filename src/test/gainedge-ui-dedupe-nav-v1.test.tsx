/**
 * GAINEDGE_UI_DEDUPE_NAV_V1 — nav grouping + Signals page resilience/wording tests.
 * Frontend presentation only; no RON core, backend or execution surface is touched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { NAV_GROUPS, NAV_PATHS } from "@/lib/dashboard-nav";

const LEGACY_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/charts",
  "/dashboard/signals",
  "/dashboard/strategy",
  "/dashboard/ai",
  "/dashboard/journal",
  "/dashboard/analytics",
  "/dashboard/insights",
  "/dashboard/backtesting",
  "/dashboard/calendar",
  "/dashboard/clock-settings",
  "/dashboard/news-settings",
  "/dashboard/my-news",
  "/dashboard/ron-decision",
  "/dashboard/whisky-cigar-lounge",
];

const group = (name: string) => NAV_GROUPS.find(g => g.labelKey === name)!;

describe("nav grouping preserves every route", () => {
  it("contains each legacy dashboard path exactly once", () => {
    for (const p of LEGACY_PATHS) {
      expect(NAV_PATHS.filter(x => x === p)).toHaveLength(1);
    }
  });

  it("adds no routes and loses none", () => {
    expect([...NAV_PATHS].sort()).toEqual([...LEGACY_PATHS].sort());
    expect(new Set(NAV_PATHS).size).toBe(NAV_PATHS.length);
  });

  it("puts GainEdge AI and RON Decision in the RON group", () => {
    expect(group("RON").items.map(i => i.path)).toEqual(["/dashboard/ai", "/dashboard/ron-decision"]);
  });

  it("keeps Settings, Clock Settings and News Settings as distinct routes in the Settings group", () => {
    const paths = group("Settings").items.map(i => i.path);
    expect(paths).toEqual(["/dashboard/settings", "/dashboard/clock-settings", "/dashboard/news-settings"]);
    expect(new Set(paths).size).toBe(3);
  });

  it("keeps gold styling on the previously gold items only", () => {
    const gold = NAV_GROUPS.flatMap(g => g.items).filter(i => i.gold).map(i => i.path).sort();
    expect(gold).toEqual([
      "/dashboard/ai", "/dashboard/charts", "/dashboard/strategy", "/dashboard/whisky-cigar-lounge",
    ].sort());
  });

  it("keeps every route registered in App.tsx", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    for (const p of ["settings", "clock-settings", "news-settings", "ai", "ron-decision", "whisky-cigar-lounge"]) {
      expect(app).toContain(p);
    }
  });
});

describe("dashboard instrument cards are not duplicated", () => {
  it("DashboardHome consumes the shared InstrumentTrackingPanel exactly once", () => {
    const home = readFileSync("src/pages/dashboard/DashboardHome.tsx", "utf8");
    expect(home).toContain('import InstrumentTrackingPanel from "@/components/dashboard/InstrumentTrackingPanel"');
    expect(home.match(/<InstrumentTrackingPanel/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- Signals page

const state: { rows: unknown[]; error: { message: string } | null; session: unknown } = {
  rows: [], error: null, session: { user: { id: "u1" } },
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.limit = () => Promise.resolve({ data: state.rows, error: state.error });
    return b;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: state.session } }) },
      from: () => builder(),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

const row = {
  id: "t1", symbol: "XAUUSD", trigger_type: "ema_cross", status: "closed",
  entry_price: 2400, sl_price: 2390, tp1_price: 2410, tp2_price: 2420, tp3_price: 2430,
  pnl_usd: 12.5, opened_at: "2026-08-16T10:00:00Z", closed_at: null,
};

async function renderSignals() {
  const { default: SignalsPage } = await import("@/pages/dashboard/SignalsPage");
  return render(<MemoryRouter><SignalsPage /></MemoryRouter>);
}

describe("SignalsPage states", () => {
  beforeEach(() => { state.rows = []; state.error = null; state.session = { user: { id: "u1" } }; });

  it("shows initial loading before the first fetch resolves, not the empty state", async () => {
    await renderSignals();
    expect(screen.getByText(/Loading signal records/i)).toBeInTheDocument();
    expect(screen.queryByText(/No Falconer signal records yet/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No Falconer signal records yet/i)).toBeInTheDocument());
  });

  it("shows a concise error panel when the query fails", async () => {
    state.error = { message: "permission denied for table falconer_trades" };
    await renderSignals();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/permission denied/i));
    expect(screen.queryByText(/No Falconer signal records yet/i)).not.toBeInTheDocument();
  });

  it("shows the loaded-empty state with a Strategy settings link", async () => {
    await renderSignals();
    await waitFor(() => expect(screen.getByText(/No Falconer signal records yet/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Open Strategy settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the populated table with existing columns", async () => {
    state.rows = [row];
    const { container } = await renderSignals();
    await waitFor(() => expect(screen.getByText("XAUUSD")).toBeInTheDocument());
    const headers = Array.from(container.querySelectorAll("th")).map(h => h.textContent);
    expect(headers).toEqual(["Opened", "Symbol", "Trigger", "Status", "Entry", "SL", "TP1/2/3", "P&L"]);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  it("makes the table wrapper horizontally scrollable on narrow screens", async () => {
    state.rows = [row];
    const { container } = await renderSignals();
    await waitFor(() => expect(container.querySelector("table")).toBeTruthy());
    const wrapper = container.querySelector("table")!.parentElement as HTMLElement;
    expect(wrapper.style.overflowX).toBe("auto");
  });
});

describe("SignalsPage governance-safe wording", () => {
  it("uses record wording and never implies broker order placement", () => {
    const src = readFileSync("src/pages/dashboard/SignalsPage.tsx", "utf8");
    expect(src).toContain("Falconer Signal Records");
    expect(src).not.toMatch(/Enable the engine/i);
    expect(src).not.toMatch(/live execution/i);
    expect(src).not.toMatch(/Falconer Trades · Live/);
    expect(src).not.toMatch(/place (an )?order/i);
  });

  it("states plainly that records are not broker orders", async () => {
    const { SIGNAL_RECORDS_QUALIFIER } = await import("@/pages/dashboard/SignalsPage");
    expect(SIGNAL_RECORDS_QUALIFIER).toMatch(/do not represent orders placed with your broker/i);
  });
});
