/**
 * Presentation-only helper: group today's stored RON snapshots into the trading
 * sessions that have already happened (up to now) and describe each one from the
 * stored evidence alone.
 *
 * Nothing here computes new market analysis: it only reads `features.regime` and
 * the stored `patterns` array that RON already persisted for each completed bar.
 */

import { classifyRonSession, type RonSessionKey } from "@/lib/ron-sessions";

export interface RonDaySnapshotInput {
  bar_time: string;
  features: Record<string, any> | null;
  patterns?: unknown[] | null;
}

export type RonSessionStructure = "trend_up" | "trend_down" | "ranging" | "unclear";

export interface RonSessionDayRow {
  session: RonSessionKey;
  label: string;
  bars: number;
  /** Deterministic structure read across the session's stored bars. */
  structure: RonSessionStructure;
  structureLabel: string;
  /** Distinct named patterns RON stored during the session. */
  patterns: string[];
  /** True when no pattern was formed in any bar of this session. */
  noFormedPatterns: boolean;
  firstBar: string;
  lastBar: string;
}

const STRUCTURE_LABEL: Record<RonSessionStructure, string> = {
  trend_up: "Trend (up)",
  trend_down: "Trend (down)",
  ranging: "Ranging",
  unclear: "No clear structure",
};

/** UTC calendar day key of an instant. */
function dayKey(t: string | Date): string {
  const d = t instanceof Date ? t : new Date(t);
  return d.toISOString().slice(0, 10);
}

function patternName(p: any): string | null {
  if (!p) return null;
  const raw = typeof p === "string" ? p : p.name ?? p.pattern ?? p.type ?? p.title;
  if (!raw) return null;
  return String(raw).replace(/_/g, " ");
}

/**
 * Sessions of the current UTC day that have already occurred, in chronological
 * order, each described from the stored bars that fell inside it.
 */
export function summariseSessionsToday(
  rows: RonDaySnapshotInput[],
  now: Date = new Date(),
): RonSessionDayRow[] {
  const today = dayKey(now);
  const buckets = new Map<RonSessionKey, {
    label: string; bars: RonDaySnapshotInput[]; up: number; down: number; range: number; patterns: Set<string>;
    first: string; last: string;
  }>();

  const ordered = [...rows]
    .filter((r) => r?.bar_time && dayKey(r.bar_time) === today && new Date(r.bar_time) <= now)
    .sort((a, b) => new Date(a.bar_time).getTime() - new Date(b.bar_time).getTime());

  for (const r of ordered) {
    const ctx = classifyRonSession(r.bar_time);
    let b = buckets.get(ctx.session);
    if (!b) {
      b = { label: ctx.label, bars: [], up: 0, down: 0, range: 0, patterns: new Set(), first: r.bar_time, last: r.bar_time };
      buckets.set(ctx.session, b);
    }
    b.bars.push(r);
    b.last = r.bar_time;
    const regime = String(r.features?.regime ?? "");
    if (regime === "trending_up") b.up += 1;
    else if (regime === "trending_down") b.down += 1;
    else if (regime) b.range += 1;
    for (const p of (r.patterns as any[] | null | undefined) ?? []) {
      const n = patternName(p);
      if (n) b.patterns.add(n);
    }
  }

  const out: RonSessionDayRow[] = [];
  for (const [session, b] of buckets) {
    const total = b.up + b.down + b.range;
    let structure: RonSessionStructure = "unclear";
    if (total > 0) {
      const trending = b.up + b.down;
      if (trending >= total / 2) structure = b.up >= b.down ? "trend_up" : "trend_down";
      else structure = "ranging";
    }
    out.push({
      session,
      label: b.label,
      bars: b.bars.length,
      structure,
      structureLabel: STRUCTURE_LABEL[structure],
      patterns: [...b.patterns],
      noFormedPatterns: b.patterns.size === 0,
      firstBar: b.first,
      lastBar: b.last,
    });
  }
  return out.sort((a, b) => new Date(a.firstBar).getTime() - new Date(b.firstBar).getTime());
}
