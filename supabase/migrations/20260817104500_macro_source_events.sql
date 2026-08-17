-- GAINEDGE_GDELT_RAW_HEADLINES_V1 — append-only RAW macro headline source seam.
-- Provider-agnostic source facts only: no direction, sentiment, impact, instrument
-- attribution or any derived claim. Service-role / internal use only; this table is
-- NOT exposed to the browser and RON does not read it in this slice.

CREATE TABLE public.macro_source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  url text NOT NULL,
  publisher text,
  headline text NOT NULL,
  published_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  source_country text,
  source_language text,
  query_bucket text NOT NULL,
  raw_topic_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT macro_source_events_provider_event_uniq UNIQUE (provider, provider_event_id)
);

CREATE INDEX macro_source_events_published_at_idx ON public.macro_source_events (published_at DESC);
CREATE INDEX macro_source_events_ingested_at_idx ON public.macro_source_events (ingested_at DESC);
CREATE INDEX macro_source_events_query_bucket_idx ON public.macro_source_events (query_bucket);

-- Internal only: no anon/authenticated grants, no browser SELECT policy in V1.
GRANT SELECT, INSERT ON public.macro_source_events TO service_role;

ALTER TABLE public.macro_source_events ENABLE ROW LEVEL SECURITY;
