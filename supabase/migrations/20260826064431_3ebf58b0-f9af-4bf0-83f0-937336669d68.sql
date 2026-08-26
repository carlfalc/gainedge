CREATE OR REPLACE FUNCTION public.ron_data_health_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'falconer_service_role_key' limit 1;
  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'email_queue_service_role_key' limit 1;
  end if;
  if v_token is null or length(v_token) = 0 then
    raise warning 'ron_data_health_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-data-health',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{"persist":true}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.ron_data_health_cron_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ron_data_health_cron_tick() TO service_role;