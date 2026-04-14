
-- ============================================================
-- PHASE 6: Liquidity Zones
-- ============================================================
CREATE TABLE public.liquidity_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL DEFAULT '15m',
  zone_type text NOT NULL, -- order_block_bull, order_block_bear, liquidity_pool_high, liquidity_pool_low, fvg_bull, fvg_bear
  price_high numeric NOT NULL,
  price_low numeric NOT NULL,
  created_at_candle timestamptz NOT NULL,
  tested_count integer NOT NULL DEFAULT 0,
  respected boolean DEFAULT NULL,
  status text NOT NULL DEFAULT 'active', -- active, broken, filled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liquidity_zones_symbol_status ON public.liquidity_zones (symbol, status);
CREATE INDEX idx_liquidity_zones_symbol_type ON public.liquidity_zones (symbol, zone_type, status);

ALTER TABLE public.liquidity_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read liquidity zones"
  ON public.liquidity_zones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage liquidity zones"
  ON public.liquidity_zones FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PHASE 7: Volume Profile Daily
-- ============================================================
CREATE TABLE public.volume_profile_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  profile_date date NOT NULL DEFAULT CURRENT_DATE,
  poc_price numeric, -- Point of Control
  value_area_high numeric,
  value_area_low numeric,
  total_volume numeric DEFAULT 0,
  price_levels jsonb DEFAULT '[]'::jsonb, -- array of {price, volume}
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, profile_date)
);

CREATE INDEX idx_volume_profile_symbol_date ON public.volume_profile_daily (symbol, profile_date DESC);

ALTER TABLE public.volume_profile_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read volume profiles"
  ON public.volume_profile_daily FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage volume profiles"
  ON public.volume_profile_daily FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PHASE 8: News Impact Results
-- ============================================================
CREATE TABLE public.news_impact_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL,
  symbol text NOT NULL,
  price_at_news numeric NOT NULL,
  price_after_15m numeric,
  price_after_30m numeric,
  price_after_1h numeric,
  direction text, -- up, down, flat
  magnitude_pips numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  measured_at timestamptz
);

CREATE INDEX idx_news_impact_symbol ON public.news_impact_results (symbol, created_at DESC);
CREATE INDEX idx_news_impact_news_id ON public.news_impact_results (news_id);

ALTER TABLE public.news_impact_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read news impact"
  ON public.news_impact_results FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage news impact"
  ON public.news_impact_results FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PHASE 9: Risk Metrics
-- ============================================================
CREATE TABLE public.ron_risk_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text,
  consecutive_losses integer NOT NULL DEFAULT 0,
  max_drawdown_pips numeric DEFAULT 0,
  current_drawdown_pips numeric DEFAULT 0,
  equity_peak numeric DEFAULT 0,
  equity_current numeric DEFAULT 0,
  recovery_time_hours numeric DEFAULT 0,
  risk_mode text NOT NULL DEFAULT 'normal', -- normal, conservative, aggressive
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX idx_risk_metrics_user ON public.ron_risk_metrics (user_id);

ALTER TABLE public.ron_risk_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own risk metrics"
  ON public.ron_risk_metrics FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage risk metrics"
  ON public.ron_risk_metrics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PHASE 7 (cont): Add volume columns to candle_history
-- ============================================================
ALTER TABLE public.candle_history
  ADD COLUMN IF NOT EXISTS buy_volume numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_volume numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cumulative_delta numeric DEFAULT 0;

-- ============================================================
-- PHASE 10: Add MTF alignment to signal_outcomes
-- ============================================================
ALTER TABLE public.signal_outcomes
  ADD COLUMN IF NOT EXISTS mtf_alignment text DEFAULT NULL;

-- ============================================================
-- PHASE 10: Add session_bias to live_market_data
-- ============================================================
ALTER TABLE public.live_market_data
  ADD COLUMN IF NOT EXISTS session_bias text DEFAULT NULL;
