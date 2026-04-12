

## Plan: Candlestick Color Settings & Chart Background Toggle

### What Changes

1. **Candlestick color customization** — A settings popover (gear icon) on the chart toolbar lets the user pick custom colors for bullish (up) and bearish (down) candles using color input pickers. Changes apply immediately to the chart.

2. **Chart background toggle** — A black/white toggle switch in the same settings popover to flip the chart area background between dark (`#080B12`) and white (`#FFFFFF`), with appropriate text/grid color adjustments.

3. **Persistence** — Store preferences in `localStorage` so they survive page reloads.

### Technical Details

**File: `src/pages/dashboard/ChartsPage.tsx`**

1. **New state variables**:
   - `candleUpColor` (default `#22C55E`)
   - `candleDownColor` (default `#EF4444`)
   - `chartBgMode` (`"black"` | `"white"`, default `"black"`)
   - `showChartSettings` (boolean for popover visibility)

2. **Load/save from localStorage** on mount: key `"ge_chart_colors"` storing `{ up, down, bg }`.

3. **Apply colors**: When colors change, call `candleSeriesRef.current.applyOptions({ upColor, downColor, borderUpColor, borderDownColor, wickUpColor, wickDownColor })` and `chartRef.current.applyOptions({ layout: { background: { color }, textColor } })` — no chart rebuild needed.

4. **Settings button**: Add a gear icon button in the top controls bar (after Fit button). Clicking it toggles a small absolute-positioned popover with:
   - "Bullish" color input + label
   - "Bearish" color input + label  
   - "Chart Background" toggle (Black / White)
   - "Reset" button to restore defaults

5. **Update `createChart` call** (line ~888-920): Use the stored color values instead of hardcoded values.

**Imports needed**: `Settings` from lucide-react. Native `<input type="color">` for color pickers — no new dependencies.

Single file change.

