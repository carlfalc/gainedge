
-- Create live_market_data table for background-computed broker data
CREATE TABLE public.live_market_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  bid numeric,
  ask numeric,
  last_price numeric,
  rsi numeric,
  adx numeric,
  macd_status text,
  stoch_rsi numeric,
  volume_today numeric DEFAULT 0,
  market_open boolean DEFAULT true,
  sparkline_data jsonb DEFAULT '[]'::jsonb,
  price_direction text DEFAULT 'flat',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

-- Enable RLS
ALTER TABLE public.live_market_data ENABLE ROW LEVEL SECURITY;

-- Users can read their own live data
CREATE POLICY "Users can view own live market data"
  ON public.live_market_data FOR SELECT
  USING (auth.uid() = user_id);

-- Service role handles inserts/updates (no user-facing write policy needed)
-- Edge functions use service_role key which bypasses RLS

-- Index for fast lookups
CREATE INDEX idx_live_market_data_user ON public.live_market_data (user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_market_data;
