/**
 * GAINEDGE_RON_ALWAYS_ON_RUNTIME_COMPLETION_V1 — lifecycle transition start time.
 *
 * Pure derivation of `state_since` from the append-only `ron_opportunity_context`
 * history. This is deliberately NOT stored as a new authoritative field: it is derived
 * from records the runtime already wrote, so it can never disagree with them.
 *
 * Truthfulness rules:
 *   • `state_since` is the evaluation anchor of the OLDEST contiguous record that shares
 *     the current lifecycle. It is an observed record time, never "now" and never a
 *     synthesised timestamp.
 *   • When the contiguous run reaches the oldest record we actually read, the true start
 *     is unknown and could be earlier. That case is reported with `bounded_by_window`,
 *     and callers must phrase it as "at least since", never "since".
 *   • A single record yields that record's own anchor with `bounded_by_window` true —
 *     one observation can never prove a transition happened at that moment.
 *   • Unparseable or empty history yields null. Absence is never filled in.
 */

export interface LifecycleHistoryRow {
  evaluation_anchor: string;
  lifecycle: string;
}

export interface LifecycleSince {
  /** Current lifecycle, taken from the newest record. */
  lifecycle: string;
  /** Anchor of the oldest contiguous record in the same lifecycle. */
  state_since: string;
  /** True when the run reaches the edge of the read window, so the start may be earlier. */
  bounded_by_window: boolean;
  /** Number of contiguous records observed in the current lifecycle. */
  observed_records: number;
  /** Anchor of the newest record the derivation used. */
  latest_anchor: string;
}

const norm = (v: unknown) => String(v ?? "").trim();

/** Newest-first ordering by evaluation anchor. Unparseable anchors are dropped. */
export function sortHistoryNewestFirst<T extends LifecycleHistoryRow>(rows: T[]): T[] {
  return [...(rows ?? [])]
    .filter((r) => r && Number.isFinite(Date.parse(r.evaluation_anchor)) && norm(r.lifecycle))
    .sort((a, b) => Date.parse(b.evaluation_anchor) - Date.parse(a.evaluation_anchor));
}

/**
 * Derives when the current lifecycle state began. Input order is irrelevant.
 * Returns null when there is no usable history.
 */
export function deriveStateSince(rows: LifecycleHistoryRow[]): LifecycleSince | null {
  const sorted = sortHistoryNewestFirst(rows);
  if (sorted.length === 0) return null;

  const lifecycle = norm(sorted[0].lifecycle);
  let index = 0;
  while (index + 1 < sorted.length && norm(sorted[index + 1].lifecycle) === lifecycle) index++;

  return {
    lifecycle,
    state_since: sorted[index].evaluation_anchor,
    // The run either exhausted the window, or is a single unconfirmed observation.
    bounded_by_window: index === sorted.length - 1,
    observed_records: index + 1,
    latest_anchor: sorted[0].evaluation_anchor,
  };
}

/**
 * Presentation-safe phrasing. The qualifier is part of the claim, not decoration:
 * a window-bounded run must never be rendered as a precise transition time.
 */
export function presentStateSince(since: LifecycleSince | null): {
  label: string; value: string | null; qualified: boolean;
} {
  if (!since) return { label: "No stored history", value: null, qualified: true };
  return {
    label: since.bounded_by_window ? "In this state at least since" : "In this state since",
    value: since.state_since,
    qualified: since.bounded_by_window,
  };
}
