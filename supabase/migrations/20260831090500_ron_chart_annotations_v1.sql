-- GAINEDGE_RON_CHART_ANNOTATIONS_RUNTIME_V1
-- Exact chart geometry is stored beside each immutable snapshot version. It is separate
-- from features/model signals, so no accepted feature-version meaning is rewritten.
ALTER TABLE public.ron_market_snapshots
  ADD COLUMN IF NOT EXISTS chart_annotations_v1 jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ron_market_snapshots.chart_annotations_v1 IS
  'Completed-bar-only RON Chart Annotation V1 objects; exact price/time geometry, no screen coordinates or numeric prediction.';

CREATE INDEX IF NOT EXISTS ron_market_snapshots_chart_annotations_v1_idx
  ON public.ron_market_snapshots USING gin (chart_annotations_v1);
