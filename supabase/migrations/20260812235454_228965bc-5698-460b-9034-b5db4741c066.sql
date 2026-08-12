-- Phase 2D.1e correction: the durable rebuild range_end was frozen to the recovery COUNT
-- canary cutoff (07:54Z) instead of the checkpoint source clock. Extend the SAME jobs
-- (no new lineage versions) to the derived source_bar_cutoff 2026-08-12T20:45:00Z.
-- Cursors, processed and batches are preserved so each stage resumes strictly after its
-- existing cursor; accepted qv3/fv4/lv5 jobs are untouched.
UPDATE public.ron_rebuild_jobs
SET range_end = '2026-08-12T20:45:00Z',
    status = 'pending',
    completed_at = NULL,
    last_error = NULL
WHERE stage IN ('quality_v4', 'feature_v5', 'label_v6')
  AND range_end = '2026-08-12T07:54:00Z';