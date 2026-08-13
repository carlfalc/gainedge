import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 2D.1e-a — the generic rebuild orchestrator must carry NO frozen checkpoint clock.
 * The canonical source clock is durable per-job metadata (ron_rebuild_jobs.source_as_of).
 * The module boots Deno.serve at import time, so it is audited as source text.
 */
const SRC = readFileSync(resolve(__dirname, "../../supabase/functions/ron-rebuild/index.ts"), "utf8");
const LABEL_SRC = readFileSync(resolve(__dirname, "../../supabase/functions/ron-label/index.ts"), "utf8");

describe("Phase 2D.1e-a — rebuild provenance plumbing", () => {
  it("contains no hard-coded 2D.1e source clock or any dated literal", () => {
    expect(SRC).not.toContain("SOURCE_AS_OF_2D1E");
    expect(SRC).not.toContain("2026-08-12T22:14");
    // no ISO date literal of any kind may drive the generic orchestrator
    expect(SRC.match(/["'`]\d{4}-\d{2}-\d{2}T[\d:.]+Z?["'`]/g)).toBeNull();
  });

  it("reads the durable per-job source clock and forwards it to runBatch", () => {
    expect(SRC).toMatch(/job\.source_as_of\s*\?\?\s*null/);
    expect(SRC).toMatch(/sourceAsOf:\s*string\s*\|\s*null/);
  });

  it("fails CLOSED for label_v6+ when no persisted source_as_of exists", () => {
    expect(SRC).toContain("LABEL_SOURCE_AS_OF_REQUIRED_FROM_VERSION = 6");
    expect(SRC).toMatch(
      /version >= LABEL_SOURCE_AS_OF_REQUIRED_FROM_VERSION && !sourceAsOf\)\s*\{\s*throw new Error/,
    );
  });

  it("keeps v5-and-earlier replay semantics unclamped and unconditional", () => {
    // the clamp is now purely presence-based, never version-gated to a frozen constant
    expect(SRC).toMatch(/\.\.\.\(sourceAsOf \? \{ source_as_of: sourceAsOf \} : \{\}\)/);
    expect(SRC).not.toMatch(/version >= 6 \? \{ source_as_of/);
  });

  it("echoes source_as_of into durable label-stage evidence", () => {
    expect(SRC).toMatch(/detail:\s*\{\s*snapshots,\s*rows:[^}]*source_as_of: sourceAsOf/);
  });

  it("keeps ron-label's canonical clamp distinct from the data_end harness", () => {
    expect(LABEL_SRC).toContain("body.source_as_of ?? body.data_cutoff");
    expect(LABEL_SRC).toContain("const harness = body.data_end != null");
  });
});
