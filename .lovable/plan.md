

## Fix: Chart Rebuild on Order Mode Toggle + Add Pattern Label Toggle

### Problem 1: Chart goes blank when switching Market / Limit / Stop
The `drawTradeLines` callback has `orderMode` and `limitPrices` in its dependency array. Since `buildChart` depends on `drawTradeLines`, changing order mode triggers a full chart rebuild (destroy + recreate), causing the blank flash.

**Fix**: Remove `limitPrices` and `orderMode` from `drawTradeLines` dependencies by reading them via refs instead. This breaks the chain: orderMode change → drawTradeLines change → buildChart change → rebuild.

- Add `orderModeRef` and `limitPricesRef` refs, kept in sync via useEffect
- `drawTradeLines` reads from the refs, so its useCallback dependencies no longer include `orderMode`/`limitPrices`
- A separate useEffect watches `orderMode`/`limitPrices` and calls `drawTradeLines` directly (no rebuild)

### Problem 2: Add "Show Patterns" toggle
The pattern detection draws lines and labels on the chart. The labels (title text like "Double Top Neckline", "Target", "Support", "Resistance") clutter the chart, especially when dragging order lines.

**Solution**: Add a `showPatternLabels` toggle state. When OFF, pattern illustration lines (trendlines for triangles, flags, etc.) still render, but the `title` property on all pattern-related price lines and series is set to empty string. The RON PATTERN bar below the chart still shows the detection info.

- Add a toggle button next to the "Powered by RON" / RON PATTERN bar area
- When toggled OFF: pattern lines still draw but `title: ""` on all pattern price lines (S/R, neckline, target)
- When toggled ON: titles show as they do now
- Since patterns are drawn inside `buildChart`, we need to either re-draw just the pattern section or use a ref. Simplest: store `showPatternLabels` in a ref and read it during buildChart. For toggling without rebuild, iterate existing pattern price lines and update their title.

### Files to modify

**`src/pages/dashboard/ChartsPage.tsx`**:
1. Add `orderModeRef` and `limitPricesRef` refs; sync them with useEffect
2. Update `drawTradeLines` to read from refs, removing `orderMode`/`limitPrices` from deps
3. Add `showPatternLabels` state (default: true)
4. Store pattern price lines in a separate ref so we can toggle titles without rebuild
5. In the pattern drawing section of `buildChart`, conditionally set `title` based on `showPatternLabels`
6. Add a toggle button in the RON PATTERN bar or near the attribution line
7. When toggle changes, iterate stored pattern price lines and set/clear titles

**`src/pages/dashboard/TradingViewChartPage.tsx`**:
- No pattern drawing happens here (no Lightweight Charts), so the toggle is not needed on TradingView page
- The order mode issue doesn't apply here since TradingView uses an iframe (no buildChart)

### Visual placement of toggle
Below the RON PATTERN bar, next to the "Powered by RON" text or integrated into the RON PATTERN bar itself as a small switch: `Show Labels [toggle]`

