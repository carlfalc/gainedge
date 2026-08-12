REVOKE EXECUTE ON FUNCTION public.ron_rebuild_cron_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ron_rebuild_finish() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ron_rebuild_cron_tick() TO service_role;
GRANT EXECUTE ON FUNCTION public.ron_rebuild_finish() TO service_role;