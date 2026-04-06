
-- 1. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'scout',
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  broker TEXT NOT NULL DEFAULT 'eightcap',
  default_timeframe TEXT NOT NULL DEFAULT '15',
  default_candle_type TEXT NOT NULL DEFAULT 'heiken_ashi',
  ema_fast INTEGER NOT NULL DEFAULT 4,
  ema_slow INTEGER NOT NULL DEFAULT 17,
  email_alerts BOOLEAN NOT NULL DEFAULT true,
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  sms_alerts BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. USER_INSTRUMENTS TABLE
CREATE TABLE public.user_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  broker_symbol TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

ALTER TABLE public.user_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instruments" ON public.user_instruments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own instruments" ON public.user_instruments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own instruments" ON public.user_instruments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own instruments" ON public.user_instruments FOR DELETE USING (auth.uid() = user_id);

-- 3. SCAN_RESULTS TABLE
CREATE TABLE public.scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  candle_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  entry_price DECIMAL,
  take_profit DECIMAL,
  stop_loss DECIMAL,
  risk_reward TEXT,
  adx DECIMAL,
  rsi DECIMAL,
  macd_status TEXT,
  stoch_rsi DECIMAL,
  ema_fast_value DECIMAL,
  ema_slow_value DECIMAL,
  ema_crossover_status TEXT NOT NULL DEFAULT 'NONE',
  ema_crossover_direction TEXT,
  supertrend_status TEXT,
  verdict TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  session TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scans" ON public.scan_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scans" ON public.scan_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own scans" ON public.scan_results FOR DELETE USING (auth.uid() = user_id);

-- 4. SIGNALS TABLE
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scan_result_id UUID REFERENCES public.scan_results(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  entry_price DECIMAL NOT NULL,
  take_profit DECIMAL NOT NULL,
  stop_loss DECIMAL NOT NULL,
  risk_reward TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending',
  pnl DECIMAL,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signals" ON public.signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signals" ON public.signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signals" ON public.signals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own signals" ON public.signals FOR DELETE USING (auth.uid() = user_id);

-- 5. JOURNAL_ENTRIES TABLE
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  session_summary TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  mood TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

-- 6. BACKTEST_RESULTS TABLE
CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  candle_type TEXT NOT NULL,
  ema_fast INTEGER NOT NULL,
  ema_slow INTEGER NOT NULL,
  period_months INTEGER NOT NULL,
  total_trades INTEGER NOT NULL,
  win_rate DECIMAL NOT NULL,
  profit_factor DECIMAL NOT NULL,
  net_pnl DECIMAL NOT NULL,
  max_drawdown DECIMAL NOT NULL,
  avg_rr DECIMAL NOT NULL,
  sharpe_ratio DECIMAL,
  expectancy DECIMAL NOT NULL,
  equity_curve JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtests" ON public.backtest_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own backtests" ON public.backtest_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own backtests" ON public.backtest_results FOR DELETE USING (auth.uid() = user_id);

-- 7. INSIGHTS TABLE
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  symbol TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB,
  severity TEXT,
  estimated_impact DECIMAL,
  week_start DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insights" ON public.insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own insights" ON public.insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own insights" ON public.insights FOR DELETE USING (auth.uid() = user_id);

-- 8. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. AUTO-CREATE PROFILE + DEFAULT INSTRUMENTS ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Trader'));

  INSERT INTO public.user_instruments (user_id, symbol) VALUES
    (NEW.id, 'XAUUSD'),
    (NEW.id, 'US30'),
    (NEW.id, 'NAS100'),
    (NEW.id, 'NZDUSD'),
    (NEW.id, 'AUDUSD');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. INDEXES
CREATE INDEX idx_scan_results_user_symbol ON public.scan_results(user_id, symbol, scanned_at DESC);
CREATE INDEX idx_signals_user ON public.signals(user_id, created_at DESC);
CREATE INDEX idx_journal_user_date ON public.journal_entries(user_id, entry_date DESC);
CREATE INDEX idx_insights_user_type ON public.insights(user_id, insight_type);
