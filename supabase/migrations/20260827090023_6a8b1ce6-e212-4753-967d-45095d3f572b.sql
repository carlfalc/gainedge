ALTER TABLE public.ron_data_health_events
  ADD COLUMN IF NOT EXISTS evaluation_anchor timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_status text,
  ADD COLUMN IF NOT EXISTS roster_version integer,
  ADD COLUMN IF NOT EXISTS expected_components text[],
  ADD COLUMN IF NOT EXISTS completed_components text[],
  ADD COLUMN IF NOT EXISTS missing_components text[],
  ADD COLUMN IF NOT EXISTS context_written boolean,
  ADD COLUMN IF NOT EXISTS material_event_written boolean;

CREATE INDEX IF NOT EXISTS ron_data_health_events_cycle_idx
  ON public.ron_data_health_events (instrument, timeframe, evaluation_anchor DESC)
  WHERE evaluation_anchor IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ron_data_health_events_cycle_unique_idx
  ON public.ron_data_health_events (instrument, timeframe, evaluation_anchor, cycle_status)
  WHERE evaluation_anchor IS NOT NULL AND cycle_status IS NOT NULL;