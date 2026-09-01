-- GAINEDGE_STRATEGY_LAB_V2_DISCOVERY
-- Additive research-only strategy discovery. V1, Falconer, RON and broker execution are untouched.

CREATE TABLE public.strategy_lab_v2_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','auditing_data','searching','stress_testing','locked_holdout',
    'viable_strategy_found','no_viable_strategy','inconclusive','failed','cancelled'
  )),
  verdict text CHECK (verdict IS NULL OR verdict IN (
    'VIABLE_STRATEGY_FOUND','NO_VIABLE_STRATEGY_FOUND','INCONCLUSIVE_INSUFFICIENT_DATA'
  )),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  search_depth text NOT NULL CHECK (search_depth IN ('standard','deep','maximum')),
  random_seed bigint NOT NULL,
  engine_version integer NOT NULL DEFAULT 2,
  grammar_version text NOT NULL DEFAULT '2.0.0',
  engine_commit text,
  candle_count integer NOT NULL DEFAULT 0,
  dataset_audit jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress jsonb NOT NULL DEFAULT '{"percent":0,"generated":0,"tested":0,"rejected":0,"agents_completed":0,"agents_total":7}'::jsonb,
  candidates_generated integer NOT NULL DEFAULT 0,
  candidates_tested integer NOT NULL DEFAULT 0,
  candidates_rejected integer NOT NULL DEFAULT 0,
  finalist_hash text,
  final_result jsonb,
  cancellation_requested boolean NOT NULL DEFAULT false,
  execution_allowed boolean NOT NULL DEFAULT false CHECK (execution_allowed = false),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX strategy_lab_v2_runs_user_created_idx
  ON public.strategy_lab_v2_runs (user_id, created_at DESC);
CREATE INDEX strategy_lab_v2_runs_status_idx
  ON public.strategy_lab_v2_runs (status, updated_at);

CREATE TABLE public.strategy_lab_v2_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.strategy_lab_v2_runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_version integer NOT NULL DEFAULT 2,
  status text NOT NULL CHECK (status IN ('queued','running','complete','failed','cancelled')),
  seed bigint NOT NULL,
  budget integer NOT NULL,
  generated integer NOT NULL DEFAULT 0,
  tested integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  generations integer NOT NULL DEFAULT 0,
  best_candidate_hash text,
  artifact jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_v2_agent_per_run UNIQUE (run_id, agent_id)
);

CREATE INDEX strategy_lab_v2_agent_runs_run_idx
  ON public.strategy_lab_v2_agent_runs (run_id, agent_id);

CREATE TABLE public.strategy_lab_v2_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.strategy_lab_v2_runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  candidate_hash text NOT NULL,
  family text NOT NULL,
  generation integer NOT NULL,
  parent_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  genome jsonb NOT NULL,
  score numeric NOT NULL,
  development_metrics jsonb NOT NULL,
  fold_metrics jsonb NOT NULL,
  positive_fold_ratio numeric NOT NULL,
  disqualified boolean NOT NULL DEFAULT false,
  disqualification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_finalist boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_v2_candidate_per_run UNIQUE (run_id, candidate_hash)
);

CREATE INDEX strategy_lab_v2_candidates_rank_idx
  ON public.strategy_lab_v2_candidates (run_id, score DESC);
CREATE INDEX strategy_lab_v2_candidates_agent_idx
  ON public.strategy_lab_v2_candidates (run_id, agent_id, score DESC);

CREATE TABLE public.strategy_lab_v2_trades (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.strategy_lab_v2_runs(id) ON DELETE CASCADE,
  candidate_hash text NOT NULL,
  segment text NOT NULL CHECK (segment IN ('sealed_holdout','stress')),
  trade_index integer NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long','short')),
  signal_time timestamptz NOT NULL,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL,
  entry numeric NOT NULL,
  exit numeric NOT NULL,
  stop numeric NOT NULL,
  target numeric NOT NULL,
  gross_r numeric NOT NULL,
  cost_r numeric NOT NULL,
  net_r numeric NOT NULL,
  exit_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_v2_trade_per_candidate UNIQUE (run_id, candidate_hash, segment, trade_index)
);

CREATE INDEX strategy_lab_v2_trades_run_idx
  ON public.strategy_lab_v2_trades (run_id, candidate_hash, trade_index);

CREATE TABLE public.strategy_lab_v2_holdout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.strategy_lab_v2_runs(id) ON DELETE RESTRICT,
  candidate_hash text NOT NULL,
  holdout_start timestamptz NOT NULL,
  holdout_end timestamptz NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  result_hash text,
  reused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategy_lab_v2_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_v2_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_v2_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_v2_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_v2_holdout_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own V2 runs" ON public.strategy_lab_v2_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages V2 runs" ON public.strategy_lab_v2_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own V2 agent runs" ON public.strategy_lab_v2_agent_runs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_v2_runs r
    WHERE r.id = strategy_lab_v2_agent_runs.run_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages V2 agent runs" ON public.strategy_lab_v2_agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own V2 candidates" ON public.strategy_lab_v2_candidates
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_v2_runs r
    WHERE r.id = strategy_lab_v2_candidates.run_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages V2 candidates" ON public.strategy_lab_v2_candidates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own V2 trades" ON public.strategy_lab_v2_trades
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_v2_runs r
    WHERE r.id = strategy_lab_v2_trades.run_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages V2 trades" ON public.strategy_lab_v2_trades
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own V2 holdout ledger" ON public.strategy_lab_v2_holdout_ledger
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_v2_runs r
    WHERE r.id = strategy_lab_v2_holdout_ledger.run_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages V2 holdout ledger" ON public.strategy_lab_v2_holdout_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.strategy_lab_v2_runs TO authenticated;
GRANT SELECT ON public.strategy_lab_v2_agent_runs TO authenticated;
GRANT SELECT ON public.strategy_lab_v2_candidates TO authenticated;
GRANT SELECT ON public.strategy_lab_v2_trades TO authenticated;
GRANT SELECT ON public.strategy_lab_v2_holdout_ledger TO authenticated;
GRANT ALL ON public.strategy_lab_v2_runs TO service_role;
GRANT ALL ON public.strategy_lab_v2_agent_runs TO service_role;
GRANT ALL ON public.strategy_lab_v2_candidates TO service_role;
GRANT ALL ON public.strategy_lab_v2_trades TO service_role;
GRANT ALL ON public.strategy_lab_v2_holdout_ledger TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.strategy_lab_v2_trades_id_seq TO service_role;

COMMENT ON TABLE public.strategy_lab_v2_runs IS
  'Research-only V2 strategy discovery jobs. No broker execution path exists.';
COMMENT ON COLUMN public.strategy_lab_v2_runs.verdict IS
  'A run either finds a gate-qualified strategy, finds none, or is inconclusive.';
COMMENT ON TABLE public.strategy_lab_v2_holdout_ledger IS
  'Audit ledger proving which frozen finalist opened the sealed holdout.';
