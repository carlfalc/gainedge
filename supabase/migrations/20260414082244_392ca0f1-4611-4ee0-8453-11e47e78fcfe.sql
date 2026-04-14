
-- ============================================================
-- 1. candle_history — deduplicated OHLCV storage
-- ============================================================
CREATE TABLE public.candle_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  "timestamp" timestamptz NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, timeframe, "timestamp")
);

CREATE INDEX idx_candle_history_lookup ON public.candle_history (symbol, timeframe, "timestamp" DESC);

ALTER TABLE public.candle_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read candle history"
  ON public.candle_history FOR SELECT TO authenticated
  USING (true);

-- Service role inserts (from edge function)
CREATE POLICY "Service role can insert candle history"
  ON public.candle_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. signal_outcomes — ML training data
-- ============================================================
CREATE TABLE public.signal_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  timeframe text NOT NULL DEFAULT '15m',
  entry_price numeric NOT NULL,
  tp_price numeric NOT NULL,
  sl_price numeric NOT NULL,
  result text NOT NULL, -- WIN, LOSS, EXPIRED
  pnl_pips numeric DEFAULT 0,
  pnl_currency numeric DEFAULT 0,
  confidence integer NOT NULL DEFAULT 5,
  ron_version text NOT NULL DEFAULT 'v1',
  adx_at_entry numeric,
  rsi_at_entry numeric,
  macd_status text,
  stoch_rsi numeric,
  pattern_active text, -- pattern name or null
  session text, -- asian, london, new_york, overlap
  day_of_week integer, -- 0-6
  hour_utc integer, -- 0-23
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signal_outcomes_symbol ON public.signal_outcomes (symbol, pattern_active);
CREATE INDEX idx_signal_outcomes_user ON public.signal_outcomes (user_id, symbol);
CREATE INDEX idx_signal_outcomes_result ON public.signal_outcomes (result, symbol);

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signal outcomes"
  ON public.signal_outcomes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert signal outcomes"
  ON public.signal_outcomes FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. ron_calibration — confidence calibration results
-- ============================================================
CREATE TABLE public.ron_calibration (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  confidence_level integer NOT NULL,
  total_signals integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  recommended_action text, -- 'raise_threshold', 'lower_threshold', 'maintain'
  notes text,
  calibrated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ron_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration"
  ON public.ron_calibration FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage calibration"
  ON public.ron_calibration FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. pattern_weights — learned pattern performance
-- ============================================================
CREATE TABLE public.pattern_weights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_name text NOT NULL,
  symbol text NOT NULL,
  session text, -- asian, london, new_york, or null for all
  total integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  avg_pips numeric DEFAULT 0,
  weight_adjustment numeric DEFAULT 0, -- positive = boost, negative = reduce
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_name, symbol, session)
);

ALTER TABLE public.pattern_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pattern weights"
  ON public.pattern_weights FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can manage pattern weights"
  ON public.pattern_weights FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 5. ron_platform_stats — aggregate view (anonymous)
-- ============================================================
CREATE OR REPLACE VIEW public.ron_platform_stats AS
SELECT
  pattern_active AS pattern_name,
  symbol,
  session,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE result = 'WIN') AS wins,
  COUNT(*) FILTER (WHERE result = 'LOSS') AS losses,
  CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / COUNT(*) * 100, 1) ELSE 0 END AS win_rate,
  ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'WIN'), 1) AS avg_win_pips,
  ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'LOSS'), 1) AS avg_loss_pips,
  ROUND(AVG(confidence), 1) AS avg_confidence
FROM public.signal_outcomes
WHERE pattern_active IS NOT NULL
GROUP BY pattern_active, symbol, session;

-- ============================================================
-- 6. Database function: cleanup old candle history (180 days)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_candles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.candle_history
  WHERE "timestamp" < now() - INTERVAL '180 days';
END;
$$;

-- ============================================================
-- 7. Database function: refresh RON intelligence hourly
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_ron_intelligence()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  rec RECORD;
BEGIN
  -- Best session per instrument (min 10 outcomes)
  FOR rec IN
    SELECT symbol, session,
      COUNT(*) AS total,
      ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS wr
    FROM signal_outcomes
    WHERE session IS NOT NULL AND created_at > now() - INTERVAL '30 days'
    GROUP BY symbol, session
    HAVING COUNT(*) >= 10
    ORDER BY symbol, wr DESC
  LOOP
    result := result || jsonb_build_object(
      'type', 'best_session',
      'symbol', rec.symbol,
      'session', rec.session,
      'win_rate', rec.wr,
      'total', rec.total
    );
  END LOOP;

  -- Win rate by confidence level
  FOR rec IN
    SELECT confidence,
      COUNT(*) AS total,
      ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS wr
    FROM signal_outcomes
    WHERE created_at > now() - INTERVAL '30 days'
    GROUP BY confidence
    HAVING COUNT(*) >= 5
    ORDER BY confidence
  LOOP
    result := result || jsonb_build_object(
      'type', 'confidence_performance',
      'confidence', rec.confidence,
      'win_rate', rec.wr,
      'total', rec.total
    );
  END LOOP;

  -- Pattern performance per instrument
  FOR rec IN
    SELECT pattern_active, symbol,
      COUNT(*) AS total,
      ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS wr,
      ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'WIN'), 1) AS avg_pips
    FROM signal_outcomes
    WHERE pattern_active IS NOT NULL AND created_at > now() - INTERVAL '30 days'
    GROUP BY pattern_active, symbol
    HAVING COUNT(*) >= 3
    ORDER BY wr DESC
  LOOP
    result := result || jsonb_build_object(
      'type', 'pattern_performance',
      'pattern', rec.pattern_active,
      'symbol', rec.symbol,
      'win_rate', rec.wr,
      'total', rec.total,
      'avg_pips', rec.avg_pips
    );
  END LOOP;

  -- Calibrate confidence and update ron_calibration
  DELETE FROM ron_calibration;
  INSERT INTO ron_calibration (confidence_level, total_signals, wins, win_rate, recommended_action, notes)
  SELECT
    confidence,
    COUNT(*),
    COUNT(*) FILTER (WHERE result = 'WIN'),
    ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1),
    CASE
      WHEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) > 70 THEN 'raise_threshold'
      WHEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) < 50 THEN 'lower_threshold'
      ELSE 'maintain'
    END,
    'Auto-calibrated at ' || now()::text
  FROM signal_outcomes
  WHERE created_at > now() - INTERVAL '14 days'
  GROUP BY confidence
  HAVING COUNT(*) >= 5;

  -- Update pattern_weights
  INSERT INTO pattern_weights (pattern_name, symbol, session, total, wins, win_rate, avg_pips, weight_adjustment, updated_at)
  SELECT
    pattern_active,
    symbol,
    session,
    COUNT(*),
    COUNT(*) FILTER (WHERE result = 'WIN'),
    ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1),
    ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'WIN'), 1),
    CASE
      WHEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) >= 70 THEN 1
      WHEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / NULLIF(COUNT(*), 0) * 100, 1) <= 40 THEN -1
      ELSE 0
    END,
    now()
  FROM signal_outcomes
  WHERE pattern_active IS NOT NULL AND created_at > now() - INTERVAL '30 days'
  GROUP BY pattern_active, symbol, session
  HAVING COUNT(*) >= 3
  ON CONFLICT (pattern_name, symbol, session)
  DO UPDATE SET
    total = EXCLUDED.total,
    wins = EXCLUDED.wins,
    win_rate = EXCLUDED.win_rate,
    avg_pips = EXCLUDED.avg_pips,
    weight_adjustment = EXCLUDED.weight_adjustment,
    updated_at = now();

  RETURN result;
END;
$$;
