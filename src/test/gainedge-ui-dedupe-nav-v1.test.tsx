/**
 * GAINEDGE_UI_DEDUPE_NAV_V1 — nav grouping + Signals page resilience/wording tests.
 * Frontend presentation only; no RON core, backend or execution surface is touched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { NAV_GROUPS, NAV_PATHS } from "@/lib/dashboard-nav";

const LEGACY_PATHS = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/charts",
  "/dashboard/signals",
  "/dashboard/strategy",
  "/dashboard/ai",
  "/dashboard/journal",
  "/dashboard/analytics",
  "/dashboard/insights",
  "/dashboard/backtesting",
  "/dashboard/calendar",
  "/dashboard/clock-settings",
  "/dashboard/news-settings",
  "/dashboard/my-news",
  "/dashboard/ron-decision",
  "/dashboard/whisky-cigar-lounge",
];

const group = (name: string) => NAV_GROUPS.find(g => g.labelKey === name)!;

describe("nav grouping preserves every route", () => {
  it("contains each legacy dashboard path exactly once", () => {
    for (const p of LEGACY_PATHS) {
      expect(NAV_PATHS.filter(x => x === p)).toHaveLength(1);
    }
  });

  it("adds no routes and loses none", () => {
    expect([...NAV_PATHS].sort()).toEqual([...LEGACY_PATHS].sort());
    expect(new Set(NAV_PATHS).size).toBe(NAV_PATHS.length);
  });

  it("puts GainEdge AI and RON Decision in the RON group", () => {
    expect(group("RON").items.map(i => i.path)).toEqual(["/dashboard/ai", "/dashboard/ron-decision"]);
  });

  it("keeps Settings, Clock Settings and News Settings as distinct routes in the Settings group", () => {
    const paths = group("Settings").items.map(i => i.path);
    expect(paths).toEqual(["/dashboard/settings", "/dashboard/clock-settings", "/dashboard/news-settings"]);
    expect(new Set(paths).size).toBe(3);
  });

  it("keeps gold styling on the previously gold items only", () => {
    const gold = NAV_GROUPS.flatMap(g => g.items).filter(i => i.gold).map(i => i.path).sort();
    expect(gold).toEqual([
      "/dashboard/ai", "/dashboard/charts", "/dashboard/strategy", "/dashboard/whisky-cigar-lounge",
    ].sort());
  });

  it("keeps every route registered in App.tsx", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    for (const p of ["settings", "clock-settings", "news-settings", "ai", "ron-decision", "whisky-cigar-lounge"]) {
      expect(app).toContain(p);
    }
  });
});

describe("dashboard instrument cards are not duplicated", () => {
  it("DashboardHome consumes the shared InstrumentTrackingPanel exactly once", () => {
    const home = readFileSync("src/pages/dashboard/DashboardHome.tsx", "utf8");
    expect(home).toContain('import InstrumentTrackingPanel from "@/components/dashboard/InstrumentTrackingPanel"');
    expect(home.match(/<InstrumentTrackingPanel/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- Signals page
//
// GAINEDGE_SIGNALS_V1 replaced the single Falconer table with a three-lane page
// (RON Opportunities / Falconer Signals / History). Rendering behaviour is covered by
// src/test/gainedge-signals-v1.test.tsx; this file keeps only the governance guards.

describe("SignalsPage governance-safe wording", () => {
  const src = () => readFileSync("src/pages/dashboard/SignalsPage.tsx", "utf8")
    + readFileSync("src/lib/signals-presentation.ts", "utf8");

  it("uses record wording and never implies broker order placement", () => {
    const s = src();
    expect(s).toMatch(/records/i);
    expect(s).not.toMatch(/Enable the engine/i);
    expect(s).not.toMatch(/live execution/i);
    expect(s).not.toMatch(/Falconer Trades · Live/);
    expect(s).not.toMatch(/place (an )?order/i);
  });

  it("states plainly that records are not broker orders", async () => {
    const { SIGNAL_RECORDS_QUALIFIER } = await import("@/pages/dashboard/SignalsPage");
    expect(SIGNAL_RECORDS_QUALIFIER).toMatch(/do not represent orders placed with your broker/i);
  });
});
