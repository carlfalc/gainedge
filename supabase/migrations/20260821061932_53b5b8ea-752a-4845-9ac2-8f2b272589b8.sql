revoke all on function public.ron_orchestration_cron_tick() from public, anon, authenticated;
grant execute on function public.ron_orchestration_cron_tick() to service_role;