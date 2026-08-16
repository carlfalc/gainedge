/**
 * GAINEDGE_PRODUCT_RON_CONTEXT_LINKS_V1 — focused tests for the read-only deep
 * link from tracked instrument cards to the stored RON decision record.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { ronDecisionRecordHref, ronDecisionRecordTitle } from "@/lib/ron-decision-explorer";

const panel = readFileSync("src/components/dashboard/InstrumentTrackingPanel.tsx", "utf8");

describe("deep-link helpers", () => {
  it("builds the exact explorer URL with encoded symbol and timeframe", () => {
    expect(ronDecisionRecordHref("XAUUSD", "15m"))
      .toBe("/dashboard/ron-decision?instrument=XAUUSD&timeframe=15m");
  });

  it("encodes unsafe characters in both params", () => {
    expect(ronDecisionRecordHref("XAU/USD", "1 h"))
      .toBe("/dashboard/ron-decision?instrument=XAU%2FUSD&timeframe=1%20h");
  });

  it("uses a truthful stored-record title naming symbol and timeframe", () => {
    expect(ronDecisionRecordTitle("XAUUSD", "15m"))
      .toBe("Open stored RON decision record for XAUUSD 15m");
  });
});

describe("instrument card wiring", () => {
  it("navigates with the router inside the dashboard", () => {
    expect(panel).toContain("const href = ronDecisionRecordHref(symbol, timeframe);");
    expect(panel).toContain("navigate(href);");
  });

  it("opens a new tab with noopener in the popout context", () => {
    const fn = panel.slice(panel.indexOf("const openRonRecord"), panel.indexOf("const handleDragStart"));
    expect(fn).toContain('window.location.pathname === "/instruments-popout"');
    expect(fn).toContain('window.open(href, "_blank", "noopener")');
  });

  it("passes the exact tracked symbol and timeframe from the card", () => {
    expect(panel).toContain("openRonRecord(inst.symbol, tf)");
  });

  it("stops click propagation and mousedown drag initiation", () => {
    expect(panel).toContain("onClick={(e) => { e.stopPropagation(); openRonRecord(inst.symbol, tf); }}");
    const btn = panel.slice(panel.indexOf("openRonRecord(inst.symbol, tf)"));
    expect(btn.slice(0, 400)).toContain("onMouseDown={(e) => e.stopPropagation()}");
    expect(btn.slice(0, 400)).toContain("draggable={false}");
  });

  it("exposes accessible stored-record labelling", () => {
    expect(panel).toContain("aria-label={ronDecisionRecordTitle(inst.symbol, tf)}");
    expect(panel).toContain("title={ronDecisionRecordTitle(inst.symbol, tf)}");
  });

  it("keeps the existing Chart action unchanged", () => {
    expect(panel).toContain("onClick={(e) => { e.stopPropagation(); openChart(inst.symbol); }}");
    expect(panel).toContain('window.open(`/dashboard/charts?symbol=${encodeURIComponent(symbol)}`, "_blank", "noopener")');
    expect(panel).toContain("navigate(`/dashboard/charts?symbol=${encodeURIComponent(symbol)}`)");
    expect(panel).toContain("Chart ↗");
  });

  it("performs no computation, fetch, invoke or write for the action", () => {
    const fn = panel.slice(panel.indexOf("const openRonRecord"), panel.indexOf("const handleDragStart"));
    expect(fn).not.toMatch(/functions\.invoke|fetch\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("introduces no probability, ranking or execution wording in the action", () => {
    const start = panel.indexOf("openRonRecord(inst.symbol, tf)");
    const btn = panel.slice(start - 200, start + 900);
    expect(btn).not.toMatch(/probabilit|confidence|opportunity score|rank|profit|entry|stop loss|take profit|execute|live/i);
    expect(btn).toContain("RON record ↗");
  });
});
