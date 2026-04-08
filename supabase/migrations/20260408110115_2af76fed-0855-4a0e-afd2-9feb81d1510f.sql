
-- Add timeframe column to user_instruments
ALTER TABLE public.user_instruments
ADD COLUMN timeframe TEXT NOT NULL DEFAULT '15m';

-- Add last_candle_time to live_market_data for candle close detection
ALTER TABLE public.live_market_data
ADD COLUMN last_candle_time TIMESTAMPTZ;
