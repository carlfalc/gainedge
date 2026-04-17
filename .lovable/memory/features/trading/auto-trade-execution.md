---
name: Auto-Trade Execution
description: End-to-end auto-trade pipeline — compute-market-data executes trades when signals fire and logs every attempt to auto_trade_executions for UI surfaces (toasts, status panel, history filter)
type: feature
---
- Auto-trade toggle persisted in `user_auto_trade_settings` (per user, per symbol)
- `compute-market-data` checks auto-trade after signal creation:
  - Requires `autoTradeMap[symbol] === true`, `confidence >= 7`, `signals_paused === false`
  - Direction filter (`signal_direction` buy/sell/both) is applied BEFORE signal creation at lines ~1508-1516
  - Uses `lot_size` from `user_signal_preferences`
  - Calls `metaapi-trade` with service_role key
- Every auto-trade attempt (success OR failure) is logged to `auto_trade_executions` table:
  - Columns: signal_id, symbol, direction, volume, entry_price, sl, tp, status (filled/failed), metaapi_position_id, error_message
  - RLS: users SELECT own; service_role INSERT/UPDATE
  - Realtime enabled (`REPLICA IDENTITY FULL`) for live UI toasts
- UI integration:
  - `useAutoTradeNotifications(userId)` hook in `DashboardLayout` — global sonner toasts (green 6s for filled, red sticky for failed)
  - `AutoTradeStatus` component in `TradeExecutionPanel` — shows broker-not-connected blocker, "RON is ON monitoring" banner, recent execution (60s fade), open position counter
  - `SignalsPage` — "⚡ Auto-executed only" toggle filters signals by `auto_trade_executions.signal_id`
- `metaapi-trade` accepts service_role auth: if Bearer token matches SERVICE_ROLE_KEY, trusts `user_id` from request body
