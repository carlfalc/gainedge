

## Plan: Wire Auto-Trade Execution End-to-End

### What This Does

When `compute-market-data` creates a new signal, it checks if the user has auto-trade enabled for that symbol. If yes, it immediately calls `metaapi-trade` to place the order using the user's configured lot size, respecting signal direction preferences and the active RON engine version.

### Current State

- **Auto-trade toggle**: localStorage only (`ge_intelligent_trader` key in TradeExecutionPanel) — backend cannot read it
- **Lot size**: Already synced to `user_signal_preferences.lot_size`
- **Signal direction**: Already wired in backend (buy/sell/both filter)
- **RON version**: Already wired (v1/v2/v1v2 engine selection)
- **Trade execution**: `metaapi-trade` edge function exists and works

### Changes Required

#### 1. New database table: `user_auto_trade_settings`

Stores per-user, per-symbol auto-trade state (replacing localStorage).

```sql
CREATE TABLE public.user_auto_trade_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE public.user_auto_trade_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own auto trade settings"
  ON public.user_auto_trade_settings FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role needs read access for backend execution
CREATE POLICY "Service role can read auto trade settings"
  ON public.user_auto_trade_settings FOR SELECT
  TO service_role USING (true);
```

#### 2. Update `TradeExecutionPanel.tsx` — persist auto-trade to database

Replace localStorage persistence with database upserts:
- On toggle change, upsert to `user_auto_trade_settings` (user_id, symbol, enabled)
- On mount, load auto-trade state from the database instead of localStorage
- Keep lot size sync as-is (already in `user_signal_preferences.lot_size`)

#### 3. Update `compute-market-data/index.ts` — execute trade after signal creation

After line 1562 (signal created log), add auto-trade execution:

1. Query `user_auto_trade_settings` for the user+symbol to check if `enabled = true`
2. Read `lot_size` from `user_signal_preferences` (already fetched)
3. Call `metaapi-trade` edge function internally with:
   - `action: "trade"`
   - `symbol`: the signal's symbol
   - `actionType`: `ORDER_TYPE_BUY` or `ORDER_TYPE_SELL` based on `analysis.direction`
   - `volume`: user's lot_size
   - `stopLoss`: signal's SL
   - `takeProfit`: signal's TP
4. Log success/failure — do not block signal creation on trade failure

The call uses the service role key since this is server-to-server. The `metaapi-trade` function needs a small adjustment to accept service-role auth for backend-initiated trades.

#### 4. Update `metaapi-trade/index.ts` — allow service-role calls

Add a check: if the caller is service_role (from backend), accept the `user_id` from the request body instead of JWT claims. This lets `compute-market-data` trigger trades on behalf of users.

#### 5. Safety guards (already partially exist)

The existing safety limits from memory apply:
- Max simultaneous auto-trades = number of instruments in watchlist
- Signal must have confidence >= 7 for auto-trade (stricter than signal creation threshold of 5)
- Skip if `signals_paused` is true
- Respect `signal_direction` preference (already filtered before this point)
- RON version rules already determine which signals get created — auto-trade just executes what passes all filters

### Files to Change

| File | Change |
|------|--------|
| Database migration | Create `user_auto_trade_settings` table |
| `src/components/dashboard/TradeExecutionPanel.tsx` | Persist auto-trade toggle to DB, load on mount |
| `supabase/functions/compute-market-data/index.ts` | After signal creation, check auto-trade + execute |
| `supabase/functions/metaapi-trade/index.ts` | Accept service-role auth for backend calls |

### Data Flow

```text
Signal Created (compute-market-data)
  │
  ├─ Check user_auto_trade_settings: enabled for this symbol?
  ├─ Check confidence >= 7 (auto-trade minimum)
  ├─ Read lot_size from user_signal_preferences
  │
  └─ YES → Call metaapi-trade internally
       └─ Place order: symbol + direction + lot_size + SL + TP
```

