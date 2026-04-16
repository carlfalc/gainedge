
DROP POLICY IF EXISTS "Service role can insert" ON public.candle_history;
CREATE POLICY "Service role can insert"
ON public.candle_history
FOR INSERT
TO service_role
WITH CHECK (true);
