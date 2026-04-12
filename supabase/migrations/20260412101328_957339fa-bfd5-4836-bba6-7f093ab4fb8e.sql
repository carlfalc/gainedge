ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS trading_preferences jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favourite_sessions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_nickname boolean DEFAULT false;