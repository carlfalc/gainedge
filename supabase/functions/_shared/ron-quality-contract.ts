/**
 * RON Phase 2C.1 — CENTRAL QUALITY ELIGIBILITY CONTRACT.
 *
 * One definition of "may this source bar be used by RON", shared by every consumer
 * (snapshot worker, labeller, calibration runner, auditor). No consumer is allowed to
 * re-implement its own schedule/quality check.
 *
 * FAIL-CLOSED BY CONSTRUCTION
 *   Eligibility is the UNION of
 *     (a) persisted critical flags in public.ron_data_quality_flags, and
 *     (b) the pure, source-derivable critical rules recomputed on the spot.
 *   (b) exists so a bar that the auditor has not visited yet can still never leak into a
 *   RON feature window, outcome anchor or calibration cell.
 *
 * This module NEVER mutates, repairs or deletes market data.
 */
import { xauVenueOpen } from "./ron-sessions.ts";
import { CRITICAL_RULES, RON_QUALITY_VERSION, type QualityRuleCode } from "./ron-data-quality.ts";

export { CRITICAL_RULES, RON_QUALITY_VERSION };

/**
 * Phase 2C.2 correction: the contract now preserves the ACTUAL persisted rule codes per
 * bar (Map<bar_time, Set<rule_code>>). The previous Set<bar_time> lost the rule identity
 * and reported every persisted critical as `venue_break_bar`, which could mislabel a
 * persisted `premature_bar_persisted` finding.
 */

export interface ContractBar {
  /** bar OPEN, epoch ms */
  time: number;
  /** candle_history.created_at, epoch ms (null when the caller did not select it) */
  created_at?: number | null;
}

/**
 * Pure, source-derivable critical rules for ONE bar. Requires no database round trip.
 * Returns [] when the bar is eligible on the evidence available to the caller.
 */
export function criticalRulesForBar(bar: ContractBar, barMinutes: number): QualityRuleCode[] {
  const rules: QualityRuleCode[] = [];
  if (!xauVenueOpen(new Date(bar.time))) rules.push("venue_break_bar");
  const closeMs = bar.time + barMinutes * 60_000;
  if (bar.created_at != null && Number.isFinite(bar.created_at) && bar.created_at < closeMs) {
    rules.push("premature_bar_persisted");
  }
  return rules;
}

/** Map of bar_time (ISO) -> persisted CRITICAL rule codes at the given quality_version. */
export async function loadQuarantinedRuleCodes(
  supabase: { from: (t: string) => any },
  symbol: string,
  timeframe: string,
  qualityVersion: number = RON_QUALITY_VERSION,
  page = 1000,
): Promise<Map<string, Set<QualityRuleCode>>> {
  const out = new Map<string, Set<QualityRuleCode>>();
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("ron_data_quality_flags")
      .select("bar_time, rule_code, severity")
      .eq("symbol", symbol).eq("timeframe", timeframe)
      .eq("quality_version", qualityVersion)
      .eq("severity", "critical")
      .order("bar_time", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows as { bar_time: string; rule_code: string; severity: string }[]) {
      if (r.severity === "critical" || CRITICAL_RULES.includes(r.rule_code as QualityRuleCode)) {
        const iso = new Date(r.bar_time).toISOString();
        const set = out.get(iso) ?? new Set<QualityRuleCode>();
        set.add(r.rule_code as QualityRuleCode);
        out.set(iso, set);
      }
    }
    if (rows.length < page) break;
  }
  return out;
}

/** Back-compatible helper: just the quarantined bar_times. */
export async function loadQuarantinedBarTimes(
  supabase: { from: (t: string) => any },
  symbol: string,
  timeframe: string,
  qualityVersion: number = RON_QUALITY_VERSION,
  page = 1000,
): Promise<Set<string>> {
  const map = await loadQuarantinedRuleCodes(supabase, symbol, timeframe, qualityVersion, page);
  return new Set(map.keys());
}

export interface EligibilityContract {
  quality_version: number;
  /** Persisted critical bar_times (ISO) -> the exact persisted rule codes. */
  persistedRuleCodes: Map<string, Set<QualityRuleCode>>;
  /** Persisted critical bar_times (ISO). */
  persisted: Set<string>;
  /** True when this bar must be excluded from every RON path. */
  isQuarantined(bar: ContractBar, barMinutes: number): boolean;
  /** Primary reason — recomputed rules first, then the ACTUAL persisted rule codes. */
  reasonFor(bar: ContractBar, barMinutes: number): QualityRuleCode | null;
  /** Every distinct critical reason for the bar (recomputed ∪ persisted), sorted. */
  reasonsFor(bar: ContractBar, barMinutes: number): QualityRuleCode[];
}

/** Build the contract once per request, then reuse it for every bar in the batch. */
export async function buildEligibilityContract(
  supabase: { from: (t: string) => any },
  symbol: string,
  timeframe: string,
  qualityVersion: number = RON_QUALITY_VERSION,
): Promise<EligibilityContract> {
  const persistedRuleCodes = await loadQuarantinedRuleCodes(supabase, symbol, timeframe, qualityVersion);
  const persisted = new Set(persistedRuleCodes.keys());
  const reasonsFor = (bar: ContractBar, barMinutes: number): QualityRuleCode[] => {
    const iso = new Date(bar.time).toISOString();
    const all = new Set<QualityRuleCode>(criticalRulesForBar(bar, barMinutes));
    for (const rc of persistedRuleCodes.get(iso) ?? []) all.add(rc);
    return [...all].sort();
  };
  return {
    quality_version: qualityVersion,
    persistedRuleCodes,
    persisted,
    reasonsFor,
    reasonFor: (bar, barMinutes) => reasonsFor(bar, barMinutes)[0] ?? null,
    isQuarantined: (bar, barMinutes) =>
      persisted.has(new Date(bar.time).toISOString()) || criticalRulesForBar(bar, barMinutes).length > 0,
  };
}
