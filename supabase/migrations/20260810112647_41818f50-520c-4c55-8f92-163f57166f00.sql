CREATE TABLE public.ron_market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  bar_time timestamptz NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric,
  spread numeric,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_version integer NOT NULL DEFAULT 1,
  data_health text NOT NULL DEFAULT 'healthy',
  source text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ron_market_snapshots_data_health_chk
    CHECK (data_health IN ('healthy','stale','insufficient','error')),
  CONSTRAINT ron_market_snapshots_unique_bar
    UNIQUE (symbol, timeframe, bar_time, feature_version)
);

CREATE INDEX ron_market_snapshots_recent_idx
  ON public.ron_market_snapshots (symbol, timeframe, bar_time DESC);

GRANT SELECT ON public.ron_market_snapshots TO authenticated;
GRANT ALL ON public.ron_market_snapshots TO service_role;

ALTER TABLE public.ron_market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RON snapshots"
  ON public.ron_market_snapshots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ron_market_snapshots REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ron_market_snapshots;

CREATE OR REPLACE FUNCTION public.ron_snapshot_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'falconer_service_role_key'
  limit 1;

  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'email_queue_service_role_key'
    limit 1;
  end if;

  if v_token is null or length(v_token) = 0 then
    raise warning 'ron_snapshot_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{"mode":"live"}'::jsonb
  );
end;
$function$;

SELECT cron.schedule('ron-snapshot-1m', '* * * * *', $cron$ SELECT public.ron_snapshot_cron_tick(); $cron$);