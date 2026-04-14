
DROP VIEW IF EXISTS public.ron_platform_stats;

CREATE TABLE IF NOT EXISTS public.ron_platform_intelligence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_type text NOT NULL DEFAULT 'pattern_session',
  symbol text NOT NULL,
  timeframe text NOT NULL DEFAULT '15m',
  session text,
  pattern text,
  direction text,
  total_signals integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  expired integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  avg_pips_won numeric DEFAULT 0,
  avg_pips_lost numeric DEFAULT 0,
  profit_factor numeric DEFAULT 0,
  best_hour_utc integer,
  best_day_of_week integer,
  sample_size_users integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_intel
  ON public.ron_platform_intelligence (metric_type, symbol, COALESCE(session, ''), COALESCE(pattern, ''), COALESCE(direction, ''));

CREATE INDEX IF NOT EXISTS idx_platform_intel_symbol ON public.ron_platform_intelligence (symbol);

ALTER TABLE public.ron_platform_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read platform intelligence"
  ON public.ron_platform_intelligence FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage platform intelligence"
  ON public.ron_platform_intelligence FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE VIEW public.ron_platform_stats AS
SELECT
  pattern AS pattern_name,
  symbol,
  session,
  total_signals::bigint AS total,
  wins::bigint AS wins,
  losses::bigint AS losses,
  win_rate,
  avg_pips_won AS avg_win_pips,
  avg_pips_lost AS avg_loss_pips,
  NULL::numeric AS avg_confidence
FROM public.ron_platform_intelligence
WHERE metric_type = 'pattern_session' AND total_signals >= 5;
