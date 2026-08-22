/**
 * GAINEDGE_RON_HA_PATTERN_CONTEXT_V1 — Heikin Ashi pattern-context specialist V1.
 *
 * Proves: the HA formula is byte-equivalent to the FROZEN Falconer `toHA` (which is not
 * modified); the single completed-bar-close anchor convention is enforced and fails
 * closed; every evidence family emits only its declared vocabulary from exact geometry or
 * REUSED accepted categorical features; the lifecycle rule table is ordered, transparent
 * and conservative; the producer is pure and deterministic; and nothing probabilistic,
 * predictive, recommending or executable is emitted. Deterministic synthetic fixtures
 * only. No network, no database, no wall clock, nothing persisted.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sealEvidence } from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import { toHA } from "../../supabase/functions/_shared/falconer-strategy.ts";
import {
  buildSessionStructureEvidenceV3,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v3.ts";
import {
  acceptSessionStructureContextV3,
} from "../../supabase/functions/_shared/ron-pattern-structure-context-v3.ts";
import {
  HA_PATTERN_CONTEXT_SPEC_V1, HaPatternContextAnchorError,
  buildHaPatternContextV1, canonicalHeikinAshi, haOppositeWick,
  haPatternContextSpecHashV1,
  type HaSnapshotFeatures, type HaSourceBar,
} from "../../supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z");
const TRACE = "ron-ha-pattern-context-v1-fixture";

const anchorOf = (bars: HaSourceBar[]) => bars[bars.length - 1].time + BAR;

/** Accelerating uptrend: bullish run, expanding bodies, no lower (opposite) wick. */
function accelerating(n = 8): HaSourceBar[] {
  const out: HaSourceBar[] = [];
  let p = 2400;
  for (let i = 0; i < n; i++) {
    const open = p, close = open + (1 + i * 0.8);
    out.push({ time: START + i * BAR, open, high: close + 0.1, low: open, close });
    p = close;
  }
  return out;
}

/** Fading uptrend with deep lows: contracting bodies, an opposite wick that emerges. */
function fading(n = 8): HaSourceBar[] {
  const out: HaSourceBar[] = [];
  let p = 2400;
  for (let i = 0; i < n; i++) {
    const open = p, close = open + Math.max(0.2, 6 - i * 0.9);
    out.push({ time: START + i * BAR, open, high: close + 0.5, low: open - 4, close });
    p = close;
  }
  return out;
}

/** Escalating zigzag: the only geometry that genuinely alternates HA colours. */
function zigzag(n = 8): HaSourceBar[] {
  const out: HaSourceBar[] = [];
  let p = 2400;
  for (let i = 0; i < n; i++) {
    const open = p, close = open + (i % 2 === 0 ? 1 : -1) * 50 * Math.pow(2, i);
    out.push({
      time: START + i * BAR, open, close,
      high: Math.max(open, close) + 2, low: Math.min(open, close) - 2,
    });
    p = close;
  }
  return out;
}

/** Persistent downtrend, used to obtain structure that OPPOSES a bullish HA direction. */
function downtrend(n = 40): HaSourceBar[] {
  const out: HaSourceBar[] = [];
  let p = 2600;
  for (let i = 0; i < n; i++) {
    const open = p, close = open - (3 + (i % 3));
    out.push({ time: START + i * BAR, open, close, high: open + 1, low: close - 1 });
    p = close;
  }
  return out;
}

const FULL_FEATURES: HaSnapshotFeatures = {
  ema9: 2410, ema21: 2400, ema_stack: "up", ema21_slope: 0.4,
  adx14: 28, di_plus: 30, di_minus: 10, macd_state: "bullish_expanding",
  rsi14: 61, rsi14_slope3: 2.4, volatility_regime: "high", regime: "trend",
};

const run = (
  bars: HaSourceBar[],
  extra: Partial<Parameters<typeof buildHaPatternContextV1>[0]> = {},
) => buildHaPatternContextV1({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars), bars,
  trace_id: TRACE, run_id: "run-ha", ...extra,
});

const sealedSession = async (bars: HaSourceBar[], anchor: number) => sealEvidence(
  await buildSessionStructureEvidenceV3({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor,
    bars: bars.map((b) => ({ ...b, created_at: b.time + BAR + 1_000 })),
    isQuarantined: () => false, run_id: "run-session", trace_id: TRACE,
    newest_source_bar: bars[bars.length - 1].time,
  }),
);

/* ------------------------------------------------------------------ spec */

describe("HA pattern context spec V1 is pinned, closed and non-predictive", () => {
  it("hashes to the pinned value", async () => {
    expect(await haPatternContextSpecHashV1())
      .toBe("345dbb2a939de17903c1a745ddee080fda91780ded98090020b76ac49f07d15f");
  });

  it("declares no probability, forecast, recommendation or execution surface", () => {
    const sc = HA_PATTERN_CONTEXT_SPEC_V1.safety_contract;
    expect(sc.emits_probability).toBe(false);
    expect(sc.emits_confidence).toBe(false);
    expect(sc.emits_score).toBe(false);
    expect(sc.emits_forecast).toBe(false);
    expect(sc.emits_expected_value).toBe(false);
    expect(sc.emits_recommendation).toBe(false);
    expect(sc.emits_entry_stop_target_or_order_geometry).toBe(false);
    expect(sc.emits_causal_claim).toBe(false);
    expect(sc.execution_allowed).toBe(false);
    expect(sc.execution_path).toBe("signal_only");
    expect(sc.persists).toBe(false);
    expect(sc.reads_database).toBe(false);
    expect(sc.reads_network).toBe(false);
    expect(sc.reads_wall_clock).toBe(false);
  });

  it("introduces no new numeric threshold constant and reuses accepted features", () => {
    expect(HA_PATTERN_CONTEXT_SPEC_V1.reuse_contract.new_numeric_thresholds_introduced).toBe(0);
    expect(HA_PATTERN_CONTEXT_SPEC_V1.reuse_contract.snapshot_features_consumed)
      .toEqual(expect.arrayContaining(["ema9", "ema21", "macd_state", "volatility_regime"]));
    const src = readFileSync(
      "supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts", "utf8",
    );
    // No tolerance/threshold constant table may be introduced by this specialist.
    expect(/const\s+\w*(THRESHOLD|TOLERANCE)\w*\s*=/.test(src)).toBe(false);
  });

  it("keeps the anchor convention identical to Session V3 / Pattern V3", () => {
    const a = HA_PATTERN_CONTEXT_SPEC_V1.anchor_contract;
    expect(a.evaluation_anchor_means).toBe("completed_bar_close");
    expect(a.authoritative_analytical_bar_open).toBe("evaluation_anchor_minus_one_bar_exactly");
    expect(a.per_agent_anchor_convention).toBe(false);
    expect(a.same_anchor_for_every_specialist_in_the_run).toBe(true);
    expect(a.forming_bar_consumed).toBe(false);
  });
});

/* --------------------------------------------------- HA formula conformance */

describe("HA arithmetic is the canonical FROZEN Falconer formula", () => {
  it("is byte-equivalent to falconer-strategy toHA across fixtures", () => {
    for (const bars of [accelerating(30), fading(30), zigzag(12), downtrend(50)]) {
      const mine = canonicalHeikinAshi(bars);
      const frozen = toHA(bars.map((b) => ({ ...b })));
      expect(mine.length).toBe(frozen.length);
      for (let i = 0; i < mine.length; i++) {
        expect(mine[i].time).toBe(frozen[i].time);
        expect(mine[i].open).toBe(frozen[i].open);
        expect(mine[i].high).toBe(frozen[i].high);
        expect(mine[i].low).toBe(frozen[i].low);
        expect(mine[i].close).toBe(frozen[i].close);
      }
    }
  });

  it("does not modify the frozen Falconer strategy file", () => {
    const diff = execSync(
      "git diff --name-only 0b98dd1bf5eedddf8d0ee472a04d1a30c9c2a661 -- " +
      "supabase/functions/_shared/falconer-strategy.ts",
      { encoding: "utf8" },
    );
    expect(diff.trim()).toBe("");
  });

  it("defines the opposite wick as the wick against the bar's own direction", () => {
    expect(haOppositeWick({ time: 0, open: 1, high: 3, low: 0.5, close: 2 })).toBe(0.5);
    expect(haOppositeWick({ time: 0, open: 2, high: 3, low: 0.5, close: 1 })).toBe(1);
    expect(haOppositeWick({ time: 0, open: 1, high: 2, low: 0.5, close: 1 })).toBeNull();
  });
});

/* ------------------------------------------------------------- admissibility */

describe("single completed-bar-close anchor is enforced fail-closed", () => {
  const bars = accelerating(8);

  it("reports as_of === evaluation_anchor with the analytical bar one bar earlier", async () => {
    const r = await run(bars);
    const anchor = anchorOf(bars);
    expect(r.as_of).toBe(new Date(anchor).toISOString());
    expect(r.evaluation_anchor).toBe(r.as_of);
    expect(r.analytical_bar_open).toBe(new Date(anchor - BAR).toISOString());
    expect(Date.parse(r.evaluation_anchor) - Date.parse(r.analytical_bar_open)).toBe(BAR);
  });

  it("rejects a non-grid-aligned anchor", async () => {
    await expect(run(bars, { evaluation_anchor: anchorOf(bars) + 1 }))
      .rejects.toMatchObject({ reason: "evaluation_anchor_not_bar_close_aligned" });
  });

  it("rejects a non-finite anchor", async () => {
    await expect(run(bars, { evaluation_anchor: Number.NaN }))
      .rejects.toMatchObject({ reason: "evaluation_anchor_not_finite" });
  });

  it("rejects out-of-scope instrument and timeframe", async () => {
    await expect(run(bars, { instrument: "EURUSD" }))
      .rejects.toMatchObject({ reason: "instrument_out_of_scope" });
    await expect(run(bars, { timeframe: "1H" }))
      .rejects.toMatchObject({ reason: "timeframe_out_of_scope" });
  });

  it("rejects any source bar after the analytical bar (no forming bar, no lookahead)", async () => {
    const withForming = [...bars, {
      time: anchorOf(bars), open: 2500, high: 2501, low: 2499, close: 2500,
    }];
    await expect(buildHaPatternContextV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars),
      bars: withForming, trace_id: TRACE, run_id: "run-ha",
    })).rejects.toMatchObject({ reason: "source_bar_after_evaluation_anchor" });
  });

  it("rejects a gap between the newest bar and the anchor", async () => {
    await expect(run(bars, { evaluation_anchor: anchorOf(bars) + BAR }))
      .rejects.toBeInstanceOf(HaPatternContextAnchorError);
    await expect(run(bars, { evaluation_anchor: anchorOf(bars) + BAR }))
      .rejects.toMatchObject({ reason: "newest_analytical_bar_not_at_anchor_minus_one_bar" });
  });
});

/* -------------------------------------------------------------- geometry */

describe("HA geometry families are exact and vocabulary-closed", () => {
  it("accelerating uptrend: bullish run, expanding bodies, no opposite wick", async () => {
    const r = await run(accelerating(8));
    expect(r.states.trend_sequence).toBe("bullish");
    expect(r.states.run_length).toBe(8);
    expect(r.states.body_dynamics).toBe("expanding");
    expect(r.states.wick_character).toBe("no_opposite_wick");
    expect(r.states.opposing_wick_emergence).toBe("none");
    expect(r.states.colour_transition).toBe("none");
  });

  it("fading uptrend: contracting bodies with an emerging opposite wick", async () => {
    const r = await run(fading(8));
    expect(r.states.trend_sequence).toBe("bullish");
    expect(r.states.body_dynamics).toBe("contracting");
    expect(r.states.wick_character).toBe("both_sides");
    expect(r.states.opposing_wick_emergence).toBe("emerging");
  });

  it("escalating zigzag: strictly alternating colours", async () => {
    const r = await run(zigzag(8));
    expect(r.states.trend_sequence).toBe("alternating");
    expect(r.states.run_length).toBe(1);
    expect(r.states.colour_transition).toBe("alternating");
  });

  it("reports insufficient rather than guessing when there is a single bar", async () => {
    const one = accelerating(1);
    const r = await run(one);
    expect(r.states.trend_sequence).toBe("insufficient");
    expect(r.states.body_dynamics).toBe("insufficient");
    expect(r.states.opposing_wick_emergence).toBe("insufficient");
    expect(r.states.colour_transition).toBe("insufficient");
    expect(r.states.lifecycle).toBe("unavailable");
  });

  it("emits only declared vocabulary for every family", async () => {
    const fam = HA_PATTERN_CONTEXT_SPEC_V1.evidence_families as
      Record<string, readonly string[]>;
    for (const bars of [accelerating(8), fading(8), zigzag(8), downtrend(20)]) {
      const r = await run(bars, { features: FULL_FEATURES });
      for (const [key, vocab] of Object.entries(fam)) {
        expect(vocab).toContain((r.states as unknown as Record<string, unknown>)[key] as string);
      }
      expect(Number.isInteger(r.states.run_length)).toBe(true);
    }
  });
});

/* -------------------------------------------------------- reused features */

describe("contextual families REUSE accepted features and degrade honestly", () => {
  const bars = accelerating(8);

  it("maps volatility_regime verbatim, and unavailable when absent", async () => {
    const cases: [string | null, string][] = [
      ["low", "compressed"], ["high", "expanding"], ["normal", "normal"],
      ["unknown", "unavailable"], [null, "unavailable"],
    ];
    for (const [regime, expected] of cases) {
      const r = await run(bars, { features: { volatility_regime: regime } });
      expect(r.states.compression_expansion).toBe(expected);
    }
    expect((await run(bars)).states.compression_expansion).toBe("unavailable");
  });

  it("classifies the EMA relationship without inventing a threshold", async () => {
    expect((await run(bars, { features: {} })).states.ema_relationship).toBe("unavailable");
    expect((await run(bars, { features: FULL_FEATURES })).states.ema_relationship)
      .toBe("bullish_alignment");
    expect((await run(bars, {
      features: { ema9: 2400, ema21: 2410, ema_stack: "down" },
    })).states.ema_relationship).toBe("bearish_alignment");
    expect((await run(bars, {
      features: { ema9: 2410, ema21: 2400, ema_stack: "up" },
      prior_features: { ema9: 2395, ema21: 2400 },
    })).states.ema_relationship).toBe("bullish_cross_forming");
    expect((await run(bars, {
      features: { ema9: 2395, ema21: 2400, ema_stack: "down" },
      prior_features: { ema9: 2410, ema21: 2400 },
    })).states.ema_relationship).toBe("bearish_cross_forming");
    expect((await run(bars, {
      features: { ema9: 2402, ema21: 2400, ema_stack: "mixed" },
      prior_features: { ema9: 2410, ema21: 2400 },
    })).states.ema_relationship).toBe("convergence");
    expect((await run(bars, {
      features: { ema9: 2410, ema21: 2400, ema_stack: "mixed" },
    })).states.ema_relationship).toBe("mixed");
  });

  it("confirms momentum only on unanimous agreement of the reused votes", async () => {
    expect((await run(bars, { features: { ...FULL_FEATURES, macd_state: null } }))
      .states.momentum_confirmation).toBe("unavailable");
    expect((await run(bars, { features: FULL_FEATURES }))
      .states.momentum_confirmation).toBe("agreement");
    expect((await run(bars, {
      features: { ...FULL_FEATURES, macd_state: "bullish_fading" },
    })).states.momentum_confirmation).toBe("weakening");
    expect((await run(bars, {
      features: { ...FULL_FEATURES, di_plus: 10, di_minus: 30 },
    })).states.momentum_confirmation).toBe("mixed");
    expect((await run(bars, {
      features: { ...FULL_FEATURES, rsi14_slope3: 0 },
    })).states.momentum_confirmation).toBe("mixed");
  });
});

/* ------------------------------------------------------ structure relevance */

describe("structural relevance CONSUMES sealed Session V3 and never infers it", () => {
  const bars = accelerating(160);

  it("is unavailable with no sealed session context", async () => {
    const r = await run(bars, { features: FULL_FEATURES });
    expect(r.states.structure_relevance).toBe("unavailable");
    expect(r.structure_context).toEqual({ available: false, rejection_reason: "session_context_absent" });
  });

  it("is unavailable when the sealed context is bound to a different anchor", async () => {
    const other = accelerating(161);
    const sealed = await sealedSession(other, anchorOf(other));
    const r = await run(bars, { features: FULL_FEATURES, session_evidence: sealed });
    expect(r.states.structure_relevance).toBe("unavailable");
    expect(r.structure_context.available).toBe(false);
  });

  it("uses the consumed structure verbatim at the shared anchor", async () => {
    const anchor = anchorOf(bars);
    const sealed = await sealedSession(bars, anchor);
    const ctx = await acceptSessionStructureContextV3(sealed, {
      trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor,
    });
    expect(ctx.ok).toBe(true);
    const r = await run(bars, { features: FULL_FEATURES, session_evidence: sealed });
    expect(r.structure_context.available).toBe(true);
    if (!ctx.ok) throw new Error("unreachable");
    const expected = ctx.structure_event !== "none"
      ? "at_relevant_level"
      : ctx.structure_state === "up_structure"
      ? "with_structure"
      : ctx.structure_state === "down_structure"
      ? "against_structure"
      : "neutral";
    expect(r.states.structure_relevance).toBe(expected);
  });
});

/* ------------------------------------------------------------- lifecycle */

describe("lifecycle is an ordered, transparent, conservative rule table", () => {
  it("confirms only on multi-family alignment", async () => {
    const r = await run(accelerating(8), { features: FULL_FEATURES });
    expect(r.states.lifecycle).toBe("confirmed");
    expect(r.reason_tokens).toContain("lifecycle:R3_confirmed_multi_family_alignment");
  });

  it("lets deteriorating evidence dominate strengthening evidence", async () => {
    const r = await run(accelerating(8), {
      features: { ...FULL_FEATURES, macd_state: "bullish_fading" },
    });
    // momentum weakens, so the weakening rule wins over strengthening — never `confirmed`.
    expect(r.states.lifecycle).toBe("weakening");
    const s = await run(accelerating(8), {
      features: { ...FULL_FEATURES, di_plus: 10, di_minus: 30 },
    });
    expect(s.states.lifecycle).toBe("strengthening");
  });

  it("weakens on contracting bodies or an emerging opposite wick", async () => {
    const r = await run(fading(8), { features: FULL_FEATURES });
    expect(r.states.lifecycle).toBe("weakening");
  });

  it("invalidates a previously confirmed pattern on a directional colour flip", async () => {
    const flip = fading(8);
    // Force a genuine bullish->bearish HA flip on the analytical bar.
    const last = flip[flip.length - 1];
    flip[flip.length - 1] = {
      ...last, open: last.open, close: last.open - 80, high: last.open + 1, low: last.open - 90,
    };
    const r = await run(flip, { features: FULL_FEATURES, prior_lifecycle: "confirmed" });
    expect(r.states.colour_transition).toBe("bullish_to_bearish");
    expect(r.states.lifecycle).toBe("invalidated");
    const without = await run(flip, { features: FULL_FEATURES });
    expect(without.states.lifecycle).not.toBe("invalidated");
  });

  it("emits a reason token for every categorical decision", async () => {
    const r = await run(accelerating(8), { features: FULL_FEATURES });
    for (const family of [
      "trend_sequence", "body_dynamics", "wick_character", "opposing_wick_emergence",
      "colour_transition", "compression_expansion", "ema_relationship",
      "momentum_confirmation", "structure_relevance", "lifecycle",
    ]) {
      expect(r.reason_tokens.some((t) => t.startsWith(`${family}:`))).toBe(true);
    }
    for (const token of r.reason_tokens) {
      expect(r.observations.some((o) => o.key === "ha_reason_token" && o.value_text === token))
        .toBe(true);
    }
  });
});

/* -------------------------------------------------- purity and determinism */

describe("the producer is pure, deterministic and non-predictive", () => {
  it("produces identical output for identical input", async () => {
    const bars = accelerating(20);
    const a = await run(bars, { features: FULL_FEATURES });
    const b = await run(bars, { features: FULL_FEATURES });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never emits a probability, score, forecast or execution field", async () => {
    const r = await run(accelerating(20), { features: FULL_FEATURES });
    expect(r.numeric_probability).toBeNull();
    expect(r.execution_allowed).toBe(false);
    expect(r.execution_path).toBe("signal_only");
    const text = JSON.stringify(r).toLowerCase();
    // Only the emitted STATES and observation keys are checked: the limitations text
    // deliberately NAMES these concepts in order to disclaim them.
    const emitted = JSON.stringify({ states: r.states, observations: r.observations })
      .toLowerCase();
    for (const banned of [
      "probability", "confidence", "expected_value", "odds", "forecast",
      "predict", "recommend", "entry_price", "stop_loss", "take_profit", "win_rate",
    ]) {
      expect(emitted.includes(banned)).toBe(false);
    }
    expect(text).not.toContain("\"numeric_probability\":0");
  });

  it("does not read the database, the network or the wall clock", () => {
    const src = readFileSync(
      "supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts", "utf8",
    );
    for (const banned of [
      "createClient(", "await fetch", "Date.now(", "Math.random(", "Deno.env",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it("states its own limitations explicitly", async () => {
    const r = await run(accelerating(20), { features: FULL_FEATURES });
    expect(r.limitations.length).toBeGreaterThanOrEqual(3);
    expect(r.limitations.join(" ")).toContain("not a probability");
  });
});
