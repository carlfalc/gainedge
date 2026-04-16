
-- Broker-instrument mapping table
CREATE TABLE public.broker_symbol_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broker text NOT NULL,
  canonical_symbol text NOT NULL,
  broker_symbol text NOT NULL,
  contract_size numeric NOT NULL DEFAULT 100000,
  pip_value numeric NOT NULL DEFAULT 0.0001,
  min_lot_size numeric NOT NULL DEFAULT 0.01,
  is_available boolean NOT NULL DEFAULT true,
  last_verified timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker, canonical_symbol)
);

-- RLS
ALTER TABLE public.broker_symbol_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read broker symbol mappings"
  ON public.broker_symbol_mappings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage broker symbol mappings"
  ON public.broker_symbol_mappings FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_broker_symbol_mappings_broker ON public.broker_symbol_mappings (broker);
CREATE INDEX idx_broker_symbol_mappings_canonical ON public.broker_symbol_mappings (canonical_symbol);

-- Timestamp trigger
CREATE TRIGGER update_broker_symbol_mappings_updated_at
  BEFORE UPDATE ON public.broker_symbol_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
