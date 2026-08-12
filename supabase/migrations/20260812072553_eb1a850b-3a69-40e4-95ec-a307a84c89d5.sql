CREATE TABLE IF NOT EXISTS public.ron_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_version integer NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  quality_version integer NOT NULL,
  feature_version integer NOT NULL,
  label_version integer NOT NULL,
  event_definition text NOT NULL,
  event_version integer NOT NULL,
  horizon_minutes integer NOT NULL,
  barrier_atr_mult numeric NOT NULL,
  barrier_version integer NOT NULL,
  source_as_of timestamptz NOT NULL,
  source_bar_cutoff timestamptz NOT NULL,
  canonical_source_min_bar_time timestamptz,
  canonical_source_max_bar_time timestamptz,
  canonical_rows integer NOT NULL DEFAULT 0,
  eligible_long integer NOT NULL DEFAULT 0,
  eligible_short integer NOT NULL DEFAULT 0,
  exclusion_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  purge_minutes integer NOT NULL,
  fold_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_spec_hash text NOT NULL,
  candidate_spec_hash text NOT NULL,
  definition_hash text NOT NULL,
  run_hash text NOT NULL,
  results_digest text NOT NULL,
  bucket_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'complete',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ron_research_runs_definition_key
  ON public.ron_research_runs (definition_hash);

CREATE TABLE IF NOT EXISTS public.ron_research_candidate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ron_research_runs(id) ON DELETE CASCADE,
  research_version integer NOT NULL,
  direction text NOT NULL,
  candidate text NOT NULL,
  candidate_kind text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_floor integer NOT NULL,
  folds jsonb NOT NULL DEFAULT '[]'::jsonb,
  aggregate jsonb NOT NULL DEFAULT '{}'::jsonb,
  vs_baseline jsonb,
  bucket_stability jsonb NOT NULL DEFAULT '[]'::jsonb,
  promising_for_2d2 boolean NOT NULL DEFAULT false,
  gate_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ron_research_candidate_results_identity
  ON public.ron_research_candidate_results (run_id, direction, candidate);

GRANT SELECT ON public.ron_research_runs TO authenticated;
GRANT ALL ON public.ron_research_runs TO service_role;
GRANT SELECT ON public.ron_research_candidate_results TO authenticated;
GRANT ALL ON public.ron_research_candidate_results TO service_role;

ALTER TABLE public.ron_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ron_research_candidate_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read research runs" ON public.ron_research_runs;
CREATE POLICY "Authenticated can read research runs"
  ON public.ron_research_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read research results" ON public.ron_research_candidate_results;
CREATE POLICY "Authenticated can read research results"
  ON public.ron_research_candidate_results FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS ron_research_runs_updated_at ON public.ron_research_runs;
CREATE TRIGGER ron_research_runs_updated_at
  BEFORE UPDATE ON public.ron_research_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ron_research_candidate_results_updated_at ON public.ron_research_candidate_results;
CREATE TRIGGER ron_research_candidate_results_updated_at
  BEFORE UPDATE ON public.ron_research_candidate_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();