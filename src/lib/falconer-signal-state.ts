/**
 * Truthful Falconer signal state derivation.
 *
 * A Falconer badge may only read as ACTIVE when the stored trade status is
 * exactly `open` AND the signal is still inside its timeframe freshness window.
 * Any other status (`closed_sl`, `closed_tp3`, `closed_ha_flip`, any future
 * `closed_*`) is historical immediately, regardless of age.
 */
import { isDynamicallyExpired, formatAge } from "@/lib/expiry";
import { formatPrintedLocal } from "@/lib/signal-time";

export interface FalconerTradeLike {
  /** falconer_trades.direction ("long" | "short") or null when no row exists. */
  direction: string | null;
  /** falconer_trades.opened_at, or null when no row exists. */
  opened_at: string | null;
  /** falconer_trades.status, or null when no row exists. */
  status: string | null;
  /** falconer_trades.closed_at, or null while open. */
  closed_at?: string | null;
}

export interface FalconerSignalState {
  hasSignal: boolean;
  /** Stored status verbatim, never a derived verdict string. */
  status: string | null;
  isOpenFalconerSignal: boolean;
  ageExpired: boolean;
  /** Active only when the trade is open AND fresh. */
  isActive: boolean;
  direction: "LONG" | "SHORT" | "" | string;
  badgeText: string;
  badgeTone: "active-long" | "active-short" | "muted";
  /** e.g. "closed 14:05 · 3h ago", or null when no closed_at is stored. */
  closedMeta: string | null;
}

export function deriveFalconerSignalState(
  t: FalconerTradeLike | null | undefined,
  timeframe: string,
  now: Date = new Date(),
): FalconerSignalState {
  const hasSignal = !!t?.opened_at && !!t?.direction;
  const status = t?.status ?? null;
  const raw = (t?.direction || "").toLowerCase();
  const direction = raw === "long" ? "LONG" : raw === "short" ? "SHORT" : (t?.direction || "").toUpperCase();

  if (!hasSignal) {
    return {
      hasSignal: false, status, isOpenFalconerSignal: false, ageExpired: false,
      isActive: false, direction: "", badgeText: "NO SIGNAL", badgeTone: "muted", closedMeta: null,
    };
  }

  const isOpenFalconerSignal = status === "open";
  const ageExpired = isDynamicallyExpired(t!.opened_at!, timeframe);
  const isActive = isOpenFalconerSignal && !ageExpired;

  const badgeText = isActive
    ? `FALCONER ${direction}`
    : isOpenFalconerSignal
      ? `HISTORICAL ${direction}`
      : direction
        ? `CLOSED ${direction}`
        : "CLOSED";

  const closedMeta = t?.closed_at
    ? `closed ${formatPrintedLocal(t.closed_at, now)} · ${formatAge(t.closed_at)}`
    : null;

  return {
    hasSignal: true, status, isOpenFalconerSignal, ageExpired, isActive, direction,
    badgeText,
    badgeTone: isActive ? (direction === "LONG" ? "active-long" : "active-short") : "muted",
    closedMeta,
  };
}
