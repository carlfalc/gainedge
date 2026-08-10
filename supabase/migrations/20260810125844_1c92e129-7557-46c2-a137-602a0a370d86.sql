CREATE OR REPLACE FUNCTION public.candle_ingest_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'falconer_service_role_key'
  limit 1;

  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'email_queue_service_role_key'
    limit 1;
  end if;

  if v_token is null or length(v_token) = 0 then
    insert into public.falconer_engine_events (event_type, severity, message, context)
    values ('candle_ingest_auth_missing', 'error',
            'ingest-candles cron skipped: no service-role key found in Vault', '{}'::jsonb);
    return;
  end if;

  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ingest-candles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.candle_ingest_cron_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('candle-ingest-5m')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'candle-ingest-5m');

SELECT cron.schedule('candle-ingest-5m', '*/5 * * * *', $cron$ SELECT public.candle_ingest_cron_tick(); $cron$);