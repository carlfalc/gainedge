ALTER TABLE public.ron_calibration_runs
  ADD COLUMN IF NOT EXISTS calibration_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_bar_cutoff timestamptz;

ALTER TABLE public.ron_stat_cells
  ADD COLUMN IF NOT EXISTS calibration_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_bar_cutoff timestamptz;

DROP INDEX IF EXISTS public.ron_calibration_runs_identity;

CREATE UNIQUE INDEX ron_calibration_runs_identity
  ON public.ron_calibration_runs (
    symbol, timeframe, event_definition, event_version, feature_version, label_version,
    horizon_minutes, calibration_version, source_as_of, holdout_fraction
  );

CREATE INDEX IF NOT EXISTS ron_calibration_runs_version_lookup
  ON public.ron_calibration_runs (symbol, timeframe, calibration_version, source_bar_cutoff);
