DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candle_history_unique'
  ) THEN
    ALTER TABLE public.candle_history
    ADD CONSTRAINT candle_history_unique UNIQUE (symbol, timeframe, "timestamp");
  END IF;
END $$;
