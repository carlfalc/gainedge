/**
 * Data expiry utilities for signals (20min) and news (12h).
 */

export function isExpired(timestamp: string | Date, maxAgeMinutes: number): boolean {
  return (Date.now() - new Date(timestamp).getTime()) > maxAgeMinutes * 60 * 1000;
}

export function ageMinutes(timestamp: string | Date): number {
  return (Date.now() - new Date(timestamp).getTime()) / 60000;
}

export type SignalFreshness = "fresh" | "recent" | "aging" | "expired";
export type NewsFreshness = "fresh" | "recent" | "old" | "expired";

const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30, "1H": 60, "4H": 240, "1D": 1440,
};

/** Dynamic expiry lifetime per timeframe (minutes) */
export function dynamicExpiryMinutes(tf: string): number {
  switch (tf) {
    case "1m": return 60;
    case "5m": return 240;
    case "15m": return 720;
    case "30m": return 720;
    case "1H": return 1440;
    case "4H": return 2880;
    case "1D": return 7200;
    default: return 720;
  }
}

/** Signal freshness: fresh <5m, recent 5-15m, aging 15-20m, expired >20m */
export function signalFreshness(timestamp: string | Date): SignalFreshness {
  const age = ageMinutes(timestamp);
  if (age < 5) return "fresh";
  if (age < 15) return "recent";
  if (age < 20) return "aging";
  return "expired";
}

/** Check if a signal is expired based on its timeframe's dynamic lifetime */
export function isDynamicallyExpired(timestamp: string | Date, timeframe: string): boolean {
  return ageMinutes(timestamp) > dynamicExpiryMinutes(timeframe);
}

/** News freshness: fresh <1h, recent 1-6h, old 6-12h, expired >12h */
export function newsFreshness(timestamp: string | Date): NewsFreshness {
  const age = ageMinutes(timestamp);
  if (age < 60) return "fresh";
  if (age < 360) return "recent";
  if (age < 720) return "old";
  return "expired";
}

/** Seconds until next candle close for a given timeframe */
export function nextScanSeconds(timeframe: string): number {
  const mins = TF_MINUTES[timeframe] || 15;
  if (mins >= 1440) {
    // Daily: next UTC midnight
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return Math.max(1, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
  }
  const now = new Date();
  const totalSecsIntoDay = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const cycleSecs = mins * 60;
  const remaining = cycleSecs - (totalSecsIntoDay % cycleSecs);
  return remaining === 0 ? cycleSecs : remaining;
}

/** Format seconds as countdown string e.g. "8m 32s", "1h 03m" */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatAge(timestamp: string | Date): string {
  const age = ageMinutes(timestamp);
  if (age < 1) return "just now";
  if (age < 60) return `${Math.round(age)}m ago`;
  if (age < 1440) return `${Math.round(age / 60)}h ago`;
  return `${Math.round(age / 1440)}d ago`;
}
