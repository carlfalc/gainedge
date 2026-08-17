-- GAINEDGE_GDELT_SERVER_SCHEDULE_V1 — server-side schedule for the internal
-- `ingest-macro-headlines` GDELT raw-headline ingestion function.
--
-- Browser-independent: pg_cron + pg_net, mirroring the accepted internal cron pattern
-- (see 20260531120000_falconer_cron_vault_auth.sql). The service-role key is read from
-- Vault at call time and is NEVER committed to git. The secret is created out of band:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'falconer_service_role_key', '...');
--
-- Scope: raw source ingestion only. No RON, execution, strategy, research or user context.

do $$
begin
  perform cron.unschedule('ingest-macro-headlines-2m');
exception when others then
  null; -- job may not exist on a fresh database
end $$;

select cron.schedule(
  'ingest-macro-headlines-2m',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ingest-macro-headlines',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'falconer_service_role_key'),
        ''
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
