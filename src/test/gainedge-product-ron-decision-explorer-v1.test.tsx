/**
 * GAINEDGE_PRODUCT_RON_DECISION_EXPLORER_V1 — read-only explorer tests.
 * Frontend only: selection resolution, query-param binding, non-blocking tracked
 * list failures, and governance (no probability/ranking/execution/new endpoint).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import {
  FALLBACK_PAIR, normaliseTracked, pairLabel, resolveSelection,
} from "@/lib/ron-decision-explorer";

const fetchLatestRonDecision = vi.fn();
vi.mock("@/services/ron-decisions", () => ({
  fetchLatestRonDecision: (...a: unknown[]) => fetchLatestRonDecision(...a),
}));

let trackedRows: { symbol: string; timeframe: string | null }[] = [];
let trackedError: unknown = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: trackedError ? null : trackedRows, error: trackedError }),
      }),
    }),
  },
}));

import RonDecisionPage from "@/pages/dashboard/RonDecisionPage";

function Loc() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderPage(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/ron-decision${search}`]}>
      <Routes>
        <Route path="/dashboard/ron-decision" element={<><RonDecisionPage /><Loc /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const emptyResult = { decision_available: false, view: null };

beforeEach(() => {
  trackedRows = [];
  trackedError = null;
  fetchLatestRonDecision.mockReset();
  fetchLatestRonDecision.mockResolvedValue(emptyResult);
});

const lastCall = () => fetchLatestRonDecision.mock.calls.at(-1)?.[0];

describe("selection resolution (pure)", () => {
  it("prefers tracked XAUUSD 15m by default", () => {
    const t = normaliseTracked([{ symbol: "US30", timeframe: "1h" }, { symbol: "XAUUSD", timeframe: "15m" }]);
    expect(resolveSelection(t)).toEqual({ symbol: "XAUUSD", timeframe: "15m" });
  });

  it("falls back to the first tracked pair when XAUUSD 15m is absent", () => {
    const t = normaliseTracked([{ symbol: "US30", timeframe: "1h" }, { symbol: "NAS100", timeframe: "5m" }]);
    expect(resolveSelection(t)).toEqual({ symbol: "US30", timeframe: "1h" });
  });

  it("uses the historical safe fallback when nothing is tracked", () => {
    expect(resolveSelection([])).toEqual(FALLBACK_PAIR);
  });

  it("honours exactly-matching query params only", () => {
    const t = normaliseTracked([{ symbol: "XAUUSD", timeframe: "15m" }, { symbol: "US30", timeframe: "1h" }]);
    expect(resolveSelection(t, { instrument: "US30", timeframe: "1h" })).toEqual({ symbol: "US30", timeframe: "1h" });
    expect(resolveSelection(t, { instrument: "US30", timeframe: "4h" })).toEqual({ symbol: "XAUUSD", timeframe: "15m" });
    expect(resolveSelection([], { instrument: "EURUSD", timeframe: "1h" })).toEqual(FALLBACK_PAIR);
  });

  it("defaults a missing stored timeframe to 15m and dedupes exact pairs", () => {
    const t = normaliseTracked([
      { symbol: "XAUUSD", timeframe: null }, { symbol: "XAUUSD", timeframe: "15m" },
      { symbol: "US30", timeframe: "1h" }, { symbol: "US30", timeframe: "1h" },
    ]);
    expect(t).toEqual([{ symbol: "XAUUSD", timeframe: "15m" }, { symbol: "US30", timeframe: "1h" }]);
  });
});

describe("explorer page", () => {
  it("reads tracked XAUUSD 15m with no query params", async () => {
    trackedRows = [{ symbol: "US30", timeframe: "1h" }, { symbol: "XAUUSD", timeframe: "15m" }];
    renderPage();
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "XAUUSD", timeframe: "15m" }));
  });

  it("reads the first tracked pair when XAUUSD 15m is not tracked", async () => {
    trackedRows = [{ symbol: "NAS100", timeframe: "5m" }];
    renderPage();
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "NAS100", timeframe: "5m" }));
  });

  it("falls back safely with no tracked instruments", async () => {
    renderPage();
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "XAUUSD", timeframe: "15m" }));
  });

  it("preselects an exact tracked pair from query params", async () => {
    trackedRows = [{ symbol: "XAUUSD", timeframe: "15m" }, { symbol: "US30", timeframe: "1h" }];
    renderPage("?instrument=US30&timeframe=1h");
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "US30", timeframe: "1h" }));
    expect((await screen.findByTestId("ron-instrument-select") as HTMLSelectElement).value).toBe("US30|1h");
  });

  it("ignores untracked query params in favour of the safe fallback", async () => {
    trackedRows = [{ symbol: "XAUUSD", timeframe: "15m" }];
    renderPage("?instrument=EURUSD&timeframe=4h");
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "XAUUSD", timeframe: "15m" }));
  });

  it("changing the selector re-reads the new pair and updates query params", async () => {
    trackedRows = [{ symbol: "XAUUSD", timeframe: "15m" }, { symbol: "US30", timeframe: "1h" }];
    renderPage();
    const sel = await screen.findByTestId("ron-instrument-select");
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "XAUUSD", timeframe: "15m" }));
    fireEvent.change(sel, { target: { value: "US30|1h" } });
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "US30", timeframe: "1h" }));
    expect(screen.getByTestId("loc").textContent).toBe("/dashboard/ron-decision?instrument=US30&timeframe=1h");
  });

  it("refresh re-reads the currently selected pair", async () => {
    trackedRows = [{ symbol: "NAS100", timeframe: "5m" }];
    renderPage();
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "NAS100", timeframe: "5m" }));
    const before = fetchLatestRonDecision.mock.calls.length;
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(fetchLatestRonDecision.mock.calls.length).toBeGreaterThan(before));
    expect(lastCall()).toEqual({ instrument: "NAS100", timeframe: "5m" });
  });

  it("names the selected instrument in the empty state", async () => {
    trackedRows = [{ symbol: "NAS100", timeframe: "5m" }];
    renderPage();
    const empty = await screen.findByTestId("ron-empty-state");
    expect(empty.textContent).toContain("NAS100 5m");
    expect(empty.textContent).not.toContain("XAUUSD");
  });

  it("dedupes duplicate tracked pairs in the selector", async () => {
    trackedRows = [
      { symbol: "XAUUSD", timeframe: "15m" }, { symbol: "XAUUSD", timeframe: "15m" },
      { symbol: "US30", timeframe: "1h" },
    ];
    renderPage();
    const sel = await screen.findByTestId("ron-instrument-select");
    const values = Array.from(sel.querySelectorAll("option")).map(o => (o as HTMLOptionElement).value);
    expect(values).toEqual(["XAUUSD|15m", "US30|1h"]);
  });

  it("tracked-list read failure is non-blocking and still reads the fallback record", async () => {
    trackedError = { message: "boom" };
    renderPage();
    await waitFor(() => expect(lastCall()).toEqual({ instrument: "XAUUSD", timeframe: "15m" }));
    expect(await screen.findByTestId("ron-tracked-warning")).toBeTruthy();
  });
});

describe("governance", () => {
  const page = readFileSync("src/pages/dashboard/RonDecisionPage.tsx", "utf8");
  const helper = readFileSync("src/lib/ron-decision-explorer.ts", "utf8");

  it("introduces no probability, confidence, ranking or execution enablement", () => {
    for (const src of [page, helper]) {
      expect(/probability\s*[:=]\s*[0-9]/i.test(src)).toBe(false);
      expect(/confidence|best|strongest|rank(ing)?\b|opportunity[_ ]score/i.test(src)).toBe(false);
      expect(/allow_live_execution\s*[:=]\s*true/.test(src)).toBe(false);
    }
  });

  it("uses only the existing read client and no new endpoint", () => {
    expect(page).toContain("fetchLatestRonDecision");
    expect(/functions\.invoke|fetch\(/.test(page)).toBe(false);
    expect(page).toContain("Nothing here is executable.");
  });

  it("labels pairs plainly", () => {
    expect(pairLabel({ symbol: "US30", timeframe: "1h" })).toBe("US30 · 1h");
  });
});