

# Fix Most Volume Today: Session Status + History Analytics

## Problem Summary
- Asian session incorrectly shows "Upcoming" even after 08:00 UTC
- History popup shows no data because it reads from empty database tables
- No broker candle fetching in the History modal

## Plan

### 1. Create `src/lib/session-volume-analytics.ts` (new file)
Pure helper module that takes hourly `FormattedCandle[]` and computes per-session analytics:
- Groups candles by UTC hour into Asian/London/NY buckets
- Calculates peak hour, lowest hour, average volume per hour bucket
- Counts buy vs sell candles (close > open = buy) for direction bias
- Generates a tip string and overall pattern note per instrument
- Exports `buildInstrumentAnalytics(symbol, candles, requestedDays)` and `HISTORY_PERIOD_OPTIONS = [7, 14, 30]`

### 2. Update `src/services/metaapi-client.ts`
Add optional `lookbackDays` parameter to `fetchCandles()` (default 14, preserving current behavior). This lets the History modal request 7/14/30 days of hourly candles.

### 3. Rewrite `src/components/dashboard/VolumeHistoryModal.tsx`
- Remove old `SessionPattern` / `InstrumentAnalytics` interfaces (use shared helper)
- Add period selector dropdown (7 / 14 / 30 days) at top of modal
- On open: load user instruments, call `provisionAccount()` for broker accountId, then `fetchCandles(accountId, symbol, "1H", limit, periodDays)` for each instrument (with symbol variants like US30→DJ30)
- Pass candles to `buildInstrumentAnalytics()` for real calculated numbers
- Store results as `session_volume_pattern` insights (delete-then-insert to avoid duplicates)
- Show loading state, error state, and "Based on N days of data" label

### 4. Fix `src/components/dashboard/MostVolumeBar.tsx`
- Add `status: "completed" | "active" | "upcoming"` to `SessionRow` interface
- In the load function, explicitly assign status based on `new Date().getUTCHours()`:
  - `utcHour >= endUtc` → completed
  - `utcHour >= startUtc && utcHour < endUtc` → active
  - otherwise → upcoming
- Replace the rendering conditions to use `row.status` directly instead of re-deriving from `getCompletedSessions()`
- Completed sessions with no data show "No data recorded" in session color (not amber, not "Upcoming")
- Remove unused imports (`TrendingUp`, `SESSION_COLORS`)

### 5. Update `supabase/functions/compute-market-data/index.ts`
- Fix session boundaries: Asian 0-8, London 8-16, NY 16-21 (remove duplicate/overlapping definitions)
- Replace end-of-session detection with retroactive backfill: on each run, check which sessions are completed today, query `session_volume_summary` for existing rows, and for any missing session+symbol combo, fetch 1H candles from MetaApi for that session window and insert the summary
- Add `BROKER_SYMBOL_VARIANTS` map for symbol aliases
- Add `fetchSessionCandles()` and `buildSessionSummary()` helpers

### 6. No database migration needed
The `session_volume_summary` table and its structure already exist. The upsert uses `onConflict: "session,symbol,date"` which works with the existing schema.

## Technical Notes
- The History modal fetches candles client-side via the existing `metaapi-candles` edge function proxy (keeps token secure)
- Symbol variants (US30→DJ30, NAS100→USTEC) are tried in order; first successful fetch wins
- The background job backfills at most once per session per symbol per day (checks existing rows first)
- Period selector reloads analytics on change with a cleanup function to prevent stale state

