ALTER TABLE public.user_signal_preferences
  ADD COLUMN IF NOT EXISTS enable_asian_session boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_london_session boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ny_session boolean NOT NULL DEFAULT true;

ALTER TABLE public.auto_trade_executions
  ADD COLUMN IF NOT EXISTS session text;

CREATE INDEX IF NOT EXISTS idx_auto_trade_executions_session_created
  ON public.auto_trade_executions (session, created_at DESC);