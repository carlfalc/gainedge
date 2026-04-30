CREATE TABLE public.ron_backtest_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label       TEXT,
  symbol          TEXT NOT NULL,
  timeframe       TEXT NOT NULL DEFAULT '15m',
  htf_timeframe   TEXT NOT NULL DEFAULT '1h',
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  in_sample_split TIMESTAMPTZ,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_window     JSONB,
  in_sample       JSONB,
  out_of_sample   JSONB,
  combined        JSONB,
  trades          JSONB,
  equity_curve    JSONB,
  verdict         TEXT,
  issues          JSONB DEFAULT '[]'::jsonb,
  ron_ml_version  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ron_backtest_runs_symbol_created
  ON public.ron_backtest_runs (symbol, created_at DESC);

ALTER TABLE public.ron_backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages backtest runs"
  ON public.ron_backtest_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read backtest runs"
  ON public.ron_backtest_runs
  FOR SELECT
  TO authenticated
  USING (true);