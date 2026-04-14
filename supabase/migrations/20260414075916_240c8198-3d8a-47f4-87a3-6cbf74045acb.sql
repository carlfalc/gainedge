-- Set default signal_engine to v1 for the column default
ALTER TABLE public.user_signal_preferences ALTER COLUMN signal_engine SET DEFAULT 'v1';

-- Update all existing users who are on v1v2 or v2 to v1
UPDATE public.user_signal_preferences SET signal_engine = 'v1' WHERE signal_engine IN ('v1v2', 'v2');