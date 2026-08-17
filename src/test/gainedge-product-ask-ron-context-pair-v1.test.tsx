/**
 * GAINEDGE_PRODUCT_ASK_RON_CONTEXT_PAIR_V1 — carrying an exact stored-record
 * {instrument,timeframe} pair from the RON decision surface into Ask RON.
 * Read-only: no recomputation, ranking, probability, or execution enablement.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { askRonContextHref, askRonContextLabel, askRonContextTitle, parseAskRonContext } from "@/lib/ask-ron-context";

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
const RON_SRC = readFileSync("src/pages/dashboard/RonDecisionPage.tsx", "utf8");
const POPOUT_SRC = readFileSync("src/lib/ron-popout.ts", "utf8");

function renderAsk(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/ai${search}`]}>
      <GainEdgeAIPage />
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

describe("href + parser helpers", () => {
  it("builds an encoded /dashboard/ai href only", () => {
    expect(askRonContextHref("XAUUSD", "15m")).toBe("/dashboard/ai?instrument=XAUUSD&timeframe=15m");
    expect(askRonContextHref("XAU/USD", "1 h")).toBe("/dashboard/ai?instrument=XAU%2FUSD&timeframe=1%20h");
  });

  it("labels context truthfully as stored", () => {
    expect(askRonContextLabel({ instrument: "XAUUSD", timeframe: "15m" })).toBe("Stored RON context: XAUUSD 15m");
    expect(askRonContextTitle("XAUUSD", "15m")).toContain("stored XAUUSD 15m decision record");
  });

  it("accepts a valid exact pair and trims", () => {
    expect(parseAskRonContext(new URLSearchParams("instrument= XAUUSD &timeframe=15m")))
      .toEqual({ instrument: "XAUUSD", timeframe: "15m" });
  });

  it("rejects partial, empty and >16-char values without fallback or aliasing", () => {
    expect(parseAskRonContext(new URLSearchParams("instrument=XAUUSD"))).toBeNull();
    expect(parseAskRonContext(new URLSearchParams("timeframe=15m"))).toBeNull();
    expect(parseAskRonContext(new URLSearchParams("instrument=&timeframe=15m"))).toBeNull();
    expect(parseAskRonContext(new URLSearchParams("instrument=   &timeframe=15m"))).toBeNull();
    expect(parseAskRonContext(new URLSearchParams(`instrument=${"X".repeat(17)}&timeframe=15m`))).toBeNull();
    expect(parseAskRonContext(new URLSearchParams(`instrument=XAUUSD&timeframe=${"m".repeat(17)}`))).toBeNull();
    expect(parseAskRonContext(null)).toBeNull();
  });
});

describe("Ask RON context indicator and request body", () => {
  it("shows the indicator only for a valid pair", () => {
    const { unmount } = renderAsk("?instrument=XAUUSD&timeframe=15m");
    expect(screen.getByTestId("ask-ron-context-chip")).toHaveTextContent("Stored RON context: XAUUSD 15m");
    unmount();
    renderAsk("?instrument=XAUUSD");
    expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull();
  });

  it("generic mode sends exactly { question }", async () => {
    renderAsk("");
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
  });

  it("contextual mode sends exactly question + instrument + timeframe", async () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual([
      "gainedge-ai",
      { body: { question: "hello RON", instrument: "XAUUSD", timeframe: "15m" } },
    ]);
  });

  it("never sends a partial pair for malformed params", async () => {
    renderAsk("?instrument=XAUUSD&timeframe=");
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
  });

  it("Clear context removes the pair params and returns to generic mode", async () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    fireEvent.click(screen.getByText("Clear context"));
    await waitFor(() => expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull());
    await ask("hello RON");
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
  });
});

describe("RON decision surface action", () => {
  it("renders the action only inside the stored-view branch and uses the selected exact pair", () => {
    const branch = RON_SRC.slice(RON_SRC.indexOf("{view && !loading && ("));
    expect(branch).toContain('data-testid="ron-ask-about-record"');
    expect(branch).toContain("navigate(askRonContextHref(selected.symbol, selected.timeframe))");
    expect(branch).toContain("Ask RON about this record");
    const before = RON_SRC.slice(0, RON_SRC.indexOf("{view && !loading && ("));
    expect(before).not.toContain("Ask RON about this record");
  });

  it("keeps selector, refresh and stored-record wording", () => {
    expect(RON_SRC).toContain('data-testid="ron-instrument-select"');
    expect(RON_SRC).toContain("RON Stored Decision Record");
    expect(RON_SRC).toContain("Refresh");
  });
});

describe("safety constraints", () => {
  it("route remains /dashboard/ai and ron-popout stays context-free", () => {
    expect(askRonContextHref("A", "B").startsWith("/dashboard/ai?")).toBe(true);
    expect(POPOUT_SRC).toContain('ASK_RON_ROUTE = "/dashboard/ai"');
    expect(POPOUT_SRC).toContain('window.open(ASK_RON_ROUTE, "_blank", "noopener")');
    expect(POPOUT_SRC).not.toContain("instrument=");
  });

  it("introduces no second invoke, fetch, storage, postMessage or direct RON table read", () => {
    expect(AI_SRC.match(/functions\.invoke/g)?.length).toBe(1);
    expect(AI_SRC).not.toMatch(/fetch\(|localStorage|sessionStorage|postMessage/);
    expect(AI_SRC).not.toMatch(/ron_orchestrator_decisions|ron_agent_evidence/);
  });

  it("introduces no probability, ranking, profitability or execution-enablement wording", () => {
    const chip = AI_SRC.slice(AI_SRC.indexOf("{pair && ("), AI_SRC.indexOf("<div style={{ display: \"flex\", gap: 8, marginBottom: 24 }}>"));
    const action = RON_SRC.slice(RON_SRC.indexOf('data-testid="ron-ask-about-record"'), RON_SRC.indexOf("<RonDecisionCard"));
    for (const block of [chip, action]) {
      expect(block).not.toMatch(/probabilit|confidence|rank|profitab|place order|execute|live/i);
    }
  });
});