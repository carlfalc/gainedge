/**
 * RON Phase 2C — deterministic market-data quality detector, quality_version = 1.
 *
 * PURPOSE
 *   Detect broker/provider aggregation artifacts in the SOURCE candle history and make
 *   the evidence explicit, versioned and auditable. This module NEVER mutates, deletes,
 *   repairs, interpolates or synthesises market data. It only produces flags.
 *
 * HARD RULES
 *   - Pure functions: same inputs => byte-identical flags and evidence hashes.
 *   - Only ONE hard (critical/ineligible) rule exists in v1: `venue_break_bar`, a bar
 *     whose OPEN timestamp falls outside the DST-aware XAUUSD venue schedule (which
 *     includes the New York 17:00-18:00 daily break). This is a calendar fact, not a
 *     statistical guess.
 *   - Range / volume magnitude is recorded as EVIDENCE ONLY. Large genuine moves exist,
 *     so N-sigma outliers are never a corruption verdict.
 *   - Where genuine 1m children are unavailable (retention, the known 2026-05-15 ->
 *     2026-07-31 1m outage) the bar is `unverifiable_1m_coverage` — unknown, NOT corrupt.
 */

export const RON_QUALITY_VERSION = 1;

export type QualitySeverity = "critical" | "warning" | "info";

export type QualityRuleCode =
  | "venue_break_bar"
  | "unverifiable_1m_coverage"
  | "child_coverage_incomplete"
  | "ohlc_reconciliation_mismatch";

/** Only critical rules quarantine a bar from RON opportunity/evidence paths. */
export const CRITICAL_RULES: readonly QualityRuleCode[] = ["venue_break_bar"];

export interface SourceBar {
  time: number;                 // bar OPEN, epoch ms
  open: number; high: number; low: number; close: number;
  volume?: number | null;
}

export interface ChildBar { time: number; open: number; high: number; low: number; close: number; }

export interface QualityFlag {
  bar_time: string;
  quality_version: number;
  rule_code: QualityRuleCode;
  severity: QualitySeverity;
  evidence: Record<string, unknown>;
}

const r = (v: number | null | undefined, dp = 5): number | null =>
  v == null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));

/** Deterministic evidence fingerprint. Excludes detected_at and any write timestamp. */
export async function evidenceHash(
  symbol: string, timeframe: string, f: QualityFlag,
): Promise<string> {
  const payload = JSON.stringify([
    "ron-quality-v1", symbol, timeframe, f.bar_time, f.quality_version,
    f.rule_code, f.severity, stable(f.evidence),
  ]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Key-sorted structural clone so JSON key order can never change a hash. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = stable((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Exact 1m OPEN grid inside a bar, restricted to genuinely tradable minutes. */
export function tradableChildGrid(
  barOpen: number, barMinutes: number, venueOpen: (d: Date) => boolean,
): number[] {
  const grid: number[] = [];
  for (let i = 0; i < barMinutes; i++) {
    const t = barOpen + i * 60_000;
    if (venueOpen(new Date(t))) grid.push(t);
  }
  return grid;
}

/** Absolute price tolerance for 15m <-> 1m OHLC reconciliation (5 dp source precision). */
export const RECONCILE_TOLERANCE = 0.005;

/**
 * Deterministic quality assessment of ONE source bar.
 *
 * `children` must be EVERY stored 1m bar whose OPEN falls inside [barOpen, barOpen+len).
 * Pass an empty array when 1m history is genuinely unavailable — that yields
 * `unverifiable_1m_coverage`, never a corruption verdict.
 */
export function detectBarQuality(
  bar: SourceBar,
  children: ChildBar[],
  opts: { barMinutes: number; venueOpen: (d: Date) => boolean },
): QualityFlag[] {
  const iso = new Date(bar.time).toISOString();
  const range = r(bar.high - bar.low);
  const base = {
    bar_open: r(bar.open), bar_high: r(bar.high), bar_low: r(bar.low), bar_close: r(bar.close),
    bar_range: range,                              // EVIDENCE ONLY — never a verdict
    volume: bar.volume == null ? null : Number(bar.volume),
  };

  // ── Rule 1 (HARD): the bar opens while the venue is closed ────────────
  if (!opts.venueOpen(new Date(bar.time))) {
    return [{
      bar_time: iso,
      quality_version: RON_QUALITY_VERSION,
      rule_code: "venue_break_bar",
      severity: "critical",
      evidence: {
        ...base,
        reason: "bar_open_inside_venue_break_or_closed_market",
        tradable_minutes_in_bar: tradableChildGrid(bar.time, opts.barMinutes, opts.venueOpen).length,
      },
    }];
  }

  // ── Child-coverage evidence (only where genuine 1m source exists) ─────
  const grid = tradableChildGrid(bar.time, opts.barMinutes, opts.venueOpen);
  const gridSet = new Set(grid);
  const seen = new Set<number>();
  let offGrid = 0, duplicates = 0;
  const onGrid: ChildBar[] = [];
  for (const c of children) {
    if (!gridSet.has(c.time)) { offGrid++; continue; }
    if (seen.has(c.time)) { duplicates++; continue; }
    seen.add(c.time);
    onGrid.push(c);
  }
  onGrid.sort((a, b) => a.time - b.time);

  const coverage = {
    ...base,
    expected_children: grid.length,
    child_count: onGrid.length,
    first_child: onGrid.length ? new Date(onGrid[0].time).toISOString() : null,
    last_child: onGrid.length ? new Date(onGrid[onGrid.length - 1].time).toISOString() : null,
    missing_children: grid.length - onGrid.length,
    missing_timestamps: grid.filter((t) => !seen.has(t)).slice(0, 15).map((t) => new Date(t).toISOString()),
    duplicate_timestamps: duplicates,
    off_grid_children: offGrid,
  };

  if (onGrid.length === 0) {
    return [{
      bar_time: iso, quality_version: RON_QUALITY_VERSION,
      rule_code: "unverifiable_1m_coverage", severity: "info",
      evidence: { ...coverage, reason: "no_genuine_1m_children_stored", verdict: "unknown_not_corrupt" },
    }];
  }

  if (onGrid.length < grid.length) {
    return [{
      bar_time: iso, quality_version: RON_QUALITY_VERSION,
      rule_code: "child_coverage_incomplete", severity: "warning",
      evidence: { ...coverage, reason: "partial_1m_children", verdict: "unverifiable_reconciliation" },
    }];
  }

  // ── Full children present: deterministic OHLC reconciliation ──────────
  const recOpen = onGrid[0].open;
  const recClose = onGrid[onGrid.length - 1].close;
  const recHigh = Math.max(...onGrid.map((c) => c.high));
  const recLow = Math.min(...onGrid.map((c) => c.low));
  const diffs = {
    open: Math.abs(recOpen - bar.open), high: Math.abs(recHigh - bar.high),
    low: Math.abs(recLow - bar.low), close: Math.abs(recClose - bar.close),
  };
  const worst = Math.max(diffs.open, diffs.high, diffs.low, diffs.close);
  if (worst > RECONCILE_TOLERANCE) {
    return [{
      bar_time: iso, quality_version: RON_QUALITY_VERSION,
      rule_code: "ohlc_reconciliation_mismatch", severity: "warning",
      evidence: {
        ...coverage,
        reconstructed: { open: r(recOpen), high: r(recHigh), low: r(recLow), close: r(recClose) },
        max_abs_diff: r(worst, 6), tolerance: RECONCILE_TOLERANCE,
        reason: "15m_ohlc_does_not_match_available_1m_children",
      },
    }];
  }

  return [];   // reconciled and healthy — nothing is persisted for clean bars
}

/** Convenience: does this flag set quarantine the bar from RON evidence paths? */
export const isQuarantined = (flags: { rule_code: string; severity: string }[]): boolean =>
  flags.some((f) => f.severity === "critical" || CRITICAL_RULES.includes(f.rule_code as QualityRuleCode));
