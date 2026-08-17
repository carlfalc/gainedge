/**
 * GAINEDGE_PRODUCT_ASK_RON_CONTEXT_RETURN_V1 — returning from Ask RON to the
 * exact stored RON decision record. Navigation/presentation only.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ronDecisionRecordHref, ronDecisionRecordTitle } from "@/lib/ron-decision-explorer";

const invoke = vi.fn(async () => ({ data: { answer: "ok" }, error: null }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
    delete: () => chain,
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: () => chain,
      functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
    },
  };
});

import GainEdgeAIPage from "@/pages/dashboard/GainEdgeAIPage";

const AI_SRC = readFileSync("src/pages/dashboard/GainEdgeAIPage.tsx", "utf8");
const POPOUT_SRC = readFileSync("src/lib/ron-popout.ts", "utf8");
const CTX_SRC = readFileSync("src/lib/ask-ron-context.ts", "utf8");
const RON_PAGE_SRC = readFileSync("src/pages/dashboard/RonDecisionPage.tsx", "utf8");

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function renderAsk(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/ai${search}`]}>
      <Probe />
      <Routes>
        <Route path="/dashboard/ai" element={<GainEdgeAIPage />} />
        <Route path="/dashboard/ron-decision" element={<div>stored record surface</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function ask(text: string) {
  const box = screen.getByPlaceholderText("Ask RON…");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(screen.getByText("Ask"));
  await waitFor(() => expect(invoke).toHaveBeenCalled());
}

beforeEach(() => invoke.mockClear());

describe("stored-record return action", () => {
  it("shows the action for a valid pair with explicit stored-record labelling", () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    const btn = screen.getByTestId("ask-ron-view-stored-record");
    expect(btn).toHaveTextContent("View stored record");
    expect(btn.getAttribute("aria-label")).toBe(ronDecisionRecordTitle("XAUUSD", "15m"));
    expect(btn.getAttribute("title")).toBe(ronDecisionRecordTitle("XAUUSD", "15m"));
    expect(btn.getAttribute("aria-label")).toContain("XAUUSD 15m");
  });

  it("navigates in-app to the exact encoded RON decision URL", async () => {
    renderAsk("?instrument=XAU%2FUSD&timeframe=1%20h");
    fireEvent.click(screen.getByTestId("ask-ron-view-stored-record"));
    await waitFor(() =>
      expect(screen.getByTestId("loc")).toHaveTextContent(ronDecisionRecordHref("XAU/USD", "1 h")),
    );
    expect(screen.getByText("stored record surface")).toBeTruthy();
  });

  it("hides the action in generic mode and for partial/empty/over-long params", () => {
    for (const search of [
      "",
      "?instrument=XAUUSD",
      "?timeframe=15m",
      "?instrument=&timeframe=15m",
      "?instrument=%20%20%20&timeframe=15m",
      `?instrument=${"X".repeat(17)}&timeframe=15m`,
    ]) {
      const { unmount } = renderAsk(search);
      expect(screen.queryByTestId("ask-ron-view-stored-record")).toBeNull();
      expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull();
      unmount();
    }
  });

  it("Clear context removes chip and action and keeps generic requests working", async () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    fireEvent.click(screen.getByText("Clear context"));
    await waitFor(() => expect(screen.queryByTestId("ask-ron-view-stored-record")).toBeNull());
    expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull();
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
  });
});

describe("unchanged request behaviour and surface", () => {
  it("keeps generic and contextual request bodies exactly as before", async () => {
    const { unmount } = renderAsk("");
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
    unmount();
    invoke.mockClear();
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual([
      "gainedge-ai",
      { body: { question: "hello RON", instrument: "XAUUSD", timeframe: "15m" } },
    ]);
  });

  it("keeps the four suggested prompts and the footer", () => {
    renderAsk("");
    for (const prompt of [
      "Summarise my stored Falconer records by instrument.",
      "Describe the available sample sizes by session and day.",
      "Explain my latest stored Falconer record and its evidence.",
      "What limitations or missing evidence are in my available records?",
    ]) {
      expect(screen.getByText(prompt)).toBeTruthy();
    }
    expect(
      screen.getByText("Decision support only. Broker order placement is not enabled here."),
    ).toBeTruthy();
  });
});

describe("safety constraints", () => {
  it("reuses the existing URL builder and adds no competing one", () => {
    expect(AI_SRC).toContain("ronDecisionRecordHref(pair.instrument, pair.timeframe)");
    expect(AI_SRC).not.toContain("/dashboard/ron-decision?instrument=");
    expect(AI_SRC).not.toMatch(/window\.open/);
  });

  it("introduces no second invoke, fetch, storage, postMessage or direct RON table read", () => {
    expect(AI_SRC.match(/functions\.invoke/g)?.length).toBe(1);
    expect(AI_SRC).not.toMatch(/fetch\(|localStorage|sessionStorage|postMessage/);
    expect(AI_SRC).not.toMatch(/ron_orchestrator_decisions|ron_agent_evidence/);
  });

  it("introduces no probability, ranking, profitability or execution-enablement wording", () => {
    const chip = AI_SRC.slice(AI_SRC.indexOf("{pair && ("), AI_SRC.indexOf("<div style={{ display: \"flex\", gap: 8, flexWrap: \"wrap\", marginBottom: 16 }}>"));
    expect(chip).not.toMatch(/probabilit|confidence|rank|score|profitab|predict|opportunit|recommend|place order|execute|live/i);
  });

  it("leaves popout, ask-ron-context helpers and the RON decision page untouched", () => {
    expect(POPOUT_SRC).toContain('ASK_RON_ROUTE = "/dashboard/ai"');
    expect(POPOUT_SRC).not.toContain("instrument=");
    expect(CTX_SRC).not.toContain("ron-decision");
    expect(RON_PAGE_SRC).toContain('data-testid="ron-ask-about-record"');
  });
});
