ALTER TABLE public.ron_calibration_runs
  ADD COLUMN IF NOT EXISTS canonical_source_min_bar_time timestamptz,
  ADD COLUMN IF NOT EXISTS canonical_source_max_bar_time timestamptz;