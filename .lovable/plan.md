## GAINEDGE Dashboard Implementation Plan

### Phase 1: Infrastructure
1. **Enable Lovable Cloud** for authentication
2. **Set up routing** — add all dashboard routes under `/dashboard/*`
3. **Create dashboard layout** — collapsible sidebar + top bar wrapper component

### Phase 2: Shared Components
4. **Dashboard layout component** — sidebar nav with GAINEDGE logo, collapsible, links with icons
5. **Top bar** — session indicator, scan status, user avatar dropdown with logout
6. **Reuse SpinCard/Sparkline** from landing page (extract to shared components)
7. **Mock data file** — centralized mock data for all pages

### Phase 3: Pages (6 pages)
8. **Dashboard Home** — stat cards, best signal banner, instrument cards with expand, correlation warnings, equity curve, run scan button
9. **Signals** — sortable/filterable table with expandable rows
10. **Trade Journal** — date picker, daily view, notes, strategy tags
11. **Analytics** — multiple charts (bar, line) for performance breakdowns using Recharts
12. **Calendar** — P&L heatmap monthly grid, day click to view trades
13. **Settings** — profile, instruments, preferences, notifications, broker, subscription, danger zone

### Phase 4: Auth Flow
14. **Auth guard** — redirect to landing if not logged in
15. **Wire login/signup modal** on landing to actual Supabase auth
16. **Protected routes** wrapper

### Technical Notes
- All data is mock/placeholder for now
- Same dark theme, jade accents, DM Sans + JetBrains Mono
- Use Recharts (already installed) for charts
- Use shadcn components where possible (sidebar, tabs, select, calendar, etc.)
- Collapsible sidebar using shadcn Sidebar component