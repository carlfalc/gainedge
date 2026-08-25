/**
 * GAINEDGE_ASK_RON_GLOBAL_CONTEXT_BRIDGE_V1 — the global Ask RON button may carry
 * ONLY an exact stored-record {instrument,timeframe} pair, and only when that pair
 * is already explicitly present on the RON Decision route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { openRonPopout } from "@/lib/ron-popout";

const BASE = "b133d30df84ecfccff1324df89118f7cfd5535fa";
const SRC = readFileSync("src/lib/ron-popout.ts", "utf8");
const LAYOUT = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
const PLAIN = ["/dashboard/ai", "_blank", "noopener"] as const;

describe("GAINEDGE_ASK_RON_GLOBAL_CONTEXT_BRIDGE_V1", () => {
  let openSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    openSpy = vi.fn(() => null);
    vi.stubGlobal("window", { ...globalThis.window, open: openSpy });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("no args still opens plain /dashboard/ai", () => {
    openRonPopout();
    expect(openSpy).toHaveBeenCalledWith(...PLAIN);
  });

  it("carries an exact valid pair from the RON decision route", () => {
    openRonPopout({ page: "/dashboard/ron-decision", search: "?instrument=XAUUSD&timeframe=15m" });
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai?instrument=XAUUSD&timeframe=15m", "_blank", "noopener");
  });

  it("encodes pair values and drops unknown extra params", () => {
    openRonPopout({
      page: "/dashboard/ron-decision",
      search: "?instrument=XAU%2FUSD&timeframe=15m&userId=u1&email=a%40b.com&broker=acme",
    });
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai?instrument=XAU%2FUSD&timeframe=15m", "_blank", "noopener");
  });

  it("partial, empty or overlong pairs fall back to plain /dashboard/ai", () => {
    for (const search of [
      "?instrument=XAUUSD",
      "?timeframe=15m",
      "?instrument=&timeframe=15m",
      "?instrument=XAUUSD&timeframe=",
      `?instrument=${"X".repeat(17)}&timeframe=15m`,
      `?instrument=XAUUSD&timeframe=${"1".repeat(17)}`,
      "",
      "?",
    ]) {
      openSpy.mockClear();
      openRonPopout({ page: "/dashboard/ron-decision", search });
      expect(openSpy).toHaveBeenCalledWith(...PLAIN);
    }
  });

  it("never infers or aliases market context on other routes", () => {
    for (const ctx of [
      { page: "/dashboard/charts", search: "?symbol=XAUUSD" },
      { page: "/dashboard/charts", search: "?instrument=XAUUSD&timeframe=15m" },
      { page: "/dashboard", search: "?instrument=XAUUSD&timeframe=15m" },
      { page: "/dashboard/ron-decision/extra", search: "?instrument=XAUUSD&timeframe=15m" },
    ]) {
      openSpy.mockClear();
      openRonPopout(ctx);
      expect(openSpy).toHaveBeenCalledWith(...PLAIN);
    }
  });

  it("PII/account fields cannot reach the URL even if passed at runtime", () => {
    openRonPopout({
      page: "/dashboard/ron-decision",
      search: "?instrument=XAUUSD&timeframe=15m",
      // deliberately over-wide runtime object
      ...({ userId: "u1", userName: "Jane", sessionLabel: "London Session", email: "a@b.com" } as object),
    });
    const url = String(openSpy.mock.calls[0][0]);
    for (const leak of ["u1", "Jane", "London", "a@b.com", "userId", "sessionLabel", "email"]) {
      expect(url).not.toContain(leak);
    }
  });

  it("introduces no transport, storage, DOM or capture surface", () => {
    for (const banned of [
      "fetch(", "supabase", "functions.invoke", "localStorage", "sessionStorage",
      "postMessage", "document.", "addEventListener", "broker", "email", "account",
      "userName", "userId", "sessionLabel",
    ]) {
      expect(SRC).not.toContain(banned);
    }
  });

  it("reuses the existing pure helpers instead of duplicating validation", () => {
    expect(SRC).toContain('from "@/lib/ask-ron-context"');
    expect(SRC).toContain("parseAskRonContext");
    expect(SRC).toContain("askRonContextHref");
  });

  it("DashboardLayout passes only pathname + search", () => {
    const i = LAYOUT.indexOf("openRonPopout(");
    const arg = LAYOUT.slice(i, i + 200);
    expect(arg).toContain("page: location.pathname");
    expect(arg).toContain("search: location.search");
    for (const banned of ["sessionLabel", "userName", "userId"]) expect(arg).not.toContain(banned);
  });

  it("leaves Ask RON page, context helpers and frozen trees byte-identical", () => {
    const diff = execSync(
      // GainEdgeAIPage.tsx is authorized to change by later frontend slices
      // (GAINEDGE_PRODUCT_ASK_RON_CONTEXT_HISTORY_CLARITY_V1); the bridge itself never touches it.
      // The GAINEDGE_GDELT_RAW_HEADLINES_V1 raw-ingestion seam is newly authorized and
      // additive; it touches no file this guard protects.
      `git diff ${BASE} -- src/lib/ask-ron-context.ts src/pages/dashboard/RonDecisionPage.tsx supabase strategy .lovable/plan.md`
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
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-opportunity-context/index.ts'`
      + ` ':(exclude)supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql'`
      + ` ':(exclude)src/lib/ron-opportunity-context-presentation.ts'`
      + ` ':(exclude)src/services/ron-opportunity-context.ts'`
      + ` ':(exclude)src/components/signals/RonOpportunityContextPanel.tsx'`
      + ` ':(exclude)src/components/signals/RonOpportunityCard.tsx'`
      + ` ':(exclude)src/services/signals-data.ts'`
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      + ` ':(exclude)src/test/gainedge-ron-opportunity-context-runtime-v1.test.ts'`
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
      // GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — additive server-side runtime binding
      // for the frozen pure spec plus its read-only UI surface. No frozen artifact is mutated.
      + ` ':(exclude)supabase/functions/_shared/ron-opportunity-context-runtime-v1.ts'`
      + ` ':(exclude)supabase/functions/ron-opportunity-context/index.ts'`
      + ` ':(exclude)supabase/migrations/20260825062420_e7f3ebc6-73e3-4798-9c0f-a301a1c7a519.sql'`
      + ` ':(exclude)src/lib/ron-opportunity-context-presentation.ts'`
      + ` ':(exclude)src/services/ron-opportunity-context.ts'`
      + ` ':(exclude)src/components/signals/RonOpportunityContextPanel.tsx'`
      + ` ':(exclude)src/components/signals/RonOpportunityCard.tsx'`
      + ` ':(exclude)src/services/signals-data.ts'`
      + ` ':(exclude)src/integrations/supabase/types.ts'`
      + ` ':(exclude)src/test/gainedge-ron-opportunity-context-runtime-v1.test.ts'`
      + ` ':(exclude).lovable/plan.md'`
      ,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});