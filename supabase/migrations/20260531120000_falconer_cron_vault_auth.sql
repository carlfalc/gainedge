-- Fix the falconer-engine-5m cron authorization.
--
-- BUG: the previous job (migration 20260529123001) built its auth header as
--   'Bearer ' || current_setting('app.settings.service_role_key', true)
-- On Supabase that GUC is NOT set, so current_setting(..., true) returns NULL, and in
-- Postgres 'Bearer ' || NULL evaluates to NULL. The Authorization header was therefore
-- null, so falconer-engine (which defaults to verify_jwt = true) rejected every cron
-- invocation with 401. The engine never ran → candle_history was never refreshed →
-- no signals, no candle backfill. This is the root cause of the engine appearing dead.
--
-- FIX: read the service-role key from Vault (the same mechanism the email-queue cron uses),
-- which is the supported way to authenticate pg_cron → Edge Function calls. The secret value
-- is stored OUT OF BAND (Supabase SQL editor / dashboard) and is NEVER committed to git:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'falconer_service_role_key',
--                              'Service-role key used by the falconer-engine pg_cron job');
--
-- This migration only (re)schedules the job to READ that secret. If the secret does not yet
-- exist the COALESCE keeps the SQL valid (the call still 401s until the secret is created),
-- so applying this migration is always safe.

do $$
begin
  perform cron.unschedule('falconer-engine-5m');
exception when others then
  null; -- job may not exist on a fresh database
end $$;

select cron.schedule(
  'falconer-engine-5m',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/falconer-engine',
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
