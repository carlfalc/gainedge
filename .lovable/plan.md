
Goal
- Fix the Charts page bug where toggling Candlestick and Heiken Ashi while the chart is maximized makes the candles collapse into a flat line.

What I found
- The Heiken Ashi helper in `src/lib/chart-indicators.ts` already uses the correct formula.
- The main issue is in `src/pages/dashboard/ChartsPage.tsx`: `buildChart` is meant to ignore `chartType`, but it still rebuilds on every toggle because it depends on `startPricePolling`, and `startPricePolling` / `startMockTicks` both depend on `chartType`.
- So when the chart is maximized, a mode switch can destroy and recreate the chart during the fullscreen layout cycle, which is the most likely cause of the flattened rendering.

Plan
1. Decouple chart-type switching from chart rebuilds
   - Remove `chartType` from the polling callback dependency chain.
   - Use `chartTypeRef.current` inside live/mock tick updates so polling respects the current mode without forcing `buildChart` to change.

2. Centralize the displayed candle transformation
   - Add one helper in `ChartsPage.tsx` to derive the displayed candles from `rawDataRef.current`:
     - Candlestick: raw OHLC
     - Heiken Ashi: `toHeikenAshi(raw)`
   - Reuse that helper everywhere candles are written to the chart:
     - initial load
     - chart-type toggle
     - live polling update
     - mock tick update

3. Keep the chart instance stable in fullscreen
   - Ensure maximize + mode switch only calls `setData(...)` on the existing `CandlestickSeries`, instead of rebuilding the whole chart.
   - Keep the existing deferred resize flow, and after each mode switch run the scheduled viewport sync so `applyOptions({ width, height })` and `timeScale().fitContent()` happen after layout settles.

4. Restore both directions cleanly
   - On Heiken Ashi: recompute full HA OHLC data and push it to the candlestick series.
   - On Candlestick: restore the original raw OHLC data from `rawDataRef.current`.
   - Keep volume updates aligned with whichever dataset is currently displayed.

5. Verify the exact repro
   - Test the specific flow you described:
     - maximize chart
     - Candlestick -> Heiken Ashi
     - Heiken Ashi -> Candlestick
     - repeat several times
   - Also verify while live polling is active, since that is part of the current failure path.

Technical details
- Primary file to update: `src/pages/dashboard/ChartsPage.tsx`
- Likely no math change needed in `src/lib/chart-indicators.ts`, because the HA formula there already matches the correct calculation.

Expected result
- No chart rebuild on mode toggle.
- No flat-line collapse while maximized.
- Clean switching both ways between Candlestick and Heiken Ashi.