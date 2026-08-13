-- Temporary service-side invoker for the Phase 2D.1e calibration v7 run. Retired
-- immediately after the deterministic replay proof below.
select cron.unschedule('ron-calibrate-v7-once') where exists (select 1 from cron.job where jobname='ron-calibrate-v7-once');
select cron.schedule('ron-calibrate-v7-once', '30 seconds',
  $$ select public.ron_invoke_worker('ron-calibrate', '{"calibration_version":7,"source_as_of":"2026-08-12T22:14:00Z","source_bar_cutoff":"2026-08-12T20:45:00Z","persist":true}'::jsonb); $$);