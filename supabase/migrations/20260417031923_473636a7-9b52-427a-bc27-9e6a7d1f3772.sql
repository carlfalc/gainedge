-- Part 1: per-symbol auto-trade settings
ALTER TABLE public.user_auto_trade_settings
  ADD COLUMN IF NOT EXISTS lot_size numeric NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS signal_direction text NOT NULL DEFAULT 'both';

ALTER TABLE public.user_auto_trade_settings
  DROP CONSTRAINT IF EXISTS user_auto_trade_settings_signal_direction_check;
ALTER TABLE public.user_auto_trade_settings
  ADD CONSTRAINT user_auto_trade_settings_signal_direction_check
  CHECK (signal_direction IN ('buy','sell','both'));

-- Backfill lot_size from each user's current global lot_size
UPDATE public.user_auto_trade_settings ats
SET lot_size = COALESCE(usp.lot_size, 0.01)
FROM public.user_signal_preferences usp
WHERE ats.user_id = usp.user_id
  AND ats.lot_size = 0.01;

-- Part 9: broker connection health
ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS balance numeric,
  ADD COLUMN IF NOT EXISTS equity numeric;

CREATE INDEX IF NOT EXISTS idx_user_auto_trade_settings_user_symbol
  ON public.user_auto_trade_settings(user_id, symbol);
