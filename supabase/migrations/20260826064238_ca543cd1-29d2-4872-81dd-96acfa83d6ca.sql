CREATE TABLE public.ron_data_health_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  status text NOT NULL,
  reason text NOT NULL,
  venue_state text NOT NULL,
  venue_class text,
  venue_reason text NOT NULL,
  latest_bar_time timestamptz,
  age_minutes integer,
  critical_flag_count integer NOT NULL DEFAULT 0,
  evaluation_allowed boolean NOT NULL DEFAULT false,
  next_expected_open timestamptz,
  registry_version integer NOT NULL DEFAULT 1,
  health_version integer NOT NULL DEFAULT 1,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ron_data_health_events_lookup
  ON public.ron_data_health_events (instrument, timeframe, observed_at DESC);

GRANT SELECT ON public.ron_data_health_events TO authenticated;
GRANT ALL ON public.ron_data_health_events TO service_role;

ALTER TABLE public.ron_data_health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read RON data health events"
  ON public.ron_data_health_events FOR SELECT TO authenticated USING (true);