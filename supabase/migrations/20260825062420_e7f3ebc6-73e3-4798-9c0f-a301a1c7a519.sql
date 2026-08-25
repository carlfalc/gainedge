CREATE TABLE public.ron_opportunity_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id text NOT NULL,
  spec_version integer NOT NULL,
  spec_hash text NOT NULL,
  runtime_version integer NOT NULL,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  evaluation_anchor timestamptz NOT NULL,
  analytical_bar_open timestamptz NOT NULL,
  trace_id text NOT NULL,
  run_id text NOT NULL,
  decision_id text,
  direction_context text NOT NULL,
  direction_authority text NOT NULL,
  setup_family text NOT NULL,
  lifecycle text NOT NULL,
  material_change_type text NOT NULL,
  data_state text NOT NULL,
  data_blocked boolean NOT NULL DEFAULT false,
  pattern_context_state text NOT NULL,
  cross_asset_context_state text NOT NULL,
  macro_context_state text NOT NULL,
  ha_states jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_admissibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_tokens jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution_allowed boolean NOT NULL DEFAULT false,
  execution_path text NOT NULL DEFAULT 'signal_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_opportunity_context_execution_never_allowed CHECK (execution_allowed = false),
  CONSTRAINT ron_opportunity_context_signal_only CHECK (execution_path = 'signal_only'),
  CONSTRAINT ron_opportunity_context_unique_anchor
    UNIQUE (instrument, timeframe, evaluation_anchor, spec_version, runtime_version)
);

COMMENT ON TABLE public.ron_opportunity_context IS
  'Append-only categorical RON opportunity-context records (GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1). No probability, no execution intent, no user-identifiable material.';

CREATE INDEX ron_opportunity_context_lookup
  ON public.ron_opportunity_context (instrument, timeframe, evaluation_anchor DESC);

GRANT SELECT ON public.ron_opportunity_context TO authenticated;
GRANT ALL ON public.ron_opportunity_context TO service_role;

ALTER TABLE public.ron_opportunity_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RON opportunity context"
  ON public.ron_opportunity_context
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.ron_opportunity_context REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ron_opportunity_context;