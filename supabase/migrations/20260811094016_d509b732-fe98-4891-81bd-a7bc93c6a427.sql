CREATE TABLE public.ron_snapshot_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  bar_time timestamptz NOT NULL,
  feature_version integer NOT NULL,
  label_version integer NOT NULL DEFAULT 1,
  horizon_minutes integer NOT NULL,
  session text,
  session_overlap boolean,
  anchor_price numeric NOT NULL,
  atr_at_anchor numeric,
  forward_close numeric,
  forward_return_pct numeric,
  forward_return_atr numeric,
  mfe_price numeric,
  mae_price numeric,
  mfe_pct numeric,
  mae_pct numeric,
  mfe_atr numeric,
  mae_atr numeric,
  long_excursion_atr numeric,
  short_excursion_atr numeric,
  bars_used integer,
  first_bar_time timestamptz,
  last_bar_time timestamptz,
  data_resolution text NOT NULL,
  data_source text NOT NULL,
  coverage_ok boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  labelled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_snapshot_outcomes_unique
    UNIQUE (symbol, timeframe, bar_time, feature_version, label_version, horizon_minutes, data_resolution)
);

CREATE INDEX ron_snapshot_outcomes_lookup_idx
  ON public.ron_snapshot_outcomes (symbol, timeframe, feature_version, horizon_minutes, bar_time DESC);
CREATE INDEX ron_snapshot_outcomes_coverage_idx
  ON public.ron_snapshot_outcomes (coverage_ok, session);

GRANT SELECT ON public.ron_snapshot_outcomes TO authenticated;
GRANT ALL ON public.ron_snapshot_outcomes TO service_role;

ALTER TABLE public.ron_snapshot_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RON outcome labels"
  ON public.ron_snapshot_outcomes FOR SELECT TO authenticated USING (true);

CREATE TRIGGER ron_snapshot_outcomes_updated_at
  BEFORE UPDATE ON public.ron_snapshot_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();