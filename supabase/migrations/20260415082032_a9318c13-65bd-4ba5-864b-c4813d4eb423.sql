
-- Add unique constraint (using DO block since ADD CONSTRAINT doesn't support IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candle_history_unique'
  ) THEN
    ALTER TABLE public.candle_history ADD CONSTRAINT candle_history_unique UNIQUE(symbol, timeframe, "timestamp");
  END IF;
END$$;

-- Add descending lookup index
CREATE INDEX IF NOT EXISTS idx_candle_history_lookup ON public.candle_history(symbol, timeframe, "timestamp" DESC);

-- Add service_role insert policy (if not already covered)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'candle_history' AND policyname = 'Allow service role insert'
  ) THEN
    CREATE POLICY "Allow service role insert" ON public.candle_history FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END$$;
