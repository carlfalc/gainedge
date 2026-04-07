
-- Create platform_config table
CREATE TABLE public.platform_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- Allow edge functions (service role) to read — no user-facing policies needed
-- Service role bypasses RLS, so no policies required for edge functions

-- Seed with a generated service key
INSERT INTO public.platform_config (service_key)
VALUES (encode(gen_random_bytes(32), 'hex'));
