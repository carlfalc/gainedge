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

/** Signal freshness: fresh <5m, recent 5-15m, aging 15-20m, expired >20m */
export function signalFreshness(timestamp: string | Date): SignalFreshness {
  const age = ageMinutes(timestamp);
  if (age < 5) return "fresh";
  if (age < 15) return "recent";
  if (age < 20) return "aging";
  return "expired";
}

/** News freshness: fresh <1h, recent 1-6h, old 6-12h, expired >12h */
export function newsFreshness(timestamp: string | Date): NewsFreshness {
  const age = ageMinutes(timestamp);
  if (age < 60) return "fresh";
  if (age < 360) return "recent";
  if (age < 720) return "old";
  return "expired";
}

export function formatAge(timestamp: string | Date): string {
  const age = ageMinutes(timestamp);
  if (age < 1) return "just now";
  if (age < 60) return `${Math.round(age)}m ago`;
  if (age < 1440) return `${Math.round(age / 60)}h ago`;
  return `${Math.round(age / 1440)}d ago`;
}
