

## Remaining Edits for Interactive Order Lines

### What's Already Done
- `ChartOrderLines.tsx` — Created. HTML overlay component with draggable Entry/SL/TP lines.
- `TradeExecutionPanel.tsx` — Converted to `forwardRef`, added `TradeExecutionPanelRef` interface, `OrderMode`/`LimitOrderPrices` exports, and `onOrderModeChange`/`onLimitPricesChange` callbacks. However, `useImperativeHandle` is imported but never called (the failed edit).
- `ChartsPage.tsx` — Already has `orderMode`/`limitPrices` state and draws static price lines for limit orders, but does NOT use `ChartOrderLines` overlay or support dragging/two-way sync.

### Remaining Work

**1. TradeExecutionPanel.tsx — Add `useImperativeHandle` block**
- Wire up the ref so parent components can call `setMarketSL`, `setMarketTP`, `setLimitEntry`, `setLimitSL`, `setLimitTP`, `getCurrentPrice` to programmatically update fields when chart lines are dragged.

**2. ChartsPage.tsx — Integrate `ChartOrderLines` overlay + two-way sync**
- Import `ChartOrderLines` and `TradeExecutionPanelRef`.
- Add a ref to `TradeExecutionPanel`.
- Implement `priceToY` / `yToPrice` helpers using `series.priceToCoordinate()` and `series.coordinateToPrice()` from Lightweight Charts.
- Render `<ChartOrderLines>` as an overlay inside the chart container div.
- Pass drag callbacks that call the panel ref methods (`ref.current.setLimitEntry(...)`, etc.).
- Pass remove callbacks that clear the corresponding fields.
- Auto-initialize line positions when order mode changes (entry at current price, TP/SL offset by a default amount).
- When `limitPrices` change from the panel (user typing), update the overlay line positions.

**3. TradingViewChartPage.tsx — Integrate `ChartOrderLines` overlay**
- Add `orderMode`, `limitPrices` state and a `TradeExecutionPanelRef`.
- Add a ref to `TradeExecutionPanel` and pass the sync callbacks.
- Wrap the iframe in a relatively-positioned container and render `<ChartOrderLines>` over it.
- Implement estimated `priceToY` / `yToPrice` using a linear scale derived from the selected symbol's approximate price range (since we can't query the iframe's internal scale).
- Wire drag and remove callbacks identically to the Charts page.

### Technical Notes
- `priceToY`/`yToPrice` on the Lightweight Charts page will use the chart API directly, which is precise.
- On TradingView, the mapping will be approximate (linear interpolation from current price ± a range), which is acceptable since the panel fields show the exact numeric value.
- The `ChartOrderLines` component already handles all visual rendering, dragging, and remove buttons — it just needs the coordinate converters and callbacks from each page.

