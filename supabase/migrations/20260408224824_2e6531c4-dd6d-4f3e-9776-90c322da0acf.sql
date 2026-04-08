ALTER TABLE public.user_signal_preferences
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NZD',
  ADD COLUMN IF NOT EXISTS lot_size numeric NOT NULL DEFAULT 0.01;