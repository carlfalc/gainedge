-- ============ ron_settings ============
CREATE TABLE IF NOT EXISTS public.ron_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ron_enabled BOOLEAN DEFAULT false NOT NULL,
  sl_mode TEXT DEFAULT 'fixed' CHECK (sl_mode IN ('fixed', 'atr')),
  sl_pips INTEGER DEFAULT 30,
  tp_pips INTEGER DEFAULT 50,
  atr_sl_mult NUMERIC DEFAULT 1.5,
  atr_tp_mult NUMERIC DEFAULT 2.5,
  max_open_trades INTEGER DEFAULT 3,
  risk_per_trade_pct NUMERIC DEFAULT 1.0,
  symbols TEXT[] DEFAULT ARRAY['XAUUSD', 'EURUSD', 'GBPUSD'],
  min_ron_probability NUMERIC DEFAULT 0.65,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.ron_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own RON settings" ON public.ron_settings;
CREATE POLICY "Users manage their own RON settings"
  ON public.ron_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages RON settings" ON public.ron_settings;
CREATE POLICY "Service role manages RON settings"
  ON public.ron_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============ ron_auto_trades ============
CREATE TABLE IF NOT EXISTS public.ron_auto_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price NUMERIC,
  sl_price NUMERIC,
  tp_price NUMERIC,
  volume NUMERIC NOT NULL,
  ron_probability NUMERIC,
  metaapi_trade_id TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  result TEXT CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN')),
  pips NUMERIC,
  opened_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  closed_at TIMESTAMPTZ
);

ALTER TABLE public.ron_auto_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their own RON trades" ON public.ron_auto_trades;
CREATE POLICY "Users view their own RON trades"
  ON public.ron_auto_trades FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages RON trades" ON public.ron_auto_trades;
CREATE POLICY "Service role manages RON trades"
  ON public.ron_auto_trades FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ron_auto_trades_user_status ON public.ron_auto_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ron_auto_trades_symbol_status ON public.ron_auto_trades(symbol, status);
CREATE INDEX IF NOT EXISTS idx_ron_settings_enabled ON public.ron_settings(ron_enabled) WHERE ron_enabled = true;

CREATE OR REPLACE FUNCTION public.touch_ron_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ron_settings_updated_at ON public.ron_settings;
CREATE TRIGGER trg_ron_settings_updated_at
  BEFORE UPDATE ON public.ron_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ron_settings_updated_at();

-- ============ Extensions for cron ============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;