CREATE TABLE public.auto_trade_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  volume NUMERIC NOT NULL,
  entry_price NUMERIC,
  sl NUMERIC,
  tp NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  metaapi_position_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_trade_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own auto trade executions"
  ON public.auto_trade_executions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert auto trade executions"
  ON public.auto_trade_executions FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update auto trade executions"
  ON public.auto_trade_executions FOR UPDATE
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_auto_trade_exec_user_created
  ON public.auto_trade_executions (user_id, created_at DESC);

CREATE INDEX idx_auto_trade_exec_signal
  ON public.auto_trade_executions (signal_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_trade_executions;
ALTER TABLE public.auto_trade_executions REPLICA IDENTITY FULL;