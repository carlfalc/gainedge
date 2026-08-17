/**
 * GAINEDGE_PRODUCT_ASK_RON_CONTEXT_HISTORY_CLARITY_V1 — truthful note that the
 * active stored-context pair applies to NEW questions only. Presentation only.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const invoke = vi.fn(async () => ({ data: { answer: "ok" }, error: null }));
let rows: unknown[] = [];
const captured: { select?: string; eq?: unknown[]; order?: unknown[]; limit?: number; table?: string } = {};

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: (s: string) => { captured.select = s; return chain; },
    eq: (...a: unknown[]) => { captured.eq = a; return chain; },
    order: (...a: unknown[]) => { captured.order = a; return chain; },
    limit: async (n: number) => { captured.limit = n; return { data: rows, error: null }; },
    delete: () => chain,
  });
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
      from: (t: string) => { captured.table = t; return chain; },
      functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
    },
  };
});

import GainEdgeAIPage from "@/pages/dashboard/GainEdgeAIPage";

const AI_SRC = readFileSync("src/pages/dashboard/GainEdgeAIPage.tsx", "utf8");
const NOTE_ID = "ask-ron-context-history-note";

const HISTORY = [
  { id: "h1", question: "Earlier question", answer: "Earlier answer", created_at: new Date().toISOString() },
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

beforeEach(() => { invoke.mockClear(); rows = []; });

describe("context history clarity note", () => {
  it("renders exactly one note for a valid pair with non-empty history", async () => {
    rows = HISTORY;
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(screen.getAllByTestId(NOTE_ID)).toHaveLength(1));
    const text = screen.getByTestId(NOTE_ID).textContent ?? "";
    expect(text).toBe(
      "Context applies to new questions. Conversation history may include earlier questions from other contexts.",
    );
    expect(/new questions/i.test(text)).toBe(true);
    expect(/earlier questions from other contexts/i.test(text)).toBe(true);
  });

  it("renders no note in generic mode even with non-empty history", async () => {
    rows = HISTORY;
    renderAsk("");
    await waitFor(() => expect(screen.getByText("Earlier question")).toBeTruthy());
    expect(screen.queryByTestId(NOTE_ID)).toBeNull();
  });

  it("renders no note for a valid pair with empty history", async () => {
    rows = [];
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(screen.getByTestId("ask-ron-context-chip")).toBeTruthy());
    expect(screen.queryByTestId(NOTE_ID)).toBeNull();
  });

  it("Clear context removes the note while history rows remain", async () => {
    rows = HISTORY;
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(screen.getByTestId(NOTE_ID)).toBeTruthy());
    fireEvent.click(screen.getByText("Clear context"));
    await waitFor(() => expect(screen.queryByTestId(NOTE_ID)).toBeNull());
    expect(screen.queryByTestId("ask-ron-context-chip")).toBeNull();
    expect(screen.getByText("Earlier question")).toBeTruthy();
  });

  it("note wording avoids forbidden claim language", async () => {
    rows = HISTORY;
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(screen.getByTestId(NOTE_ID)).toBeTruthy());
    const text = (screen.getByTestId(NOTE_ID).textContent ?? "").toLowerCase();
    for (const banned of [
      "probability", "confidence", "rank", "score", "profit", "predict",
      "opportunity", "recommend", "execut", "live", "current market",
    ]) expect(text).not.toContain(banned);
  });

  it("history query remains account-wide and unfiltered by pair", async () => {
    rows = HISTORY;
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(captured.limit).toBe(30));
    expect(captured.table).toBe("gainedge_ai_conversations");
    expect(captured.select).toBe("id,question,answer,created_at");
    expect(captured.eq).toEqual(["user_id", "u1"]);
    expect(captured.order).toEqual(["created_at", { ascending: false }]);
    expect(AI_SRC).not.toMatch(/\.eq\("instrument"/);
    expect(AI_SRC).not.toMatch(/\.eq\("timeframe"/);
  });

  it("keeps the single invoke and both request-body modes unchanged", () => {
    expect(AI_SRC.match(/functions\.invoke\(/g)).toHaveLength(1);
    expect(AI_SRC).toContain('supabase.functions.invoke("gainedge-ai"');
    expect(AI_SRC).toContain("? { question: clean, instrument: pair.instrument, timeframe: pair.timeframe }");
    expect(AI_SRC).toContain(": { question: clean }");
  });

  it("keeps existing surfaces unchanged", async () => {
    rows = HISTORY;
    renderAsk("?instrument=XAUUSD&timeframe=15m");
    await waitFor(() => expect(screen.getByTestId(NOTE_ID)).toBeTruthy());
    expect(screen.getAllByTestId("ask-ron-context-prompt")).toHaveLength(2);
    expect(screen.getByText("Ask RON")).toBeTruthy();
    expect(screen.getByText("View stored record")).toBeTruthy();
    expect(screen.getByText("Clear context")).toBeTruthy();
    expect(
      screen.getByText("Decision support only. Broker order placement is not enabled here."),
    ).toBeTruthy();
    for (const prompt of [
      "Summarise my stored Falconer records by instrument.",
      "Describe the available sample sizes by session and day.",
      "Explain my latest stored Falconer record and its evidence.",
      "What limitations or missing evidence are in my available records?",
    ]) expect(screen.getByText(prompt)).toBeTruthy();
  });

  it("introduces no new IO surface in the page", () => {
    for (const banned of [
      "fetch(", "localStorage", "sessionStorage", "postMessage", "window.open",
      "ron_decisions", "ron_evidence",
    ]) expect(AI_SRC).not.toContain(banned);
  });
});
