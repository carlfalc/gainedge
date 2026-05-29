
-- ========== WIPE OLD STRATEGY TABLES ==========
DROP TABLE IF EXISTS public.ron_auto_trades CASCADE;
DROP TABLE IF EXISTS public.ron_backtest_runs CASCADE;
DROP TABLE IF EXISTS public.ron_calibration CASCADE;
DROP TABLE IF EXISTS public.ron_platform_intelligence CASCADE;
DROP TABLE IF EXISTS public.ron_risk_metrics CASCADE;
DROP TABLE IF EXISTS public.ron_settings CASCADE;
DROP TABLE IF EXISTS public.signal_outcomes CASCADE;
DROP TABLE IF EXISTS public.signals CASCADE;
DROP TABLE IF EXISTS public.scan_results CASCADE;
DROP TABLE IF EXISTS public.pattern_weights CASCADE;
DROP TABLE IF EXISTS public.falconer_knowledge CASCADE;
DROP TABLE IF EXISTS public.liquidity_zones CASCADE;
DROP TABLE IF EXISTS public.backtest_results CASCADE;
DROP TABLE IF EXISTS public.auto_trade_executions CASCADE;

-- Drop old refresh function tied to wiped tables
DROP FUNCTION IF EXISTS public.refresh_ron_intelligence() CASCADE;

-- ========== NEW: falconer_settings ==========
CREATE TABLE public.falconer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  execution_path text NOT NULL DEFAULT 'signal_only' CHECK (execution_path IN ('metaapi','pineconnector','signal_only')),
  symbols text[] NOT NULL DEFAULT ARRAY['XAUUSD']::text[],
  timeframe text NOT NULL DEFAULT '15m',
  risk_usd numeric NOT NULL DEFAULT 200,
  rr_tp1 numeric NOT NULL DEFAULT 1.5,
  rr_tp2 numeric NOT NULL DEFAULT 3.0,
  rr_tp3 numeric NOT NULL DEFAULT 5.0,
  be_r numeric NOT NULL DEFAULT 1.0,
  pct1 numeric NOT NULL DEFAULT 33,
  pct2 numeric NOT NULL DEFAULT 33,
  min_atr_pct numeric NOT NULL DEFAULT 0.05,
  max_atr_pct numeric NOT NULL DEFAULT 0.80,
  pullback_tol numeric NOT NULL DEFAULT 0.0015,
  pineconnector_license text,
  pineconnector_symbol_override jsonb NOT NULL DEFAULT '{}'::jsonb,
  pineconnector_risk numeric NOT NULL DEFAULT 0.5,
  pineconnector_webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.falconer_settings TO authenticated;
GRANT ALL ON public.falconer_settings TO service_role;

ALTER TABLE public.falconer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own falconer settings"
  ON public.falconer_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages falconer settings"
  ON public.falconer_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER falconer_settings_updated_at
  BEFORE UPDATE ON public.falconer_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== NEW: falconer_trades ==========
CREATE TABLE public.falconer_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL DEFAULT '15m',
  mode text NOT NULL DEFAULT 'live' CHECK (mode IN ('live','backtest','dry_run')),
  execution_path text NOT NULL DEFAULT 'signal_only' CHECK (execution_path IN ('metaapi','pineconnector','signal_only')),
  direction text NOT NULL DEFAULT 'long',
  trigger_type text NOT NULL CHECK (trigger_type IN ('tpLong','sqzUp','swPDL','swAL')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','tp1_hit','tp2_hit','tp3_hit','be_active','closed_ha_flip','closed_sl','closed_tp3')),
  entry_price numeric NOT NULL,
  sl_price numeric NOT NULL,
  tp1_price numeric NOT NULL,
  tp2_price numeric NOT NULL,
  tp3_price numeric NOT NULL,
  be_level numeric NOT NULL,
  qty numeric NOT NULL,
  qty1 numeric NOT NULL,
  qty2 numeric NOT NULL,
  qty3 numeric NOT NULL,
  be_done boolean NOT NULL DEFAULT false,
  pnl_usd numeric DEFAULT 0,
  metaapi_position_ids jsonb,
  raw_alert_payload jsonb,
  backtest_run_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_falconer_trades_user_status ON public.falconer_trades(user_id, status);
CREATE INDEX idx_falconer_trades_mode ON public.falconer_trades(mode);
CREATE INDEX idx_falconer_trades_backtest_run ON public.falconer_trades(backtest_run_id) WHERE backtest_run_id IS NOT NULL;
CREATE INDEX idx_falconer_trades_opened_at ON public.falconer_trades(opened_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.falconer_trades TO authenticated;
GRANT ALL ON public.falconer_trades TO service_role;

ALTER TABLE public.falconer_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own falconer trades"
  ON public.falconer_trades FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own falconer trades"
  ON public.falconer_trades FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own falconer trades"
  ON public.falconer_trades FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own falconer trades"
  ON public.falconer_trades FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages falconer trades"
  ON public.falconer_trades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER falconer_trades_updated_at
  BEFORE UPDATE ON public.falconer_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.falconer_trades REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.falconer_trades;

-- ========== NEW: falconer_backtest_runs ==========
CREATE TABLE public.falconer_backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL DEFAULT '15m',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_trades integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  net_pnl_usd numeric DEFAULT 0,
  net_pnl_pct numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  profit_factor numeric DEFAULT 0,
  max_drawdown_pct numeric DEFAULT 0,
  equity_curve jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_falconer_backtest_user ON public.falconer_backtest_runs(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.falconer_backtest_runs TO authenticated;
GRANT ALL ON public.falconer_backtest_runs TO service_role;

ALTER TABLE public.falconer_backtest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own backtest runs"
  ON public.falconer_backtest_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages backtest runs"
  ON public.falconer_backtest_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
