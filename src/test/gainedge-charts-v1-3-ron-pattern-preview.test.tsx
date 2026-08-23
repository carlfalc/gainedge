/**
 * GAINEDGE_CHARTS_V1_3_RON_PATTERN_PREVIEW — truthfulness tests.
 *
 * Fixtures are VERBATIM rows from production `ron_market_snapshots`
 * (XAUUSD 15m, feature_version 6, bar_time 2026-08-21T20:45:00Z).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChartSidePanel from "@/components/dashboard/ChartSidePanel";
import { buildPatternContext } from "@/lib/charts-context";
import {
  buildPatternWindow,
  extractPatternGeometry,
  filterEligibleCandles,
  patternGlossary,
  toPreviewCandles,
  PATTERN_GLOSSARY,
  PATTERN_PREVIEW_WINDOW_BARS,
  PRICE_ONLY_GEOMETRY_NOTE,
  type PreviewCandle,
} from "@/lib/pattern-preview";
import { timeframeMinutes } from "@/services/pattern-preview-candles";

const PROVENANCE = { window_size: 1500, quality_version: 5, feature_version: 6 };

const DOUBLE_BOTTOM = {
  pattern_name: "Double Bottom", direction: "bullish", confidence: 6,
  start_index: 106, end_index: 116,
  key_prices: { neckline: 4604.61, target: 4638.445, troughs: [4577.97, 4563.58] },
};
const HEAD_SHOULDERS = {
  pattern_name: "Head & Shoulders", direction: "bearish", confidence: 9,
  start_index: 62, end_index: 77,
  key_prices: { neckline: 4513.67, peaks: [4532.86, 4543.78, 4542.76], target: 4483.56 },
};
const SUPPORT = {
  pattern_name: "Support", direction: "bullish", confidence: 6,
  start_index: 50, end_index: 149, key_prices: { support: 4516.785 },
};
const TRIANGLE = {
  pattern_name: "Ascending Triangle", direction: "bullish", confidence: 7,
  start_index: 20, end_index: 40,
  key_prices: {
    upper_line: { start: { time: 1_700_000_000, price: 4600 }, end: { time: 1_700_050_000, price: 4600 } },
    lower_line: { start: { time: 1_700_000_000, price: 4550 }, end: { time: 1_700_050_000, price: 4590 } },
    target: 4650,
  },
};

/** Weekday London-session bars so `xauVenueOpen` keeps them eligible. */
function series(count: number, endMs: number, stepMin = 15): PreviewCandle[] {
  const out: PreviewCandle[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const time = endMs - i * stepMin * 60_000;
    out.push({ time, open: 4500, high: 4510, low: 4490, close: 4505, volume: 10, createdAt: time + stepMin * 60_000 });
  }
  return out;
}
// Thu 2026-08-20 12:00Z — inside the venue-open window for every bar generated below.
const ANCHOR = Date.parse("2026-08-20T12:00:00.000Z");

describe("index / window alignment is derived, never guessed", () => {
  it("rebuilds exactly the 150-bar detector window ending at the anchor", () => {
    const w = buildPatternWindow(series(400, ANCHOR), ANCHOR, 15, new Set());
    expect(w.aligned).toBe(true);
    expect(w.candles).toHaveLength(PATTERN_PREVIEW_WINDOW_BARS);
    expect(w.candles[PATTERN_PREVIEW_WINDOW_BARS - 1].time).toBe(ANCHOR);
    // detector index 149 == the snapshot bar
    expect(w.candles[149].time).toBe(ANCHOR);
  });

  it("never includes a candle later than the snapshot anchor", () => {
    const withFuture = series(400, ANCHOR).concat(series(10, ANCHOR + 10 * 15 * 60_000));
    const w = buildPatternWindow(withFuture, ANCHOR, 15, new Set());
    expect(w.aligned).toBe(true);
    expect(Math.max(...w.candles.map((c) => c.time))).toBe(ANCHOR);
  });

  it("removes quarantined bars BEFORE indexing, shifting the window like the detector", () => {
    const raw = series(400, ANCHOR);
    const bad = new Set([new Date(raw[raw.length - 5].time).toISOString()]);
    const w = buildPatternWindow(raw, ANCHOR, 15, bad);
    expect(w.aligned).toBe(true);
    expect(w.excluded).toBeGreaterThanOrEqual(1);
    expect(w.candles.some((c) => bad.has(new Date(c.time).toISOString()))).toBe(false);
  });

  it("excludes bars persisted before their own close (premature_bar_persisted)", () => {
    const raw = series(10, ANCHOR).map((c, i) => (i === 3 ? { ...c, createdAt: c.time + 60_000 } : c));
    const { eligible, excluded } = filterEligibleCandles(raw, 15, new Set());
    expect(excluded).toBe(1);
    expect(eligible).toHaveLength(9);
  });

  it("fails closed instead of aligning when history is short or the anchor is absent", () => {
    expect(buildPatternWindow(series(40, ANCHOR), ANCHOR, 15, new Set()).reason).toBe("insufficient_history");
    expect(buildPatternWindow(series(400, ANCHOR), ANCHOR + 60_000, 15, new Set()).reason).toBe("anchor_not_last");
    const quarantinedAnchor = new Set([new Date(ANCHOR).toISOString()]);
    expect(buildPatternWindow(series(400, ANCHOR), ANCHOR, 15, quarantinedAnchor).aligned).toBe(false);
  });

  it("parses timeframes safely", () => {
    expect(timeframeMinutes("15m")).toBe(15);
    expect(timeframeMinutes("4h")).toBe(240);
    expect(timeframeMinutes("weekly")).toBeNull();
  });

  it("sorts and coerces raw candle_history rows", () => {
    const c = toPreviewCandles([
      { timestamp: "2026-08-20T12:00:00Z", open: "1", high: "2", low: "0.5", close: "1.5", volume: "3", created_at: "2026-08-20T12:15:00Z" },
      { timestamp: "2026-08-20T11:45:00Z", open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);
    expect(c.map((x) => x.time)).toEqual([Date.parse("2026-08-20T11:45:00Z"), Date.parse("2026-08-20T12:00:00Z")]);
    expect(c[1].open).toBe(1);
    expect(c[0].createdAt).toBeNull();
  });
});

describe("geometry is only what the detector stored", () => {
  it("keeps price-only pivots as reference levels and stores no fake coordinates", () => {
    const g = extractPatternGeometry(DOUBLE_BOTTOM);
    expect(g.lines).toEqual([]);
    expect(g.hasExactGeometry).toBe(false);
    expect(g.hasPriceOnlyPivots).toBe(true);
    expect(g.levels).toEqual([
      { label: "Neckline", price: 4604.61 },
      { label: "Measured move", price: 4638.445 },
      { label: "Trough 1", price: 4577.97 },
      { label: "Trough 2", price: 4563.58 },
    ]);
    expect(g.spanBars).toBe(11);
    expect(PRICE_ONLY_GEOMETRY_NOTE).toMatch(/not their exact candle positions/);
  });

  it("keeps all three stored H&S peaks as levels without inventing shoulder anchors", () => {
    const g = extractPatternGeometry(HEAD_SHOULDERS);
    expect(g.levels.filter((l) => l.label.startsWith("Peak"))).toHaveLength(3);
    expect(g.lines).toEqual([]);
  });

  it("draws exact line coordinates only when time+price are stored", () => {
    const g = extractPatternGeometry(TRIANGLE);
    expect(g.hasExactGeometry).toBe(true);
    expect(g.lines[0]).toEqual({ label: "Upper boundary", start: { time: 1_700_000_000, price: 4600 }, end: { time: 1_700_050_000, price: 4600 } });
    const partial = extractPatternGeometry({ pattern_name: "Bull Flag", key_prices: { upper_line: { start: { time: 1 } } } });
    expect(partial.lines).toEqual([]);
  });

  it("degrades honestly with no key_prices at all", () => {
    const g = extractPatternGeometry({ pattern_name: "Mystery", start_index: 1, end_index: 2 });
    expect(g.levels).toEqual([]);
    expect(g.lines).toEqual([]);
    expect(g.hasPriceOnlyPivots).toBe(false);
  });
});

describe("deterministic educational glossary", () => {
  it("covers every named pattern the active detector emits", () => {
    for (const n of ["Double Top", "Double Bottom", "Head & Shoulders", "Ascending Triangle", "Descending Triangle", "Bull Flag", "Bear Flag"]) {
      expect(patternGlossary(n)).not.toBeNull();
    }
    expect(patternGlossary("Support")).toBeNull();
    expect(patternGlossary("Unknown Shape")).toBeNull();
  });

  it("is neutral: no probability, no confidence, no buy/sell instruction", () => {
    const text = Object.values(PATTERN_GLOSSARY)
      .flatMap((e) => [e.what, e.reading, e.measured]).join(" ").toLowerCase();
    expect(text).not.toMatch(/\d+(\.\d+)?%/);
    expect(text).not.toContain("probability");
    expect(text).not.toContain("confidence");
    expect(text).not.toMatch(/\b(buy|sell|long|short)\b/);
    expect(text).not.toMatch(/\b(confirmed|validated|invalidated)\b/);
  });

  it("is deterministic across calls", () => {
    expect(patternGlossary("double bottom")).toEqual(patternGlossary("Double  Bottom"));
  });
});

describe("previewability is truthful", () => {
  it("marks real indexed detections previewable and level rows are excluded entirely", () => {
    const ctx = buildPatternContext([DOUBLE_BOTTOM, HEAD_SHOULDERS, SUPPORT], { provenance: PROVENANCE }, "15m");
    expect(ctx.latest?.name).toBe("Double Bottom");
    expect(ctx.latest?.previewable).toBe(true);
    expect(ctx.latest?.startIndex).toBe(106);
    expect(ctx.namedCount).toBe(2);
    expect(ctx.levels).toHaveLength(1);
  });

  it("refuses to preview when provenance or the span is missing / out of window", () => {
    const noProv = buildPatternContext([DOUBLE_BOTTOM], {}, "15m");
    expect(noProv.latest?.previewable).toBe(false);
    expect(noProv.latest?.notPreviewableReason).toMatch(/provenance/i);

    const noSpan = buildPatternContext([{ ...DOUBLE_BOTTOM, start_index: undefined }], { provenance: PROVENANCE }, "15m");
    expect(noSpan.latest?.previewable).toBe(false);

    const outside = buildPatternContext([{ ...DOUBLE_BOTTOM, end_index: 400 }], { provenance: PROVENANCE }, "15m");
    expect(outside.latest?.previewable).toBe(false);
    expect(outside.latest?.notPreviewableReason).toMatch(/outside/i);
  });
});

describe("Charts rail entry point", () => {
  const snapshot = {
    symbol: "XAUUSD", timeframe: "15m", bar_time: "2026-08-21T20:45:00Z",
    open: 4500, high: 4510, low: 4490, close: 4505, volume: 1,
    features: { provenance: PROVENANCE }, patterns: [DOUBLE_BOTTOM, HEAD_SHOULDERS, SUPPORT],
    data_health: "healthy" as const, computed_at: "2026-08-21T20:46:00Z",
  };
  const base = {
    symbol: "XAUUSD", userId: "u", accountId: null, positions: [],
    onClosePosition: () => {}, closingId: null,
  };

  it("shows Show pattern for the latest detection and calls back with the real row", () => {
    const onShowPattern = vi.fn();
    render(<ChartSidePanel {...base} snapshot={snapshot} onShowPattern={onShowPattern} />);
    fireEvent.click(screen.getByTestId("show-pattern-latest"));
    expect(onShowPattern).toHaveBeenCalledTimes(1);
    const passed = onShowPattern.mock.calls[0][0].source as Record<string, unknown>;
    expect(passed.key_prices).toBe(DOUBLE_BOTTOM.key_prices);
    expect(passed.start_index).toBe(106);
    expect(passed).not.toHaveProperty("confidence");
  });

  it("offers Show pattern for expanded earlier detections", () => {
    const onShowPattern = vi.fn();
    render(<ChartSidePanel {...base} snapshot={snapshot} onShowPattern={onShowPattern} />);
    fireEvent.click(screen.getByTestId("pattern-earlier-toggle"));
    const earlier = screen.getAllByText("Show pattern");
    expect(earlier.length).toBeGreaterThan(1);
  });

  it("shows an honest reason instead of a button when the row cannot be previewed", () => {
    render(
      <ChartSidePanel
        {...base}
        snapshot={{ ...snapshot, features: {}, patterns: [DOUBLE_BOTTOM] }}
        onShowPattern={() => {}}
      />,
    );
    expect(screen.queryByTestId("show-pattern-latest")).toBeNull();
    expect(screen.getByTestId("show-pattern-latest-unavailable").textContent).toMatch(/provenance/i);
  });

  it("never surfaces numeric confidence in the rail", () => {
    const { container } = render(<ChartSidePanel {...base} snapshot={snapshot} onShowPattern={() => {}} />);
    expect(container.textContent).not.toMatch(/confidence/i);
    expect(container.textContent).not.toMatch(/\b9\/10\b/);
  });
});

describe("scope containment", () => {
  it("preview code touches no backend, execution or frozen runtime surface", async () => {
    const fs = await import("node:fs/promises");
    for (const f of ["src/lib/pattern-preview.ts", "src/services/pattern-preview-candles.ts", "src/components/dashboard/PatternPreviewModal.tsx"]) {
      const raw = await fs.readFile(f, "utf8");
      // strip comments: doc-comments legitimately state the no-probability rule
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(src).not.toMatch(/functions\.invoke|metaapi|place_order|execute_trade/i);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
      expect(src).not.toMatch(/probability/i);
    }
  });
});

// jsdom has no canvas; the chart canvas itself is not the subject of these tests.
vi.mock("lightweight-charts", () => ({
  createChart: () => ({
    addSeries: () => ({ setData: () => {}, createPriceLine: () => {} }),
    timeScale: () => ({ fitContent: () => {} }),
    applyOptions: () => {},
    remove: () => {},
  }),
  createSeriesMarkers: () => ({}),
  CandlestickSeries: {},
  LineSeries: {},
}));

vi.mock("@/services/pattern-preview-candles", async (orig) => {
  const actual = await orig<typeof import("@/services/pattern-preview-candles")>();
  return {
    ...actual,
    loadPatternPreviewWindow: vi.fn(async () => ({
      candles: series(150, ANCHOR), excluded: 2, aligned: true, reason: "aligned" as const,
      quarantinedApplied: 2, qualityVersion: 5, error: null,
    })),
  };
});

describe("pattern preview modal", () => {
  const detection = buildPatternContext([DOUBLE_BOTTOM], { provenance: PROVENANCE }, "15m").latest!;
  const renderModal = async (onClose = vi.fn()) => {
    const { default: PatternPreviewModal } = await import("@/components/dashboard/PatternPreviewModal");
    const utils = render(
      <PatternPreviewModal
        symbol="XAUUSD" timeframe="15m" barTime="2026-08-20T12:00:00.000Z"
        detection={detection} onClose={onClose}
      />,
    );
    return { ...utils, onClose };
  };

  it("labels itself educational, cites real recency and never shows probability or a side", async () => {
    const { container } = await renderModal();
    expect(await screen.findByTestId("pattern-preview-title")).toHaveTextContent("XAUUSD · Double Bottom · bullish");
    expect(screen.getByTestId("pattern-preview-recency").textContent).toBe("Detected 33 completed 15m bars ago");
    expect(container.textContent).toContain("Educational pattern preview");
    expect(container.textContent).not.toMatch(/probability|confidence|confirmed|validated|invalidated/i);
    expect(container.textContent).not.toMatch(/\b(BUY|SELL|LONG|SHORT)\b/);
  });

  it("states that price-only pivots have no stored candle position", async () => {
    await renderModal();
    expect(screen.getByTestId("pattern-preview-geometry-note").textContent).toMatch(/not their exact candle positions/);
  });

  it("closes on the close button, Return to chart, Escape and backdrop click", async () => {
    for (const act of [
      () => fireEvent.click(screen.getByTestId("pattern-preview-close")),
      () => fireEvent.click(screen.getByTestId("pattern-preview-return")),
      () => fireEvent.keyDown(window, { key: "Escape" }),
      () => fireEvent.click(screen.getByTestId("pattern-preview-backdrop")),
    ]) {
      const { onClose, unmount } = await renderModal();
      act();
      expect(onClose).toHaveBeenCalled();
      unmount();
    }
  });

  it("renders no TradingView iframe and injects nothing into one", async () => {
    const { container } = await renderModal();
    expect(container.querySelector("iframe")).toBeNull();
  });
});
