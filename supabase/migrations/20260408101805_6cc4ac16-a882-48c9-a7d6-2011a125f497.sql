
-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule cleanup: delete news_items older than 24 hours, runs every hour
SELECT cron.schedule(
  'cleanup-old-news',
  '0 * * * *',
  $$DELETE FROM public.news_items WHERE published_at < now() - interval '24 hours';$$
);
