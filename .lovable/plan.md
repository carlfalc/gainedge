

# Plan: 24/7 Automated Scanning — Remove Scan Button & Add Continuous Loops

## Summary
Make the platform fully autonomous: remove the manual "Run Scan" button, set up a background cron job to trigger scanning every minute, ensure the shortest timeframe per instrument is always used, and add polling intervals for sentiment.

## Changes

### 1. Database Migration — Enable `pg_cron` and `pg_net`
- SQL migration to enable both extensions so background jobs can call edge functions on a schedule.

### 2. Schedule Cron Job (SQL insert, not migration)
- Create a `pg_cron` schedule that calls `compute-market-data` every minute via `pg_net`.
- This runs 24/7 regardless of whether any user has the dashboard open.

### 3. Fix shortest-timeframe resolution in `compute-market-data`
**Current bug (lines 748-762):** When grouping instruments per user, if the same symbol appears multiple times (different chart contexts/timeframes), only the first row is kept. The global `symbolTfSet` also only stores one timeframe per symbol.

**Fix:** When deduplicating, compare timeframes and keep the shortest. For `symbolTfSet`, also resolve to the minimum across all users.

This ensures all timeframe loops are always running at the fastest configured interval — if XAUUSD is on 5m and 15m charts, the scan fires every 5m candle close.

### 4. Remove "Run Scan" button from `DashboardHome.tsx`
- Delete `scanning` state, `handleScan` function, and the scan button JSX.
- Remove the `Loader2` and `Play` icon imports if no longer used elsewhere.

### 5. Add client-side 30-second polling fallback in `DashboardHome.tsx`
- Add a `useEffect` with a 30-second interval calling `triggerMarketDataCompute()` as a safety net alongside the cron job.
- The existing realtime subscription handles instant UI updates when data changes.

### 6. Add 10-minute sentiment polling in `NewsSentimentPanel.tsx`
- Add an interval that re-fetches sentiment data every 10 minutes automatically.

## Files Modified
| File | Change |
|------|--------|
| `supabase/functions/compute-market-data/index.ts` | Fix shortest-timeframe resolution (lines 748-762) |
| `src/pages/dashboard/DashboardHome.tsx` | Remove scan button + add 30s polling interval |
| `src/components/dashboard/NewsSentimentPanel.tsx` | Add 10-minute polling |
| New database migration | Enable `pg_cron` + `pg_net` extensions |
| SQL insert (non-migration) | Schedule the cron job |

