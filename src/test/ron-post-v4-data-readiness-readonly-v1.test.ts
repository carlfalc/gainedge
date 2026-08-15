import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../../supabase/functions/ron-post-v4-data-readiness/index.ts");
const source = readFileSync(sourcePath, "utf8");

describe("2D.2z — post-freeze data-readiness read-only tripwire", () => {
  it("contains no Supabase table mutation methods", () => {
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it("contains no research-run or promotion persistence targets", () => {
    expect(source).not.toMatch(/\.from\(\s*["'`](ron_research_runs|ron_research_candidate_results|ron_calibration_runs|ron_calibration_cells)["'`]\s*\)/);
    expect(source).not.toMatch(/\.from\(\s*["'`](ron_decisions|ron_evidence|ron_runs)["'`]\s*\)/);
  });

  it("permits only the existing authorization RPC", () => {
    const calls = [...source.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    expect(calls).toEqual(["ron_verify_cron_token"]);
  });

  it("does not import or invoke the research runner", () => {
    expect(source).not.toMatch(/from\s+["']\.\.\/ron-research\/index/);
    expect(source).not.toMatch(/research_run_authorized\s*:\s*true/);
    expect(source).not.toMatch(/allow_live_execution\s*:\s*true/);
  });
});
