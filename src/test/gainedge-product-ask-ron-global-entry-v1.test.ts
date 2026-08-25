import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { openRonPopout, ASK_RON_ROUTE } from "@/lib/ron-popout";

const SRC = readFileSync("src/lib/ron-popout.ts", "utf8");
const BASE = "4c43db110945ab6a026c6e77ae07b72d4adc82dc";

describe("GAINEDGE_PRODUCT_ASK_RON_GLOBAL_ENTRY_V1", () => {
  let openSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    openSpy = vi.fn(() => null);
    vi.stubGlobal("window", { ...globalThis.window, open: openSpy });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens exactly /dashboard/ai with _blank and noopener", () => {
    openRonPopout();
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai", "_blank", "noopener");
    expect(ASK_RON_ROUTE).toBe("/dashboard/ai");
  });

  it("non-allowlisted route context does not alter the URL", () => {
    openRonPopout({ page: "/dashboard/charts", search: "?symbol=XAUUSD" });
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai", "_blank", "noopener");
  });

  it("fails silently when popup is blocked (null return)", () => {
    expect(() => openRonPopout({ page: "/dashboard" })).not.toThrow();
  });

  it("introduces no transport, storage or backend surface", () => {
    for (const banned of ["fetch(", "supabase", "functions.invoke", "localStorage", "sessionStorage", "postMessage", "document."]) {
      expect(SRC).not.toContain(banned);
    }
  });

  it("route /dashboard/ai remains registered and unchanged", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="ai" element={<GainEdgeAIPage />} />');
  });

  it("DashboardLayout still calls openRonPopout with route data only", () => {
    const layout = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
    expect(layout).toContain("openRonPopout(");
    const arg = layout.slice(layout.indexOf("openRonPopout("), layout.indexOf("openRonPopout(") + 200);
    expect(arg).toContain("page: location.pathname");
    expect(arg).toContain("search: location.search");
    for (const banned of ["sessionLabel", "userName", "userId"]) {
      expect(arg).not.toContain(banned);
    }
  });

  it("frozen supabase/, strategy/ and plan remain unchanged", () => {
    // supabase/functions/gainedge-ai/index.ts is intentionally changed by the later
    // accepted slice GAINEDGE_ASK_RON_RON_EVIDENCE_V1; everything else stays frozen.
    const diff = execSync(
      // The additive GAINEDGE_GDELT_RAW_HEADLINES_V1 raw-ingestion seam is newly
      // authorized and touches no file this guard protects.
      `git diff ${BASE} -- supabase strategy .lovable/plan.md ':(exclude)supabase/functions/gainedge-ai/index.ts'`
      + ` ':(exclude)supabase/functions/ingest-macro-headlines'`
      + ` ':(exclude)supabase/migrations/20260817104500_macro_source_events.sql'`
      // GAINEDGE_GDELT_SERVER_SCHEDULE_V1: additive, newly authorized cron migration.
      + ` ':(exclude)supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql'`
      // GAINEDGE_24X7_CANDLE_RON_RUNTIME_V1: additive, newly authorized scheduler,
      // its schedule migrations and the ron-orchestrate-run boot fix it depends on.
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/migrations/20260821061910_bfc73e53-1fc1-4b70-bffb-8e1b54cdf36b.sql'`
      + ` ':(exclude)supabase/migrations/20260821061932_53b5b8ea-752a-4845-9ac2-8f2b272589b8.sql'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      // GAINEDGE_RON_LIVE_ANCHOR_COMPAT_V3: authorized, additive single-anchor stack
      // (Session/Pattern/Cross-Asset/Opportunity V3 specs, Orchestration V8, the four
      // specialist endpoints' additive V3 branches, the coordinator, the scheduler pin
      // and this slice's own tests). No frozen V1-V7 artifact is modified.
      + ` ':(exclude)supabase/functions/_shared/ron-session-structure-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-pattern-structure-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec-v3.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestration-run-v8.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-session-structure/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-pattern-context/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-cross-asset-correlation/index.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-opportunity-risk/index.ts'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)src/test/gainedge-ron-live-anchor-compat-v3.test.ts'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts'`
      + ` ':(exclude)src/test/ron-ha-pattern-context-v1.test.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-spec-v1.ts'`
      + ` ':(exclude)src/test/ron-opportunity-context-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      + ` ':(exclude)src/test/migration-hygiene.test.ts'`
      // GAINEDGE_RON_PATTERN_EXPANSION_V1: additive named-pattern detectors composed
      // only into the snapshot feature pipeline. The hash-pinned ron-patterns.ts and every
      // frozen V1-V8 spec stay byte-identical.
      + ` ':(exclude)supabase/functions/_shared/ron-patterns-expansion-v1.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-features.ts'`
      // GAINEDGE_SIGNALS_V1 — the working plan document is a non-runtime artifact.
      // GAINEDGE_RON_ALWAYS_ON_RUNTIME_RECOVERY_V1: forward-only artifact-clock TTL repair.
      + ` ':(exclude)supabase/functions/_shared/ron-agent-contracts.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestrator.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-risk-spec-v4.ts'`
      + ` ':(exclude)supabase/functions/_shared/ron-orchestration-run-v9.ts'`
      + ` ':(exclude)supabase/functions/ron-agent-opportunity-risk/index.ts'`
      + ` ':(exclude)supabase/functions/ron-orchestrate-run/index.ts'`
      + ` ':(exclude)supabase/functions/ron-schedule-orchestration'`
      + ` ':(exclude)src/test/ron-always-on-runtime-recovery-v1.test.ts'`
      + ` ':(exclude)src/test/ron-v3-v8-regression-guard.test.ts'`
      + ` ':(exclude)src/test/gainedge-24x7-candle-ron-runtime-v1.test.ts'`
      + ` ':(exclude)src/test/gainedge-ron-live-anchor-compat-v3.test.ts'`
      + ` ':(exclude).lovable/plan.md'`,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});
