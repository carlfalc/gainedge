ALTER TABLE public.live_market_data
  ADD COLUMN IF NOT EXISTS last_spike_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS spike_magnitude numeric DEFAULT NULL;