/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — read model for the offline
 * review surface.
 *
 * Everything here is READ-ONLY against server-written records, except the per-user read
 * state, which is the only thing a client may write. The UI can never fabricate an event,
 * an outcome or a lesson: an absent record is shown as absent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RonMaterialEvent {
  id: string;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  material_change_type: string;
  lifecycle: string;
  direction_context: string;
  direction_authority: string;
  setup_family: string;
  data_state: string;
  venue_state: string | null;
  popup_capable: boolean;
  outcome_state: string;
  decision_id: string | null;
  spec_version: number;
  runtime_version: number;
  created_at: string;
}

export interface RonEventOutcome {
  event_id: string;
  horizon_bars: number;
  price_change: number;
  price_change_pct: number;
  mfe: number;
  mae: number;
  follow_through: string;
  future_data_cutoff: string;
  reviewed_at: string;
}

export interface RonEventLesson {
  event_id: string;
  reviewed_at: string;
  future_data_cutoff: string;
  horizons_covered: number[];
  lifecycle_path: string[];
  reason_tags: string[];
  note: string;
}

export interface ReviewItem {
  event: RonMaterialEvent;
  outcomes: RonEventOutcome[];
  lesson: RonEventLesson | null;
  unread: boolean;
}

const EVENT_COLUMNS =
  "id,instrument,timeframe,evaluation_anchor,material_change_type,lifecycle,direction_context," +
  "direction_authority,setup_family,data_state,venue_state,popup_capable,outcome_state," +
  "decision_id,spec_version,runtime_version,created_at";

/** Plain-English label for a material change. No probability, no recommendation. */
export const CHANGE_LABELS: Record<string, string> = {
  new_forming: "New setup forming",
  strengthened: "Setup strengthened",
  confirmed: "Setup confirmed",
  weakened: "Setup weakened",
  direction_reversal: "Direction context reversed",
  invalidated: "Setup invalidated",
};

/** Plain-English label for an observed follow-through. Never a trade result. */
export const FOLLOW_THROUGH_LABELS: Record<string, string> = {
  aligned_follow_through: "Price moved with the stated direction",
  adverse_follow_through: "Price moved against the stated direction",
  mixed_two_sided: "Price moved both ways",
  flat_no_material_movement: "No material movement",
  direction_context_not_directional: "No directional context to compare against",
};

export function changeLabel(type: string): string {
  return CHANGE_LABELS[type] ?? type;
}

export function followThroughLabel(state: string): string {
  return FOLLOW_THROUGH_LABELS[state] ?? state;
}

/** Groups outcomes/lessons onto their event and flags what the user has not seen yet. */
export function composeReview(
  events: RonMaterialEvent[],
  outcomes: RonEventOutcome[],
  lessons: RonEventLesson[],
  readIds: Set<string>,
): ReviewItem[] {
  const byEvent = new Map<string, RonEventOutcome[]>();
  for (const o of outcomes) {
    const list = byEvent.get(o.event_id) ?? [];
    list.push(o);
    byEvent.set(o.event_id, list);
  }
  const lessonBy = new Map(lessons.map((l) => [l.event_id, l]));
  return events.map((event) => ({
    event,
    outcomes: (byEvent.get(event.id) ?? []).sort((a, b) => a.horizon_bars - b.horizon_bars),
    lesson: lessonBy.get(event.id) ?? null,
    unread: !readIds.has(event.id),
  }));
}

export function useRonEventReview(limit = 100) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: events, error: evErr } = await supabase
      .from("ron_material_events")
      .select(EVENT_COLUMNS)
      .order("evaluation_anchor", { ascending: false })
      .limit(limit);
    if (evErr) {
      setError(evErr.message);
      setItems([]);
      setLoading(false);
      return;
    }
    const list = (events ?? []) as unknown as RonMaterialEvent[];
    const ids = list.map((e) => e.id);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    const [outcomes, lessons, reads] = await Promise.all([
      supabase.from("ron_event_outcomes")
        .select("event_id,horizon_bars,price_change,price_change_pct,mfe,mae,follow_through,future_data_cutoff,reviewed_at")
        .in("event_id", ids),
      supabase.from("ron_event_lessons")
        .select("event_id,reviewed_at,future_data_cutoff,horizons_covered,lifecycle_path,reason_tags,note")
        .in("event_id", ids),
      userId
        ? supabase.from("ron_event_reads").select("event_id").eq("user_id", userId).in("event_id", ids)
        : Promise.resolve({ data: [] as { event_id: string }[] }),
    ]);
    const readIds = new Set(((reads as { data?: { event_id: string }[] }).data ?? [])
      .map((r) => String(r.event_id)));
    setItems(composeReview(
      list,
      (outcomes.data ?? []) as unknown as RonEventOutcome[],
      (lessons.data ?? []) as unknown as RonEventLesson[],
      readIds,
    ));
    setLoading(false);
  }, [limit]);

  useEffect(() => { void load(); }, [load]);

  const unreadCount = useMemo(() => items.filter((i) => i.unread).length, [items]);

  const markAllRead = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;
    const unread = items.filter((i) => i.unread).map((i) => ({ user_id: userId, event_id: i.event.id }));
    if (unread.length === 0) return;
    await supabase.from("ron_event_reads").upsert(unread, { onConflict: "user_id,event_id" });
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
  }, [items]);

  return { items, loading, error, unreadCount, reload: load, markAllRead };
}
