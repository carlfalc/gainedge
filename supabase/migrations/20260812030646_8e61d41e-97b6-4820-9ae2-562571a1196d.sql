CREATE TABLE IF NOT EXISTS public.ron_rebuild_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  stage_order integer NOT NULL,
  symbol text NOT NULL DEFAULT 'XAUUSD',
  timeframe text NOT NULL DEFAULT '15m',
  status text NOT NULL DEFAULT 'pending',
  cursor timestamptz,
  range_start timestamptz,
  range_end timestamptz,
  processed integer NOT NULL DEFAULT 0,
  batches integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ron_rebuild_jobs_status_chk CHECK (status IN ('pending','running','completed','failed')),
  CONSTRAINT ron_rebuild_jobs_stage_uniq UNIQUE (stage, symbol, timeframe)
);

GRANT ALL ON public.ron_rebuild_jobs TO service_role;

ALTER TABLE public.ron_rebuild_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ron_rebuild_jobs service only"
  ON public.ron_rebuild_jobs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER ron_rebuild_jobs_updated_at
  BEFORE UPDATE ON public.ron_rebuild_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS ron_rebuild_jobs_open_idx
  ON public.ron_rebuild_jobs (stage_order) WHERE status IN ('pending','running');

-- Temporary orchestrator tick: invoke the durable rebuild worker.
CREATE OR REPLACE FUNCTION public.ron_rebuild_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'falconer_service_role_key' limit 1;
  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'email_queue_service_role_key' limit 1;
  end if;
  if v_token is null or length(v_token) = 0 then
    raise warning 'ron_rebuild_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-rebuild',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{"max_batches":3}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$function$;

-- Called by the orchestrator when every stage is terminal: retire the temporary cron.
CREATE OR REPLACE FUNCTION public.ron_rebuild_finish()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if exists (select 1 from cron.job where jobname = 'ron-rebuild-tick') then
    perform cron.unschedule('ron-rebuild-tick');
    return true;
  end if;
  return false;
exception when others then
  raise warning 'ron_rebuild_finish failed: %', sqlerrm;
  return false;
end;
$function$;

-- Singular live path: the existing per-minute snapshot tick also runs ONE bounded,
-- recent-overlap quality sweep. Full history is never scanned live.
CREATE OR REPLACE FUNCTION public.ron_snapshot_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'falconer_service_role_key' limit 1;
  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'email_queue_service_role_key' limit 1;
  end if;
  if v_token is null or length(v_token) = 0 then
    raise warning 'ron_snapshot_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  -- 1) bounded recent-overlap quality maintenance (quality_version = 3)
  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-quality',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{"mode":"live","lookback_hours":6,"limit":100,"quality_version":3}'::jsonb,
    timeout_milliseconds := 60000
  );

  -- 2) live snapshot of the latest closed bar
  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-snapshot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{"mode":"live"}'::jsonb
  );
end;
$function$;