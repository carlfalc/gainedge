/**
 * GAINEDGE_RON_OUTCOME_LEARNING_AND_24_7_SIGNAL_REVIEW_V1 — 24/7 review surface.
 *
 * Chronological history of every material RON event that was recorded server-side,
 * whether or not anyone was online. For each event it shows, strictly separated:
 *   A. what RON recorded at the live anchor
 *   B. what price did afterwards, per completed horizon, with its future-data cutoff
 *   C. the later written review note, with its own review timestamp
 *
 * No probability, no trade result, no recommendation. Missing outcomes are shown as
 * still being observed, never guessed.
 */
import { C } from "@/lib/mock-data";
import {
  changeLabel, followThroughLabel, useRonEventReview,
} from "@/services/ron-event-review";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });

export default function EventReviewTab() {
  const { items, loading, error, unreadCount, reload, markAllRead } = useRonEventReview();

  return (
    <section className="space-y-3" data-testid="event-review-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm leading-relaxed" style={{ color: C.sec }}>
          Every material RON event recorded while you were away, with what price did afterwards.
          Observations only — no probability, no trade result, no order.
        </p>
        <div className="flex items-center gap-2">
          <span
            data-testid="event-review-unread"
            className="rounded-md px-2 py-1 text-[13px] uppercase tracking-widest"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
          >
            {unreadCount} unread
          </span>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-md px-2 py-1 text-[13px] uppercase tracking-widest"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-md px-2 py-1 text-[13px] uppercase tracking-widest"
            style={{ background: C.cardH, border: `1px solid ${C.border}`, color: C.sec }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="text-sm" style={{ color: C.sec }}>Loading recorded events…</p>}
      {error && <p className="text-sm" style={{ color: C.sec }}>Event history unavailable: {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm" style={{ color: C.sec }}>
          No material RON events have been recorded yet. RON stays quiet when nothing materially changed.
        </p>
      )}

      <ul className="space-y-2">
        {items.map(({ event, outcomes, lesson, unread }) => (
          <li
            key={event.id}
            data-testid="event-review-item"
            className="rounded-xl p-3"
            style={{
              background: C.card,
              border: `1px solid ${unread ? C.jade : C.border}`,
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold" style={{ color: C.text }}>
                  {event.instrument}
                </span>
                <span className="text-[13px] uppercase tracking-widest" style={{ color: C.sec }}>
                  {event.timeframe} · {changeLabel(event.material_change_type)}
                </span>
                {unread && (
                  <span className="text-[12px] uppercase tracking-widest" style={{ color: C.jade }}>
                    new
                  </span>
                )}
              </div>
              <span
                className="text-[13px]"
                style={{ color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {fmt(event.evaluation_anchor)}
              </span>
            </div>

            <p className="mt-1 text-[13px]" style={{ color: C.sec }}>
              Recorded at the anchor: lifecycle {event.lifecycle} · direction {event.direction_context}
              {" "}({event.direction_authority}) · setup {event.setup_family} · data {event.data_state}
              {event.venue_state ? ` · venue ${event.venue_state}` : ""}
            </p>

            <div className="mt-2">
              <p className="text-[12px] uppercase tracking-widest" style={{ color: C.sec }}>
                What happened afterwards
              </p>
              {outcomes.length === 0 ? (
                <p className="text-[13px]" style={{ color: C.sec }}>
                  Still being observed — no horizon has fully completed yet.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {outcomes.map((o) => (
                    <li
                      key={`${o.event_id}-${o.horizon_bars}`}
                      className="text-[13px]"
                      style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      +{o.horizon_bars} bars · {followThroughLabel(o.follow_through)} · move{" "}
                      {o.price_change_pct.toFixed(3)}% · max favourable {o.mfe} / max adverse {o.mae}
                      <span style={{ color: C.sec }}> · data through {fmt(o.future_data_cutoff)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lesson && (
              <p className="mt-2 text-[13px]" style={{ color: C.sec }}>
                Reviewed {fmt(lesson.reviewed_at)} (data cutoff {fmt(lesson.future_data_cutoff)}): {lesson.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
