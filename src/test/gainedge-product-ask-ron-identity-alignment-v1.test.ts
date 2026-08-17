/**
 * GAINEDGE_PRODUCT_ASK_RON_IDENTITY_ALIGNMENT_V1 — identity/copy alignment only.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const BASE = "aa6ecd299e0e4cdace546af350b8c42f4d5b636e";
const FN = "supabase/functions/gainedge-ai/index.ts";
const PAGE_PATH = "src/pages/dashboard/GainEdgeAIPage.tsx";
const SRC = readFileSync(FN, "utf8");
const PAGE = readFileSync(PAGE_PATH, "utf8");
const BASE_SRC = execFileSync("git", ["show", `${BASE}:${FN}`], { encoding: "utf8" });

const IDENTITY = "You are RON, GainEdge's grounded trading-performance analyst for Falconer v7 TP3.";

function promptBody(src: string) {
  const start = src.indexOf("const system = `");
  const end = src.indexOf("`;", start);
  const block = src.slice(start + "const system = `".length, end);
  const lines = block.split("\n");
  return lines.slice(1).join("\n");
}

describe("backend identity", () => {
  it("system prompt starts with the exact RON identity sentence", () => {
    expect(SRC).toContain("const system = `" + IDENTITY + "\n");
  });

  it("drops the old assistant identity phrase", () => {
    expect(SRC).not.toContain("You are GainEdge AI");
  });

  it("keeps every prompt line after the identity sentence byte-identical to base", () => {
    expect(promptBody(SRC)).toBe(promptBody(BASE_SRC));
  });

  it("changes nothing else in the backend file", () => {
    expect(SRC.replace(IDENTITY, "You are GainEdge AI, a grounded trading-performance analyst for Falconer v7 TP3.")).toBe(BASE_SRC);
  });

  it("keeps gateway, model, function name, auth/pair validation, RON read, insert and response shape", () => {
    expect(SRC).toContain("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(SRC.match(/google\/gemini-2\.5-flash-lite/g)?.length).toBe(
      BASE_SRC.match(/google\/gemini-2\.5-flash-lite/g)?.length,
    );
    expect(SRC).toContain('from("gainedge_ai_conversations").insert(');
    expect(SRC).toContain("buildDecisionView");
    expect(SRC).toContain("assertReadSafe");
    expect(SRC).toContain("execution_path");
  });
});

describe("frontend identity", () => {
  it("uses the RON fallback toast only", () => {
    expect(PAGE).toContain('"RON is unavailable"');
    expect(PAGE).not.toContain("GainEdge AI is unavailable");
  });

  it("keeps heading, prompts, context surface and footer unchanged", () => {
    for (const s of [
      "Ask RON",
      "Summarise my stored Falconer records by instrument.",
      "Describe the available sample sizes by session and day.",
      "Explain my latest stored Falconer record and its evidence.",
      "What limitations or missing evidence are in my available records?",
      "Explain the stored RON decision for this context, if available.",
      "Summarise warnings or caveats in the stored RON evidence, if available.",
      "ask-ron-context-chip",
      "View stored record",
      "Clear context",
      "Decision support only. Broker order placement is not enabled here.",
    ]) {
      expect(PAGE).toContain(s);
    }
  });

  it("keeps a single invoke and introduces no new side-effect surfaces", () => {
    expect(PAGE.match(/functions\.invoke\("gainedge-ai"/g)?.length).toBe(1);
    expect(PAGE).not.toMatch(/fetch\(|localStorage|sessionStorage|postMessage|window\.open/);
    expect(PAGE).not.toMatch(/ron_orchestrator_decisions|ron_agent_evidence/);
  });
});

describe("governance", () => {
  it("introduces no probability/ranking/execution-enablement wording", () => {
    expect(IDENTITY).not.toMatch(
      /probabilit|confidence|rank|score|profitab|predict|recommend|place order|execute/i,
    );
  });
});
