import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FORWARD_CONTEXT_INSTRUMENTS,
  instrumentBinding,
  relationshipsFor,
} from "../../supabase/functions/_shared/ron-forward-instrument-binding-v1.ts";
import {
  RON_SELECTED_WATCH_INSTRUMENTS,
  RON_DATA_INSTRUMENTS_V2,
} from "../../supabase/functions/_shared/ron-agentic-watch-universe-v1.ts";

const read = (path: string) => readFileSync(path, "utf8");

describe("RON selected-watch runtime completion V1", () => {
  it("binds every selected market to the forward orchestration lineage", () => {
    expect([...FORWARD_CONTEXT_INSTRUMENTS]).toEqual([...RON_SELECTED_WATCH_INSTRUMENTS]);
    for (const instrument of RON_SELECTED_WATCH_INSTRUMENTS) {
      expect(instrumentBinding(instrument)?.orchestration_lineage_available).toBe(true);
    }
    expect(instrumentBinding("GER40")?.venue_class).toBe("index_cfd_24x5");
    expect(relationshipsFor("GER40").some((r) => r.reference === "NAS100")).toBe(true);
    expect(relationshipsFor("HK50").some((r) => r.reference === "NAS100")).toBe(true);
  });

  it("feeds GER40 through unattended ingestion and snapshot cron", () => {
    const ingest = read("supabase/functions/ingest-candles/index.ts");
    const migration = read("supabase/migrations/20260831222806_70225501-7611-44ad-8e74-68a4f85feace.sql");
    expect(RON_DATA_INSTRUMENTS_V2).toContain("GER40");
    expect(ingest).toContain('{ symbol: "GER40", timeframe: "15m" }');
    expect(migration).toContain("'HK50','GER40'");
  });

  it("uses exact completed-bar venue proof and all-session V5 context in the scheduler", () => {
    const scheduler = read("supabase/functions/ron-context-scheduler/index.ts");
    expect(scheduler).toContain("RON_SELECTED_WATCH_INSTRUMENTS.filter");
    expect(scheduler).toContain("candidateBarOpenIso");
    expect(scheduler).toContain("assessVenueV3(instrument, anchorIso");
    expect(scheduler).toContain("buildRonSessionContextV5");
    expect(scheduler).not.toContain("london_or_new_york");
  });

  it("wires chart annotations into the current RON rail with legacy level fallback", () => {
    const rail = read("src/components/dashboard/ChartSidePanel.tsx");
    expect(rail).toContain('import RonChartAnnotationsPanel');
    expect(rail).toContain("<RonChartAnnotationsPanel features={snapshot?.features} />");
    expect(rail).toContain("!hasChartAnnotations && patternCtx.levels.length > 0");
  });

  it("keeps Falconer outside RON-native completeness", () => {
    const roster = read("supabase/functions/_shared/ron-native-roster-v1.ts");
    expect(roster).toContain('RON_OPTIONAL_ADJUNCTS');
    expect(roster).toContain('"falconer_signal_source"');
    expect(roster).toContain("never counted toward");
  });
});
