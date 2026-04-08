# Signals Page Overhaul

## 1. Database Migration
- Add `pnl_pips` (numeric, nullable) and `resolved_at` (timestamptz, nullable) columns to `signals` table
- Create `user_signal_preferences` table with columns: user_id, instrument_filters (jsonb), min_confidence (int, default 5), created_at, updated_at
- RLS policies for user_signal_preferences (users CRUD own data)

## 2. Update `compute-market-data` Edge Function
- After computing market data, check all PENDING signals for each user/symbol
- Compare live price against TP/SL for each pending signal
- If price hits TP → update signal: result='win', pnl calculated, pnl_pips calculated, resolved_at=now()
- If price hits SL → update signal: result='loss', pnl calculated, pnl_pips calculated, resolved_at=now()
- Check signal age: if >20 min and still pending → result='expired', pnl=0, pnl_pips=0, resolved_at=now()
- **Deduplication**: In signal creation logic (push-scan), skip if most recent PENDING signal for same symbol+direction has entry_price within 0.1%

## 3. Update `push-scan` Edge Function
- Add deduplication check before inserting new signals
- Query most recent PENDING signal for same user+symbol+direction
- Skip creation if entry price is within 0.1% of existing pending signal

## 4. Overhaul `SignalsPage.tsx`
- Add performance stat tiles row at top (All-Time P&L, This Month P&L, Win Rate, Total Signals, Avg R:R)
- Add result filter (All/WIN/LOSS/EXPIRED/PENDING)
- Add date range filter (Today/This Week/This Month/All Time)
- Add alert settings button (amber icon) opening a modal
- Update P&L display with color-coded formatting
- Add pips display alongside dollar P&L

## 5. Create `SignalAlertSettingsModal` Component
- Toggle switches per instrument from user_instruments
- Min confidence slider (1-10)
- Disabled toggles for "Auto-place limit orders" and "Auto-set TP/SL" with "Coming soon" labels
- Save to user_signal_preferences table

## 6. Store Signal Outcomes in Insights
- When a signal is resolved (win/loss/expired), insert an insight with type "signal_outcome" containing the signal details for AI brain analysis
