ALTER TABLE public.user_signal_preferences
ADD COLUMN signal_direction text NOT NULL DEFAULT 'both';