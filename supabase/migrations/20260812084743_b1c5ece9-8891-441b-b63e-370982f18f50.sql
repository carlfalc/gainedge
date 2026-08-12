-- Phase 2D.1c-a: recovery insert surface lockdown (privileges only, no data/body changes)

REVOKE EXECUTE ON FUNCTION public.bulk_insert_candles(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bulk_insert_candles(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bulk_insert_candles(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_candles(jsonb) TO service_role;

COMMENT ON FUNCTION public.bulk_insert_candles(jsonb) IS
  'SECURITY DEFINER candle writer. service_role EXECUTE ONLY. Never grant EXECUTE to PUBLIC/anon/authenticated (Phase 2D.1c-a lockdown).';

REVOKE ALL ON TABLE public.ron_data_recovery_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.ron_data_recovery_jobs FROM anon;
REVOKE ALL ON TABLE public.ron_data_recovery_jobs FROM authenticated;
GRANT ALL ON TABLE public.ron_data_recovery_jobs TO service_role;
