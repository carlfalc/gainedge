CREATE TABLE public.ron_data_quality_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  bar_time timestamptz NOT NULL,
  quality_version integer NOT NULL DEFAULT 1,
  rule_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash text NOT NULL,
  detector text NOT NULL DEFAULT 'ron-quality',
  provenance text NOT NULL DEFAULT 'candle_history',
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_data_quality_flags_identity UNIQUE (symbol, timeframe, bar_time, quality_version, rule_code)
);

GRANT SELECT ON public.ron_data_quality_flags TO authenticated;
GRANT ALL ON public.ron_data_quality_flags TO service_role;

ALTER TABLE public.ron_data_quality_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RON data quality flags"
  ON public.ron_data_quality_flags FOR SELECT TO authenticated USING (true);

CREATE INDEX ron_data_quality_flags_lookup
  ON public.ron_data_quality_flags (symbol, timeframe, quality_version, severity, bar_time);

CREATE TRIGGER ron_data_quality_flags_updated_at
  BEFORE UPDATE ON public.ron_data_quality_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();