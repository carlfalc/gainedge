---
name: Auto-Trade Execution
description: Backend auto-executes trades via metaapi-trade when signals fire with auto-trade enabled, confidence >= 7, and signals not paused
type: feature
---
- Auto-trade toggle persisted in `user_auto_trade_settings` table (per user, per symbol)
- TradeExecutionPanel loads/saves auto-trade state to DB instead of localStorage
- `compute-market-data` checks auto-trade after signal creation:
  - Requires `autoTradeMap[symbol] === true`
  - Requires `confidence >= 7` (stricter than signal creation threshold of 5)
  - Requires `signals_paused === false`
  - Uses `lot_size` from `user_signal_preferences`
  - Calls `metaapi-trade` with service_role key
- `metaapi-trade` accepts service_role auth: if Bearer token matches SERVICE_ROLE_KEY, trusts `user_id` from request body
- Direction filtering already applied before signal creation (buy/sell/both)
- RON engine version already determines which signals get created
