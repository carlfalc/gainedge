-- GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 / OUTCOME LEARNING V1
-- 1. Opportunity Context V2 provenance columns (additive, nullable: V1 rows stay valid)
ALTER TABLE public.ron_opportunity_context
  ADD COLUMN IF NOT EXISTS venue_state text,
  ADD COLUMN IF NOT EXISTS decision_bound boolean,
  ADD COLUMN IF NOT EXISTS orchestration_lineage_available boolean,
  ADD COLUMN IF NOT EXISTS calibration_artifact_available boolean;

-- 2. Durable, append-only material RON events (server-side, user-independent)
CREATE TABLE IF NOT EXISTS public.ron_material_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'ron_opportunity_context',
  instrument text NOT NULL,
  timeframe text NOT NULL,
  evaluation_anchor timestamptz NOT NULL,
  analytical_bar_open timestamptz NOT NULL,
  spec_version integer NOT NULL,
  runtime_version integer NOT NULL,
  context_id uuid REFERENCES public.ron_opportunity_context(id) ON DELETE SET NULL,
  decision_id text,
  trace_id text,
  material_change_type text NOT NULL,
  lifecycle text NOT NULL,
  direction_context text NOT NULL,
  direction_authority text NOT NULL,
  setup_family text NOT NULL,
  data_state text NOT NULL,
  data_blocked boolean NOT NULL DEFAULT false,
  venue_state text,
  popup_capable boolean NOT NULL DEFAULT false,
  outcome_state text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ron_material_events_anchor_idx
  ON public.ron_material_events (evaluation_anchor DESC);
CREATE INDEX IF NOT EXISTS ron_material_events_instrument_idx
  ON public.ron_material_events (instrument, timeframe, evaluation_anchor DESC);

GRANT SELECT ON public.ron_material_events TO authenticated;
GRANT ALL ON public.ron_material_events TO service_role;
ALTER TABLE public.ron_material_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read RON material events"
  ON public.ron_material_events FOR SELECT TO authenticated USING (true);

-- 3. Per-user read state (durable unread history for offline users)
CREATE TABLE IF NOT EXISTS public.ron_event_reads (
  user_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.ron_material_events(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ron_event_reads TO authenticated;
GRANT ALL ON public.ron_event_reads TO service_role;
ALTER TABLE public.ron_event_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own RON event read state"
  ON public.ron_event_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Append-only outcome evaluation at future horizons (never mutates the original event)
CREATE TABLE IF NOT EXISTS public.ron_event_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ron_material_events(id) ON DELETE CASCADE,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  evaluation_anchor timestamptz NOT NULL,
  horizon_bars integer NOT NULL,
  outcome_version integer NOT NULL DEFAULT 1,
  reference_price numeric NOT NULL,
  last_price numeric NOT NULL,
  price_change numeric NOT NULL,
  price_change_pct numeric NOT NULL,
  mfe numeric NOT NULL,
  mae numeric NOT NULL,
  mfe_pct numeric NOT NULL,
  mae_pct numeric NOT NULL,
  bars_observed integer NOT NULL,
  direction_context text NOT NULL,
  follow_through text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  future_data_cutoff timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, horizon_bars, outcome_version)
);
CREATE INDEX IF NOT EXISTS ron_event_outcomes_event_idx
  ON public.ron_event_outcomes (event_id, horizon_bars);
GRANT SELECT ON public.ron_event_outcomes TO authenticated;
GRANT ALL ON public.ron_event_outcomes TO service_role;
ALTER TABLE public.ron_event_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read RON event outcomes"
  ON public.ron_event_outcomes FOR SELECT TO authenticated USING (true);

-- 5. Post-event lessons ledger (later analysis, strictly separated from live knowledge)
CREATE TABLE IF NOT EXISTS public.ron_event_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ron_material_events(id) ON DELETE CASCADE,
  lesson_version integer NOT NULL DEFAULT 1,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  evaluation_anchor timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  future_data_cutoff timestamptz NOT NULL,
  horizons_covered integer[] NOT NULL DEFAULT '{}',
  lifecycle_path text[] NOT NULL DEFAULT '{}',
  confirmed_at timestamptz,
  weakened_at timestamptz,
  invalidated_at timestamptz,
  reason_tags text[] NOT NULL DEFAULT '{}',
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, lesson_version)
);
GRANT SELECT ON public.ron_event_lessons TO authenticated;
GRANT ALL ON public.ron_event_lessons TO service_role;
ALTER TABLE public.ron_event_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read RON event lessons"
  ON public.ron_event_lessons FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ron_material_events;