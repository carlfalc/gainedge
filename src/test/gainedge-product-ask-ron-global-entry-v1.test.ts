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

  it("context does not alter the URL", () => {
    openRonPopout({ page: "/dashboard/charts", sessionLabel: "London Session" });
    expect(openSpy).toHaveBeenCalledWith("/dashboard/ai", "_blank", "noopener");
  });

  it("fails silently when popup is blocked (null return)", () => {
    expect(() => openRonPopout({ page: "/dashboard" })).not.toThrow();
  });

  it("introduces no transport, storage or backend surface", () => {
    for (const banned of ["fetch(", "supabase", "functions.invoke", "localStorage", "sessionStorage", "postMessage", "document."]) {
      expect(SRC).not.toContain(banned);
    }
    expect(SRC).not.toMatch(/\?|&\w+=/);
  });

  it("route /dashboard/ai remains registered and unchanged", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="ai" element={<GainEdgeAIPage />} />');
  });

  it("DashboardLayout still calls openRonPopout and is unchanged from base", () => {
    const layout = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
    expect(layout).toContain("openRonPopout(");
    const diff = execSync(
      `git diff ${BASE} -- src/components/dashboard/DashboardLayout.tsx`,
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });

  it("frozen supabase/, strategy/ and plan remain unchanged", () => {
    const diff = execSync(`git diff ${BASE} -- supabase strategy .lovable/plan.md`, { encoding: "utf8" });
    expect(diff.trim()).toBe("");
  });
});
