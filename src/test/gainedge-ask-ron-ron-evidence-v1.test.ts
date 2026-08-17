import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FN = "supabase/functions/gainedge-ai/index.ts";
const src = readFileSync(FN, "utf8");

describe("GAINEDGE_ASK_RON_RON_EVIDENCE_V1", () => {
  it("preserves the question-only contract and gates RON reads behind an exact pair", () => {
    expect(src).toContain("Question must be between 3 and 2000 characters.");
    expect(src).toContain('if (pair.kind === "pair")');
    // every RON table read sits inside the pair-gated block
    const gateIdx = src.indexOf('if (pair.kind === "pair")');
    expect(gateIdx).toBeGreaterThan(0);
    for (const table of ["ron_orchestrator_decisions", "ron_decision_evidence", "ron_agent_evidence"]) {
      expect(src.indexOf(`"${table}"`)).toBeGreaterThan(gateIdx);
    }
  });

  it("validates the pair: both-or-none, string, trimmed, 1-16 chars, else 400", () => {
    expect(src).toContain("instrument and timeframe must both be supplied.");
    expect(src).toContain("instrument and timeframe must be strings.");
    expect(src).toContain("instrument and timeframe must be 1-16 characters.");
    expect(src).toContain("value.length > 16");
    expect(src).toContain("rawInstrument.trim()");
    expect(src).toContain("rawTimeframe.trim()");
    expect(src).toContain('if (pair.kind === "invalid")');
    expect(src).toContain("status: 400");
  });

  it("queries the exact supplied strings with no aliasing or mapping", () => {
    expect(src).toContain('.eq("instrument", pair.instrument)');
    expect(src).toContain('.eq("timeframe", pair.timeframe)');
    expect(src).not.toMatch(/SYMBOL_VARIANTS|normalizeSymbol|aliasInstrument|mapTimeframe/);
  });

  it("imports only the read-only helper surface and no RON compute modules", () => {
    expect(src).toMatch(/import \{[\s\S]*buildDecisionView[\s\S]*\} from "\.\.\/_shared\/ron-decision-read\.ts"/);
    expect(src).toContain("assertReadSafe");
    expect(src).toContain("DecisionReadError");
    expect(src).not.toMatch(/_shared\/ron-(orchestration|agent-contracts|.*spec|research|calibrat|robustness)/);
    expect(src).not.toMatch(/ron-orchestrate|ron-calibrate|ron-snapshot|ron-research/);
  });

  it("reads only the three RON audit tables and performs no RON writes", () => {
    const tables = [...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    const ronTables = tables.filter((t) => t.startsWith("ron_"));
    expect(new Set(ronTables)).toEqual(
      new Set(["ron_orchestrator_decisions", "ron_decision_evidence", "ron_agent_evidence"]),
    );
    for (const t of ronTables) {
      expect(src).not.toMatch(new RegExp(`from\\("${t}"\\)[\\s\\S]{0,120}\\.(insert|update|upsert|delete)\\(`));
    }
  });

  it("gates the model-exposed view through assertReadSafe and never raw rows", () => {
    const buildIdx = src.indexOf("buildDecisionView(");
    const assertIdx = src.indexOf("assertReadSafe(view)");
    const exposeIdx = src.indexOf("ron_decision_available: true");
    expect(buildIdx).toBeGreaterThan(0);
    expect(assertIdx).toBeGreaterThan(buildIdx);
    expect(exposeIdx).toBeGreaterThan(assertIdx);
    expect(src).not.toContain("ron_rows");
    expect(src).not.toMatch(/evidence\.ron\s*=\s*\{\s*[\s\S]{0,40}decisions\b/);
  });

  it("fails closed to unavailable on read/contract errors", () => {
    expect(src).toContain("ron_decision_available: false, requested_pair");
    expect(src).toContain("catch (ronError)");
  });

  it("adds governance rules to the system prompt", () => {
    expect(src).toContain("not a calibrated probability");
    expect(src).toContain("numeric_probability is null and probability_status is not_calibrated");
    expect(src).toContain("execution_path is signal_only, execution_allowed is false");
    expect(src).toMatch(/Never invent numeric probability, confidence, likelihood, odds, rankings, causal claims,\s*\n?\s*profitability or certainty/);
    expect(src).toContain("Do not override or reinterpret the stored RON decision or evidence.");
    expect(src).toContain("say plainly that it is unavailable");
  });

  it("requires an authenticated role claim as well as a subject", () => {
    expect(src).toContain('role !== "authenticated"');
    expect(src).toContain("!userId");
    expect(src).toContain("status: 401");
  });

  it("keeps exactly one DB write: the conversation insert", () => {
    const inserts = [...src.matchAll(/\.insert\(/g)];
    expect(inserts).toHaveLength(1);
    expect(src).toContain('from("gainedge_ai_conversations").insert(');
    expect(src).not.toContain(".update(");
    expect(src).not.toContain(".delete(");
    expect(src).not.toContain(".upsert(");
  });
});
