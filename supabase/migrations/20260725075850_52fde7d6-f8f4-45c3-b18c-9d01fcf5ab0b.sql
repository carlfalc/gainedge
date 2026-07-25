ALTER TABLE public.falconer_settings
  ADD COLUMN IF NOT EXISTS allow_live_execution boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_daily_loss_usd numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_open_positions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS min_setup_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS last_evaluated_candles jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.falconer_settings
  DROP CONSTRAINT IF EXISTS falconer_settings_max_open_positions_check,
  ADD CONSTRAINT falconer_settings_max_open_positions_check CHECK (max_open_positions BETWEEN 1 AND 20),
  DROP CONSTRAINT IF EXISTS falconer_settings_min_setup_score_check,
  ADD CONSTRAINT falconer_settings_min_setup_score_check CHECK (min_setup_score BETWEEN 0 AND 100),
  DROP CONSTRAINT IF EXISTS falconer_settings_max_daily_loss_check,
  ADD CONSTRAINT falconer_settings_max_daily_loss_check CHECK (max_daily_loss_usd >= 0);

ALTER TABLE public.falconer_trades
  ADD COLUMN IF NOT EXISTS setup_score numeric,
  ADD COLUMN IF NOT EXISTS notify_user boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS actual_entry_price numeric,
  ADD COLUMN IF NOT EXISTS actual_exit_price numeric,
  ADD COLUMN IF NOT EXISTS commission_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS swap_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage_points numeric,
  ADD COLUMN IF NOT EXISTS broker_deal_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.falconer_trades
  DROP CONSTRAINT IF EXISTS falconer_trades_setup_score_check,
  ADD CONSTRAINT falconer_trades_setup_score_check CHECK (setup_score IS NULL OR setup_score BETWEEN 0 AND 100);

REVOKE INSERT, UPDATE, DELETE ON public.falconer_trades FROM authenticated;
GRANT UPDATE (notes, tags) ON public.falconer_trades TO authenticated;

CREATE TABLE IF NOT EXISTS public.falconer_engine_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  symbol text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_falconer_engine_events_user_created ON public.falconer_engine_events(user_id, created_at DESC);
GRANT SELECT ON public.falconer_engine_events TO authenticated;
GRANT ALL ON public.falconer_engine_events TO service_role;
ALTER TABLE public.falconer_engine_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own Falconer engine events" ON public.falconer_engine_events;
CREATE POLICY "Users view own Falconer engine events" ON public.falconer_engine_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages Falconer engine events" ON public.falconer_engine_events;
CREATE POLICY "Service role manages Falconer engine events" ON public.falconer_engine_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.gainedge_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gainedge_ai_conversations_user_created ON public.gainedge_ai_conversations(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.gainedge_ai_conversations TO authenticated;
GRANT ALL ON public.gainedge_ai_conversations TO service_role;
ALTER TABLE public.gainedge_ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own GainEdge AI conversations" ON public.gainedge_ai_conversations;
CREATE POLICY "Users manage own GainEdge AI conversations" ON public.gainedge_ai_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages GainEdge AI conversations" ON public.gainedge_ai_conversations;
CREATE POLICY "Service role manages GainEdge AI conversations" ON public.gainedge_ai_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);