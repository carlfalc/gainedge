ALTER TABLE public.ron_research_runs
  ADD COLUMN IF NOT EXISTS contract_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS continuity_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS holdout_report jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ron_research_runs.contract_hashes IS
  'Phase 2D.1f: hashes of the venue-calendar, coverage-continuity, fold-definition and promotion-gate contracts that define this run. Empty for research_version <= 2.';
COMMENT ON COLUMN public.ron_research_runs.continuity_report IS
  'Phase 2D.1f: expected-open venue-minute continuity report (defects, epochs, split boundaries). Empty for research_version <= 2.';
COMMENT ON COLUMN public.ron_research_runs.holdout_report IS
  'Phase 2D.1f: untouched final-holdout definition and its post-selection metrics. Empty for research_version <= 2.';