/**
 * GAINEDGE_GLOBAL_SIGNAL_POPUP_V1 — pure helpers for the global Falconer signal
 * notification layer.
 *
 * Truthfulness rules enforced here:
 *   • Only stored `falconer_trades` fields are surfaced. No BUY/SELL board language,
 *     no probability, no confidence, no broker-execution claim.
 *   • Status and trigger labels reuse the confirmed maps in `signals-presentation.ts`.
 *     Unknown tokens are mechanically prettified with `unknown: true` and never
 *     assigned a meaning.
 *   • Live-mode records only. Backtest rows are ignored outright.
 *
 * RON note: RON decisions have no persisted realtime event path today, so RON popup
 * delivery is deliberately NOT implemented in this slice. It must wait for a genuine
 * realtime/persisted event source — polling is not an acceptable substitute.
 */
import {
  presentFalconerStatus, presentFalconerTrigger, relativeAge,
} from "@/lib/signals-presentation";

/** Visible stack cap. Older toasts fall off the stack but stay in dedupe history. */
export const MAX_VISIBLE_NOTIFICATIONS = 4;
/** Auto-dismiss interval in ms. */
export const NOTIFICATION_AUTO_DISMISS_MS = 12_000;

/** Small qualifier shown on every popup. */
export const NOTIFICATION_SOURCE_QUALIFIER = "Falconer strategy record · not a broker order";

export interface FalconerNotificationRow {
  id: string;
  symbol: string;
  timeframe: string;
  mode: string;
  direction: string | null;
  trigger_type: string | null;
  status: string | null;
  opened_at: string | null;
}

export type SignalEventKind = "new" | "status";

export interface SignalNotification {
  /** Deterministic dedupe key. */
  key: string;
  recordId: string;
  kind: SignalEventKind;
  symbol: string;
  timeframe: string;
  direction: string;
  statusLabel: string;
  statusUnknown: boolean;
  triggerLabel: string;
  triggerUnknown: boolean;
  openedAt: string | null;
  ageLabel: string;
  createdAt: number;
}

/** Mutable per-session dedupe/baseline state. Never shared across users. */
export interface SignalNotificationState {
  seen: Set<string>;
  statusById: Map<string, string>;
  baselineReady: boolean;
}

export function createSignalNotificationState(): SignalNotificationState {
  return { seen: new Set<string>(), statusById: new Map<string, string>(), baselineReady: false };
}

export function newEventKey(recordId: string): string {
  return `new:${recordId}`;
}

export function statusEventKey(recordId: string, status: string | null | undefined): string {
  return `status:${recordId}:${(status ?? "").trim()}`;
}

export function isLiveRow(row: FalconerNotificationRow | null | undefined): boolean {
  return (row?.mode ?? "").trim() === "live";
}

/**
 * Seeds dedupe history from rows that already existed at sign-in / first load.
 * Those rows must NEVER produce a popup — this is the no-historical-spam guarantee.
 */
export function applyBaseline(
  state: SignalNotificationState,
  rows: FalconerNotificationRow[],
): SignalNotificationState {
  for (const row of rows) {
    if (!isLiveRow(row)) continue;
    state.seen.add(newEventKey(row.id));
    state.seen.add(statusEventKey(row.id, row.status));
    state.statusById.set(row.id, (row.status ?? "").trim());
  }
  state.baselineReady = true;
  return state;
}

export function resetSignalNotificationState(state: SignalNotificationState): void {
  state.seen.clear();
  state.statusById.clear();
  state.baselineReady = false;
}

function directionToken(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "long") return "LONG";
  if (v === "short") return "SHORT";
  return (raw ?? "").trim().toUpperCase();
}

function buildNotification(
  row: FalconerNotificationRow,
  kind: SignalEventKind,
  key: string,
  now: Date,
): SignalNotification {
  const status = presentFalconerStatus(row.status);
  const trigger = presentFalconerTrigger(row.trigger_type);
  return {
    key,
    recordId: row.id,
    kind,
    symbol: row.symbol,
    timeframe: row.timeframe,
    direction: directionToken(row.direction),
    statusLabel: status.label,
    statusUnknown: status.unknown,
    triggerLabel: trigger.label,
    triggerUnknown: trigger.unknown,
    openedAt: row.opened_at,
    ageLabel: relativeAge(row.opened_at, now),
    createdAt: now.getTime(),
  };
}

/**
 * Derives at most one notification from an observed row, mutating dedupe state.
 * Returns null when the row is not live, the baseline has not been established,
 * or the event has already been seen in this authenticated browser session.
 */
export function deriveNotification(
  state: SignalNotificationState,
  row: FalconerNotificationRow,
  eventType: "INSERT" | "UPDATE",
  now: Date = new Date(),
): SignalNotification | null {
  if (!state.baselineReady) return null;
  if (!isLiveRow(row)) return null;

  const status = (row.status ?? "").trim();

  if (eventType === "INSERT") {
    const key = newEventKey(row.id);
    if (state.seen.has(key)) return null;
    state.seen.add(key);
    state.seen.add(statusEventKey(row.id, status));
    state.statusById.set(row.id, status);
    return buildNotification(row, "new", key, now);
  }

  const previous = state.statusById.get(row.id);
  // Only a genuine change to a new stored status value notifies.
  if (previous !== undefined && previous === status) return null;
  const key = statusEventKey(row.id, status);
  if (state.seen.has(key)) {
    state.statusById.set(row.id, status);
    return null;
  }
  state.seen.add(key);
  state.statusById.set(row.id, status);
  return buildNotification(row, "status", key, now);
}

/** Truthful deep link into the Falconer Signals tab, preserving the symbol. */
export function viewSignalHref(symbol: string, recordId?: string): string {
  const base = `/dashboard/signals?tab=falconer&symbol=${encodeURIComponent(symbol)}`;
  return recordId ? `${base}&record=${encodeURIComponent(recordId)}` : base;
}

/** Pushes a notification onto the visible stack, newest first, capped. */
export function pushVisible(
  current: SignalNotification[],
  next: SignalNotification,
  cap: number = MAX_VISIBLE_NOTIFICATIONS,
): SignalNotification[] {
  return [next, ...current.filter((n) => n.key !== next.key)].slice(0, cap);
}
