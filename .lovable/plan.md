

## Plan: Add Win Streak and Trade Details to Win Rate Card

### What Changes
Enhance the **Win Rate** SpinCard's back (hover) side to show:
1. **Current win streak** (e.g., "🔥 5 consecutive wins") computed from actual signal history
2. **Session detail** (best/worst session based on real closed signal data)
3. **Trade breakdown** showing wins/losses count tied to the percentage on the front

### Technical Details

**File: `src/pages/dashboard/DashboardHome.tsx`**

1. **Compute streak in `loadData`**: After loading signals, calculate the current consecutive win streak from chronologically sorted closed signals. Also determine best/worst session by grouping closed signals by the hour they were closed and mapping to Asian/London/NY sessions.

2. **Add to state**: Extend `stats` to include `currentStreak: number` and `bestSession: string` / `worstSession: string`.

3. **Update Win Rate SpinCard back value**: Change from hardcoded "Best session: London overlap | Worst: Asian on indices" to use computed data:
   ```
   "🔥 3 consecutive wins | Best: London | Worst: Asian | 11/16 trades (69%)"
   ```

4. **Streak calculation logic**:
   - Sort closed signals by `closed_at` descending
   - Count consecutive "win" results from most recent backward
   - If current streak is losses, show "Current streak: 0 wins" or similar

Single file change. No new components or dependencies.

