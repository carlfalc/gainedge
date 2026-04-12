

## Plan: Session Buy/Sell Insight Lines in Most Volume Today

### What You'll See
Each session row (Asian, London, New York) in the "Most Volume Today" panel will show a second line with:
- **Green text**: Best BUY opportunity — instrument, precise timeframe, and rolling average bias %
- **Red text**: Best SHORT opportunity — instrument, precise timeframe, and rolling average bias %

These update automatically as more data accumulates each session/day, so the best time and percentage evolve over time rather than being locked to a fixed hour.

### Technical Details

#### 1. Enhance analytics to store precise peak times (`session-volume-analytics.ts`)
- Currently `peakHourUtc` is a whole hour (e.g., 11). Enhance `buildInstrumentAnalytics` to also compute a **weighted midpoint within that hour** using candle timestamps, producing a more precise time like "11:20 AM" instead of just "11:00 AM".
- Add `bestBuyHourUtc` and `bestSellHourUtc` fields to `SessionPattern` — the hour with the highest buy bias and highest sell bias respectively (currently only overall `buyPct`/`sellPct` exist, not per-hour direction bias).

#### 2. Store richer insight data (`VolumeHistoryModal.tsx`)
- Include the new precise time and per-hour buy/sell bias data in the `insights` table `data` JSONB, so `MostVolumeBar` can read it without re-computing.
- Each time the History modal runs or a session ends, insights are upserted — the rolling average naturally updates as more candle data is included over time.

#### 3. Fetch and display insights in `MostVolumeBar.tsx`
- In the `load()` function, also fetch `session_volume_pattern` insights from the `insights` table for the current user.
- Add a `SessionInsight` interface with `bestBuySymbol`, `bestBuyTime` (precise, e.g. "11:20 AM"), `bestBuyPct`, `bestSellSymbol`, `bestSellTime`, `bestSellPct`.
- For each completed or active session, find the instrument with the highest `buyPct` for that session (best buy) and highest `sellPct` (best short) from stored insights across all user instruments.
- Render a compact second line below each session row:
  - Green: `▲ Best BUY: NAS100 @ 11:20 AM (62% avg bias)`
  - Red: `▼ Best SHORT: XAUUSD @ 3:45 AM (58% avg bias)`
- Only shown when insight data exists for that session.

#### 4. Auto-trigger insight refresh at session end
- In `MostVolumeBar`, when a session transitions to "completed" and no insights exist for today, trigger a lightweight background analytics run (fetch hourly candles → `buildInstrumentAnalytics` → store insights). This ensures insights stay fresh without requiring the user to open History.

### Key User Clarification Addressed
- Times will be **precise** (e.g., 11:20 AM), not rounded to full hours — computed from weighted candle timestamps within the peak hour bucket.
- Percentages are **rolling averages** that update each session as new data accumulates — not static snapshots. Each day's new candles shift the average.

### Files Modified
| File | Change |
|------|--------|
| `src/lib/session-volume-analytics.ts` | Add precise peak time calculation, per-hour buy/sell direction tracking |
| `src/components/dashboard/MostVolumeBar.tsx` | Fetch insights, render buy/sell insight line per session, auto-trigger refresh |
| `src/components/dashboard/VolumeHistoryModal.tsx` | Store enriched data (precise times, per-hour bias) in insights |

No database changes required — the existing `insights` table JSONB `data` column handles the richer payload.

