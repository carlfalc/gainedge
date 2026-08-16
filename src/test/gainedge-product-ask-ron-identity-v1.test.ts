import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { NAV_GROUPS, NAV_PATHS } from "@/lib/dashboard-nav";

const PAGE = readFileSync("src/pages/dashboard/GainEdgeAIPage.tsx", "utf8");

describe("GAINEDGE_PRODUCT_ASK_RON_IDENTITY_V1", () => {
  it("keeps the /dashboard/ai route unchanged", () => {
    expect(NAV_PATHS).toContain("/dashboard/ai");
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('path="ai"');
  });

  it("labels the nav item Ask RON and preserves every other nav path", () => {
    const item = NAV_GROUPS.flatMap(g => g.items).find(i => i.path === "/dashboard/ai");
    expect(item?.labelKey).toBe("Ask RON");
    expect(NAV_PATHS).toEqual([
      "/dashboard", "/dashboard/charts", "/dashboard/signals", "/dashboard/strategy",
      "/dashboard/ai", "/dashboard/ron-decision",
      "/dashboard/journal", "/dashboard/analytics", "/dashboard/insights",
      "/dashboard/backtesting", "/dashboard/calendar", "/dashboard/my-news",
      "/dashboard/settings", "/dashboard/clock-settings", "/dashboard/news-settings",
      "/dashboard/whisky-cigar-lounge",
    ]);
  });

  it("uses RON identity in heading and placeholder", () => {
    expect(PAGE).toContain(">Ask RON</h1>");
    expect(PAGE).toContain('placeholder="Ask RON…"');
    expect(PAGE).not.toContain("Ask GainEdge AI…");
  });

  it("uses RON identity in loading and empty-state copy", () => {
    expect(PAGE).toContain("RON is reviewing the available evidence…");
    expect(PAGE).toMatch(/RON answers from stored evidence and will state when the available evidence is insufficient/);
  });

  it("keeps the four suggested prompts evidence-safe", () => {
    const block = PAGE.split("const prompts = [")[1].split("];")[0];
    const prompts = block.split("\n").map(l => l.trim()).filter(l => l.startsWith('"'));
    expect(prompts).toHaveLength(4);
    const banned = /\b(best|strongest|setup score|probability|confidence|rank|ranking|profitab|will i (make|win)|predict)/i;
    for (const p of prompts) expect(p).not.toMatch(banned);
  });

  it("states broker order placement is not enabled here", () => {
    expect(PAGE).toContain("Broker order placement is not enabled here.");
    expect(PAGE).not.toContain("Deterministic risk controls remain in charge of execution.");
  });

  it("keeps the existing gainedge-ai invocation and introduces no new network calls", () => {
    expect(PAGE).toContain('supabase.functions.invoke("gainedge-ai"');
    expect(PAGE.match(/functions\.invoke\(/g) ?? []).toHaveLength(1);
    expect(PAGE).not.toMatch(/\bfetch\(/);
    expect(PAGE).toContain('from("gainedge_ai_conversations")');
  });

  it("introduces no changes under supabase/, strategy/ or .lovable/plan.md", () => {
    const out = execSync("git status --porcelain -- supabase strategy .lovable/plan.md").toString().trim();
    expect(out).toBe("");
  });
});
