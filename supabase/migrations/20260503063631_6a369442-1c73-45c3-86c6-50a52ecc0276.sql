CREATE POLICY "anon can read candle_history"
  ON public.candle_history FOR SELECT
  TO anon
  USING (true);