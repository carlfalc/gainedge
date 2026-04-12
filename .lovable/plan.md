

## Make Dashboard Pages Fill Full Width

### Problem
Every dashboard page has a hard-coded `maxWidth` (700–1200px), leaving unused space on wider screens. The chart page works fine because it doesn't have this constraint.

### Solution
Remove or increase the `maxWidth` on all affected pages so content stretches to fill the available space.

### Files to modify

| File | Current maxWidth | Change |
|------|-----------------|--------|
| `src/pages/dashboard/DashboardHome.tsx` | 1200 | Remove maxWidth |
| `src/pages/dashboard/AnalyticsPage.tsx` | 1200 | Remove maxWidth |
| `src/pages/dashboard/SignalsPage.tsx` | 1200 | Remove maxWidth |
| `src/pages/dashboard/BacktestingPage.tsx` | 1000 | Remove maxWidth |
| `src/pages/dashboard/CalendarPage.tsx` | 900 | Remove maxWidth |
| `src/pages/dashboard/JournalPage.tsx` | 800 | Remove maxWidth |
| `src/pages/dashboard/MyNewsPage.tsx` | 800 | Remove maxWidth |
| `src/pages/dashboard/SettingsPage.tsx` | 700 | Remove maxWidth |
| `src/pages/dashboard/ClockSettingsPage.tsx` | 700 | Remove maxWidth |
| `src/pages/dashboard/NewsSettingsPage.tsx` | 700 | Remove maxWidth |

Each page's root `<div>` will have its `maxWidth` removed entirely, replaced with `width: "100%"` so content fills the full available area.

### What stays the same
- Charts page — already full width
- All internal component layouts, grid structures, and card designs remain unchanged
- Sidebar auto-hide behavior unchanged

