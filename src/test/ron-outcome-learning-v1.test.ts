/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — contract tests.
 *
 * Proves the three non-negotiables of the outcome layer:
 *   • events are deterministic, deduplicated and never raised for silence
 *   • outcomes are closed-bar only, with an explicit future-data cutoff
 *   • nothing in the vocabulary implies a trade result, probability or causality
 */
import { describe, it, expect } from "vitest";
import {
  buildMaterialEventRow, materialEventKey, MATERIAL_EVENT_TYPES,
} from "../../supabase/functions/_shared/ron-material-events-v1.ts";
import {
  buildLesson, evaluateOutcome, horizonBars, OUTCOME_HORIZONS_BARS,
  OutcomeEvaluationError, type OutcomeBar,
} from "../../supabase/functions/_shared/ron-outcome-evaluation-v1.ts";

const BAR_MS = 15 * 60_000;
const ANCHOR = "2026-08-26T07:00:00.000Z";
const ANCHOR_MS = Date.parse(ANCHOR);

const source = (over: Record<string, unknown> = {}) => ({
  instrument: "NAS100",
  timeframe: "15m",
  evaluation_anchor: ANCHOR,
  analytical_bar_open: new Date(ANCHOR_MS - BAR_MS).toISOString(),
  spec_version: 2,
  runtime_version: 2,
  context_id: null,
  decision_id: null,
  trace_id: "trace",
  material_change_type: "new_forming",
  lifecycle: "forming",
  direction_context: "bullish",
  direction_authority: "observed",
  setup_family: "trend_continuation",
  data_state: "healthy",
  data_blocked: false,
  venue_state: "open",
  ...over,
});

const bars = (closes: number[]): OutcomeBar[] =>
  closes.map((c, i) => ({
    timestamp: new Date(ANCHOR_MS + i * BAR_MS).toISOString(),
    open: c, high: c + 1, low: c - 1, close: c,
  }));

describe("material events V1", () => {
  it("never raises an event for an unchanged state", () => {
    expect(buildMaterialEventRow(source({ material_change_type: "none" }))).toBeNull();
  });

  it("never turns a data condition into a market event", () => {
    expect(buildMaterialEventRow(source({ material_change_type: "data_blocked" }))).toBeNull();
    expect(buildMaterialEventRow(source({ data_blocked: true }))).toBeNull();
  });

  it("is deterministic, so re-evaluating an anchor cannot duplicate an event", () => {
    const a = buildMaterialEventRow(source());
    const b = buildMaterialEventRow(source());
    expect(a?.event_key).toBe(b?.event_key);
    expect(a?.event_key).toBe(materialEventKey(source()));
  });

  it("separates lineages: the same anchor under a different spec is a different key", () => {
    expect(materialEventKey(source({ spec_version: 1 })))
      .not.toBe(materialEventKey(source({ spec_version: 2 })));
  });

  it("marks every declared material change popup-capable, including confirmation", () => {
    for (const t of MATERIAL_EVENT_TYPES) {
      expect(buildMaterialEventRow(source({ material_change_type: t }))?.popup_capable).toBe(true);
    }
    expect(buildMaterialEventRow(source({ material_change_type: "confirmed" }))?.popup_capable).toBe(true);
  });
});

describe("outcome evaluation V1", () => {
  it("refuses a horizon whose bars are not all present", () => {
    expect(() => evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "bullish", horizon_bars: 4, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([100, 101]),
    })).toThrow(OutcomeEvaluationError);
  });

  it("never pads a gap: a non-contiguous window is not observable", () => {
    const gapped = bars([100, 101, 102]).filter((_, i) => i !== 1);
    expect(horizonBars(gapped, ANCHOR_MS, 3, BAR_MS)).toBeNull();
  });

  it("classifies aligned follow-through from closed bars only", () => {
    const r = evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "bullish", horizon_bars: 2, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([102, 106]),
    });
    expect(r.follow_through).toBe("aligned_follow_through");
    expect(r.bars_observed).toBe(2);
    expect(r.future_data_cutoff).toBe(new Date(ANCHOR_MS + 2 * BAR_MS).toISOString());
  });

  it("classifies adverse follow-through against the stated direction", () => {
    const r = evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "bullish", horizon_bars: 2, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([97, 94]),
    });
    expect(r.follow_through).toBe("adverse_follow_through");
    expect(r.mae).toBeGreaterThan(r.mfe);
  });

  it("reports a non-directional context instead of inventing one", () => {
    const r = evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "neutral", horizon_bars: 1, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([100]),
    });
    expect(r.follow_through).toBe("direction_context_not_directional");
  });

  it("uses trade-free, causality-free vocabulary", () => {
    const r = evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "bullish", horizon_bars: 1, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([101]),
    });
    const blob = JSON.stringify(r).toLowerCase();
    for (const banned of ["profit", "win", "loss", "target hit", "probability", "because"]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("summarises a lesson bounded by the widest observed cutoff", () => {
    const outcomes = OUTCOME_HORIZONS_BARS.slice(0, 2).map((h) => evaluateOutcome({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      direction_context: "bullish", horizon_bars: h, bar_ms: BAR_MS,
      reference_price: 100, bars: bars([102, 106]),
    }));
    const lesson = buildLesson({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      reviewed_at: "2026-08-26T09:00:00.000Z", outcomes,
    });
    expect(lesson?.future_data_cutoff).toBe(new Date(ANCHOR_MS + 2 * BAR_MS).toISOString());
    expect(lesson?.reason_tags).toContain("post_event_review_no_causal_claim");
    expect(lesson?.note.toLowerCase()).not.toContain("profit");
  });

  it("returns nothing to interpret when no horizon has completed", () => {
    expect(buildLesson({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      reviewed_at: "2026-08-26T09:00:00.000Z", outcomes: [],
    })).toBeNull();
  });
});
