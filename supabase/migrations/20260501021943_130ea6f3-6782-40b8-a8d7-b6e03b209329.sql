ALTER TABLE public.ron_backtest_runs
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'options'
  CHECK (run_type IN ('v3','options'));

CREATE INDEX IF NOT EXISTS idx_ron_backtest_runs_run_type
  ON public.ron_backtest_runs (run_type, created_at DESC);