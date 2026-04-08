
# Unified Broker Data Pipeline — Background Job Approach

## Phase 1: Database & Edge Function
1. **Create `live_market_data` table** — stores pre-computed prices + indicators per instrument per user
   - Columns: user_id, symbol, bid, ask, last_price, rsi, adx, macd_status, stoch_rsi, volume_today, market_open, sparkline_data (jsonb), updated_at
   - RLS: users can only read their own rows
   - Updated every 30s by a background job

2. **Create `compute-market-data` edge function** — the background job
   - Fetches all active users' instruments from `user_instruments`
   - For each unique symbol, calls MetaApi once (candles + current price)
   - Calculates RSI, ADX, MACD, StochRSI from candle data server-side
   - Upserts results into `live_market_data`
   - Runs via pg_cron every 30 seconds

3. **Enable Realtime** on `live_market_data` so dashboard auto-updates

## Phase 2: Shared Client Service
4. **Create `src/services/broker-data.ts`** — reads from `live_market_data` table
   - `getLiveData(userId)` — returns all instrument data in one query
   - Subscribes to Realtime updates on the table
   - Falls back to mock/calculated data if table is empty

## Phase 3: Dashboard Integration
5. **Update Dashboard instrument cards** — live price, real sparkline, real indicators
6. **Update Live Trade bar** — show live P&L against current MetaApi price
7. **Update Most Volume Today** — use real volume from `live_market_data`
8. **Add market status indicator** — green/grey dot per instrument

## Demo Fallback
- If MetaApi connection fails, the edge function writes mock/simulated data
- Dashboard always reads from the same table regardless
- Connection status shown on dashboard

This approach means: 1 edge function call every 30s serves ALL dashboard components for ALL users, with zero client-side MetaApi calls from the dashboard.
