

# Replace "Expiring Soon" with Next-Scan Countdown

## Summary
Remove the static "Expiring soon" / "Awaiting next scan" labels and replace them with a live countdown timer showing when the next candle close (and therefore the next scan) will occur for each instrument.

## How It Works
Each instrument has a configured timeframe (e.g. 5m, 15m, 1H). Since the cron job scans on every candle close, the next scan time can be calculated by rounding the current time up to the next timeframe boundary. For example, if the timeframe is 15m and it's currently 10:37, the next scan is at 10:45 — countdown shows "8m".

## Changes

### 1. Add `nextScanCountdown` helper (in `src/lib/expiry.ts`)
- New function `nextScanSeconds(timeframe: string): number` — calculates seconds until the next candle close based on the timeframe string (1m, 5m, 15m, 1H, 4H, 1D).
- New function `formatCountdown(seconds: number): string` — returns e.g. "2m 14s", "1h 03m", "12s".

### 2. Update DashboardHome.tsx
- Remove the `"aging"` check that shows "⏰ Expiring soon" (line ~255-259).
- Remove or rework the `"expired"` footer showing "Awaiting next scan..." (line ~293-297).
- Add a `useEffect` with a 1-second `setInterval` to keep a `now` timestamp ticking, driving live countdowns.
- For each instrument tile, compute the countdown using `nextScanSeconds(instrumentTfs.get(inst.symbol))` and display it inline — e.g. "Next scan: 8m 32s".
- Keep the existing expiry/dimming logic for signals that have genuinely aged past their timeframe-based lifetime (the dynamic expiry policy already in place).

### 3. Update `signalFreshness` usage
- The freshness function still uses hardcoded 20-minute thresholds. Update `recentScans` filtering (line 154) to use the dynamic expiry lifetimes (1m→1h, 5m→4h, 15m→12h, 1H→24h, 4H→48h, 1D→5d) so that the "expired" dimming matches the actual signal lifecycle.

## Files Modified
| File | Change |
|------|--------|
| `src/lib/expiry.ts` | Add `nextScanSeconds()`, `formatCountdown()`, and `dynamicExpiryMinutes()` |
| `src/pages/dashboard/DashboardHome.tsx` | Replace "Expiring soon" / "Awaiting next scan" with live countdown; fix expiry filtering to use dynamic lifetimes |

