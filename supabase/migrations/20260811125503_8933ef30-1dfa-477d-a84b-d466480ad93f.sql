DO $$
DECLARE r record;
BEGIN
  FOR r IN
    WITH b AS (
      SELECT "timestamp" AS ts, ntile(28) OVER (ORDER BY "timestamp") AS g
      FROM public.candle_history WHERE symbol='XAUUSD' AND timeframe='15m'
    )
    SELECT g, min(ts) AS lo, max(ts) AS hi FROM b GROUP BY g ORDER BY g
  LOOP
    PERFORM public.ron_invoke_worker('ron-quality', jsonb_build_object(
      'limit', 500, 'all', true, 'max_batches', 1,
      'start', to_char(r.lo AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'end',   to_char(r.hi AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ));
  END LOOP;
END $$;