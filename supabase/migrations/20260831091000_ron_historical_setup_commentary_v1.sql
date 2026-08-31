-- GAINEDGE_RON_HISTORICAL_SETUP_COMMENTARY_V1
-- Durable measured outcomes for chart-ready technical setups across the selected RON
-- watch universe. Historical rates are descriptive observations, never live probability.

CREATE TABLE IF NOT EXISTS public.ron_historical_setup_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_version integer NOT NULL DEFAULT 1,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  bar_time timestamptz NOT NULL,
  evaluation_anchor timestamptz NOT NULL,
  future_data_cutoff timestamptz NOT NULL,
  setup_id text NOT NULL,
  source_agent text NOT NULL,
  direction_context text NOT NULL,
  weekday text NOT NULL,
  session text NOT NULL,
  local_time_bucket text NOT NULL,
  volatility_regime text NOT NULL,
  horizon_bars integer NOT NULL,
  outcome_atr_threshold numeric NOT NULL,
  outcome_observed boolean NOT NULL,
  favourable_excursion_price numeric,
  adverse_excursion_price numeric,
  point_size numeric,
  bars_to_peak_favourable integer,
  aligned_ha_candles_15m integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_historical_setup_observation_unique UNIQUE
    (symbol,timeframe,bar_time,setup_id,direction_context,horizon_bars,observation_version),
  CONSTRAINT ron_historical_setup_future_only CHECK (future_data_cutoff >= evaluation_anchor),
  CONSTRAINT ron_historical_setup_no_negative_runs CHECK (
    (favourable_excursion_price IS NULL OR favourable_excursion_price >= 0) AND
    (adverse_excursion_price IS NULL OR adverse_excursion_price >= 0) AND
    (bars_to_peak_favourable IS NULL OR bars_to_peak_favourable >= 0) AND
    (aligned_ha_candles_15m IS NULL OR aligned_ha_candles_15m >= 0)
  )
);

CREATE INDEX IF NOT EXISTS ron_historical_setup_cohort_idx
  ON public.ron_historical_setup_observations
  (symbol,timeframe,setup_id,direction_context,session,bar_time DESC);
CREATE INDEX IF NOT EXISTS ron_historical_setup_time_idx
  ON public.ron_historical_setup_observations (symbol,timeframe,bar_time DESC);

GRANT SELECT ON public.ron_historical_setup_observations TO authenticated;
GRANT ALL ON public.ron_historical_setup_observations TO service_role;
ALTER TABLE public.ron_historical_setup_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read RON historical setup observations"
  ON public.ron_historical_setup_observations FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ron_opportunity_context
  ADD COLUMN IF NOT EXISTS historical_insights_v1 jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specialist_commentary_v1 jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ron_opportunity_context.historical_insights_v1 IS
  'Measured historical cohort facts with sample size, future cutoff and run profile. Not a current probability.';
COMMENT ON COLUMN public.ron_opportunity_context.specialist_commentary_v1 IS
  'Deterministic agent-specific commentary rendered from historical_insights_v1.';

