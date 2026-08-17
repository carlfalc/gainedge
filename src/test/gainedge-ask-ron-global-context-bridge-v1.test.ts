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
      + ` ':(exclude)supabase/migrations/20260817110900_ingest_macro_headlines_cron.sql'`,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });
});