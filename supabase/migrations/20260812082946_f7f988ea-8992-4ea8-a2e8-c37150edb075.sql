CREATE TABLE public.ron_data_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_version integer NOT NULL DEFAULT 1,
  source text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  broker_symbol text NOT NULL,
  range_start_exclusive timestamptz NOT NULL,
  range_end_exclusive timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  cursor_end_anchor timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0,
  raw_candles integer NOT NULL DEFAULT 0,
  validated_in_range integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  conflicts_existing integer NOT NULL DEFAULT 0,
  filtered_out integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  row_digest text,
  min_inserted_ts timestamptz,
  max_inserted_ts timestamptz,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ron_data_recovery_jobs_range_ck CHECK (range_end_exclusive > range_start_exclusive),
  CONSTRAINT ron_data_recovery_jobs_status_ck CHECK (status IN ('queued','running','complete','failed','cancelled'))
);

CREATE UNIQUE INDEX ron_data_recovery_jobs_identity_idx
  ON public.ron_data_recovery_jobs (recovery_version, symbol, timeframe, range_start_exclusive, range_end_exclusive);

GRANT ALL ON public.ron_data_recovery_jobs TO service_role;

ALTER TABLE public.ron_data_recovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages recovery jobs"
  ON public.ron_data_recovery_jobs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER ron_data_recovery_jobs_updated_at
  BEFORE UPDATE ON public.ron_data_recovery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();