/**
 * RON Phase 2D.2h — MACRO / NEWS / GEOPOLITICS SPECIALIST spec V1 (pure producer).
 *
 * Fifth genuine specialist producer. It reports, deterministically and without inference,
 * WHAT MACRO / NEWS / GEOPOLITICAL SOURCE RECORDS EXISTED in `news_items` before an
 * explicit evaluation anchor.
 *
 * HARD CONTRACT — this is NOT a model, NOT a sentiment engine and NOT a forecast:
 *   - no prediction, no causal attribution between an article and any price move,
 *   - no sentiment, no surprise magnitude (the source carries no accepted actual/forecast),
 *   - no confidence, no probability, no expected value, no importance/credibility score,
 *   - no trade direction, no target, no threshold labels,
 *   - `ai_reason_short` and `sentiment_direction` are NEVER read: they are model output,
 *     not accepted factual evidence,
 *   - `news_impact_results` is LEGACY and entirely out of scope,
 *   - `impact` and `instruments_affected` are RAW INGESTION METADATA only; surfacing them
 *     is explicitly labelled and they never become a weight, authority or claim,
 *   - envelope `direction` is `neutral` (supported) or `unknown` (not supported), so this
 *     contextual specialist can never create a binding directional conflict in
 *     Orchestrator V1 while ZERO state variables are promoted,
 *   - recommendation is always `context_only` or `no_action`.
 *
 * Topic tags are a FROZEN DETERMINISTIC HEADLINE KEYWORD TAXONOMY. They describe the
 * article's wording, not the truth of the world and not an impact class. There is no LLM
 * and no embedding anywhere in V1.
 */
import {
  hashCanonical, type EvidenceEnvelopeV1, type EvidenceStatus, type Observation,
  type QualitativeDirection, type RecommendationV1,
} from "./ron-agent-contracts.ts";

/** Retrospective source window, in minutes, ending AT the explicit evaluation anchor. */
export const MACRO_NEWS_WINDOW_MINUTES = 12 * 60;
/** Maximum source rows admitted into the pure producer, newest-first inside the window. */
export const MACRO_NEWS_MAX_ROWS = 100;
/** Bounded number of newest included items summarised in observations. */
export const MACRO_NEWS_LATEST_SUMMARY_COUNT = 5;
/** Maximum retained headline characters in an observation value. */
export const MACRO_NEWS_HEADLINE_MAX_CHARS = 180;

export type MacroTopicCategory =
  | "central_bank_rates"
  | "inflation_prices"
  | "labor_employment"
  | "fiscal_trade_tariffs"
  | "geopolitics_conflict_sanctions"
  | "energy_supply"
  | "commodity_supply_demand"
  | "yields_usd"
  | "risk_markets"
  | "other_macro";

/**
 * FROZEN keyword rules. Matching is: lowercase the headline, plain substring test.
 * `other_macro` is the deterministic fallback and has NO keywords by construction.
 */
export const MACRO_TOPIC_KEYWORDS_V1: Readonly<Record<MacroTopicCategory, readonly string[]>> = {
  central_bank_rates: [
    "fed", "fomc", "ecb", "boe", "boj", "snb", "rba", "rbnz", "central bank",
    "interest rate", "rate cut", "rate hike", "monetary policy", "jackson hole",
    "powell", "lagarde", "basis point", "bps", "policy meeting", "hawkish", "dovish",
  ],
  inflation_prices: [
    "inflation", "cpi", "ppi", "pce", "price index", "deflation", "disinflation",
    "core prices", "consumer prices", "producer prices",
  ],
  labor_employment: [
    "payroll", "nonfarm", "non-farm", "unemployment", "jobless", "employment",
    "labor market", "labour market", "wage", "hiring", "layoff",
  ],
  fiscal_trade_tariffs: [
    "tariff", "trade deal", "trade war", "budget", "fiscal", "deficit",
    "debt ceiling", "stimulus", "import duty", "export control", "trade balance",
  ],
  geopolitics_conflict_sanctions: [
    "war", "conflict", "sanction", "military", "missile", "invasion", "ceasefire",
    "nato", "iran", "russia", "ukraine", "israel", "gaza", "north korea", "coup",
    "terror", "airstrike",
  ],
  energy_supply: [
    "oil", "opec", "crude", "brent", "wti", "natural gas", "lng", "pipeline",
    "refinery", "energy", "barrel",
  ],
  commodity_supply_demand: [
    "gold", "silver", "copper", "bullion", "mining", "commodity", "metals",
    "wheat", "harvest", "supply chain", "inventories",
  ],
  yields_usd: [
    "yield", "treasury", "bond", "dollar", "dxy", "greenback", "10-year", "2-year",
    "yield curve",
  ],
  risk_markets: [
    "stock market", "stocks", "equities", "wall street", "nasdaq", "s&p", "dow",
    "shares", "selloff", "sell-off", "risk appetite", "volatility", "vix",
  ],
  other_macro: [],
};

export const MACRO_TOPIC_CATEGORIES: readonly MacroTopicCategory[] =
  Object.keys(MACRO_TOPIC_KEYWORDS_V1) as MacroTopicCategory[];

export const MACRO_NEWS_SPEC_V1 = {
  spec_id: "ron_macro_news_geopolitics",
  spec_version: 1,
  agent_id: "macro_news_geopolitics",
  agent_version: 1,
  authority_class: "contextual",
  authority_rank: 4,
  source_health_authoritative: false,
  ttl_multiplier: 4,

  instrument_scope: ["XAUUSD"],
  timeframe_scope: ["15m"],

  source_contract: {
    table: "news_items",
    sole_source: true,
    allowed_fields: ["id", "headline", "source", "published_at", "instruments_affected", "impact"],
    forbidden_fields: ["ai_reason_short", "sentiment_direction"],
    forbidden_tables: ["news_impact_results"],
    external_fetch_allowed: false,
    window_minutes: MACRO_NEWS_WINDOW_MINUTES,
    window_lower_bound_inclusive: true,
    window_upper_bound_inclusive: true,
    window_ends_at_explicit_evaluation_anchor: true,
    max_rows: MACRO_NEWS_MAX_ROWS,
    canonical_order: ["published_at", "id"],
    identical_duplicate_rows_dedupe_by_id: true,
    conflicting_duplicate_id_fails_closed: true,
    malformed_row_policy: "exclude_and_degrade",
    wall_clock_allowed: false,
  },

  ingestion_metadata_contract: {
    instruments_affected_is_ingestion_tag_only: true,
    instruments_affected_used_for: "selection_and_reporting_only",
    instruments_affected_proves_affectedness: false,
    impact_surface_label: "ingest_impact_tag",
    impact_is_weight_or_authority: false,
    impact_is_claimed_real_world_impact: false,
  },

  taxonomy_contract: {
    method: "frozen_headline_keyword_substring",
    input_fields: ["headline"],
    llm_used: false,
    embedding_used: false,
    multi_category_allowed: true,
    fallback_category: "other_macro",
    categories: MACRO_TOPIC_CATEGORIES,
    keywords: MACRO_TOPIC_KEYWORDS_V1,
    categories_are_article_topic_tags: true,
    categories_are_causal_or_impact_classes: false,
  },

  clustering_contract: {
    cross_publisher_event_clustering_allowed: false,
    exact_duplicate_row_dedupe_allowed: true,
    records_are_called: "news_items_articles_not_unique_real_world_events",
  },

  safety_contract: {
    predictive: false,
    causal: false,
    sentiment_emitted: false,
    surprise_emitted: false,
    importance_score_emitted: false,
    source_credibility_score_emitted: false,
    confidence_emitted: false,
    probability_emitted: false,
    expected_value_emitted: false,
    target_emitted: false,
    trade_direction_emitted: false,
    envelope_direction_policy: "neutral_or_unknown_only_until_promoted_research_exists",
    recommendation_policy: ["context_only", "no_action"],
    execution_allowed: false,
    execution_path: "signal_only",
    persistence_in_phase_2d2h: false,
  },
} as const;

export function macroNewsSpecHash(): Promise<string> {
  return hashCanonical(MACRO_NEWS_SPEC_V1);
}

const iso = (ms: number) => new Date(ms).toISOString();

/* -------------------------------------------------------- canonical inputs */

/** Exactly the accepted source projection. No model-derived column exists here. */
export interface MacroNewsRow {
  id: string;
  headline: string;
  source: string;
  /** epoch ms of the DB `published_at`. */
  published_at: number;
  instruments_affected?: string[] | null;
  /** RAW ingestion tag only. */
  impact?: string | null;
}

export class MacroNewsSourceConflictError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`conflicting_duplicate_source_row_id: ${id}`);
    this.name = "MacroNewsSourceConflictError";
    this.id = id;
  }
}

function rowIdentity(r: MacroNewsRow): string {
  const tags = [...(r.instruments_affected ?? [])].sort().join(",");
  return `${r.headline}|${r.source}|${r.published_at}|${tags}|${r.impact ?? ""}`;
}

export function isMalformedRow(r: MacroNewsRow | null | undefined): boolean {
  if (!r) return true;
  if (typeof r.id !== "string" || !r.id.length) return true;
  if (typeof r.headline !== "string" || !r.headline.length) return true;
  if (typeof r.source !== "string" || !r.source.length) return true;
  if (typeof r.published_at !== "number" || !Number.isFinite(r.published_at)) return true;
  return false;
}

/**
 * Canonical de-duplication by stable identity. IDENTICAL duplicated rows collapse (a
 * harmless re-ingestion of one article). Two rows sharing an id but CONTRADICTING each
 * other FAIL CLOSED — the producer refuses to elect a winner between genuine claims.
 * Two DIFFERENT ids are two source records even when the wording matches: V1 never
 * clusters across publishers or across rows.
 */
export function canonicalNewsRows(rows: readonly MacroNewsRow[]): {
  rows: MacroNewsRow[];
  malformed: number;
} {
  const byId = new Map<string, { row: MacroNewsRow; identity: string }>();
  let malformed = 0;
  for (const r of rows ?? []) {
    if (isMalformedRow(r)) { malformed++; continue; }
    const identity = rowIdentity(r);
    const seen = byId.get(r.id);
    if (!seen) { byId.set(r.id, { row: r, identity }); continue; }
    if (seen.identity !== identity) throw new MacroNewsSourceConflictError(r.id);
  }
  const out = [...byId.values()].map((v) => v.row).sort((a, b) =>
    a.published_at - b.published_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return { rows: out, malformed };
}

/* ---------------------------------------------------------------- taxonomy */

/** Deterministic frozen headline taxonomy. Wording only — never semantic truth. */
export function classifyHeadline(headline: string): MacroTopicCategory[] {
  const h = (headline ?? "").toLowerCase();
  const hits: MacroTopicCategory[] = [];
  for (const cat of MACRO_TOPIC_CATEGORIES) {
    if (cat === "other_macro") continue;
    if (MACRO_TOPIC_KEYWORDS_V1[cat].some((k) => h.includes(k))) hits.push(cat);
  }
  return hits.length ? hits : ["other_macro"];
}

/* ------------------------------------------------------------- the producer */

export interface MacroNewsInputV1 {
  instrument: string;
  timeframe: string;
  /** epoch ms of the explicit, source-grounded evaluation anchor. */
  evaluation_anchor: number;
  items: MacroNewsRow[];
  run_id: string;
  trace_id: string;
}

const num = (key: string, value: number, at?: string, unit?: string): Observation =>
  ({ key, kind: "measurement", value_num: value, ...(unit ? { unit } : {}), ...(at ? { at } : {}) });
const state = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "state", value_text: value, ...(at ? { at } : {}) });
const ref = (key: string, value: string, at?: string): Observation =>
  ({ key, kind: "reference", value_text: value, ...(at ? { at } : {}) });

const clip = (s: string) => s.length > MACRO_NEWS_HEADLINE_MAX_CHARS
  ? `${s.slice(0, MACRO_NEWS_HEADLINE_MAX_CHARS)}…`
  : s;

export async function buildMacroNewsEvidenceV1(
  input: MacroNewsInputV1,
): Promise<EvidenceEnvelopeV1> {
  const spec_hash = await macroNewsSpecHash();
  const anchor = input.evaluation_anchor;
  const windowStart = anchor - MACRO_NEWS_WINDOW_MINUTES * 60_000;

  const provenance_refs = [
    `spec:${MACRO_NEWS_SPEC_V1.spec_id}:v${MACRO_NEWS_SPEC_V1.spec_version}:${spec_hash}`,
    `source:${MACRO_NEWS_SPEC_V1.source_contract.table}`,
  ];

  const limitations: string[] = [
    "topic tags come from a frozen deterministic headline keyword taxonomy; they describe article wording, not semantic truth and not an impact class",
    "instruments_affected and impact are RAW INGESTION METADATA only; they never prove that an article affected, or will affect, this instrument",
    "no causal conclusion is drawn between any article and any price move; temporal adjacency is not causation",
    "no sentiment, surprise magnitude, source-credibility ranking, importance score or predictive inference exists in V1",
    "source coverage is whatever news_items contains; the absence of an article is NOT proof that no real-world event occurred",
    "source records are individual news_items articles, not de-duplicated unique real-world events across publishers",
  ];
  const issues: string[] = [];
  const source_timestamps: Record<string, string> = { evaluation_anchor: iso(anchor) };
  const observations: Observation[] = [
    state("macro_source_table", MACRO_NEWS_SPEC_V1.source_contract.table, iso(anchor)),
    state("topic_taxonomy_method", MACRO_NEWS_SPEC_V1.taxonomy_contract.method, iso(anchor)),
    num("source_window_minutes", MACRO_NEWS_WINDOW_MINUTES, iso(anchor), "minutes"),
  ];
  const dependencies = [`news_items_ingest:${input.instrument}`];

  const envelope = (
    as_of: number,
    status: EvidenceStatus,
    healthStatus: "healthy" | "degraded" | "critical",
    direction: QualitativeDirection,
    recommendation: RecommendationV1,
    completeness: number,
    freshness_minutes: number,
  ): EvidenceEnvelopeV1 => ({
    schema_version: 1,
    agent_id: "macro_news_geopolitics",
    agent_version: 1,
    run_id: input.run_id,
    trace_id: input.trace_id,
    instrument: input.instrument,
    timeframe: input.timeframe,
    as_of: iso(as_of),
    source_timestamps,
    observations,
    provenance_refs,
    data_health: { status: healthStatus, freshness_minutes, completeness, issues },
    uncertainty: { level: "unquantified", limitations },
    conflicts: [],
    dependencies,
    status,
    direction,
    recommendation,
  });

  // ---- 1. canonical rows; contradictory duplicate ids fail closed.
  let canonical: MacroNewsRow[];
  let malformed: number;
  try {
    const c = canonicalNewsRows(input.items);
    canonical = c.rows;
    malformed = c.malformed;
  } catch (err) {
    if (err instanceof MacroNewsSourceConflictError) {
      issues.push("conflicting_duplicate_source_row_id");
      limitations.push("two contradictory source rows share one news_items id; no winner is invented");
      observations.push(state("macro_news_state", "blocked", iso(anchor)));
      return envelope(anchor, "blocked", "critical", "unknown", "no_action", 0, 0);
    }
    throw err;
  }

  if (malformed > 0) {
    issues.push(`malformed_source_rows_excluded:${malformed}`);
    limitations.push("rows with an invalid id, headline, source or publication time were excluded, never repaired");
    observations.push(num("malformed_rows_excluded", malformed, iso(anchor), "rows"));
  }

  // ---- 2. strict window: nothing published after the anchor is representable.
  const inWindow = canonical.filter((r) => r.published_at <= anchor && r.published_at >= windowStart);

  // ---- 3. bounded newest-first admission cap, then back to canonical ascending order.
  let admitted = inWindow;
  if (inWindow.length > MACRO_NEWS_MAX_ROWS) {
    admitted = inWindow.slice(inWindow.length - MACRO_NEWS_MAX_ROWS);
    issues.push(`source_rows_truncated_to_cap:${MACRO_NEWS_MAX_ROWS}`);
    limitations.push(`only the newest ${MACRO_NEWS_MAX_ROWS} in-window source rows are admitted`);
  }

  observations.push(
    num("total_items_in_window", admitted.length, iso(anchor), "items"),
  );

  if (!admitted.length) {
    issues.push("no_source_rows_in_window");
    limitations.push("no news_items row exists in the source window; this is an absence of SOURCE DATA and is not a claim that markets were quiet");
    observations.push(state("macro_news_state", "insufficient_data", iso(anchor)));
    return envelope(anchor, "insufficient_data", malformed > 0 ? "degraded" : "healthy",
      "unknown", "no_action", 0, 0);
  }

  const newest = admitted[admitted.length - 1];
  const oldest = admitted[0];
  source_timestamps.newest_included_publication = iso(newest.published_at);
  source_timestamps.oldest_included_publication = iso(oldest.published_at);
  source_timestamps.source_window_start = iso(windowStart);

  // ---- 4. deterministic topic tagging from HEADLINE TEXT ONLY.
  const counts = new Map<MacroTopicCategory, number>();
  const xauTagged: MacroNewsRow[] = [];
  const sources = new Set<string>();
  for (const r of admitted) {
    for (const cat of classifyHeadline(r.headline)) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    sources.add(r.source);
    if ((r.instruments_affected ?? []).includes(input.instrument)) xauTagged.push(r);
  }

  observations.push(
    num("xau_ingestion_tagged_items", xauTagged.length, iso(anchor), "items"),
    num("distinct_publishers", sources.size, iso(anchor), "publishers"),
    num("latest_item_age_minutes", Math.round((anchor - newest.published_at) / 60_000), iso(anchor), "minutes"),
    num("oldest_item_age_minutes", Math.round((anchor - oldest.published_at) / 60_000), iso(anchor), "minutes"),
  );
  for (const cat of MACRO_TOPIC_CATEGORIES) {
    observations.push(num(`topic_${cat}_items`, counts.get(cat) ?? 0, iso(anchor), "items"));
  }

  // ---- 5. bounded newest-item summaries, exact source grounding.
  const latest = admitted.slice(Math.max(0, admitted.length - MACRO_NEWS_LATEST_SUMMARY_COUNT)).reverse();
  latest.forEach((r, i) => {
    const at = iso(r.published_at);
    observations.push(
      ref(`latest_item_${i + 1}_id`, r.id, at),
      state(`latest_item_${i + 1}_headline`, clip(r.headline), at),
      state(`latest_item_${i + 1}_publisher`, r.source, at),
      state(`latest_item_${i + 1}_topic_tags`, classifyHeadline(r.headline).join(","), at),
    );
    if (typeof r.impact === "string" && r.impact.length) {
      observations.push(state(`latest_item_${i + 1}_ingest_impact_tag`, r.impact, at));
    }
    if ((r.instruments_affected ?? []).includes(input.instrument)) {
      observations.push(state(`latest_item_${i + 1}_ingest_instrument_tagged`, input.instrument, at));
    }
    provenance_refs.push(`news_item:${r.id}:${at}:${r.source}`);
  });
  if (xauTagged.length) {
    provenance_refs.push(`ingestion_tag:instruments_affected:${input.instrument}`);
  }
  if (admitted.some((r) => typeof r.impact === "string" && r.impact.length)) {
    provenance_refs.push("ingestion_tag:ingest_impact_tag");
  }

  observations.push(state("macro_news_state", "source_records_present", iso(newest.published_at)));

  const freshness_minutes = Math.round((anchor - newest.published_at) / 60_000);
  return envelope(
    newest.published_at, "supported", malformed > 0 ? "degraded" : "healthy",
    "neutral", "context_only", 1, Math.max(0, freshness_minutes),
  );
}
