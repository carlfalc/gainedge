CREATE TABLE public.ron_calibration_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  event_definition text NOT NULL,
  event_version integer NOT NULL,
  feature_version integer NOT NULL,
  label_version integer NOT NULL,
  horizon_minutes integer NOT NULL,
  barrier_atr_mult numeric NOT NULL,
  barrier_version integer NOT NULL,
  source_as_of timestamptz NOT NULL,
  holdout_fraction numeric NOT NULL,
  split_cutoff timestamptz,
  canonical_rows integer NOT NULL DEFAULT 0,
  eligible_long integer NOT NULL DEFAULT 0,
  eligible_short integer NOT NULL DEFAULT 0,
  excluded_rows integer NOT NULL DEFAULT 0,
  exclusion_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  long_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  short_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  definition_hash text NOT NULL,
  run_hash text NOT NULL,
  status text NOT NULL DEFAULT 'research',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ron_calibration_runs TO authenticated;
GRANT ALL ON public.ron_calibration_runs TO service_role;
ALTER TABLE public.ron_calibration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read calibration runs"
  ON public.ron_calibration_runs FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX ron_calibration_runs_identity
  ON public.ron_calibration_runs (symbol, timeframe, event_definition, event_version, feature_version, label_version, horizon_minutes, source_as_of, holdout_fraction);

CREATE TRIGGER ron_calibration_runs_updated_at
  BEFORE UPDATE ON public.ron_calibration_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ron_stat_cells (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.ron_calibration_runs(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  event_definition text NOT NULL,
  event_version integer NOT NULL,
  feature_version integer NOT NULL,
  label_version integer NOT NULL,
  horizon_minutes integer NOT NULL,
  barrier_atr_mult numeric NOT NULL,
  barrier_version integer NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long','short')),
  level integer NOT NULL CHECK (level BETWEEN 0 AND 3),
  cell_key text NOT NULL,
  dim_session text,
  dim_regime text,
  dim_adx_bucket text,
  source_as_of timestamptz NOT NULL,
  split_cutoff timestamptz,
  fit_start timestamptz,
  fit_end timestamptz,
  holdout_start timestamptz,
  holdout_end timestamptz,
  n_fit integer NOT NULL DEFAULT 0,
  successes_fit integer NOT NULL DEFAULT 0,
  empirical_rate numeric,
  wilson_low numeric,
  wilson_high numeric,
  sample_floor integer NOT NULL,
  meets_sample_floor boolean NOT NULL DEFAULT false,
  n_holdout integer NOT NULL DEFAULT 0,
  successes_holdout integer NOT NULL DEFAULT 0,
  holdout_rate numeric,
  prediction_rate numeric,
  brier numeric,
  naive_brier numeric,
  definition_hash text NOT NULL,
  cell_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ron_stat_cells TO authenticated;
GRANT ALL ON public.ron_stat_cells TO service_role;
ALTER TABLE public.ron_stat_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read calibration cells"
  ON public.ron_stat_cells FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX ron_stat_cells_identity ON public.ron_stat_cells (run_id, direction, cell_key);
CREATE INDEX ron_stat_cells_lookup ON public.ron_stat_cells (symbol, timeframe, event_definition, direction, level);

CREATE TRIGGER ron_stat_cells_updated_at
  BEFORE UPDATE ON public.ron_stat_cells
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();