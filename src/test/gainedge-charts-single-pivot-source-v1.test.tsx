import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import ChartLevelsOverlay from "@/components/dashboard/ChartLevelsOverlay";
import { LEVEL_OVERLAY_NOTE } from "@/lib/chart-levels";
import { detectRonTechnicalAnnotationsV1 } from "../../supabase/functions/_shared/ron-technical-annotation-detector-v1.ts";
import type { Candle } from "../../supabase/functions/_shared/falconer-strategy.ts";

const START = Date.parse("2026-08-01T00:00:00.000Z");
const candles: Candle[] = Array.from({ length: 320 }, (_, i) => {
  const close = 2400 + i * 0.18 + Math.sin(i / 5) * 7;
  const open = close - Math.sin(i / 3) * 1.8;
  return {
    time: START + i * 15 * 60_000,
    open,
    high: Math.max(open, close) + 2.2,
    low: Math.min(open, close) - 2.1,
    close,
    volume: 100 + (i % 20),
  };
});

describe("GAINEDGE charts single pivot source V1", () => {
  it("seals the full traditional pivot set from the last completed session", () => {
    const rows = detectRonTechnicalAnnotationsV1("XAUUSD", "15m", candles);
    const levels = new Set(
      rows
        .filter((r) => r.geometry.type === "pivot")
        .map((r) => (r.geometry as { level: string }).level),
    );
    for (const level of ["P", "R1", "R2", "R3", "S1", "S2", "S3"]) {
      expect(levels.has(level)).toBe(true);
    }
  });

  it("does not load a third-party pivot study on the chart widget", () => {
    const src = readFileSync("src/components/dashboard/TradingViewWidget.tsx", "utf8");
    expect(src).not.toContain("PivotPointsStandard");
    expect(LEVEL_OVERLAY_NOTE).not.toMatch(/Pivot Points study/i);
  });

  it("renders RON pivots in white", () => {
    const features = {
      chart_annotations_v1: [
        {
          annotation_version: 1,
          id: "pivot-p",
          symbol: "XAUUSD",
          timeframe: "15m",
          kind: "pivot",
          subtype: "classical_pivot_level",
          direction: "contextual",
          lifecycle: "current",
          source_agent: "session_market_structure",
          as_of_bar_time: "2026-09-01T03:15:00.000Z",
          origin_anchor: { bar_time: "2026-08-31T23:45:00.000Z", price: 4460 },
          geometry: {
            type: "pivot",
            level: "P",
            price: 4469.7,
            source_session: {
              start_time: "2026-08-31T00:00:00.000Z",
              end_time: "2026-09-01T00:00:00.000Z",
              high: 4500,
              low: 4430,
              close: 4479.1,
            },
          },
        },
      ],
    };
    render(<ChartLevelsOverlay symbol="XAUUSD" patterns={[]} features={features} />);
    const price = screen.getByText("4469.70");
    expect(price.getAttribute("style")).toMatch(/rgb\(255, 255, 255\)|#FFFFFF/i);
  });
});
