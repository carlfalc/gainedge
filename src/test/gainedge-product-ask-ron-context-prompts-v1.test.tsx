/**
 * GAINEDGE_PRODUCT_ASK_RON_CONTEXT_PROMPTS_V1 — context-specific quick questions
 * for an exact stored RON {instrument,timeframe} pair. Presentation only.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

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

const CONTEXT_PROMPTS = [
  "Explain the stored RON decision for this context, if available.",
  "Summarise warnings or caveats in the stored RON evidence, if available.",
];

function renderAsk(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/ai${search}`]}>
      <Routes>
        <Route path="/dashboard/ai" element={<GainEdgeAIPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => invoke.mockClear());

describe("context-specific quick questions", () => {
  it("renders exactly two buttons plus a truthful stored-context heading", () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    const buttons = screen.getAllByTestId("ask-ron-context-prompt");
    expect(buttons.map(b => b.textContent)).toEqual(CONTEXT_PROMPTS);
    expect(screen.getByText("Ask about this stored context")).toBeTruthy();
  });

  it("renders none for generic, partial, empty, whitespace or over-long context", () => {
    for (const search of [
      "",
      "?instrument=XAUUSD",
      "?timeframe=15m",
      "?instrument=&timeframe=15m",
      "?instrument=%20%20%20&timeframe=15m",
      `?instrument=${"X".repeat(17)}&timeframe=15m`,
    ]) {
      const { unmount } = renderAsk(search);
      expect(screen.queryAllByTestId("ask-ron-context-prompt")).toHaveLength(0);
      expect(screen.queryByTestId("ask-ron-context-prompts")).toBeNull();
      unmount();
    }
  });

  it("sends each prompt through the single existing invoke with the validated pair", async () => {
    for (const [i, prompt] of CONTEXT_PROMPTS.entries()) {
      invoke.mockClear();
      const { unmount } = renderAsk("?instrument=XAUUSD&timeframe=15m");
      fireEvent.click(screen.getAllByTestId("ask-ron-context-prompt")[i]);
      await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      expect(invoke.mock.calls[0]).toEqual([
        "gainedge-ai",
        { body: { question: prompt, instrument: "XAUUSD", timeframe: "15m" } },
      ]);
      unmount();
    }
  });

  it("uses stored-evidence, availability-safe wording only", () => {
    for (const prompt of CONTEXT_PROMPTS) {
      expect(prompt).toMatch(/stored RON (decision|evidence)/);
      expect(prompt).toContain("if available");
      expect(prompt).not.toMatch(
        /probabilit|confidence|rank|score|profitab|predict|opportunit|recommend|place order|execute|live|best|current setup/i,
      );
    }
  });

  it("disables context prompts while asking, like the generic prompts", async () => {
    let release: (v: unknown) => void = () => {};
    invoke.mockImplementationOnce(() => new Promise(res => { release = res; }) as never);
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    const buttons = screen.getAllByTestId("ask-ron-context-prompt");
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getAllByTestId("ask-ron-context-prompt")[1]).toBeDisabled(),
    );
    release({ data: { answer: "ok" }, error: null });
  });

  it("Clear context removes prompts, chip and action and keeps generic mode intact", async () => {
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    fireEvent.click(screen.getByText("Clear context"));
    await waitFor(() => expect(screen.queryByTestId("ask-ron-context-prompts")).toBeNull());
    expect(screen.queryAllByTestId("ask-ron-context-prompt")).toHaveLength(0);
    expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull();
    expect(screen.queryByTestId("ask-ron-view-stored-record")).toBeNull();
    const box = screen.getByPlaceholderText("Ask RON…");
    fireEvent.change(box, { target: { value: "hello RON" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "hello RON" } }]);
  });
});

describe("unchanged surface", () => {
  it("keeps the four generic prompts byte-for-byte", () => {
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

  it("keeps generic and contextual typed request bodies exactly as before", async () => {
    const { unmount } = renderAsk("");
    fireEvent.change(screen.getByPlaceholderText("Ask RON…"), { target: { value: "typed" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0]).toEqual(["gainedge-ai", { body: { question: "typed" } }]);
    unmount();
    invoke.mockClear();
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    fireEvent.change(screen.getByPlaceholderText("Ask RON…"), { target: { value: "typed" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0]).toEqual([
      "gainedge-ai",
      { body: { question: "typed", instrument: "XAUUSD", timeframe: "15m" } },
    ]);
  });

  it("introduces no second invoke, fetch, storage, postMessage, window.open or RON table read", () => {
    expect(AI_SRC.match(/functions\.invoke/g)?.length).toBe(1);
    expect(AI_SRC).not.toMatch(/fetch\(|localStorage|sessionStorage|postMessage|window\.open/);
    expect(AI_SRC).not.toMatch(/ron_orchestrator_decisions|ron_agent_evidence/);
  });
});
