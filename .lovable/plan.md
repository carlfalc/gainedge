# GAINEDGE_SIGNALS_V1_AUDIT — read-only findings + proposed V1 scope

No code was edited, committed or deployed. Database access was read-only counts.

## 1. What was inspected

Page / route
- `src/App.tsx` — route `/dashboard/signals` → `SignalsPage`
- `src/pages/dashboard/SignalsPage.tsx` (127 lines, entire page)
- `src/lib/dashboard-nav.ts` — nav entry `nav.signals`

Directly supporting frontend data paths
- `src/integrations/supabase/client.ts` (direct table read + realtime)
- `src/lib/mock-data.ts` (`C` palette only)
- `src/lib/falconer-signal-state.ts` (truthful Falconer state derivation — **not used by Signals**, only by `InstrumentCard`)
- `src/lib/expiry.ts`, `src/lib/signal-time.ts` (freshness/age/market-closed helpers — **not used by Signals**)
- `src/services/ron-decisions.ts` + `src/pages/dashboard/RonDecisionPage.tsx`, `src/components/ron/*` (adjacent, unlinked)
- `src/services/ron-snapshots.ts` (v7 pin, `ronStateFrom`) — **not used by Signals**
- `src/lib/ask-ron-context.ts`, `src/lib/charts-context.ts`, `src/lib/pattern-preview.ts` (deep-link surfaces that exist and are unused here)

Data reality checked (read-only)
- `falconer_trades`: 666 rows total, **1 with `mode='live'`** (status `be_active`, opened 2026-08-10), 665 `backtest`; 0 rows `status='open'`
- `ron_orchestrator_decisions`: 5 rows, latest `as_of` 2026-08-21 11:45Z
- `ron_market_snapshots`: feature_version 7 → **1 row**; version 6 → 12,243 rows

## 2. Current page anatomy

One flat page, no components:
1. H1 "Falconer Signal Records" + a governance qualifier paragraph.
2. Optional error banner.
3. Loading text / empty state with a single "Open Strategy settings" button.
4. A single monospace table: Opened · Symbol · Trigger · Status · Entry · SL · TP1/2/3 · P&L.

Data path: one query — `falconer_trades` filtered `user_id = session.user.id` and `mode='live'`, ordered `opened_at desc`, limit 100 — plus a realtime subscription on the whole `falconer_trades` table that re-runs the query on any change.

## 3. Truth / data issues

Critical
- **The page is effectively always empty.** Only one `mode='live'` row exists across the whole table, from 2026-08-10. Everything the engine has produced is `mode='backtest'` and silently excluded, so a user sees "No Falconer signal records yet" while 665 records exist.
- **No timeframe anywhere.** Rows carry `timeframe` in the table but the query does not select it and the UI never shows it. Instrument identity is a bare `symbol` string with no broker/feed identity and no canonical-symbol resolution.
- **Zero freshness truth.** No generated/evaluated age, no completed-candle anchor, no quote age, no session context, no market-closed state. `opened_at` is printed with raw `toLocaleString()` and nothing marks a stale row as stale — despite `expiry.ts` / `signal-time.ts` / `falconer-signal-state.ts` already providing exactly these primitives and being used correctly on the Dashboard.
- **Raw status tokens leak.** `closed_sl`, `closed_ha_flip`, `be_active` render verbatim; there is no lifecycle vocabulary and no active-vs-historical distinction on the page.

High
- **Ambiguous provenance.** The page is Falconer-only, but titled generically enough that users read it as "RON signals". It has no relationship at all to RON V8 stored decisions, HA Pattern Intelligence V1, Opportunity Context V1, Pattern Context, or the 11-pattern snapshot catalogue.
- **No point-in-time reconstruction.** Rows show current mutable columns only; nothing records what the evidence looked like when the signal was generated, and there is no link to a decision/evidence hash.
- **Realtime is unscoped** — it listens to every `falconer_trades` change (all users, all modes) and refetches, which is noisy and wasteful.
- **P&L is presented unqualified** as `$x.xx` with no currency/lot/commission/swap context, even though `commission_usd`, `swap_usd`, `slippage_points`, `actual_entry_price` exist on the row.

Medium
- **Snapshot lineage risk adjacent to this page.** Live readers are pinned to feature_version 7 but only one v7 row exists (12,243 v6 rows). Signals V1 must not build on snapshot reads until v7 has real coverage. No v4/v6 assumption exists *inside* Signals today (it reads no snapshots at all) — the risk is in what V1 would add.
- **No deep links.** Nothing navigates to Charts, RON Decision, Ask RON, Pattern Preview, or evidence.
- **Mobile:** a `minWidth: 860px` table inside a horizontal scroller — usable but a raw data grid, not a workflow surface.

Low
- All-inline styles, no shadcn/token usage, no memoised formatting; hardcoded `#E2E8F0` in the `td` style bypasses the palette.
- Error copy is good; empty state offers only one action.

## 4. Genuine vs placeholder

- **Genuine:** every rendered value comes from a real `falconer_trades` row. Nothing is synthetic, mocked or hardcoded, and there are no invented confidence, probability or win-rate numbers anywhere on the page.
- **Effectively placeholder:** the page itself — the `mode='live'` filter makes it a permanently empty shell in practice.
- **UI invention risk (not yet present):** there is no persisted `opportunity / watch / forming / confirmed / weakening / invalidated` state anywhere. `ronStateFrom()` derives WAIT/WATCH/SETUP FORMING client-side from snapshot features; RON's persisted vocabulary is decision `state` + evidence `status`/`recommendation`. Signals V1 must source lifecycle from persisted evidence, never invent it.

## 5. Recommended Signals V1 information architecture

Two clearly labelled, separately sourced sections — never blended:

```text
Signals
├── Header: scope + governance line + feed/market-status strip
│     "records only — no orders placed"; market open/closed; last evaluation age
├── A. Live opportunity lane  (source: RON stored decisions, per tracked pair)
│     one card per tracked instrument+timeframe
│     · instrument · timeframe · state (stored token, plain-English) 
│     · evaluated at + age + completed-candle anchor + session
│     · what supports / what weakens (from stored explanation)
│     · "not calibrated" probability posture, verbatim from the read contract
│     · links: Charts · RON Decision · Ask RON · Pattern Preview
└── B. Falconer signal history  (source: falconer_trades, mode shown explicitly)
      mode filter (live / backtest) with counts, timeframe column,
      plain-English lifecycle badge via deriveFalconerSignalState(),
      opened + closed times with age, levels, qualified P&L
```

Principles: lifecycle over confidence; every row states instrument, timeframe, time, age and source; no BUY/SELL styling; expired/closed rows dim rather than disappear.

## 6. Recommended RON interactions / deep links

- Per opportunity card and per history row: **Charts** (`/dashboard/charts?symbol=&timeframe=`), **RON Decision** (`/dashboard/ron-decision?instrument=&timeframe=`), **Ask RON** (`askRonContextHref`), **Pattern Preview** (existing modal, reusing `pattern-preview.ts`).
- Evidence disclosure reuses `RonEvidenceList` / `RonExplanationPanels` rather than a second presentation layer.

## 7. Proposed contained scope for Signals V1

Frontend/presentation only:
- Rewrite `src/pages/dashboard/SignalsPage.tsx` as a thin composition.
- New `src/components/signals/*`: `SignalsHeader`, `OpportunityLane`, `OpportunityCard`, `FalconerHistoryTable`, `SignalsEmptyState`.
- New pure `src/lib/signals-presentation.ts`: mode/status vocabulary, age + anchor lines, deep-link builders — fully unit-tested.
- Reuse (do not fork): `falconer-signal-state.ts`, `expiry.ts`, `signal-time.ts`, `ron-decisions.ts`, `ron-decision-explorer.ts`, `ask-ron-context.ts`, existing `components/ron/*`.
- Scope the realtime channel to the signed-in user.
- New test file `src/test/gainedge-signals-v1.test.tsx`.

Explicitly out of scope: any backend/edge/migration change, RON V8 / HA V1 / Opportunity Context V1 / Falconer / MetaAPI / schedulers / ingestion / research / global nav, and any trade execution.

## 8. Must be resolved before UI work starts

1. **Mode policy decision.** Keep `mode='live'` only (page stays empty), or surface backtest records behind an explicit, labelled filter. This determines whether Signals V1 has any content at all.
2. **Opportunity-lane source.** Confirm the lane reads RON stored decisions via `ron-decision-read` per tracked pair (5 decisions exist today, XAUUSD-centric) — and accept that pairs with no stored record show an honest "no record yet" tile.
3. **Lifecycle vocabulary sign-off.** Agree the exact plain-English mapping for stored tokens (`open`, `be_active`, `closed_sl`, `closed_tp3`, `closed_ha_flip`, and RON decision states) so nothing is invented.
4. **Point-in-time expectation.** Confirm V1 only claims "current stored row + linked decision record", since `falconer_trades` has no per-row evidence snapshot.
5. **Snapshot v7 coverage.** Do not base any Signals surface on `ron_market_snapshots` until v7 has meaningful coverage (currently 1 row).

GAINEDGE_SIGNALS_V1_AUDIT_READY
