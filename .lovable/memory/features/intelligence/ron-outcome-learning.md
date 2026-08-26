---
name: RON outcome learning and 24/7 signal review
description: Durable material-event history, post-anchor follow-through outcomes, lessons ledger and the Signals review surface
type: feature
---

# RON outcome learning / 24/7 review

Server-side, user-independent. A user can be offline for days and still review every
material RON event and what happened afterwards.

## Storage
- `ron_material_events` — append-only, deterministic `event_key`
  (`ron_opp_ctx|instrument|timeframe|anchor|specN|rtN|change_type`), so re-evaluating an
  anchor can never duplicate an event. `material_change_type = none` and `data_blocked`
  never become events (RON stays quiet when nothing materially changed).
- `ron_event_reads` — per-user read state (the only client-writable table here).
- `ron_event_outcomes` — append-only, unique on (event, horizon, outcome_version).
- `ron_event_lessons` — post-event interpretation, unique on (event, lesson_version).

## Point-in-time separation (non-negotiable)
A = what RON knew at anchor T (immutable event/context) · B = what price did after T
(outcomes) · C = later interpretation (lessons). B and C always carry
`future_data_cutoff` and `reviewed_at`.

## Outcome semantics
Horizons 1/2/4/8/16 bars, closed bars only, never padded. Vocabulary is
follow-through/excursion (`aligned_follow_through`, `adverse_follow_through`,
`mixed_two_sided`, `flat_no_material_movement`, `direction_context_not_directional`) plus
MFE/MAE. Never "profit", "win", "loss", "R", probability or causality — no order, entry,
stop or size is assumed.

## Runtime
- `ron-context-scheduler` (every 5 min): one new completed 15m anchor per pilot
  instrument through Opportunity Context V2; XAUUSD stays on its frozen V1 scheduler.
- `ron-outcome-evaluate` (every 10 min): bounded batch, idempotent, marks an event
  `complete` only when every horizon has been observed.
- Venue truth must be `open` or `closed`; HK50 stays `calendar_unavailable` and is skipped.

## UI
Signals page → "24/7 Review" tab (`EventReviewTab`): chronological events, unread badge
until marked read, per-horizon outcomes with cutoffs, lesson note when written.
