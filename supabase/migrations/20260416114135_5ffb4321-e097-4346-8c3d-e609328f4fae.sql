CREATE TABLE public.user_auto_trade_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE public.user_auto_trade_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own auto trade settings"
  ON public.user_auto_trade_settings FOR ALL
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can read auto trade settings"
  ON public.user_auto_trade_settings FOR SELECT
  TO service_role USING (true);

CREATE TRIGGER update_user_auto_trade_settings_updated_at
  BEFORE UPDATE ON public.user_auto_trade_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();