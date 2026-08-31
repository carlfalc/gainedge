/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_UI_V1 — read-only access to stored RON
 * opportunity-context records.
 *
 * The table is written ONLY by the internal server-side RON runtime. The client can read
 * it and nothing else: there is no insert/update/delete policy, so the UI can never
 * fabricate, backfill or amend a record.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TrackedPair } from "@/lib/ron-decision-explorer";
import {
  deriveStateSince, type LifecycleHistoryRow, type LifecycleSince,
} from "@/lib/ron-lifecycle-since";

export interface RonOpportunityContextRecord {
  id: string;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  analytical_bar_open: string;
  spec_version: number;
  runtime_version: number;
  decision_id: string | null;
  direction_context: string;
  direction_authority: string;
  setup_family: string;
  lifecycle: string;
  material_change_type: string;
  data_state: string;
  data_blocked: boolean;
  pattern_context_state: string;
  cross_asset_context_state: string;
  macro_context_state: string;
  ha_states: Record<string, unknown> | null;
  limitations: string[] | null;
  historical_insights_v1: unknown[] | null;
  specialist_commentary_v1: Array<{
    source_agent: string;
    setup_id: string;
    finding: string;
    commentary: string;
  }> | null;
  created_at: string;
}

export const OPPORTUNITY_CONTEXT_TABLE = "ron_opportunity_context";

export const OPPORTUNITY_CONTEXT_COLUMNS =
  "id,instrument,timeframe,evaluation_anchor,analytical_bar_open,spec_version,runtime_version," +
  "decision_id,direction_context,direction_authority,setup_family,lifecycle," +
  "material_change_type,data_state,data_blocked,pattern_context_state," +
  "cross_asset_context_state,macro_context_state,ha_states,limitations," +
  "historical_insights_v1,specialist_commentary_v1,created_at";

/** Deterministic map key. Mirrors the stored uniqueness scope. */
export const contextKey = (instrument: string, timeframe: string) =>
  `${instrument.trim().toUpperCase()}|${timeframe.trim()}`;

/**
 * Keeps only the newest record per instrument+timeframe. Input order is irrelevant, and
 * a pair with no stored record simply stays absent — nothing is substituted.
 */
export function latestByPair(
  rows: RonOpportunityContextRecord[],
): Map<string, RonOpportunityContextRecord> {
  const out = new Map<string, RonOpportunityContextRecord>();
  for (const row of rows) {
    if (!row?.instrument || !row?.timeframe) continue;
    const key = contextKey(row.instrument, row.timeframe);
    const current = out.get(key);
    const t = Date.parse(row.evaluation_anchor);
    if (!Number.isFinite(t)) continue;
    if (!current || t > Date.parse(current.evaluation_anchor)) out.set(key, row);
  }
  return out;
}

/**
 * Reads the newest stored opportunity-context records for the given tracked pairs.
 * Returns an empty map on any failure — an unreadable record is reported as absent,
 * never as an assumed state.
 */
export async function fetchOpportunityContexts(
  pairs: TrackedPair[],
  perPairLimit = 4,
): Promise<Map<string, RonOpportunityContextRecord>> {
  const instruments = Array.from(new Set(pairs.map((p) => p.symbol.trim().toUpperCase())))
    .filter(Boolean);
  if (instruments.length === 0) return new Map();

  const { data, error } = await supabase
    .from(OPPORTUNITY_CONTEXT_TABLE)
    .select(OPPORTUNITY_CONTEXT_COLUMNS)
    .in("instrument", instruments)
    .order("evaluation_anchor", { ascending: false })
    .limit(Math.max(1, instruments.length * perPairLimit));
  if (error) return new Map();

  const wanted = new Set(pairs.map((p) => contextKey(p.symbol, p.timeframe)));
  const rows = ((data ?? []) as unknown as RonOpportunityContextRecord[])
    .filter((r) => wanted.has(contextKey(r.instrument, r.timeframe)));
  return latestByPair(rows);
}

/* ------------------------------------------------------------------------- *
 * GAINEDGE_RON_ALWAYS_ON_RUNTIME_COMPLETION_V1 — lifecycle transition start time.
 * Derived from stored append-only history only. See `@/lib/ron-lifecycle-since`.
 * ------------------------------------------------------------------------- */

/** How far back the transition-start derivation is allowed to look, per pair. */
export const STATE_SINCE_HISTORY_LIMIT = 64;

/**
 * Reads recent lifecycle history and derives when each pair's current state began.
 * A pair with no readable history is simply absent — never defaulted.
 */
export async function fetchStateSince(
  pairs: TrackedPair[],
  perPairLimit = STATE_SINCE_HISTORY_LIMIT,
): Promise<Map<string, LifecycleSince>> {
  const instruments = Array.from(new Set(pairs.map((p) => p.symbol.trim().toUpperCase())))
    .filter(Boolean);
  if (instruments.length === 0) return new Map();

  const { data, error } = await supabase
    .from(OPPORTUNITY_CONTEXT_TABLE)
    .select("instrument,timeframe,evaluation_anchor,lifecycle")
    .in("instrument", instruments)
    .order("evaluation_anchor", { ascending: false })
    .limit(Math.max(1, instruments.length * perPairLimit));
  if (error) return new Map();

  const grouped = new Map<string, LifecycleHistoryRow[]>();
  for (const row of (data ?? []) as unknown as
    (LifecycleHistoryRow & { instrument: string; timeframe: string })[]) {
    if (!row?.instrument || !row?.timeframe) continue;
    const key = contextKey(row.instrument, row.timeframe);
    const bucket = grouped.get(key) ?? [];
    bucket.push({ evaluation_anchor: row.evaluation_anchor, lifecycle: row.lifecycle });
    grouped.set(key, bucket);
  }

  const wanted = new Set(pairs.map((p) => contextKey(p.symbol, p.timeframe)));
  const out = new Map<string, LifecycleSince>();
  for (const [key, rows] of grouped) {
    if (!wanted.has(key)) continue;
    const since = deriveStateSince(rows);
    if (since) out.set(key, since);
  }
  return out;
}
