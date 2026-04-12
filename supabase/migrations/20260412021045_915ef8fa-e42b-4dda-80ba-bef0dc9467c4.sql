ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS ai_reason_short text,
  ADD COLUMN IF NOT EXISTS sentiment_direction text DEFAULT 'neutral';