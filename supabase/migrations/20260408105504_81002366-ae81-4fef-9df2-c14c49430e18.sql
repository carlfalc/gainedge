
CREATE TABLE public.session_volume_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session TEXT NOT NULL,
  symbol TEXT NOT NULL,
  peak_hour_start TIMESTAMPTZ,
  total_volume NUMERIC DEFAULT 0,
  buyer_volume NUMERIC,
  seller_volume NUMERIC,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session, symbol, date)
);

ALTER TABLE public.session_volume_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view session summaries"
ON public.session_volume_summary
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_session_volume_date ON public.session_volume_summary (date, session);
