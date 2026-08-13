ALTER TABLE public.ron_rebuild_jobs ADD COLUMN IF NOT EXISTS source_as_of timestamptz;

COMMENT ON COLUMN public.ron_rebuild_jobs.source_as_of IS
  'Durable per-job canonical source clock. Label stages at label_version >= 6 MUST have this set; the orchestrator fails closed when it is NULL. Historical jobs (label_v5 and earlier) remain NULL and keep legacy replay semantics.';