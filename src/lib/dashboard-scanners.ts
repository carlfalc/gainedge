/**
 * GAINEDGE_DASHBOARD_UI_V1 — pure ranking helpers for the market scanners.
 *
 * The previous "Movers & Shakers" widget rendered a hardcoded fabricated list of
 * instruments and percentages. That is removed. Everything here is derived from
 * stored RON snapshots for the user's own tracked instruments, and every row
 * carries the completed-bar instant it was measured on, so nothing can be read as
 * a live tick move.
 */

export interface ScannerSnapshotInput {
  symbol: string;
  timeframe: string;
  bar_time: string;
  open: number;
  close: number;
  data_health: string;
  /** Client watch heuristic label produced by ronStateFrom, or null. */
  state: string | null;
  /** Directional side of the stored evidence ("LONG" | "SHORT"), or null. */
  bias?: string | null;
}

export interface MoverRow {
  symbol: string;
  timeframe: string;
  bar_time: string;
  /** Percent change across the completed bar (close vs open). */
  changePct: number;
  close: number;
}

export interface WatchRow {
  symbol: string;
  timeframe: string;
  bar_time: string;
  state: string;
  /** Directional side of the stored evidence, or null when not explicit. */
  bias: string | null;
}

export interface HealthRow {
  symbol: string;
  timeframe: string;
  bar_time: string;
  data_health: string;
}

export const SCANNER_LIMIT = 5;

/** Change across the completed bar only. Null when open is missing or zero. */
export function completedBarChangePct(open: number, close: number): number | null {
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null;
  return ((close - open) / open) * 100;
}

export function topMovers(
  rows: ScannerSnapshotInput[],
  direction: "up" | "down",
  limit = SCANNER_LIMIT,
): MoverRow[] {
  const mapped: MoverRow[] = [];
  for (const r of rows) {
    const pct = completedBarChangePct(r.open, r.close);
    if (pct === null) continue;
    if (direction === "up" && pct <= 0) continue;
    if (direction === "down" && pct >= 0) continue;
    mapped.push({
      symbol: r.symbol, timeframe: r.timeframe, bar_time: r.bar_time,
      changePct: pct, close: r.close,
    });
  }
  mapped.sort((a, b) => (direction === "up" ? b.changePct - a.changePct : a.changePct - b.changePct));
  return mapped.slice(0, limit);
}

const WATCH_RANK: Record<string, number> = { "SETUP FORMING": 3, WATCH: 2, WAIT: 1 };

/** Tracked markets ordered by the client watch heuristic, newest bar first. */
export function ronWatchList(rows: ScannerSnapshotInput[], limit = SCANNER_LIMIT): WatchRow[] {
  return rows
    .filter((r): r is ScannerSnapshotInput & { state: string } => !!r.state)
    .sort((a, b) => {
      const d = (WATCH_RANK[b.state] ?? 0) - (WATCH_RANK[a.state] ?? 0);
      if (d !== 0) return d;
      return new Date(b.bar_time).getTime() - new Date(a.bar_time).getTime();
    })
    .slice(0, limit)
    .map((r) => ({
      symbol: r.symbol, timeframe: r.timeframe, bar_time: r.bar_time,
      state: r.state, bias: r.bias ?? null,
    }));
}

/** Tracked markets whose stored snapshot reports non-healthy source data. */
export function dataHealthIssues(rows: ScannerSnapshotInput[], limit = SCANNER_LIMIT): HealthRow[] {
  return rows
    .filter((r) => r.data_health && r.data_health !== "healthy")
    .sort((a, b) => new Date(b.bar_time).getTime() - new Date(a.bar_time).getTime())
    .slice(0, limit)
    .map((r) => ({ symbol: r.symbol, timeframe: r.timeframe, bar_time: r.bar_time, data_health: r.data_health }));
}
