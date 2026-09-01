-- GAINEDGE_STRATEGY_LAB_V1
-- Isolated, user-owned strategy research records. This migration does not alter Falconer,
-- RON evidence, any scheduler, broker execution, or an applied historical migration.

CREATE TABLE public.strategy_lab_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strategy_lab_version integer NOT NULL DEFAULT 1,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  candle_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','complete','blocked','failed')),
  request_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_audit jsonb NOT NULL DEFAULT '{}'::jsonb,
  champion_candidate_key text,
  champion_promotion_eligible boolean NOT NULL DEFAULT false,
  execution_allowed boolean NOT NULL DEFAULT false CHECK (execution_allowed = false),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX strategy_lab_runs_user_created_idx
  ON public.strategy_lab_runs (user_id, created_at DESC);
CREATE INDEX strategy_lab_runs_market_idx
  ON public.strategy_lab_runs (symbol, timeframe, created_at DESC);

CREATE TABLE public.strategy_lab_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.strategy_lab_runs(id) ON DELETE CASCADE,
  candidate_key text NOT NULL,
  family text NOT NULL,
  candidate_version integer NOT NULL DEFAULT 1,
  rank integer NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  promotion_eligible boolean NOT NULL DEFAULT false,
  validation_score numeric NOT NULL DEFAULT 0,
  config jsonb NOT NULL,
  train_metrics jsonb NOT NULL,
  validation_metrics jsonb NOT NULL,
  holdout_metrics jsonb NOT NULL,
  promotion_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_candidate_per_run UNIQUE (run_id, candidate_key)
);

CREATE INDEX strategy_lab_candidates_run_rank_idx
  ON public.strategy_lab_candidates (run_id, rank);

CREATE TABLE public.strategy_lab_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.strategy_lab_runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('complete','blocked','not_applicable')),
  detail text NOT NULL,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_agent_per_run UNIQUE (run_id, agent_id)
);

CREATE INDEX strategy_lab_agent_runs_run_idx
  ON public.strategy_lab_agent_runs (run_id, agent_id);

-- Promotion is a separate, explicit future action. A backtest can only be eligible; it
-- cannot silently install itself as a paper or live strategy.
CREATE TABLE public.strategy_lab_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.strategy_lab_runs(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES public.strategy_lab_candidates(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('paper_candidate','paper_active','paper_rejected','demo_candidate','demo_active','demo_rejected')),
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_lab_no_live_stage CHECK (stage NOT LIKE 'live%')
);

CREATE INDEX strategy_lab_promotions_user_created_idx
  ON public.strategy_lab_promotions (user_id, created_at DESC);

ALTER TABLE public.strategy_lab_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_lab_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own strategy lab runs"
  ON public.strategy_lab_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Service role manages strategy lab runs"
  ON public.strategy_lab_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own strategy lab candidates"
  ON public.strategy_lab_candidates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_runs run
    WHERE run.id = strategy_lab_candidates.run_id AND run.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages strategy lab candidates"
  ON public.strategy_lab_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own strategy lab agent runs"
  ON public.strategy_lab_agent_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.strategy_lab_runs run
    WHERE run.id = strategy_lab_agent_runs.run_id AND run.user_id = auth.uid()
  ));
CREATE POLICY "Service role manages strategy lab agent runs"
  ON public.strategy_lab_agent_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own strategy lab promotions"
  ON public.strategy_lab_promotions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Service role manages strategy lab promotions"
  ON public.strategy_lab_promotions FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.strategy_lab_runs TO authenticated;
GRANT SELECT ON public.strategy_lab_candidates TO authenticated;
GRANT SELECT ON public.strategy_lab_agent_runs TO authenticated;
GRANT SELECT ON public.strategy_lab_promotions TO authenticated;
GRANT ALL ON public.strategy_lab_runs TO service_role;
GRANT ALL ON public.strategy_lab_candidates TO service_role;
GRANT ALL ON public.strategy_lab_agent_runs TO service_role;
GRANT ALL ON public.strategy_lab_promotions TO service_role;

COMMENT ON TABLE public.strategy_lab_runs IS
  'Isolated Strategy Lab research runs. execution_allowed is permanently false in V1.';
COMMENT ON COLUMN public.strategy_lab_candidates.validation_score IS
  'Selection score computed from validation data only; holdout data never selects the champion.';
COMMENT ON COLUMN public.strategy_lab_candidates.promotion_eligible IS
  'Historical paper-candidate gate only. Not approval, advice, demo execution or live execution.';
