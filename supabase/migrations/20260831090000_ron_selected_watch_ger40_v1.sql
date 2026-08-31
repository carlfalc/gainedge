-- GAINEDGE_RON_SELECTED_WATCH_RUNTIME_V1
-- Forward replacement of the existing multi-snapshot tick. The cron schedule already calls
-- this function; replacing its body adds GER40 without mutating the applied migration.
CREATE OR REPLACE FUNCTION public.ron_multi_snapshot_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
  v_sym text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name = 'falconer_service_role_key' limit 1;
  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token from vault.decrypted_secrets
    where name = 'email_queue_service_role_key' limit 1;
  end if;
  if v_token is null or length(v_token) = 0 then
    raise warning 'ron_multi_snapshot_cron_tick skipped: no service-role key in Vault';
    return;
  end if;

  -- XAUUSD retains its dedicated frozen snapshot tick. Every other selected RON market
  -- receives a live snapshot request; each worker independently proves venue/bar eligibility.
  foreach v_sym in array array['NAS100','NZDUSD','USDCAD','HK50','GER40'] loop
    perform net.http_post(
      url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body := jsonb_build_object(
        'mode', 'live', 'symbol', v_sym, 'timeframe', '15m'
      ),
      timeout_milliseconds := 60000
    );
  end loop;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.ron_multi_snapshot_cron_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ron_multi_snapshot_cron_tick() TO service_role;
