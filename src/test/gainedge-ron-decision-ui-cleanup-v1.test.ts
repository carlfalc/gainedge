import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("src/pages/dashboard/DashboardHome.tsx", "utf8");
const pulse = readFileSync("src/components/dashboard/RonPulse.tsx", "utf8");

describe("RON decision dashboard cleanup", () => {
  it("makes stored decision records the dashboard's primary purpose", () => {
    expect(home).toContain("Stored decision records");
    expect(home).toContain("Open decision explorer");
    expect(home).toContain("/dashboard/ron-decision");
  });

  it("removes duplicate news and sentiment noise from the record surface", () => {
    expect(home).not.toContain("BreakingNewsTicker");
    expect(home).not.toContain("NewsSentimentPanel");
    expect(pulse).not.toContain('.from("news_items")');
  });

  it("does not show meaningless zero-value paper metrics", () => {
    expect(home).toContain("{totalTrades > 0 && (");
    expect(home).toContain('aria-label="Paper trading performance"');
  });

  it("keeps the RON hero to one stored evaluation instead of a mixed activity feed", () => {
    expect(pulse).toContain('item.kind === "ron_state" || item.kind === "data_health"');
    expect(pulse).toContain(".slice(0, 1)");
    expect(pulse).toContain("Latest stored evaluation");
  });

  it("keeps unrelated volume widgets off the decision-focused home screen", () => {
    expect(home).not.toContain("MostVolumeBar");
    expect(home).not.toContain("VolumeHistoryInline");
  });

  it("preserves the richer stored context added to current main", () => {
    expect(pulse).toContain("item.context");
    expect(pulse).toContain("pulse-context-");
  });
});
