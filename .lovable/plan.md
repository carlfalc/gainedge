

## Ensure All Data is Live Broker Data — Remove Mock Fallbacks

### Problem
The RON PATTERN bar shows wrong targets (e.g. "bearish move to 2289" for Gold at 3300+) because:
1. The client-side mock data generator (`src/lib/mock-candles.ts`) has base prices from 2024 (XAUUSD: 2340)
2. The edge function returns mock candles with a `fallback: true` flag, but the client ignores this flag and treats mock data as real
3. When the connection is "demo", mock tick updates with random noise run instead of live polling

Since you have a live Eightcap demo account connected, the system should always use real broker data and never silently substitute fake data.

### Changes

**`src/services/metaapi-client.ts`** — Detect and reject mock fallback data:
- In `fetchCandles()`, check if the edge function response contains `fallback: true`
- If so, return an empty array instead of fake candles, forcing the UI to show a clear "no data" state rather than misleading mock data
- Same for `fetchCurrentPrice()` — check for `fallback: true` and return `null`

**`src/pages/dashboard/ChartsPage.tsx`** — Remove silent mock fallback:
- Remove the `generateMockCandles` import and the fallback at line 489 that silently shows fake data when live fetch fails
- Instead, show a clear error message: "Unable to load live data for [symbol]. Check broker connection."
- Remove `startMockTicks()` — when live price polling fails, show the last known state instead of generating random noise
- Keep the connection status indicator (Green/Orange/Red) but make "demo" mode show stale data clearly rather than fake data

**`src/lib/mock-candles.ts`** — Update base prices as a safety net:
- Even though we're removing mock fallback usage, update `BASE_PRICES` to current levels as a safety net for any remaining references:
  - XAUUSD: 2340 → 3300
  - US30: 39800 → 42500
  - NAS100: 18500 → 20200
  - BTCUSD: 67500 → 83000
  - ETHUSD: 3450 → 1600
  - USDJPY: 157.50 → 143.50
  - SPX500/US500: 5280 → 5500
  - XAGUSD: 29.50 → 33.00

**`supabase/functions/metaapi-candles/index.ts`** — No changes needed (edge function mock prices are already current at XAUUSD: 4720, and the `fallback: true` flag is already set)

### Impact on RON Pattern Detection & Insights
- Pattern detection runs on the candle data it receives — with real broker data, all targets, entry prices, pip calculations, and RON Stats will be accurate
- The insights persistence (pattern outcomes) will record real market moves, building genuine intelligence over time
- No changes needed to the pattern detection logic itself

### Files to modify
- `src/services/metaapi-client.ts` — reject fallback responses
- `src/pages/dashboard/ChartsPage.tsx` — remove mock fallback, show clear errors
- `src/lib/mock-candles.ts` — update base prices as safety net

