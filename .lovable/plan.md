# GAINEDGE_UI_PAGE_INVENTORY_V1 (read-only)

Inventory of the current user-facing frontend at HEAD. No edits, no tests, no deploy. No visual proposals, no ranking.

## Sidebar / navigation
- Source: `src/lib/dashboard-nav.ts` (`NAV_GROUPS`), rendered by `src/components/dashboard/DashboardLayout.tsx`.
- 5 groups / 16 paths: Workspace (Dashboard, Charts, Signals, Strategy) · RON (GainEdge AI, RON Decision) · Review (Journal, Analytics, Insights, Backtesting, Calendar, My News) · Settings (Settings, Clock Settings, News Settings) · Extras (Whisky & Cigar Lounge).
- Sidebar is fixed, 0px collapsed with a 12px hover trigger, nav region scrolls vertically. Broker button pinned at bottom opens `BrokerModal`.
- Top bar: session pill, Ask RON popout button, nickname, centered `WorldClocks`, Dashboard shortcut, language selector, light/dark background toggle, user/email menu with sign out.
- Status: recently reworked (grouping + scroll audit correction). Coupling: paths, order, grouping, active-state logic, hover/collapse and `LightBgContext` are all behavior-bearing; any restyle must preserve them.

## Dashboard home / instrument tracking
- Purpose: at-a-glance performance + tracked-instrument monitoring. `src/pages/dashboard/DashboardHome.tsx` (376 lines) + `InstrumentTrackingPanel.tsx` (715 lines).
- Visible: 4 flip stat cards (Net P&L simulated, Win Rate, Profit Factor, Avg R:R), breaking-news ticker, news sentiment panel, movers & shakers, instrument tracking panel, most-volume bar, inline volume history, "Latest live setup" banner, equity-curve sparkline.
- Instrument cards: per-symbol price, provenance badges, calibration scope badge, sparkline, timeframe, drag-and-drop reordering persisted to `localStorage("card-order")`, and the new "RON record ↗" deep link.
- Status: partially reworked (provenance badges, RON context links); the page itself is dense and stacked with no sectioning.
- Coupling: drag/drop + localStorage ordering, 1s countdown tick, realtime data subscriptions, popout vs in-dashboard navigation branch in the RON link.

## Charts
- `TradingViewChartPage.tsx` (237). Purpose: multi-tab charting workspace.
- Visible: tab strip with add-tab modal, `ChartTabPane`, `ChartSidePanel`, pop-out button.
- Tabs and active tab persisted in localStorage; a URL param can preselect a tab and is consumed once so Back still works.
- Status: relatively untouched by recent slices. Coupling: localStorage tab state, popout route `/chart-popout`, drawing/indicator persistence.

## Signals
- `SignalsPage.tsx` (127). Purpose: read-only table of stored Falconer signal records.
- Visible: heading "Falconer Signal Records", explicit loading/error/empty states, table (Opened, Symbol, Trigger, Status, Entry…), realtime background refresh.
- Status: recently reworked (resilience + governance-safe wording). Coupling: wording is governance-constrained; realtime refresh must not be turned into a blocking spinner.

## Strategy
- `StrategyPage.tsx` (404). Purpose: strategy/instrument configuration and alert payload review.
- Sections: Instruments and data readiness (broker search, custom symbols, readiness thresholds, calibration badges) · Position and strategy risk · Production risk gate · PineConnector · Live trades and alert payloads table.
- Execution-mode choices: Signal only / MetaApi automatic execution / PineConnector webhook.
- Status: untouched and the densest configuration surface. Coupling: writes real strategy settings and execution mode — presentation changes must not alter values, defaults, or gating.

## GainEdge AI
- `GainEdgeAIPage.tsx` (155). Purpose: conversational assistant page ("Ask GainEdge AI…" composer + message list).
- Status: untouched, low density. Coupling: edge-function call path and streaming/scroll behavior.

## RON Decision
- `RonDecisionPage.tsx` (188) + `src/components/ron/*`. Purpose: read-only explorer of the stored RON decision record.
- Visible: header with tracked-instrument selector bound to URL search params, advisory amber warning when the instrument list fails, `RonDecisionCard`, `RonExplanationPanels`, `RonEvidenceList` (All / Needs attention filter, "n stored" count), `RonRecordIntegrity` (view hash, spec hash), and a "No decision record" empty state.
- Status: most recently reworked surface (Explorer V1, Context Links V1, Evidence Focus V1). Coupling: URL param contract (`symbol`/`timeframe`), truthful wording rules, evidence filter resets on record identity change, XAUUSD 15m fallback.

## Journal
- `JournalPage.tsx` (143). Purpose: trade log + review notes.
- Visible: "Falconer Journal" heading, trades table (Opened, Symbol, Mode, Trigger, Score, Status), selected-trade "Trade review" pane with Notes and Tags.
- Status: untouched, moderate density. Coupling: notes/tags persistence, row selection state.

## Analytics
- `AnalyticsPage.tsx` (160). Purpose: closed-trade performance stats.
- Visible: KPI row (Total Trades, Win Rate, Wins/Losses, Net P&L, Profit Factor) plus grouped breakdown tables; "No closed trades yet" empty state.
- Status: untouched. Coupling: long-only win definition and pnl-sign fallback live in this file.

## Insights
- `InsightsPage.tsx` (169). Purpose: "Falconer Intelligence" — grouped observations from trades.
- Visible: heading, "Engine observations" section, breakdown lists.
- Status: untouched. Coupling: styling rules already recorded for the insights list.

## Backtesting
- `BacktestingPage.tsx` (196). Purpose: run and review backtests.
- Visible: parameter fields, run control, KPI row (Trades, Win rate, Net P&L, Profit factor, Max drawdown, Candles), trades table (Opened, Trigger, Entry, Exit, Reason), "Recent Runs" table (Created, Symbol, Period, Trades, Win Rate, Net P&L, Status).
- Status: untouched, dense with two stacked tables. Coupling: invokes the backtest edge function; form values feed it directly.

## Calendar
- `CalendarPage.tsx` (10 lines). Purpose: placeholder only — heading plus "wiring underway" copy. Effectively an empty surface.

## My News
- `MyNewsPage.tsx` (226). Purpose: personalised news feed.
- Visible: "My News Feed" heading, filter tabs (All, High Impact Only, My Instruments, Geopolitical, Economic Data), article list with formatted timestamps.
- Status: untouched. Coupling: filters depend on saved news preferences and instrument watchlist.

## Settings
- `SettingsPage.tsx` (167). Purpose: account/broker/notification settings.
- Sections: MetaApi broker (Demo/Live toggle, account ID field), Notifications (save button), pointer to the Strategy page.
- Status: untouched, thin. Note: settings consolidation was explicitly out of scope in the last nav slice, so the three settings pages remain separate.

## Clock Settings
- `ClockSettingsPage.tsx` (95). Purpose: "World Clock Preferences" — timezone slot editor feeding the header clocks.
- Coupling: writes `profiles.clock_timezones`, consumed live by `DashboardLayout`/`WorldClocks`.

## News Settings
- `NewsSettingsPage.tsx` (325). Purpose: news relevance preferences.
- Visible: multi-selects for countries, figures, instruments, topics with custom-entry inputs, and a colour-coded removable pill summary.
- Status: untouched and the densest settings surface. Coupling: preferences drive My News, the ticker and the sentiment panel.

## Cross-cutting notes for any future visual work
- Almost all pages use inline styles from the `C` palette in `src/lib/mock-data.ts` rather than Tailwind tokens.
- Persisted UI state lives in localStorage (`card-order`, chart tabs, `gainedge_light_bg`) — restyles must keep those keys and behaviors.
- Popout routes (`/chart-popout`, `/lounge-popout`, `/instruments-popout`) reuse dashboard components outside the layout.
- Governance-constrained wording exists on Signals, RON Decision and RON evidence surfaces.
