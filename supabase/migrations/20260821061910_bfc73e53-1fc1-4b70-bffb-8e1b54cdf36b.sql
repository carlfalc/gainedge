create or replace function public.ron_orchestration_cron_tick()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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
    raise warning 'ron_orchestration_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  -- Internal RON scheduler only: XAUUSD 15m stored decision records. No execution,
  -- no order placement, no research/calibration mutation, no probability.
  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-schedule-orchestration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$function$;

do $$
begin
  perform cron.unschedule('ron-orchestrate-15m');
exception when others then
  null;
end $$;

select cron.schedule(
  'ron-orchestrate-15m',
  '*/5 * * * *',
  $cron$ select public.ron_orchestration_cron_tick(); $cron$
);