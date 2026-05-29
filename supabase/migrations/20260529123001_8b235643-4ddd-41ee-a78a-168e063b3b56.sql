-- Drop legacy crons and schedule falconer-engine every 5 minutes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
           WHERE jobname IN ('ron-auto-trade-15m','compute-market-data-5m','ron-intelligence-hourly','falconer-engine-5m')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'falconer-engine-5m',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/falconer-engine',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);