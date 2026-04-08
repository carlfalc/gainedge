
-- Add new columns to signals table
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS pnl_pips numeric;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS resolved_at timestamp with time zone;

-- Create user_signal_preferences table
CREATE TABLE public.user_signal_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  instrument_filters jsonb NOT NULL DEFAULT '{}',
  min_confidence integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signal_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signal prefs" ON public.user_signal_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signal prefs" ON public.user_signal_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signal prefs" ON public.user_signal_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own signal prefs" ON public.user_signal_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_user_signal_prefs_user_id ON public.user_signal_preferences (user_id);
