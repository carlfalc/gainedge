REVOKE EXECUTE ON FUNCTION public.ron_snapshot_cron_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ron_snapshot_cron_tick() TO service_role, postgres;