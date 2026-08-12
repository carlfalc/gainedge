-- Single temporary self-retiring rebuild tick. ron-rebuild calls ron_rebuild_finish()
-- to unschedule this job as soon as zero rebuild jobs remain open.
select cron.unschedule('ron-rebuild-tick') where exists (select 1 from cron.job where jobname = 'ron-rebuild-tick');
select cron.schedule('ron-rebuild-tick', '30 seconds', $$ select public.ron_rebuild_cron_tick(); $$);