ALTER TABLE public.ron_data_health_events
  ADD COLUMN IF NOT EXISTS orchestration jsonb;