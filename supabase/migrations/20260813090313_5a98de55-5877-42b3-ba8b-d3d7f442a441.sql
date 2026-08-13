DO $$
DECLARE v bigint;
BEGIN
  SELECT public.ron_invoke_worker(
    'ron-agent-session-structure',
    '{"instrument":"XAUUSD","timeframe":"15m","run_id":"2d2b-corr-smoke-run","trace_id":"2d2b-corr-smoke-trace","persist":false}'::jsonb
  ) INTO v;
  RAISE NOTICE 'smoke request id %', v;
END $$;