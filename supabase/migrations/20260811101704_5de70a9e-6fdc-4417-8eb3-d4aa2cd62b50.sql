ALTER TABLE public.ron_snapshot_outcomes
  ADD COLUMN IF NOT EXISTS max_high_price numeric,
  ADD COLUMN IF NOT EXISTS min_low_price numeric,
  ADD COLUMN IF NOT EXISTS long_mfe_price numeric,
  ADD COLUMN IF NOT EXISTS long_mae_price numeric,
  ADD COLUMN IF NOT EXISTS short_mfe_price numeric,
  ADD COLUMN IF NOT EXISTS short_mae_price numeric,
  ADD COLUMN IF NOT EXISTS long_mfe_atr_v2 numeric,
  ADD COLUMN IF NOT EXISTS long_mae_atr_v2 numeric,
  ADD COLUMN IF NOT EXISTS short_mfe_atr_v2 numeric,
  ADD COLUMN IF NOT EXISTS short_mae_atr_v2 numeric,
  ADD COLUMN IF NOT EXISTS barrier_atr_mult numeric,
  ADD COLUMN IF NOT EXISTS barrier_version integer,
  ADD COLUMN IF NOT EXISTS long_first_hit text,
  ADD COLUMN IF NOT EXISTS long_success boolean,
  ADD COLUMN IF NOT EXISTS long_event_eligible boolean,
  ADD COLUMN IF NOT EXISTS long_first_hit_time timestamptz,
  ADD COLUMN IF NOT EXISTS short_first_hit text,
  ADD COLUMN IF NOT EXISTS short_success boolean,
  ADD COLUMN IF NOT EXISTS short_event_eligible boolean,
  ADD COLUMN IF NOT EXISTS short_first_hit_time timestamptz,
  ADD COLUMN IF NOT EXISTS coverage_class text,
  ADD COLUMN IF NOT EXISTS metric_hash text;

COMMENT ON COLUMN public.ron_snapshot_outcomes.mfe_price IS 'LEGACY (label_version=1): absolute highest traded price in the forward window, NOT an excursion distance. Do not use for calibration; use max_high_price / long_mfe_price instead.';
COMMENT ON COLUMN public.ron_snapshot_outcomes.mae_price IS 'LEGACY (label_version=1): absolute lowest traded price in the forward window, NOT an excursion distance. Do not use for calibration; use min_low_price / long_mae_price instead.';
COMMENT ON COLUMN public.ron_snapshot_outcomes.coverage_class IS 'label_version=2 exclusion cause: complete | market_session_boundary | genuine_data_gap | horizon_not_elapsed | missing_atr | other_incomplete';
COMMENT ON COLUMN public.ron_snapshot_outcomes.long_first_hit IS 'label_version=2 symmetric ATR barrier result: target | adverse | neither | same_bar_ambiguous | missing_atr';

CREATE INDEX IF NOT EXISTS ron_outcomes_v2_idx
  ON public.ron_snapshot_outcomes (symbol, timeframe, label_version, horizon_minutes, bar_time);