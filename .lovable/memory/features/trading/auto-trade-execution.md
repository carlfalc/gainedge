---
name: Auto-Trade Execution
description: Two parallel auto-trade pipelines — legacy compute-market-data (v1/v2 signals) and ron-auto-trade v3 (DLO + Squeeze + HA + EMA 12/69, Tier A/B only)
type: feature
---
## RON Auto-Trade v3 (current default for RON-enabled users)
- Edge fn: `supabase/functions/ron-auto-trade/index.ts` — runs every 15m via pg_cron
- Gated by `ron_settings.ron_enabled = true` (per user)
- Per user/symbol: pulls last 450×15m + 100×1h candles from `candle_history`, POSTs to `https://ron-ml.onrender.com/predict-v3` with `{bars, htf_bars, min_tier}`
- ML response fields: `signal` (BUY/SELL), `ron_action` (EXECUTE/HOLD), `tier` (A/B/NONE), `dlo`, `squeeze_state` (ON/FIRED/OFF), `ha_bullish`, `ha_transition`, `htf_bias`, `ema12`, `ema69`
- Executes only when `ron_action === "EXECUTE"`. `min_tier` derived from `ron_settings.min_ron_probability` (≥0.75 → A, else B)
- No session filtering by default (sessions toggleable later via `ron_settings.sessions`)
- SL/TP: ATR-based (Wilder ATR14 × `atr_sl_mult`/`atr_tp_mult`) by default, falls back to fixed pips when `sl_mode='fixed'`
- Position sizing: `risk_per_trade_pct` of broker balance, clamped to 0.01–0.50 lots
- Calls `metaapi-trade` with service_role; logs to `ron_auto_trades` (status='open' on success)
- Per-symbol open guard + global `max_open_trades` guard before each attempt
- Smoke test: `POST /functions/v1/ron-auto-trade {"dry_run": true}` returns DLO/squeeze/tier in log without executing

## Legacy auto-trade (v1/v2 — still active for users without RON enabled)
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
  - `AutoTradeStatus` component in `TradeExecutionPanel` — shows broker-not-connected blocker, "RON v3 ON — DLO + Squeeze + HA + EMA 12/69 · Tier A/B only" banner, recent execution (60s fade), open position counter
  - `SignalsPage` — "⚡ Auto-executed only" toggle filters signals by `auto_trade_executions.signal_id`
- `metaapi-trade` accepts service_role auth: if Bearer token matches SERVICE_ROLE_KEY, trusts `user_id` from request body
