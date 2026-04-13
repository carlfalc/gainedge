

## Wiring All Pages to the Language Selector

### What's happening now

You're correct — the i18n system is installed and working, but **only 4 files** currently use `t()` for translations: the sidebar navigation, Settings page, Login, and Signup. Every other page (Dashboard Home, Analytics, Signals, Journal, Calendar, Insights, Backtesting, Charts, Lounge, etc.) still has hardcoded English strings. When you switch language, only the sidebar menu items change.

**We absolutely can translate everything** — it just needs the same treatment applied to every page.

### What needs to happen

For each page, we:
1. Add `const { t } = useTranslation()` 
2. Replace every hardcoded English string with a `t("key")` call
3. Add the corresponding keys to all 10 locale JSON files

### Pages to translate (priority order)

| Page | Approx strings | Examples |
|------|----------------|----------|
| **DashboardHome** | ~40 | "Net P&L", "Win Rate", "Profit Factor", "CURRENT INSTRUMENT TRACKING", indicator labels |
| **SignalsPage** | ~30 | "Signal History", table headers, status labels, stat tiles |
| **AnalyticsPage** | ~15 | "Analytics", "P&L by Instrument", "Total Trades", stat labels |
| **JournalPage** | ~20 | "Trade Journal", "Add Entry", emotion labels, form fields |
| **CalendarPage** | ~10 | "Calendar", "Wins", "Losses", day names |
| **InsightsPage** | ~15 | "RONS Insights", section headers, insight type labels |
| **BacktestingPage** | ~15 | "Backtesting", form labels, result labels |
| **ChartsPage** | ~10 | Toolbar labels, overlay text |
| **WhiskyCigarLoungePage** | ~10 | Chat labels, input placeholders |
| **MyNewsPage / NewsSettings** | ~10 | Headers, filter labels |
| **ClockSettingsPage** | ~5 | Labels |
| **Shared components** | ~20 | Modals (AskRon, Broker, AddInstrument), notification text |

**Total: ~200 additional strings across all 10 languages.**

### Files to modify
- All pages listed above (add `useTranslation` + replace strings)
- `src/i18n/locales/en.json` — add ~200 new keys
- 9 other locale files — add matching translated keys

### Approach
- We'll work through the pages in batches, expanding `en.json` with new sections and generating translations for all 9 other languages simultaneously
- No new packages or infrastructure needed — everything is already wired

### This is purely an effort/coverage task — there are zero technical blockers.

