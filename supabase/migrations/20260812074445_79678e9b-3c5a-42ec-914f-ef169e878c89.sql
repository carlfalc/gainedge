DROP POLICY IF EXISTS "Authenticated can read research runs" ON public.ron_research_runs;
DROP POLICY IF EXISTS "Authenticated can read research results" ON public.ron_research_candidate_results;

REVOKE ALL ON public.ron_research_runs FROM authenticated;
REVOKE ALL ON public.ron_research_runs FROM anon;
REVOKE ALL ON public.ron_research_candidate_results FROM authenticated;
REVOKE ALL ON public.ron_research_candidate_results FROM anon;

GRANT ALL ON public.ron_research_runs TO service_role;
GRANT ALL ON public.ron_research_candidate_results TO service_role;