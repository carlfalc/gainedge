CREATE TABLE public.broker_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_name TEXT NOT NULL,
  login_id TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  server TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'demo',
  metaapi_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own broker connections"
ON public.broker_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own broker connections"
ON public.broker_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own broker connections"
ON public.broker_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own broker connections"
ON public.broker_connections FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_broker_connections_updated_at
BEFORE UPDATE ON public.broker_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();