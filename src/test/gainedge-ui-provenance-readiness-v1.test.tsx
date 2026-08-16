import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  formatAgeShort, normaliseTimeframe,
  presentCalibrationScope, presentPriceProvenance,
} from "@/lib/market-provenance-presentation";
import { QUOTE_FRESH_MS } from "@/services/live-quotes";
import PriceProvenanceBadge from "@/components/market/PriceProvenanceBadge";
import CalibrationScopeBadge from "@/components/market/CalibrationScopeBadge";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const BANNED = /%|confiden|edge|odds|expected performance|profit|calibrated\b(?!\s+for production)/i;

describe("price provenance presentation", () => {
  it("labels a fresh live quote with deterministic age wording", () => {
    const p = presentPriceProvenance({ kind: "live_quote", timestamp: at(8_000), now: NOW });
    expect(p.kind).toBe("live_quote");
    expect(p.state).toBe("fresh");
    expect(p.label).toBe("Live quote · updated 8s ago");
  });

  it("labels a stale live quote explicitly stale using the EXISTING freshness policy", () => {
    const p = presentPriceProvenance({ kind: "live_quote", timestamp: at(QUOTE_FRESH_MS + 30_000), now: NOW });
    expect(p.state).toBe("stale");
    expect(p.label).toBe("Live quote stale · 2m old");
    expect(p.label).not.toMatch(/updated/);
  });

  it("treats the boundary at exactly QUOTE_FRESH_MS as stale (no new threshold)", () => {
    expect(presentPriceProvenance({ kind: "live_quote", timestamp: at(QUOTE_FRESH_MS), now: NOW }).state).toBe("stale");
    expect(presentPriceProvenance({ kind: "live_quote", timestamp: at(QUOTE_FRESH_MS - 1), now: NOW }).state).toBe("fresh");
  });

  it("never labels a missing or invalid timestamp as live/current", () => {
    for (const ts of [null, undefined, "", "not-a-date"]) {
      const p = presentPriceProvenance({ kind: "live_quote", timestamp: ts as any, now: NOW });
      expect(p.kind).toBe("unknown");
      expect(p.label).toBe("Price source unavailable");
      expect(p.detail).toBe("Freshness unknown");
      expect(p.label + p.detail).not.toMatch(/live|current/i);
    }
  });

  it("labels a completed bar as a completed bar and never as a live quote", () => {
    const p = presentPriceProvenance({ kind: "completed_bar", timestamp: at(5 * 60_000), timeframe: "15m", now: NOW });
    expect(p.kind).toBe("completed_bar");
    expect(p.label).toBe("Completed 15m bar");
    expect(p.label).not.toMatch(/live/i);
    expect(p.detail).toMatch(/not a live quote/);
  });

  it("normalises timeframe tokens deterministically", () => {
    expect(normaliseTimeframe("15M")).toBe("15m");
    expect(normaliseTimeframe("15")).toBe("15m");
    expect(normaliseTimeframe(null)).toBeNull();
  });

  it("formats ages coarsely and deterministically", () => {
    expect(formatAgeShort(0)).toBe("0s");
    expect(formatAgeShort(90_000)).toBe("1m");
    expect(formatAgeShort(3 * 3_600_000)).toBe("3h");
    expect(formatAgeShort(4 * 86_400_000)).toBe("4d");
  });
});

describe("calibration scope presentation", () => {
  it("identifies only the exact XAUUSD 15m accepted evidence scope", () => {
    const s = presentCalibrationScope("XAUUSD", "15m");
    expect(s.inScope).toBe(true);
    expect(s.label).toBe("Calibration evidence: XAUUSD 15m");
    expect(s.secondary).toBe("Probability not calibrated for production");
  });

  it("does NOT transfer XAU scope to another timeframe", () => {
    for (const tf of ["1h", "5m", "1d", null]) {
      const s = presentCalibrationScope("XAUUSD", tf);
      expect(s.inScope).toBe(false);
      expect(s.label).toBe("Calibration: not established for this instrument");
      expect(s.secondary).toBe("Context only · no probability");
    }
  });

  it("does NOT transfer XAU scope to another instrument on 15m", () => {
    for (const sym of ["NAS100", "NDX100", "US30", "EURUSD"]) {
      expect(presentCalibrationScope(sym, "15m").inScope).toBe(false);
    }
  });

  it("never emits percentage, confidence, edge or performance language", () => {
    const all = [
      presentCalibrationScope("XAUUSD", "15m"),
      presentCalibrationScope("NAS100", "15m"),
    ];
    for (const s of all) expect(`${s.label} ${s.secondary}`).not.toMatch(BANNED);
  });
});

describe("badge components", () => {
  it("renders fresh live quote badge", () => {
    render(<PriceProvenanceBadge kind="live_quote" timestamp={at(3_000)} now={NOW} />);
    expect(screen.getByTestId("price-provenance-badge").textContent).toContain("Live quote · updated 3s ago");
  });

  it("renders completed bar badge without live wording", () => {
    render(<PriceProvenanceBadge kind="completed_bar" timestamp={at(60_000)} timeframe="15m" now={NOW} />);
    const el = screen.getByTestId("price-provenance-badge");
    expect(el.textContent).toContain("Completed 15m bar");
    expect(el.textContent).not.toMatch(/Live quote/);
  });

  it("renders unavailable badge for a missing timestamp", () => {
    render(<PriceProvenanceBadge kind="live_quote" timestamp={null} now={NOW} />);
    expect(screen.getByTestId("price-provenance-badge").textContent).toContain("Price source unavailable");
  });

  it("renders XAUUSD 15m scope with the production-probability qualifier", () => {
    render(<CalibrationScopeBadge symbol="XAUUSD" timeframe="15m" />);
    const el = screen.getByTestId("calibration-scope-badge");
    expect(el.textContent).toContain("Calibration evidence: XAUUSD 15m");
    expect(screen.getByTestId("calibration-scope-secondary").textContent)
      .toBe("Probability not calibrated for production");
  });

  it("renders non-scope wording for another instrument and keeps the qualifier on the tooltip in compact mode", () => {
    render(<CalibrationScopeBadge symbol="NAS100" timeframe="15m" compact />);
    const el = screen.getByTestId("calibration-scope-badge");
    expect(el.textContent).toBe("Calibration: not established for this instrument");
    expect(el.getAttribute("title")).toContain("Context only · no probability");
    expect(screen.queryByTestId("calibration-scope-secondary")).toBeNull();
  });

  it("badges wrap and do not use fixed widths that force horizontal scrolling", () => {
    render(
      <>
        <PriceProvenanceBadge kind="live_quote" timestamp={at(1_000)} now={NOW} />
        <CalibrationScopeBadge symbol="XAUUSD" timeframe="15m" />
      </>,
    );
    for (const id of ["price-provenance-badge", "calibration-scope-badge"]) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toContain("max-w-full");
      expect(cls).toContain("break-words");
      expect(cls).not.toMatch(/\bw-\[\d/);
    }
  });

  it("never renders banned quantitative language", () => {
    render(
      <>
        <PriceProvenanceBadge kind="live_quote" timestamp={at(1_000)} now={NOW} showDetail />
        <CalibrationScopeBadge symbol="XAUUSD" timeframe="15m" />
      </>,
    );
    expect(document.body.textContent ?? "").not.toMatch(BANNED);
  });
});
