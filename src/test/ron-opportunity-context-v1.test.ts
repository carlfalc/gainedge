/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_V1 — pure opportunity-context producer.
 *
 * Proves: the spec is hash pinned and vocabulary closed; the single completed-bar-close
 * anchor is enforced fail-closed; sealed contextual evidence is accepted or rejected
 * verbatim and never recomputed; direction authority is Session V3 (never Cross-Asset,
 * never Macro, never Falconer); every non-trivial setup family needs at least two
 * independent evidence families; the lifecycle table is ordered and conservative; a data
 * defect is never reported as market invalidation; and nothing probabilistic, predictive,
 * recommending, executable or persisted is emitted. Deterministic synthetic fixtures only.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_EVIDENCE_SCHEMA_VERSION, sealEvidence,
  type EvidenceEnvelopeV1,
} from "../../supabase/functions/_shared/ron-agent-contracts.ts";
import {
  buildSessionStructureEvidenceV3,
} from "../../supabase/functions/_shared/ron-session-structure-spec-v3.ts";
import {
  acceptSessionStructureContextV3, PATTERN_CONTEXT_SPEC_V3,
} from "../../supabase/functions/_shared/ron-pattern-structure-context-v3.ts";
import {
  CROSS_ASSET_RELATIONSHIP_SPEC_V3,
} from "../../supabase/functions/_shared/ron-cross-asset-relationship-context-v3.ts";
import {
  MACRO_NEWS_SPEC_V2,
} from "../../supabase/functions/_shared/ron-macro-temporal-context-v2.ts";
import {
  buildHaPatternContextV1,
  type HaSnapshotFeatures, type HaSourceBar,
} from "../../supabase/functions/_shared/ron-ha-pattern-context-spec-v1.ts";
import {
  OPPORTUNITY_CONTEXT_SPEC_V1, OpportunityContextAnchorError,
  buildOpportunityContextV1, opportunityContextSpecHashV1,
  type OpportunityContextInputV1,
} from "../../supabase/functions/_shared/ron-opportunity-context-spec-v1.ts";

const BAR = 15 * 60_000;
const START = Date.parse("2026-08-12T06:00:00Z");
const TRACE = "ron-opportunity-context-v1-fixture";
const SPEC_SRC = "supabase/functions/_shared/ron-opportunity-context-spec-v1.ts";

const anchorOf = (bars: HaSourceBar[]) => bars[bars.length - 1].time + BAR;

/** Accelerating bullish run: expanding bodies, no opposite wick. */
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

/** Fading bullish run: contracting bodies with an emerging opposite wick. */
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

/** Swinging series with genuine pivots — the shape Session V3 needs for structure. */
function swinging(n = 160): HaSourceBar[] {
  const out: HaSourceBar[] = [];
  for (let i = 0; i < n; i++) {
    const base = 2400 + Math.sin(i / 3) * 12 + (i % 7) * 0.4;
    out.push({
      time: START + i * BAR, open: base, high: base + 2.5, low: base - 2.5, close: base + 0.5,
    });
  }
  return out;
}

const FULL_FEATURES: HaSnapshotFeatures = {
  ema9: 2410, ema21: 2400, ema_stack: "up", ema21_slope: 0.4,
  adx14: 28, di_plus: 30, di_minus: 10, macd_state: "bullish_expanding",
  rsi14: 61, rsi14_slope3: 2.4, volatility_regime: "high", regime: "trend",
};

const ha = (
  bars: HaSourceBar[],
  extra: Partial<Parameters<typeof buildHaPatternContextV1>[0]> = {},
) => buildHaPatternContextV1({
  instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars), bars,
  trace_id: TRACE, run_id: "run-opportunity", ...extra,
});

const sealedSession = async (bars: HaSourceBar[], anchor: number) => sealEvidence(
  await buildSessionStructureEvidenceV3({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor,
    bars: bars.map((b) => ({ ...b, created_at: b.time + BAR + 1_000 })),
    isQuarantined: () => false, run_id: "run-session", trace_id: TRACE,
    newest_source_bar: bars[bars.length - 1].time,
  }),
);

/** Minimal, genuinely SEALED contextual envelope for a registered agent. */
async function sealedContext(
  spec: { agent_id: string; agent_version: number },
  anchor: number,
  observations: { key: string; value_text: string }[],
  overrides: Partial<EvidenceEnvelopeV1> = {},
): Promise<EvidenceEnvelopeV1> {
  const at = new Date(anchor).toISOString();
  return sealEvidence({
    schema_version: RON_EVIDENCE_SCHEMA_VERSION,
    agent_id: spec.agent_id as EvidenceEnvelopeV1["agent_id"],
    agent_version: spec.agent_version,
    run_id: "run-context", trace_id: TRACE,
    instrument: "XAUUSD", timeframe: "15m", as_of: at,
    source_timestamps: { evaluation_anchor: at },
    observations: observations.map((o) => ({ ...o, kind: "state" as const, at })),
    provenance_refs: [], data_health: { status: "healthy", issues: [], freshness_minutes: 0, completeness: 1 },
    uncertainty: { level: "unquantified", limitations: [] },
    conflicts: [], dependencies: [], status: "supported",
    recommendation: "context_only",
    ...overrides,
  } as EvidenceEnvelopeV1);
}

const patternEnvelope = (anchor: number, orientations: string[]) => sealedContext(
  PATTERN_CONTEXT_SPEC_V3, anchor,
  orientations.map((o, i) => ({ key: `pattern_0${i + 1}_orientation`, value_text: o })),
);
const crossEnvelope = (anchor: number, state = "evaluated") => sealedContext(
  CROSS_ASSET_RELATIONSHIP_SPEC_V3, anchor,
  [{ key: "cross_asset_relationship_state", value_text: state }],
);
const macroEnvelope = (anchor: number, state = "observed_price_context_present") =>
  sealedContext(
    MACRO_NEWS_SPEC_V2, anchor,
    [{ key: "macro_temporal_context_state", value_text: state }],
  );

async function run(
  bars: HaSourceBar[],
  extra: Partial<OpportunityContextInputV1> = {},
  haExtra: Partial<Parameters<typeof buildHaPatternContextV1>[0]> = { features: FULL_FEATURES },
) {
  return buildOpportunityContextV1({
    instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars),
    ha_context: await ha(bars, haExtra),
    trace_id: TRACE, run_id: "run-opportunity", ...extra,
  });
}

/* ------------------------------------------------------------------ spec */

describe("opportunity context spec V1 is pinned, closed and non-predictive", () => {
  it("hashes to the pinned value", async () => {
    expect(await opportunityContextSpecHashV1())
      .toBe("56e59f3838f71fd9159260e06aaf9f141e0f8235b6ea771c7faa3264c7aba1a5");
  });

  it("declares no probability, forecast, recommendation or execution surface", () => {
    const sc = OPPORTUNITY_CONTEXT_SPEC_V1.safety_contract;
    expect(sc.emits_probability).toBe(false);
    expect(sc.emits_confidence).toBe(false);
    expect(sc.emits_score).toBe(false);
    expect(sc.emits_odds).toBe(false);
    expect(sc.emits_expected_value).toBe(false);
    expect(sc.emits_forecast).toBe(false);
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

  it("is not a registered agent, is not persisted and is not wired into any run plan", () => {
    const r = OPPORTUNITY_CONTEXT_SPEC_V1.registry_status;
    expect(r.registered_ron_agent).toBe(false);
    expect(r.emits_evidence_envelope).toBe(false);
    expect(r.persisted).toBe(false);
    expect(r.wired_into_orchestration_run_version).toBeNull();
    expect(r.notification_channel_bound).toBe(false);
    expect(r.ui_bound).toBe(false);
  });

  it("introduces no numeric threshold constant", () => {
    expect(OPPORTUNITY_CONTEXT_SPEC_V1.reuse_contract.new_numeric_thresholds_introduced).toBe(0);
    const src = readFileSync(SPEC_SRC, "utf8");
    expect(/const\s+\w*(THRESHOLD|TOLERANCE|SCORE|WEIGHT)\w*\s*=/.test(src)).toBe(false);
  });

  it("keeps the single completed-bar-close anchor convention", () => {
    const a = OPPORTUNITY_CONTEXT_SPEC_V1.anchor_contract;
    expect(a.evaluation_anchor_means).toBe("completed_bar_close");
    expect(a.authoritative_analytical_bar_open)
      .toBe("evaluation_anchor_minus_one_bar_exactly");
    expect(a.as_of_equals_evaluation_anchor).toBe(true);
    expect(a.per_agent_anchor_convention).toBe(false);
    expect(a.forming_bar_consumed).toBe(false);
  });

  it("declares Cross-Asset, Macro and Falconer as non-direction authorities", () => {
    const m = OPPORTUNITY_CONTEXT_SPEC_V1.authority_model;
    expect(m.session_structure_v3).toBe("authoritative_structure_input");
    expect(m.cross_asset_v3).toContain("never_direction_authority");
    expect(m.macro_v2).toContain("never_direction");
    expect(m.calibration_v2).toContain("not_consumed");
    expect(m.falconer_signal_source).toContain("not_consumed");
  });
});

/* --------------------------------------------------------- admissibility */

describe("the single completed-bar-close anchor is enforced fail-closed", () => {
  const bars = accelerating(8);

  it("reports as_of === evaluation_anchor with the analytical bar one bar earlier", async () => {
    const r = await run(bars);
    const anchor = anchorOf(bars);
    expect(r.as_of).toBe(new Date(anchor).toISOString());
    expect(r.evaluation_anchor).toBe(r.as_of);
    expect(Date.parse(r.evaluation_anchor) - Date.parse(r.analytical_bar_open)).toBe(BAR);
  });

  it("rejects a non-finite or misaligned anchor", async () => {
    const context = await ha(bars);
    await expect(buildOpportunityContextV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: Number.NaN,
      ha_context: context, trace_id: TRACE, run_id: "r",
    })).rejects.toMatchObject({ reason: "evaluation_anchor_not_finite" });
    await expect(buildOpportunityContextV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars) + 1,
      ha_context: context, trace_id: TRACE, run_id: "r",
    })).rejects.toBeInstanceOf(OpportunityContextAnchorError);
  });

  it("rejects out-of-scope instrument and timeframe", async () => {
    const context = await ha(bars);
    await expect(buildOpportunityContextV1({
      instrument: "EURUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars),
      ha_context: context, trace_id: TRACE, run_id: "r",
    })).rejects.toMatchObject({ reason: "instrument_out_of_scope" });
    await expect(buildOpportunityContextV1({
      instrument: "XAUUSD", timeframe: "1H", evaluation_anchor: anchorOf(bars),
      ha_context: context, trace_id: TRACE, run_id: "r",
    })).rejects.toMatchObject({ reason: "timeframe_out_of_scope" });
  });

  it("rejects an HA context bound to a different anchor or a different trace", async () => {
    const other = accelerating(9);
    await expect(buildOpportunityContextV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars),
      ha_context: await ha(other), trace_id: TRACE, run_id: "r",
    })).rejects.toMatchObject({ reason: "ha_context_anchor_mismatch" });
    await expect(buildOpportunityContextV1({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchorOf(bars),
      ha_context: await ha(bars, { trace_id: "other-trace" }), trace_id: TRACE, run_id: "r",
    })).rejects.toMatchObject({ reason: "ha_context_scope_mismatch" });
  });
});

/* ---------------------------------------------------------- context intake */

describe("sealed contextual evidence is accepted or rejected verbatim", () => {
  const bars = swinging(160);

  it("reports every context as unavailable when nothing is supplied", async () => {
    const r = await run(bars);
    for (const key of Object.keys(r.context_admissibility)) {
      expect(r.context_admissibility[key].available).toBe(false);
    }
    expect(r.pattern_context_state).toBe("unavailable");
    expect(r.cross_asset_context_state).toBe("unavailable");
    expect(r.macro_context_state).toBe("unavailable");
  });

  it("consumes accepted Session V3 structure verbatim and never recomputes it", async () => {
    const anchor = anchorOf(bars);
    const sealed = await sealedSession(bars, anchor);
    const ctx = await acceptSessionStructureContextV3(sealed, {
      trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor,
    });
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("unreachable");
    const r = await run(bars, { session_evidence: sealed });
    expect(r.context_admissibility.session_structure_v3.available).toBe(true);
    expect(r.observations.some((o) =>
      o.key === "opportunity_session_structure_state_consumed"
      && o.value_text === ctx.structure_state)).toBe(true);
    expect(r.observations.some((o) =>
      o.key === "opportunity_session_structure_event_consumed"
      && o.value_text === ctx.structure_event)).toBe(true);
  });

  it("rejects an unsealed, retraced or wrongly anchored contextual envelope", async () => {
    const anchor = anchorOf(bars);
    const good = await crossEnvelope(anchor);
    const unsealed = { ...good, evidence_hash: undefined };
    const tampered = { ...good, run_id: "tampered" };
    const wrongAnchor = await crossEnvelope(anchor - BAR);
    const cases: [unknown, string][] = [
      [unsealed, "context_unsealed"],
      [tampered, "context_hash_mismatch"],
      [wrongAnchor, "context_anchor_mismatch"],
      [{ nonsense: true }, "context_wrong_agent"],
      [await patternEnvelope(anchor, ["bullish"]), "context_wrong_agent"],
    ];
    for (const [evidence, reason] of cases) {
      const r = await run(bars, { cross_asset_evidence: evidence });
      expect(r.context_admissibility.cross_asset_v3.rejection_reason).toBe(reason);
      expect(r.data_state).toBe("blocked");
    }
  });

  it("treats an inadmissible supplied context as a DATA condition, never invalidation", async () => {
    const r = await run(accelerating(8), {
      cross_asset_evidence: { nonsense: true },
      prior_state: "confirmed", prior_direction_context: "bullish",
    });
    expect(r.data_state).toBe("blocked");
    expect(r.data_blocked).toBe(true);
    expect(r.lifecycle).toBe("none");
    expect(r.lifecycle).not.toBe("invalidated");
    expect(r.material_change_type).toBe("data_blocked");
    expect(r.direction_context).toBe("unavailable");
  });

  it("degrades honestly when an admissible envelope reports degraded source health", async () => {
    const anchor = anchorOf(bars);
    const degraded = await sealedContext(
      CROSS_ASSET_RELATIONSHIP_SPEC_V3, anchor,
      [{ key: "cross_asset_relationship_state", value_text: "evaluated" }],
      { data_health: { status: "degraded", issues: ["fixture"], freshness_minutes: 0, completeness: 1 } },
    );
    const r = await run(bars, { cross_asset_evidence: degraded });
    expect(r.context_admissibility.cross_asset_v3.available).toBe(true);
    expect(r.data_state).toBe("degraded");
  });
});

/* -------------------------------------------------------------- direction */

describe("direction authority is Session V3 — never Cross-Asset, Macro or Falconer", () => {
  it("is HA-only contextual with no Session evidence, and caps below confirmed", async () => {
    const r = await run(accelerating(8));
    expect(r.direction_context).toBe("bullish");
    expect(r.direction_authority).toBe("ha_only_contextual");
    expect(r.lifecycle).not.toBe("confirmed");
    expect(r.limitations.join(" ")).toContain("capped below `confirmed`");
  });

  it("is neutral when the HA sequence alternates", async () => {
    const r = await run(zigzag(8));
    expect(r.direction_context).toBe("neutral");
    expect(r.direction_authority).toBe("none");
    expect(r.setup_family).toBe("mixed_or_none");
    expect(r.lifecycle).toBe("none");
  });

  it("cross-asset evidence alone can neither create direction nor confirm", async () => {
    const bars = zigzag(8);
    const anchor = anchorOf(bars);
    const r = await run(bars, { cross_asset_evidence: await crossEnvelope(anchor) });
    expect(r.cross_asset_context_state).toBe("neutral");
    expect(r.direction_context).toBe("neutral");
    expect(r.lifecycle).toBe("none");
    expect(r.limitations.join(" ")).toContain("can never create a direction");
  });

  it("macro evidence is adjacency only and can never promote to confirmed", async () => {
    const bars = accelerating(8);
    const anchor = anchorOf(bars);
    const r = await run(bars, { macro_evidence: await macroEnvelope(anchor) });
    expect(r.macro_context_state).toBe("relevant");
    expect(r.lifecycle).not.toBe("confirmed");
    expect(r.limitations.join(" ")).toContain("never a causal claim");
    const quiet = await run(bars, {
      macro_evidence: await macroEnvelope(anchor, "unavailable_insufficient_reference_bars"),
    });
    expect(quiet.macro_context_state).toBe("neutral");
    const unsupported = await run(bars, {
      macro_evidence: await macroEnvelope(
        anchor, "unavailable_base_news_evidence_not_supported"),
    });
    expect(unsupported.macro_context_state).toBe("unavailable");
  });

  it("reports mixed when authoritative structure opposes the HA direction", async () => {
    const bars = swinging(160);
    const anchor = anchorOf(bars);
    const sealed = await sealedSession(bars, anchor);
    const ctx = await acceptSessionStructureContextV3(sealed, {
      trace_id: TRACE, instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: anchor,
    });
    if (!ctx.ok) throw new Error("session fixture must be accepted");
    const r = await run(bars, { session_evidence: sealed });
    const haCtx = await ha(bars, { features: FULL_FEATURES, session_evidence: sealed });
    const dir = haCtx.states.trend_sequence;
    if ((ctx.structure_state === "up_structure" && dir === "bearish")
      || (ctx.structure_state === "down_structure" && dir === "bullish")) {
      expect(r.direction_context).toBe("mixed");
      expect(r.direction_authority).toBe("conflicted");
    } else if ((ctx.structure_state === "up_structure" && dir === "bullish")
      || (ctx.structure_state === "down_structure" && dir === "bearish")) {
      expect(r.direction_authority).toBe("session_aligned");
    } else {
      expect(["session_event_relevant", "ha_only_contextual", "none"])
        .toContain(r.direction_authority);
    }
  });

  it("pattern context is supportive or disagreeing relative to the direction", async () => {
    const bars = accelerating(8);
    const anchor = anchorOf(bars);
    const supportive = await run(bars, {
      pattern_evidence: await patternEnvelope(anchor, ["bullish", "bullish"]),
    });
    expect(supportive.pattern_context_state).toBe("supportive");
    const disagreeing = await run(bars, {
      pattern_evidence: await patternEnvelope(anchor, ["bearish"]),
    });
    expect(disagreeing.pattern_context_state).toBe("disagreeing");
    const mixed = await run(bars, {
      pattern_evidence: await patternEnvelope(anchor, ["bullish", "bearish"]),
    });
    expect(mixed.pattern_context_state).toBe("neutral");
  });
});

/* ------------------------------------------------------------ multi-family */

describe("no single indicator event can create an opportunity", () => {
  it("returns none for a lone HA colour flip with no other agreeing family", async () => {
    const flip = fading(8);
    const last = flip[flip.length - 1];
    flip[flip.length - 1] = {
      ...last, open: last.open, close: last.open - 80, high: last.open + 1, low: last.open - 90,
    };
    const r = await run(flip, {}, {
      features: { volatility_regime: "normal" },
    });
    expect(r.setup_family).toBe("mixed_or_none");
    expect(r.lifecycle).toBe("none");
  });

  it("returns none for a lone EMA cross with no HA direction", async () => {
    const r = await run(zigzag(8), {}, {
      features: { ema9: 2410, ema21: 2400, ema_stack: "up" },
      prior_features: { ema9: 2395, ema21: 2400 },
    });
    expect(r.direction_context).toBe("neutral");
    expect(r.setup_family).toBe("mixed_or_none");
    expect(r.lifecycle).toBe("none");
  });

  it("reaches at least watch/forming only with two independent agreeing families", async () => {
    const r = await run(accelerating(8), {}, {
      features: { ema9: 2410, ema21: 2400, ema_stack: "up" },
    });
    expect(r.setup_family).toBe("ha_trend_continuation");
    expect(["watch", "forming", "strengthening"]).toContain(r.lifecycle);
  });
});

/* -------------------------------------------------------------- lifecycle */

describe("the lifecycle table is ordered, transparent and conservative", () => {
  it("lets deterioration dominate strengthening evidence", async () => {
    const r = await run(fading(8));
    expect(r.lifecycle).toBe("weakening");
  });

  it("invalidates a prior directional opportunity on an authoritative conflict", async () => {
    const flip = fading(8);
    const last = flip[flip.length - 1];
    flip[flip.length - 1] = {
      ...last, open: last.open, close: last.open - 80, high: last.open + 1, low: last.open - 90,
    };
    const r = await run(flip, {
      prior_state: "confirmed", prior_direction_context: "bullish",
    }, {
      features: { ...FULL_FEATURES, ema9: 2395, ema21: 2400, ema_stack: "down" },
    });
    expect(r.lifecycle).toBe("invalidated");
    expect(r.material_change_type).toBe("invalidated");
    const withoutPrior = await run(flip, {}, {
      features: { ...FULL_FEATURES, ema9: 2395, ema21: 2400, ema_stack: "down" },
    });
    expect(withoutPrior.lifecycle).not.toBe("invalidated");
  });

  it("reports a direction reversal as a material change", async () => {
    const r = await run(accelerating(8), {
      prior_state: "forming", prior_direction_context: "bearish",
    });
    expect(r.direction_context).toBe("bullish");
    expect(r.material_change_type).toBe("direction_reversal");
  });

  it("emits only declared vocabulary for every emitted family", async () => {
    const v = OPPORTUNITY_CONTEXT_SPEC_V1.vocabularies as Record<string, readonly string[]>;
    const anchor = anchorOf(accelerating(8));
    const variants = [
      await run(accelerating(8)),
      await run(fading(8)),
      await run(zigzag(8)),
      await run(accelerating(8), { macro_evidence: await macroEnvelope(anchor) }),
      await run(accelerating(8), { cross_asset_evidence: await crossEnvelope(anchor) }),
      await run(accelerating(8), { cross_asset_evidence: { bad: true } }),
      await run(swinging(160), {
        session_evidence: await sealedSession(swinging(160), anchorOf(swinging(160))),
      }),
    ];
    for (const r of variants) {
      expect(v.direction_context).toContain(r.direction_context);
      expect(v.direction_authority).toContain(r.direction_authority);
      expect(v.setup_family).toContain(r.setup_family);
      expect(v.lifecycle).toContain(r.lifecycle);
      expect(v.material_change_type).toContain(r.material_change_type);
      expect(v.data_state).toContain(r.data_state);
      expect(v.pattern_context_state).toContain(r.pattern_context_state);
      expect(v.cross_asset_context_state).toContain(r.cross_asset_context_state);
      expect(v.macro_context_state).toContain(r.macro_context_state);
    }
  });

  it("emits a reason token for every categorical decision and mirrors it", async () => {
    const r = await run(accelerating(8));
    for (const family of [
      "data_state", "direction_context", "pattern_context_state",
      "cross_asset_context_state", "macro_context_state", "setup_family",
      "lifecycle", "material_change_type",
    ]) {
      expect(r.reason_tokens.some((t) => t.startsWith(`${family}:`))).toBe(true);
    }
    for (const token of r.reason_tokens) {
      expect(r.observations.some(
        (o) => o.key === "opportunity_reason_token" && o.value_text === token)).toBe(true);
    }
  });
});

/* -------------------------------------------------- purity and determinism */

describe("the producer is pure, deterministic and non-predictive", () => {
  it("produces identical output for identical input", async () => {
    const bars = accelerating(20);
    const a = await run(bars);
    const b = await run(bars);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("never emits a probability, score, forecast or execution field", async () => {
    const r = await run(accelerating(20));
    expect(r.numeric_probability).toBeNull();
    expect(r.execution_allowed).toBe(false);
    expect(r.execution_path).toBe("signal_only");
    const emitted = JSON.stringify({
      direction_context: r.direction_context, setup_family: r.setup_family,
      lifecycle: r.lifecycle, material_change_type: r.material_change_type,
      observations: r.observations,
    }).toLowerCase();
    for (const banned of [
      "probability", "confidence", "expected_value", "odds", "forecast", "predict",
      "recommend", "entry_price", "stop_loss", "take_profit", "win_rate", "edge_",
    ]) {
      expect(emitted.includes(banned)).toBe(false);
    }
  });

  it("emits no evidence envelope surface and no agent identity", async () => {
    const r = await run(accelerating(8)) as unknown as Record<string, unknown>;
    for (const key of ["agent_id", "agent_version", "evidence_hash", "schema_version"]) {
      expect(r[key]).toBeUndefined();
    }
  });

  it("does not read the database, the network or the wall clock", () => {
    const src = readFileSync(SPEC_SRC, "utf8");
    for (const banned of [
      "createClient(", "await fetch", "Date.now(", "Math.random(", "Deno.env",
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it("states its own limitations explicitly", async () => {
    const r = await run(accelerating(20));
    expect(r.limitations.length).toBeGreaterThanOrEqual(4);
    expect(r.limitations.join(" ")).toContain("not a probability");
  });
});
