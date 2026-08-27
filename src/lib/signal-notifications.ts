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
 * RON note: RON opportunity-context popups are delivered from the append-only
 * `ron_opportunity_context` table (see the second section of this file). RON orchestrator
 * DECISIONS still have no persisted realtime event path and are deliberately NOT
 * surfaced here — polling would fabricate delivery semantics.
 */
import {
  presentFalconerStatus, presentFalconerTrigger, relativeAge,
} from "@/lib/signals-presentation";
import {
  isNotifiableMaterialChange, presentDirection, presentLifecycle, presentMaterialChange,
} from "@/lib/ron-opportunity-context-presentation";

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

/* ------------------------------------------------------------------------- *
 * GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1 — RON popups.
 *
 * The popup source is the DURABLE, append-only `ron_material_events` table: the same
 * record the 24/7 Review lane reads, written server-side whether or not anyone is
 * online. A popup is therefore a view onto a stored event, never a transient UI-only
 * artefact, and an offline user loses nothing — the event is still there on return.
 *
 * Only a stored, popup-capable material change notifies; a data condition never
 * notifies; and only instruments the user actually tracks are surfaced.
 * ------------------------------------------------------------------------- */

/** Small qualifier shown on every RON material-event popup. */
export const OPPORTUNITY_NOTIFICATION_QUALIFIER =
  "RON opportunity context record · descriptive only, not a trade instruction";

export interface OpportunityNotificationRow {
  id: string;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  lifecycle: string;
  direction_context: string;
  material_change_type: string;
  data_state?: string;
  data_blocked?: boolean | null;
  /**
   * Durable material-event fields. `event_key` is the server's deterministic dedupe
   * identity, so the same event re-delivered under a new row id still pops once.
   * `popup_capable` is the server's own decision and is never overridden here.
   */
  event_key?: string | null;
  popup_capable?: boolean | null;
}

export interface OpportunityNotification {
  key: string;
  recordId: string;
  kind: "opportunity";
  symbol: string;
  timeframe: string;
  lifecycleLabel: string;
  changeLabel: string;
  directionLabel: string;
  anchor: string;
  ageLabel: string;
  createdAt: number;
}

export interface OpportunityNotificationState {
  seen: Set<string>;
  baselineReady: boolean;
  /**
   * Realtime events that arrived before the baseline finished loading. Dropping them
   * would silently lose a genuine stored event, so they are replayed once the baseline
   * is known and then deduped normally.
   */
  pending: OpportunityNotificationRow[];
}

export function createOpportunityNotificationState(): OpportunityNotificationState {
  return { seen: new Set<string>(), baselineReady: false, pending: [] };
}

export function resetOpportunityNotificationState(state: OpportunityNotificationState): void {
  state.seen.clear();
  state.baselineReady = false;
  state.pending = [];
}

export function opportunityEventKey(row: { id: string; event_key?: string | null }): string {
  const durable = (row.event_key ?? "").trim();
  return durable ? `event:${durable}` : `opportunity:${row.id}`;
}

/** Holds a pre-baseline realtime row so no genuine stored event is dropped. */
export function bufferOpportunityRow(
  state: OpportunityNotificationState,
  row: OpportunityNotificationRow,
  cap = 50,
): void {
  state.pending = [...state.pending.filter((r) => opportunityEventKey(r) !== opportunityEventKey(row)), row]
    .slice(-cap);
}

/** Drains rows buffered before the baseline; each is subject to the normal rules. */
export function drainBufferedOpportunities(
  state: OpportunityNotificationState,
  tracked: Set<string>,
  now: Date = new Date(),
): OpportunityNotification[] {
  const rows = state.pending;
  state.pending = [];
  return rows
    .map((row) => deriveOpportunityNotification(state, row, tracked, now))
    .filter((n): n is OpportunityNotification => n !== null);
}


/** Rows already stored at first load never pop up. */
export function applyOpportunityBaseline(
  state: OpportunityNotificationState,
  rows: OpportunityNotificationRow[],
): OpportunityNotificationState {
  for (const row of rows) state.seen.add(opportunityEventKey(row));
  state.baselineReady = true;
  return state;
}

export function normaliseTrackedInstruments(symbols: string[]): Set<string> {
  return new Set(symbols.map((s) => (s ?? "").trim().toUpperCase()).filter(Boolean));
}

/**
 * Derives at most one opportunity popup from a persisted row, mutating dedupe state.
 * Returns null unless the row is a genuine, tracked, non-data material change.
 */
export function deriveOpportunityNotification(
  state: OpportunityNotificationState,
  row: OpportunityNotificationRow,
  tracked: Set<string>,
  now: Date = new Date(),
): OpportunityNotification | null {
  if (!state.baselineReady) return null;
  if (!row?.id || !row.instrument) return null;
  if (!tracked.has(row.instrument.trim().toUpperCase())) return null;
  if (row.data_blocked === true) return null;
  if (!isNotifiableMaterialChange(row.material_change_type)) return null;

  const key = opportunityEventKey(row);
  if (state.seen.has(key)) return null;
  state.seen.add(key);

  return {
    key,
    recordId: row.id,
    kind: "opportunity",
    symbol: row.instrument,
    timeframe: row.timeframe,
    lifecycleLabel: presentLifecycle(row.lifecycle).label,
    changeLabel: presentMaterialChange(row.material_change_type).label,
    directionLabel: presentDirection(row.direction_context).label,
    anchor: row.evaluation_anchor,
    ageLabel: relativeAge(row.evaluation_anchor, now),
    createdAt: now.getTime(),
  };
}

/** Deep link into the RON Opportunities lane for this pair. */
export function viewOpportunityHref(symbol: string): string {
  return `/dashboard/signals?tab=ron&symbol=${encodeURIComponent(symbol)}`;
}

export function pushVisibleOpportunity(
  current: OpportunityNotification[],
  next: OpportunityNotification,
  cap: number = MAX_VISIBLE_NOTIFICATIONS,
): OpportunityNotification[] {
  return [next, ...current.filter((n) => n.key !== next.key)].slice(0, cap);
}
