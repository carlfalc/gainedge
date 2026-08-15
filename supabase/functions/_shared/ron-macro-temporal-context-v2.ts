/**
 * RON — MACRO / NEWS / GEOPOLITICS SPECIALIST spec V2 (pure producer, forward-only).
 *
 * V1 (`ron-macro-news-geopolitics-spec.ts`) is FROZEN byte-for-byte: its spec hash is
 * pinned by accepted tests and by any replayed V1 evidence. This module ADDS a second,
 * separately hashed spec version that reuses V1's source contract, window, cap, row
 * canonicalisation and frozen headline taxonomy UNCHANGED, and attaches ONE new class of
 * fact: DETERMINISTIC OBSERVED TEMPORAL XAU PRICE CONTEXT around genuine article
 * publication instants.
 *
 * agent_id (`macro_news_geopolitics`) and agent_version (1) are UNCHANGED. Only
 * `spec_version` / spec hash in provenance distinguishes V1 from V2.
 *
 * HARD CONTRACT — this is still NOT a model, NOT a forecast and NOT an impact estimator:
 *   - the emitted change is OBSERVED TEMPORAL PRICE CONTEXT ONLY. Temporal adjacency
 *     between an article timestamp and a price change is explicitly NOT causation, NOT
 *     impact, NOT reaction, NOT an effect size, NOT an edge and NOT a signal,
 *   - no probability, confidence, expected value, significance, threshold, rating, score,
 *     trade direction, target or execution control exists anywhere,
 *   - envelope `direction` stays `neutral` / `unknown` exactly as in V1,
 *   - `ai_reason_short`, `sentiment_direction` and `news_impact_results` are never read,
 *   - ingestion `impact` is never used as a weight or authority.
 *
 * DATA CONTRACT (fail closed):
 *   - genuine broker-native `candle_history` XAUUSD 15m rows only, accepted qv5 quality
 *     gating and ACCEPTED Session & Market Structure Spec V2 slot classification,
 *   - COMPLETED bars only; a bar counts only if its close instant is at-or-before the
 *     explicit evaluation anchor, so no future bar can ever influence evidence,
 *   - no interpolation, nearest-match, resampling, forward-fill or synthetic bars,
 *   - quality-critical and unexpected-missing slots are NEVER bridged: if such a defect
 *     lies between two references, the context is reported unavailable, not computed,
 *   - expected venue closures are NOT defects and never degrade health,
 *   - where no honest before/after reference exists, an explicit unavailable state is
 *     emitted — never a fabricated zero.
 *
 * NO NEW METHODOLOGY CONSTANT IS INTRODUCED: the lookback is V1's existing source window,
 * the item count is V1's existing bounded latest-item count, and the only time boundary is
 * the caller's explicit evaluation anchor. There is no invented reaction horizon.
 */
import {
  type EvidenceEnvelopeV1, type Observation, hashCanonical,
} from "./ron-agent-contracts.ts";
import { RON_QUALITY_VERSION } from "./ron-data-quality.ts";
import {
  classifySlots, expectedOpenSlot, SESSION_STRUCTURE_SPEC_V2, type Slot, type SlotClass,
} from "./ron-session-structure-spec-v2.ts";
import type { StructureBar } from "./ron-session-structure-spec.ts";
import {
  buildMacroNewsEvidenceV1, canonicalNewsRows, classifyHeadline,
  MACRO_NEWS_LATEST_SUMMARY_COUNT, MACRO_NEWS_MAX_ROWS, MACRO_NEWS_SPEC_V1,
  MACRO_NEWS_WINDOW_MINUTES, MacroNewsSourceConflictError,
  type MacroNewsInputV1, type MacroNewsRow,
} from "./ron-macro-news-geopolitics-spec.ts";

/** FULL accepted Session & Market Structure Spec V2 hash (classification dependency). */
export const SESSION_STRUCTURE_SPEC_V2_HASH_PINNED =
  "9d104c60d828c5a4c9fe07859bc40c966c00b5bd5ba496f6ff06291a9b5d435b";

/**
 * Bar width is NOT redeclared here: it is DERIVED from the accepted Session & Market
 * Structure Spec V2 that performs the slot classification, so V2 can never drift from
 * its own classification dependency.
 */
export const MACRO_TEMPORAL_BAR_MINUTES = SESSION_STRUCTURE_SPEC_V2.bar_minutes;
const BAR_MS = MACRO_TEMPORAL_BAR_MINUTES * 60_000;

export type MacroPriceContextStatus =
  | "available"
  | "unavailable_no_pre_publication_admissible_bar"
  | "unavailable_no_post_publication_admissible_bar_at_anchor"
  | "unavailable_source_defect_between_references";

export const MACRO_NEWS_SPEC_V2 = {
  spec_id: "ron_macro_news_geopolitics",
  spec_version: 2,
  agent_id: "macro_news_geopolitics",
  agent_version: 1,
  authority_class: "contextual",
  authority_rank: 4,
  source_health_authoritative: false,
  ttl_multiplier: 4,

  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],
  bar_minutes: MACRO_TEMPORAL_BAR_MINUTES,
  bar_minutes_source: "session_structure_spec_v2.bar_minutes",

  inherits: {
    from_spec_version: 1,
    news_source_contract_unchanged: true,
    window_minutes: MACRO_NEWS_WINDOW_MINUTES,
    max_rows: MACRO_NEWS_MAX_ROWS,
    latest_item_count: MACRO_NEWS_LATEST_SUMMARY_COUNT,
    taxonomy_unchanged: true,
    v1_replayable_by_spec_version_1: true,
  },

  news_source_contract: MACRO_NEWS_SPEC_V1.source_contract,
  ingestion_metadata_contract: MACRO_NEWS_SPEC_V1.ingestion_metadata_contract,
  taxonomy_contract: MACRO_NEWS_SPEC_V1.taxonomy_contract,
  clustering_contract: MACRO_NEWS_SPEC_V1.clustering_contract,

  price_context_contract: {
    source: "candle_history_native",
    symbol_scope: ["XAUUSD"],
    quality_version: RON_QUALITY_VERSION,
    classification_spec_id: SESSION_STRUCTURE_SPEC_V2.spec_id,
    classification_spec_version: SESSION_STRUCTURE_SPEC_V2.spec_version,
    classification_spec_hash: SESSION_STRUCTURE_SPEC_V2_HASH_PINNED,
    completed_bars_only: true,
    incomplete_current_bar_admitted: false,
    bar_admitted_only_if_close_at_or_before_evaluation_anchor: true,
    lookahead: "none",
    interpolation_allowed: false,
    nearest_match_allowed: false,
    resampling_allowed: false,
    forward_fill_allowed: false,
    synthetic_bars_allowed: false,
    quality_critical_defect_bridging_allowed: false,
    unexpected_missing_defect_bridging_allowed: false,
    expected_closure_is_a_defect: false,
    lookback_source: "inherited_v1_news_window_minutes",
    reaction_horizon_invented: false,
    references: [
      "pre_publication_reference_close",
      "first_post_publication_close",
      "anchor_reference_close",
    ],
    unavailable_states: [
      "unavailable_no_pre_publication_admissible_bar",
      "unavailable_no_post_publication_admissible_bar_at_anchor",
      "unavailable_source_defect_between_references",
    ],
    fabricated_zero_change_allowed: false,
  },

  base_evidence_contract: {
    /** V2 never re-interprets why V1 failed; it copies V1's own status verbatim. */
    base_status_preserved_verbatim: true,
    base_status_observation_key: "macro_base_news_evidence_status",
    not_supported_state: "unavailable_base_news_evidence_not_supported",
    infers_no_source_items_from_unsupported_base: false,
  },

  semantics_contract: {
    emitted_quantity: "observed_temporal_price_context",
    temporal_adjacency_is_causation: false,
    impact_emitted: false,
    reaction_emitted: false,
    effect_size_emitted: false,
    forecast_emitted: false,
    signal_emitted: false,
  },

  safety_contract: {
    ...MACRO_NEWS_SPEC_V1.safety_contract,
    persistence_in_this_phase: false,
  },
} as const;

export function macroNewsSpecHashV2(): Promise<string> {
  return hashCanonical(MACRO_NEWS_SPEC_V2);
}

const iso = (ms: number) => new Date(ms).toISOString();
const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });

/** Open of the newest bar whose COMPLETED close is at-or-before `anchor`. */
export function lastCompletedBarOpen(anchor: number): number {
  return Math.floor((anchor - BAR_MS) / BAR_MS) * BAR_MS;
}

export interface MacroTemporalContextInputV2 extends MacroNewsInputV1 {
  /** genuine broker-native XAUUSD 15m rows covering the inherited news window. */
  bars: StructureBar[];
  isQuarantined: (bar: { time: number; created_at?: number | null }, barMinutes: number) => boolean;
  newest_source_bar?: number;
}

interface Refs {
  status: MacroPriceContextStatus;
  pre: StructureBar | null;
  post: StructureBar | null;
  anchorRef: StructureBar | null;
  barsAfter: number;
}

/**
 * Pure reference resolution for ONE publication instant against classified slots.
 * Every reference is a COMPLETED admissible bar; defects are never bridged.
 */
export function resolvePriceContext(
  slots: readonly Slot[], published_at: number, anchor: number,
): Refs {
  const usable = slots.filter((s) => s.time + BAR_MS <= anchor);
  const admissible = usable.filter((s) => s.cls === "admissible" && s.bar);

  const preSlot = [...admissible].reverse().find((s) => s.time + BAR_MS <= published_at) ?? null;
  const postSlot = admissible.find((s) => s.time + BAR_MS > published_at) ?? null;
  const anchorSlot = admissible.length ? admissible[admissible.length - 1] : null;
  const barsAfter = admissible.filter((s) => s.time + BAR_MS > published_at).length;

  if (!preSlot) {
    return { status: "unavailable_no_pre_publication_admissible_bar", pre: null, post: null, anchorRef: null, barsAfter };
  }
  if (!postSlot) {
    return { status: "unavailable_no_post_publication_admissible_bar_at_anchor", pre: preSlot.bar, post: null, anchorRef: null, barsAfter };
  }
  const between = usable.filter((s) => s.time > preSlot.time && s.time <= (anchorSlot?.time ?? postSlot.time));
  const defect = between.some((s) => s.cls === "quality_critical" || s.cls === "unexpected_missing");
  if (defect) {
    return { status: "unavailable_source_defect_between_references", pre: null, post: null, anchorRef: null, barsAfter };
  }
  return { status: "available", pre: preSlot.bar, post: postSlot.bar, anchorRef: anchorSlot?.bar ?? null, barsAfter };
}

/**
 * V2 producer. Builds the frozen V1 news evidence first (identical semantics), then
 * attaches observed temporal price context. V1 output is never mutated.
 */
export async function buildMacroTemporalContextEvidenceV2(
  input: MacroTemporalContextInputV2,
): Promise<EvidenceEnvelopeV1> {
  const base = await buildMacroNewsEvidenceV1({
    instrument: input.instrument, timeframe: input.timeframe,
    evaluation_anchor: input.evaluation_anchor, items: input.items,
    run_id: input.run_id, trace_id: input.trace_id,
  });
  const spec_hash = await macroNewsSpecHashV2();
  const anchor = input.evaluation_anchor;

  const observations: Observation[] = [...base.observations];
  const limitations: string[] = [
    ...base.uncertainty.limitations,
    "observed temporal price context only: the change between two completed bar closes around an article timestamp is temporal adjacency, explicitly NOT causation, NOT impact and NOT a reaction",
    "no reaction horizon is invented: references are the completed bars adjacent to the genuine publication instant and to the explicit evaluation anchor",
    "quality-critical and unexpected-missing source defects are never bridged; expected venue closures are not defects",
  ];
  const issues: string[] = [...base.data_health.issues];
  const provenance_refs: string[] = [
    `spec:${MACRO_NEWS_SPEC_V2.spec_id}:v${MACRO_NEWS_SPEC_V2.spec_version}:${spec_hash}`,
    `quality_version:${RON_QUALITY_VERSION}`,
    `classification:${SESSION_STRUCTURE_SPEC_V2.spec_id}:v${SESSION_STRUCTURE_SPEC_V2.spec_version}:${SESSION_STRUCTURE_SPEC_V2_HASH_PINNED}`,
    `price_source:candle_history_native:${input.instrument}:${input.timeframe}`,
    ...base.provenance_refs,
  ];
  const dependencies = [
    ...base.dependencies,
    `quality_contract_v${RON_QUALITY_VERSION}`,
    `session_structure_spec_v${SESSION_STRUCTURE_SPEC_V2.spec_version}`,
  ];
  const source_timestamps: Record<string, string> = { ...base.source_timestamps };

  const out = (
    healthStatus: "healthy" | "degraded" | "critical",
    completeness: number,
  ): EvidenceEnvelopeV1 => ({
    ...base,
    observations,
    provenance_refs,
    dependencies,
    source_timestamps,
    uncertainty: { level: "unquantified", limitations },
    data_health: {
      status: healthStatus,
      freshness_minutes: base.data_health.freshness_minutes,
      completeness,
      issues,
    },
  });

  observations.push(state("macro_price_context_source", "candle_history_native", iso(anchor)));

  if (base.status !== "supported") {
    // Truthful fail-closed: V2 does NOT know WHY V1 was not supported (no in-window
    // rows, conflicting duplicate source row ids, ...). The base status is copied
    // verbatim and the temporal-context state stays generic.
    observations.push(
      state("macro_base_news_evidence_status", base.status, iso(anchor)),
      state("macro_temporal_context_state", "unavailable_base_news_evidence_not_supported", iso(anchor)),
    );
    return out(base.data_health.status, base.data_health.completeness);
  }

  // ---- classified slot grid over the inherited V1 news window, completed bars only.
  const gridEnd = lastCompletedBarOpen(anchor);
  const gridStart = Math.floor((anchor - MACRO_NEWS_WINDOW_MINUTES * 60_000) / BAR_MS) * BAR_MS;
  const bars = (input.bars ?? []).filter((b) => b && Number.isFinite(b.time) && b.time + BAR_MS <= anchor);
  const slots: Slot[] = gridEnd < gridStart
    ? []
    : classifySlots(gridStart, gridEnd, bars, input.isQuarantined);

  const count = (c: SlotClass) => slots.filter((s) => s.cls === c).length;
  const admissible_slots = count("admissible");
  const quality_critical_slots = count("quality_critical");
  const unexpected_missing_slots = count("unexpected_missing");
  const expected_closed_slots = count("expected_closed");
  const expected_open_slots = admissible_slots + quality_critical_slots + unexpected_missing_slots;
  const completeness = expected_open_slots === 0 ? base.data_health.completeness
    : admissible_slots / expected_open_slots;

  observations.push(
    num("price_context_admissible_slots", admissible_slots, iso(anchor), "slots"),
    num("price_context_quality_critical_slots", quality_critical_slots, iso(anchor), "slots"),
    num("price_context_unexpected_missing_slots", unexpected_missing_slots, iso(anchor), "slots"),
    num("price_context_expected_closed_slots", expected_closed_slots, iso(anchor), "slots"),
    state("price_context_venue_state", expectedOpenSlot(gridEnd) ? "venue_open" : "venue_closed", iso(anchor)),
  );

  let healthStatus = base.data_health.status;
  if (quality_critical_slots > 0) {
    healthStatus = healthStatus === "critical" ? "critical" : "degraded";
    issues.push(`price_context_quality_critical_bars_excluded:${quality_critical_slots}`);
  }
  if (unexpected_missing_slots > 0) {
    healthStatus = healthStatus === "critical" ? "critical" : "degraded";
    issues.push(`price_context_unexpected_missing_expected_open_slots:${unexpected_missing_slots}`);
  }

  if (!admissible_slots) {
    observations.push(state("macro_temporal_context_state", "unavailable_no_admissible_completed_bars", iso(anchor)));
    return out(healthStatus, completeness);
  }

  const lastAdmissible = [...slots].reverse().find((s) => s.cls === "admissible" && s.bar) ?? null;
  if (lastAdmissible?.bar) {
    source_timestamps.price_context_anchor_reference_bar_open = iso(lastAdmissible.time);
    source_timestamps.price_context_anchor_reference_bar_completed_close = iso(lastAdmissible.time + BAR_MS);
    observations.push(num("anchor_reference_close", lastAdmissible.bar.close, iso(lastAdmissible.time + BAR_MS)));
  }

  // ---- bounded newest items, in exactly the V1 latest-item order.
  const canonical = canonicalNewsRows(input.items).rows
    .filter((r) => r.published_at <= anchor && r.published_at >= anchor - MACRO_NEWS_WINDOW_MINUTES * 60_000);
  const admitted = canonical.length > MACRO_NEWS_MAX_ROWS
    ? canonical.slice(canonical.length - MACRO_NEWS_MAX_ROWS) : canonical;
  const latest: MacroNewsRow[] = admitted
    .slice(Math.max(0, admitted.length - MACRO_NEWS_LATEST_SUMMARY_COUNT)).reverse();

  let available = 0;
  latest.forEach((r, i) => {
    const at = iso(r.published_at);
    const n = i + 1;
    const refs = resolvePriceContext(slots, r.published_at, anchor);
    observations.push(
      state(`latest_item_${n}_publication_instant`, at, at),
      state(`latest_item_${n}_price_context_status`, refs.status, iso(anchor)),
      num(`latest_item_${n}_admissible_bars_observed_after_publication`, refs.barsAfter, iso(anchor), "bars"),
    );
    if (refs.status !== "available" || !refs.pre || !refs.post) return;
    available++;
    observations.push(
      num(`latest_item_${n}_pre_publication_reference_close`, refs.pre.close, iso(refs.pre.time + BAR_MS)),
      num(`latest_item_${n}_first_post_publication_close`, refs.post.close, iso(refs.post.time + BAR_MS)),
      num(`latest_item_${n}_observed_change_to_first_post_publication_close`,
        refs.post.close - refs.pre.close, iso(refs.post.time + BAR_MS)),
    );
    if (refs.anchorRef) {
      observations.push(
        num(`latest_item_${n}_observed_change_to_anchor_reference_close`,
          refs.anchorRef.close - refs.pre.close, iso(refs.anchorRef.time + BAR_MS)),
      );
    }
    // frozen V1 topic tags travel with the temporal context, unchanged.
    observations.push(
      state(`latest_item_${n}_price_context_topic_tags`, classifyHeadline(r.headline).join(","), at),
    );
  });

  observations.push(
    num("latest_items_with_price_context", available, iso(anchor), "items"),
    state("macro_temporal_context_state",
      available > 0 ? "observed_price_context_present" : "unavailable_insufficient_reference_bars",
      iso(anchor)),
  );

  return out(healthStatus, completeness);
}

export { MacroNewsSourceConflictError };
