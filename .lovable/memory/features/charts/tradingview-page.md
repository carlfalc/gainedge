---
name: Charts Page (TradingView)
description: Single consolidated chart page using TradingView iframe at /dashboard/charts with RON signal alerts and active trade info
type: feature
---
The old Lightweight Charts page has been removed. The TradingView Advanced Chart iframe is now the PRIMARY and ONLY chart view at `/dashboard/charts`.

Layout (top to bottom):
1. Instrument tabs + Broker selector + Pop Out button
2. RON Signal Alert card (dismissible) — shows pending signal for selected instrument
3. Active Trade Info bar — shows open positions with live P&L in pips
4. TradingView iframe (flex-1, min 400px) with ChartOrderLines overlay
5. Trade Execution Panel (Market/Limit/Stop, Intelligent Trader, Open Positions)
6. "Powered by RON" footer

Sidebar shows "Charts" (gold, CandlestickChart icon) pointing to `/dashboard/charts`.
The old `/dashboard/tradingview-chart` route and separate "TradingView Chart" nav item have been removed.
