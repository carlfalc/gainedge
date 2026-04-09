
-- Chart drawings table
CREATE TABLE public.chart_drawings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '15m',
  drawing_type TEXT NOT NULL,
  drawing_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drawings" ON public.chart_drawings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own drawings" ON public.chart_drawings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own drawings" ON public.chart_drawings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own drawings" ON public.chart_drawings FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_chart_drawings_user_symbol ON public.chart_drawings(user_id, symbol, timeframe);

-- User indicator preferences table
CREATE TABLE public.user_indicator_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  indicator_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  params JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, indicator_id)
);

ALTER TABLE public.user_indicator_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own indicator prefs" ON public.user_indicator_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own indicator prefs" ON public.user_indicator_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own indicator prefs" ON public.user_indicator_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own indicator prefs" ON public.user_indicator_preferences FOR DELETE USING (auth.uid() = user_id);
