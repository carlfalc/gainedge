ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS news_preferences jsonb DEFAULT '{}'::jsonb;