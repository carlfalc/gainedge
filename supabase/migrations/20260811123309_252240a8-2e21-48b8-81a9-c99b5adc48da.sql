ALTER TABLE public.ron_calibration_runs
  ADD COLUMN IF NOT EXISTS source_bar_cutoff_key timestamptz
  GENERATED ALWAYS AS (COALESCE(source_bar_cutoff, source_as_of)) STORED;

DROP INDEX IF EXISTS public.ron_calibration_runs_identity;

CREATE UNIQUE INDEX ron_calibration_runs_identity
  ON public.ron_calibration_runs
  (symbol, timeframe, event_definition, event_version, feature_version, label_version,
   horizon_minutes, calibration_version, source_as_of, source_bar_cutoff_key, holdout_fraction);