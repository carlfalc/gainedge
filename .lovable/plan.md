

## Add RON Pattern Historical Statistics to the Pattern Bar

### What
Below the current and previous pattern lines in the RON PATTERN bar, add a third line showing RON's historical intelligence for the detected pattern: how often this pattern historically reaches its target, and how frequently it appears for the user's selected instrument. This gives traders confidence data before entering.

### UI Layout

```text
RON PATTERN | Double Top — ⬇ Potential bearish move | Target: 3,280 | 7/10 | 14:20:05 | 3 S/R | [Labels ON]
              Prev: Head & Shoulders — ⬇ Bearish ✓ Confirmed | Moved 45 pips ↓ | 14:15:32
              🧠 RON Stats: Double Top historically hits target 68% of the time | Appears ~4x per week on XAUUSD
```

The third line uses a brain icon and is styled in cyan/teal (`text-[#00CFA5]/70`, `text-[9px]`) to associate it with RON's intelligence.

### How

**`src/pages/dashboard/ChartsPage.tsx`** — all changes in this single file:

1. **Add a pattern statistics map** — a local constant mapping each of the 8 named patterns to their known historical stats:
   - `targetHitRate`: percentage the pattern historically reaches target (sourced from well-known technical analysis data)
   - `avgFrequency`: typical weekly appearance description
   - `avgPipMove`: average pip movement after pattern confirmation
   
   Example:
   ```typescript
   const PATTERN_STATS: Record<string, { targetHitRate: number; avgPipMove: string; direction: string }> = {
     "Double Top": { targetHitRate: 65, avgPipMove: "40-80", direction: "bearish" },
     "Double Bottom": { targetHitRate: 65, avgPipMove: "40-80", direction: "bullish" },
     "Head & Shoulders": { targetHitRate: 70, avgPipMove: "60-120", direction: "bearish" },
     "Ascending Triangle": { targetHitRate: 72, avgPipMove: "30-60", direction: "bullish" },
     "Descending Triangle": { targetHitRate: 72, avgPipMove: "30-60", direction: "bearish" },
     "Bull Flag": { targetHitRate: 67, avgPipMove: "25-50", direction: "bullish" },
     "Bear Flag": { targetHitRate: 67, avgPipMove: "25-50", direction: "bearish" },
   };
   ```

2. **Query insights table for user-specific pattern history** — when a new pattern is detected, query the `insights` table for `insight_type = 'pattern_outcome'` matching the pattern name and symbol. Calculate:
   - How many times this pattern was previously detected for this instrument
   - How many times it was confirmed vs invalidated (from the outcome tracking already planned)
   - Display a personalized hit rate if enough data exists, otherwise fall back to the general stats

3. **Add the stats line to the RON PATTERN bar JSX** — below the previous pattern line:
   ```text
   🧠 RON Stats: "Double Top" hits target ~65% historically | Avg move: 40-80 pips | [X seen on XAUUSD]
   ```
   - If user has personal history from insights: `"Your history: 3/5 confirmed (60%)"` appended
   - Styled `text-[9px] text-[#00CFA5]/60` with brain emoji prefix

4. **Persist pattern outcomes to insights** — when a pattern rotates from current to previous (already captured in `patternHistory` update logic), insert a row into `insights` table:
   - `insight_type: "pattern_outcome"`
   - `symbol`: current instrument
   - `title`: pattern name
   - `description`: confirmed/invalidated + pip move
   - `data`: JSON with `{ pattern_name, direction, entryPrice, exitPrice, pipMove, confirmed }`

### Files to modify
- `src/pages/dashboard/ChartsPage.tsx` — pattern stats map, insights query, UI line, and outcome persistence

