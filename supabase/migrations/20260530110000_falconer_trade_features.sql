-- Capture entry-time market features + exit price on each Falconer trade so the
-- RON model can learn from real outcomes (the old signal_outcomes table was dropped).
-- Additive + idempotent.
ALTER TABLE public.falconer_trades
  ADD COLUMN IF NOT EXISTS features jsonb,
  ADD COLUMN IF NOT EXISTS exit_price numeric;
